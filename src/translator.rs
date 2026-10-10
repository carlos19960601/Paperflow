use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::Value;
use thiserror::Error;

use crate::schema::{
    BlockNode, ColumnNode, EditorDoc, InlineNode, ListItemNode, PageBackground, PageFooter,
    PageHeader, TemplateDocument,
};

const MAX_NODES: usize = 200;
const MAX_DEPTH: usize = 8;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_CHROME_SLOT: usize = 120;
const MAX_WATERMARK: usize = 24;
const CHROME_EXTRA_MM: f32 = 12.0;
const COLUMN_WRAP: &str = r#"
#let pf-col(body) = {
  set text(hyphenate: true)
  show regex("[A-Za-z0-9._@/-]{8,}"): it => it.text.clusters().intersperse(sym.zws).join()
  block(width: 100%, breakable: true, body)
}
"#;

pub struct Translation {
    pub source: String,
    pub assets: Vec<(String, Vec<u8>)>,
}

#[derive(Debug, Error)]
pub enum TranslationError {
    #[error("模板最多允许 {MAX_NODES} 个块")]
    TooManyNodes,
    #[error("模板嵌套过深")]
    TooDeep,
    #[error("仅支持 A4、A5 和 Letter 页面")]
    InvalidPageSize,
    #[error("页边距必须在 0 到 60mm 之间")]
    InvalidMargin,
    #[error("字体设置仅支持 sans、serif 和 mono")]
    InvalidFontFamily,
    #[error("页眉或页脚单栏文字不能超过 {MAX_CHROME_SLOT} 个字符")]
    InvalidChromeText,
    #[error("背景类型仅支持 none、color、image 和 watermark")]
    InvalidBackgroundKind,
    #[error("背景颜色必须是 #RRGGBB")]
    InvalidBackgroundColor,
    #[error("背景不透明度必须在 0 到 1 之间")]
    InvalidOpacity,
    #[error("水印文字不能超过 {MAX_WATERMARK} 个字符")]
    InvalidWatermark,
    #[error("标题级别必须在 1 到 6 之间")]
    InvalidHeadingLevel,
    #[error("表格必须有表头，且每行列数需要与表头一致")]
    InvalidTable,
    #[error("分栏需要 2 到 3 列")]
    InvalidColumns,
    #[error("图片仅支持 PNG、JPEG、GIF 或 SVG 的 data URL")]
    InvalidImage,
    #[error("单张图片不能超过 5MB")]
    ImageTooLarge,
}

struct EmitContext<'a> {
    variables: &'a HashMap<String, Value>,
    assets: &'a mut Vec<(String, Vec<u8>)>,
}

pub fn translate(
    template: &TemplateDocument,
    variables: &HashMap<String, Value>,
    resolved_font_family: &str,
) -> Result<Translation, TranslationError> {
    validate(template)?;

    let mut assets = Vec::new();
    let mut context = EmitContext {
        variables,
        assets: &mut assets,
    };
    let mut source = emit_page_prelude(template, resolved_font_family, &mut context)?;
    source.push_str(&emit_blocks(&template.content.content, &mut context, 0)?);

    Ok(Translation { source, assets })
}

fn validate(template: &TemplateDocument) -> Result<(), TranslationError> {
    if count_nodes(&template.content) > MAX_NODES {
        return Err(TranslationError::TooManyNodes);
    }
    if !matches!(
        template.page.size.to_ascii_lowercase().as_str(),
        "a4" | "a5" | "us-letter"
    ) {
        return Err(TranslationError::InvalidPageSize);
    }
    if !(0.0..=60.0).contains(&template.page.margin_mm) {
        return Err(TranslationError::InvalidMargin);
    }
    if !matches!(
        template.page.font_family.as_str(),
        "sans" | "serif" | "mono"
    ) {
        return Err(TranslationError::InvalidFontFamily);
    }
    validate_chrome(&template.page.header.left, &template.page.header.center, &template.page.header.right)?;
    validate_chrome(&template.page.footer.left, &template.page.footer.center, &template.page.footer.right)?;
    if !template.page.header.logo_src.is_empty() {
        decode_image(&template.page.header.logo_src)?;
    }
    validate_background(&template.page.background)?;
    validate_blocks(&template.content.content, 0)
}

