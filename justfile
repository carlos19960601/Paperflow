# Paperflow 开发脚本

set shell := ["bash", "-uc"]

# 列出可用命令
default:
    @just --list

# 同时启动后端与前端开发服务（Ctrl+C 停止）
dev: dev-api dev-web

# 运行后端 PDF 渲染服务（http://127.0.0.1:4000）
dev-api:
    cargo run

# 运行前端模板编辑器（http://localhost:3000）
dev-web:
    cd app && pnpm dev

# 安装前后端依赖
setup:
    cargo fetch
    cd app && pnpm install

# 前端类型检查
typecheck:
    cd app && pnpm typecheck

# 前端代码检查
lint:
    cd app && pnpm lint

# 前端代码格式化
format:
    cd app && pnpm format

# 构建前端生产版本
build-web:
    cd app && pnpm build

# 运行后端测试
test:
    cargo test
