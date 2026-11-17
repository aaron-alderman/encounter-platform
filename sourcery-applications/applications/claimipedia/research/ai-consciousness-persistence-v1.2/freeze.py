"""Freeze strict same-action pending-ledger comparisons."""
import argparse
from datetime import datetime, timezone
import hashlib
from itertools import product
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1]
ARCHIVE = HERE.parent / "ai-consciousness-persistence-v0.9"
PRIOR = HERE.parent / "ai-consciousness-persistence-v1.1"
ORDERS = ("stale-first", "successor-first")


def iac7(suffix):
    return f"identity-algebra-iac7-{suffix}.json"


L1, L2, L3 = [iac7(s) for s in ("release-decision-ledger", "release-decision-ledger-v2", "release-decision-ledger-v3")]
CANONICAL = iac7("canonical-admission-directive")
RELEASE = iac7("read-only-release-directive")
DEFAULT = iac7("default-switch-directive")
CASES = (
    {
        "id": "read-only-release", "role": "new-same-action-match",
        "target": "read-only-algebra-v2-release",
        "pending": (CANONICAL, "identity-algebra-iac6-decision-ledger.json", L1),
        "approved": (RELEASE, L1, L2),
        "approvedReceipt": iac7("read-only-release.receipt"),
        "pendingReceipt": iac7("canonical-admission.receipt"),
    },
    {
        "id": "default-switch", "role": "original-failure-replication",
        "target": "default-version-switch",
        "pending": (RELEASE, L1, L2),
        "approved": (DEFAULT, L2, L3),
        "approvedReceipt": iac7("default-switch.receipt"),
        "pendingReceipt": iac7("read-only-release.receipt"),
    },
)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified_protocol(directory):
    raw = (directory / "preregistration.json").read_bytes()
    digest = sha(raw)
    if digest != (directory / "preregistration.sha256").read_text().split()[0]:
        raise ValueError(f"Protocol digest mismatch in {directory.name}")
    return json.loads(raw), digest


def decision(ledger, target):
    found = [row for row in ledger["decisions"] if row["id"] == target]
    if len(found) != 1:
        raise ValueError("Expected one exact decision row")
    return found[0]