fn validate_chrome(left: &str, center: &str, right: &str) -> Result<(), TranslationError> {
    for slot in [left, center, right] {
        if slot.chars().count() > MAX_CHROME_SLOT {
            return Err(TranslationError::InvalidChromeText);
        }
    }
    Ok(())
}

fn validate_background(background: &PageBackground) -> Result<(), TranslationError> {
    if !(0.0..=1.0).contains(&background.opacity) {
        return Err(TranslationError::InvalidOpacity);
    }
    match background.kind.as_str() {
        "none" => Ok(()),
        "color" => {
            normalize_hex(&background.color)?;
            Ok(())
        }
        "image" => {
            if !background.image_src.is_empty() {
                decode_image(&background.image_src)?;
            }
            Ok(())
        }
        "watermark" => {
            if background.watermark_text.chars().count() > MAX_WATERMARK {
                return Err(TranslationError::InvalidWatermark);
            }
            Ok(())
        }
        _ => Err(TranslationError::InvalidBackgroundKind),
    }
}

fn validate_blocks(blocks: &[BlockNode], depth: usize) -> Result<(), TranslationError> {
    if depth > MAX_DEPTH {
        return Err(TranslationError::TooDeep);
    }
    for node in blocks {
        match node {
            BlockNode::Heading { attrs, .. } if !(1..=6).contains(&attrs.level) => {
                return Err(TranslationError::InvalidHeadingLevel);
            }
            BlockNode::Table { attrs } => {
                if attrs.headers.is_empty()
                    || attrs
                        .rows
                        .iter()
                        .any(|row| row.len() != attrs.headers.len())
                {
                    return Err(TranslationError::InvalidTable);
                }
            }
            BlockNode::Columns { content, .. } => {
                if !(2..=3).contains(&content.len()) {
                    return Err(TranslationError::InvalidColumns);
                }
                for ColumnNode::Column {
                    content: column_content,
                } in content
                {
                    validate_blocks(column_content, depth + 1)?;
                }
            }
            BlockNode::BulletList { content } | BlockNode::OrderedList { content } => {
                for ListItemNode::ListItem {
                    content: item_content,
                } in content
                {
                    validate_blocks(item_content, depth + 1)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn count_nodes(doc: &EditorDoc) -> usize {
    count_blocks(&doc.content)
}

fn count_blocks(blocks: &[BlockNode]) -> usize {
    blocks
        .iter()
        .map(|node| match node {
            BlockNode::Columns { content, .. } => {
                1 + content
                    .iter()
                    .map(|ColumnNode::Column { content }| count_blocks(content))
                    .sum::<usize>()
            }
            BlockNode::BulletList { content } | BlockNode::OrderedList { content } => {
                1 + content
                    .iter()
                    .map(|ListItemNode::ListItem { content }| count_blocks(content))
                    .sum::<usize>()
            }
            _ => 1,
        })
        .sum()
}

fn emit_page_prelude(
    template: &TemplateDocument,
    resolved_font_family: &str,
    context: &mut EmitContext<'_>,
) -> Result<String, TranslationError> {
    let paper = template.page.size.to_ascii_lowercase();
    let margin = template.page.margin_mm;
    let top = if template.page.header.enabled {
        margin + CHROME_EXTRA_MM
    } else {
        margin
    };
    let bottom = if template.page.footer.enabled {
        margin + CHROME_EXTRA_MM
    } else {
        margin
    };

    let mut args = vec![
        format!("paper: {}", string_literal(&paper)),
        format!("margin: (x: {margin}mm, top: {top}mm, bottom: {bottom}mm)"),
    ];

    if template.page.background.kind == "color" {
        let hex = normalize_hex(&template.page.background.color)?;
        args.push(format!("fill: rgb({})", string_literal(&hex)));
    }

    if template.page.header.enabled {
        args.push(format!(
            "header: {}",
            emit_header(&template.page.header, context)?
        ));
    }

    if template.page.footer.enabled {
        args.push(format!(
            "footer: {}",
            emit_footer(&template.page.footer, context.variables)
        ));
    }

    if let Some(background) = emit_background(&template.page.background, context)? {
        args.push(format!("background: {background}"));
    }

    Ok(format!(
        "#set page(\n  {},\n)\n#set text(font: {}, size: 10.5pt)\n#set par(leading: 0.72em)\n{COLUMN_WRAP}\n",
        args.join(",\n  "),
        string_literal(resolved_font_family)
    ))
}

fn emit_header(
    header: &PageHeader,
    context: &mut EmitContext<'_>,
) -> Result<String, TranslationError> {
    let logo = if header.logo_src.is_empty() {
        None
    } else {
        let (extension, bytes) = decode_image(&header.logo_src)?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(TranslationError::ImageTooLarge);
        }
        let path = format!("assets/header-logo-{}.{extension}", context.assets.len());
        context.assets.push((path.clone(), bytes));
        Some(path)
    };
    Ok(wrap_chrome(
        header.show_on_first_page,
        emit_chrome_grid(
            &header.left,
            &header.center,
            &header.right,
            logo.as_deref(),
            context.variables,
        ),
    ))
}

fn emit_footer(footer: &PageFooter, variables: &HashMap<String, Value>) -> String {
    wrap_chrome(
        footer.show_on_first_page,
        emit_chrome_grid(
            &footer.left,
            &footer.center,
            &footer.right,
            None,
            variables,
        ),
    )
}

fn wrap_chrome(show_on_first_page: bool, grid: String) -> String {
    if show_on_first_page {
        format!("[\n    #set text(size: 8.5pt, fill: rgb(\"64748b\"))\n    {grid}\n  ]")
    } else {
        format!(
            "context {{\n    if counter(page).get().first() == 1 {{ none }} else [\n      #set text(size: 8.5pt, fill: rgb(\"64748b\"))\n      {grid}\n    ]\n  }}"
        )
    }
}

fn emit_chrome_grid(
    left: &str,
    center: &str,
    right: &str,
    logo_path: Option<&str>,
    variables: &HashMap<String, Value>,
) -> String {
    let left_slot = emit_chrome_slot(left, variables);
    let center_slot = emit_chrome_slot(center, variables);
    let right_slot = emit_chrome_slot(right, variables);
    if let Some(path) = logo_path {
        format!(
            "#grid(\n      columns: (auto, 1fr, 1fr, 1fr),\n      column-gutter: 8pt,\n      align: (horizon + left, horizon + left, horizon + center, horizon + right),\n      image({}, height: 7mm),\n      [{left_slot}],\n      [{center_slot}],\n      [{right_slot}],\n    )",
            string_literal(path)
        )
    } else {
        format!(
            "#grid(\n      columns: (1fr, 1fr, 1fr),\n      column-gutter: 8pt,\n      align: (horizon + left, horizon + center, horizon + right),\n      [{left_slot}],\n      [{center_slot}],\n      [{right_slot}],\n    )"
        )
    }
}

fn emit_chrome_slot(text: &str, variables: &HashMap<String, Value>) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        let before = &rest[..start];
        if !before.is_empty() {
            out.push('#');
            out.push_str(&text_expr(before));
        }
        let after = &rest[start + 2..];
        if let Some(end) = after.find("}}") {
            let key = after[..end].trim();
            match key {
                "page" => out.push_str("#context counter(page).display()"),
                "pages" => out.push_str("#context [#counter(page).final().first()]"),
                other => {
                    let value = variables
                        .get(other)
                        .map(display_value)
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| format!("{{{{{other}}}}}"));
                    out.push('#');
                    out.push_str(&text_expr(&value));
                }
            }
            rest = &after[end + 2..];
        } else {
            out.push('#');
            out.push_str(&text_expr(&rest[start..]));
            rest = "";
        }
    }
    if !rest.is_empty() {
        out.push('#');
        out.push_str(&text_expr(rest));
    }
    out
}

fn emit_background(
    background: &PageBackground,
    context: &mut EmitContext<'_>,
) -> Result<Option<String>, TranslationError> {
    match background.kind.as_str() {
        "image" if !background.image_src.is_empty() => {
            let (extension, bytes) = decode_image(&background.image_src)?;
            if bytes.len() > MAX_IMAGE_BYTES {
                return Err(TranslationError::ImageTooLarge);
            }
            let path = format!("assets/page-bg-{}.{extension}", context.assets.len());
            context.assets.push((path.clone(), bytes));
            let fade = ((1.0 - background.opacity.clamp(0.0, 1.0)) * 100.0).clamp(0.0, 100.0);
            Ok(Some(format!(
                "[\n    #place(center + horizon, image({}, width: 100%, height: 100%))\n    #place(center + horizon, rect(width: 100%, height: 100%, fill: rgb(255, 255, 255, {fade:.1}%)))\n  ]",
                string_literal(&path)
            )))
        }
        "watermark" => {
            let text = background.watermark_text.trim();
            let text = if text.is_empty() { "草稿" } else { text };
            let fade = ((1.0 - background.opacity.clamp(0.0, 1.0)) * 100.0).clamp(0.0, 100.0);
            Ok(Some(format!(
                "[\n    #place(center + horizon, rotate(-30deg, text(size: 64pt, fill: rgb(\"000000\").transparentize({fade:.1}%), {})))\n  ]",
                string_literal(text)
            )))
        }
        _ => Ok(None),
    }
}

fn normalize_hex(color: &str) -> Result<String, TranslationError> {
    let trimmed = color.trim();
    let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
    if hex.len() == 6 && hex.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(hex.to_ascii_lowercase())
    } else {
        Err(TranslationError::InvalidBackgroundColor)
    }
}

