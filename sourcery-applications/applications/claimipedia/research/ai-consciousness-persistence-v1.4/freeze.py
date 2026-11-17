"""Freeze the matched format-by-wording experiment or verify frozen prompts."""
import argparse
from datetime import datetime, timezone
import hashlib
from itertools import product
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
APP = HERE.parents[1]
FORMAT_WORDING = tuple(product(("json", "rel"), ("pending", "unfilled")))
LINEAGES = {
    "IAC7": ("1.2", "default-switch", "default-version-switch", "status"),
    "SRP7": ("1.3", "spin23-srp7-scoped-admission", "reviewPacket.spin23.SRP7", "disposition"),
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(rows, format):
    if format == "json":
        return json.dumps(rows, ensure_ascii=False, indent=2)
    return "\n".join("(" + ", ".join(json.dumps(value, ensure_ascii=False) for value in row) + ")"
                     for row in rows)


def decode(text, format):
    if format == "json":
        return json.loads(text)
    return [json.loads("[" + line[1:-1] + "]") for line in text.splitlines()]


def ledger_rows(lineage, ledger):
    if lineage == "SRP7":
        return decode(ledger["text"], "rel")
    rows = []
    for key, value in ledger["projection"].items():
        if key == "decisions":
            for decision in value:
                rows.extend([decision["id"], field, entry] for field, entry in decision.items())
        else:
            rows.append([Path(ledger["id"]).stem, key, value])
    return rows


def prepare():
    cells, sources, native_ledgers, predecessors = [], {}, {}, {}
    actor = None
    for lineage, (version, case, subject, field) in LINEAGES.items():
        directory = HERE.parent / f"ai-consciousness-persistence-v{version}"
        raw = (directory / "preregistration.json").read_bytes()
        digest = sha(raw)
        if digest != (directory / "preregistration.sha256").read_text().split()[0]:
            raise ValueError("Predecessor preregistration digest mismatch")
        prior = json.loads(raw)
        predecessors[version] = digest
        if actor is None:
            actor = prior["actor"]
        elif actor != prior["actor"]:
            raise ValueError("Actor configurations differ")
        by_id = {row["id"]: row for row in prior["sources"]}
        definition = next(row for row in prior["cases"] if row["id"] == case)
        stale = definition["approved"][1]
        if stale != definition["pending"][2]:
            raise ValueError("Same ledger must be pending-current and approved-stale")
        original_rows = ledger_rows(lineage, by_id[stale])
        operative = [index for index, row in enumerate(original_rows) if row[:2] == [subject, field]]
        if len(operative) != 1:
            raise ValueError("Missing or ambiguous target status")
        slot = operative[0]
        original_word = original_rows[slot][2]
        if original_word != ("pending" if lineage == "IAC7" else "unfilled"):
            raise ValueError("Target must be a genuine pending or unfilled disposition")
        native_ledgers[lineage] = {"id": stale, "operativeSubject": subject, "operativeField": field,
                                   "nativeLabel": original_word, "facts": original_rows}

        def anchor(state, arm, label, first):
            matches = [c for c in prior["cells"] if c["case"] == case and c["state"] == state
                       and c["arm"] == arm and c["approveLabel"] == label and c["firstLabel"] == first]
            if len(matches) != 2 or len({c["prompt"] for c in matches}) != 1:
                raise ValueError("Expected two byte-identical prior anchor variants")
            return matches[0]

        for state, label, first in product(("pending", "approved"), ("A", "B"), ("A", "B")):
            empty = anchor(state, "00", label, first)
            native = anchor(state, "01" if state == "pending" else "10", label, first)
            fixed, = empty["selected"]
            if native["selected"] != [fixed, stale] or native["decision"] != empty["decision"]:
                raise ValueError("Native and empty controls do not match")
            for name in (fixed, stale):
                path = APP / "docs" / name if lineage == "IAC7" else ROOT / name
                if sha(path.read_bytes()) != by_id[name]["sha256"]:
                    raise ValueError(f"Archived source mismatch: {name}")
                sources[str(path.relative_to(ROOT))] = by_id[name]["sha256"]
            prefix, separator, decision = empty["prompt"].rpartition("\n\n")
            if not separator or decision != empty["decision"]:
                raise ValueError("Original wrapper changed")
            prompts = {"anchor-only": empty["prompt"], "native-ledger": native["prompt"]}
            for format, wording in FORMAT_WORDING:
                rows = [row.copy() for row in original_rows]
                rows[slot][2] = wording
                encoded = encode(rows, format)
                if decode(encoded, format) != rows:
                    raise ValueError("Ledger encoding was lossy")
                source_id = Path(stale).name.split(".")[0]
                prompts[f"{format}/{wording}"] = (
                    f'{prefix}\n\n<record source="{source_id}">\n{encoded}\n</record>\n\n{decision}'
                )
            for arm, prompt in prompts.items():
                ident = sha(f"v1.4|{lineage}|{state}|{label}|{first}|{arm}".encode())[:12]
                cells.append({"id": ident, "lineage": lineage, "state": state, "arm": arm,
                              "approveLabel": label, "firstLabel": first, "decision": decision,
                              "prompt": prompt, "promptSha256": sha(prompt.encode())})

    cells.sort(key=lambda row: row["id"])
    if len(cells) != 96 or len({c["id"] for c in cells}) != 96:
        raise ValueError("Incomplete factorial and controls")
    return {
        "protocol": "claimipedia-ai-consciousness-persistence-ledger-format-wording/1.4",
        "status": "frozen-before-actor-dispatch", "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorDigests": predecessors,
        "sources": [{"id": id, "sha256": digest} for id, digest in sorted(sources.items())],
        "actor": actor, "nativeLedgers": native_ledgers,
        "design": "IAC7 default switch and SRP7 scoped results admission. Two checkpoint states, four recoded arms plus two exact predecessor controls, two answer-label assignments, two display orders. 96 new reset decisions. Same authentic pending ledger is current in the pending checkpoint and stale in the approved checkpoint. Fixed checkpoint anchor and choice text are identical across arms. No newer approval evidence is supplied in pending trials.",
        "interventions": "Encode the same triples as a JSON array or REL-style tuples. All archived ledger projection facts remain present in the recoded arms, with the IAC7 decision objects split into rows. Within the 2×2, change only the operative target status/disposition value pending versus unfilled, retaining surrounding status, null-decision and scope facts. Exact prior prompts for anchor-only and native-ledger are controls. Native versus recoded also changes structure and source label, so that comparison cannot isolate a format or word effect.",
        "primary": "Confirm whether the native-ledger approval difference reproduces against each anchor-only control. In the recoded arms estimate approval differences REL minus JSON at each wording and unfilled minus pending at each format, within lineage at the approved checkpoint. Report paired wins/losses/ties and the interaction. Compare these contrasts across lineages on the same label/order strata. A native difference alone cannot establish either factor as causal.",
        "pendingSafety": "Report false approvals by lineage and all six arms, and matched pending-to-approved differences. No inference of a population error rate. Four pairs per contrast are prompt variants, not independent lineages.",
        "stopping": "One fresh choice per frozen cell, no repair or replacement. Exclude tool use and malformed JSON. Halt new dispatch on tool use or systematic backend failure. Report missing data and complete matched denominators.",
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
        archived = json.loads(raw)
        protocol["frozenAtUtc"] = archived["frozenAtUtc"]
        if sha(raw) != checksum.read_text().split()[0] or protocol != archived:
            raise ValueError("Frozen replay mismatch")
        print("Reproduced all 96 prompts, including the byte-identical original controls.")
    else:
        raw = (json.dumps(protocol, indent=2, ensure_ascii=False) + "\n").encode()
        with path.open("xb") as output:
            output.write(raw)
        with checksum.open("x") as output:
            output.write(f"{sha(raw)}  preregistration.json\n")
        print(sha(raw), len(protocol["cells"]))


if __name__ == "__main__":
    main()
