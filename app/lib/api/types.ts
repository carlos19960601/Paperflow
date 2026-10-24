export type NodeKind = "dir" | "file"

export type TypstNode = {
  id: number
  name: string
  path: string
  kind: NodeKind
}

export type TypstFile = TypstNode & {
  content: string
}