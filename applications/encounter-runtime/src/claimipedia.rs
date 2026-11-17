// Selects the release-only application profile. There is no store binding.
use crate::{Result, fail, application::Application, http, profile, rel::Facts, web::Page};
use serde_json::json;

const PROFILE: &str = "profiles/claimipedia-web.rel";

pub fn serve(port: u16) -> Result<()> {
    let root = profile::root().canonicalize()?;
    let applications = root.parent().ok_or_else(|| fail("missing applications root"))?;
    let web = Facts::read(&profile::contained(&root, PROFILE)?)?;
    let projects = applications.parent().and_then(|platform| platform.parent())
        .ok_or_else(|| fail("missing workspace projects root"))?;
    let shared_applications = projects.join("applications");
    let application = web.one("web", "applicationRoot")?;
    let application_root = shared_applications.join(application);
    if application_root.parent() != Some(shared_applications.as_path())
        || application_root.canonicalize()? != application_root
        || !application_root.is_dir()
    {
        return Err(fail("Claimipedia root must be a direct directory in the shared application checkout"));
    }
    crate::package::check(&application_root)?;
    let app = Application::load(&application_root, web.one("web", "application")?)?;
    let application_prefix = format!("{application}/");
    let page = Page::from_profile(&web, Some(app.release()?), |name| {
        if let Some(relative) = name.strip_prefix(&application_prefix) {
            profile::contained(&application_root, relative)
        } else {
            profile::contained(applications, name)
        }
    })?;
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