fn emit_blocks(
    blocks: &[BlockNode],
    context: &mut EmitContext<'_>,
    depth: usize,
) -> Result<String, TranslationError> {
    if depth > MAX_DEPTH {
        return Err(TranslationError::TooDeep);
    }
    let mut parts = Vec::new();
    for node in blocks {
        let block = emit_block(node, context, depth)?;
        if !block.is_empty() {
            parts.push(block);
        }
    }
    Ok(parts.join("\n\n"))
}

fn emit_block(
    node: &BlockNode,
    context: &mut EmitContext<'_>,
    depth: usize,
) -> Result<String, TranslationError> {
    Ok(match node {
        BlockNode::Heading { attrs, content } => {
            let heading = format!(
                "#heading(level: {})[{}]",
                attrs.level,
                emit_inlines(content, context.variables)
            );
            with_align(attrs.text_align.as_deref(), heading)
        }
        BlockNode::Paragraph { attrs, content } => {
            let body = emit_inlines(content, context.variables);
            if body.is_empty() {
                String::new()
            } else {
                with_align(attrs.text_align.as_deref(), body)
            }
        }
        BlockNode::BulletList { content } => {
            emit_list(content, false, context, depth + 1)?
        }
        BlockNode::OrderedList { content } => {
            emit_list(content, true, context, depth + 1)?
        }
        BlockNode::Table { attrs } => table_expr(&attrs.headers, &attrs.rows),
        BlockNode::HorizontalRule {} => {
            "#line(length: 100%, stroke: 0.6pt + rgb(\"cbd5e1\"))".into()
        }
        BlockNode::Spacer { attrs } => {
            format!("#v({}mm)", attrs.height_mm.clamp(0.0, 100.0))
        }
        BlockNode::PageBreak {} => "#pagebreak()".into(),
        BlockNode::Image { attrs } => emit_image(attrs, context)?,
        BlockNode::Columns { attrs, content } => {
            let fr = column_tracks(content.len(), &attrs.widths);
            let mut cells = Vec::new();
            for ColumnNode::Column {
                content: column_content,
            } in content
            {
                cells.push(format!(
                    "pf-col[{}]",
                    emit_blocks(column_content, context, depth + 1)?
                ));
            }
            format!(
                "#grid(\n  columns: ({fr}),\n  column-gutter: {}mm,\n  align: top,\n  {}\n)",
                attrs.gap_mm.clamp(0.0, 40.0),
                cells.join(",\n  ")
            )
        }
    })
}

