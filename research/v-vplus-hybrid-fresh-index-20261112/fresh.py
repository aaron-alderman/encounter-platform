"""Replication of the current three-slot hybrid using fresh queries and index."""
import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
GATED = HERE.parent / "v-vplus-gated-top-three-20261112"
sys.path.insert(0, str(GATED))
import gate

prior = gate.previous
base = gate.base
DOMAINS = (*base.DOMAINS, "Science and research strategy")
ARMS = ("search", "hybrid")
FILES = {
    **{f"old:{k}": v for k, v in gate.FILES.items()},
    "gated_split": GATED / "frozen.json",
    "baseline_rankings": prior.HERE / "rankings.json",
    **{k: HERE / k for k in ("fresh.py", "PREREGISTRATION.md")},
}


def read(name):
    return json.loads((HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")


def sha(path):
    return base.sha(path.read_bytes())


def rank(purpose, item):
    return base.sha(f"claimipedia-hybrid-fresh-index-v1|{purpose}|{item}".encode())


def domain(row):
    if row["id"].startswith(("claim.strategy.", "claim.capabilityAtlas.")):
        return DOMAINS[-1]
    return base.domain(row)


def select():
    records = base.records()
    excluded = set(base.EXAMPLES)
    for sample in (base.frozen(), prior.frozen(), gate.frozen()):
        excluded |= {row["id"] for part in sample.values() for row in part}
    excluded |= {key for group in base.read("crystal")["groups"] for part in group["records"] for key in part}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {row["id"] for row in base.read("v3")["records"]}
    for k in ("causal", "advisory"):
        excluded |= {row["id"] for row in base.read(k)["rows"]}

    exact = defaultdict(set)
    for key, record in records.items():
        exact[" ".join(record["text"].casefold().split())].add(key)
    reviewed = [records.keys() & set(row["recordIds"]) for row in base.read("equivalence")["decisions"]
                if row["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in records}
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[key] for key in group))
        for key in merged:
            components[key] = merged

    result = {"queries": [], "candidates": []}
    for name in DOMAINS:
        eligible = [key for key, row in records.items() if domain(row) == name
                    and len(base.WORD.findall(row["text"])) >= 12 and not row["text"].rstrip().endswith("?")]
        for partition, count in (("queries", 4), ("candidates", 6)):
            chosen = []
            for key in sorted(eligible, key=lambda key: rank(partition, key)):
                if not components[key] & excluded:
                    chosen.append({"id": key, "domain": name})
                    excluded |= components[key]
                    if len(chosen) == count:
                        break
            if len(chosen) != count:
                raise ValueError(f"Insufficient fresh {partition} in {name}: {len(chosen)}")
            result[partition].extend(chosen)
    return result


def fingerprints():
    return {k: sha(p) for k, p in FILES.items()}


def frozen():
    data = read("frozen.json")
    if data["sha256"] != fingerprints() or data["split"] != select():
        raise ValueError("Frozen design or sample changed")
    return data["split"]


def frames(partition, rows):
    name = f"{partition}-frames.json"
    if (HERE / (name + ".sha256")).read_text().strip() != sha(HERE / name):
        raise ValueError("Frame hash mismatch")
    obj = read(name)
    if set(obj) != {row["id"] for row in rows} or any(
        not isinstance(values, list) or len(values) > 2 or any(
            len(frame) != len(base.FIELDS) or any(v not in field for v, field in zip(frame, base.FIELDS))
            for frame in values) for values in obj.values()
    ):
        raise ValueError("Invalid frame coverage or shape")
    return obj


def rankings(split, qframes, cframes):
    queries, candidates = split["queries"], split["candidates"]
    lexical = dict(base.lexical_scores(candidates, queries, base.records()))
    result = {}
    for query in queries:
        q = query["id"]
        eligible = [row["id"] for row in candidates if row["domain"] != query["domain"]]

        def tie(c):
            return base.rank("tie", q + "|" + c)

        search = sorted(eligible, key=lambda c: (-lexical[q].get(c, 0), tie(c)))[:3]
        options = [(c, prior.hybrid_score(qframes[q], cframes[c]))
                   for c in eligible if c not in search[:2]]
        best, strength = min(options, key=lambda pair: (-pair[1], tie(pair[0])))
        hybrid = [*search[:2], best] if strength >= 5 else search
        result[q] = {"search": search, "hybrid": hybrid,
                     "structural_score": strength, "changed": hybrid != search}
    return result


def audit_method():
    earlier = prior.frozen()
    cframes = base.artifact("candidate-frames.json", [row["id"] for row in earlier["candidates"]])
    observed = rankings(earlier, prior.query_frames(earlier["queries"]), cframes)
    if observed != prior.read("rankings.json")["rankings"]:
        raise ValueError("Baseline replication disagrees with archived rankings")


def build():
    audit_method()
    split = frozen()
    records = base.records()
    ranked = rankings(split, frames("query", split["queries"]), frames("candidate", split["candidates"]))
    labels, packet = {}, []
    for q, arms in ranked.items():
        for c in set(arms["search"] + arms["hybrid"]):
            opaque = rank("review", q + "|" + c)[:12]
            if opaque in labels:
                raise ValueError("Reviewer label collision")
            labels[opaque] = {"query": q, "candidate": c}
            packet.append({"id": opaque, "query": records[q]["text"], "candidate": records[c]["text"]})
    return {"rankings": ranked, "labels": labels}, sorted(packet, key=lambda row: rank("display", row["id"]))


def score():
    key, packet = build()
    if key != read("rankings.json") or packet != read("review-packet.json"):
        raise ValueError("Rankings or reviewer packet changed")
    judgments = read("review.json")
    if set(judgments) != set(key["labels"]) or any(
        type(row.get("grade")) is not int or not 0 <= row["grade"] <= 2 or not row.get("reason", "").strip()
        for row in judgments.values()
    ):
        raise ValueError("Invalid reviewer judgments")
    grades = {(p["query"], p["candidate"]): judgments[label]["grade"] for label, p in key["labels"].items()}
    totals, paired = {arm: Counter() for arm in ARMS}, {}
    for q, row in key["rankings"].items():
        values = {arm: [grades[q, c] for c in row[arm]] for arm in ARMS}
        for arm, v in values.items():
            totals[arm].update(relevant=v.count(2), adjacent=v.count(1), irrelevant=v.count(0),
                               covered=int(2 in v), graded_sum=sum(v))
        paired[q] = {"grades": values, "net": values["hybrid"].count(2) - values["search"].count(2),
                     "changed": row["changed"], "structural_score": row["structural_score"]}
    changed = [row for row in paired.values() if row["changed"]]
    return {
        "queries": len(paired), "reviewed_pairs": len(judgments), "totals": totals,
        "wins": sum(row["net"] > 0 for row in paired.values()),
        "losses": sum(row["net"] < 0 for row in paired.values()),
        "ties": sum(row["net"] == 0 for row in paired.values()),
        "net_relevant": totals["hybrid"]["relevant"] - totals["search"]["relevant"],
        "changed": len(changed),
        "relevant_added": sum(row["grades"]["hybrid"][-1] == 2 for row in changed),
        "relevant_displaced": sum(row["grades"]["search"][-1] == 2 for row in changed),
        "below_threshold": sum(row["structural_score"] < 5 for row in paired.values()),
        "per_query": paired,
        "sha256": {name: sha(HERE / name) for name in (
            "frozen.json", "query-frames.json", "candidate-frames.json", "rankings.json",
            "review-packet.json", "review.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "candidates", "queries", "build", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        audit_method()
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "sha256": fingerprints(), "split": select()})
    elif action == "verify":
        print({k: Counter(row["domain"] for row in rows) for k, rows in frozen().items()})
    elif action in ("candidates", "queries"):
        split = frozen()
        if action == "queries":
            frames("candidate", split["candidates"])
        records = base.records()
        for row in split[action]:
            print(json.dumps({**row, "text": records[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "build":
        key, packet = build()
        write("rankings.json", key)
        write("review-packet.json", packet)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
