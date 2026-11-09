use crate::{Result, fail, profile::Profile};
use serde_json::{Value, json};
use std::path::Path;
use temple3::{commitment, federation, identity, journal::FileJournal, kernel};

// Deterministic public fixture material, scoped to this disposable profile.
const LAB_SEED: [u8; 32] = [37; 32];

fn genesis(profile: &Profile) -> Result<Value> {
    let public = identity::sign_envelope("attestation", &json!({}), &LAB_SEED)?["publicKey"].clone();
    Ok(identity::signed_genesis(&json!({
        "activePredicate":profile.covenant,
        "initialValues":[{"kind":profile.state_kind,"sequence":"0","records":[]}],
        "context":{
            "identityProfile":{"kind":"temple3.identity-profile/v0.1",
                "actors":[{"actor":profile.actor,"publicKey":public}],"finalizer":public},
            "application":{"profile":profile.id,"sourceBasis":profile.basis}
        }
    }), &LAB_SEED)?)
}

fn utf16hex(text: &str) -> String {
    hex::encode(text.encode_utf16().flat_map(u16::to_le_bytes).collect::<Vec<_>>())
}

// Bound of Temple3's workgarden-command-v1 relation.
const CAPACITY: usize = 8;

fn item_from_row(row: &Value) -> temple3::Result<Value> {
    let label = row["label"].as_str().ok_or_else(|| code("invalid journal label"))?;
    let bytes = hex::decode(label).map_err(|_| code("invalid journal label"))?;
    let units: Vec<_> = bytes.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
    let title = String::from_utf16(&units).map_err(|_| code("invalid journal label"))?;
    Ok(json!({"id":row["subject"],"title":title,"completed":row["completed"]}))
}

fn board_items(state: &Value) -> temple3::Result<Vec<Value>> {
    state["records"].as_array().ok_or_else(|| code("invalid board records"))?
        .iter().map(item_from_row).collect()
}

fn state_after(before: &Value, items: &[Value]) -> temple3::Result<Value> {
    let sequence = before["sequence"].as_str().and_then(|value| value.parse::<u32>().ok())
        .ok_or_else(|| code("invalid board sequence"))?;
    let records = items.iter().enumerate().map(|(index, item)| {
        let title = item["title"].as_str().ok_or_else(|| code("command result must contain item title"))?;
        Ok(json!({"subject":item["id"],"label":utf16hex(title),"completed":item["completed"],
            "member":true,"order":(index + 1).to_string()}))
    }).collect::<temple3::Result<Vec<_>>>()?;
    Ok(json!({"kind":before["kind"],"sequence":(sequence + 1).to_string(),"records":records}))
}

fn evaluate(temple: &Value, payload: &Value) -> temple3::Result<kernel::Transition> {
    kernel::evaluate_transition(temple, &json!({
        "identity":payload["actor"],"delta":payload["delta"],"context":payload["context"]
    }))
}

struct Head {
    temple: Value,
    tip: Value,
    receipt: String,
}

fn restore(genesis: &Value, records: &[Value]) -> temple3::Result<Head> {
    let expected = &genesis["signed"]["payload"]["templeId"];
    let (mut temple, _) = identity::verify_genesis(genesis, expected)?;
    if records.is_empty() {
        return Ok(Head { temple, tip: json!("empty"), receipt: identity::signed_id(&genesis["signed"])? });
    }
    // Temple3 authenticates the record chain and witnesses. Its replay API
    // returns a summary, so reapply verified accepts to obtain the full state.
    let replay = identity::replay(&json!(records), &json!({"expectedTempleId":expected}))?;
    for record in records.iter().filter(|record| {
        record["entry"]["receipt"]["purpose"] == "finalized-witness"
    }) {
        temple = evaluate(&temple, &record["entry"]["proposal"]["payload"])?.temple;
    }
    if temple["stateRoot"] != replay["stateRoot"] {
        return Err(code("invalid journal head"));
    }
    let receipt = replay["receiptId"].as_str().ok_or_else(|| code("invalid-journal"))?.to_owned();
    Ok(Head { temple, tip: replay["tip"].clone(), receipt })
}

fn view(record: &Value, head: &Value, replayed: bool) -> temple3::Result<Value> {
    let payload = &record["entry"]["proposal"]["payload"];
    let witness = &record["entry"]["receipt"]["payload"]["witness"];
    let accepted = record["entry"]["receipt"]["purpose"] == "finalized-witness";
    let item = if accepted {
        let row = payload["delta"]["create"][0]["value"]["records"].as_array()
            .and_then(|rows| rows.last()).ok_or_else(|| code("missing committed item"))?;
        item_from_row(row)?
    } else { Value::Null };
    Ok(json!({
        "outcome": if accepted { "accepted" } else { "rejected" }, "item":item,
        "replayed":replayed, "head":head, "operation":payload["requestId"],
        "basis":witness["finalStateRoot"], "witness":witness, "journalRecord":record["recordId"],
        "proposal":payload
    }))
}

