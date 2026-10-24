//! 把请求里的 JSON 变量转成 Typst `sys.inputs`。
//!
//! 字符串、数字、布尔、`null`、对象和数组都会变成对应的 Typst 值。
//! 源码默认值是纯数字时，数字字符串也会写成数字，而不是字符串。

use std::collections::{HashMap, HashSet};

use serde_json::Value as Json;
use typst::foundations::{Array, Dict, Value};

const MAX_DEPTH: usize = 32;

pub fn params_to_dict(content: &str, params: &HashMap<String, Json>) -> Result<Dict, String> {
    let numbers = numeric_input_names(content);
    let mut dict = Dict::new();
    for (key, value) in params {
        if key.is_empty() {
            return Err("变量名不能为空".into());
        }
        let typst_value = json_to_value(value, numbers.contains(key), true, 0)?;
        dict.insert(key.as_str().into(), typst_value);
    }
    Ok(dict)
}

fn json_to_value(
    value: &Json,
    coerce_number: bool,
    top_level: bool,
    depth: usize,
) -> Result<Value, String> {
    if depth > MAX_DEPTH {
        return Err("变量嵌套过深".into());
    }
    match value {
        Json::Null => Ok(if top_level {
            Value::Str(String::new().into())
        } else {
            Value::None
        }),
        Json::Bool(flag) => Ok(Value::Bool(*flag)),
        Json::Number(number) => Ok(number_value(number)),
        Json::String(text) => {
            if coerce_number && let Some(number) = typst_number_value(text) {
                return Ok(number);
            }
            Ok(Value::Str(text.clone().into()))
        }
        Json::Array(items) => {
            let mut array = Array::with_capacity(items.len());
            for item in items {
                array.push(json_to_value(item, false, false, depth + 1)?);
            }
            Ok(Value::Array(array))
        }
        Json::Object(map) => {
            let mut dict = Dict::new();
            for (key, item) in map {
                dict.insert(
                    key.as_str().into(),
                    json_to_value(item, false, false, depth + 1)?,
                );
            }
            Ok(Value::Dict(dict))
        }
    }
}

fn number_value(number: &serde_json::Number) -> Value {
    if let Some(int) = number.as_i64() {
        return Value::Int(int);
    }
    if let Some(uint) = number.as_u64()
        && let Ok(int) = i64::try_from(uint)
    {
        return Value::Int(int);
    }
    Value::Float(number.as_f64().unwrap_or(f64::NAN))
}

/// 源码里 `default:` 是纯数字字面量的变量名。
fn numeric_input_names(content: &str) -> HashSet<String> {
    let mut names = HashSet::new();
    let bytes = content.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'/') {
            match content[index + 2..].find('\n') {
                Some(next) => index = index + 2 + next + 1,
                None => break,
            }
            continue;
        }
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            match content[index + 2..].find("*/") {
                Some(next) => index = index + 2 + next + 2,
                None => break,
            }
            continue;
        }
        if bytes[index] == b'"' {
            let end = skip_string(content, index);
            index = if end > index { end } else { index + 1 };
            continue;
        }
        if bytes[index] == b'`' {
            let end = skip_raw(content, index);
            index = if end > index { end } else { index + 1 };
            continue;
        }
        if let Some(open) = match_inputs_at(content, index)
            && let Some((name, _end)) = parse_inputs_at(content, open)
        {
            if !name.is_empty()
                && !names.contains(&name)
                && input_default_is_number(content, open)
            {
                names.insert(name);
            }
            index = open + 1;
            continue;
        }
        index = advance(content, index);
    }
    names
}

fn input_default_is_number(content: &str, open: usize) -> bool {
    let Some((raw, _)) = split_args(content, open) else {
        return false;
    };
    for arg in raw {
        if let Some((name, value)) = split_named(&arg)
            && name == "default"
        {
            return is_number_literal(value);
        }
    }
    false
}

fn is_number_literal(value: &str) -> bool {
    let start = skip_trivia(value, 0);
    let Some(end) = scan_number(value, start) else {
        return false;
    };
    skip_trivia(value, end) == value.len()
}

fn typst_number_value(text: &str) -> Option<Value> {
    let text = text.trim().strip_prefix('+').unwrap_or(text.trim());
    if text.is_empty() || text == "-" || text == "." || text == "-." {
        return None;
    }
    let end = scan_number(text, 0)?;
    if end != text.len() {
        return None;
    }
    if text.contains(['.', 'e', 'E']) {
        let number: f64 = text.parse().ok()?;
        number.is_finite().then_some(Value::Float(number))
    } else {
        text.parse::<i64>().ok().map(Value::Int)
    }
}

