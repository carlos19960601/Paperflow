<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 编辑器组件选择与删除

- 所有插入的组件（分栏、表格、图片、分隔线、空白、分页、变量等）点击外壳即可选中整个组件。
- 选中后按 Delete / Backspace，或用工具栏删除按钮，移除整个组件。
- 插入组件后应处于整组件选中状态，便于立刻删除。
- 内部可编辑的组件（分栏正文、表格单元格、图片说明等）：点击内容编辑区域只进入编辑，不选中整个组件。
- 只有点击边框、标题条、非编辑区域时才选中整个组件。

