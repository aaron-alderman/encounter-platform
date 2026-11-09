// Source-command/1 is a closed subset of the Encounter surface language.
// Source is admitted by the compiler. Pinned images use a separate checked
// instruction codec. Inspection data is never consumed as a programme.
#[path = "compiled.rs"]
mod compiled;
use crate::{Result, fail, rel, store::Store};
use serde_json::{Map, Value, json};
use std::{collections::{BTreeMap, BTreeSet}, rc::Rc};

type Env = BTreeMap<String, Rc<Value>>;
type Lines<'a> = Vec<(usize, &'a str)>;

const ABSENT_KEY: &str = "\0encounter.absent";

fn absent() -> Value { json!({(ABSENT_KEY):true}) }

fn is_absent(value: &Value) -> bool { value.get(ABSENT_KEY).is_some() }

#[derive(Debug)]
enum Expr {
    Literal(Value),
    Ref(Vec<String>),
    Record(Vec<(String, Expr)>),
    Apply(String, Vec<Expr>),
}

enum Step {
    Let(String, Expr),
    Assert(Expr, String),
    When(Expr, Vec<Step>),
    Call(String),
    Each { items: Expr, item: String, body: Vec<Step> },
    Try { body: Vec<Step>, error: String, catch: Vec<Step> },
    Fold { items: Expr, item: String, accumulator: String, initial: Expr,
        body: Vec<Step>, yielded: Expr, into: String },
    Port { name: String, args: Expr, into: String },
}

#[derive(Debug)]
struct RuntimeLimit(&'static str);

impl std::fmt::Display for RuntimeLimit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.0) }
}

impl std::error::Error for RuntimeLimit {}

#[derive(Clone)]
pub struct Meter(usize);

impl Meter {
    pub fn new(limit: usize) -> Self { Self(limit) }

    fn charge(&mut self, count: usize) -> Result<()> {
        self.0 = self.0.checked_sub(count).ok_or(RuntimeLimit("meter-exhausted"))?;
        Ok(())
    }
}

struct Parser<'a> { rest: &'a str }

impl<'a> Parser<'a> {
    fn take(&mut self, prefix: &str) -> bool {
        self.rest = self.rest.trim_start();
        if let Some(rest) = self.rest.strip_prefix(prefix) {
            self.rest = rest;
            true
        } else {
            false
        }
    }

    fn expect(&mut self, token: &str) -> Result<()> {
        if self.take(token) { Ok(()) } else { Err(fail(format!("expected {token} near {}", self.rest))) }
    }

    fn word(&mut self) -> Result<String> {
        self.rest = self.rest.trim_start();
        let end = self.rest.find(|c: char| !c.is_ascii_alphanumeric() && !matches!(c, '_' | '-' | '.'))
            .unwrap_or(self.rest.len());
        if end == 0 { return Err(fail("expected source name")); }
        let (word, rest) = self.rest.split_at(end);
        self.rest = rest;
        Ok(word.to_owned())
    }

    fn end(&self) -> Result<()> {
        if self.rest.trim().is_empty() { Ok(()) } else { Err(fail(format!("unexpected source tail {}", self.rest))) }
    }

    fn expr(&mut self, depth: usize) -> Result<Expr> {
        if depth > 32 { return Err(fail("expression-depth")); }
        if self.take("$") {
            return Ok(Expr::Ref(self.word()?.split('.').map(str::to_owned).collect()));
        }
        if self.take("{") {
            let mut fields = Vec::new();
            if !self.take("}") {
                loop {
                    let key = if self.rest.trim_start().starts_with('"') {
                        match self.expr(depth + 1)? {
                            Expr::Literal(Value::String(key)) => key,
                            _ => return Err(fail("expected quoted field")),
                        }
                    } else { self.word()? };
                    if key.contains('\0') || fields.iter().any(|(name, _)| name == &key) {
                        return Err(fail("duplicate record field"));
                    }
                    self.expect("=")?;
                    fields.push((key, self.expr(depth + 1)?));
                    if self.take("}") { break; }
                    self.expect(";")?;
                }
            }
            return Ok(Expr::Record(fields));
        }
        if self.rest.starts_with('"') {
            let mut reader = serde_json::Deserializer::from_str(self.rest).into_iter::<String>();
            let value = reader.next().ok_or_else(|| fail("unclosed text"))??;
            self.rest = &self.rest[reader.byte_offset()..];
            return Ok(Expr::Literal(json!(value)));
        }
        let word = self.word()?;
        if self.take("(") {
            let mut args = Vec::new();
            if !self.take(")") {
                loop {
                    args.push(self.expr(depth + 1)?);
                    if self.take(")") { break; }
                    self.expect(",")?;
                }
            }
            let valid = operator_arity(&word, args.len());
            if !valid { return Err(fail(format!("unsupported expression {word}"))); }
            return Ok(Expr::Apply(word, args));
        }
        Ok(Expr::Literal(match word.as_str() {
            "true" => json!(true),
            "false" => json!(false),
            "null" => Value::Null,
            _ => {
                let numeric = serde_json::from_str::<Value>(&word).ok()
                    .filter(Value::is_number)
                    .ok_or_else(|| fail(format!("unsupported atom {word}")))?;
                if numeric.is_f64() {
                    let n = numeric.as_f64().ok_or_else(|| fail("invalid numeric literal"))?;
                    if n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_991.0 {
                        json!(n as i64)
                    } else { numeric }
                } else { numeric }
            }
        }))
    }
}

