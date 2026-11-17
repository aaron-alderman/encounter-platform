// Validate the application package, including files not named by a declaration.
use crate::{Result, fail};
use std::{fs, path::Path};

pub fn check_path(path: &Path) -> Result<()> {
    if path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext|
        ["json", "mjs", "py", "rs"].iter().any(|blocked| ext.eq_ignore_ascii_case(blocked))) {
        return Err(fail(format!("application package contains forbidden file {}", path.display())));
    }
    Ok(())
}

pub fn check(root: &Path) -> Result<()> {
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            let kind = entry.file_type()?;
            check_path(&path)?;
            if kind.is_dir() {
                pending.push(path);
            } else if !kind.is_file() {
                return Err(fail(format!("application package entry must be a regular file: {}", path.display())));
            }
        }
    }
    Ok(())
}
