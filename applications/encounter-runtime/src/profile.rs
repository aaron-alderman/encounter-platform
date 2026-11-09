use crate::{Result, fail, process::{Meter, Programme}, rel::{Facts, hash, pinned}};
use serde_json::{Value, json};
use std::{collections::BTreeSet, fs, path::{Path, PathBuf}};
use temple3::predicate::{eq, literal, read};

pub fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")) }

pub struct Profile {
    pub id: String,
    pub basis: String,
    pub actor: String,
    pub relation: String,
    pub state_kind: String,
    pub covenant: Value,
    entry: String,
    programme: Programme,
    meter: Meter,
}

pub(crate) fn contained(root: &Path, name: &str) -> Result<PathBuf> {
    let path = root.join(name).canonicalize()?;
    if !path.starts_with(root) || !path.is_file() { return Err(fail("declared path outside workspace")); }
    Ok(path)
}

fn covenant(facts: &Facts, actor: &str, relation: &str) -> Result<Value> {
    let path = |s: &str| read(&s.split('.').collect::<Vec<_>>());
    let mut clauses = Vec::new();
    for [subject, operation, object] in &facts.0 {
        let left = path(subject);
        clauses.push(match operation.as_str() {
            "equalsPath" => eq(left, path(object)),
            "equalsText" => eq(left, literal(json!(object))),
            "equalsActor" if object == "profile" => eq(left, literal(json!(actor))),
            "equalsRelation" if object == "profile" => eq(left, literal(json!(relation))),
            "isNull" if object.is_empty() => eq(left, literal(Value::Null)),
            "verifyWith" => json!({"op":"verify","statement":left,"proof":path(object)}),
            _ => return Err(fail("unsupported covenant clause")),
        });
    }
    let predicate = json!({"op":"all","values":clauses});
    temple3::predicate::validate(&predicate)?;
    Ok(predicate)
}

impl Profile {
    pub fn load(root: &Path) -> Result<Self> {
        let root = root.canonicalize()?;
        let applications = root.parent().ok_or_else(|| fail("missing applications root"))?;
        let bootstrap_text = fs::read_to_string(root.join("bootstrap/bootstrap.rel"))?;
        let bootstrap = Facts::parse(&bootstrap_text)?;
        if bootstrap.one("bootstrap", "version")? != "encounter/bootstrap/1"
            || bootstrap.one("bootstrap", "executionProfile")? != "encounter/source-command/1"
            || bootstrap.one("bootstrap", "meter")? != "shared-source-and-evaluation-steps/1"
            || bootstrap.one("bootstrap", "limit")? != "20000000"
        { return Err(fail("unsupported bootstrap")); }
        let mut meter = Meter::new(20_000_000);
        let foundation = crate::application::read_foundation_manifest(&applications.join("encounter-work-boards"))?;
        if hash(&foundation) != bootstrap.one("bootstrap", "referenceFoundationSha256")? {
            return Err(fail("reference foundation manifest differs from its pin"));
        }
        let ports_text = fs::read_to_string(contained(&root, bootstrap.one("bootstrap", "ports")?)?)?;
        let ports = Facts::parse(&ports_text)?;
        if ports.one("ports", "version")? != "encounter/ports/1" {
            return Err(fail("unsupported port contract"));
        }
        let profile_text = fs::read_to_string(root.join("profiles/workgarden.rel"))?;
        let facts = Facts::parse(&profile_text)?;
        let grants = facts.values("profile", "grant").into_iter().collect::<BTreeSet<_>>();
        let adapter = facts.values("profile", "adapterGrant").into_iter().collect::<BTreeSet<_>>();
        if adapter != BTreeSet::from(["temple.snapshot", "temple.submit", "temple.operation"])
            || !grants.is_disjoint(&adapter)
        { return Err(fail("unsupported adapter grants")); }
        for name in grants.union(&adapter) {
            for property in ["input", "output", "effect", "failure"] {
                ports.one(name, property)?;
            }
        }
        let mut sources = Vec::new();
        for module in facts.values("profile", "module") {
            sources.push(pinned(&contained(applications, module)?, facts.one(module, "sha256")?)?);
        }
        let entry = facts.one("profile", "entry")?.to_owned();
        let programme = Programme::admit(&sources, &entry, &grants, &mut meter)?;
        let covenant_text = fs::read_to_string(contained(&root, facts.one("profile", "covenant")?)?)?;
        let relation = facts.one("profile", "relation")?.to_owned();
        let actor = facts.one("profile", "actor")?.to_owned();
        let covenant = covenant(&Facts::parse(&covenant_text)?, &actor, &relation)?;
        let basis = hash(temple3::canonical::canonical_json(&json!([
            hash(bootstrap_text), hash(ports_text), hash(profile_text), hash(covenant_text),
            sources.iter().map(hash).collect::<Vec<_>>()
        ]))?);
        Ok(Self {
            id: facts.one("profile", "id")?.to_owned(),
            state_kind: facts.one("profile", "stateKind")?.to_owned(),
            basis, actor, relation, covenant, entry, programme, meter,
        })
    }

    pub fn add(&self, items: Vec<Value>, id: &str, title: &str) -> Result<Value> {
        self.programme.run(&self.entry, json!({
            "state":{"items":items}, "fields":{"action":"add","title":title}, "id":id
        }), &mut self.meter.clone())
    }
}