fn operator_arity(name: &str, length: usize) -> bool {
    match name {
        "list" | "concat" | "and" | "or" => true,
        "not" | "count" | "distinct" | "range" => length == 1,
        "eq" | "includes" | "append" | "at" | "add" => length == 2,
        "if" | "map" | "filter" | "every" | "some" => length == 3,
        "fold" => length == 5,
        _ => false,
    }
}

fn lines(source: &str) -> Result<BTreeMap<String, Lines<'_>>> {
    let mut source = source.lines().filter(|line| {
        let line = line.trim();
        !line.is_empty() && !line.starts_with('#')
    });
    if source.next() != Some("process-module \"temple/surface-process-module/1\"") {
        return Err(fail("unsupported source module"));
    }
    let mut modules = BTreeMap::new();
    let mut current = None;
    let mut source = source.peekable();
    if source.peek().is_some_and(|line| line.starts_with("profile ")) {
        let profile = source.next().unwrap().trim_start_matches("profile ");
        serde_json::from_str::<String>(profile)?;
    }
    for line in source {
        if let Some(name) = line.strip_prefix("process ").and_then(|line| line.strip_suffix(':')) {
            if modules.insert(name.to_owned(), Vec::new()).is_some() {
                return Err(fail("duplicate process"));
            }
            current = Some(name);
        } else {
            let body = current.and_then(|name| modules.get_mut(name))
                .ok_or_else(|| fail("source body without process"))?;
            let stripped = line.trim_start_matches(' ');
            if line.len() == stripped.len() { return Err(fail("expected source indentation")); }
            body.push((line.len() - stripped.len(), stripped));
        }
    }
    Ok(modules)
}

// Join only expression continuations. Delimiters inside quoted text are inert.
fn statement(lines: &[(usize, &str)], cursor: &mut usize) -> Result<String> {
    let mut result = String::new();
    let mut delimiters = Vec::new();
    loop {
        let (_, line) = lines.get(*cursor).ok_or_else(|| fail("unclosed source expression"))?;
        *cursor += 1;
        let mut quoted = false;
        let mut escaped = false;
        for c in line.chars() {
            if quoted {
                if escaped { escaped = false; }
                else if c == '\\' { escaped = true; }
                else if c == '"' { quoted = false; }
            } else {
                match c {
                    '"' => quoted = true,
                    '(' => delimiters.push(')'),
                    '{' => delimiters.push('}'),
                    ')' | '}' if delimiters.pop() != Some(c) => return Err(fail("unbalanced source expression")),
                    _ => (),
                }
            }
        }
        if quoted { return Err(fail("unclosed source text")); }
        result.push_str(line);
        if delimiters.is_empty() { return Ok(result); }
        result.push(' ');
    }
}

fn block(lines: &[(usize, &str)], cursor: &mut usize, indent: usize, in_fold: bool) -> Result<Vec<Step>> {
    if indent > 32 { return Err(fail("block-depth")); }
    let mut steps = Vec::new();
    while let Some(&(level, line)) = lines.get(*cursor) {
        if level < indent { break; }
        if level != indent { return Err(fail("unsupported source indentation")); }
        if in_fold && line.starts_with("yield ") { break; }
        let line = statement(lines, cursor)?;
        let mut p = Parser { rest: &line };
        let step = if p.take("let ") {
            let name = p.word()?;
            p.expect("=")?;
            Step::Let(name, p.expr(0)?)
        } else if p.take("port ") {
            let name = p.word()?;
            let args = p.expr(0)?;
            p.expect("→")?;
            Step::Port { name, args, into: p.word()? }
        } else if p.take("when ") {
            let condition = p.expr(0)?;
            p.expect(":")?;
            let body = block(lines, cursor, indent + 2, false)?;
            if body.is_empty() { return Err(fail("empty when block")); }
            Step::When(condition, body)
        } else if p.take("call ") {
            Step::Call(p.word()?)
        } else if p.take("each ") {
            let items = p.expr(0)?;
            p.expect("as ")?;
            let item = p.word()?;
            p.expect(":")?;
            let body = block(lines, cursor, indent + 2, false)?;
            Step::Each { items, item, body }
        } else if p.take("try:") {
            let body = block(lines, cursor, indent + 2, false)?;
            let &(level, catch) = lines.get(*cursor).ok_or_else(|| fail("missing catch"))?;
            if level != indent { return Err(fail("expected catch indentation")); }
            let mut handler = Parser { rest: catch };
            handler.expect("catch ")?;
            let error = handler.word()?;
            handler.expect(":")?;
            handler.end()?;
            *cursor += 1;
            let catch = block(lines, cursor, indent + 2, false)?;
            Step::Try { body, error, catch }
        } else if p.take("fold ") {
            let items = p.expr(0)?;
            p.expect("as ")?;
            let item = p.word()?;
            p.expect(";")?;
            let accumulator = p.word()?;
            p.expect("starts ")?;
            let initial = p.expr(0)?;
            p.expect(":")?;
            let body = block(lines, cursor, indent + 2, true)?;
            if lines.get(*cursor).map(|(level, _)| *level) != Some(indent + 2) {
                return Err(fail("missing fold yield"));
            }
            let tail = statement(lines, cursor)?;
            let mut tail = Parser { rest: &tail };
            tail.expect("yield ")?;
            let yielded = tail.expr(0)?;
            tail.expect("→")?;
            let into = tail.word()?;
            tail.end()?;
            Step::Fold { items, item, accumulator, initial, body, yielded, into }
        } else if p.take("assert ") {
            let condition = p.expr(0)?;
            let &(level, otherwise) = lines.get(*cursor).ok_or_else(|| fail("missing otherwise"))?;
            if level != indent + 2 { return Err(fail("expected otherwise indentation")); }
            let mut message = Parser { rest: otherwise };
            message.expect("otherwise ")?;
            let Expr::Literal(Value::String(text)) = message.expr(0)? else {
                return Err(fail("expected refusal text"));
            };
            message.end()?;
            *cursor += 1;
            Step::Assert(condition, text)
        } else {
            return Err(fail(format!("unsupported command-profile statement {line}")));
        };
        p.end()?;
        steps.push(step);
    }
    Ok(steps)
}

