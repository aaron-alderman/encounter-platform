use crate::{
    Result, fail, http,
    process::{Meter, Programme},
    profile::{self, Profile},
    rel::{Facts, pinned},
    workgarden,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    net::TcpStream,
    path::Path,
};

const HTML: &str = "text/html";
const TEXT: &str = "text/plain";

pub(crate) fn nonce() -> Result<String> {
    let mut bytes = [0; 24];
    getrandom::getrandom(&mut bytes).map_err(|error| fail(error.to_string()))?;
    Ok(hex::encode(bytes))
}

fn escape(text: &str, html: &mut String) {
    for c in text.chars() {
        match c {
            '&' => html.push_str("&amp;"),
            '<' => html.push_str("&lt;"),
            '>' => html.push_str("&gt;"),
            '"' => html.push_str("&quot;"),
            _ => html.push(c),
        }
    }
}

// Generic serialization for the small safe node vocabulary used by this profile.
fn serialize(value: &Value, html: &mut String) -> Result<()> {
    match value {
        Value::Null => (),
        Value::String(text) => escape(text, html),
        Value::Array(nodes) => {
            for node in nodes {
                serialize(node, html)?;
            }
        }
        Value::Object(node) => {
            let tag = node.get("tag").and_then(Value::as_str).ok_or_else(|| fail("missing tag"))?;
            if !matches!(tag, "html" | "head" | "meta" | "title" | "body" | "main" | "h1" | "h2"
                | "p" | "section" | "ul" | "li" | "form" | "label" | "input" | "button" | "a" | "strong")
            {
                return Err(fail("unsupported HTML tag"));
            }
            html.push('<');
            html.push_str(tag);
            for (key, value) in node["attrs"].as_object().ok_or_else(|| fail("missing attributes"))? {
                let safe = match key.as_str() {
                    "action" => tag == "form" && value == "/",
                    "method" => tag == "form" && (value == "post" || value == "get"),
                    "href" => tag == "a" && value.as_str().is_some_and(|url|
                        url.starts_with('/') && !url.starts_with("//") && !url.contains('\\')
                        && !url.chars().any(char::is_control)),
                    "aria-label" => true,
                    "lang" | "charset" | "name" | "content" | "role" | "class" | "value"
                    | "type" | "required" | "maxlength" => true,
                    _ => false,
                };
                if !safe {
                    return Err(fail("unsupported HTML attribute"));
                }
                html.push(' ');
                html.push_str(key);
                if value != true {
                    html.push_str("=\"");
                    if let Some(text) = value.as_str() {
                        escape(text, html);
                    } else if value.is_number() {
                        html.push_str(&value.to_string());
                    } else {
                        return Err(fail("unsupported HTML attribute value"));
                    }
                    html.push('"');
                }
            }
            html.push('>');
            if !matches!(tag, "meta" | "input") {
                serialize(&node["children"], html)?;
                html.push_str("</");
                html.push_str(tag);
                html.push('>');
            }
        }
        _ => return Err(fail("unsupported HTML node")),
    }
    Ok(())
}

pub struct Page {
    programme: Programme,
    entry: String,
}

impl Page {
    pub fn load(declaration: &str, data: Option<Value>) -> Result<Self> {
        Self::load_in(&profile::root(), declaration, data)
    }

    fn load_in(root: &Path, declaration: &str, data: Option<Value>) -> Result<Self> {
        let root = root.canonicalize()?;
        let applications = root.parent().ok_or_else(|| fail("missing applications root"))?;
        let facts = Facts::read(&profile::contained(&root, declaration)?)?;
        let grants: BTreeSet<_> = facts.values("web", "grant").into_iter().collect();
        let sources = facts.values("web", "module").into_iter().map(|name| {
            pinned(&profile::contained(applications, name)?, facts.one(name, "sha256")?)
        }).collect::<Result<Vec<_>>>()?;
        let entry = facts.one("web", "entry")?.to_owned();
        let mut programme = Programme::admit(&sources, &entry, &grants, &mut Meter::new(20_000_000))?;
        if let Some(data) = data { programme.bind_data(data); }
        Ok(Self { programme, entry })
    }

