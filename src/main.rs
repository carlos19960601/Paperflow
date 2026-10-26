mod error;
mod files;
mod images;
mod inputs;
mod pdf;
mod schema;
mod translator;

use std::{
    collections::{HashMap, HashSet},
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use tower_http::{
    cors::{Any, CorsLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::{error, info, warn};
use typst_embed::{FontSet, Project, RenderEnvironment, render_pdf};

use crate::{
    error::ApiError, files as files_api, images as images_api, schema::RenderRequest,
    translator::translate,
};

#[derive(Clone)]
struct AppState {
    environment: Arc<RenderEnvironment>,
    font_families: Arc<FontFamilies>,
    font_list: Arc<FontList>,
    fonts_dir: Arc<PathBuf>,
    typst_root: Arc<PathBuf>,
    images_root: Arc<PathBuf>,
    /// Typst Universe 包缓存，目录结构与 typst CLI 一致：`preview/<name>/<version>/`
    packages_dir: Arc<PathBuf>,
}

#[derive(Clone)]
struct FontFamilies {
    sans: String,
    serif: String,
    mono: String,
}

#[derive(Clone)]
struct FontList {
    /// 字体文件名列表（如 Roboto-Regular.ttf），供 WASM 加载
    files: Vec<String>,
    /// 去重后的字体家族名列表（如 Roboto、Libertinus Serif），供编辑器提示
    families: Vec<String>,
    /// 家族 → 支持的 weight 列表（如 Roboto → [thin, ..., black]），供编辑器按字体提示
    weights: HashMap<String, Vec<String>>,
}

impl FontFamilies {
    fn resolve(&self, family: &str) -> &str {
        match family {
            "serif" => &self.serif,
            "mono" => &self.mono,
            _ => &self.sans,
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "paperflow=info,tower_http=info".into()),
        )
        .init();

    let data_root = std::env::var("PAPERFLOW_DATA_DIR").unwrap_or_else(|_| "data".into());
    let data_root = PathBuf::from(data_root);
    let typst_root = data_root.join("typst");
    let images_root = data_root.join("images");
    let packages_dir = data_root.join("packages");

    // 确保数据目录存在
    for dir in [&typst_root, &images_root, &packages_dir] {
        if let Err(e) = fs::create_dir_all(dir) {
            warn!("无法创建数据目录 {}: {e}", dir.display());
        }
    }

    let (environment, font_families, font_list) = create_render_environment();

    // 前端静态文件目录（默认 app/out）
    let frontend_dir = std::env::var("PAPERFLOW_FRONTEND_DIR").unwrap_or_else(|_| "app/out".into());
    let frontend_dir = PathBuf::from(&frontend_dir);
    if frontend_dir.join("index.html").exists() {
        info!("前端静态文件目录: {}", frontend_dir.display());
    } else {
        warn!(
            "前端静态文件目录不存在或缺少 index.html: {}，仅提供 API 服务",
            frontend_dir.display()
        );
    }
    let frontend_dir = Arc::new(frontend_dir);
    let state = AppState {
        environment: Arc::new(environment),
        font_families: Arc::new(font_families),
        font_list: Arc::new(font_list),
        fonts_dir: Arc::new(resolve_fonts_dir()),
        typst_root: Arc::new(typst_root),
        images_root: Arc::new(images_root),
        packages_dir: Arc::new(packages_dir),
    };

    // 构建静态文件 fallback 服务 — 用 move 闭包捕获 frontend_dir 而非 State<AppState>
    let static_dir = Arc::clone(&frontend_dir);
    let static_fallback = move |req: Request| {
        let dir = Arc::clone(&static_dir);
        async move {
            let path = req.uri().path().trim_start_matches('/');
            let file_path = if path.is_empty() {
                dir.join("index.html")
            } else {
                dir.join(path)
            };

            match tokio::fs::read(&file_path).await {
                Ok(content) => {
                    let mime = mime_guess(&file_path);
                    Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, mime)
                        .body(Body::from(content))
                        .unwrap()
                }
                Err(_) => {
                    // 文件不存在，回退到 index.html（SPA）
                    let index = dir.join("index.html");
                    match tokio::fs::read(&index).await {
                        Ok(content) => Response::builder()
                            .status(StatusCode::OK)
                            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                            .body(Body::from(content))
                            .unwrap(),
                        Err(e) => {
                            warn!("无法读取 index.html: {e}");
                            (StatusCode::NOT_FOUND, "Not Found").into_response()
                        }
                    }
                }
            }
        }
    };

    let app = Router::new()
        // 健康检查 & 字体
        .route("/health", get(health))
        .route("/api/fonts", get(fonts))
        // 字体文件静态路由（为 WASM 提供字体加载）
        .route("/fonts/{*path}", get(serve_font))
        // 原有的渲染接口
        .route("/api/render", post(render))
        // 按已保存模板和变量生成 PDF
        .route("/api/pdf", post(pdf::generate_pdf))
        // 文件管理
        .route(
            "/api/nodes",
            get(files_api::list_nodes).delete(files_api::delete_node),
        )
        .route("/api/directories", post(files_api::create_directory))
        .route(
            "/api/files",
            get(files_api::get_file).put(files_api::save_file),
        )
        .route("/api/nodes/rename", post(files_api::rename_node))
        // 图片管理
        .route(
            "/api/images",
            get(images_api::list_images)
                .post(images_api::upload_image)
                .delete(images_api::delete_image),
        )
        .route("/api/images/content", get(images_api::get_image_content))
        .route("/api/images/rename", post(images_api::rename_image))
        .layer(DefaultBodyLimit::max(16 * 1024 * 1024)) // 16MB
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_headers([header::CONTENT_TYPE])
                .allow_methods(Any),
        )
        .layer(TraceLayer::new_for_http())
        // WASM 需要 SharedArrayBuffer，设置跨域隔离头
        .layer(SetResponseHeaderLayer::overriding(
            header::HeaderName::from_static("cross-origin-opener-policy"),
            HeaderValue::from_static("same-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::HeaderName::from_static("cross-origin-embedder-policy"),
            HeaderValue::from_static("credentialless"),
        ))
        .with_state(state);

    let app = app.fallback(static_fallback);

    // 绑定 0.0.0.0 使 Docker 容器可接受外部连接
    let address = SocketAddr::from(([0, 0, 0, 0], 4000));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("failed to bind server");
    info!("Paperflow 服务已启动 http://{address}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server failed");
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn fonts(State(state): State<AppState>) -> Json<FontsResponse> {
    Json(FontsResponse {
        files: state.font_list.files.clone(),
        families: state.font_list.families.clone(),
        weights: state.font_list.weights.clone(),
        sans: state.font_families.sans.clone(),
        serif: state.font_families.serif.clone(),
        mono: state.font_families.mono.clone(),
    })
}

/// 为 WASM 字体加载提供静态文件服务
async fn serve_font(
    State(state): State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Result<Response, StatusCode> {
    // 防止路径遍历攻击
    let requested_path = std::path::Path::new(&path);
    if requested_path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(StatusCode::NOT_FOUND);
    }
    let file_path = state.fonts_dir.join(&path);
    match tokio::fs::read(&file_path).await {
        Ok(content) => {
            let mime = mime_guess(&file_path);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "public, max-age=86400")
                .body(Body::from(content))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
        }
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

// ── 保留原有的后端渲染接口 ────────────────────────────────────────────

async fn render(
    State(state): State<AppState>,
    Json(payload): Json<RenderRequest>,
) -> Result<Response, ApiError> {
    let resolved_font = state
        .font_families
        .resolve(&payload.template.page.font_family);
    let translation = translate(&payload.template, &payload.variables, resolved_font)?;
    let environment = state.environment;
    let filename = safe_filename(&payload.template.name);

    let pdf = tokio::task::spawn_blocking(move || {
        let mut project = Project::builder("main.typ").source_file("main.typ", translation.source);
        for (path, bytes) in translation.assets {
            project = project.file(path, bytes);
        }
        let project = project
            .build()
            .map_err(|error| ApiError::compile(error.to_string()))?;
        let artifact = render_pdf(&project, &environment)
            .map_err(|error| ApiError::compile(error.to_string()))?;
        Ok::<_, ApiError>(artifact.bytes().to_vec())
    })
    .await
    .map_err(|error| {
        error!("render worker failed: {error}");
        ApiError::internal("PDF 渲染任务异常退出")
    })??;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_str(&format!("attachment; filename=\"{filename}.pdf\""))
                .unwrap_or_else(|_| {
                    HeaderValue::from_static("attachment; filename=\"document.pdf\"")
                }),
        )
        .body(Body::from(pdf))
        .map_err(|_| ApiError::internal("无法创建 PDF 响应"))
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Serialize)]
struct FontsResponse {
    files: Vec<String>,
    families: Vec<String>,
    weights: HashMap<String, Vec<String>>,
    sans: String,
    serif: String,
    mono: String,
}

fn safe_filename(name: &str) -> String {
    let name = name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(80)
        .collect::<String>();
    if name.is_empty() {
        "document".into()
    } else {
        name
    }
}

/// 根据文件扩展名返回 MIME 类型，用于静态文件及图片内容响应。
pub(crate) fn mime_guess(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => match ext.to_ascii_lowercase().as_str() {
            "html" => "text/html; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "js" => "application/javascript; charset=utf-8",
            "json" => "application/json",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "bmp" => "image/bmp",
            "wasm" => "application/wasm",
            "ttf" => "font/ttf",
            "otf" => "font/otf",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "txt" => "text/plain; charset=utf-8",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

/// 已知字重/字形后缀，按长度降序确保 BoldItalic 先于 Italic 匹配。
/// 包含 Maple 字体的 SemiBold（大写 B）、ExtraBold/ExtraLight 等变体。
const STYLE_SUFFIXES: &[&str] = &[
    "SemiboldItalic",
    "SemiBoldItalic",
    "ExtraBoldItalic",
    "ExtraLightItalic",
    "BoldItalic",
    "LightItalic",
    "MediumItalic",
    "BlackItalic",
    "ThinItalic",
    "BoldOblique",
    "ExtraBold",
    "ExtraLight",
    "Semibold",
    "SemiBold",
    "Regular",
    "Bold",
    "Italic",
    "Light",
    "Medium",
    "Thin",
    "Black",
    "Book",
    "Oblique",
    "BD",
];

/// weight 枚举顺序（与前端 completions 的 weightValues 保持一致），
/// 用于家族内 weight 列表的排序。
const WEIGHT_ORDER: [&str; 9] = [
    "thin",
    "extralight",
    "light",
    "regular",
    "medium",
    "semibold",
    "bold",
    "extrabold",
    "black",
];

/// 将字体文件风格后缀映射为 Typst weight 名（thin/extralight/.../black）。
///
/// 文件名风格后缀可能带 Italic/Oblique（如 BoldItalic），剥离后匹配字重。
fn weight_of(style: &str) -> Option<String> {
    let core = style.trim_end_matches("Italic").trim_end_matches("Oblique");
    let weight = match core {
        "Thin" => "thin",
        "Light" => "light",
        "Regular" | "Book" | "" => "regular",
        "Medium" => "medium",
        "Semibold" | "SemiBold" | "DemiBold" => "semibold",
        "Bold" | "BD" => "bold",
        "Extralight" | "ExtraLight" => "extralight",
        "Extrabold" | "ExtraBold" => "extrabold",
        "Black" | "Heavy" => "black",
        _ => return None,
    };
    Some(weight.to_string())
}

/// 从字体文件二进制读取内部元数据（家族名 + 字重 + 是否等宽）。
///
/// 必须与 typst 渲染端的解析逻辑保持一致：
/// - 家族名取 nameID 1（family），再经 `typographic_family` 剥离风格词
///   （如 "Arial Black" → "Arial"、"Maple Mono NF CN Light" → "Maple Mono NF CN"）；
/// - 字重取 OS/2 usWeightClass，而非子家族名；
/// - 不使用 nameID 16（typographic family），typst 有意避免它
///   （某些字体 16 会把 Display 等非字重变体混进同一家族）。
fn read_font_meta(data: &[u8]) -> Option<(String, String, bool)> {
    let face = ttf_parser::Face::parse(data, 0).ok()?;

    let family = face
        .names()
        .into_iter()
        .find(|name| name.name_id == 1 && name.is_unicode())
        .and_then(|name| name.to_string())
        .filter(|s| !s.trim().is_empty())
        .map(|s| typographic_family(&s).to_string())?;

    let weight = weight_number_to_name(face.weight().to_number());

    Some((family, weight, face.is_monospaced()))
}

/// 从 OS/2 usWeightClass 数字映射到 typst 字重名。
///
/// typst 保留原始数字并按绝对距离匹配（如 250 的 Thin 对
/// weight: "thin"/"extralight" 都可见），这里按最近的标准档位归属；
/// 距离并列时取较轻的档（250 → extralight，275 → light）。
fn weight_number_to_name(number: u16) -> String {
    const STEPS: [(u16, &str); 9] = [
        (100, "thin"),
        (200, "extralight"),
        (300, "light"),
        (400, "regular"),
        (500, "medium"),
        (600, "semibold"),
        (700, "bold"),
        (800, "extrabold"),
        (900, "black"),
    ];
    let number = number.clamp(100, 900);
    let mut best = STEPS[0];
    let mut best_dist = u16::MAX;
    for &(step, name) in &STEPS {
        let dist = number.abs_diff(step);
        if dist < best_dist || (dist == best_dist && step < best.0) {
            best_dist = dist;
            best = (step, name);
        }
    }
    best.1.to_string()
}

/// 从家族名剥离风格后缀，与 typst `typographic_family` 保持一致。
fn typographic_family(mut family: &str) -> &str {
    // 名称、修饰词与风格之间的分隔符
    const SEPARATORS: [char; 3] = [' ', '-', '_'];

    // 可与后缀组合出现的修饰词
    const MODIFIERS: &[&str] = &[
        "extra", "ext", "ex", "x", "semi", "sem", "sm", "demi", "dem", "ultra",
    ];

    // 风格后缀
    #[rustfmt::skip]
    const SUFFIXES: &[&str] = &[
        "normal", "italic", "oblique", "slanted",
        "thin", "th", "hairline", "light", "lt", "regular", "medium", "med",
        "md", "bold", "bd", "demi", "extb", "black", "blk", "bk", "heavy",
        "narrow", "condensed", "cond", "cn", "cd", "compressed", "expanded", "exp",
        "vf", "var", "variable",
    ];

    // 去除首尾空白与 Apple 字体的前导点
    family = family.trim().trim_start_matches('.');

    // 转小写以便后缀大小写不敏感匹配
    let lower = family.to_ascii_lowercase();
    let mut len = usize::MAX;
    let mut trimmed = lower.as_str();

    // 反复剥离风格后缀
    while trimmed.len() < len {
        len = trimmed.len();

        // 找风格后缀
        let mut t = trimmed;
        let mut shortened = false;
        while let Some(s) = SUFFIXES.iter().find_map(|s| t.strip_suffix(s)) {
            shortened = true;
            t = s;
        }

        if !shortened {
            break;
        }

        // 剥离可选分隔符
        if let Some(s) = t.strip_suffix(SEPARATORS) {
            trimmed = s;
            t = s;
        }

        // 允许额外修饰词，但仅当其与前方文本有分隔时生效（避免误判）
        if let Some(t) = MODIFIERS.iter().find_map(|s| t.strip_suffix(s))
            && let Some(stripped) = t.strip_suffix(SEPARATORS)
        {
            trimmed = stripped;
        }
    }

    // 应用风格后缀裁剪
    &family[..len]
}

/// 从文件名基础部分分离家族名与风格词序列。
///
/// 支持两种命名：
/// - 连字符分隔：`Roboto-BoldItalic` / `MapleMono-NF-CN-SemiBold`（取最后一个连字符）
/// - 空格分隔：`Arial Bold Italic` / `Arial Black`（从末尾剥离 Style 词）
///
/// 返回 (家族名, 风格词列表，如 ["Italic", "Bold"])。
fn split_style(base: &str) -> (String, Vec<String>) {
    // 1) 连字符分隔
    if let Some(last_dash) = base.rfind('-') {
        let style = &base[last_dash + 1..];
        if STYLE_SUFFIXES.contains(&style) || weight_of(style).is_some() {
            return (base[..last_dash].to_string(), vec![style.to_string()]);
        }
        // 最后一个连字符后不是风格词（如 MapleMono-NF-CN），整体视为家族名
        return (base.to_string(), vec![]);
    }

    // 2) 空格分隔：从末尾循环剥离 " Style" 词
    let mut family = base.to_string();
    let mut styles = Vec::new();
    while let Some((head, tail)) = family.rsplit_once(' ') {
        if STYLE_SUFFIXES.contains(&tail) || weight_of(tail).is_some() {
            styles.push(tail.to_string());
            family = head.to_string();
        } else {
            break;
        }
    }
    (family, styles)
}

/// 从风格词序列推导 weight（忽略 italic/oblique，取最后一个字重词）。
fn weight_from_styles(styles: &[String]) -> Option<String> {
    for style in styles.iter().rev() {
        let core = style.trim_end_matches("Italic").trim_end_matches("Oblique");
        if let Some(weight) = weight_of(core) {
            return Some(weight);
        }
    }
    None
}

/// 从文件名推断 Typst weight 名（默认 regular）。
///
/// 支持命名规则：
/// - `FamilyName-Style.ttf`（如 Roboto-BoldItalic → bold）
/// - 空格分隔（如 Arial Bold Italic → bold）
/// - 无分隔符但带后缀（如 ARIALBD → bold）
/// - 无后缀（如 DejaVuSansMono → regular）
fn infer_font_weight(file_name: &str) -> String {
    let base = file_name
        .strip_suffix(".ttf")
        .or_else(|| file_name.strip_suffix(".otf"))
        .or_else(|| file_name.strip_suffix(".TTF"))
        .or_else(|| file_name.strip_suffix(".OTF"))
        .unwrap_or(file_name);

    let (family, styles) = split_style(base);
    if let Some(weight) = weight_from_styles(&styles) {
        return weight;
    }

    // 特殊缩写：族名+BD（如 ARIALBD）→ bold
    if family.len() > 3 && family.to_ascii_lowercase().ends_with("bd") {
        return "bold".into();
    }

    // 无任何后缀 → regular
    "regular".into()
}

/// 从字体文件名推断 Typst 家族名，与前端 font-family.ts 逻辑一致。
///
/// 文件名格式通常为 FamilyName-Style.ttf/otf（连字符或空格分隔）。
fn infer_font_family(file_name: &str) -> Option<String> {
    let base = file_name
        .strip_suffix(".ttf")
        .or_else(|| file_name.strip_suffix(".otf"))
        .or_else(|| file_name.strip_suffix(".TTF"))
        .or_else(|| file_name.strip_suffix(".OTF"))
        .unwrap_or(file_name);

    let (family, _styles) = split_style(base);
    Some(map_family(&family))
}

/// 家族名映射（与前端 familyOverrides 保持一致）
fn map_family(raw: &str) -> String {
    // 精确匹配
    match raw {
        "ARIAL" | "ARIALBD" => "Arial",
        "DejaVuSansMono" => "DejaVu Sans Mono",
        "InriaSerif" => "Inria Serif",
        "LibertinusSerif" => "Libertinus Serif",
        "NewCM10" => "New Computer Modern",
        "NewCMMath" => "New Computer Modern Math",
        "NotoSerifCJKsc" => "Noto Serif CJK SC",
        "Roboto" => "Roboto",
        _ => raw,
    }
    .to_string()
}

/// 解析字体目录路径，优先使用环境变量 PAPERFLOW_FONTS_DIR，默认项目根目录 fonts/
fn resolve_fonts_dir() -> PathBuf {
    std::env::var("PAPERFLOW_FONTS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("fonts"))
}

/// 扫描 fonts/ 目录，加载所有字体文件，构建渲染环境和字体列表。
///
/// 返回：
/// - RenderEnvironment：包含所有字体文件的渲染环境
/// - FontFamilies：模板渲染使用的 sans/serif/mono 家族名
/// - FontList：完整字体文件名和家族名列表（供 /api/fonts 返回）
fn create_render_environment() -> (RenderEnvironment, FontFamilies, FontList) {
    let fonts_dir = resolve_fonts_dir();

    let mut file_names = Vec::new();
    let mut font_data = Vec::new();
    let mut family_set = HashSet::new();
    let mut mono_set: HashSet<String> = HashSet::new();
    // 家族 → 支持的 weight 列表（从文件名推断，去重后排序）
    let mut weights_map: HashMap<String, Vec<String>> = HashMap::new();

    if fonts_dir.is_dir() {
        let mut entries: Vec<_> = match fs::read_dir(&fonts_dir) {
            Ok(entries) => entries.flatten().collect(),
            Err(error) => {
                warn!("无法读取字体目录 {}: {error}", fonts_dir.display());
                vec![]
            }
        };
        // 按文件名排序，确保加载顺序一致
        entries.sort_by_key(|e| e.file_name());

        for entry in entries {
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            if !matches!(ext.as_str(), "ttf" | "otf" | "woff" | "woff2") {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            match fs::read(&path) {
                Ok(bytes) => {
                    // 优先读字体内部元数据（与 typst 渲染端解析规则一致），
                    // 解析失败时回退到文件名推断
                    let (family, weight, is_mono) = match read_font_meta(&bytes) {
                        Some((family, weight, is_mono)) => (family, weight, is_mono),
                        None => {
                            let family =
                                infer_font_family(name).unwrap_or_else(|| name.to_string());
                            (family, infer_font_weight(name), false)
                        }
                    };
                    family_set.insert(family.clone());
                    weights_map.entry(family.clone()).or_default().push(weight);
                    if is_mono {
                        mono_set.insert(family);
                    }
                    file_names.push(name.to_string());
                    font_data.push(bytes);
                }
                Err(error) => {
                    warn!("无法读取字体文件 {}: {error}", path.display());
                }
            }
        }
    } else {
        warn!(
            "字体目录不存在: {}，仅使用内置字体（需确保 fonts/ 存在或设置 PAPERFLOW_FONTS_DIR）",
            fonts_dir.display()
        );
    }

    // 构建排序后的家族名列表
    let mut families: Vec<String> = family_set.into_iter().collect();
    families.sort();

    // 每个家族的 weight 去重，并按 thin → black 的字重顺序排序
    for weights in weights_map.values_mut() {
        weights.sort_by_key(|w| {
            WEIGHT_ORDER
                .iter()
                .position(|x| x == w)
                .unwrap_or(usize::MAX)
        });
        weights.dedup();
    }

    let font_list = FontList {
        files: file_names.clone(),
        families: families.clone(),
        weights: weights_map,
    };

    // 从已发现的家族中选取 sans / serif / mono
    let lower = |name: &str| name.to_ascii_lowercase();
    let contains_any = |haystack: &str, needles: &[&str]| {
        let h = lower(haystack);
        needles.iter().any(|n| h.contains(n))
    };

    // sans 偏好：Roboto、Arial、DejaVu Sans、Inria Serif
    let sans = families
        .iter()
        .find(|f| contains_any(f, &["roboto", "arial", "dejavu sans"]))
        .or_else(|| families.first())
        .cloned()
        .unwrap_or_else(|| "Roboto".into());

    // serif 偏好：Libertinus Serif、New Computer Modern、Noto Serif CJK、Times New Roman
    let serif = families
        .iter()
        .find(|f| {
            contains_any(
                f,
                &[
                    "libertinus",
                    "new computer modern",
                    "noto serif cjk",
                    "inria serif",
                    "times new roman",
                    "times",
                ],
            )
        })
        .or_else(|| families.first())
        .cloned()
        .unwrap_or_else(|| sans.clone());

    // mono 偏好：优先 OS/2 等宽标志命中的家族，其次按名字匹配
    let mono = families
        .iter()
        .find(|f| mono_set.contains(*f))
        .or_else(|| {
            families.iter().find(|f| {
                contains_any(
                    f,
                    &[
                        "dejavu sans mono",
                        "maple mono",
                        "jetbrains mono",
                        "fira code",
                        "consolas",
                    ],
                )
            })
        })
        .cloned()
        .unwrap_or_else(|| sans.clone());

    let font_families = FontFamilies {
        sans: sans.clone(),
        serif: serif.clone(),
        mono: mono.clone(),
    };

    let count = font_data.len();
    let environment = RenderEnvironment::builder()
        .font_set(FontSet::bundled_plus_font_files(font_data))
        .build()
        .expect("font environment should be valid");

    info!(
        "从 {} 加载了 {} 个字体文件（{} 个家族），sans={}，serif={}，mono={}",
        fonts_dir.display(),
        count,
        families.len(),
        sans,
        serif,
        mono
    );

    (environment, font_families, font_list)
}
