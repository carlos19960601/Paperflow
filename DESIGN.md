---
name: Paperflow
description: 面向技术团队的可编程 Typst 排版与 PDF 动态生成基础设施
colors:
  vermilion-seal: "oklch(0.47 0.175 28)"
  vermilion-seal-bright: "oklch(0.54 0.18 28)"
  vellum-canvas: "oklch(0.985 0.004 85)"
  linen-spine: "oklch(0.962 0.007 80)"
  manuscript-surface: "#fcfbf8"
  proofing-well: "#ebe6dc"
  paper-sheet: "#ffffff"
  elevated-card: "oklch(0.993 0.002 85)"
  warm-slot: "oklch(0.942 0.008 80)"
  selected-sand: "oklch(0.928 0.014 75)"
  lead-ink: "oklch(0.19 0.012 65)"
  graphite-ink: "oklch(0.43 0.014 65)"
  trim-rule: "oklch(0.885 0.01 80)"
  pine-emerald: "oklch(0.44 0.13 155)"
  ochre-amber: "oklch(0.46 0.13 68)"
  crimson-alert: "oklch(0.47 0.19 25)"
  pressroom-canvas: "oklch(0.175 0.008 65)"
  pressroom-well: "#0d0c0a"
  pressroom-card: "oklch(0.215 0.009 65)"
  parchment-ink: "oklch(0.94 0.006 85)"
  ash-ink: "oklch(0.72 0.01 80)"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
  code:
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  paper: "2px"
  sm: "5px"
  md: "7px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion-seal}"
    textColor: "{colors.elevated-card}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 12px"
  button-outline:
    backgroundColor: "{colors.elevated-card}"
    textColor: "{colors.lead-ink}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 8px"
  input-field:
    backgroundColor: "{colors.vellum-canvas}"
    textColor: "{colors.lead-ink}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  nav-row-active:
    backgroundColor: "{colors.selected-sand}"
    textColor: "{colors.lead-ink}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  card-panel:
    backgroundColor: "{colors.elevated-card}"
    textColor: "{colors.lead-ink}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
---

# Design System: Paperflow

## Overview

**Creative North Star: "The Typesetter's Proofing Desk（活字排印校样台）"**

Paperflow 不是泛用的云端笔记软件，也不是冰冷的通用 SaaS 后台，而是服务研发团队的**可编程排印与 PDF 交付工作台**。视觉系统从现代印务校样台中汲取秩序与材质灵感：左侧如装帧书脊般收敛的文件目录，中央是温润低眩光的 Typst 源码手稿区，右侧则是深浅分明的看版底槽与纯白校样纸张。

界面的核心叙事围绕「动态变量 → 实时校样 → HTTP API 交付」展开。所有工具栏严格遵循统一的标尺网格，摒弃冗余装饰与重复标题；把最醒目的朱砂印泥色留给成稿动作与关键焦点，让开发者的注意力始终停留在代码、数据结构与纸面成稿本身。

明确拒绝的视觉反例：泛滥的紫蓝渐变、无意义的毛玻璃卡片堆叠、低于无障碍标准的浅灰说明字，以及在暗色模式下擅自把 PDF 纸面染黑的伪暗黑处理。

**Key Characteristics:**
- **温润纸墨中性色阶**：以微暖道林纸色、亚麻书脊色与铅字浓墨替代生硬的纯白与工业冷灰。
- **朱砂印泥单点聚焦**：全界面仅使用朱砂印泥色承担主交付动作（生成 PDF）与当前文稿锚点。
- **纯白校样铁律**：无论日间或暗房主题，渲染出的 PDF 纸面始终保持纯白底色与真实阴影，确保所见即所得。
- **标尺级网格对齐**：顶栏与三栏工具条严格对齐 40px 高度与 1px 裁切分割线。
- **契约外显**：模板变量与 `POST /api/pdf` 调用载荷作为一等公民常驻可调，无需盲猜接口结构。

## Colors

调色板采用低彩度暖纸灰承载日常高频操作，以高辨识度的朱砂印泥色标定核心动作，并为编译诊断与保存状态配置满足 WCAG AA 对比度（≥ 4.5:1）的专用墨色。

### Primary
- **Vermilion Seal（朱砂印泥）**：系统的唯一品牌与主行动色。用于顶栏品牌印记、「生成 PDF」主按钮、当前激活模板图标、「变量与 API」展开态及文本光标与选区染色。暗色模式下切换为提亮后的 **Vermilion Seal Bright** 以维持对比度。

