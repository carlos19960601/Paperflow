# ── Rust 后端构建阶段 ─────────────────────────────────────────────────
FROM rust:1.92-slim-bookworm AS backend-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# crates.io 从国内拉取经常超时，构建时改走稀疏镜像
RUN mkdir -p /usr/local/cargo \
    && printf '%s\n' \
      '[source.crates-io]' \
      'replace-with = "rsproxy-sparse"' \
      '[source.rsproxy-sparse]' \
      'registry = "sparse+https://rsproxy.cn/index/"' \
      > /usr/local/cargo/config.toml

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
# 占位 main 以利用 Docker 缓存层下载依赖
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo fetch
RUN rm -rf src

COPY src/ src/
RUN cargo build --release

# ── 生产运行阶段 ──────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /build/target/release/paperflow /usr/local/bin/paperflow

# 数据目录。镜像内只作为挂载点，实际文件由 compose 绑定到宿主机 ~/data/paperflow
RUN mkdir -p /data/typst /data/images /data/packages
ENV PAPERFLOW_DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:4000/health || exit 1

CMD ["paperflow"]