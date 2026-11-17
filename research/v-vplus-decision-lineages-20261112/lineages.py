"""Source-bound, blinded checkpoint comparison for five Claimipedia lineages."""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1] / "sourcery-applications/applications/claimipedia"
FIELDS = {
    "slope": {"observed", "projected", "unknown"},
    "ratchet": {"active", "pending", "unknown"},
    "path": {"demonstrated", "retained", "conditional", "blocked", "unknown"},
    "chooser": {"authorized", "gated", "unknown"},
    "cost": {"specific", "qualitative", "unknown"},
}
CUTS = ("early", "late")
PACKET_FILES = {"early": "packet-41.json", "late": "packet-67.json"}
REVIEW_FILES = {"early": "review-41.json", "late": "review-67.json"}
AUDIT = (
    "research/claimipedia-authority-resolver-v0.1/preregistration.json",
    "research/ai-consciousness-persistence-v1.6/preregistration.json",
)
# Records were selected by ordered, documented checkpoints, not by scoring labels.
def ops(name):
    return f"research/INTERNAL-OPERATIONS-{name}-2026-10-19.md"


def control(name):
    return f"research/RESEARCH-CONTROL-PLANE-{name}-CHECKPOINT-2026-10-19.md"


LINEAGES = {
    "data-authority": {
        "subject": "Adoption of object-bound data authority in a successor store. The return target is the predecessor's operational selection and data-authority posture.",
        "early": 2,
        "paths": [f"INTERNAL-OPERATIONS-DATA-AUTHORITY-{stage}-CHECKPOINT-2026-10-18.md"
                  for stage in ("LANDSCAPE", "ADOPTION", "SUCCESSOR")],
    },
    "dual-base": {
        "subject": "Installation and activation of the dual-base Temple generation. The return target is the preceding serving generation and route behavior.",
        "early": 2,
        "paths": [ops(s) for s in ("DUAL-BASE-INACTIVE-QUALIFICATION",
                                  "DUAL-BASE-INSTALLER-QUALIFICATION-CHECKPOINT",
                                  "DUAL-BASE-ACTIVATION-AND-LANE-INVENTORY")],
    },
    "parallel-lane": {
        "subject": "Qualification and activation of the parallel-lane migration capability. The return target is the preceding serving generation, with registered lanes preserved.",
        "early": 2,
        "paths": [ops("PARALLEL-LANE-MIGRATION-" + s)
                  for s in ("QUALIFICATION", "INACTIVE-QUALIFICATION", "ACTIVATION")],
    },
    "bounded-primary": {
        "subject": "Selection of bounded Research Control Plane storage as the default. The return target is legacy routing with all admitted writes preserved.",
        "early": 2,
        "paths": [control("BOUNDED-PRIMARY-ROUTING"), control("BOUNDED-PRODUCTION-ACTIVATION"),
                  ops("BOUNDED-PRIMARY-RETIREMENT-PROPOSAL-CHECKPOINT")],
    },
    "predecessor-custody": {
        "subject": "Custody and disposition of two main-Temple predecessors. The return target is an operational predecessor at its original location, including separately authorized pointer restoration where needed.",
        "early": 2,
        "paths": [ops(s + "-CHECKPOINT") for s in (
            "RECOVERABLE-RETIREMENT-EXECUTION", "PREDECESSOR-GC-PROPOSAL", "PREDECESSOR-GC-EXECUTION")],
    },
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rank(purpose, key):
    return digest(f"claimipedia-decision-lineages-v1|{purpose}|{key}".encode())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, indent=2, ensure_ascii=False)
        out.write("\n")


def read(name):
    return json.loads((HERE / name).read_bytes())


def inputs():
    paths = [path for row in LINEAGES.values() for path in row["paths"]]
    if len(paths) != len(set(paths)):
        raise ValueError("A document appears in two lineages")
    return {
        "research": {name: digest((HERE / name).read_bytes()) for name in
                     ("lineages.py", "PREREGISTRATION.md", "REVIEW-RUBRIC.md")},
        "source": {path: digest((APP / path).read_bytes()) for path in [*paths, *AUDIT]},
        "lineages": LINEAGES,
    }


def frozen():
    value = read("frozen.json")
    if value["inputs"] != inputs():
        raise ValueError("Frozen inputs changed")
    return value["inputs"]["lineages"]


def packets():
    rows = frozen()
    key, result = {}, {}
    for cut in CUTS:
        packet = []
        for name, lineage in rows.items():
            label = rank(cut, name)[:12]
            if label in key:
                raise ValueError("Nonunique opaque ID")
            key[label] = {"lineage": name, "cut": cut}
            paths = lineage["paths"][:lineage["early"]] if cut == "early" else lineage["paths"]
            records = [{"id": f"D{i}", "text": (APP / path).read_text().strip()}
                       for i, path in enumerate(paths, 1)]
            packet.append({"id": label, "subject": lineage["subject"], "records": records})
        result[cut] = sorted(packet, key=lambda row: rank("display", row["id"]))
    return key, result


