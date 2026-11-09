// Pinned application source, data and ahead-of-time instructions.
use crate::{Result, application::{Application, validate_path}, fail, process::{Meter, Programme}, rel, web::nonce};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

const KIND: &str = "EncounterApplicationImage";
const FORMAT: &str = "encounter/application-image/2";
const PROGRAMME_KIND: &str = "EncounterCompiledProgramme";
const LIMIT: u64 = 64_000_000;

fn runtime_pin() -> Result<String> {
    // On Linux this resolves the actual running executable even after a
    // rebuild has replaced its original pathname.
    Ok(rel::hash(fs::read("/proc/self/exe")?))
}

pub fn build(root: &Path, declaration: &str, output: &Path) -> Result<String> {
    let (app, files) = Application::capture(root, declaration)?;
    let programme = app.admit(&mut Meter::new(20_000_000))?.compiled();
    let programme_sha256 = rel::hash(rel::encode(&programme, PROGRAMME_KIND)?);
    let files = files.into_iter().map(|(path, text)| {
        let sha256 = rel::hash(&text);
        (path, json!({"text":text,"sha256":sha256}))
    }).collect::<BTreeMap<_, _>>();
    let text = rel::encode(&json!({
        "format":FORMAT,"runtimeSha256":runtime_pin()?,"basis":app.basis,
        "declaration":declaration,"files":files,"programme":programme,"programmeSha256":programme_sha256
    }), KIND)?;
    if text.len() as u64 > LIMIT { return Err(fail("application image size limit")); }
    publish(output, text.as_bytes())?;
    Ok(rel::hash(text))
}

fn publish(output: &Path, bytes: &[u8]) -> Result<()> {
    let parent = output.parent().filter(|path| !path.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let stage = parent.join(format!(".encounter-image-{}", nonce()?));
    let mut file = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&stage)?;
    let result = (|| -> Result<()> {
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::hard_link(&stage, output)?;
        Ok(())
    })();
    let removed = fs::remove_file(stage);
    result?;
    removed?;
    File::open(parent)?.sync_all()?;
    Ok(())
}

fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key].as_str().ok_or_else(|| fail(format!("missing application image field {key}")))
}

pub struct LoadedImage {
    pub app: Application,
    pub programme: Programme,
    pub meter: Meter,
}

pub fn load(path: &Path, expected: &str) -> Result<LoadedImage> {
    if expected.len() != 64 || !expected.bytes().all(|byte|
        byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(fail("expected an independent lowercase SHA-256 image pin"));
    }
    if fs::metadata(path)?.len() > LIMIT { return Err(fail("application image size limit")); }
    let bytes = fs::read(path)?;
    if bytes.len() as u64 > LIMIT { return Err(fail("application image size limit")); }
    if rel::hash(&bytes) != expected { return Err(fail("application image hash differs from its pin")); }
    let text = std::str::from_utf8(&bytes)?;
    let image = rel::decode(text, KIND)?;
    if image.as_object().is_none_or(|fields| fields.len() != 7) || image["format"] != FORMAT {
        return Err(fail("unsupported application image format"));
    }
    if string(&image, "runtimeSha256")? != runtime_pin()? {
        return Err(fail("application image runtime pin differs from this executable"));
    }
    let declaration = string(&image, "declaration")?;
    let files = image["files"].as_object().ok_or_else(|| fail("missing application image files"))?;
    let mut used = BTreeSet::new();
    let app = Application::from_files(declaration, |path, extension, limit| {
        validate_path(path, extension)?;
        let entry = files.get(path).ok_or_else(|| fail(format!("missing image file {path}")))?;
        if entry.as_object().is_none_or(|fields| fields.len() != 2) {
            return Err(fail(format!("invalid image file record {path}")));
        }
        let text = string(entry, "text")?;
        if text.len() > limit { return Err(fail(format!("application file size limit at {path}"))); }
        if rel::hash(text) != string(entry, "sha256")? {
            return Err(fail(format!("application image file pin mismatch at {path}")));
        }
        used.insert(path.to_owned());
        Ok((PathBuf::from(path), text.to_owned()))
    })?;
    if used.len() != files.len() { return Err(fail("undeclared files in application image")); }
    if app.basis != string(&image, "basis")? { return Err(fail("application image basis differs from its sources")); }
    let compiled = &image["programme"];
    if rel::hash(rel::encode(compiled, PROGRAMME_KIND)?) != string(&image, "programmeSha256")? {
        return Err(fail("compiled programme hash differs from its pin"));
    }
    let mut meter = Meter::new(20_000_000);
    let programme = app.load_compiled(compiled, &mut meter)?;
    Ok(LoadedImage { app, programme, meter })
}