pub fn supports_port(name: &str) -> bool {
    matches!(name, "kernel.invoke" | "text.trim" | "text.matches" | "record.entries"
        | "record.fromEntries" | "record.put" | "digest.sha256" | "application.data" | "text.slice" | "text.lowerCase"
        | "text.indexOf" | "number.calculate" | "rel.encode" | "rel.decode" | "scalar.read"
        | "storage.snapshot" | "storage.operation" | "storage.cas" | "storage.history"
        | "text.join" | "text.replaceAll" | "value.describe" | "value.string" | "value.type"
        | "record.get" | "scalar.quoteValue" | "text.split" | "source.observe"
        | "source.catalogue" | "encounter.execute")
}

fn callees(steps: &[Step], grants: &BTreeSet<&str>, calls: &mut Vec<String>) -> Result<()> {
    for step in steps {
        match step {
            Step::When(_, body) | Step::Fold { body, .. } | Step::Each { body, .. } => callees(body, grants, calls)?,
            Step::Call(name) => calls.push(name.clone()),
            Step::Try { body, catch, .. } => {
                callees(body, grants, calls)?;
                callees(catch, grants, calls)?;
            }
            Step::Port { name, args, .. } => {
                if !grants.contains(name.as_str()) { return Err(fail(format!("port not granted: {name}"))); }
                if !supports_port(name) {
                    return Err(fail(format!("unsupported source port: {name}")));
                }
                if name == "kernel.invoke" {
                    let Expr::Record(fields) = args else { return Err(fail("call must use a literal query")); };
                    let Some((_, Expr::Literal(Value::String(query)))) = fields.iter().find(|(field, _)| field == "query") else {
                        return Err(fail("call must use a literal query"));
                    };
                    calls.push(query.clone());
                }
            }
            _ => {}
        }
    }
    Ok(())
}

pub struct Programme {
    steps: BTreeMap<String, Vec<Step>>,
    datasets: BTreeMap<String, Value>,
    store: Option<Store>,
    catalogue: Option<Value>,
}

impl Programme {
    pub fn admit(sources: &[String], root: &str, grants: &BTreeSet<&str>, meter: &mut Meter) -> Result<Self> {
        Self::admit_entries(sources, &[root], grants, meter)
    }

    pub fn admit_entries(sources: &[String], roots: &[&str], grants: &BTreeSet<&str>, meter: &mut Meter) -> Result<Self> {
        let mut definitions = BTreeMap::new();
        for source in sources {
            meter.charge(source.len())?;
            for (name, body) in lines(source)? {
                if definitions.insert(name, body).is_some() { return Err(fail("duplicate linked process")); }
            }
        }
        fn visit(
            name: &str, definitions: &BTreeMap<String, Lines<'_>>, grants: &BTreeSet<&str>,
            active: &mut BTreeSet<String>, admitted: &mut BTreeMap<String, Vec<Step>>,
        ) -> Result<()> {
            if admitted.contains_key(name) || active.contains(name) { return Ok(()); }
            if active.len() >= 64 { return Err(fail("process link depth")); }
            active.insert(name.to_owned());
            let lines = definitions.get(name).ok_or_else(|| fail(format!("missing-process: {name}")))?;
            let steps = block(lines, &mut 0, 2, false)
                .map_err(|error| fail(format!("{name}: {error}")))?;
            if steps.is_empty() { return Err(fail("empty process")); }
            let mut calls = Vec::new();
            callees(&steps, grants, &mut calls)
                .map_err(|error| fail(format!("{name}: {error}")))?;
            for call in calls { visit(&call, definitions, grants, active, admitted)?; }
            active.remove(name);
            admitted.insert(name.to_owned(), steps);
            Ok(())
        }
        let mut admitted = BTreeMap::new();
        for root in roots {
            visit(root, &definitions, grants, &mut BTreeSet::new(), &mut admitted)?;
        }
        Ok(Self { steps: admitted, datasets: BTreeMap::new(), store: None, catalogue: None })
    }

