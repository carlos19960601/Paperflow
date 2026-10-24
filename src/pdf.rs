use std::{collections::HashMap, path::Path, sync::Arc};

use axum::{Json, extract::State};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::error;
use typst_embed::{
    FsPackages, PackageDependencyTarget, PreparePackagesOptions, Project, RegistryPackages,
    RenderEnvironment, RenderError, SystemDownloader, prepare_packages, render_pdf,
};

use crate::{AppState, error::ApiError, files, images, inputs::params_to_dict};

#[derive(Debug, Deserialize)]
pub struct GeneratePdfReq {
    /// 文件路径，不含 `.typ` 后缀，例如 `a/b/name`
    pub name: String,
    /// 写入 `sys.inputs` 的变量。字符串直接传入；源码默认值是数字时，数字字符串写成数字；
    /// JSON 对象写成字典，JSON 数组写成数组。
    #[serde(default)]
    pub params: HashMap<String, Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePdfRes {
    pub filename: String,
    pub content_base64: String,
}

/// POST /api/pdf
/// 读取已保存的 typst 文件和关联图片，按变量生成 PDF。
pub async fn generate_pdf(
    State(state): State<AppState>,
    Json(req): Json<GeneratePdfReq>,
) -> Result<Json<GeneratePdfRes>, ApiError> {
    let api_path = file_path(&req.name)?;
    let file_path = files::typst_file_path(&state.typst_root, &api_path);
    if !file_path.is_file() {
        return Err(ApiError::not_found("文件不存在"));
    }

    let content = std::fs::read_to_string(&file_path).map_err(|err| {
        error!("读取模板失败 {}: {err}", file_path.display());
        ApiError::internal("读取模板失败")
    })?;
    let assets = load_assets(&state.images_root, &api_path)?;
    let inputs = params_to_dict(&content, &req.params).map_err(ApiError::bad_request)?;
    let environment = state
        .environment
        .to_builder()
        .inputs(inputs)
        .build()
        .map_err(|err| ApiError::internal(format!("渲染环境无效: {err}")))?;

    let filename = format!("{}.pdf", file_name(&api_path));
    let packages_dir = Arc::clone(&state.packages_dir);
    let pdf = tokio::task::spawn_blocking(move || {
        let mut project = Project::builder("main.typ").source_file("main.typ", content);
        for (path, bytes) in assets {
            project = project.file(path, bytes);
        }
        let project = project
            .build()
            .map_err(|err| ApiError::compile(err.to_string()))?;
        let environment = prepare_project_packages(&project, &environment, &packages_dir)?;
        render_pdf(&project, &environment)
            .map_err(|err| ApiError::compile(render_error_message(&err)))
    })
    .await
    .map_err(|err| {
        error!("pdf worker failed: {err}");
        ApiError::internal("PDF 渲染任务异常退出")
    })??;

    Ok(Json(GeneratePdfRes {
        filename,
        content_base64: STANDARD.encode(pdf.bytes()),
    }))
}

fn file_path(raw: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim().trim_matches('/');
    let without_suffix = trimmed.strip_suffix(".typ").unwrap_or(trimmed);
    let path = files::clean_path(without_suffix)?;
    if path.is_empty() {
        return Err(ApiError::bad_request("文件路径不能为空"));
    }
    Ok(path)
}

fn file_name(path: &str) -> &str {
    path.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("document")
}

fn load_assets(images_root: &Path, api_path: &str) -> Result<Vec<(String, Vec<u8>)>, ApiError> {
    let dir = images::image_dir(images_root, api_path);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&dir).map_err(|err| {
        error!("读取图片目录失败 {}: {err}", dir.display());
        ApiError::internal("读取图片目录失败")
    })?;
    let mut assets = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| {
            error!("读取图片目录项失败: {err}");
            ApiError::internal("读取图片目录失败")
        })?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.contains('/') || name.contains('\\') || name.contains("..")
        {
            continue;
        }
        if !entry.path().is_file() {
            continue;
        }
        let bytes = std::fs::read(entry.path()).map_err(|err| {
            error!("读取图片失败 {}: {err}", entry.path().display());
            ApiError::internal("读取图片失败")
        })?;
        assets.push((format!("assets/{name}"), bytes));
    }
    Ok(assets)
}

