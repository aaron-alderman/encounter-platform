"""Freeze the two-by-two ledger inclusion experiment or verify its replay."""
import argparse
from datetime import datetime, timezone
import hashlib
from itertools import product
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "ai-consciousness-persistence-v0.9"
ORDERS = ("stale-first", "successor-first")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def prepare():
    prior_raw = (PRIOR / "preregistration.json").read_bytes()
    prior_sha = sha(prior_raw)
    if prior_sha != (PRIOR / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Prior preregistration digest mismatch")
    prior = json.loads(prior_raw)
    inputs = prior["retrievalReceipts"]["default-switch/approved/lexical"]
    if inputs != prior["retrievalReceipts"]["default-switch/approved/hybrid"]:
        raise ValueError("Prior rankers must deliver identical packets for this checkpoint")
    packets = inputs["packets"]
    directive, = packets["top1"]
    ordinary_first, stale = packets["top2"]
    versioned_first, successor = packets["version-aware-top2"]
    if ordinary_first != directive or versioned_first != directive or inputs["successorEdges"].get(stale) != successor:
        raise ValueError("Prior packets do not form the planned intervention")
    sources = {s["id"]: s for s in prior["sources"] if s["id"] in (directive, stale, successor)}
    for record in sources.values():
        if sha((HERE / "../../docs" / record["id"]).read_bytes()) != record["sha256"]:
            raise ValueError(f"Source changed: {record['id']}")
    anchors = {(c["variant"], c["approveLabel"], c["firstLabel"]): c for c in prior["cells"]
               if c["case"] == "default-switch" and c["history"] == "approved" and c["method"] == "lexical"}
    cells = []
    for approve_label, first_label, order, stale_present, successor_present in product(
        ("A", "B"), ("A", "B"), ORDERS, (False, True), (False, True)
    ):
        arm = f"{int(stale_present)}{int(successor_present)}"
        anchor = anchors["top1", approve_label, first_label]
        extras = [(stale, stale_present), (successor, successor_present)]
        if order == "successor-first":
            extras.reverse()
        selected = [directive, *(record for record, present in extras if present)]
        text = "\n\n".join(f'<record source="{record}">\n{sources[record]["text"]}\n</record>' for record in selected)
        heading, _, _ = anchor["prompt"].partition("\n\n")
        prompt = f'{heading}\n\n{text}\n\n{anchor["decision"]}'
        baseline = {"00": "top1", "10": "top2", "01": "version-aware-top2"}.get(arm)
        if baseline and prompt != anchors[baseline, approve_label, first_label]["prompt"]:
            raise ValueError(f"Baseline {arm} differs from v0.9")
        cell_id = sha(f"v1.0|{approve_label}|{first_label}|{order}|{arm}".encode())[:12]
        cells.append({"id": cell_id, "arm": arm, "approveLabel": approve_label,
                      "firstLabel": first_label, "ledgerOrderBlock": order,
                      "stalePresent": stale_present, "successorPresent": successor_present,
                      "selected": selected, "decision": anchor["decision"], "prompt": prompt,
                      "promptSha256": sha(prompt.encode())})
    cells.sort(key=lambda c: c["id"])
    if len(cells) != 32 or len({c["id"] for c in cells}) != 32:
        raise ValueError("Incomplete factorial")
    return {
        "protocol": "claimipedia-ai-consciousness-persistence-ledger-factorial/1.0",
        "status": "frozen-before-actor-dispatch",
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorSha256": prior_sha,
        "design": "Approved default-switch checkpoint only. Hold the v0.9 approval directive, decision wrapper and source projections fixed. Cross stale ledger present/absent with successor ledger present/absent, approval label A/B, first displayed label A/B, and stale-first/successor-first order blocks. Both orders are used only where both ledgers appear; other arms get two fresh draws of each identical label/order prompt. Eight matched strata, 32 new actors. Lexical and hybrid produced identical source packets here, so there is no ranker factor.",
        "sources": list(sources.values()),
        "roles": {"directive": directive, "stale": stale, "successor": successor},
        "actor": prior["actor"],
        "primary": "Approval after reset is the binary outcome. For each complete stratum report signed differences: remove stale without successor (00 − 10), add successor while stale remains (11 − 10), remove stale with successor (01 − 11), add successor without stale (01 − 00). Report approvals and paired wins/losses/ties. Include the prior bundled repair (01 − 10) and the difference in the successor effect with versus without stale ((11 − 10) − (01 − 00)).",
        "secondary": "For the both-ledgers arm report approvals separately by ledger order and the matched order contrast at fixed option label and display order. Report how the fresh one- and two-record controls compare with v0.9 descriptively. Include all frozen arm denominators.",
        "interpretation": "Removing stale is sufficient in this task if the directive-only condition restores approval relative to stale-only. Adding the successor can rescue the stale packet if both-ledger approval exceeds stale-only. Conditional effects can coexist. Measure decisions in one approved checkpoint, not false approvals at pending checkpoints, corpus-wide quality or internal persistence. Identical-prompt repetitions and label/order variants do not increase the number of source events.",
        "stopping": "One fresh response per frozen cell, no replacement or schema repair. Exclude malformed JSON and tool use. Stop new dispatch on tool use or systematic backend failure. Compare complete strata and disclose missing cells.",
        "authority": "observation-and-proposal-only", "canonicalEffect": "none", "cells": cells,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    protocol = prepare()
    path = HERE / "preregistration.json"
    checksum = HERE / "preregistration.sha256"
    if args.verify:
        data = path.read_bytes()
        frozen = json.loads(data)
        protocol["frozenAtUtc"] = frozen["frozenAtUtc"]
        if sha(data) != checksum.read_text().split()[0] or protocol != frozen:
            raise ValueError("Frozen replay mismatch")
        print("Reproduced all 32 preregistered actor prompts.")
    else:
        data = (json.dumps(protocol, indent=2) + "\n").encode()
        with path.open("xb") as output:
            output.write(data)
        with checksum.open("x") as output:
            output.write(f"{sha(data)}  preregistration.json\n")
        print(sha(data), len(protocol["cells"]))


if __name__ == "__main__":
    main()