    // Supplement admission's first error with an inventory of the declared
    // module bodies. This includes helpers that may be outside an entry closure.
    pub fn syntax_inventory(sources: &[String]) -> Result<Value> {
        let mut statements = BTreeSet::new();
        let mut parsed_blockers = BTreeMap::new();
        for source in sources {
            for (name, body) in lines(source)? {
                for (_, line) in &body {
                    let keyword = line.split_ascii_whitespace().next().unwrap_or("");
                    if matches!(keyword, "choose" | "set") {
                        statements.insert(keyword.to_owned());
                    }
                }
                if let Err(error) = block(&body, &mut 0, 2, false) {
                    parsed_blockers.insert(name, error.to_string());
                }
            }
        }
        Ok(json!({"unsupportedStatementTokens":statements,"firstBlockerByProcess":parsed_blockers}))
    }

    pub fn require_grants(&self, entry: &str, grants: &BTreeSet<&str>) -> Result<()> {
        let mut pending = vec![entry.to_owned()];
        let mut seen = BTreeSet::new();
        while let Some(name) = pending.pop() {
            if !seen.insert(name.clone()) { continue; }
            let body = self.steps.get(&name).ok_or_else(|| fail("missing restricted entry"))?;
            callees(body, grants, &mut pending)?;
        }
        Ok(())
    }

    pub fn bind_data(&mut self, data: Value) {
        self.bind_dataset(String::new(), data);
    }

    pub fn bind_dataset(&mut self, name: String, data: Value) {
        self.datasets.insert(name, data);
    }

    pub fn bind_catalogue(&mut self, sources: Value) { self.catalogue = Some(sources); }

    pub fn bind_store(&mut self, store: Store) {
        self.store = Some(store);
    }

    fn storage(&self) -> Result<&Store> {
        self.store.as_ref().ok_or_else(|| fail("missing storage binding"))
    }

    pub fn snapshot(&self) -> Result<Value> { self.storage()?.snapshot(None) }

    pub fn run(&self, name: &str, input: Value, meter: &mut Meter) -> Result<Value> {
        self.invoke(name, input, Env::new(), meter, 0)
    }

    fn invoke(&self, name: &str, input: Value, mut env: Env, meter: &mut Meter, depth: usize) -> Result<Value> {
        let steps = self.steps.get(name).ok_or_else(|| fail("missing-process"))?;
        env.insert("eventInput".to_owned(), Rc::new(input));
        self.execute(steps, &mut env, meter, depth)?;
        env.remove("result").map(Rc::unwrap_or_clone).ok_or_else(|| fail("missing result"))
    }

