"""Secondary Claimipedia panel enriched for language about contest and refusal."""
import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

import study_power as main

HERE = main.HERE
SCREEN = re.compile(r"\b(?:contest\w*|appeal\w*|dissent\w*|refus\w*|silenc\w*|veto\w*|"
                    r"opt[ -]out|exit\w*|object\w*|challenge\w*|criticiz\w*|criticis\w*|"
                    r"recourse|disconfirm\w*)\b", re.I)
FILES = {**main.FILES, **{name: HERE / name for name in (
    "frozen.json", "features.json", "features.sha256", "challenge.py", "CHALLENGE-PREREGISTRATION.md")}}


def select():
    base = main.base
    rows = main.corpus()
    excluded = set(base.EXAMPLES) | {row["id"] for row in main.frozen()}
    for sample in (base.frozen(), main.fresh.prior.frozen(), main.fresh.gate.frozen(), main.fresh.frozen()):
        excluded |= {row["id"] for part in sample.values() for row in part}
    excluded |= {key for group in base.read("crystal")["groups"] for part in group["records"] for key in part}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {row["id"] for row in base.read("v3")["records"]}
    for key in ("causal", "advisory"):
        excluded |= {row["id"] for row in base.read(key)["rows"]}
    exact = defaultdict(set)
    for key, row in rows.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    equivalent = [rows.keys() & set(row["recordIds"]) for row in base.read("equivalence")["decisions"]
                  if row["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in rows}
    for group in [*exact.values(), *equivalent]:
        union = set().union(*(components[key] for key in group))
        for key in union:
            components[key] = union
    result = []
    for domain, target in zip(main.DOMAINS[1:], (8, 4), strict=True):
        eligible = sorted((key for key, row in rows.items() if row["domain"] == domain
                           and SCREEN.search(row["text"]) and len(base.WORD.findall(row["text"])) >= 12
                           and not row["text"].rstrip().endswith("?")),
                          key=lambda key: main.rank("challenge-sample", key))
        count = 0
        for key in eligible:
            if not components[key] & excluded:
                result.append({"id": key, "domain": domain})
                excluded |= components[key]
                count += 1
                if count == target:
                    break
        if count != target:
            raise ValueError(f"Insufficient fresh challenge records in {domain}: {count}")
    return result


def fingerprints():
    return {name: main.sha(path) for name, path in FILES.items()}


def frozen():
    doc = main.read("challenge-frozen.json")
    if doc["sha256"] != fingerprints() or doc["rows"] != select():
        raise ValueError("Frozen secondary panel changed")
    return doc["rows"]


def features():
    path = HERE / "challenge-features.json"
    result = main.read(path.name)
    rows = main.corpus()
    if set(result) != {row["id"] for row in frozen()} or main.sha(path) != (
        HERE / "challenge-features.sha256"
    ).read_text().strip():
        raise ValueError("Secondary features changed")
    for key, row in result.items():
        if set(row) != {"power", "affected", *main.AXES}:
            raise ValueError("Invalid annotation")
        for axis in main.AXES:
            item = row[axis]
            if (type(item["sign"]) is not int or item["sign"] not in (-1, 0, 1)
                    or not item["note"].strip() or item["sign"] != 0 and not item["quote"]
                    or item["quote"] and item["quote"] not in rows[key]["text"]):
                raise ValueError("Invalid feature or evidence")
    return result


def packet():
    rows = main.corpus()
    labels = {main.rank("challenge-label", row["id"])[:12]: row["id"] for row in frozen()}
    if len(labels) != 12:
        raise ValueError("Invalid opaque-label count")
    return labels, sorted(({"id": opaque, "text": rows[key]["text"]} for opaque, key in labels.items()),
                          key=lambda row: main.rank("challenge-display", row["id"]))


def score():
    coded = features()
    labels, displayed = packet()
    if labels != main.read("challenge-key.json") or displayed != main.read("challenge-packet.json"):
        raise ValueError("Secondary reviewer material changed")
    reviewed = main.read("challenge-review.json")
    if set(reviewed) != set(labels) or any(row["label"] not in main.LABELS or not row["reason"].strip()
                                          for row in reviewed.values()):
        raise ValueError("Invalid blinded review")
    paired = {}
    for label, key in labels.items():
        signs = {axis: coded[key][axis]["sign"] for axis in main.AXES}
        predictions = {axis: main.prediction(value) for axis, value in signs.items()}
        predictions["combined"] = main.prediction(sum(signs.values()))
        paired[key] = {"label": reviewed[label]["label"], "signs": signs, "predictions": predictions}
    records = list(paired.values())
    counts = Counter(r["label"] for r in records)
    return {
        "label_counts": counts, "paired": paired,
        "metrics": {model: main.tally(records, model) for model in (*main.AXES, "combined")},
        "adequate_class_counts": min(counts[k] for k in main.CLASSES) >= 4,
        "challenge_available": sum(bool(r["signs"]["challenge"]) for r in records),
        "challenge_available_in_binary": sum(bool(r["signs"]["challenge"]) for r in records
                                             if r["label"] in main.CLASSES),
        "challenge_predicted_correct": sum(r["predictions"]["challenge"] == r["label"] for r in records
                                          if r["label"] in main.CLASSES),
        "sha256": {name: main.sha(HERE / name) for name in (
            "challenge-frozen.json", "challenge-features.json", "challenge-packet.json", "challenge-review.json")},
    }


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "show", "packet", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        main.write("challenge-frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                                             "sha256": fingerprints(), "rows": select()})
    elif action == "show":
        rows = main.corpus()
        for item in frozen():
            print(json.dumps(rows[item["id"]], ensure_ascii=False))
    elif action == "packet":
        features()
        key, records = packet()
        main.write("challenge-key.json", key)
        main.write("challenge-packet.json", records)
    else:
        main.write("challenge-results.json", score())


if __name__ == "__main__":
    run()