fn scan_number(text: &str, index: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    if index >= bytes.len() {
        return None;
    }
    let mut cursor = index;
    if bytes[cursor] == b'+' || bytes[cursor] == b'-' {
        cursor += 1;
    }
    if cursor >= bytes.len() {
        return None;
    }
    let mut saw_digit = false;
    if bytes[cursor] == b'.' {
        cursor += 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            saw_digit = true;
            cursor += 1;
        }
    } else if bytes[cursor].is_ascii_digit() {
        saw_digit = true;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            cursor += 1;
        }
        if cursor < bytes.len() && bytes[cursor] == b'.' {
            cursor += 1;
            while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                cursor += 1;
            }
        }
    }
    if !saw_digit {
        return None;
    }
    if cursor < bytes.len() && (bytes[cursor] == b'e' || bytes[cursor] == b'E') {
        let mut exp = cursor + 1;
        if exp < bytes.len() && (bytes[exp] == b'+' || bytes[exp] == b'-') {
            exp += 1;
        }
        if exp >= bytes.len() || !bytes[exp].is_ascii_digit() {
            return None;
        }
        cursor = exp + 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            cursor += 1;
        }
    }
    Some(cursor)
}

fn match_inputs_at(source: &str, start: usize) -> Option<usize> {
    if prev_is_ident(source, start) {
        return None;
    }
    let mut cursor = match_word(source, start, "sys")?;
    cursor = skip_space(source, cursor);
    if source.as_bytes().get(cursor) != Some(&b'.') {
        return None;
    }
    cursor = skip_space(source, cursor + 1);
    cursor = match_word(source, cursor, "inputs")?;
    cursor = skip_space(source, cursor);
    if source.as_bytes().get(cursor) != Some(&b'.') {
        return None;
    }
    cursor = skip_space(source, cursor + 1);
    cursor = match_word(source, cursor, "at")?;
    if let Some(ch) = source[cursor..].chars().next()
        && is_ident_char(ch)
    {
        return None;
    }
    cursor = skip_space(source, cursor);
    if source.as_bytes().get(cursor) == Some(&b'(') {
        Some(cursor)
    } else {
        None
    }
}

fn match_word(source: &str, start: usize, word: &str) -> Option<usize> {
    let end = start.checked_add(word.len())?;
    (source.get(start..end) == Some(word)).then_some(end)
}

fn parse_inputs_at(source: &str, open: usize) -> Option<(String, usize)> {
    let (raw, end) = split_args(source, open)?;
    let mut name = String::new();
    for arg in raw {
        if split_named(&arg).is_some() {
            continue;
        }
        if name.is_empty()
            && let Some(key) = read_string_literal(&arg)
        {
            name = key;
        }
    }
    Some((name, end))
}

fn split_args(source: &str, open: usize) -> Option<(Vec<String>, usize)> {
    if source.as_bytes().get(open) != Some(&b'(') {
        return None;
    }
    let bytes = source.as_bytes();
    let mut raw = Vec::new();
    let mut depth = 1;
    let mut cursor = open + 1;
    let mut part_start = cursor;
    while cursor < bytes.len() {
        if bytes[cursor] == b'"' {
            let next = skip_string(source, cursor);
            if next <= cursor {
                return None;
            }
            cursor = next;
            continue;
        }
        if bytes[cursor] == b'`' {
            let next = skip_raw(source, cursor);
            if next <= cursor {
                return None;
            }
            cursor = next;
            continue;
        }
        if bytes[cursor] == b'/' && bytes.get(cursor + 1) == Some(&b'/') {
            cursor = match source[cursor + 2..].find('\n') {
                Some(next) => cursor + 2 + next + 1,
                None => source.len(),
            };
            continue;
        }
        if bytes[cursor] == b'/' && bytes.get(cursor + 1) == Some(&b'*') {
            let next = source[cursor + 2..].find("*/")?;
            cursor = cursor + 2 + next + 2;
            continue;
        }
        match bytes[cursor] {
            b'(' | b'[' | b'{' => {
                depth += 1;
                cursor += 1;
                continue;
            }
            b')' | b']' | b'}' => {
                depth -= 1;
                if depth == 0 && bytes[cursor] == b')' {
                    push_arg(&mut raw, &source[part_start..cursor]);
                    return Some((raw, cursor + 1));
                }
                if depth < 0 {
                    return None;
                }
                cursor += 1;
                continue;
            }
            b',' if depth == 1 => {
                push_arg(&mut raw, &source[part_start..cursor]);
                cursor += 1;
                part_start = cursor;
                continue;
            }
            _ => {}
        }
        cursor = advance(source, cursor);
    }
    None
}

