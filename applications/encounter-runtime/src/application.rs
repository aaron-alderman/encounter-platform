// Loads the declarations shared by the original JS application hosts.
use crate::{
    Result, fail,
    process::{Meter, Programme, supports_port},
    profile::contained,
    rel::{self, Facts},
};
use serde_json::{Value, json};
use std::{collections::{BTreeMap, BTreeSet}, fs, path::{Component, Path, PathBuf}};

pub struct Application {
    pub state_profile: String,
    pub basis: String,
    sources: Vec<String>,
    catalogue: Value,
    entries: Vec<String>,
    grants: BTreeSet<String>,
    datasets: BTreeMap<String, Dataset>,
}

struct Dataset {
    format: String,
    digest: String,
    value: Value,
}

fn optional<'a>(facts: &'a Facts, subject: &str, key: &str) -> Result<Option<&'a str>> {
    match facts.values(subject, key).as_slice() {
        [] => Ok(None),
        [value] => Ok(Some(value)),
        _ => Err(fail(format!("expected at most one {subject}.{key}"))),
    }
}

pub(crate) fn validate_path(relative: &str, extension: &str) -> Result<()> {
    if Path::new(relative).is_absolute() {
        return Err(fail("application paths must be relative to the application root"));
    }
    let path = Path::new(relative);
    if relative.is_empty() || relative.contains('\\') || path.components().any(|part|
        !matches!(part, Component::Normal(_)))
    {
        return Err(fail("expected a portable application path"));
    }
    if path.extension().and_then(|value| value.to_str()) != Some(extension) {
        return Err(fail(format!("expected .{extension} file for {relative}")));
    }
    Ok(())
}

fn read_disk(root: &Path, relative: &str, extension: &str, limit: usize) -> Result<(PathBuf, String)> {
    validate_path(relative, extension)?;
    let path = contained(root, relative)?;
    if fs::metadata(&path)?.len() > limit as u64 {
        return Err(fail(format!("application file size limit at {relative}")));
    }
    let text = fs::read_to_string(&path)?;
    if text.len() > limit { return Err(fail("application file size limit")); }
    Ok((path, text))
}

fn dataset(path: &str, text: &str, format: Option<&str>, pin: Option<&str>) -> Result<Dataset> {
    let digest = rel::hash(text);
    let format = format.unwrap_or("typed-rel");
    if (format == "rel-facts" && pin.is_none()) || pin.is_some_and(|pin| pin != digest) {
        return Err(fail(format!("application data hash differs from its pin at {path}")));
    }
    let value = match format {
        "rel-facts" => rel::relations(text)?,
        "typed-rel" => rel::application_data(text)?,
        _ => return Err(fail(format!("unsupported application data format {format}"))),
    };
    Ok(Dataset { format: format.to_owned(), digest, value })
}

impl Application {
    pub fn load(root: &Path, declaration: &str) -> Result<Self> {
        let root = root.canonicalize()?;
        Self::from_files(declaration, |path, extension, limit| read_disk(&root, path, extension, limit))
    }

    pub fn capture(root: &Path, declaration: &str) -> Result<(Self, BTreeMap<String, String>)> {
        let root = root.canonicalize()?;
        let mut files = BTreeMap::<String, (PathBuf, String)>::new();
        let application = Self::from_files(declaration, |path, extension, limit| {
            if let Some((resolved, text)) = files.get(path) {
                validate_path(path, extension)?;
                if text.len() > limit { return Err(fail("application file size limit")); }
                return Ok((resolved.clone(), text.clone()));
            }
            let file = read_disk(&root, path, extension, limit)?;
            files.insert(path.to_owned(), file.clone());
            Ok(file)
        })?;
        Ok((application, files.into_iter().map(|(name, (_, text))| (name, text)).collect()))
    }