### Neutral
- **Vellum Canvas（道林暖白）** 与 **Pressroom Canvas（暗房炭墨）**：日间与暗色模式下的基础工作台背景。
- **Linen Spine（亚麻书脊）**：左侧文件资源栏与底部状态栏底色，比主画布沉半度以自然区分导航边界。
- **Manuscript Surface（手稿底面）**：中央 CodeMirror 编辑器背景，降低长时间编写 Typst 源码的视觉疲劳。
- **Proofing Well（看版底槽）** 与 **Pressroom Well（暗房看版槽）**：右侧预览区衬底，用明显明度差托出纸张四边。
- **Paper Sheet（纯白校样纸）**：SVG 页面唯一承载底色，明暗双主题恒定纯白。
- **Lead Ink（铅字浓墨）** 与 **Graphite Ink（石墨次级墨）**：主正文与次级说明文字；次级文字在所有浅底表面对比度均高于 6:1。
- **Trim Rule（裁切灰线）**：全站统一的 1px 栏间分割线与控件描边。
- **Pine Emerald / Ochre Amber / Crimson Alert**：分别对应「已保存 / 排版正常」、「正在排版 / 弃用警告」与「编译错误 / 删除确认」，在浅底与暗底均独立调校明度以确保清晰可读。

### Named Rules
**The Vermilion Seal Rule.** 朱砂主色在任意视口中的面积占比不超过 5%，只授予主交付按钮、当前打开模板锚点与激活抽屉开关，绝不用于大面积背景或装饰性徽章。

**The White Proof Rule.** 真实排出的文档纸面在任何主题下都必须保持纯白底色，严禁随暗色主题反相或染灰；主题切换只改变纸张外围的看版底槽与工具框架。

## Typography

**Display Font:** Inter（回退 PingFang SC、Noto Sans CJK SC）
**Body Font:** Inter（回退 PingFang SC、Noto Sans CJK SC）
**Label/Mono Font:** Geist Mono（用于源码、文件路径、JSON 载荷、cURL 命令与行列号度量）

**Character:** 无衬线界面字体保持克制、紧凑的工具感；等宽字体仅服务于代码、数据契约与数值读数，结合 `tabular-nums` 防止行列统计与缩放百分比跳动。

### Hierarchy
- **Headline** (600, 14px, 1.4 行高)：弹窗标题、空状态核心引导标题。
- **Title** (600, 13px, 1.4 行高)：文件树活动项、面板分组小标题。
- **Body** (400, 13px, 1.55 行高)：表单输入、目录列表、说明段落（单行阅读宽度控制在 36–65ch）。
- **Label** (500, 11px–12px, 1.35 行高)：工具栏分区名、状态栏读数、变量类型微标。全站功能性文字严禁低于 11px。
- **Code** (400, 13.5px, 1.65 行高)：CodeMirror Typst 源码编辑区与诊断定位代码。

### Named Rules
**The Honest Monospace Rule.** 等宽字体只用于 Typst 源码、模板路径、变量名、JSON/cURL 契约与行列页码读数，绝不把等宽字体当作装饰性的“科技风标签”贴在普通界面文案上。

**The 11px Floor Rule.** 界面中任何功能性文字、快捷键提示与类型徽章不得小于 11px，且必须满足至少 4.5:1 的对比度。

## Layout

桌面端（`≥ 1024px`）采用三栏全屏工作台网格：`15.5rem` 文件侧栏 + `1fr` 源码编辑区 + `1.15fr` 校样预览区；收起侧栏（`⌘B`）后平滑扩展为双栏对照。移动端与窄视口（`< 1024px`）收敛为顶栏 + 三段式视图切换条（文件 / 源码 / 预览）+ 底栏状态条。

纵向结构锁定在 `100vh` 内，禁止整页外层滚动：
- 顶栏固定 `40px`（`h-10`），承载侧栏开关、品牌印记、唯一文件名面包屑与主导出按钮。
- 三栏各自的子工具栏统一固定 `40px`（`h-10`），确保横跨全屏的 1px 底部分割线严丝合缝。
- 底栏固定 `28px`（`h-7`），左侧报告保存状态，右侧报告与预览同源的编译诊断状态及全局快捷键。

## Elevation & Depth

界面框架本身遵循扁平分栏原则，依靠暖灰/炭墨色阶差（书脊侧栏 → 手稿编辑区 → 看版底槽）和 1px 裁切线建立空间秩序；唯独把真实的多层偏移投影赋予**校样纸张**与**悬浮诊断/对话框层**，让纸面真正“浮”在看版台上。