fn emit_list(
    items: &[ListItemNode],
    ordered: bool,
    context: &mut EmitContext<'_>,
    depth: usize,
) -> Result<String, TranslationError> {
    let mut rendered = Vec::new();
    for ListItemNode::ListItem { content } in items {
        rendered.push(format!("[{}]", emit_blocks(content, context, depth)?));
    }
    if rendered.is_empty() {
        return Ok(String::new());
    }
    let function = if ordered { "enum" } else { "list" };
    Ok(format!("#{function}{}", rendered.join("")))
}

fn column_tracks(count: usize, widths: &[f32]) -> String {
    if widths.len() == count && widths.iter().all(|width| *width > 0.0) {
        return widths
            .iter()
            .map(|width| format!("{}fr", width))
            .collect::<Vec<_>>()
            .join(", ");
    }
    vec!["1fr"; count].join(", ")
}

fn emit_image(
    attrs: &crate::schema::ImageAttrs,
    context: &mut EmitContext<'_>,
) -> Result<String, TranslationError> {
    if attrs.src.is_empty() {
        return Ok("// 图片尚未上传".into());
    }
    let (extension, bytes) = decode_image(&attrs.src)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(TranslationError::ImageTooLarge);
    }
    let path = format!("assets/image-{}.{extension}", context.assets.len());
    context.assets.push((path.clone(), bytes));
    let width = attrs.width_percent.clamp(5, 100);
    let image = format!(
        "#align(center, image({}, width: {}%))",
        string_literal(&path),
        width
    );
    if attrs.caption.is_empty() {
        Ok(image)
    } else {
        Ok(format!(
            "{image}\n#align(center, text(size: 8pt, fill: rgb(\"64748b\"), {}))",
            string_literal(&attrs.caption)
        ))
    }
}