    fn execute(&self, steps: &[Step], env: &mut Env, meter: &mut Meter, depth: usize) -> Result<()> {
        if depth > 96 { return Err(Box::new(RuntimeLimit("process depth limit"))); }
        for step in steps {
            meter.charge(1)?;
            match step {
                Step::Let(name, expr) => { env.insert(name.clone(), Rc::new(value(expr, env, meter)?)); }
                Step::Assert(expr, message) => {
                    if !truth(&value(expr, env, meter)?) { return Err(fail(message)); }
                }
                Step::When(expr, body) => {
                    if truth(&value(expr, env, meter)?) { self.execute(body, env, meter, depth)?; }
                }
                Step::Call(name) => {
                    let steps = self.steps.get(name).ok_or_else(|| fail("missing-process"))?;
                    self.execute(steps, env, meter, depth + 1)?;
                }
                Step::Each { items, item, body } => {
                    let values = value(items, env, meter)?;
                    for row in list(&values)? {
                        let mut local = env.clone();
                        local.insert(item.clone(), Rc::new(row.clone()));
                        self.execute(body, &mut local, meter, depth)?;
                    }
                }
                Step::Try { body, error, catch } => {
                    if let Err(fault) = self.execute(body, env, meter, depth) {
                        if fault.is::<RuntimeLimit>() { return Err(fault); }
                        env.insert(error.clone(), Rc::new(json!({"name":"Error","message":fault.to_string()})));
                        self.execute(catch, env, meter, depth)?;
                    }
                }
                Step::Fold { items, item, accumulator, initial, body, yielded, into } => {
                    let values = value(items, env, meter)?;
                    let mut acc = value(initial, env, meter)?;
                    for row in list(&values)? {
                        let mut local = env.clone();
                        local.insert(item.clone(), Rc::new(row.clone()));
                        local.insert(accumulator.clone(), Rc::new(acc));
                        self.execute(body, &mut local, meter, depth)?;
                        acc = value(yielded, &local, meter)?;
                    }
                    env.insert(into.clone(), Rc::new(acc));
                }
                Step::Port { name, args, into } => {
                    let args = value(args, env, meter)?;
                    let result = match name.as_str() {
                        "kernel.invoke" => self.invoke(text(&args["query"])?, args.get("input").cloned().unwrap_or(json!({})), env.clone(), meter, depth + 1)?,
                        "storage.snapshot" => self.storage()?.snapshot(args.get("revision"))?,
                        "storage.operation" => self.storage()?.operation(&args["operationId"])?,
                        "storage.cas" => self.storage()?.cas(&args)?,
                        "storage.history" => self.storage()?.history()?,
                        "rel.encode" => json!(rel::encode(&args["value"], text(&args["kind"])?)?),
                        "rel.decode" => rel::decode(text(&args["text"])?, text(&args["kind"])?)?,
                        "scalar.read" => rel::scalar(text(&args["text"])?)?,
                        "scalar.quoteValue" => json!(rel::literal(&args["value"])?),
                        "record.get" => args["record"].get(text(&args["key"])?).cloned().unwrap_or(Value::Null),
                        "text.split" if args["pattern"] == r"\r?\n" => {
                            let mut parts = text(&args["value"])?.split('\n').peekable();
                            let mut result = Vec::new();
                            while let Some(part) = parts.next() {
                                result.push(if parts.peek().is_some() { part.strip_suffix('\r').unwrap_or(part) } else { part });
                            }
                            json!(result)
                        }
                        "source.catalogue" if args.as_object().is_some_and(Map::is_empty) =>
                            self.catalogue.clone().ok_or_else(|| fail("missing source catalogue binding"))?,
                        "source.observe" => {
                            let source = text(&args["text"])?;
                            if text(&args["file"])?.encode_utf16().count() > 4096 {
                                return Err(fail("source identity length limit"));
                            }
                            let (_, expression) = authored_action(source, meter)?;
                            json!({"sourceHash":rel::hash(source),"module":{
                                "protocol":"temple/surface-process-module/1",
                                "queries":{"run":[{"let":"result","value":expression}]}
                            }})
                        }
                        "encounter.execute" => {
                            if !args.as_object().is_some_and(|fields| fields.len() == 3)
                                || args["entry"] != "run" || !args.as_object().is_some_and(|fields| fields.contains_key("input")) {
                                return Err(fail("expected source, run entry and input"));
                            }
                            let (expression, _) = authored_action(text(&args["text"])?, meter)?;
                            let locals = Env::from([("eventInput".to_owned(), Rc::new(args["input"].clone()))]);
                            value(&expression, &locals, meter)?
                        }
                        "text.join" => json!(list(&args["values"])?.iter().map(join_part)
                            .collect::<Vec<_>>().join(text(&args["separator"])?)),
                        "text.replaceAll" => json!(text(&args["value"])?.replace(text(&args["search"])?, text(&args["replacement"])?)),
                        "value.type" => json!(js_type(&args["value"])),
                        "value.string" => json!(js_string(&args["value"])),
                        "value.describe" => json!({"type":js_type(&args["value"]),
                            "array":args["value"].is_array(),"null":args["value"].is_null(),
                            "plain":args["value"].is_object() && !is_absent(&args["value"]),
                            "finite":args["value"].is_number(),"dataOnly":true,"dense":true}),
                        "record.put" => {
                            let mut record = args["record"].as_object()
                                .ok_or_else(|| fail("expected record"))?.clone();
                            let key = text(&args["key"])?;
                            if key.contains('\0') { return Err(fail("reserved record key")); }
                            let value = args.get("value").ok_or_else(|| fail("missing record value"))?;
                            record.insert(key.to_owned(), value.clone());
                            Value::Object(record)
                        }
                        "digest.sha256" => json!(rel::hash(text(&args["text"])?)),
                        "record.entries" => {
                            let value = &args["value"];
                            if let Some(items) = value.as_array() {
                                json!(items.iter().enumerate().map(|(index, item)| json!([index.to_string(), item]))
                                    .collect::<Vec<_>>())
                            } else {
                                let record = value.as_object().filter(|_| !is_absent(value))
                                    .ok_or_else(|| fail("expected record"))?;
                                Value::Array(record.iter().map(|(key, value)| json!([key, value])).collect())
                            }
                        }
                        "application.data" => {
                            let fields = args.as_object().ok_or_else(|| fail("expected data arguments"))?;
                            let dataset = match fields.get("name") {
                                None if fields.is_empty() => "",
                                Some(name) if fields.len() == 1 => text(name)?,
                                _ => return Err(fail("unsupported data arguments")),
                            };
                            self.datasets.get(dataset).cloned()
                                .ok_or_else(|| fail(format!("unknown application dataset {dataset}")))?
                        }
                        "record.fromEntries" => {
                            let mut result = Map::new();
                            for entry in list(&args["entries"])? {
                                let [key, value] = list(entry)? else { return Err(fail("expected pair")); };
                                let key = text(key)?;
                                if key.contains('\0') { return Err(fail("reserved record key")); }
                                result.insert(key.to_owned(), value.clone());
                            }
                            Value::Object(result)
                        }
                        "text.lowerCase" => json!(text(&args["value"])?.to_lowercase()),
                        "text.indexOf" => {
                            let value = text(&args["value"])?;
                            let index = value.find(text(&args["search"])?)
                                .map(|offset| value[..offset].encode_utf16().count() as i64).unwrap_or(-1);
                            json!(index)
                        }
                        "text.slice" => {
                            let value = text(&args["value"])?;
                            let start = index(&args["start"])?;
                            let end = match args.get("end") {
                                Some(end) => index(end)?,
                                None => value.encode_utf16().count(),
                            };
                            let units: Vec<_> = value.encode_utf16().skip(start).take(end.saturating_sub(start)).collect();
                            json!(String::from_utf16_lossy(&units))
                        }
                        "number.calculate" => calculate(text(&args["operation"])?, list(&args["values"])?)?,
                        "text.trim" => json!(text(&args["value"])?.trim_matches(js_space)),
                        "text.matches" => json!(bounded_match(text(&args["value"])?, text(&args["pattern"])?, args.get("flags").and_then(Value::as_str).unwrap_or(""))?),
                        _ => return Err(fail(format!("unbound port {name}"))),
                    };
                    env.insert(into.clone(), Rc::new(result));
                }
            }
        }
        Ok(())
    }
}