def prepare():
    archive, archive_hash = verified_protocol(ARCHIVE)
    _, prior_hash = verified_protocol(PRIOR)
    source_ids = sorted({name for case in CASES for state in ("pending", "approved") for name in case[state]}
                        | {case[key] for case in CASES for key in ("approvedReceipt", "pendingReceipt")})
    captured = {row["id"]: row for row in archive["sources"]}
    raw = {name: (APP / "docs" / name).read_bytes() for name in source_ids}
    objects = {name: json.loads(body) for name, body in raw.items()}
    for name, body in raw.items():
        if sha(body) != captured[name]["sha256"]:
            raise ValueError(f"Source differs from archived bytes: {name}")
    sources = [captured[name] for name in source_ids]

    anchors = {(c["case"], c["history"], c["approveLabel"], c["firstLabel"]): c for c in archive["cells"]
               if c["method"] == "lexical" and c["variant"] == "top1"}
    provenance, cells = {}, []
    for case in CASES:
        target = case["target"]
        pending_anchor, pending_old, pending_current = case["pending"]
        approved_anchor, stale, successor = case["approved"]
        if pending_current != stale or objects[successor]["predecessor"] != stale:
            raise ValueError("Missing authored predecessor chain")
        before = decision(objects[stale], target)
        after = decision(objects[successor], target)
        if (before["status"], before["decision"], after["status"]) != ("pending", None, "approved"):
            raise ValueError("Expected an explicit pending-to-approved transition")
        if objects[approved_anchor]["decision"] != target or objects[approved_anchor]["status"] != "approved":
            raise ValueError("Approval directive does not name the target")
        if set(case["pending"]) & {approved_anchor, successor, case["approvedReceipt"]}:
            raise ValueError("Future approval in a pending packet")
        pending_receipt, approved_receipt = (objects[case[k]] for k in ("pendingReceipt", "approvedReceipt"))
        for receipt, required in (
            (pending_receipt, {"inputs": (pending_anchor,), "outputs": (pending_current,)}),
            (approved_receipt, {"inputs": (approved_anchor, stale), "outputs": (successor,)}),
        ):
            for role, names in required.items():
                for name in names:
                    if receipt[role][name] != "sha256:" + sha(raw[name]):
                        raise ValueError(f"Receipt did not bind {name}")
        if pending_old == L1 and decision(objects[L1], target)["status"] != "pending":
            raise ValueError("Older pending control is inapplicable")
        if pending_old != L1 and objects[pending_old]["releaseCandidateDecision"]["released"] is not False:
            raise ValueError("Candidate-only control contains a release")
        provenance[case["id"]] = {"pendingRow": before, "approvedRow": after,
                                  "authoredPredecessor": stale,
                                  "verifiedReceiptRoles": ["pending checkpoint", "target approval"]}

        for state in ("pending", "approved"):
            fixed, old, current = case[state]
            for label, first, order, old_on, current_on in product(
                ("A", "B"), ("A", "B"), ORDERS, (False, True), (False, True)
            ):
                arm = f"{int(old_on)}{int(current_on)}"
                anchor = anchors[case["id"], state, label, first]
                additions = [(old, old_on), (current, current_on)]
                if order == "successor-first":
                    additions.reverse()
                selected = [fixed, *(name for name, include in additions if include)]
                packet = "\n\n".join(f'<record source="{name}">\n{captured[name]["text"]}\n</record>'
                                       for name in selected)
                heading = anchor["prompt"].partition("\n\n")[0]
                prompt = f'{heading}\n\n{packet}\n\n{anchor["decision"]}'
                cell_id = sha(f"v1.2|{case['id']}|{state}|{label}|{first}|{order}|{arm}".encode())[:12]
                cells.append({"id": cell_id, "case": case["id"], "state": state, "arm": arm,
                              "approveLabel": label, "firstLabel": first, "ledgerOrderBlock": order,
                              "selected": selected, "decision": anchor["decision"], "prompt": prompt,
                              "promptSha256": sha(prompt.encode())})
    cells.sort(key=lambda c: c["id"])
    if len(cells) != 128 or len({c["id"] for c in cells}) != 128:
        raise ValueError("Incomplete factorial")

    return {
        "protocol": "claimipedia-ai-consciousness-persistence-explicit-pending-factorial/1.2",
        "status": "frozen-before-actor-dispatch",
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorSha256": prior_hash, "archiveSha256": archive_hash,
        "eligibility": "Exact same decision ID with an explicitly pending row in the older ledger and an approved row in an authored successor, supported by the corresponding approval directive and a hash-bound receipt. Retained checkout search found read-only release as the one additional exact match. Default switch is a replication reference. Both belong to IAC7. Exclude open review proposals, candidate admissions for other actions, and still-pending actions without an approved successor.",
        "design": "Two decision tracks × two checkpoints × four arms × two answer labels × two presentation orders × two ledger-order blocks. 128 fresh choices. Same source projections and choice prompts as v0.9. Each checkpoint fixes its own directive. Both optional records follow it, with their order balanced in arm 11. Other arms repeat the identical label/display prompt in two fresh sessions.",
        "pendingControls": "At read-only pending, fix canonical admission; add the older IAC6 candidate-only record and/or the v1 ledger explicitly marking read-only release pending. At default-switch pending, fix read-only release; add v1 and/or v2 ledgers both explicitly pending for the default switch. No future target directive, approved successor, or approval receipt is provided at a pending checkpoint.",
        "cases": CASES, "sources": sources, "provenance": provenance, "actor": archive["actor"],
        "primary": "Within each approved action, score approval counts and matched differences: remove stale without successor (00−10), add successor with stale (11−10), remove stale with successor (01−11), add successor without stale (01−00). Treat read-only as the new action and default as a replication. A repair is demonstrated only on matched strata that exhibit a stale-only loss against directive-only; report the number and recovery without averaging away action differences.",
        "pendingSafety": "Count false approvals by action and arm. Report paired pending-to-approved flips and both-ledgers order contrasts as secondary outcomes. No population false-approval estimate or cross-programme generalization.",
        "stopping": "One fresh choice per frozen cell, no post-outcome changes, repairs, or replacements. Exclude malformed JSON and tool use. Stop new dispatch on tool use or systematic backend failure. Report complete denominators and missing cells.",
        "authority": "observation-and-proposal-only", "canonicalEffect": "none", "cells": cells,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    protocol = prepare()
    path, checksum = HERE / "preregistration.json", HERE / "preregistration.sha256"
    if args.verify:
        data = path.read_bytes()
        frozen = json.loads(data)
        protocol["frozenAtUtc"] = frozen["frozenAtUtc"]
        if sha(data) != checksum.read_text().split()[0] or json.loads(json.dumps(protocol)) != frozen:
            raise ValueError("Frozen replay mismatch")
        print("Verified both exact pending-to-approved transitions and all 128 frozen prompts.")
    else:
        data = (json.dumps(protocol, indent=2) + "\n").encode()
        with path.open("xb") as output:
            output.write(data)
        with checksum.open("x") as output:
            output.write(f"{sha(data)}  preregistration.json\n")
        print(sha(data), len(protocol["cells"]))


if __name__ == "__main__":
    main()
