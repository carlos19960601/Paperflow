# ── 前端构建阶段 ──────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /build

# 利用 Docker 缓存层：先装依赖
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

# 复制源码并构建
# NEXT_EXPORT=0 确保产出服务端构建（.next/），而非静态导出（out/）
COPY . ./
ENV NEXT_EXPORT=0
RUN pnpm build

# ── 生产运行阶段 ──────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app
RUN corepack enable

# 仅安装生产依赖
COPY --from=frontend-builder /build/package.json /build/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=frontend-builder /build/.next ./.next
COPY --from=frontend-builder /build/public ./public
COPY --from=frontend-builder /build/next.config.ts ./

# 运行时通过 BACKEND_URL 注入后端地址（由服务端 layout 写入页面）
# 格式示例：http://your-backend:4000/api
# 若不设置，前端将回退到 NEXT_PUBLIC_API_URL 或默认为本地 localhost:4000
ENV BACKEND_URL=
# 与服务端构建产物（.next/）保持一致，避免 next start 误判为静态导出模式
ENV NEXT_EXPORT=0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

CMD ["pnpm", "start"]