// The authoring ABI admits only a single pure scalar expression for run.
// Its observation is inspection data. Execution reparses the source and
// supplies only the declared event input under the caller's meter.
fn authored_action(source: &str, meter: &mut Meter) -> Result<(Expr, Value)> {
    fn observe(expression: &Expr) -> Result<Value> {
        match expression {
            Expr::Literal(value) if value.is_number() || value.is_boolean()
                || value.as_str().is_some_and(|text| !text.starts_with('$')) => Ok(value.clone()),
            Expr::Ref(path) if path.as_slice() == ["eventInput"] => Ok(json!("$eventInput")),
            Expr::Apply(name, args) if matches!(name.as_str(), "concat" | "add" | "eq" | "if") => {
                let mut observed = vec![json!(name)];
                for arg in args { observed.push(observe(arg)?); }
                Ok(Value::Array(observed))
            }
            _ => Err(fail("ACTION: Only the declared input and supported pure scalar expressions are available.")),
        }
    }

    if source.encode_utf16().count() > 160_000 { return Err(fail("source text length limit")); }
    meter.charge(source.len())?;
    let definitions = lines(source)?;
    let body = definitions.get("run").filter(|_| definitions.len() == 1)
        .ok_or_else(|| fail("ACTION: This profile requires exactly one process named run."))?;
    let mut steps = block(body, &mut 0, 2, false)?;
    if steps.len() != 1 { return Err(fail("ACTION: Use one expression-valued result.")); }
    let Some(Step::Let(name, expression)) = steps.pop() else {
        return Err(fail("ACTION: Use one expression-valued result."));
    };
    if name != "result" { return Err(fail("ACTION: Use one expression-valued result.")); }
    let observed = observe(&expression)?;
    Ok((expression, observed))
}

fn js_type(value: &Value) -> &'static str {
    if is_absent(value) { return "undefined"; }
    match value {
        Value::Bool(_) => "boolean", Value::Number(_) => "number", Value::String(_) => "string",
        _ => "object",
    }
}

fn js_string(value: &Value) -> String {
    if is_absent(value) { return "undefined".to_owned(); }
    match value {
        Value::String(text) => text.clone(),
        Value::Object(_) => "[object Object]".to_owned(),
        Value::Array(values) => values.iter().map(join_part)
            .collect::<Vec<_>>().join(","),
        _ => value.to_string(),
    }
}

fn join_part(value: &Value) -> String {
    if value.is_null() || is_absent(value) { String::new() } else { js_string(value) }
}

fn text(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(|| fail("invalid-arguments: expected text"))
}

fn integer(value: &Value) -> Result<i64> {
    value.as_i64().ok_or_else(|| fail("expected integer"))
}

fn index(value: &Value) -> Result<usize> {
    Ok(usize::try_from(integer(value)?)?)
}

fn list(value: &Value) -> Result<&[Value]> {
    value.as_array().map(Vec::as_slice).ok_or_else(|| fail("expected list"))
}

fn truth(value: &Value) -> bool {
    if is_absent(value) { return false; }
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::String(value) => !value.is_empty(),
        Value::Number(value) => value.as_f64() != Some(0.0),
        _ => true,
    }
}

fn js_space(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' |
        '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' |
        '\u{3000}' | '\u{FEFF}')
}

fn numeric_input(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Bool(value) => if *value { 1.0 } else { 0.0 },
        Value::Number(value) => value.as_f64().unwrap_or(f64::NAN),
        Value::Object(_) => f64::NAN,
        Value::String(_) | Value::Array(_) => {
            let string = js_string(value);
            let text = string.trim_matches(js_space);
            if text.is_empty() { return 0.0; }
            // Number accepts zero-padded decimal strings such as the month
            // and day extracted from an ISO date.
            if let Some(prefix) = text.get(..2) {
                let radix = match prefix {
                    "0x" | "0X" => Some(16),
                    "0o" | "0O" => Some(8),
                    "0b" | "0B" => Some(2),
                    _ => None,
                };
                if let Some(radix) = radix {
                    let digits = &text[2..];
                    if digits.is_empty() { return f64::NAN; }
                    return digits.chars().fold(0.0, |value, digit|
                        value * f64::from(radix) + digit.to_digit(radix).map_or(f64::NAN, f64::from));
                }
            }
            match text {
                "Infinity" | "+Infinity" => f64::INFINITY,
                "-Infinity" => f64::NEG_INFINITY,
                _ if text.bytes().all(|byte| byte.is_ascii_digit() || b"+-.eE".contains(&byte)) =>
                    text.parse::<f64>().unwrap_or(f64::NAN),
                _ => f64::NAN,
            }
        }
    }
}

