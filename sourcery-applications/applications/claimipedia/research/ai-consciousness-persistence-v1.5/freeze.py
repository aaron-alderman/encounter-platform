"""Freeze exact IAC7 cue deletions and the SRP7/pending controls."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
PRIOR = HERE.parent / "ai-consciousness-persistence-v1.4"
TARGET = "default-version-switch"
FOCAL = ("summary-default-v1", "summary-unswitched")
EXPECTED = {
    "summary-default-v1": "claimipedia-identity-algebra/1",
    "summary-unswitched": False,
    "summary-approved-count": 2,
    "summary-remaining-count": 1,
    "ledger-status": "read-only-v2-released-awaiting-default-version-decision",
    "exclusion": "default-version switch",
    "decision-pending": "pending",
    "decision-null": None,
}
SUMMARY_KEYS = {
    "summary-default-v1": "defaultVersion",
    "summary-unswitched": "defaultVersionSwitched",
    "summary-approved-count": "decisionsApproved",
    "summary-remaining-count": "decisionsRemaining",
}
DECISION_KEYS = {"decision-pending": "status", "decision-null": "decision"}
ABLATIONS = {
    **{f"drop-{cue}": (cue,) for cue in EXPECTED},
    "drop-focal-pair": FOCAL,
    "drop-other-cues": tuple(cue for cue in EXPECTED if cue not in FOCAL),
    "drop-all-listed-cues": tuple(EXPECTED),
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def delete_checked(obj, key, cue):
    if obj[key] != EXPECTED[cue]:
        raise ValueError(f"Archived value mismatch for {cue}")
    del obj[key]


def iac7_ledger(text, remove):
    retained, seen = [], set()
    for line in text.splitlines():
        key, _, value = line.partition(": ")
        if key == "status" and "ledger-status" in remove:
            delete_checked({key: value}, key, "ledger-status")
            seen.add("ledger-status")
            continue
        edits = {cue: path for cue, path in SUMMARY_KEYS.items() if cue in remove} if key == "summary" else {}
        if edits:
            data = json.loads(value)
            for cue, field in edits.items():
                delete_checked(data, field, cue)
                seen.add(cue)
            line = f"{key}: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}"
        if key == "decisions" and any(cue in remove for cue in DECISION_KEYS):
            data = json.loads(value)
            target, = [row for row in data if row["id"] == TARGET]
            for cue, field in DECISION_KEYS.items():
                if cue in remove:
                    delete_checked(target, field, cue)
                    seen.add(cue)
            line = f"{key}: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}"
        if key == "exclusions" and "exclusion" in remove:
            data = json.loads(value)
            if data.count(EXPECTED["exclusion"]) != 1:
                raise ValueError("Expected one exact exclusion")
            data.remove(EXPECTED["exclusion"])
            seen.add("exclusion")
            line = f"{key}: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}"
        retained.append(line)
    if seen != set(remove):
        raise ValueError("A preregistered deletion was missed")
    return "\n".join(retained)


def srp7_ledger(text):
    remove = {
        '("reviewPacket.spin23.SRP7", "disposition", "unfilled")',
        '("runDossier.spin23.SRP7", "status", "awaiting-human-admission")',
    }
    lines = text.splitlines()
    if not remove <= set(lines):
        raise ValueError("Missing analogous SRP7 status rows")
    return "\n".join(line for line in lines if line not in remove)


def last_record(prompt):
    before, marker, rest = prompt.rpartition("<record source=")
    identity, opening, tail = rest.partition(">\n")
    ledger, closing, decision = tail.partition("\n</record>")
    if not marker or not opening or not closing:
        raise ValueError("Missing native stale-ledger record")
    return before + marker + identity + opening, ledger, closing + decision


def prepare():
    raw = (PRIOR / "preregistration.json").read_bytes()
    digest = sha(raw)
    if digest != (PRIOR / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Predecessor digest mismatch")
    prior = json.loads(raw)
    for source in prior["sources"]:
        if sha((ROOT / source["id"]).read_bytes()) != source["sha256"]:
            raise ValueError(f"Changed source: {source['id']}")

    cells = []
    for anchor in prior["cells"]:
        if anchor["arm"] not in ("anchor-only", "native-ledger"):
            continue
        prompts = {anchor["arm"]: anchor["prompt"]}
        if anchor["arm"] == "native-ledger":
            prefix, ledger, suffix = last_record(anchor["prompt"])
            if anchor["lineage"] == "IAC7":
                for arm, remove in ABLATIONS.items():
                    prompts[arm] = prefix + iac7_ledger(ledger, remove) + suffix
            else:
                prompts["drop-analogous-cues"] = prefix + srp7_ledger(ledger) + suffix
        for arm, prompt in prompts.items():
            ident = sha(f"v1.5|{anchor['id']}|{arm}".encode())[:12]
            cells.append({
                "id": ident, "sourceCell": anchor["id"], "lineage": anchor["lineage"],
                "state": anchor["state"], "arm": arm, "approveLabel": anchor["approveLabel"],
                "firstLabel": anchor["firstLabel"], "decision": anchor["decision"], "prompt": prompt,
                "promptSha256": sha(prompt.encode()),
            })
    cells.sort(key=lambda row: row["id"])
    if len(cells) != 128 or len({c["id"] for c in cells}) != 128:
        raise ValueError("Incomplete frozen design")
    return {
        "protocol": "claimipedia-ai-consciousness-persistence-stale-cue-ablation/1.5",
        "status": "frozen-before-actor-dispatch", "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorSha256": digest,
        "sources": prior["sources"], "actor": prior["actor"],
        "design": "128 fresh reset decisions. IAC7 default switch: two checkpoints × 13 arms × four answer label/display-order variants. SRP7 scoped admission: two checkpoints × three arms × four variants. Native-ledger and anchor-only prompts are byte-identical to v1.4. Every ablation changes only the trailing ledger within its own lineage and checkpoint. Pending packets retain their original scope anchors and contain no future approval.",
        "interventions": {
            "IAC7": ABLATIONS,
            "SRP7": {"drop-analogous-cues": ["reviewPacket disposition unfilled", "runDossier status awaiting-human-admission"]},
            "preserved": "All other facts, earlier approvals, provenance, record labels, ledger position, checkpoint anchors and question remain. Deletions do not replace pending with approved. The all-listed-cues arm still contains the ledger and its historical identity.",
        },
        "primary": "For IAC7 approved, report each ablation's approval count and paired difference against native-ledger on complete answer-label and presentation-order strata. Report default v1 and unswitched separately and jointly, and the focal interaction (drop both − drop default − drop unswitched + native). Compare full removal with focal-only removal, other-cue removal and anchor-only. Report whether the native stale suppression repeats. No post-hoc field additions or isolated attribution from bundled results.",
        "pendingControls": "Report false approvals by arm and lineage at pending checkpoints. SRP7 native, anchor-only and analogous deletion serve as controls for deleting pending cues in a ledger that previously did not suppress approval.",
        "interpretation": "Within this approved checkpoint an observed increase indicates a behavioral effect of deleting the named cue or bundle. A deletion with no effect may leave redundant cues. One action per lineage, one model, four label/order variants per arm. Report zero observed false approvals as bounded to these packets.",
        "stopping": "One fresh choice per frozen cell, no replacement or schema repair. Exclude malformed JSON and tool use. Halt further dispatch on tool use or systematic backend failure. Report missing cells and complete matched denominators.",
        "authority": "observation-and-proposal-only", "canonicalEffect": "none", "cells": cells,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    protocol = prepare()
    path, checksum = HERE / "preregistration.json", HERE / "preregistration.sha256"
    if args.verify:
        raw = path.read_bytes()
        saved = json.loads(raw)
        protocol["frozenAtUtc"] = saved["frozenAtUtc"]
        if sha(raw) != checksum.read_text().split()[0] or json.loads(json.dumps(protocol)) != saved:
            raise ValueError("Frozen replay mismatch")
        print("Reproduced all 128 frozen prompts and the original control bytes.")
    else:
        raw = (json.dumps(protocol, indent=2, ensure_ascii=False) + "\n").encode()
        with path.open("xb") as output:
            output.write(raw)
        with checksum.open("x") as output:
            output.write(f"{sha(raw)}  preregistration.json\n")
        print(sha(raw), len(protocol["cells"]))


if __name__ == "__main__":
    main()
