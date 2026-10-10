use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub template: TemplateDocument,
    #[serde(default)]
    pub variables: HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDocument {
    pub name: String,
    #[serde(default)]
    pub page: PageSettings,
    pub content: EditorDoc,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EditorDoc {
    #[serde(rename = "type", default = "default_doc_type")]
    pub kind: String,
    #[serde(default)]
    pub content: Vec<BlockNode>,
}

fn default_doc_type() -> String {
    "doc".to_owned()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSettings {
    #[serde(default = "default_page_size")]
    pub size: String,
    #[serde(default = "default_margin")]
    pub margin_mm: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default)]
    pub header: PageHeader,
    #[serde(default)]
    pub footer: PageFooter,
    #[serde(default)]
    pub background: PageBackground,
}

impl Default for PageSettings {
    fn default() -> Self {
        Self {
            size: default_page_size(),
            margin_mm: default_margin(),
            font_family: default_font_family(),
            header: PageHeader::default(),
            footer: PageFooter::default(),
            background: PageBackground::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageHeader {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub show_on_first_page: bool,
    #[serde(default)]
    pub left: String,
    #[serde(default)]
    pub center: String,
    #[serde(default)]
    pub right: String,
    #[serde(default)]
    pub logo_src: String,
}

impl Default for PageHeader {
    fn default() -> Self {
        Self {
            enabled: false,
            show_on_first_page: true,
            left: String::new(),
            center: String::new(),
            right: String::new(),
            logo_src: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFooter {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub show_on_first_page: bool,
    #[serde(default)]
    pub left: String,
    #[serde(default)]
    pub center: String,
    #[serde(default)]
    pub right: String,
}

impl Default for PageFooter {
    fn default() -> Self {
        Self {
            enabled: false,
            show_on_first_page: true,
            left: String::new(),
            center: String::new(),
            right: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageBackground {
    #[serde(default = "default_background_kind")]
    pub kind: String,
    #[serde(default = "default_background_color")]
    pub color: String,
    #[serde(default)]
    pub image_src: String,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_watermark_text")]
    pub watermark_text: String,
}

impl Default for PageBackground {
    fn default() -> Self {
        Self {
            kind: default_background_kind(),
            color: default_background_color(),
            image_src: String::new(),
            opacity: default_opacity(),
            watermark_text: default_watermark_text(),
        }
    }
}

fn default_page_size() -> String {
    "a4".to_owned()
}

fn default_margin() -> f32 {
    18.0
}

fn default_font_family() -> String {
    "sans".to_owned()
}

fn default_true() -> bool {
    true
}

fn default_background_kind() -> String {
    "none".to_owned()
}

fn default_background_color() -> String {
    "#f8fafc".to_owned()
}

fn default_opacity() -> f32 {
    0.12
}

fn default_watermark_text() -> String {
    "草稿".to_owned()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BlockNode {
    Heading {
        #[serde(default)]
        attrs: HeadingAttrs,
        #[serde(default)]
        content: Vec<InlineNode>,
    },
    Paragraph {
        #[serde(default)]
        attrs: ParagraphAttrs,
        #[serde(default)]
        content: Vec<InlineNode>,
    },
    BulletList {
        #[serde(default)]
        content: Vec<ListItemNode>,
    },
    OrderedList {
        #[serde(default)]
        content: Vec<ListItemNode>,
    },
    Table {
        #[serde(default)]
        attrs: TableAttrs,
    },
    HorizontalRule {},
    Spacer {
        #[serde(default)]
        attrs: SpacerAttrs,
    },
    PageBreak {},
    Image {
        #[serde(default)]
        attrs: ImageAttrs,
    },
    Columns {
        #[serde(default)]
        attrs: ColumnsAttrs,
        #[serde(default)]
        content: Vec<ColumnNode>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ListItemNode {
    ListItem {
        #[serde(default)]
        content: Vec<BlockNode>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ColumnNode {
    Column {
        #[serde(default)]
        content: Vec<BlockNode>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InlineNode {
    Text {
        text: String,
        #[serde(default)]
        marks: Vec<Mark>,
    },
    Variable {
        #[serde(default)]
        attrs: VariableAttrs,
    },
    HardBreak {},
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Mark {
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadingAttrs {
    #[serde(default = "default_heading_level")]
    pub level: u8,
    #[serde(default)]
    pub text_align: Option<String>,
}

impl Default for HeadingAttrs {
    fn default() -> Self {
        Self {
            level: default_heading_level(),
            text_align: None,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphAttrs {
    #[serde(default)]
    pub text_align: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableAttrs {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub fallback: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableAttrs {
    #[serde(default)]
    pub headers: Vec<String>,
    #[serde(default)]
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacerAttrs {
    #[serde(default = "default_spacer")]
    pub height_mm: f32,
}

impl Default for SpacerAttrs {
    fn default() -> Self {
        Self {
            height_mm: default_spacer(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttrs {
    #[serde(default)]
    pub src: String,
    #[serde(default = "default_image_width")]
    pub width_percent: u8,
    #[serde(default)]
    pub caption: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnsAttrs {
    #[serde(default = "default_gap")]
    pub gap_mm: f32,
    #[serde(default)]
    pub widths: Vec<f32>,
}

impl Default for ColumnsAttrs {
    fn default() -> Self {
        Self {
            gap_mm: default_gap(),
            widths: Vec::new(),
        }
    }
}

fn default_heading_level() -> u8 {
    1
}

fn default_spacer() -> f32 {
    8.0
}

fn default_image_width() -> u8 {
    100
}

fn default_gap() -> f32 {
    8.0
}