fn calculate(operation: &str, values: &[Value]) -> Result<Value> {
    let numbers: Vec<_> = values.iter().map(numeric_input).collect();
    let operand = |index| numbers.get(index).copied().unwrap_or(f64::NAN);
    let a = operand(0);
    let b = operand(1);
    let result = match operation {
        "divide" => a / b,
        "subtract" => a - b,
        "remainder" => a % b,
        "floor" => a.floor(),
        "multiply" => numbers.iter().product(),
        "round" => {
            let floor = a.floor();
            if a - floor >= 0.5 { floor + 1.0 } else { floor }
        }
        "min" | "max" if numbers.iter().any(|n| n.is_nan()) => f64::NAN,
        "min" => numbers.into_iter().fold(f64::INFINITY, f64::min),
        "max" => numbers.into_iter().fold(f64::NEG_INFINITY, f64::max),
        "less" => return Ok(json!(a < b)),
        "greater" => return Ok(json!(a > b)),
        "lessEqual" => return Ok(json!(a <= b)),
        "greaterEqual" => return Ok(json!(a >= b)),
        _ => return Err(fail(format!("unsupported number.calculate operation {operation}"))),
    };
    numeric_result(result)
}

fn numeric_result(result: f64) -> Result<Value> {
    if !result.is_finite() { return Err(fail("Nonfinite numeric result")); }
    if result.fract() == 0.0 && result.abs() <= 9_007_199_254_740_991.0 {
        return Ok(json!(result as i64));
    }
    Ok(json!(result))
}

fn decimal_pattern(value: &str, whole: usize, fraction: usize) -> bool {
    let digits = |text: &str, maximum| (1..=maximum).contains(&text.len())
        && text.bytes().all(|byte| byte.is_ascii_digit());
    match value.split_once('.') {
        Some((left, right)) => digits(left, whole) && digits(right, fraction),
        None => digits(value, whole),
    }
}

fn date_pattern(value: &str) -> bool {
    let [y1, y2, y3, y4, b'-', m1, m2, b'-', d1, d2] = value.as_bytes() else { return false; };
    let digits = [y1, y2, y3, y4, m1, m2, d1, d2];
    if *y1 == b'0' || !digits.iter().all(|digit| digit.is_ascii_digit()) { return false; }
    let pair = |left, right| (left - b'0') * 10 + right - b'0';
    (1..=12).contains(&pair(*m1, *m2)) && (1..=31).contains(&pair(*d1, *d2))
}

fn bounded_match(value: &str, pattern: &str, flags: &str) -> Result<bool> {
    let mut chars = value.bytes();
    match (pattern, flags) {
        ("^[a-zA-Z][a-zA-Z0-9-]*$", "") => return Ok(chars.next().is_some_and(|b| b.is_ascii_alphabetic())
            && chars.all(|b| b.is_ascii_alphanumeric() || b == b'-')),
        ("^[a-zA-Z_:][a-zA-Z0-9_:.-]*$", "") => return Ok(chars.next().is_some_and(|b| b.is_ascii_alphabetic() || b"_:".contains(&b))
            && chars.all(|b| b.is_ascii_alphanumeric() || b"_:.-".contains(&b))),
        ("^[a-f0-9]{64}$", "") => return Ok(value.len() == 64
            && value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))),
        (r"^https?://[^\s]+$", "") => {
            let rest = value.strip_prefix("https://").or_else(|| value.strip_prefix("http://"));
            return Ok(rest.is_some_and(|rest| !rest.is_empty() && !rest.chars().any(js_space)));
        }
        ("^[A-Za-z][A-Za-z0-9_.-]{0,63}$", "") => return Ok(value.len() <= 64
            && chars.next().is_some_and(|b| b.is_ascii_alphabetic())
            && chars.all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))),
        ("^on", "i") => return Ok(value.as_bytes().get(..2).is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"on"))),
        ("^\\s*(javascript|data):", "i") => {
            let text = value.trim_start_matches(js_space).to_ascii_lowercase();
            return Ok(text.starts_with("javascript:") || text.starts_with("data:"));
        }
        ("^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$", "") =>
            return Ok(date_pattern(value)),
        ("^[0-9]{1,2}([.][0-9]{1,2})?$", "") => return Ok(decimal_pattern(value, 2, 2)),
        ("^[0-9]{1,9}([.][0-9]{1,4})?$", "") => return Ok(decimal_pattern(value, 9, 4)),
        ("^[0-9]{1,9}$", "") => return Ok(decimal_pattern(value, 9, 0)),
        (_, "") => (),
        _ => return Err(fail("unsupported-pattern")),
    }
    let (minimum, maximum) = pattern.strip_prefix(r"^[\s\S]{")
        .and_then(|pattern| pattern.strip_suffix("}$"))
        .and_then(|bounds| bounds.split_once(','))
        .ok_or_else(|| fail("unsupported-pattern"))?;
    let minimum = match minimum { "0" => 0, "1" => 1, _ => return Err(fail("unsupported-pattern")) };
    let maximum = maximum.parse::<usize>().ok().filter(|n| (minimum..=160_000).contains(n))
        .ok_or_else(|| fail("unsupported-pattern"))?;
    Ok((minimum..=maximum).contains(&value.encode_utf16().count()))
}

