use crate::{Result, fail, rel, sqlite::Db};
use serde_json::{Value, json};
use std::{collections::BTreeSet, fs, path::Path};

pub struct Store {
    db: Db,
    profile: String,
    basis: String,
    #[cfg(feature = "test-faults")]
    cut: std::cell::Cell<Option<&'static str>>,
}

const RECEIPT: &str = "id AS revision,parent AS base,operation_id AS operationId,source_hash AS sourceHash,basis,profile,reason,target,goal,source,description";
const METADATA: [&str; 7] = ["basis", "profile", "reason", "target", "goal", "source", "description"];

impl Store {
    pub fn open(directory: &Path, profile: &str, basis: &str) -> Result<Self> {
        fs::create_dir_all(directory)?;
        let db = Db::open(&directory.join("workspace.sqlite"))?;
        db.exec(include_str!("revision-schema.sql"))?;
        let store = Self {
            db, profile: profile.to_owned(), basis: basis.to_owned(),
            #[cfg(feature = "test-faults")]
            cut: std::cell::Cell::new(match std::env::var("ENCOUNTER_TEST_CUT").as_deref() {
                Ok("before-commit") => Some("before-commit"),
                Ok("after-commit") => Some("after-commit"),
                Ok("") | Err(std::env::VarError::NotPresent) => None,
                _ => return Err(fail("unknown test fault stage")),
            }),
        };
        store.transaction(|| {
            if !store.db.query("PRAGMA table_info(revisions)", &[])?.iter().any(|col| col["name"] == "basis") {
                return Err(fail("pre-release store contract requires explicit migration"));
            }
            let rows = store.db.query("SELECT value FROM metadata WHERE key='profile'", &[])?;
            if let Some(row) = rows.first() {
                if row["value"] != profile { return Err(fail("store profile differs; explicit migration required")); }
            } else {
                store.db.query("INSERT INTO metadata VALUES('profile',?)", &[json!(profile)])?;
            }
            Ok(())
        })?;
        Ok(store)
    }

    fn transaction<T>(&self, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        self.db.exec("BEGIN IMMEDIATE")?;
        match operation().and_then(|result| { self.db.exec("COMMIT")?; Ok(result) }) {
            Ok(result) => Ok(result),
            Err(error) => {
                let _ = self.db.exec("ROLLBACK");
                Err(error)
            }
        }
    }

    #[cfg(feature = "test-faults")]
    fn inject_fault(&self, stage: &str) -> Result<()> {
        if self.cut.get() == Some(stage) {
            self.cut.set(None);
            return Err(fail("Engineered lost boundary response"));
        }
        Ok(())
    }

    fn head(&self) -> Result<i64> {
        self.db.query("SELECT COALESCE(MAX(id),0) AS head FROM revisions", &[])?
            .first().and_then(|row| row["head"].as_i64()).ok_or_else(|| fail("invalid revision head"))
    }

    pub fn snapshot(&self, revision: Option<&Value>) -> Result<Value> {
        let revision = match revision {
            Some(revision) => coordinate(revision)?,
            None => self.head()?,
        };
        if revision != 0 && self.db.query("SELECT id FROM revisions WHERE id=?", &[json!(revision)])?.is_empty() {
            return Err(fail("missing revision"));
        }
        let documents = self.db.query("SELECT path,text FROM documents WHERE revision=? ORDER BY path", &[json!(revision)])?;
        Ok(json!({"revision":revision,"documents":documents}))
    }

    pub fn operation(&self, id: &Value) -> Result<Value> {
        text(id)?;
        Ok(self.db.query(&format!("SELECT {RECEIPT} FROM revisions WHERE operation_id=?"), std::slice::from_ref(id))?
            .pop().unwrap_or(Value::Null))
    }

    pub fn history(&self) -> Result<Value> {
        let columns = RECEIPT.replace("parent AS base", "parent");
        Ok(json!(self.db.query(&format!("SELECT {columns},created FROM revisions ORDER BY id DESC"), &[])?))
    }

    pub fn cas(&self, input: &Value) -> Result<Value> {
        if input["profile"] != self.profile || input["basis"] != self.basis {
            return Err(fail("storage context/basis differs from its binding"));
        }
        let base = coordinate(&input["base"])?;
        text(&input["operationId"])?;
        for key in METADATA { text(&input[key])?; }
        let mut paths = BTreeSet::new();
        let mut documents = Vec::new();
        for doc in input["documents"].as_array().ok_or_else(|| fail("expected storage documents"))? {
            let path = text(&doc["path"])?;
            let body = text(&doc["text"])?;
            if !paths.insert(path) || body.len() > 1_048_576 { return Err(fail("duplicate or oversized document")); }
            documents.push(json!({"path":path,"text":body}));
        }
        documents.sort_by(|left, right| {
            let path = |doc: &Value| doc["path"].as_str().unwrap_or_default().encode_utf16().collect::<Vec<_>>();
            path(left).cmp(&path(right))
        });
        let source_hash = rel::hash(rel::encode(&json!(documents), "StaticValue")?);
        let receipt = self.transaction(|| {
            let prior = self.operation(&input["operationId"])?;
            if !prior.is_null() {
                if prior["sourceHash"] != source_hash || prior["base"] != base
                    || METADATA.iter().any(|key| prior[*key] != input[*key])
                {
                    return Err(fail("operation identity reused for different bytes or metadata"));
                }
                return Ok(prior);
            }
            if self.head()? != base { return Err(fail("compare-and-swap conflict")); }
            let next = coordinate(&json!(base + 1))?;
            self.db.query("INSERT INTO revisions(id,parent,operation_id,source_hash,reason,target,goal,source,description,created,basis,profile) VALUES(?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?)", &[
                json!(next), json!(base), input["operationId"].clone(), json!(source_hash),
                input["reason"].clone(), input["target"].clone(), input["goal"].clone(), input["source"].clone(),
                input["description"].clone(), input["basis"].clone(), input["profile"].clone()
            ])?;
            for doc in &documents {
                self.db.query("INSERT INTO documents VALUES(?,?,?)", &[json!(next), doc["path"].clone(), doc["text"].clone()])?;
            }
            #[cfg(feature = "test-faults")]
            self.inject_fault("before-commit")?;
            self.operation(&input["operationId"])
        })?;
        #[cfg(feature = "test-faults")]
        self.inject_fault("after-commit")?;
        Ok(receipt)
    }
}

fn coordinate(value: &Value) -> Result<i64> {
    value.as_i64().filter(|n| (0..=9_007_199_254_740_991).contains(n))
        .ok_or_else(|| fail("invalid revision coordinate"))
}

fn text(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(|| fail("expected storage text"))
}
