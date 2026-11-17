"""Freeze the target-row, provenance and length-matched neutral intervention."""
import argparse
from datetime import datetime, timezone
import hashlib
from itertools import product
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
PRIOR = HERE.parent / "ai-consciousness-persistence-v1.5"
TARGET = {"id": "default-version-switch", "prerequisiteSatisfied": True}
WORDS = ("river", "stone", "granite", "grain", "speckle", "pale", "gray", "smooth",
         "sand", "ochre", "mottled", "ridge", "curve", "texture", "band", "silt")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def neutral_words(length, offset=0):
    if length < 0:
        raise ValueError("Neutral frame exceeds the byte budget")
    words = []
    remaining = length
    for index in range(length):
        word = WORDS[(offset + index) % len(WORDS)]
        width = len(word) + bool(words)
        if width > remaining:
            break
        words.append(word)
        remaining -= width
    return " ".join(words) + " " * remaining


def neutral_line(name, original, offset):
    return name + neutral_words(len(original) - len(name), offset)


def neutral_object(original, offset):
    key = '{"id":"river-stone","texture":"'
    tail = '"}'
    return key + neutral_words(len(original) - len(key) - len(tail), offset) + tail


def split_record(prompt):
    prefix, tag, rest = prompt.rpartition("<record source=")
    source, header_end, rest = rest.partition(">\n")
    body, end, suffix = rest.partition("\n</record>")
    if not tag or not header_end or not end:
        raise ValueError("Missing second ledger record")
    return prefix, source, body, end + suffix


def record(source, body):
    return f'<record source={source}>\n{body}'


def build_iac7(source, body, background, keep_row, keep_provenance):
    lines = body.splitlines()
    fields = [line.partition(": ")[0] for line in lines]
    if fields != ["protocol", "predecessor", "exclusions", "decisions", "summary"]:
        raise ValueError("Unexpected residual ledger")
    protocol, predecessor, exclusions, decisions, summary = lines
    rows = json.loads(decisions.removeprefix("decisions: "))
    if rows[-1] != TARGET or decisions != "decisions: " + compact(rows):
        raise ValueError("Unexpected residual decision list")
    if not keep_provenance:
        name = ("field-notes-" + "-".join(WORDS) * 2)[:len(source) - 2]
        source = compact(name)
        protocol = neutral_line("surface: ", protocol, 0)
        predecessor = neutral_line("pattern: ", predecessor, 4)
    row_texts = [compact(row) for row in rows]
    if not keep_row:
        row_texts[-1] = neutral_object(row_texts[-1], 7)
    list_label = "decisions: "
    if background == "neutral":
        list_label = "specimens: "
        row_texts[:2] = [neutral_object(text, 3 + i) for i, text in enumerate(row_texts[:2])]
        exclusions = neutral_line("material: ", exclusions, 3)
        summary = neutral_line("textures: ", summary, 9)
    body = "\n".join((protocol, predecessor, exclusions,
                      list_label + "[" + ",".join(row_texts) + "]", summary))
    return record(source, body)


