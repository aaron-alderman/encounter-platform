// Canonical instruction representation for the exact, pinned runtime.
// This codec is internal to the verified application-image loader.
use super::{Expr, Meter, Programme, Step, callees, operator_arity};
use crate::{Result, fail};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

fn expression(expr: &Expr) -> Value {
    match expr {
        Expr::Literal(value) => json!(["literal", value]),
        Expr::Ref(path) => json!(["ref", path]),
        Expr::Record(fields) => json!(["record", fields.iter()
            .map(|(key, value)| json!([key, expression(value)])).collect::<Vec<_>>()]),
        Expr::Apply(name, args) => json!(["apply", name, args.iter().map(expression).collect::<Vec<_>>()]),
    }
}

fn steps(body: &[Step]) -> Vec<Value> {
    body.iter().map(|step| match step {
        Step::Let(name, value) => json!(["let", name, expression(value)]),
        Step::Assert(test, message) => json!(["assert", expression(test), message]),
        Step::When(test, body) => json!(["when", expression(test), steps(body)]),
        Step::Call(name) => json!(["call", name]),
        Step::Each { items, item, body } => json!(["each", expression(items), item, steps(body)]),
        Step::Try { body, error, catch } => json!(["try", steps(body), error, steps(catch)]),
        Step::Fold { items, item, accumulator, initial, body, yielded, into } =>
            json!(["fold", expression(items), item, accumulator, expression(initial),
                steps(body), expression(yielded), into]),
        Step::Port { name, args, into } => json!(["port", name, expression(args), into]),
    }).collect()
}

fn array(value: &Value) -> Result<&[Value]> {
    value.as_array().map(Vec::as_slice).ok_or_else(|| fail("expected compiled instruction array"))
}

fn text(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(|| fail("expected compiled instruction text"))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}

fn name(value: &Value) -> Result<String> {
    let name = text(value)?;
    if !valid_name(name) { return Err(fail("invalid compiled name")); }
    Ok(name.to_owned())
}

fn read_expression(node: &Value, depth: usize) -> Result<Expr> {
    if depth > 32 { return Err(fail("compiled expression depth")); }
    let (tag, args) = array(node)?.split_first().ok_or_else(|| fail("empty compiled expression"))?;
    match (text(tag)?, args) {
        ("literal", [value]) if !value.is_object() && !value.is_array() =>
            Ok(Expr::Literal(value.clone())),
        ("ref", [path]) => {
            let path = array(path)?.iter().map(name).collect::<Result<Vec<_>>>()?;
            if path.is_empty() || path.iter().any(|part| part.contains('.')) {
                return Err(fail("invalid compiled reference path"));
            }
            Ok(Expr::Ref(path))
        }
        ("record", [fields]) => {
            let mut names = BTreeSet::new();
            let mut result = Vec::new();
            for field in array(fields)? {
                let [key, value] = array(field)? else { return Err(fail("invalid compiled field")); };
                let key = text(key)?;
                if key.contains('\0') || !names.insert(key) { return Err(fail("invalid compiled field key")); }
                result.push((key.to_owned(), read_expression(value, depth + 1)?));
            }
            Ok(Expr::Record(result))
        }
        ("apply", [op, args]) => {
            let op = text(op)?;
            let args = array(args)?;
            if !operator_arity(op, args.len()) {
                return Err(fail(format!("invalid compiled operator {op}")));
            }
            Ok(Expr::Apply(op.to_owned(), args.iter()
                .map(|arg| read_expression(arg, depth + 1)).collect::<Result<_>>()?))
        }
        _ => Err(fail("invalid compiled expression")),
    }
}

fn read_steps(body: &Value, depth: usize) -> Result<Vec<Step>> {
    if depth > 16 { return Err(fail("compiled block depth")); }
    let expr = |node| read_expression(node, 0);
    let block = |node| read_steps(node, depth + 1);
    array(body)?.iter().map(|node| {
        let values = array(node)?;
        let Some((tag, args)) = values.split_first() else {
            return Err(fail("empty compiled instruction"));
        };
        Ok(match (text(tag)?, args) {
            ("let", [key, value]) => Step::Let(name(key)?, expr(value)?),
            ("assert", [test, message]) => Step::Assert(expr(test)?, text(message)?.to_owned()),
            ("when", [test, body]) => Step::When(expr(test)?, block(body)?),
            ("call", [query]) => Step::Call(name(query)?),
            ("each", [items, item, body]) => Step::Each { items: expr(items)?, item: name(item)?, body: block(body)? },
            ("try", [body, error, catch]) => Step::Try { body: block(body)?, error: name(error)?, catch: block(catch)? },
            ("fold", [items, item, accumulator, initial, body, yielded, into]) => Step::Fold {
                items: expr(items)?, item: name(item)?, accumulator: name(accumulator)?, initial: expr(initial)?,
                body: block(body)?, yielded: expr(yielded)?, into: name(into)?,
            },
            ("port", [port, args, into]) => Step::Port { name: name(port)?, args: expr(args)?, into: name(into)? },
            _ => return Err(fail("invalid compiled instruction")),
        })
    }).collect()
}

impl Programme {
    pub(crate) fn compiled(&self) -> Value {
        json!(self.steps.iter().map(|(name, body)| (name, steps(body))).collect::<BTreeMap<_, _>>())
    }

    pub(crate) fn from_compiled(
        compiled: &Value, entries: &[&str], grants: &BTreeSet<&str>, source_bytes: usize, meter: &mut Meter,
    ) -> Result<Self> {
        // Preserve the source-admission charge in the request meter.
        meter.charge(source_bytes)?;
        let mut steps = BTreeMap::new();
        let mut graph = BTreeMap::new();
        for (name, body) in compiled.as_object().ok_or_else(|| fail("expected compiled programme"))? {
            if !valid_name(name) { return Err(fail("invalid compiled process name")); }
            let body = read_steps(body, 0)?;
            if body.is_empty() { return Err(fail("empty compiled process")); }
            let mut calls = Vec::new();
            callees(&body, grants, &mut calls)?;
            graph.insert(name.clone(), calls);
            steps.insert(name.clone(), body);
        }
        let mut pending: Vec<&str> = entries.to_vec();
        let mut reached = BTreeSet::new();
        while let Some(name) = pending.pop() {
            if reached.insert(name) {
                let targets = graph.get(name).ok_or_else(|| fail(format!("missing compiled process {name}")))?;
                pending.extend(targets.iter().map(String::as_str));
            }
        }
        if reached.len() != steps.len() { return Err(fail("unreachable compiled processes")); }
        Ok(Self { steps, datasets: BTreeMap::new(), store: None, catalogue: None })
    }
}
