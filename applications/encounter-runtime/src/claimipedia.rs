// Selects the release-only application profile. There is no store binding.
use crate::{Result, fail, application::Application, http, profile, rel::Facts, web::Page};
use serde_json::json;

const PROFILE: &str = "profiles/claimipedia-web.rel";

pub fn serve(port: u16) -> Result<()> {
    let root = profile::root().canonicalize()?;
    let applications = root.parent().ok_or_else(|| fail("missing applications root"))?;
    let web = Facts::read(&root.join(PROFILE))?;
    let application_root = applications.join(web.one("web", "applicationRoot")?);
    if !application_root.canonicalize()?.starts_with(applications) {
        return Err(fail("application root outside workspace"));
    }
    let app = Application::load(&application_root, web.one("web", "application")?)?;
    let page = Page::load(PROFILE, Some(app.release()?))?;
    // Resolve the catalogue before advertising a listener.
    page.render(json!({"fields":{}}))?;

    http::serve(port, |_, stream, request| {
        if request.method != "GET" {
            return http::send(stream, "405 Method Not Allowed", "text/plain", "This view serves the pinned release.");
        }
        let (path, query) = request.path.split_once('?').unwrap_or((&request.path, ""));
        if path != "/" {
            return http::send(stream, "404 Not Found", "text/plain", "Open Claimipedia at /.");
        }
        let Ok(fields) = http::form(query.as_bytes()) else {
            return http::send(stream, "400 Bad Request", "text/plain", "Invalid search query.");
        };
        let body = page.render(json!({"fields":fields}))?;
        http::send(stream, "200 OK", "text/html", &body)
    })
}