def prepare():
    raw = (PRIOR / "preregistration.json").read_bytes()
    digest = sha(raw)
    if digest != (PRIOR / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Predecessor digest mismatch")
    prior = json.loads(raw)
    for source in prior["sources"]:
        if sha((ROOT / source["id"]).read_bytes()) != source["sha256"]:
            raise ValueError(f"Changed source: {source['id']}")
    residual = [cell for cell in prior["cells"] if cell["lineage"] == "IAC7"
                and cell["arm"] == "drop-all-listed-cues"]
    if len(residual) != 8:
        raise ValueError("Missing the eight original ablated packets")
    blocks = {(split_record(c["prompt"])[1], split_record(c["prompt"])[2]) for c in residual}
    source, body = next(iter(blocks))
    if len(blocks) != 1:
        raise ValueError("Residual ledger changed across checkpoints")
    original = record(source, body)
    packets = {}
    for background, row, provenance in product(("residual", "neutral"), (0, 1), (0, 1)):
        packet = build_iac7(source, body, background, row, provenance)
        if ([len(line.encode()) for line in packet.splitlines()]
                != [len(line.encode()) for line in original.splitlines()]):
            raise ValueError("Factorial packet lost its byte and line-length match")
        packets[f"{background}/row{row}-prov{provenance}"] = packet
    if packets["residual/row1-prov1"] != original:
        raise ValueError("Original fully ablated ledger is not byte-identical")

    cells = []
    for anchor in prior["cells"]:
        arm = anchor["arm"]
        if arm in ("anchor-only", "native-ledger"):
            pairs = [(arm, anchor["prompt"])]
            if anchor["lineage"] == "SRP7" and arm == "anchor-only":
                prefix, _, decision = anchor["prompt"].rpartition("\n\n")
                pairs.append(("neutral-control", prefix + "\n\n" + packets["neutral/row0-prov0"]
                              + "\n</record>\n\n" + decision))
        elif anchor["lineage"] == "IAC7" and arm == "drop-all-listed-cues":
            prefix, marker, _ = anchor["prompt"].rpartition("<record source=")
            suffix = split_record(anchor["prompt"])[3]
            if not marker:
                raise ValueError("Missing residual record")
            pairs = [(name, prefix + packet + suffix) for name, packet in packets.items()]
            if dict(pairs)["residual/row1-prov1"] != anchor["prompt"]:
                raise ValueError("Original residual control changed")
        else:
            continue
        for name, prompt in pairs:
            cell_id = sha(f"v1.6|{anchor['id']}|{name}".encode())[:12]
            cells.append({
                "id": cell_id, "sourceCell": anchor["id"], "lineage": anchor["lineage"],
                "state": anchor["state"], "arm": name, "approveLabel": anchor["approveLabel"],
                "firstLabel": anchor["firstLabel"], "decision": anchor["decision"], "prompt": prompt,
                "promptSha256": sha(prompt.encode()),
            })
    cells.sort(key=lambda row: row["id"])
    if len(cells) != 104 or len({c["id"] for c in cells}) != 104:
        raise ValueError("Incomplete frozen design")
    return {
        "protocol": "claimipedia-ai-consciousness-persistence-row-provenance-neutral/1.6",
        "status": "frozen-before-actor-dispatch", "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorSha256": digest, "actor": prior["actor"], "sources": prior["sources"],
        "design": "104 fresh reset decisions. IAC7 uses ten arms per checkpoint: anchor only, native ledger, and two 2×2 factorials for the target decision row and provenance. One factorial uses the authentic residual ledger background; the other uses neutral content. SRP7 uses anchor-only, native-ledger and the same neutral second record. Four answer-label/display-order variants per arm, at pending and approved checkpoints.",
        "factors": "Row is the remaining default-version-switch object with prerequisiteSatisfied=true. Provenance is the source label, protocol and predecessor lines as one bundle. Absent components get unrelated stone-description text in the same slots. The neutral background also replaces earlier approvals, exclusions and summary with stone descriptions. Record count, order, UTF-8 bytes, and each line's byte length match the original fully ablated IAC7 ledger across all eight factorial arms. Token counts are not matched. Residual both-present and native and anchor controls retain exact prior prompt bytes.",
        "primary": "At IAC7 approved, score paired neutral-only minus anchor-only, and residual-with-neither minus neutral-only. For each background report row effects at each provenance setting, provenance effects at each row setting, and the interaction. Compare neutral row-only and provenance-only against neutral-only to assess sufficiency under this neutral background. Report all arm counts and repeat native and residual controls.",
        "controls": "Report false approvals by arm at each pending checkpoint and paired checkpoint contrasts. At SRP7 score the same neutral addition versus its anchor, plus the original native control. No future approval is introduced in the pending packets. The neutral record is a single constructed filler, not a representative estimate of unrelated content. Provenance members cannot be separately attributed in this design.",
        "stopping": "One fresh response per cell; no replacement or repair. Exclude malformed JSON and tool use. Stop new dispatch on tool use or systematic failure. Report complete matched denominators and missing cells.",
        "authority": "observation-and-proposal-only", "canonicalEffect": "none",
        "matchedRecordBytesExcludingClosingTag": len(original.encode()),
        "factorialPackets": packets, "cells": cells,
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
        if sha(raw) != checksum.read_text().split()[0] or protocol != saved:
            raise ValueError("Frozen replay mismatch")
        print("Reproduced all 104 prompts and all eight exact byte-length-matched second records.")
    else:
        raw = (json.dumps(protocol, indent=2, ensure_ascii=False) + "\n").encode()
        with path.open("xb") as output:
            output.write(raw)
        with checksum.open("x") as output:
            output.write(f"{sha(raw)}  preregistration.json\n")
        print(sha(raw), len(protocol["cells"]))


if __name__ == "__main__":
    main()
