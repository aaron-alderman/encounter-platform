"""Blinded Claimipedia test of agency, burden, and contestability."""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "v-vplus-hybrid-fresh-index-20261112"
sys.path.insert(0, str(PRIOR))
import fresh

base = fresh.base
PROJECT = base.DOCS.parent / "project.rel"
FILES = {
    **{f"prior:{k}": p for k, p in fresh.FILES.items()},
    "prior_fresh_index": PRIOR / "frozen.json",
    "project": PROJECT,
    **{name: HERE / name for name in ("study_power.py", "PREREGISTRATION.md", "REVIEW-RUBRIC.md")},
}
DOMAINS = (*base.DOMAINS[:2], "Public institutions and conflict")
AXES = ("agency", "cost", "challenge")
CLASSES = ("service", "control")
LABELS = {*CLASSES, "mixed", "unclear"}
SCREEN = re.compile(
    r"\b(?:power\w*|authorit\w*|govern\w*|coerc\w*|institut\w*|lead\w*|"
    r"rul\w*|delegat\w*|protect\w*|control\w*|enforc\w*|consent|decis\w*|manipulat\w*)\b",
    re.I,
)
PREFIX = "claim.claimipedia.worldCollapse.theologicalReflexiveSimulation."


def rank(purpose, key):
    return base.sha(f"claimipedia-power-serves-v1|{purpose}|{key}".encode())


def sha(path):
    return base.sha(path.read_bytes())