pub struct Board {
    pub basis: String,
    pub items: Vec<Value>,
    pub can_add: bool,
}

pub fn snapshot(profile: &Profile, dir: &Path) -> Result<Board> {
    let head = restore(&genesis(profile)?, &FileJournal::new(dir).read()?)?;
    let basis = head.temple["stateRoot"].as_str().ok_or_else(|| fail("invalid journal head"))?.to_owned();
    let items = board_items(&head.temple["state"]["cells"][0]["value"])?;
    let can_add = items.len() < CAPACITY;
    Ok(Board { basis, items, can_add })
}

pub fn run(profile: &Profile, dir: &Path, expected: &str, operation: &str, title: &str) -> Result<Value> {
    submit(profile, dir, expected, operation, title, |_| {})
}

// Tests may perturb the translated successor before the signed submission.
// The CLI only reaches this function through the identity transformation.
pub(crate) fn submit(
    profile: &Profile, dir: &Path, expected: &str, operation: &str, title: &str,
    transform: impl FnOnce(&mut Value),
) -> Result<Value> {
    if title.len() > 8192 { return Err(fail("input-too-large")); }
    if operation.is_empty() || operation.len() > 128
        || !operation.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    { return Err(fail("invalid-operation-id")); }
    let genesis = genesis(profile)?;
    let temple_id = &genesis["signed"]["payload"]["templeId"];
    let identity_profile = &genesis["signed"]["payload"]["genesisInput"]["context"]["identityProfile"];
    let genesis_root = genesis["signed"]["payload"]["witness"]["finalStateRoot"]
        .as_str().ok_or_else(|| fail("invalid genesis"))?;
    let expected = if expected == "genesis" { genesis_root } else { expected };
    let request = json!({"basis":expected,"titleUtf16le":utf16hex(title)});
    let journal = FileJournal::new(dir);
    let result = journal.transaction(|locked| {
        let wrap = |error: Box<dyn std::error::Error>| temple3::Error { code: error.to_string() };
        let records = locked.read()?;
        let Head { temple, mut tip, receipt } = restore(&genesis, &records)?;
        let head = &temple["stateRoot"];
        if let Some(record) = records.iter().skip(1).find(|r|
            r["entry"]["proposal"]["payload"]["requestId"] == operation
        ) {
            if record["entry"]["proposal"]["payload"]["context"]["request"] != request {
                return Err(code("operation-conflict"));
            }
            return view(record, head, true);
        }
        if head != expected { return Err(code("stale-basis")); }
        let cell = &temple["state"]["cells"][0];
        let before = &cell["value"];
        let items = board_items(before)?;
        if items.len() >= CAPACITY { return Err(code("board-capacity")); }

        let next_order = items.len() + 1;
        let id = format!("todo.{next_order}");
        let change = profile.add(items, &id, title).map_err(wrap)?;
        let items = change["state"]["items"].as_array().filter(|items| items.len() == next_order)
            .ok_or_else(|| code("expected one added Encounter item"))?;
        let mut after = state_after(before, items)?;
        // Bind the proof to the actual normalized command before any fault injection.
        let command = json!({"op":"create","args":[after["records"][next_order - 1]["label"]]});
        transform(&mut after);
        let statement = federation::statement(&json!(profile.relation), &json!({
            "before":cell["value"],"command":command,"after":after
        }))?;
        let proof = json!({
            "kind":"temple3.proof-envelope/v0.1","system":"temple3.transparent/v0.1",
            "statementId":statement["statementId"],"evidence":{}
        });
        let delta = kernel::build_delta(&temple, &json!({
            "read":[cell["id"]],"consume":[cell["id"]],"create":[commitment::cell_for(&after)?]
        }))?;
        let context = json!({"request":request,"statement":statement,"proof":proof});
        let proposal = identity::sign_envelope("proposal", &json!({
            "templeId":temple_id,"actor":profile.actor,"requestId":operation,"delta":delta,"context":context
        }), &LAB_SEED)?;
        identity::authenticate(identity_profile, temple_id, &proposal)?;
        let transition = evaluate(&temple, &proposal["payload"])?;
        let purpose = if transition.accepted { "finalized-witness" } else { "rejection-witness" };
        let signed = identity::sign_envelope(purpose, &json!({
            "templeId":temple_id, "proposalId":identity::signed_id(&proposal)?,
            "previousReceiptId":receipt, "witness":transition.witness
        }), &LAB_SEED)?;
        if records.is_empty() {
            tip = append(locked, &genesis, &tip)?["recordId"].clone();
        }
        let record = append(locked, &json!({"kind":"transition","proposal":proposal,"receipt":signed}), &tip)?;
        view(&record, &transition.temple["stateRoot"], false)
    })?;
    Ok(result)
}

fn code(code: &str) -> temple3::Error { temple3::Error { code: code.to_owned() } }

fn append(locked: &mut temple3::journal::LockedJournal<'_>, entry: &Value, tip: &Value) -> temple3::Result<Value> {
    locked.append(entry, tip).map_err(|error| code(&format!("unknown-write-outcome: {error}")))
}
