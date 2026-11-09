use crate::{Result, fail};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub struct Facts(pub Vec<[String; 3]>);

struct Reader<'a> {
    rest: &'a str,
}

impl Reader<'_> {
    fn whitespace(&mut self) {
        loop {
            self.rest = self.rest.trim_start();
            if !self.rest.starts_with("//") { break; }
            self.rest = self.rest.find('\n').map_or("", |offset| &self.rest[offset + 1..]);
        }
    }

    fn take(&mut self, token: char) -> bool {
        self.whitespace();
        if let Some(rest) = self.rest.strip_prefix(token) {
            self.rest = rest;
            true
        } else {
            false
        }
    }

    fn expect(&mut self, token: char) -> Result<()> {
        if self.take(token) { Ok(()) } else { Err(fail(format!("expected REL punctuation {token}"))) }
    }

    fn atom(&mut self) -> Result<String> {
        self.whitespace();
        if !self.rest.starts_with('"') { return Err(fail("expected quoted REL atom")); }
        let mut reader = serde_json::Deserializer::from_str(self.rest).into_iter::<String>();
        let value = reader.next().ok_or_else(|| fail("unclosed REL atom"))??;
        self.rest = &self.rest[reader.byte_offset()..];
        Ok(value)
    }

    fn tuple(&mut self) -> Result<([String; 3], Option<String>)> {
        self.expect('(')?;
        let subject = self.atom()?;
        self.expect(',')?;
        let predicate = self.atom()?;
        self.expect(',')?;
        let object = self.atom()?;
        let polarity = if self.take(',') { Some(self.atom()?) } else { None };
        self.expect(')')?;
        Ok(([subject, predicate, object], polarity))
    }
}

fn tuples(text: &str) -> impl Iterator<Item = Result<([String; 3], Option<String>)>> + '_ {
    let mut reader = Reader { rest: text };
    std::iter::from_fn(move || {
        reader.whitespace();
        if reader.rest.is_empty() { return None; }
        let result = reader.tuple();
        if result.is_err() { reader.rest = ""; }
        Some(result)
    })
}

fn triples(text: &str) -> impl Iterator<Item = Result<[String; 3]>> + '_ {
    tuples(text).map(|row| {
        let (fields, polarity) = row?;
        if polarity.is_some() { return Err(fail("expected a three-atom REL tuple")); }
        Ok(fields)
    })
}

pub fn relations(text: &str) -> Result<serde_json::Value> {
    let rows = tuples(text).map(|row| {
        let ([s, p, o], polarity) = row?;
        let pol = polarity.as_deref().unwrap_or("is");
        if !matches!(pol, "is" | "is-not") { return Err(fail("invalid REL polarity")); }
        Ok(serde_json::json!({"s":s,"p":p,"o":o,"pol":pol}))
    }).collect::<Result<Vec<_>>>()?;
    Ok(serde_json::Value::Array(rows))
}

impl Facts {
    pub fn read(path: &Path) -> Result<Self> {
        Self::parse(&fs::read_to_string(path)?)
    }

    pub fn parse(text: &str) -> Result<Self> {
        let mut rows = Vec::new();
        for row in triples(text) {
            let row = row?;
            if rows.contains(&row) {
                return Err(fail("duplicate REL tuple"));
            }
            rows.push(row);
        }
        Ok(Self(rows))
    }

    pub fn values<'a>(&'a self, subject: &str, property: &str) -> Vec<&'a str> {
        self.0
            .iter()
            .filter(|row| row[0] == subject && row[1] == property)
            .map(|row| row[2].as_str())
            .collect()
    }

    pub fn one(&self, subject: &str, property: &str) -> Result<&str> {
        match self.values(subject, property).as_slice() {
            [value] => Ok(value),
            _ => Err(fail(format!("expected one REL value for {subject}.{property}"))),
        }
    }
}

pub fn hash(bytes: impl AsRef<[u8]>) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn pinned(path: &Path, sha: &str) -> Result<String> {
    let bytes = fs::read(path)?;
    if hash(&bytes) != sha {
        return Err(fail(format!("source pin mismatch at {}", path.display())));
    }
    Ok(String::from_utf8(bytes)?)
}

// Decode the ApplicationData value graph. Entries and values have single
// ownership, and every declared node must be reached from the document root.
pub fn application_data(text: &str) -> Result<serde_json::Value> {
    decode(text, "ApplicationData")
}

