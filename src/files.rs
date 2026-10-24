use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use crate::{AppState, error::ApiError};

// ── 请求/响应类型 ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PathQuery {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectoryReq {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileReq {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameNodeReq {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstNode {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstFile {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ListNodesRes {
    pub items: Vec<TypstNode>,
}

// ── 路径处理 ────────────────────────────────────────────────────────

/// 去除路径首尾 `/` 并验证每个分段只含允许字符
pub fn clean_path(raw: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    for seg in trimmed.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." || seg.contains('\\') || seg.contains('\0') {
            return Err(ApiError::bad_request("路径包含非法字符"));
        }
    }
    Ok(trimmed.to_owned())
}

/// 验证文件名（不含扩展名），不允许含 `/`、`\` 等
fn valid_name(name: &str) -> Result<&str, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed == "."
        || trimmed == ".."
    {
        return Err(ApiError::bad_request("名称包含非法字符"));
    }
    if trimmed.len() > 128 {
        return Err(ApiError::bad_request("名称不能超过 128 个字符"));
    }
    Ok(trimmed)
}

/// 将 API 路径转为文件系统上的 .typ 文件路径
pub(crate) fn typst_file_path(root: &Path, api_path: &str) -> PathBuf {
    if api_path.is_empty() {
        root.to_path_buf()
    } else {
        root.join(format!("{}.typ", api_path))
    }
}

/// 将 API 路径转为文件系统上的目录路径
fn fs_dir_path(root: &Path, api_path: &str) -> PathBuf {
    if api_path.is_empty() {
        root.to_path_buf()
    } else {
        root.join(api_path)
    }
}

/// 从路径生成一个稳定的 u64 id
fn path_id(path: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    hasher.finish()
}

/// 从路径提取文件名（最后一段不含 .typ）
fn file_name_from_path(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// 获取路径的父路径
fn parent_path(path: &str) -> String {
    match path.rsplit_once('/') {
        Some((parent, _)) => parent.to_owned(),
        None => String::new(),
    }
}

// ── API 处理函数 ──────────────────────────────────────────────────────

/// GET /api/nodes?path=
/// 列出目录的直接子节点（目录 + 文件）
pub async fn list_nodes(
    state: State<AppState>,
    query: Query<PathQuery>,
) -> Result<Json<ListNodesRes>, ApiError> {
    let api_path = clean_path(&query.path)?;
    let dir = fs_dir_path(&state.typst_root, &api_path);

    if !dir.exists() {
        return Err(ApiError::not_found("目录不存在"));
    }
    if !dir.is_dir() {
        return Err(ApiError::conflict("路径不是目录"));
    }

    let mut items: Vec<TypstNode> = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| {
        error!("读取目录失败 {}: {e}", dir.display());
        ApiError::internal("读取目录失败")
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            error!("读取目录项失败: {e}");
            ApiError::internal("读取目录项失败")
        })?;
        let file_type = entry.file_type().map_err(|e| {
            error!("获取文件类型失败: {e}");
            ApiError::internal("获取文件类型失败")
        })?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        if file_type.is_dir() {
            let child_path = if api_path.is_empty() {
                file_name.clone()
            } else {
                format!("{}/{}", api_path, file_name)
            };
            items.push(TypstNode {
                id: path_id(&child_path),
                name: file_name,
                path: child_path,
                kind: "dir".into(),
            });
        } else if file_name.ends_with(".typ") {
            let stem = file_name.strip_suffix(".typ").unwrap_or(&file_name);
            let child_path = if api_path.is_empty() {
                stem.to_owned()
            } else {
                format!("{}/{}", api_path, stem)
            };
            items.push(TypstNode {
                id: path_id(&child_path),
                name: stem.to_owned(),
                path: child_path,
                kind: "file".into(),
            });
        }
    }

    // 目录在前，文件在后；同类按名称排序
    items.sort_by(|a, b| (a.kind != "dir", &a.name).cmp(&(b.kind != "dir", &b.name)));

    Ok(Json(ListNodesRes { items }))
}

/// POST /api/directories
/// 创建目录（递归创建上级目录）
pub async fn create_directory(
    state: State<AppState>,
    Json(req): Json<CreateDirectoryReq>,
) -> Result<(StatusCode, Json<TypstNode>), ApiError> {
    let api_path = clean_path(&req.path)?;
    if api_path.is_empty() {
        return Err(ApiError::bad_request("目录路径不能为空"));
    }

    let dir = fs_dir_path(&state.typst_root, &api_path);
    if dir.exists() {
        if dir.is_dir() {
            let name = file_name_from_path(&api_path).to_owned();
            return Ok((
                StatusCode::OK,
                Json(TypstNode {
                    id: path_id(&api_path),
                    name,
                    path: api_path,
                    kind: "dir".into(),
                }),
            ));
        }
        return Err(ApiError::conflict("路径已被文件占用"));
    }

    std::fs::create_dir_all(&dir).map_err(|e| {
        error!("创建目录失败 {}: {e}", dir.display());
        ApiError::internal("创建目录失败")
    })?;

    let name = file_name_from_path(&api_path).to_owned();
    Ok((
        StatusCode::CREATED,
        Json(TypstNode {
            id: path_id(&api_path),
            name,
            path: api_path,
            kind: "dir".into(),
        }),
    ))
}