def read(name):
    return json.loads((HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")


def corpus():
    records = {k: {"id": k, "text": row["text"], "domain": base.domain(row), "source": "identity map"}
               for k, row in base.records().items()}
    for line in PROJECT.read_text().splitlines():
        if line.startswith(f'("{PREFIX}') and '", "statement", "' in line:
            key, predicate, text, polarity = json.loads("[" + line[1:-1] + "]")
            if predicate == "statement" and polarity == "is":
                records[key] = {"id": key, "text": text, "domain": DOMAINS[2],
                                "source": "Claimipedia project statement"}
    return records


def select():
    records = corpus()
    excluded = set(base.EXAMPLES)
    for sample in (base.frozen(), fresh.prior.frozen(), fresh.gate.frozen(), fresh.frozen()):
        excluded |= {row["id"] for part in sample.values() for row in part}
    excluded |= {key for g in base.read("crystal")["groups"] for part in g["records"] for key in part}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {row["id"] for row in base.read("v3")["records"]}
    for key in ("causal", "advisory"):
        excluded |= {row["id"] for row in base.read(key)["rows"]}

    exact = defaultdict(set)
    for key, row in records.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [records.keys() & set(row["recordIds"]) for row in base.read("equivalence")["decisions"]
                if row["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in records}
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[key] for key in group))
        for key in merged:
            components[key] = merged

    result = []
    for domain in DOMAINS:
        eligible = sorted(
            (key for key, row in records.items() if row["domain"] == domain
             and SCREEN.search(row["text"]) and len(base.WORD.findall(row["text"])) >= 12
             and not row["text"].rstrip().endswith("?")),
            key=lambda key: rank("holdout", key),
        )
        count = 0
        for key in eligible:
            if not components[key] & excluded:
                result.append({"id": key, "domain": domain, "source": records[key]["source"]})
                excluded |= components[key]
                count += 1
                if count == 8:
                    break
        if count != 8:
            raise ValueError(f"Insufficient fresh rows for {domain}: {count}")
    return result


def fingerprints():
    return {name: sha(path) for name, path in FILES.items()}


def frozen():
    data = read("frozen.json")
    if data["sha256"] != fingerprints() or data["rows"] != select():
        raise ValueError("Frozen records or method changed")
    return data["rows"]


def packet():
    records = corpus()
    labels = {rank("label", row["id"])[:12]: row["id"] for row in frozen()}
    if len(labels) != 24:
        raise ValueError("Nonunique opaque labels")
    return labels, sorted(({"id": label, "text": records[key]["text"]} for label, key in labels.items()),
                          key=lambda row: rank("display", row["id"]))


def features():
    path = HERE / "features.json"
    if sha(path) != (HERE / "features.sha256").read_text().strip():
        raise ValueError("Feature artifact changed")
    values = read(path.name)
    records = corpus()
    if set(values) != {row["id"] for row in frozen()}:
        raise ValueError("Missing feature annotation")
    for key, annotation in values.items():
        if set(annotation) != {"power", "affected", *AXES}:
            raise ValueError("Invalid feature annotation")
        for axis in AXES:
            item = annotation[axis]
            sign = item["sign"]
            if (type(sign) is not int or sign not in (-1, 0, 1)
                    or not item["note"].strip() or (sign != 0 and not item["quote"])
                    or (item["quote"] and item["quote"] not in records[key]["text"])):
                raise ValueError(f"Invalid {axis} source evidence for {key}")
    return values


def prediction(score):
    return "service" if score > 0 else "control" if score < 0 else "abstain"


def tally(rows, model):
    eligible = [row for row in rows if row["label"] in CLASSES]
    counts = {label: sum(row["label"] == label for row in eligible) for label in CLASSES}
    correct = {label: sum(row["label"] == label and row["predictions"][model] == label
                          for row in eligible) for label in CLASSES}
    covered = sum(row["predictions"][model] != "abstain" for row in eligible)
    rates = {label: correct[label] / counts[label] if counts[label] else None for label in CLASSES}
    wrong = covered - sum(correct.values())
    return {
        "correct": sum(correct.values()), "wrong": wrong, "abstained": len(eligible) - covered,
        "correct_by_class": correct, "recall_by_class": rates,
        "balanced_accuracy": sum(rates.values()) / 2 if all(counts.values()) else None,
        "mixed_or_unclear_predicted": sum(row["label"] not in CLASSES and
                                         row["predictions"][model] != "abstain" for row in rows),
    }


def score():
    values = features()
    labels, review_packet = packet()
    if labels != read("review-key.json") or review_packet != read("review-packet.json"):
        raise ValueError("Review inputs changed")
    judgments = read("review.json")
    if set(judgments) != set(labels) or any(
        row.get("label") not in LABELS or not row.get("reason", "").strip() for row in judgments.values()
    ):
        raise ValueError("Invalid blinded review")
    paired = {}
    for label, key in labels.items():
        signs = {axis: values[key][axis]["sign"] for axis in AXES}
        models = {axis: prediction(value) for axis, value in signs.items()}
        models["combined"] = prediction(sum(signs.values()))
        paired[key] = {"label": judgments[label]["label"], "signs": signs, "predictions": models}
    rows = list(paired.values())
    counts = Counter(row["label"] for row in rows)
    metrics = {model: tally(rows, model) for model in (*AXES, "combined")}
    adequacy = min(counts[label] for label in CLASSES) >= 4
    combined = metrics["combined"]
    comparison = {
        "combined_resolved_agency_abstention": sum(
            row["label"] in CLASSES and row["predictions"]["agency"] == "abstain"
            and row["predictions"]["combined"] == row["label"] for row in rows),
        "combined_changed_correct_agency": sum(
            row["label"] in CLASSES and row["predictions"]["agency"] == row["label"]
            and row["predictions"]["combined"] != row["label"] for row in rows),
    }
    return {
        "label_counts": counts, "metrics": metrics, "paired": paired,
        "minimum_class_size_met": adequacy,
        "criterion_met": adequacy and combined["balanced_accuracy"] >= 0.65
                         and min(combined["recall_by_class"].values()) > 0.5,
        "comparison_to_agency": comparison,
        "sha256": {name: sha(HERE / name) for name in (
            "frozen.json", "features.json", "review-packet.json", "review.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "show", "packet", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "sha256": fingerprints(), "rows": select()})
    elif action == "verify":
        print(Counter(row["domain"] for row in frozen()))
    elif action == "show":
        records = corpus()
        for row in frozen():
            print(json.dumps(records[row["id"]], ensure_ascii=False))
    elif action == "packet":
        features()
        key, rows = packet()
        write("review-key.json", key)
        write("review-packet.json", rows)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