fn value(expr: &Expr, env: &Env, meter: &mut Meter) -> Result<Value> {
    meter.charge(1)?;
    match expr {
        Expr::Literal(v) => Ok(v.clone()),
        Expr::Ref(path) => {
            let mut current = env.get(&path[0]).map(Rc::as_ref).ok_or_else(|| fail(format!("unknown binding {}", path[0])))?;
            for (index, key) in path[1..].iter().enumerate() {
                if !current.is_object() || is_absent(current) { return Err(fail("invalid reference path")); }
                if let Some(value) = current.get(key) { current = value; }
                else if index + 2 == path.len() { return Ok(absent()); }
                else { return Err(fail("invalid reference path")); }
            }
            Ok(current.clone())
        }
        Expr::Record(fields) => Ok(Value::Object(fields.iter()
            .map(|(key, expr)| Ok((key.clone(), value(expr, env, meter)?)))
            .collect::<Result<Map<_, _>>>()?)),
        Expr::Apply(op, args) => {
            let get = |index, meter: &mut Meter| value(&args[index], env, meter);
            match op.as_str() {
                "if" => get(if truth(&get(0, meter)?) { 1 } else { 2 }, meter),
                "or" => {
                    // The reference lowers or to a fold over an evaluated
                    // argument list and retains its first truthy value.
                    let mut first = Value::Null;
                    for arg in args {
                        let candidate = value(arg, env, meter)?;
                        if !truth(&first) && truth(&candidate) { first = candidate; }
                    }
                    Ok(first)
                }
                "and" => {
                    let mut last = json!(true);
                    for arg in args {
                        last = value(arg, env, meter)?;
                        if !truth(&last) { break; }
                    }
                    Ok(last)
                }
                "count" => {
                    let input = get(0, meter)?;
                    if let Some(text) = input.as_str() { Ok(json!(text.encode_utf16().count())) }
                    else if let Some(list) = input.as_array() { Ok(json!(list.len())) }
                    else { Ok(absent()) }
                }
                "fold" => {
                    let input = get(0, meter)?;
                    let binding = get(1, meter)?;
                    let accumulator = get(2, meter)?;
                    let binding = text(&binding)?;
                    let accumulator = text(&accumulator)?;
                    if binding == accumulator { return Err(fail("fold bindings must differ")); }
                    let mut result = get(3, meter)?;
                    let mut local = env.clone();
                    for item in list(&input)? {
                        local.insert(binding.to_owned(), Rc::new(item.clone()));
                        local.insert(accumulator.to_owned(), Rc::new(result));
                        result = value(&args[4], &local, meter)?;
                    }
                    Ok(result)
                }
                "add" => numeric_result(numeric_input(&get(0, meter)?) + numeric_input(&get(1, meter)?)),
                "distinct" => {
                    let input = get(0, meter)?;
                    let mut result = Vec::new();
                    for row in list(&input)? {
                        if !result.contains(row) { result.push(row.clone()); }
                    }
                    Ok(Value::Array(result))
                }
                "range" => {
                    let end = index(&get(0, meter)?)?;
                    if end > 20_000 { return Err(fail("range limit")); }
                    meter.charge(end)?;
                    Ok(json!((1..=end).collect::<Vec<_>>()))
                }
                "list" => Ok(Value::Array(args.iter().map(|arg| value(arg, env, meter)).collect::<Result<_>>()?)),
                "concat" => {
                    let mut result = String::new();
                    for arg in args {
                        let part = value(arg, env, meter)?;
                        result.push_str(&join_part(&part));
                    }
                    Ok(json!(result))
                }
                "eq" => {
                    let left = get(0, meter)?;
                    let right = get(1, meter)?;
                    Ok(json!(if left.is_number() && right.is_number() {
                        left.as_f64() == right.as_f64()
                    } else { left == right }))
                }
                "not" => Ok(json!(!truth(&get(0, meter)?))),
                "includes" => {
                    let input = get(0, meter)?;
                    let item = get(1, meter)?;
                    if let Some(text) = input.as_str() { Ok(json!(text.contains(&js_string(&item)))) }
                    else { Ok(json!(list(&input)?.contains(&item))) }
                }
                "append" => {
                    let mut left = list(&get(0, meter)?)?.to_vec();
                    left.extend_from_slice(list(&get(1, meter)?)?);
                    Ok(Value::Array(left))
                }
                "at" => {
                    let collection = get(0, meter)?;
                    let key = get(1, meter)?;
                    let result = if let Some(index) = key.as_u64() {
                        if let Some(text) = collection.as_str() {
                            return Ok(text.encode_utf16().nth(index as usize).map(|unit|
                                json!(String::from_utf16_lossy(&[unit]))).unwrap_or_else(absent));
                        }
                        collection.get(index as usize)
                    }
                        else { collection.get(text(&key)?) };
                    Ok(result.cloned().unwrap_or_else(absent))
                }
                "map" | "filter" | "every" | "some" => {
                    let input = get(0, meter)?;
                    let binding = get(1, meter)?;
                    let binding = text(&binding)?;
                    let mut result = Vec::new();
                    for item in list(&input)? {
                        let mut local = env.clone();
                        local.insert(binding.to_owned(), Rc::new(item.clone()));
                        let selected = value(&args[2], &local, meter)?;
                        if op == "map" { result.push(selected); }
                        else if op == "filter" && truth(&selected) { result.push(item.clone()); }
                        else if op == "every" && !truth(&selected) { return Ok(json!(false)); }
                        else if op == "some" && truth(&selected) { return Ok(json!(true)); }
                    }
                    match op.as_str() {
                        "every" => Ok(json!(true)),
                        "some" => Ok(json!(false)),
                        _ => Ok(Value::Array(result)),
                    }
                }
                _ => Err(fail("unsupported expression")),
            }
        }
    }
}
