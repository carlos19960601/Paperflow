import { validSegment } from "@/lib/org/names"

export function fileStem(value: string) {
  const trimmed = value.trim()
  return trimmed.toLowerCase().endsWith(".typ")
    ? trimmed.slice(0, -4).trim()
    : trimmed
}

export function validFileStem(value: string) {
  return validSegment(fileStem(value))
}

export function joinPath(parent: string, name: string) {
  const segment = name.trim()
  return parent ? `${parent}/${segment}` : segment
}

export function parentPath(path: string) {
  const index = path.lastIndexOf("/")
  return index < 0 ? "" : path.slice(0, index)
}

export function isPathUnder(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`)
}

export function replacePathPrefix(
  path: string,
  oldPrefix: string,
  newPrefix: string
) {
  if (path === oldPrefix) {
    return newPrefix
  }
  if (path.startsWith(`${oldPrefix}/`)) {
    return newPrefix + path.slice(oldPrefix.length)
  }
  return path
}

export function initialTypst(title: string) {
  return `#set page(paper: "a4", margin: 18mm)
#set text(size: 11pt, lang: "zh")

= ${title}
`
}

export function sampleInvoiceTypst() {
  return `// 动态变量声明：可在右侧「变量与 API」面板实时调试并复制请求
#let title = sys.inputs.at("title", default: "服务结算单")
#let customer = sys.inputs.at("customer", default: "上海知行信息科技有限公司")
#let invoice_no = sys.inputs.at("invoice_no", default: "PF-2026-0108")
#let summary = sys.inputs.at("summary", default: (
  date: "2026-10-24",
  currency: "CNY",
  total: 12800,
))
#let items = sys.inputs.at("items", default: (
  (name: "PDF 排版引擎私有化部署", qty: 1, price: "8,000.00"),
  (name: "业务单据模板定制与联调", qty: 2, price: "2,400.00"),
))

#set page(paper: "a4", margin: (x: 20mm, y: 22mm))
#set text(size: 10.5pt, lang: "zh")

#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  [
    #text(size: 18pt, weight: "bold")[#title]
    #v(4pt)
    客户名称：*#customer*
  ],
  [
    单据编号：#raw(invoice_no) \\
    开具日期：#summary.date
  ],
)

#v(10pt)
#line(length: 100%, stroke: 0.6pt + luma(180))
#v(10pt)

#table(
  columns: (1fr, 56pt, 96pt),
  inset: (x: 8pt, y: 7pt),
  align: (left, center, right),
  stroke: 0.5pt + luma(200),
  [*服务项目*], [*数量*], [*小计（#summary.currency）*],
  ..items.map(row => (
    [#row.name],
    [#row.qty],
    [#row.price],
  )).flatten(),
  table.cell(colspan: 2, align: right)[*应付合计*],
  [*#summary.total 元*],
)

#v(14pt)
#text(size: 9.5pt, fill: luma(100))[
  说明：本单据由 Paperflow 根据业务系统传入的 JSON 参数动态排版生成。
]
`
}
