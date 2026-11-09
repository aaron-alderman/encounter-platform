// Shared HTTP adapter for the declared app.newSession/app.request/ui.styles ABI.
use crate::{Result, application::Application, attachment::Mount, fail, http, image::LoadedImage, process::{Meter, Programme}, store::Store, web::nonce};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::{BTreeMap, BTreeSet}, path::Path};

struct Session {
    csrf: String,
    state: Value,
}

pub fn serve(root: &Path, declaration: &str, directory: &Path, port: u16) -> Result<()> {
    let app = Application::load(root, declaration)?;
    let mut meter = Meter::new(20_000_000);
    let programme = app.admit_browser(&mut meter)?;
    serve_programme(app, programme, meter, directory, port, None)
}

pub fn serve_image(mut image: LoadedImage, directory: &Path, port: u16, attachment_root: Option<&Path>) -> Result<()> {
    image.app.bind_browser(&mut image.programme)?;
    let mount = if let Some(root) = attachment_root {
        if !image.app.has_entry("app.attachment") {
            return Err(fail("an attachment mount requires the declared app.attachment entry"));
        }
        image.programme.require_grants("app.attachment", &BTreeSet::from(["application.data", "kernel.invoke"]))?;
        Some(Mount::open(root)?)
    } else { None };
    serve_programme(image.app, image.programme, image.meter, directory, port, mount)
}

fn serve_programme(app: Application, mut programme: Programme, meter: Meter,
    directory: &Path, port: u16, mount: Option<Mount>) -> Result<()>
{
    let styles = programme.run("ui.styles", Value::Null, &mut meter.clone())?;
    let styles = styles.as_str().ok_or_else(|| fail("expected stylesheet text"))?;
    programme.bind_store(Store::open(directory, &app.state_profile, &app.basis)?);
    let sessions = RefCell::new(BTreeMap::<String, Session>::new());

    http::serve(port, |origin, stream, request| {
        let header = |name| request.headers.get(name).map(String::as_str);
        let (path, query) = request.path.split_once('?').unwrap_or((&request.path, ""));
        if request.method == "GET" && path == "/styles.css" {
            return http::send(stream, "200 OK", "text/css", styles);
        }
        if let Some(id) = path.strip_prefix("/attachments/") {
            if request.method != "GET" {
                return http::send(stream, "405 Method Not Allowed", "text/plain", "Expected GET.");
            }
            if let Some(mount) = &mount
                && !id.is_empty() && id.len() <= 128
                && id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
            {
                let descriptor = programme.run("app.attachment", json!(id), &mut meter.clone())?;
                if let Ok(file) = mount.read(&descriptor) {
                    let headers = format!("Content-Disposition: {}\r\n", file.disposition);
                    return http::send_bytes(stream, "200 OK", "application/octet-stream", &headers, &file.body);
                }
            }
            return http::send(stream, "404 Not Found", "text/plain", "Attachment unavailable.");
        }
        let body = match request.method.as_str() {
            "GET" => query.as_bytes(),
            "POST" => {
                if header("origin") != Some(origin) {
                    return http::send(stream, "403 Forbidden", "text/plain", "Wrong origin.");
                }
                if header("content-type") != Some("application/x-www-form-urlencoded") {
                    return http::send(stream, "415 Unsupported Media Type", "text/plain", "Expected a form.");
                }
                request.body.as_slice()
            }
            _ => return http::send(stream, "405 Method Not Allowed", "text/plain", "Expected GET or POST."),
        };
        let Ok(mut fields) = http::form(body) else {
            return http::send(stream, "400 Bad Request", "text/plain", "Invalid form.");
        };
        let cookie_name = format!("encounter_{}", origin.rsplit(':').next().unwrap_or_default());
        let id = header("cookie").and_then(|cookies| {
            cookies.split(';').filter_map(|cookie| cookie.trim().split_once('='))
                .find_map(|(key, value)| (key == cookie_name).then_some(value))
        });
        let mut sessions = sessions.borrow_mut();
        let mut response_headers = String::new();
        let mut meter = meter.clone();
        let session = match id.and_then(|id| sessions.get_mut(id)) {
            Some(session) => session,
            None => {
                if request.method == "POST" {
                    return http::send(stream, "403 Forbidden", "text/plain", "Open the workspace first.");
                }
                if sessions.len() >= 1024 {
                    return http::send(stream, "503 Service Unavailable", "text/plain", "Session capacity reached.");
                }
                let id = nonce()?;
                let csrf = nonce()?;
                let state = programme.run("app.newSession", Value::Null, &mut meter)?;
                response_headers = format!("Set-Cookie: {cookie_name}={id}; HttpOnly; SameSite=Strict; Path=/\r\n");
                sessions.entry(id).or_insert(Session { csrf, state })
            }
        };
        if request.method == "POST" && fields.remove("_csrf").as_deref() != Some(&session.csrf) {
            return http::send(stream, "403 Forbidden", "text/plain", "Wrong session.");
        }
        let mut input = json!({
            "method":request.method,"path":path,"fields":fields,"session":session.state,
            "snapshot":programme.snapshot()?,"csrf":session.csrf,"nonce":nonce()?,
            "basis":app.basis,"profile":app.state_profile
        });
        if app.has_entry("app.attachment") {
            input["attachments"] = json!(mount.is_some());
        }
        let result = programme.run("app.request", input, &mut meter)?;
        let html = result["html"].as_str().ok_or_else(|| fail("expected application HTML"))?;
        session.state = result["session"].clone();
        http::send_headers(stream, "200 OK", "text/html", &response_headers, html)
    })
}