fn emit_inlines(inlines: &[InlineNode], variables: &HashMap<String, Value>) -> String {
    let mut out = String::new();
    for inline in inlines {
        match inline {
            InlineNode::Text { text, marks } => {
                let mut expr = format!("text({})", string_literal(text));
                if marks.iter().any(|mark| mark.kind == "italic") {
                    expr = format!("emph({expr})");
                }
                if marks.iter().any(|mark| mark.kind == "bold") {
                    expr = format!("strong({expr})");
                }
                out.push('#');
                out.push_str(&expr);
            }
            InlineNode::Variable { attrs } => {
                let value = variables
                    .get(&attrs.key)
                    .map(display_value)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| attrs.fallback.clone());
                out.push('#');
                out.push_str(&format!("text({})", string_literal(&value)));
            }
            InlineNode::HardBreak {} => out.push_str("#linebreak()"),
        }
    }
    out
}

fn with_align(align: Option<&str>, body: String) -> String {
    match align {
        Some("center") => format!("#align(center)[{body}]"),
        Some("right") => format!("#align(right)[{body}]"),
        _ => body,
    }
}

fn table_expr(headers: &[String], rows: &[Vec<String>]) -> String {
    let cells = headers
        .iter()
        .map(|cell| format!("strong({})", text_expr(cell)))
        .chain(rows.iter().flatten().map(|cell| text_expr(cell)))
        .collect::<Vec<_>>()
        .join(",\n  ");
    format!(
        "#table(\n  columns: {},\n  stroke: 0.5pt + rgb(\"cbd5e1\"),\n  inset: 6pt,\n  fill: (x, y) => if y == 0 {{ rgb(\"f1f5f9\") }},\n  {}\n)",
        headers.len(),
        cells
    )
}

fn decode_image(src: &str) -> Result<(&'static str, Vec<u8>), TranslationError> {
    let (metadata, encoded) = src.split_once(',').ok_or(TranslationError::InvalidImage)?;
    let extension = match metadata {
        "data:image/png;base64" => "png",
        "data:image/jpeg;base64" => "jpg",
        "data:image/gif;base64" => "gif",
        "data:image/svg+xml;base64" => "svg",
        _ => return Err(TranslationError::InvalidImage),
    };
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| TranslationError::InvalidImage)?;
    Ok((extension, bytes))
}

