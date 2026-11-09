// Versioned coordinates shared by the CLI and a service supervisor.
use crate::{Result, fail, rel::Facts};
use std::path::{Path, PathBuf};

pub enum Launch {
    Image { image: PathBuf, pin: String, store: PathBuf, port: u16, attachment_root: Option<PathBuf> },
    Workgarden { root: PathBuf, journal: PathBuf, port: u16 },
}

impl Launch {
    pub fn read(file: &Path) -> Result<Self> {
        let file = file.canonicalize()?;
        let directory = file.parent().ok_or_else(|| fail("missing launch configuration directory"))?;
        let facts = Facts::read(&file)?;
        let field = |property| facts.one("launch", property);
        if field("version")? != "encounter/launch/1" {
            return Err(fail("unsupported launch configuration version"));
        }
        let mode = field("mode")?;
        let fields: &[&str] = match mode {
            "image" => &["image", "sha256", "store", "attachmentRoot"],
            "workgarden-journal" => &["runtimeRoot", "journal"],
            _ => return Err(fail("unsupported launch configuration mode")),
        };
        for [subject, property, _] in &facts.0 {
            if subject != "launch" || !["version", "mode", "port"].contains(&property.as_str())
                && !fields.contains(&property.as_str())
            {
                return Err(fail(format!("unknown launch field {subject}.{property}")));
            }
        }
        let path = |property| -> Result<PathBuf> {
            let value = field(property)?;
            if value.is_empty() { return Err(fail(format!("empty launch path {property}"))); }
            Ok(directory.join(value))
        };
        let port = field("port")?.parse()?;
        match mode {
            "image" => Ok(Self::Image {
                image: path("image")?, pin: field("sha256")?.to_owned(), store: path("store")?, port,
                attachment_root: match facts.values("launch", "attachmentRoot").as_slice() {
                    [] => None,
                    _ => Some(path("attachmentRoot")?),
                },
            }),
            _ => Ok(Self::Workgarden { root: path("runtimeRoot")?, journal: path("journal")?, port }),
        }
    }
}
