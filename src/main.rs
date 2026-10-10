mod schema;
mod translator;

use std::{collections::HashSet, fs, net::SocketAddr, path::PathBuf, sync::Arc};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{error, info, warn};
use typst_embed::{FontSet, Project, RenderEnvironment, render_pdf};

use crate::{
    schema::RenderRequest,
    translator::{TranslationError, translate},
};

#[derive(Clone)]
struct AppState {
    environment: Arc<RenderEnvironment>,
    font_families: Arc<FontFamilies>,
}

#[derive(Clone)]
struct FontFamilies {
    sans: String,
    serif: String,
    mono: String,
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

    let (environment, font_families) = create_render_environment();
    let state = AppState {
        environment: Arc::new(environment),
        font_families: Arc::new(font_families),
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/fonts", get(fonts))
        .route("/api/render", post(render))
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_headers([header::CONTENT_TYPE])
                .allow_methods(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let address = SocketAddr::from(([127, 0, 0, 1], 4000));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("failed to bind server");
    info!("Paperflow render service listening on http://{address}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server failed");
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn fonts(State(state): State<AppState>) -> Json<FontFamiliesResponse> {
    Json(FontFamiliesResponse {
        sans: state.font_families.sans.clone(),
        serif: state.font_families.serif.clone(),
        mono: state.font_families.mono.clone(),
    })
}

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
struct FontFamiliesResponse {
    sans: String,
    serif: String,
    mono: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn compile(message: String) -> Self {
        Self {
            status: StatusCode::UNPROCESSABLE_ENTITY,
            code: "compile_failed",
            message,
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "internal_error",
            message: message.into(),
        }
    }
}

impl From<TranslationError> for ApiError {
    fn from(error: TranslationError) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "invalid_template",
            message: error.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        #[derive(Serialize)]
        struct ErrorBody {
            code: &'static str,
            message: String,
        }

        (
            self.status,
            Json(ErrorBody {
                code: self.code,
                message: self.message,
            }),
        )
            .into_response()
    }
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

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

fn create_render_environment() -> (RenderEnvironment, FontFamilies) {
    let discovered = typst_kit::fonts::system()
        .filter(|(_, info)| info.coverage.contains('中' as u32))
        .collect::<Vec<_>>();
    let fallback_family = discovered
        .first()
        .map(|(_, info)| info.family.clone())
        .unwrap_or_else(|| "Libertinus Serif".into());
    let pick_family = |needles: &[&str]| {
        discovered
            .iter()
            .find(|(_, info)| {
                let family = info.family.to_ascii_lowercase();
                needles.iter().any(|needle| family.contains(needle))
            })
            .map(|(_, info)| info.family.clone())
    };
    let sans = pick_family(&[
        "pingfang",
        "hiragino sans",
        "noto sans cjk",
        "source han sans",
        "microsoft yahei",
        "wenquanyi",
    ])
    .unwrap_or_else(|| fallback_family.clone());
    let serif = pick_family(&[
        "songti",
        "hiragino mincho",
        "noto serif cjk",
        "source han serif",
        "simsun",
        "ming",
        "mincho",
    ])
    .unwrap_or_else(|| sans.clone());
    let font_families = FontFamilies {
        sans: sans.clone(),
        serif: serif.clone(),
        mono: sans,
    };
    let selected = [
        font_families.sans.as_str(),
        font_families.serif.as_str(),
        font_families.mono.as_str(),
    ];
    let mut paths = discovered
        .iter()
        .filter(|(_, info)| selected.iter().any(|family| info.family == *family))
        .map(|(path, _)| path.path.clone())
        .collect::<HashSet<PathBuf>>();

    if paths.is_empty() {
        paths.extend(discovered.iter().map(|(path, _)| path.path.clone()).take(2));
    }

    let font_files = paths
        .iter()
        .filter_map(|path| match fs::read(path) {
            Ok(bytes) => Some(bytes),
            Err(error) => {
                warn!("无法读取系统字体 {}: {error}", path.display());
                None
            }
        })
        .collect::<Vec<_>>();

    if font_files.is_empty() {
        warn!("未发现中文系统字体，中文 PDF 需要安装 Noto Sans CJK SC 或思源黑体");
    } else {
        info!(
            "已加载 {} 个中文系统字体文件，黑体={}，宋体={}",
            font_files.len(),
            font_families.sans,
            font_families.serif
        );
    }

    let environment = RenderEnvironment::builder()
        .font_set(FontSet::bundled_plus_font_files(font_files))
        .build()
        .expect("font environment should be valid");
    (environment, font_families)
}