fn push_arg(raw: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        raw.push(trimmed.to_owned());
    }
}

fn split_named(arg: &str) -> Option<(&str, &str)> {
    let start = skip_trivia(arg, 0);
    let (ident, end) = read_ident(arg, start)?;
    let colon = skip_trivia(arg, end);
    if arg.as_bytes().get(colon) != Some(&b':') {
        return None;
    }
    Some((ident, arg[colon + 1..].trim()))
}

fn read_string_literal(arg: &str) -> Option<String> {
    let start = skip_trivia(arg, 0);
    if arg.as_bytes().get(start) != Some(&b'"') {
        return None;
    }
    let (value, end) = decode_string(arg, start)?;
    (skip_trivia(arg, end) == arg.len()).then_some(value)
}

fn decode_string(source: &str, start: usize) -> Option<(String, usize)> {
    let bytes = source.as_bytes();
    if bytes.get(start) != Some(&b'"') {
        return None;
    }
    let mut value = String::new();
    let mut index = start + 1;
    while index < bytes.len() {
        if bytes[index] == b'\\' {
            let next = *bytes.get(index + 1)?;
            if next == b'u' && bytes.get(index + 2) == Some(&b'{') {
                let close = source[index + 3..].find('}')?;
                let close = index + 3 + close;
                let code = parse_hex(&source[index + 3..close])?;
                let ch = char::from_u32(code)?;
                value.push(ch);
                index = close + 1;
                continue;
            }
            value.push(match next {
                b'n' => '\n',
                b'r' => '\r',
                b't' => '\t',
                other => other as char,
            });
            index += 2;
            continue;
        }
        if bytes[index] == b'"' {
            return Some((value, index + 1));
        }
        let ch = source[index..].chars().next()?;
        value.push(ch);
        index += ch.len_utf8();
    }
    None
}

fn parse_hex(text: &str) -> Option<u32> {
    if text.is_empty() {
        return None;
    }
    let mut code = 0u32;
    for byte in text.bytes() {
        let digit = match byte {
            b'0'..=b'9' => byte - b'0',
            b'a'..=b'f' => byte - b'a' + 10,
            b'A'..=b'F' => byte - b'A' + 10,
            _ => return None,
        };
        code = code.checked_mul(16)?.checked_add(u32::from(digit))?;
    }
    Some(code)
}

fn skip_string(source: &str, start: usize) -> usize {
    decode_string(source, start)
        .map(|(_, end)| end)
        .unwrap_or(start)
}

fn skip_raw(source: &str, start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut ticks = 0;
    while bytes.get(start + ticks) == Some(&b'`') {
        ticks += 1;
    }
    if ticks == 0 {
        return start;
    }
    let closer = "`".repeat(ticks);
    match source[start + ticks..].find(&closer) {
        Some(close) => start + ticks + close + ticks,
        None => source.len(),
    }
}

fn skip_trivia(text: &str, mut index: usize) -> usize {
    let bytes = text.as_bytes();
    while index < bytes.len() {
        let ch = text[index..].chars().next().unwrap_or('\u{0}');
        if matches!(ch, ' ' | '\t' | '\n' | '\r') {
            index += ch.len_utf8();
            continue;
        }
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'/') {
            index = match text[index + 2..].find('\n') {
                Some(next) => index + 2 + next + 1,
                None => text.len(),
            };
            continue;
        }
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            index = match text[index + 2..].find("*/") {
                Some(next) => index + 2 + next + 2,
                None => text.len(),
            };
            continue;
        }
        break;
    }
    index
}

fn read_ident(text: &str, index: usize) -> Option<(&str, usize)> {
    let ch = text[index..].chars().next()?;
    if !is_ident_start(ch) {
        return None;
    }
    let mut cursor = index + ch.len_utf8();
    while let Some(next) = text[cursor..].chars().next() {
        if !is_ident_char(next) {
            break;
        }
        cursor += next.len_utf8();
    }
    Some((&text[index..cursor], cursor))
}

