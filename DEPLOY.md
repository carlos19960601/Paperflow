# Paperflow 部署指南

## 架构概述

Paperflow 采用前后端分离架构：

| 组件   | 技术栈          | 端口  | Docker 构建上下文 |
|--------|-----------------|-------|-------------------|
| 后端   | Rust / Axum     | 4000  | 项目根目录 `.`     |
| 前端   | Next.js 15      | 3000  | `app/` 目录        |

前端通过浏览器端 JavaScript 调用后端 API，API 地址在 **运行时** 通过环境变量注入，无需重新构建镜像。

---

## 方式一：docker compose 一键部署（推荐）

```bash
docker compose up -d
```

这会在同一网络内启动 `backend` 和 `frontend` 两个服务：
- 后端 4000 端口映射到宿主机，浏览器通过 `localhost:4000` 直接调用 API
- 前端自动配置 `BACKEND_URL=http://localhost:4000/api`（宿主机可达地址）
- 数据通过绑定挂载 `./data:/data` 写到宿主机项目目录，容器重建后仍然保留
- 访问地址：`http://localhost:3000`

> **说明**：浏览器端 JavaScript 直接发起 API 请求，无法解析 Docker 内部服务名。
> 因此 `BACKEND_URL` 必须使用宿主机可达的地址（如 `localhost` 或域名），而非 Docker 服务名。

---

## 方式二：独立 Docker 部署

### 后端

```bash
# 从项目根目录构建
docker build -t paperflow-backend .

# 运行
docker run -d \
  --name paperflow-backend \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -v "$PWD/fonts:/fonts:ro" \
  -e PAPERFLOW_DATA_DIR=/data \
  -e PAPERFLOW_FONTS_DIR=/fonts \
  paperflow-backend
```

### 前端

```bash
# 从 app/ 目录构建
cd app
docker build -t paperflow-frontend .

# 运行（⚠️ 必须通过 BACKEND_URL 指定后端地址）
docker run -d \
  --name paperflow-frontend \
  -p 3000:3000 \
  -e BACKEND_URL=http://<后端主机IP>:4000/api \
  paperflow-frontend
```

> **重要**：`BACKEND_URL` 是运行时环境变量，格式为 `http://<host>:4000/api`。如果不设置，前端将回退到 `http://127.0.0.1:4000/api`，这在容器内通常不可用。

### 独立部署场景示例

| 场景                     | BACKEND_URL 示例                          |
|--------------------------|-------------------------------------------|
| 同一台机器，宿主机端口映射 | `http://host.docker.internal:4000/api`    |
| 另一台服务器             | `http://192.168.1.100:4000/api`           |
| 域名 + 反向代理          | `https://api.example.com/api`             |
| docker compose             | `http://localhost:4000/api`（自动配置） |

---

## 环境变量参考

### 后端

| 变量               | 默认值        | 说明                    |
|--------------------|---------------|-------------------------|
| `PAPERFLOW_DATA_DIR` | `/data`       | 数据存储目录            |
| `PAPERFLOW_FONTS_DIR` | `fonts`     | 字体目录（docker 部署需挂载 `./fonts:/fonts:ro` 并设为 `/fonts`） |
| `RUST_LOG`         | —             | 日志级别，如 `info`     |

### 前端

| 变量           | 默认值                          | 说明                                       |
|----------------|---------------------------------|--------------------------------------------|
| `BACKEND_URL`  | 空（回退到 `http://127.0.0.1:4000/api`） | **运行时**后端 API 地址，含 `/api` 后缀 |
| `NEXT_PUBLIC_API_URL` | —                       | 构建时 API 地址，仅本地开发 `pnpm dev` 使用 |

---

## 本地开发

```bash
# 终端 1：启动后端
cargo run

# 终端 2：启动前端（默认连接 127.0.0.1:4000）
cd app
pnpm install
pnpm dev
```

如需在开发时连接其他后端：

```bash
cd app
NEXT_PUBLIC_API_URL=http://other-host:4000/api pnpm dev
```

---

## 运行时 URL 注入原理

Next.js 的 `NEXT_PUBLIC_*` 环境变量在 **构建时** 内联到 JavaScript 中，部署后无法修改。Paperflow 的解决方案：

1. Next.js 服务端 layout 读取 `BACKEND_URL` 环境变量
2. 在 HTML 中注入 `<script>window.__BACKEND_URL__ = "..."</script>`
3. 前端 API 客户端优先读取 `window.__BACKEND_URL__`，其次 `NEXT_PUBLIC_API_URL`，最后回退到本地默认值

这样同一个 Docker 镜像可以通过不同 `BACKEND_URL` 环境变量连接到不同后端，无需重新构建。