pub fn decode(text: &str, expected_kind: &str) -> Result<serde_json::Value> {
    use serde_json::{Map, Value, json};
    use std::collections::{BTreeMap, BTreeSet};
    type Cells = BTreeMap<String, BTreeMap<String, Vec<String>>>;

    fn claim<'a>(cells: &'a Cells, seen: &mut BTreeSet<String>, id: &str)
        -> Result<&'a BTreeMap<String, Vec<String>>>
    {
        if !seen.insert(id.to_owned()) { return Err(fail("shared or cyclic REL value node")); }
        cells.get(id).ok_or_else(|| fail(format!("unknown REL value node {id}")))
    }

    fn one<'a>(row: &'a BTreeMap<String, Vec<String>>, key: &str) -> Result<&'a str> {
        match row.get(key).map(Vec::as_slice) {
            Some([value]) => Ok(value),
            _ => Err(fail(format!("expected one typed REL field {key}"))),
        }
    }

    fn shape(row: &BTreeMap<String, Vec<String>>, fields: &[&str]) -> Result<()> {
        if row.keys().any(|key| !fields.contains(&key.as_str())) {
            return Err(fail("unexpected typed REL field"));
        }
        Ok(())
    }

    fn node(cells: &Cells, seen: &mut BTreeSet<String>, id: &str, depth: usize) -> Result<Value> {
        if depth > 256 { return Err(fail("typed REL nesting limit")); }
        let row = claim(cells, seen, id)?;
        let kind = one(row, "type")?;
        match kind {
            "Record" => {
                shape(row, &["type", "entry"])?;
                let mut result = Map::new();
                for entry in row.get("entry").into_iter().flatten() {
                    let entry = claim(cells, seen, entry)?;
                    shape(entry, &["type", "key", "value"])?;
                    let key = one(entry, "key")?;
                    if one(entry, "type")? != "Entry" || result.contains_key(key)
                        || key.contains('\0') || matches!(key, "__proto__" | "prototype" | "constructor")
                    {
                        return Err(fail("invalid typed REL record entry"));
                    }
                    result.insert(key.to_owned(), node(cells, seen, one(entry, "value")?, depth + 1)?);
                }
                Ok(Value::Object(result))
            }
            "Sequence" => {
                shape(row, &["type", "item"])?;
                let items = row.get("item").into_iter().flatten()
                    .map(|item| node(cells, seen, item, depth + 1)).collect::<Result<Vec<_>>>()?;
                Ok(Value::Array(items))
            }
            "Null" => {
                shape(row, &["type"])?;
                Ok(Value::Null)
            }
            "String" | "Number" | "Boolean" => {
                shape(row, &["type", "scalar"])?;
                let scalar = one(row, "scalar")?;
                match kind {
                    "String" => Ok(json!(scalar)),
                    "Boolean" if scalar == "true" || scalar == "false" => Ok(json!(scalar == "true")),
                    "Number" => match serde_json::from_str::<Value>(scalar)? {
                        number @ Value::Number(_) => Ok(number),
                        _ => Err(fail("invalid typed REL number")),
                    },
                    _ => Err(fail("invalid typed REL boolean")),
                }
            }
            _ => Err(fail(format!("unsupported typed REL value {kind}"))),
        }
    }

    let mut cells = Cells::new();
    for row in triples(text) {
        let [id, field, value] = row?;
        cells.entry(id).or_default().entry(field).or_default().push(value);
        if cells.len() > 200_000 { return Err(fail("typed REL node limit")); }
    }
    let mut seen = BTreeSet::new();
    let document = claim(&cells, &mut seen, "rel.document")?;
    shape(document, &["kind", "root"])?;
    if one(document, "kind")? != expected_kind {
        return Err(fail("wrong typed REL document kind"));
    }
    let value = node(&cells, &mut seen, one(document, "root")?, 0)?;
    if cells.len() != seen.len() { return Err(fail("unreachable typed REL nodes")); }
    Ok(value)
}

pub(crate) fn quote(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\u{0}'..='\u{1f}' | '\u{2028}' | '\u{2029}' =>
                out.push_str(&format!("\\u{:04x}", c as u32)),
            c if c as u32 > 0xffff => {
                let mut units = [0; 2];
                for unit in c.encode_utf16(&mut units) { out.push_str(&format!("\\u{unit:04x}")); }
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn encode(value: &serde_json::Value, kind: &str) -> Result<String> {
    use serde_json::Value;
    fn fact(out: &mut String, s: &str, p: &str, o: &str) {
        out.push_str(&format!("({}, {}, {})\n", quote(s), quote(p), quote(o)));
    }
    fn node(out: &mut String, value: &Value, serial: &mut usize, depth: usize) -> Result<String> {
        if depth > 256 || *serial > 200_000 { return Err(fail("REL value bound exceeded")); }
        let id = format!("v{serial}");
        *serial += 1;
        let kind = match value {
            Value::Null => "Null", Value::Bool(_) => "Boolean", Value::Number(_) => "Number",
            Value::String(_) => "String", Value::Array(_) => "Sequence", Value::Object(_) => "Record",
        };
        fact(out, &id, "type", kind);
        match value {
            Value::Object(record) => {
                for (key, value) in record {
                    if key.contains('\0') || matches!(key.as_str(), "__proto__" | "prototype" | "constructor") {
                        return Err(fail("forbidden REL record field"));
                    }
                    let entry = format!("v{serial}");
                    *serial += 1;
                    fact(out, &id, "entry", &entry);
                    fact(out, &entry, "type", "Entry");
                    fact(out, &entry, "key", key);
                    let value_id = node(out, value, serial, depth + 1)?;
                    fact(out, &entry, "value", &value_id);
                }
            }
            Value::Array(items) => {
                for item in items {
                    let item_id = node(out, item, serial, depth + 1)?;
                    fact(out, &id, "item", &item_id);
                }
            }
            Value::Null => (),
            Value::String(text) => fact(out, &id, "scalar", text),
            other => fact(out, &id, "scalar", &other.to_string()),
        }
        Ok(id)
    }
    let mut out = String::new();
    fact(&mut out, "rel.document", "kind", kind);
    let id = node(&mut out, value, &mut 0, 0)?;
    fact(&mut out, "rel.document", "root", &id);
    Ok(out)
}

pub fn scalar(text: &str) -> Result<serde_json::Value> {
    let value: serde_json::Value = serde_json::from_str(text.trim())?;
    if value.is_object() || value.is_array() { return Err(fail("expected a REL scalar")); }
    Ok(value)
}

pub fn literal(value: &serde_json::Value) -> Result<String> {
    match value {
        serde_json::Value::String(text) => Ok(quote(text)),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => encode(value, "StaticValue"),
        scalar => Ok(scalar.to_string()),
    }
}