/// GET /api/files?path=
/// 读取 typst 文件内容
pub async fn get_file(
    state: State<AppState>,
    query: Query<PathQuery>,
) -> Result<Json<TypstFile>, ApiError> {
    let api_path = clean_path(&query.path)?;
    if api_path.is_empty() {
        return Err(ApiError::bad_request("文件路径不能为空"));
    }

    let file_path = typst_file_path(&state.typst_root, &api_path);
    if !file_path.exists() {
        return Err(ApiError::not_found("文件不存在"));
    }

    let content = std::fs::read_to_string(&file_path).map_err(|e| {
        error!("读取文件失败 {}: {e}", file_path.display());
        ApiError::internal("读取文件失败")
    })?;

    let name = file_name_from_path(&api_path).to_owned();
    Ok(Json(TypstFile {
        id: path_id(&api_path),
        name,
        path: api_path,
        kind: "file".into(),
        content,
    }))
}

/// PUT /api/files
/// 保存 typst 文件（不存在则创建，上级目录自动创建）
pub async fn save_file(
    state: State<AppState>,
    Json(req): Json<SaveFileReq>,
) -> Result<Json<TypstFile>, ApiError> {
    let api_path = clean_path(&req.path)?;
    if api_path.is_empty() {
        return Err(ApiError::bad_request("文件路径不能为空"));
    }

    let file_path = typst_file_path(&state.typst_root, &api_path);

    // 确保上级目录存在
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            error!("创建上级目录失败 {}: {e}", parent.display());
            ApiError::internal("创建目录失败")
        })?;
    }

    // 检查是否有同名目录冲突
    let dir_path = fs_dir_path(&state.typst_root, &api_path);
    if dir_path.is_dir() {
        return Err(ApiError::conflict("路径已被同名目录占用"));
    }

    std::fs::write(&file_path, &req.content).map_err(|e| {
        error!("写入文件失败 {}: {e}", file_path.display());
        ApiError::internal("保存文件失败")
    })?;

    let name = file_name_from_path(&api_path).to_owned();
    Ok(Json(TypstFile {
        id: path_id(&api_path),
        name,
        path: api_path,
        kind: "file".into(),
        content: req.content,
    }))
}

/// DELETE /api/nodes?path=
/// 删除文件或空目录（非空目录拒绝删除）
pub async fn delete_node(
    state: State<AppState>,
    query: Query<PathQuery>,
) -> Result<StatusCode, ApiError> {
    let api_path = clean_path(&query.path)?;
    if api_path.is_empty() {
        return Err(ApiError::bad_request("不能删除根目录"));
    }

    // 先尝试作为文件删除
    let file_path = typst_file_path(&state.typst_root, &api_path);
    if file_path.is_file() {
        std::fs::remove_file(&file_path).map_err(|e| {
            error!("删除文件失败 {}: {e}", file_path.display());
            ApiError::internal("删除文件失败")
        })?;
        return Ok(StatusCode::NO_CONTENT);
    }

    // 再尝试作为目录删除
    let dir_path = fs_dir_path(&state.typst_root, &api_path);
    if dir_path.is_dir() {
        // 检查是否为空目录
        let is_empty = std::fs::read_dir(&dir_path)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            return Err(ApiError::conflict("目录不为空，无法删除"));
        }
        std::fs::remove_dir(&dir_path).map_err(|e| {
            error!("删除目录失败 {}: {e}", dir_path.display());
            ApiError::internal("删除目录失败")
        })?;
        return Ok(StatusCode::NO_CONTENT);
    }

    Err(ApiError::not_found("节点不存在"))
}

/// POST /api/nodes/rename
/// 重命名文件或目录
pub async fn rename_node(
    state: State<AppState>,
    Json(req): Json<RenameNodeReq>,
) -> Result<Json<TypstNode>, ApiError> {
    let api_path = clean_path(&req.path)?;
    if api_path.is_empty() {
        return Err(ApiError::bad_request("不能重命名根目录"));
    }
    let name = valid_name(&req.name)?;

    let parent = parent_path(&api_path);
    let new_path = if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{}/{}", parent, name)
    };

    // 检查新路径是否已存在
    let new_file = typst_file_path(&state.typst_root, &new_path);
    let new_dir = fs_dir_path(&state.typst_root, &new_path);
    if new_file.exists() || new_dir.exists() {
        return Err(ApiError::conflict("目标名称已存在"));
    }

    // 尝试作为文件重命名
    let old_file = typst_file_path(&state.typst_root, &api_path);
    if old_file.is_file() {
        std::fs::rename(&old_file, &new_file).map_err(|e| {
            error!(
                "重命名文件失败 {} -> {}: {e}",
                old_file.display(),
                new_file.display()
            );
            ApiError::internal("重命名失败")
        })?;
        return Ok(Json(TypstNode {
            id: path_id(&new_path),
            name: name.to_owned(),
            path: new_path,
            kind: "file".into(),
        }));
    }

    // 尝试作为目录重命名
    let old_dir = fs_dir_path(&state.typst_root, &api_path);
    if old_dir.is_dir() {
        std::fs::rename(&old_dir, &new_dir).map_err(|e| {
            error!(
                "重命名目录失败 {} -> {}: {e}",
                old_dir.display(),
                new_dir.display()
            );
            ApiError::internal("重命名失败")
        })?;
        return Ok(Json(TypstNode {
            id: path_id(&new_path),
            name: name.to_owned(),
            path: new_path,
            kind: "dir".into(),
        }));
    }

    Err(ApiError::not_found("节点不存在"))
}