    pub(crate) fn from_files(
        declaration: &str,
        mut read: impl FnMut(&str, &str, usize) -> Result<(PathBuf, String)>,
    ) -> Result<Self> {
        let (_, declaration) = read(declaration, "rel", 2_000_000)?;
        let facts = Facts::parse(&declaration)?;
        let app = "application";
        if optional(&facts, app, "contract")?.unwrap_or("encounter/application-declaration/1")
            != "encounter/application-declaration/1"
        {
            return Err(fail("unsupported application declaration contract"));
        }
        let state_profile = facts.one(app, "stateProfile")?.to_owned();
        let entries = facts.values(app, "entry");
        let modules = facts.values(app, "module");
        if state_profile.is_empty() || entries.is_empty() || modules.is_empty() {
            return Err(fail("application requires a state profile, modules, and entries"));
        }
        let mut paths = BTreeSet::new();
        let mut sources = Vec::new();
        let mut catalogue = Vec::new();
        for module in modules {
            let (path, source) = read(module, "encounter", 2_000_000)?;
            if !paths.insert(path) { return Err(fail("duplicate resolved application module")); }
            catalogue.push(json!({"path":module,"text":source}));
            sources.push(source);
        }
        let mut datasets = BTreeMap::new();
        let default = optional(&facts, app, "dataSource")?;
        let format = optional(&facts, app, "dataFormat")?;
        let pin = optional(&facts, app, "dataSha256")?;
        if let Some(path) = default {
            let (_, text) = read(path, "rel", 32_000_000)?;
            datasets.insert(String::new(), dataset(path, &text, format, pin)?);
        } else if format.is_some() || pin.is_some() {
            return Err(fail("default data format and pin require a data source"));
        }
        for name in facts.values(app, "dataset") {
            if !name.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
                || !name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            {
                return Err(fail("invalid dataset name"));
            }
            let subject = format!("data.{name}");
            let path = facts.one(&subject, "source")?;
            let (_, text) = read(path, "rel", 32_000_000)?;
            let value = dataset(path, &text, optional(&facts, &subject, "format")?,
                optional(&facts, &subject, "sha256")?)?;
            datasets.insert(name.to_owned(), value);
        }
        for [subject, property, _] in &facts.0 {
            let valid = if subject == app {
                matches!(property.as_str(), "contract" | "stateProfile" | "entry" | "module" | "grant" |
                    "dataSource" | "dataFormat" | "dataSha256" | "dataset")
            } else {
                subject.strip_prefix("data.").is_some_and(|name| !name.is_empty() && datasets.contains_key(name))
                    && matches!(property.as_str(), "source" | "format" | "sha256")
            };
            if !valid { return Err(fail(format!("unsupported application declaration field {subject}.{property}"))); }
        }
        let grants: BTreeSet<String> = facts.values(app, "grant").into_iter().map(str::to_owned).collect();
        if grants.contains("source.catalogue") {
            let (_, manifest) = read("bootstrap/foundation.rel", "rel", 2_000_000)?;
            let manifest = Facts::parse(&manifest)?;
            for module in manifest.values("foundation", "module") {
                let (path, source) = read(module, "encounter", 2_000_000)?;
                if !paths.insert(path) { return Err(fail("duplicate resolved catalogue module")); }
                if rel::hash(&source) != manifest.one(module, "sha256")? {
                    return Err(fail(format!("source pin mismatch at {module}")));
                }
                catalogue.push(json!({"path":module,"text":source}));
            }
        }
        let mut identity = json!({
            "declaration":rel::hash(&declaration),"modules":sources.iter().map(rel::hash).collect::<Vec<_>>(),
            "datasets":datasets.iter().map(|(key, dataset)| (key, &dataset.digest)).collect::<BTreeMap<_,_>>()
        });
        if grants.contains("source.catalogue") {
            identity["catalogue"] = json!(catalogue.iter().skip(sources.len()).map(|module|
                (module["path"].as_str().unwrap_or_default(), rel::hash(module["text"].as_str().unwrap_or_default())))
                .collect::<Vec<_>>());
        }
        let basis = rel::hash(serde_json::to_vec(&identity)?);
        Ok(Self {
            state_profile, basis, sources, catalogue:Value::Array(catalogue), entries: entries.into_iter().map(str::to_owned).collect(),
            grants, datasets,
        })
    }

