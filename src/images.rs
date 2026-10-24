use std::path::PathBuf;

use axum::{
    Json,
    body::Body,
    extract::{Multipart, Query, State},
    http::{StatusCode, header},
    response::Response,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::error;

use crate::{AppState, error::ApiError, files};

// ── 请求/响应类型 ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ImageQuery {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageContentQuery {
    #[serde(default)]
    pub path: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageDeleteQuery {
    #[serde(default)]
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstImage {
    pub name: String,
    pub size: u64,
    pub content_type: String,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
pub struct ImageListRes {
    pub items: Vec<TypstImage>,
}

// ── 路径处理 ────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE: usize = 10 * 1024 * 1024; // 10MB

/// 图片存储目录：`images/<typst_path>/`
pub(crate) fn image_dir(images_root: &std::path::Path, api_path: &str) -> PathBuf {
    if api_path.is_empty() {
        images_root.to_path_buf()
    } else {
        images_root.join(api_path)
    }
}

/// 验证图片名
fn valid_image_name(name: &str) -> Result<&str, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed.contains("..")
    {
        return Err(ApiError::bad_request("图片名称包含非法字符"));
    }
    if trimmed.len() > 255 {
        return Err(ApiError::bad_request("图片名称不能超过 255 个字符"));
    }
    Ok(trimmed)
}

fn detect_content_type(name: &str) -> &'static str {
    crate::mime_guess(std::path::Path::new(name))
}

// ── API 处理函数 ──────────────────────────────────────────────────────

/// GET /api/images?path=
/// 列出某文件关联的所有图片
pub async fn list_images(
    state: State<AppState>,
    query: Query<ImageQuery>,
) -> Result<Json<ImageListRes>, ApiError> {
    let api_path = files::clean_path(&query.path).unwrap_or_default();
    let dir = image_dir(&state.images_root, &api_path);

    if !dir.exists() {
        return Ok(Json(ImageListRes { items: vec![] }));
    }

    let mut items: Vec<TypstImage> = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| {
        error!("读取图片目录失败 {}: {e}", dir.display());
        ApiError::internal("读取图片目录失败")
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            error!("读取目录项失败: {e}");
            ApiError::internal("读取目录项失败")
        })?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| {
            error!("读取文件元数据失败: {e}");
            ApiError::internal("读取文件元数据失败")
        })?;
        if !metadata.is_file() {
            continue;
        }

        let bytes = std::fs::read(entry.path()).map_err(|e| {
            error!("读取图片文件失败: {e}");
            ApiError::internal("读取图片文件失败")
        })?;

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let sha256 = format!("{:x}", hasher.finalize());

        let content_type = detect_content_type(&file_name).into();
        items.push(TypstImage {
            name: file_name,
            size: metadata.len(),
            content_type,
            sha256,
        });
    }

    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(ImageListRes { items }))
}

/// POST /api/images
/// 上传图片（multipart: path + file）
pub async fn upload_image(
    state: State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<TypstImage>, ApiError> {
    let mut api_path = String::new();
    let mut file_name: Option<String> = None;
    let mut file_bytes: Vec<u8> = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name() {
            Some("path") => {
                api_path = field.text().await.unwrap_or_default();
            }
            Some("file") => {
                file_name = field.file_name().map(|s| s.to_owned());
                file_bytes = field.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
            }
            _ => {}
        }
    }

    api_path = files::clean_path(&api_path)?;
    let name = file_name.ok_or_else(|| ApiError::bad_request("未提供图片文件"))?;
    let name = valid_image_name(&name)?.to_owned();

    if file_bytes.is_empty() {
        return Err(ApiError::bad_request("图片文件为空"));
    }
    if file_bytes.len() > MAX_IMAGE_SIZE {
        return Err(ApiError::bad_request(format!(
            "图片不能超过 {}MB",
            MAX_IMAGE_SIZE / 1024 / 1024
        )));
    }

    let dir = image_dir(&state.images_root, &api_path);
    std::fs::create_dir_all(&dir).map_err(|e| {
        error!("创建图片目录失败 {}: {e}", dir.display());
        ApiError::internal("创建图片目录失败")
    })?;

    let dest = dir.join(&name);
    std::fs::write(&dest, &file_bytes).map_err(|e| {
        error!("写入图片失败 {}: {e}", dest.display());
        ApiError::internal("保存图片失败")
    })?;

    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    let content_type = detect_content_type(&name).into();
    Ok(Json(TypstImage {
        name,
        size: file_bytes.len() as u64,
        content_type,
        sha256,
    }))
}

/// GET /api/images/content?path=&name=
/// 获取图片二进制内容
pub async fn get_image_content(
    state: State<AppState>,
    query: Query<ImageContentQuery>,
) -> Result<Response, ApiError> {
    let api_path = files::clean_path(&query.path).unwrap_or_default();
    let name = valid_image_name(&query.name)?.to_owned();

    let file_path = image_dir(&state.images_root, &api_path).join(&name);
    if !file_path.is_file() {
        return Err(ApiError::not_found("图片不存在"));
    }

    let bytes = std::fs::read(&file_path).map_err(|e| {
        error!("读取图片失败 {}: {e}", file_path.display());
        ApiError::internal("读取图片失败")
    })?;

    let content_type = detect_content_type(&name);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(bytes))
        .map_err(|_| ApiError::internal("无法创建图片响应"))
}

/// DELETE /api/images?path=&name=
/// 删除图片
pub async fn delete_image(
    state: State<AppState>,
    query: Query<ImageDeleteQuery>,
) -> Result<StatusCode, ApiError> {
    let api_path = files::clean_path(&query.path).unwrap_or_default();
    let name = valid_image_name(&query.name)?.to_owned();

    let file_path = image_dir(&state.images_root, &api_path).join(&name);
    if !file_path.is_file() {
        return Err(ApiError::not_found("图片不存在"));
    }

    std::fs::remove_file(&file_path).map_err(|e| {
        error!("删除图片失败 {}: {e}", file_path.display());
        ApiError::internal("删除图片失败")
    })?;

    Ok(StatusCode::NO_CONTENT)
}