    pub fn render(&self, input: Value) -> Result<String> {
        let node = self.programme.run(&self.entry, input, &mut Meter::new(20_000_000))?;
        let mut html = String::from("<!doctype html>");
        serialize(&node, &mut html)?;
        Ok(html)
    }
}

struct Server<'a> {
    page: Page,
    profile: Profile,
    journal: &'a Path,
    secret: String,
}

impl Server<'_> {
    fn handle(&self, origin: &str, stream: &mut TcpStream, request: http::Request) -> Result<()> {
        let header = |key| request.headers.get(key).map(String::as_str);
        if request.path != "/" {
            return http::send(stream, "404 Not Found", TEXT, "Open Workgarden at /.");
        }

        let (status, notice, error) = match request.method.as_str() {
            "GET" => ("200 OK", "", false),
            "POST" => {
                if header("origin") != Some(origin) {
                    return http::send(stream, "403 Forbidden", TEXT, "Wrong origin.");
                }
                if header("content-type") != Some("application/x-www-form-urlencoded") {
                    return http::send(stream, "415 Unsupported Media Type", TEXT, "Expected a form.");
                }
                let Ok(fields) = http::form(&request.body) else {
                    return http::send(stream, "400 Bad Request", TEXT, "Invalid form.");
                };
                let field = |key| fields.get(key).map(String::as_str);
                let csrf = field("_csrf").and_then(|value| value.split_once('.'));
                let Some((_, operation)) = csrf.filter(|(secret, op)| {
                    *secret == self.secret && op.len() == 48
                        && op.bytes().all(|byte| byte.is_ascii_hexdigit())
                }) else {
                    return http::send(stream, "403 Forbidden", TEXT, "Reopen the board and try again.");
                };
                let (Some(basis), Some(title)) = (field("base"), field("title")) else {
                    return http::send(stream, "400 Bad Request", TEXT, "Incomplete form.");
                };
                if fields.len() != 4 || field("action") != Some("add") || !basis.starts_with("state:sha256:") {
                    return http::send(stream, "400 Bad Request", TEXT, "Choose Add work item.");
                }
                match workgarden::run(&self.profile, self.journal, basis, operation, title) {
                    Ok(result) if result["outcome"] == "accepted" => ("200 OK", "Work item added.", false),
                    Ok(_) => ("409 Conflict", "Temple3 rejected the proposed change.", true),
                    Err(error) => match error.to_string().as_str() {
                        "stale-basis" | "operation-conflict" => ("409 Conflict",
                            "This view is out of date. Review the current board and try again.", true),
                        "board-capacity" => ("409 Conflict", "This board is full.", true),
                        "Enter a nonblank name within the field's character limit." | "input-too-large" =>
                            ("422 Unprocessable Content", "Enter a nonblank name within the field's character limit.", true),
                        _ => return Err(error),
                    },
                }
            }
            _ => return http::send(stream, "405 Method Not Allowed", TEXT, "Expected GET or POST."),
        };
        let board = workgarden::snapshot(&self.profile, self.journal)?;
        let csrf = format!("{}.{}", self.secret, nonce()?);
        let body = self.page.render(json!({
            "basis":board.basis, "items":board.items, "canAdd":board.can_add, "csrf":csrf,
            "notice":notice, "error":error
        }))?;
        http::send(stream, status, HTML, &body)
    }
}

pub fn serve(journal: &Path, port: u16) -> Result<()> {
    serve_in(&profile::root(), journal, port)
}

pub fn serve_in(root: &Path, journal: &Path, port: u16) -> Result<()> {
    let page = Page::load_in(root, "profiles/workgarden-web.rel", None)?;
    let profile = Profile::load(root)?;
    workgarden::snapshot(&profile, journal)?;
    let server = Server { page, profile, journal, secret: nonce()? };
    http::serve(port, |origin, stream, request| server.handle(origin, stream, request))
}