    pub fn release(self) -> Result<Value> {
        let mut datasets = self.datasets;
        let dataset = datasets.remove("").ok_or_else(|| fail("missing default application dataset"))?;
        if dataset.format != "rel-facts" { return Err(fail("expected a pinned REL fact release")); }
        Ok(dataset.value)
    }

    pub fn has_entry(&self, name: &str) -> bool {
        self.entries.iter().any(|entry| entry == name)
    }

    pub fn admit_browser(&self, meter: &mut Meter) -> Result<Programme> {
        let mut programme = self.admit(meter)?;
        self.bind_browser(&mut programme)?;
        Ok(programme)
    }

    pub(crate) fn bind_browser(&self, programme: &mut Programme) -> Result<()> {
        let entries = ["app.newSession", "app.request", "ui.styles"];
        if entries.iter().any(|entry| !self.has_entry(entry)) {
            return Err(fail("expected the browser application entry points"));
        }
        if self.grants.contains("source.catalogue") {
            programme.bind_catalogue(self.catalogue.clone());
        }
        for (name, dataset) in &self.datasets {
            programme.bind_dataset(name.clone(), dataset.value.clone());
        }
        Ok(())
    }

    pub(crate) fn load_compiled(&self, compiled: &Value, meter: &mut Meter) -> Result<Programme> {
        let grants = self.checked_grants()?;
        let entries = self.entries.iter().map(String::as_str).collect::<Vec<_>>();
        Programme::from_compiled(compiled, &entries, &grants, self.sources.iter().map(String::len).sum(), meter)
    }

    fn checked_grants(&self) -> Result<BTreeSet<&str>> {
        let grants = self.grants.iter().map(String::as_str).collect::<BTreeSet<_>>();
        if let Some(port) = grants.iter().find(|name| !supports_port(name)) {
            return Err(fail(format!("unsupported declared grant: {port}")));
        }
        Ok(grants)
    }

    pub fn admit(&self, meter: &mut Meter) -> Result<Programme> {
        let grants = self.checked_grants()?;
        let entries = self.entries.iter().map(String::as_str).collect::<Vec<_>>();
        Programme::admit_entries(&self.sources, &entries, &grants, meter)
    }

    pub fn check(&self) -> Result<bool> {
        let grants = self.grants.iter().map(String::as_str).collect::<BTreeSet<_>>();
        let missing = grants.iter().copied().filter(|name| !supports_port(name)).collect::<Vec<_>>();
        let restricted = grants.iter().filter_map(|name| {
            let limit = match *name {
                "text.matches" => "bounded text lengths, HTML, Timesheet, identifiers, hex tokens and HTTP URL patterns only",
                "number.calculate" => "divide, subtract, remainder, multiply, round, floor, min, max and ordered comparisons only",
                "text.slice" => "nonnegative indices only",
                "source.observe" | "encounter.execute" => "one pure scalar expression with entry run",
                "text.split" => "LF and CRLF pattern only",
                _ => return None,
            };
            Some(json!({"port":name,"limit":limit}))
        }).collect::<Vec<_>>();
        let entries = self.entries.iter().map(|entry| {
            let error = Programme::admit(&self.sources, entry, &grants, &mut Meter::new(20_000_000))
                .err().map(|error| error.to_string());
            json!({"entry":entry,"admitted":error.is_none(),"blocker":error})
        }).collect::<Vec<_>>();
        let admitted = missing.is_empty() && entries.iter().all(|entry| entry["admitted"] == true);
        let syntax = Programme::syntax_inventory(&self.sources)?;
        println!("{}", serde_json::to_string_pretty(&json!({
            "stateProfile":self.state_profile,"modules":self.sources.len(),
            "datasets":self.datasets.iter().map(|(name, data)|
                json!({"name":name,"format":data.format,"sha256":data.digest})).collect::<Vec<_>>(),
            "entries":entries,"unboundGrants":missing,"limitedGrants":restricted,
            "moduleSyntaxInventory":syntax,"admitted":admitted
        }))?);
        Ok(admitted)
    }
}