fn text_expr(value: &str) -> String {
    format!("text({})", string_literal(value))
}

fn string_literal(value: &str) -> String {
    serde_json::to_string(value).expect("serializing a string cannot fail")
}

fn display_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{
        EditorDoc, InlineNode, PageSettings, TemplateDocument, VariableAttrs,
    };

    #[test]
    fn escapes_variable_values_as_typst_strings() {
        let template = TemplateDocument {
            name: "test".into(),
            page: PageSettings::default(),
            content: EditorDoc {
                kind: "doc".into(),
                content: vec![BlockNode::Paragraph {
                    attrs: Default::default(),
                    content: vec![InlineNode::Variable {
                        attrs: VariableAttrs {
                            key: "customer".into(),
                            fallback: String::new(),
                        },
                    }],
                }],
            },
        };
        let variables =
            HashMap::from([("customer".into(), Value::String("ACME \"#panic()\"".into()))]);

        let result = translate(&template, &variables, "Hiragino Sans GB").unwrap();

        assert!(result.source.contains(r##"text("ACME \"#panic()\"")"##));
    }

    #[test]
    fn emits_bold_markup_and_columns() {
        let template = TemplateDocument {
            name: "test".into(),
            page: PageSettings::default(),
            content: EditorDoc {
                kind: "doc".into(),
                content: vec![
                    BlockNode::Paragraph {
                        attrs: Default::default(),
                        content: vec![InlineNode::Text {
                            text: "Hello".into(),
                            marks: vec![crate::schema::Mark {
                                kind: "bold".into(),
                            }],
                        }],
                    },
                    BlockNode::Columns {
                        attrs: Default::default(),
                        content: vec![
                            ColumnNode::Column {
                                content: vec![BlockNode::Paragraph {
                                    attrs: Default::default(),
                                    content: vec![InlineNode::Text {
                                        text: "左".into(),
                                        marks: vec![],
                                    }],
                                }],
                            },
                            ColumnNode::Column {
                                content: vec![BlockNode::Paragraph {
                                    attrs: Default::default(),
                                    content: vec![InlineNode::Text {
                                        text: "右".into(),
                                        marks: vec![],
                                    }],
                                }],
                            },
                        ],
                    },
                ],
            },
        };

        let result = translate(&template, &HashMap::new(), "Hiragino Sans GB").unwrap();
        assert!(result.source.contains(r#"#strong(text("Hello"))"#));
        assert!(result.source.contains("#grid("));
        assert!(result.source.contains("columns: (1fr, 1fr)"));
        assert!(result.source.contains("pf-col["));
        assert!(result.source.contains(r#"#text("左")"#));
    }

    #[test]
    fn emits_custom_column_widths() {
        let template = TemplateDocument {
            name: "test".into(),
            page: PageSettings::default(),
            content: EditorDoc {
                kind: "doc".into(),
                content: vec![BlockNode::Columns {
                    attrs: crate::schema::ColumnsAttrs {
                        gap_mm: 8.0,
                        widths: vec![70.0, 30.0],
                    },
                    content: vec![
                        ColumnNode::Column {
                            content: vec![BlockNode::Paragraph {
                                attrs: Default::default(),
                                content: vec![InlineNode::Text {
                                    text: "宽".into(),
                                    marks: vec![],
                                }],
                            }],
                        },
                        ColumnNode::Column {
                            content: vec![BlockNode::Paragraph {
                                attrs: Default::default(),
                                content: vec![InlineNode::Text {
                                    text: "窄".into(),
                                    marks: vec![],
                                }],
                            }],
                        },
                    ],
                }],
            },
        };

        let result = translate(&template, &HashMap::new(), "Hiragino Sans GB").unwrap();
        assert!(result.source.contains("columns: (70fr, 30fr)"));
        assert!(result.source.contains("align: top"));
        assert!(result.source.contains("pf-col["));
    }

    #[test]
    fn deserializes_editor_json_column_widths() {
        let json = r#"{
            "name": "test",
            "page": { "size": "a4", "marginMm": 18, "fontFamily": "sans" },
            "content": {
                "type": "doc",
                "content": [{
                    "type": "columns",
                    "attrs": { "gapMm": 8, "widths": [66.5, 33.5] },
                    "content": [
                        { "type": "column", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "L" }] }] },
                        { "type": "column", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "R" }] }] }
                    ]
                }]
            }
        }"#;
        let template: TemplateDocument = serde_json::from_str(json).unwrap();
        let result = translate(&template, &HashMap::new(), "Hiragino Sans GB").unwrap();
        assert!(result.source.contains("columns: (66.5fr, 33.5fr)"));
    }

    fn empty_template(page: PageSettings) -> TemplateDocument {
        TemplateDocument {
            name: "test".into(),
            page,
            content: EditorDoc {
                kind: "doc".into(),
                content: vec![BlockNode::Paragraph {
                    attrs: Default::default(),
                    content: vec![InlineNode::Text {
                        text: "正文".into(),
                        marks: vec![],
                    }],
                }],
            },
        }
    }

    #[test]
    fn emits_footer_page_tokens_and_escaped_text() {
        let mut page = PageSettings::default();
        page.footer.enabled = true;
        page.footer.center = "第 {{page}} / {{pages}} 页".into();
        page.footer.right = r#"机密 "文件""#.into();

        let result = translate(&empty_template(page), &HashMap::new(), "Hiragino Sans GB").unwrap();
        assert!(result.source.contains("margin: (x: 18mm, top: 18mm, bottom: 30mm)"));
        assert!(result.source.contains("footer:"));
        assert!(result.source.contains(r#"#text("第 ")"#));
        assert!(result.source.contains("#context counter(page).display()"));
        assert!(result.source.contains("#context [#counter(page).final().first()]"));
        assert!(result.source.contains(r##"text("机密 \"文件\"")"##));
    }

    #[test]
    fn hides_header_on_first_page_and_resolves_variables() {
        let mut page = PageSettings::default();
        page.header.enabled = true;
        page.header.show_on_first_page = false;
        page.header.left = "{{customer}}".into();

        let variables =
            HashMap::from([("customer".into(), Value::String("ACME \"#panic()\"".into()))]);
        let result = translate(&empty_template(page), &variables, "Hiragino Sans GB").unwrap();
        assert!(result.source.contains("margin: (x: 18mm, top: 30mm, bottom: 18mm)"));
        assert!(result.source.contains("if counter(page).get().first() == 1 { none }"));
        assert!(result.source.contains(r##"text("ACME \"#panic()\"")"##));
    }

    #[test]
    fn emits_color_fill_and_watermark() {
        let mut page = PageSettings::default();
        page.background.kind = "color".into();
        page.background.color = "#F8FAFC".into();

        let color = translate(&empty_template(page.clone()), &HashMap::new(), "Hiragino Sans GB")
            .unwrap();
        assert!(color.source.contains(r#"fill: rgb("f8fafc")"#));

        page.background.kind = "watermark".into();
        page.background.watermark_text = "草稿".into();
        page.background.opacity = 0.12;
        let watermark =
            translate(&empty_template(page), &HashMap::new(), "Hiragino Sans GB").unwrap();
        assert!(watermark.source.contains("rotate(-30deg"));
        assert!(watermark.source.contains("\"草稿\""));
        assert!(watermark.source.contains("transparentize(88.0%)"));
    }

    #[test]
    fn rejects_invalid_background_color() {
        let mut page = PageSettings::default();
        page.background.kind = "color".into();
        page.background.color = "blue".into();

        let error = translate(&empty_template(page), &HashMap::new(), "Hiragino Sans GB")
            .err()
            .expect("invalid color");
        assert!(matches!(error, TranslationError::InvalidBackgroundColor));
    }

    #[test]
    fn rejects_oversized_chrome_slot() {
        let mut page = PageSettings::default();
        page.footer.enabled = true;
        page.footer.center = "x".repeat(121);

        let error = translate(&empty_template(page), &HashMap::new(), "Hiragino Sans GB")
            .err()
            .expect("oversized chrome");
        assert!(matches!(error, TranslationError::InvalidChromeText));
    }
}