fn prev_is_ident(source: &str, start: usize) -> bool {
    source[..start]
        .chars()
        .next_back()
        .is_some_and(is_ident_char)
}

fn is_ident_start(ch: char) -> bool {
    ch.is_alphabetic() || ch == '_'
}

fn is_ident_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

fn skip_space(source: &str, mut index: usize) -> usize {
    while let Some(ch) = source[index..].chars().next() {
        if !ch.is_whitespace() {
            break;
        }
        index += ch.len_utf8();
    }
    index
}

fn advance(source: &str, index: usize) -> usize {
    match source[index..].chars().next() {
        Some(ch) => index + ch.len_utf8(),
        None => index,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use typst::foundations::Repr;

    fn show(dict: &Dict, key: &str) -> String {
        dict.at(key.into(), None).unwrap().repr().into()
    }

    #[test]
    fn coerces_numeric_defaults_and_keeps_other_strings() {
        let source = r#"#let building_value = sys.inputs.at("building_value", default: 27500000000)
#let flexas = sys.inputs.at(
  "flexas",
  default: 0.4466,
)
#let ref_no = sys.inputs.at("ref_no", default: "ref")
#let width = sys.inputs.at("width", default: 10pt)
// sys.inputs.at("building_value", default: 1)
"#;
        let params = serde_json::json!({
            "building_value": "27500000000",
            "flexas": "0.4466",
            "ref_no": "123",
            "width": "10",
            "note": "+1.2"
        });
        let Json::Object(map) = params else {
            unreachable!()
        };
        let params: HashMap<String, Json> = map.into_iter().collect();
        let dict = params_to_dict(source, &params).unwrap();
        assert_eq!(show(&dict, "building_value"), "27500000000");
        assert_eq!(show(&dict, "flexas"), "0.4466");
        assert_eq!(show(&dict, "ref_no"), "\"123\"");
        assert_eq!(show(&dict, "width"), "\"10\"");
        assert_eq!(show(&dict, "note"), "\"+1.2\"");
    }

    #[test]
    fn converts_json_object_and_array() {
        let source = r#"#let insured = sys.inputs.at("insured", default: (:))
#let coverages = sys.inputs.at("coverages", default: ())
"#;
        let params = serde_json::json!({
            "insured": {
                "holder": "张三",
                "active": true,
                "note": null,
                "count": 30,
                "tags": ["甲", "乙"]
            },
            "coverages": [{ "name": "FLEXAS", "percent": 0.5 }],
            "flag": true,
            "missing": null
        });
        let Json::Object(map) = params else {
            unreachable!()
        };
        let params: HashMap<String, Json> = map.into_iter().collect();
        let dict = params_to_dict(source, &params).unwrap();
        let insured = show(&dict, "insured");
        assert!(insured.contains("holder: \"张三\""), "{insured}");
        assert!(insured.contains("active: true"), "{insured}");
        assert!(insured.contains("note: none"), "{insured}");
        assert!(insured.contains("count: 30"), "{insured}");
        assert!(insured.contains("tags: (\"甲\", \"乙\")"), "{insured}");
        assert_eq!(
            show(&dict, "coverages"),
            "((name: \"FLEXAS\", percent: 0.5),)"
        );
        assert_eq!(show(&dict, "flag"), "true");
        assert_eq!(show(&dict, "missing"), "\"\"");
    }

    #[test]
    fn renders_json_inputs_to_pdf() {
        use typst_embed::{Project, RenderEnvironment, render_pdf};

        let source = r#"#let person = sys.inputs.at("person", default: (name: ""))
#let tags = sys.inputs.at("tags", default: ())
#person.name
#tags.at(0)
"#;
        let params = serde_json::json!({
            "person": { "name": "张三" },
            "tags": ["甲"]
        });
        let Json::Object(map) = params else {
            unreachable!()
        };
        let params: HashMap<String, Json> = map.into_iter().collect();
        let inputs = params_to_dict(source, &params).unwrap();
        let environment = RenderEnvironment::builder().inputs(inputs).build().unwrap();
        let project = Project::from_source(source);
        let pdf = render_pdf(&project, &environment).expect("render pdf");
        assert!(pdf.bytes().starts_with(b"%PDF"));
    }
}
