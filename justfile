# Paperflow 开发脚本
#
#   开发:
#     just dev-backend   启动后端（http://127.0.0.1:4000）
#     just dev-frontend  启动前端（http://localhost:3000）
#     just dev           前后端同时启动（热更新）
#     just setup         安装所有依赖
#
#   生产构建:
#     just build-all     构建前端 + 编译后端（release）
#     just serve         启动生产服务（单进程，含前端静态文件）
#
#   容器:
#     just docker-up     启动 Docker Compose

set shell := ["bash", "-uc"]

# 列出可用命令
default:
    @just --list

# 启动 Rust 后端服务（http://127.0.0.1:4000）
dev-backend:
    cargo run

# 启动前端开发服务器（http://localhost:3000）
dev-frontend:
    cd app && pnpm dev

# 前后端同时启动（热更新：前端 :3000 + 后端 :4000）
dev:
    @echo "启动 Paperflow 开发环境（热更新）…"
    cargo run &
    cd app && pnpm dev
    @kill %1 2>/dev/null || true

# 兼容旧命令：同 dev-backend
dev-api: dev-backend

# 安装所有依赖
setup:
    cargo fetch
    cd app && pnpm install

# 前端类型检查
typecheck:
    cd app && pnpm typecheck

# 前端代码检查
lint:
    cd app && pnpm lint

# 构建前端生产版本
build-web:
    cd app && pnpm build

# 编译后端（release）
build-backend:
    cargo build --release

# 一键构建：前端静态文件 + 后端 release 二进制
build-all: build-web build-backend
    @echo "✅ 构建完成！运行 just serve 启动服务"

# 运行后端测试
test:
    cargo test

# 构建 Docker 镜像并启动
docker-up:
    docker compose up --build -d

# 启动生产服务（单进程 serve 前端 + API，http://127.0.0.1:4000）
serve:
    cargo run --release

# 停止 Docker 服务
docker-down:
    docker compose down