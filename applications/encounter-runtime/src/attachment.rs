// Resolve an application-selected immutable file within the operator's mount.
use crate::{Result, fail, rel};
use serde_json::Value;
use std::{fs::OpenOptions, io::Read, os::unix::fs::OpenOptionsExt, path::{Path, PathBuf}};

const LIMIT: u64 = 16 * 1024 * 1024;

pub struct Mount(PathBuf);

pub struct Attachment {
    pub body: Vec<u8>,
    pub disposition: String,
}

impl Mount {
    pub fn open(root: &Path) -> Result<Self> {
        let root = root.canonicalize()?;
        if !root.is_dir() { return Err(fail("attachment root must be a directory")); }
        Ok(Self(root))
    }

    pub fn read(&self, descriptor: &Value) -> Result<Attachment> {
        let path = descriptor["path"].as_str().ok_or_else(|| fail("invalid attachment path"))?;
        let size = descriptor["bytes"].as_u64().filter(|size| *size <= LIMIT)
            .ok_or_else(|| fail("invalid attachment size"))?;
        let pin = descriptor["sha256"].as_str().filter(|pin| pin.len() == 64 &&
            pin.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)))
            .ok_or_else(|| fail("invalid attachment pin"))?;
        if path.contains('\\') || path.chars().any(char::is_control)
            || path.split('/').any(|part| matches!(part, "" | "." | ".."))
        {
            return Err(fail("invalid attachment path"));
        }
        let file = self.0.join(path);
        if file.canonicalize()? != file { return Err(fail("attachment path changed")); }
        let opened = OpenOptions::new().read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(file)?;
        let meta = opened.metadata()?;
        if !meta.is_file() || meta.len() != size { return Err(fail("attachment size differs")); }
        let mut body = Vec::with_capacity(size as usize);
        opened.take(size + 1).read_to_end(&mut body)?;
        if body.len() as u64 != size || rel::hash(&body) != pin {
            return Err(fail("attachment bytes differ from the declared pin"));
        }
        let name = path.rsplit('/').next().unwrap_or_default();
        let mut disposition = String::from("attachment; filename*=UTF-8''");
        for c in name.bytes() {
            if c.is_ascii_alphanumeric() || b"-._~".contains(&c) {
                disposition.push(c.into());
            } else {
                disposition.push_str(&format!("%{c:02X}"));
            }
        }
        Ok(Attachment { body, disposition })
    }
}