/// 按模板里的 `#import "@preview/..."` 下载 Typst Universe 包，并缓存到数据目录。
/// 缓存命中时不再访问网络。下载失败时返回包名和原因，而不是 Typst 的 “file not found”。
fn prepare_project_packages(
    project: &Project,
    environment: &RenderEnvironment,
    packages_dir: &Path,
) -> Result<RenderEnvironment, ApiError> {
    std::fs::create_dir_all(packages_dir).map_err(|err| {
        error!("创建包缓存目录失败 {}: {err}", packages_dir.display());
        ApiError::internal("创建包缓存目录失败")
    })?;
    let source = RegistryPackages::new(SystemDownloader::new("paperflow"))
        .cache(FsPackages::new(packages_dir));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .map_err(|err| ApiError::internal(format!("无法准备 Typst 包: {err}")))?;
    let preparation = runtime
        .block_on(prepare_packages(
            project,
            environment,
            PackageDependencyTarget::Paged,
            &source,
            PreparePackagesOptions::new(),
        ))
        .map_err(|err| ApiError::compile(render_error_message(&err)))?;
    if !preparation.unresolved().is_empty() {
        let message = preparation
            .unresolved()
            .iter()
            .map(|(spec, err)| format!("{spec}: {err}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(ApiError::compile(format!("无法获取 Typst 包：{message}")));
    }
    for spec in preparation.resolved() {
        tracing::info!("已加载 Typst 包 {spec}");
    }
    Ok(preparation.into_environment())
}

fn render_error_message(error: &RenderError) -> String {
    match error {
        RenderError::Diagnostics(items) if !items.is_empty() => items
            .iter()
            .map(|item| item.message().to_owned())
            .collect::<Vec<_>>()
            .join("\n"),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::extract::State;
    use typst_embed::RenderEnvironment;

    use super::*;
    use crate::{FontFamilies, FontList};

    #[tokio::test]
    async fn compiles_saved_template_with_json_and_image() {
        let root = std::env::temp_dir().join(format!("paperflow-pdf-{}", std::process::id()));
        let typst_root = root.join("typst");
        let images_root = root.join("images");
        std::fs::create_dir_all(&typst_root).unwrap();
        std::fs::create_dir_all(images_root.join("demo")).unwrap();
        std::fs::write(
            typst_root.join("demo.typ"),
            "#let person = sys.inputs.at(\"person\", default: (name: \"\"))\n#person.name\n#image(\"/assets/dot.png\")\n",
        )
        .unwrap();
        let png = STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap();
        std::fs::write(images_root.join("demo").join("dot.png"), png).unwrap();

        let state = AppState {
            environment: Arc::new(RenderEnvironment::builder().build().unwrap()),
            font_families: Arc::new(FontFamilies {
                sans: "Arial".into(),
                serif: "Times New Roman".into(),
                mono: "Arial".into(),
            }),
            font_list: Arc::new(FontList {
                files: Vec::new(),
                families: Vec::new(),
                weights: HashMap::new(),
            }),
            fonts_dir: Arc::new(root.join("fonts")),
            typst_root: Arc::new(typst_root),
            images_root: Arc::new(images_root),
            packages_dir: Arc::new(root.join("packages")),
        };
        let mut params = HashMap::new();
        params.insert("person".into(), serde_json::json!({ "name": "张三" }));

        let result = generate_pdf(
            State(state),
            Json(GeneratePdfReq {
                name: "demo".into(),
                params,
            }),
        )
        .await
        .expect("generate pdf");
        assert_eq!(result.filename, "demo.pdf");
        let bytes = STANDARD.decode(&result.content_base64).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn compiles_template_that_imports_a_cached_package() {
        let root = std::env::temp_dir().join(format!("paperflow-pdf-pkg-{}", std::process::id()));
        let typst_root = root.join("typst");
        let package_dir = root.join("packages/preview/demo/0.1.0");
        std::fs::create_dir_all(&typst_root).unwrap();
        std::fs::create_dir_all(&package_dir).unwrap();
        std::fs::write(
            package_dir.join("typst.toml"),
            "[package]\nname = \"demo\"\nversion = \"0.1.0\"\nentrypoint = \"lib.typ\"\n",
        )
        .unwrap();
        std::fs::write(package_dir.join("lib.typ"), "#let greet = [hello]\n").unwrap();
        std::fs::write(
            typst_root.join("demo.typ"),
            "#import \"@preview/demo:0.1.0\": greet\n#greet\n",
        )
        .unwrap();

        let state = AppState {
            environment: Arc::new(RenderEnvironment::builder().build().unwrap()),
            font_families: Arc::new(FontFamilies {
                sans: "Arial".into(),
                serif: "Times New Roman".into(),
                mono: "Arial".into(),
            }),
            font_list: Arc::new(FontList {
                files: Vec::new(),
                families: Vec::new(),
                weights: HashMap::new(),
            }),
            fonts_dir: Arc::new(root.join("fonts")),
            typst_root: Arc::new(typst_root),
            images_root: Arc::new(root.join("images")),
            packages_dir: Arc::new(root.join("packages")),
        };

        let result = generate_pdf(
            State(state),
            Json(GeneratePdfReq {
                name: "demo".into(),
                params: HashMap::new(),
            }),
        )
        .await
        .expect("generate pdf");
        let bytes = STANDARD.decode(&result.content_base64).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        let _ = std::fs::remove_dir_all(root);
    }
}
