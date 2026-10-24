import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { typstTags } from "codemirror-lang-typst/lezer"

export const typstHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, class: "typst-comment" },
    { tag: tags.heading, class: "typst-heading" },
    { tag: tags.keyword, class: "typst-keyword" },
    { tag: tags.null, class: "typst-keyword" },
    { tag: tags.atom, class: "typst-keyword" },
    { tag: tags.bool, class: "typst-keyword" },
    { tag: tags.number, class: "typst-number" },
    { tag: tags.string, class: "typst-string" },
    { tag: tags.function(tags.variableName), class: "typst-function" },
    { tag: tags.propertyName, class: "typst-marker" },
    { tag: typstTags.interpolated, class: "typst-marker" },
    { tag: typstTags.listMarker, class: "typst-marker" },
    { tag: typstTags.mathDelimiter, class: "typst-math" },
    { tag: tags.escape, class: "typst-escape" },
    { tag: tags.labelName, class: "typst-escape" },
    { tag: tags.monospace, class: "typst-raw" },
    { tag: tags.link, class: "typst-link" },
    { tag: tags.operator, class: "typst-operator" },
    { tag: tags.strong, class: "typst-strong" },
    { tag: tags.emphasis, class: "typst-emph" },
    { tag: tags.invalid, class: "typst-invalid" },
  ])
)