def verify_row(row, packet):
    if set(row) != set(FIELDS):
        raise ValueError("Missing or extra evaluation field")
    records = {doc["id"]: doc["text"] for doc in packet["records"]}
    for field, allowed in FIELDS.items():
        mark = row[field]
        if set(mark) != {"status", "reason", "evidence"} or mark["status"] not in allowed:
            raise ValueError(f"Invalid {field} result")
        if not mark["reason"].strip() or mark["status"] != "unknown" and not mark["evidence"]:
            raise ValueError(f"Missing {field} reason or source")
        if not isinstance(mark["evidence"], list) or any(
                not e["quote"].strip() or e["quote"] not in records.get(e["record"], "")
                for e in mark["evidence"]):
            raise ValueError(f"Invalid {field} source evidence for {packet['id']}")
        if field == "slope" and mark["status"] == "observed" and len(
                {e["record"] for e in mark["evidence"]}) < 2:
            raise ValueError("Observed slope needs two ordered records")


def verified_codes(name, examples):
    path = HERE / name
    if (HERE / (name + ".sha256")).read_text().strip() != digest(path.read_bytes()):
        raise ValueError("Investigator annotation changed")
    values = read(name)
    if set(values) != set(examples):
        raise ValueError("Annotation coverage mismatch")
    for key, row in values.items():
        verify_row(row, examples[key])
    return values


def score():
    key, expected = packets()
    if key != read("review-key.json") or any(
            expected[cut] != read(PACKET_FILES[cut]) for cut in CUTS):
        raise ValueError("Blind packet changed")
    annotations = {}
    reviews = {}
    for cut in CUTS:
        examples = {row["id"]: row for row in expected[cut]}
        annotations.update(verified_codes(f"{cut}-annotations.json", examples))
        values = read(REVIEW_FILES[cut])
        if set(values) != set(examples):
            raise ValueError(f"Missing review for {cut} cut")
        for label, row in values.items():
            verify_row(row, examples[label])
        reviews.update(values)

    pairs = {
        f"{row['lineage']}:{row['cut']}": {
            "investigator": {f: annotations[label][f]["status"] for f in FIELDS},
            "reviewer": {f: reviews[label][f]["status"] for f in FIELDS},
        }
        for label, row in key.items()
    }
    comparison = {}
    for field in FIELDS:
        labels = {who: Counter(row[who][field] for row in pairs.values())
                  for who in ("investigator", "reviewer")}
        both_known = [p for p in pairs.values() if all(p[who][field] != "unknown"
                                                       for who in ("investigator", "reviewer"))]
        comparison[field] = {
            "statuses": labels,
            "agreement": sum(p["investigator"][field] == p["reviewer"][field] for p in pairs.values()),
            "both_known": len(both_known),
            "agreement_both_known": sum(p["investigator"][field] == p["reviewer"][field]
                                        for p in both_known),
            "shared_known_classes": sorted(set(labels["investigator"]) & set(labels["reviewer"]) - {"unknown"}),
        }
    shifts = {}
    for field in FIELDS:
        result = []
        for name in LINEAGES:
            pair = [pairs[f"{name}:{cut}"] for cut in CUTS]
            a, b = ([r[who][field] for r in pair] for who in ("investigator", "reviewer"))
            result.append({"lineage": name, "investigator": a, "reviewer": b,
                           "same_transition": a == b, "both_changed": a[0] != a[1] and b[0] != b[1]})
        shifts[field] = result
    return {
        "pairs": pairs, "fields": comparison, "shifts": shifts,
        "all_known_fields_agree_on_both_cuts": sum(
            all(row["same_transition"] for field in FIELDS
                for row in shifts[field] if row["lineage"] == name)
            and all(all(status != "unknown" for status in pairs[f"{name}:{cut}"][who].values())
                    for cut in CUTS for who in ("investigator", "reviewer"))
            for name in LINEAGES),
        "sha256": {name: digest((HERE / name).read_bytes()) for name in (
            "frozen.json", "early-annotations.json", "late-annotations.json", *PACKET_FILES.values(),
            *REVIEW_FILES.values())},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "packet", "verify", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(), "inputs": inputs()})
    elif action == "packet":
        key, examples = packets()
        write("review-key.json", key)
        for cut, packet in examples.items():
            write(PACKET_FILES[cut], packet)
    elif action == "verify":
        key, result = packets()
        print("Verified", len(key), "cuts", {cut: len(rows) for cut, rows in result.items()})
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
