# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

公司内部需要动态生成 PDF 的产品技术团队。用户是开发者或技术运营人员，他们使用 Paperflow 设计和排版 typst 模板，然后通过 API 以编程方式传入变量动态生成 PDF。

未来可能加入租户体系，服务外部公司客户（SaaS 形态）。

## Product Purpose

Paperflow 提供开箱即用的 PDF 动态生成方案。用户在线编写和预览 typst 模板，完成后通过 HTTP API 传入数据即可生成 PDF，无需自行搭建 typst 排版管线。

## Positioning

与 Overleaf（面向学术协作写作）和 Typst.app（面向个人排版）不同，Paperflow 定位为 **PDF 生成基础设施**——为技术团队的业务系统提供可编程的 PDF 渲染能力。产品形态是编辑器 + API 服务的一体化方案，而不是单纯的在线编辑器。

## Operating Context

- 技术团队在自己的业务系统中需要生成发票、报告、证书、合同等 PDF 文档
- 模板由团队中的排版人员或开发者用 typst 语言编写和调试
- 生产环境中由业务系统调用 API 传入 JSON 变量数据，Paperflow 后端渲染返回 PDF
- 模板文件、图片资产存储在服务端，需持久化

## Capabilities and Constraints

### 当前能力（已实现）
- 在线 typst 源码编辑器（CodeMirror + 语法高亮）
- 浏览器端 WASM 实时预览（typst → SVG）
- 文件树管理（模板分类、新建/重命名/删除）
- 图片资产管理（上传、缩略图预览、插入引用）
- Rust 后端提供文件 CRUD API 和图片管理 API
- 后端按已保存模板和 JSON 变量生成 PDF（`POST /api/pdf`）
- 编辑器识别 `sys.inputs`，支持字符串、数组、JSON 对象和 JSON 数组，并提供生成 PDF 按钮

### 待实现
- 多租户隔离
- 字体包管理与上传
- API Key 鉴权

### 技术约束
- 后端必须使用 Rust（axum）
- 前端使用 Next.js
- 图片和模板存储在本地文件系统，Docker 将 `./data` 绑定挂载到宿主机
- 预览使用 @myriaddreamin/typst.ts WASM 在浏览器编译，后端 PDF 生成使用 typst-embed crate

## Evidence on Hand

- 参考项目 Axinan/PaperFlow 的 UI 架构和 API 设计（Go 后端 + Next.js 前端）
- 当前已迁移完成基础编辑器功能，前后端可编译运行
- 无真实用户数据或使用案例

## Product Principles

1. **API 优先**：编辑器服务 API，所有模板操作和 PDF 生成均可通过 API 完成
2. **所见即所得**：编辑器中的 WASM 预览必须与后端 PDF 渲染结果一致
3. **零运维门槛**：Docker 一键部署，本地存储无需外部依赖
4. **开发者友好**：typst 源码即模板，JSON 变量清晰可预测

## Accessibility & Inclusion

中文优先，支持中文字体渲染。后续考虑国际化。