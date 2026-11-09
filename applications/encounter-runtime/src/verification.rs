use crate::{Result, fail, profile::Profile, rel::Facts, workgarden};
use serde_json::{Value, json};
use std::{
    env, fs,
    os::unix::fs::DirBuilderExt,
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{SystemTime, UNIX_EPOCH},
};

struct Scratch(PathBuf);

impl Scratch {
    fn create() -> Result<Self> {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = env::temp_dir().join(format!("encounter-workgarden-{}-{stamp}", std::process::id()));
        fs::DirBuilder::new().mode(0o700).create(&directory)?;
        Ok(Self(directory))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}

fn check(condition: bool, message: &str) -> Result<()> {
    if condition { Ok(()) } else { Err(fail(message)) }
}

fn output(result: Output) -> Result<Value> {
    if !result.status.success() {
        return Err(fail(String::from_utf8_lossy(&result.stderr).trim()));
    }
    Ok(serde_json::from_slice(&result.stdout)?)
}

fn launch_file(file: &Path, root: &Path, journal: &Path) -> Result<()> {
    let text = format!(r#"
("launch", "version", "encounter/launch/1")
("launch", "mode", "workgarden-journal")
("launch", "runtimeRoot", {})
("launch", "journal", {})
("launch", "port", "0")
"#, serde_json::to_string(root)?, serde_json::to_string(journal)?);
    fs::write(file, text)?;
    Ok(())
}

fn invoke(config: &Path, operation: &str, title: &str) -> Result<Output> {
    Ok(Command::new(env::current_exe()?).arg("--config").arg(config)
        .args(["run", "genesis", operation, title]).output()?)
}

fn refuse(result: Output, expected: &str) -> Result<()> {
    let error = String::from_utf8_lossy(&result.stderr);
    if result.status.success() || error.trim() != expected {
        return Err(fail(format!("expected refusal {expected:?}, got {error:?}")));
    }
    Ok(())
}

fn check_attachments(root: &Path, scratch: &Path) -> Result<()> {
    use crate::{attachment::Mount, process::{Meter, Programme}, rel};
    use std::{collections::BTreeSet, os::unix::fs::symlink};
    let mount_root = scratch.join("mount");
    let outside = scratch.join("outside");
    fs::create_dir(&mount_root)?;
    fs::create_dir(&outside)?;
    let bytes = b"\x00\xff\x01";
    let name = "Café proof.bin";
    fs::write(mount_root.join(name), bytes)?;
    fs::write(mount_root.join("tampered.bin"), b"bad")?;
    fs::write(outside.join(name), bytes)?;
    symlink(outside.join(name), mount_root.join("link.bin"))?;
    symlink(&outside, mount_root.join("linked-directory"))?;
    let pin = rel::hash(bytes);
    let descriptor = |path: &str, size: u64| json!({"path":path,"sha256":pin,"bytes":size});
    let cases = vec![descriptor(name, 3), descriptor("tampered.bin", 3), descriptor(name, 2),
        descriptor(name, 16 * 1024 * 1024 + 1), descriptor("link.bin", 3),
        descriptor("linked-directory/Café proof.bin", 3), descriptor("../outside/Café proof.bin", 3),
        descriptor("unknown.bin", 3), descriptor("Café proof.bin/", 3), Value::Null];
    let mount = Mount::open(&mount_root)?;
    let observations = cases.iter().map(|input| mount.read(input).ok().map(|file| json!({
        "bytes":file.body.len(), "sha256":rel::hash(file.body), "disposition":file.disposition
    }))).collect::<Vec<_>>();
    check(observations[0] == Some(json!({
        "bytes":3, "sha256":pin, "disposition":"attachment; filename*=UTF-8''Caf%C3%A9%20proof.bin"
    })) && observations[1..].iter().all(Option::is_none), "attachment must enforce its byte pin and mount boundaries")?;
    let reference = output(Command::new("node").arg(root.join("test/attachment-reference.cjs"))
        .arg(&mount_root).arg(serde_json::to_string(&cases)?).output()?)?;
    check(reference == json!(observations), "Rust and JS attachment observations differ")?;

    let source = r#"process-module "temple/surface-process-module/1"
process app.attachment:
  call hidden
process hidden:
  port storage.cas {} → result
"#;
    let mut meter = Meter::new(20_000_000);
    let programme = Programme::admit(&[source.into()], "app.attachment", &BTreeSet::from(["storage.cas"]), &mut meter)?;
    check(programme.require_grants("app.attachment", &BTreeSet::from(["application.data", "kernel.invoke"])).is_err(),
        "attachment entry cannot reach a storage write through a helper")?;
    println!("ok - Rust and JS serve exact pinned attachments and refuse changes, symlinks, escapes and out-of-bound sizes");
    Ok(())
}

fn check_declaration(scratch: &Path) -> Result<()> {
    fs::write(scratch.join("probe.encounter"),
        "process-module \"temple/surface-process-module/1\"\nprocess probe:\n  let result = true\n")?;
    let declaration = r#"
        ("application", "stateProfile", "encounter/declaration-probe/1")
        ("application", "module", "probe.encounter") ("application", "entry", "probe")
    "#;
    let manifest = scratch.join("application.rel");
    fs::write(&manifest, declaration)?;
    let binary = env::current_exe()?;
    let run = || Command::new(&binary).arg("check").arg(scratch).arg("application.rel").output();
    let report = output(run()?)?;
    check(report["admitted"] == true && report["entries"][0]["admitted"] == true,
        "a valid declaration and its entry must admit")?;

    fs::write(scratch.join("release.rel"), r#"("record", "kind", "Example")"#)?;
    fs::write(&manifest, format!(r#"{declaration}
        ("application", "dataSource", "release.rel")
        ("application", "dataFormat", "rel-facts")
        ("application", "dataSha256", "wrong")
    "#))?;
    let invalid = run()?;
    check(invalid.status.code() == Some(1)
        && String::from_utf8_lossy(&invalid.stderr).contains("application data hash differs"),
        "the declaration loader must refuse a mismatched release pin")?;
    fs::write(&manifest, declaration.replace("probe.encounter", "/etc/hosts"))?;
    refuse(run()?, "application paths must be relative to the application root")?;
    println!("ok - general declaration admits source and refuses invalid release pins and absolute paths");
    Ok(())
}

fn check_store(root: &Path, directory: &Path) -> Result<()> {
    use crate::{sqlite::Db, store::Store};
    let profile = "encounter/sqlite-probe/1";
    let basis = "fixture-basis";
    let change = json!({
        "base":0,"operationId":"first","profile":profile,"basis":basis,
        "reason":"fixture","target":"one","goal":"verify CAS","source":"test","description":"save",
        "documents":[{"path":"one.rel","text":"document 🌱"}]
    });
    let store = Store::open(directory, profile, basis)?;
    let first = store.cas(&change)?;
    check(first["revision"] == 1 && store.cas(&change)? == first,
        "exact SQLite CAS retry must return its original receipt")?;
    let mut reused = change.clone();
    reused["documents"][0]["text"] = json!("different");
    check(store.cas(&reused).is_err(), "changed bytes must refuse an occupied operation ID")?;
    let mut stale = change.clone();
    stale["operationId"] = json!("stale");
    check(store.cas(&stale).is_err() && store.operation(&stale["operationId"])?.is_null(),
        "stale SQLite CAS must leave no operation receipt")?;

    let db = Db::open(&directory.join("workspace.sqlite"))?;
    check(db.exec("UPDATE revisions SET reason='rewrite' WHERE id=1").is_err(),
        "accepted SQLite revisions must be immutable")?;
    db.exec("CREATE TRIGGER fixture_document_fault BEFORE INSERT ON documents
        WHEN NEW.path='two.rel' BEGIN SELECT RAISE(ABORT,'fixture fault'); END;")?;
    let mut partial = change.clone();
    partial["operationId"] = json!("partial");
    partial["base"] = json!(1);
    partial["documents"] = json!([{"path":"one.rel","text":"first"},{"path":"two.rel","text":"second"}]);
    check(store.cas(&partial).is_err() && store.snapshot(None)?["revision"] == 1
        && store.operation(&partial["operationId"])?.is_null(),
        "a document failure must roll back the SQLite revision and its receipt")?;
    drop(db);
    drop(store);
    let store = Store::open(directory, profile, basis)?;
    check(store.operation(&change["operationId"])? == first,
        "the SQLite receipt must survive reopening")?;
    println!("ok - SQLite CAS retries exactly, refuses stale bases and rolls back partial writes");
    drop(store);
    let cross = output(Command::new("node").arg(root.join("test/store-reference.cjs"))
        .arg(directory).arg(serde_json::to_string(&change)?).output()?)?;
    let store = Store::open(directory, profile, basis)?;
    check(store.cas(&cross["change"])? == cross["receipt"]
        && store.snapshot(None)?["documents"] == cross["change"]["documents"]
        && store.operation(&change["operationId"])? == first,
        "Rust must retain JS writes and reproduce the original operation receipts")?;
    println!("ok - Rust and JS reopen the same SQLite store, retain history and retry each other's writes exactly");
    Ok(())
}

fn check_shared_ports(root: &Path) -> Result<()> {
    use crate::{application::Application, process::{Meter, supports_port}};
    use std::collections::BTreeSet;
    let platform = Facts::read(&root.join("spec/platform.rel"))?;
    let ports = Facts::read(&root.join("spec/application-ports.rel"))?;
    check(ports.one("ports", "version")? == platform.one("platform", "ports")?,
        "the application port contract must match the platform version")?;
    for name in ports.0.iter().filter(|row| row[1] == "input").map(|row| &row[0]) {
        check(supports_port(name), "a specified port must have a Rust implementation")?;
        for field in ["output", "effect", "semantics"] { ports.one(name, field)?; }
    }
    let catalog = Facts::read(&root.join("release-applications.rel"))?;
    let applications = root.parent().ok_or_else(|| fail("missing applications root"))?;
    let mut grants = BTreeSet::new();
    for [_, package, declaration] in catalog.0 {
        let declaration = Facts::read(&applications.join(package).join(declaration))?;
        grants.extend(declaration.0.into_iter()
            .filter(|row| row[0] == "application" && row[1] == "grant")
            .map(|[_, _, grant]| grant));
    }
    for grant in grants { ports.one(&grant, "input")?; }
    let mut meter = Meter::new(20_000_000);
    let app = Application::load(&root.join("fixtures/port-conformance"), "application.rel")?;
    let program = app.admit(&mut meter)?;
    let values = program.run("probe.values", Value::Null, &mut meter.clone())?;
    let numeric = program.run("probe.numeric", Value::Null, &mut meter)?;
    let expected = json!({
        "values": {
            "old":0,"new":0.01,"decoded":0.01,"trimmed":"Café 🌱","index":5,
            "digest":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            "empty":null,"found":true,"absent":false,"pick":"first","allFalse":null
        },
        "numeric": {"hours":7.25,"month":1,"rounded":-1,"comparison":false,"refusal":"Nonfinite numeric result"}
    });
    check(json!({"values":values,"numeric":numeric}) == expected, "Rust shared-port fixtures differ")?;
    let reference = output(Command::new("node").arg(root.join("test/port-reference.cjs")).output()?)?;
    check(reference == expected, "JS shared-port fixtures differ")?;
    println!("ok - Rust and JS admit the same common port fixtures and agree on results and refusal");
    Ok(())
}

fn check_authoring_ports() -> Result<()> {
    use crate::process::{Meter, Programme};
    use std::collections::BTreeSet;
    let fixture = r#"process-module "temple/surface-process-module/1"
process probe:
  let hidden = 99
  port source.observe { file = "actions/probe.encounter"; text = $eventInput.source } → inspected
  port encounter.execute { text = $eventInput.source; entry = "run"; input = 0.25 } → executed
  let result = { inspected = $inspected.module.queries.run; executed = $executed; empty = eq(at({}, "missing"), null) }
process execution:
  port encounter.execute { text = $eventInput; entry = "run"; input = 0.25 } → result
"#;
    let mut meter = Meter::new(20_000_000);
    let programme = Programme::admit_entries(&[fixture.to_owned()], &["probe", "execution"],
        &BTreeSet::from(["source.observe", "encounter.execute"]), &mut meter)?;
    let source = |body: &str| format!("process-module \"temple/surface-process-module/1\"\nprocess run:\n{body}\n");
    let result = programme.run("probe", json!({"source":source("  let result = add($eventInput, 0.5)")}), &mut meter)?;
    check(result == json!({"inspected":[{"let":"result","value":["add","$eventInput",0.5]}],
        "executed":0.75,"empty":false}), "inspection data and pure source execution must agree")?;
    for input in [
        json!(source("  let result = $hidden")),
        json!(source("  port storage.cas {} → result")),
        json!({"queries":{"run":[{"let":"result","value":42}]}})
    ] {
        check(programme.run("execution", input, &mut meter).is_err(),
            "dynamic execution must refuse ambient bindings, effects and raw models")?;
    }
    println!("ok - authoring source observation and pure execution refuse ambient access, effects and raw models");
    Ok(())
}

fn check_application_images(scratch: &Path) -> Result<()> {
    use crate::{image, rel};
    let package = scratch.join("package");
    fs::create_dir(&package)?;
    fs::write(package.join("application.rel"), r#"
("application", "stateProfile", "encounter/image-test/1")
("application", "module", "probe.encounter")
("application", "entry", "probe")
"#)?;
    fs::write(package.join("probe.encounter"), r#"process-module "temple/surface-process-module/1"
process probe:
  let result = "from the image"
"#)?;
    let first = scratch.join("first.rel");
    let second = scratch.join("second.rel");
    let pin = image::build(&package, "application.rel", &first)?;
    let second_pin = image::build(&package, "application.rel", &second)?;
    let original = fs::read_to_string(&first)?;
    check(pin == second_pin && original == fs::read_to_string(&second)?,
        "identical application inputs must produce identical image bytes and pin")?;
    check(image::build(&package, "application.rel", &first).is_err()
        && original == fs::read_to_string(&first)?, "build must preserve an existing image")?;

    fs::remove_dir_all(&package)?;
    let mut loaded = image::load(&first, &pin)?;
    check(loaded.programme.run("probe", Value::Null, &mut loaded.meter)? == "from the image",
        "the compiled programme must execute with the source package absent")?;
    check(image::load(&first, &"0".repeat(64)).err().is_some_and(|e|
        e.to_string().contains("hash differs")), "the loader must verify the supplied outer pin")?;

    let mut changed = rel::decode(&original, "EncounterApplicationImage")?;
    changed["runtimeSha256"] = json!("0".repeat(64));
    let text = rel::encode(&changed, "EncounterApplicationImage")?;
    fs::write(&second, &text)?;
    check(image::load(&second, &rel::hash(&text)).err().is_some_and(|e|
        e.to_string().contains("runtime pin differs")), "a repinned image for a different runtime must refuse")?;

    let mut changed = rel::decode(&original, "EncounterApplicationImage")?;
    changed["files"]["probe.encounter"]["text"] = json!("tampered source");
    let text = rel::encode(&changed, "EncounterApplicationImage")?;
    fs::write(&second, &text)?;
    check(image::load(&second, &rel::hash(&text)).err().is_some_and(|e|
        e.to_string().contains("file pin mismatch")), "a repinned image with altered source must refuse its inner pin")?;
    let mut changed = rel::decode(&original, "EncounterApplicationImage")?;
    changed["programme"]["probe"][0] = json!(["port", "storage.cas", ["record", []], "result"]);
    let text = rel::encode(&changed, "EncounterApplicationImage")?;
    fs::write(&second, &text)?;
    check(image::load(&second, &rel::hash(&text)).err().is_some_and(|e|
        e.to_string().contains("programme hash differs")), "altered instructions must fail their inner pin")?;
    changed["programmeSha256"] = json!(rel::hash(rel::encode(&changed["programme"], "EncounterCompiledProgramme")?));
    let text = rel::encode(&changed, "EncounterApplicationImage")?;
    fs::write(&second, &text)?;
    check(image::load(&second, &rel::hash(&text)).err().is_some_and(|e|
        e.to_string().contains("port not granted")), "repinned instructions must still obey declared grants")?;
    println!("ok - compiled application images reproduce exactly, load without source files and enforce pins and grants");
    Ok(())
}

pub fn run(root: &Path) -> Result<()> {
    let root = root.canonicalize()?;
    let scratch = Scratch::create()?;
    check_declaration(&scratch.0)?;
    check_attachments(&root, &scratch.0)?;
    check_application_images(&scratch.0)?;
    check_shared_ports(&root)?;
    check_authoring_ports()?;
    check_store(&root, &scratch.0.join("sqlite"))?;
    let accepted_dir = scratch.0.join("accepted");
    let rejected_dir = scratch.0.join("tampered");
    let blank_dir = scratch.0.join("blank");
    let accepted_config = scratch.0.join("accepted.rel");
    let blank_config = scratch.0.join("blank.rel");
    launch_file(&accepted_config, &root, &accepted_dir)?;
    launch_file(&blank_config, &root, &blank_dir)?;
    let fixture = Facts::read(&root.join("fixtures/workgarden.rel"))?;
    let title = fixture.one("add", "title")?;
    let operation = fixture.one("add", "operation")?;
    let accepted = output(invoke(&accepted_config, operation, title)?)?;
    check(accepted["outcome"] == "accepted" && accepted["replayed"] == false,
        "the first add must be accepted by Temple3")?;
    check(accepted["item"] == json!({"id":"todo.1","title":fixture.one("add","expectedTitle")?,"completed":false}),
        "the first add must preserve the normalized visible item")?;

    refuse(invoke(&accepted_config, "stale", title)?, "stale-basis")?;
    refuse(invoke(&accepted_config, operation, fixture.one("changed", "title")?)?, "operation-conflict")?;
    let replay = output(invoke(&accepted_config, operation, title)?)?;
    let mut expected = accepted.clone();
    expected["replayed"] = json!(true);
    check(replay == expected, "a fresh process must return the exact original outcome")?;

    let blank = invoke(&blank_config, fixture.one("refused", "operation")?, fixture.one("refused", "title")?)?;
    let refusal = String::from_utf8_lossy(&blank.stderr).trim().to_owned();
    check(!blank.status.success() && fs::read_dir(&blank_dir)?.next().is_none(),
        "a blank source-level add must refuse without journal records")?;

    let profile = Profile::load(&root)?;
    let rejected = workgarden::submit(&profile, &rejected_dir, "genesis",
        fixture.one("changed", "operation")?, title, |after| {
            after["records"][0]["completed"] = json!(true);
        })?;
    check(rejected["outcome"] == "rejected"
        && rejected["witness"]["reason"] == "covenant-rejected"
        && rejected["head"] == accepted["proposal"]["delta"]["basisStateRoot"],
        "a changed delta must receive a rejection witness and leave the state root intact")?;

    let temple_id = accepted["proposal"]["templeId"].as_str().ok_or_else(|| fail("missing temple ID"))?;
    let reference = output(Command::new("node").arg(root.join("test/reference.cjs"))
        .args([accepted_dir.as_os_str(), rejected_dir.as_os_str(), temple_id.as_ref()]).output()?)?;
    check(reference["item"] == accepted["item"] && reference["refusal"] == refusal && !refusal.is_empty(),
        "Rust and the admitted JS Encounter source must agree on Add and blank refusal")?;
    check(reference["delta"] == accepted["proposal"]["delta"],
        "the independent JS Temple3 model must reproduce the exact delta")?;
    for (name, outcome, sequence) in [("accepted", &accepted, "1"), ("rejected", &rejected, "0")] {
        let observation = &reference[name];
        check(observation["head"] == outcome["head"] && observation["witness"] == outcome["witness"]
            && observation["sequence"] == sequence && observation["records"] == 2,
            "independent signed journal replay must reproduce the exact head, witness and record count")?;
    }
    println!("ok - Workgarden Add agrees in Rust and JS; Temple3 delta and signed witness match");
    println!("ok - stale basis and conflicting operation refuse; cold retry returns the same receipt");
    println!("ok - changed successor is witnessed as rejected; blank source input writes no records");
    Ok(())
}