### Shadow Vocabulary
- **Proofing Sheet Shadow**：三层柔光向下偏移阴影，在看版底槽上塑造真实 A4 纸张厚度；暗房模式下加深环境遮蔽并辅以浅白裁切描边。
- **Floating Diagnostic Overlay**：位于预览视口顶部的半透明浮层阴影，展示错误与警告列表而不挤压下方纸面布局。
- **Modal Dialog Shadow**：仅用于帮助指南与未展开变量面板时的导出参数确认弹窗。

### Named Rules
**The Non-Displacing Alert Rule.** 编译报错与弃用警告必须以预览视口顶部的悬浮层呈现，严禁在文档流中插入静态横幅把校样纸张向下推挤导致画面跳动。

## Shapes

整体造型干脆利落，体现排印工具的几何精度：
- **校样纸张**：采用极小圆角（`2px`），忠实还原实体裁切纸张的直角边缘。
- **按钮、输入框与代码框**：采用克制的中小圆角（`6px–7px`），配合 1px 实线描边。
- **浮层卡片与弹窗**：采用温和圆角（`8px–12px`），与内部控件形成清晰的内外曲率递进。
- **空画布校样底版**：内嵌 1px 虚线套准框，呼应印刷拼版语言。

## Components

### Buttons
控件手感紧凑果断，激活态有 `1px` 微下压反馈，焦点态统一显示朱砂色外环。
- **Shape:** 克制圆角矩形（`7px` 圆角），工具栏主按钮高度 `28px`，常规按钮 `32px`。
- **Primary:** 朱砂印泥实底配暖白文字，仅用于「生成 PDF」与空工作区「载入结算单示例」。
- **Secondary / Outline / Ghost:** 暖白卡片底配 1px 裁切线描边用于「变量与 API」「新建空白模板」；幽灵按钮用于工具栏图标与次要动作。

### Chips
用于标注 `sys.inputs` 变量类型（`string`、`number`、`array`、`JSON Object`、`JSON Array`、`JSON String`）及编译诊断级别（`错误`、`警告`）。
- **Style:** 最小字号 `11px`，普通标量使用暖灰槽底配石墨字，结构化 JSON 类型与 `POST` 方法使用低透明度朱砂底配朱砂字。

### Cards / Containers
- **Variables & API Inspector:** 嵌入预览栏工具条下方的可折叠双标签抽屉（「测试变量」与「API 契约」），最大高度不超过预览视口的 `46%`，内部独立滚动。
- **Floating Diagnostics Card:** 悬浮于纸面画布上方，按「错误 → 警告」分组列出问题、中文修复提示及可点击跳转的 `行:列` 定位按钮。

### Inputs / Fields
- **Style:** `32px` 高度单行框与可纵向拉伸的等宽 JSON 文本域，1px 描边。
- **Focus & Error:** 聚焦时切换朱砂描边与柔和外环；JSON 或数值校验不合法时立即切换绯红描边并在字段下方内联提示原因，同时保持预览回退到安全默认值不断裂。

### Navigation
- **Top Breadcrumb:** 展示目录层级与当前 `.typ` 文件名，是工作区顶部的唯一文件名锚点。
- **File Tree:** 左侧目录树支持内联新建、重命名与二次确认删除；当前打开文件以暖沙色背景与朱砂文件图标高亮，未保存状态以琥珀圆点标记。
- **Image Bar:** 底部图片资产条支持内联重命名与二次确认删除；删除被引用图片时以绯红提示当前模板中的引用次数，重命名成功后自动替换源码引用。

## Do's and Don'ts

### Do:
- **Do** 在明暗两种主题下始终保持 `.bg-paper` 校样纸张为纯白底色，确保预览效果与导出 PDF 完全一致。
- **Do** 让顶栏、文件树、编辑器、预览区的工具栏高度统一锁定在 `40px`（`h-10`），维持连续贯通的水平分割线。
- **Do** 让预览区工具条与底部状态栏共享同一份编译诊断数据源，并为所有带行号的错误/警告提供点击跳转源码能力。
- **Do** 在声明或修改 `sys.inputs` 时同步更新实时预览与「API 契约」中的 cURL / JSON 示例。

### Don't:
- **Don't** 在顶栏面包屑、编辑器标题栏、状态栏中重复堆砌相同的文件名、收起侧栏按钮或保存状态圆点。
- **Don't** 使用低于 `11px` 的字号，或使用对比度低于 `4.5:1` 的浅绿、浅灰文字展示状态栏与语法高亮。
- **Don't** 把编译错误与弃用警告拼接成一行无格式纯文本，或在报错出现时将下方纸面往下推挤。
- **Don't** 在界面引导中使用已弃用的 Typst `json.decode` 写法；优先示范 Paperflow 原生支持的字典默认值语法。
