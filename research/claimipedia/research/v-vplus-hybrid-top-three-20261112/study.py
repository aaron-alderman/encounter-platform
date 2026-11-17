"""Fixed-budget hybrid retrieval on fresh queries against the frozen V/V+ index."""
import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "v-vplus-cross-domain-20261112"
sys.path.insert(0, str(PRIOR))
import retrieval as base

FILES = {
    **{f"prior_{name}": path for name, path in base.FILES.items()},
    **{f"prior_{name}": PRIOR / name for name in (
        "frozen.json", "candidate-frames.json", "candidate-frames.json.sha256")},
    **{name: HERE / name for name in ("study.py", "PREREGISTRATION.md")},
}
ARMS = ("search", "hybrid")
DOMAINS = base.DOMAINS[:2]
QUERY_COUNT = 8


def read(name):
    return json.loads((HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as file:
        json.dump(value, file, indent=2, ensure_ascii=False)
        file.write("\n")


def sha(path):
    return base.sha(path.read_bytes())


def rank(purpose, key):
    return base.sha(f"claimipedia-hybrid-top-three-v1|{purpose}|{key}".encode())


def select():
    rows = base.records()
    original = base.frozen()
    excluded = {row["id"] for part in original.values() for row in part} | base.EXAMPLES
    excluded |= {key for group in base.read("crystal")["groups"] for part in group["records"] for key in part}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {row["id"] for row in base.read("v3")["records"]}
    for k in ("causal", "advisory"):
        excluded |= {row["id"] for row in base.read(k)["rows"]}

    exact = defaultdict(set)
    for key, row in rows.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [rows.keys() & set(row["recordIds"]) for row in base.read("equivalence")["decisions"]
                if row["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in rows}
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[key] for key in group))
        for key in merged:
            components[key] = merged

    selected = []
    for domain in DOMAINS:
        eligible = [key for key, row in rows.items() if base.domain(row) == domain
                    and base.SCREEN.search(row["text"]) and len(base.WORD.findall(row["text"])) >= 12
                    and not row["text"].rstrip().endswith("?")]
        chosen = []
        for key in sorted(eligible, key=lambda item: rank("query", item)):
            if not components[key] & excluded:
                chosen.append({"id": key, "domain": domain})
                excluded |= components[key]
            if len(chosen) == QUERY_COUNT:
                break
        if len(chosen) != QUERY_COUNT:
            raise ValueError("Insufficient fresh queries")
        selected.extend(chosen)
    return {"queries": selected, "candidates": original["candidates"]}


def fingerprints():
    return {key: sha(path) for key, path in FILES.items()}


def frozen():
    data = read("frozen.json")
    if data["sha256"] != fingerprints() or data["split"] != select():
        raise ValueError("Frozen design or holdout changed")
    return data["split"]


def query_frames(queries):
    path = HERE / "query-frames.json"
    if sha(path) != (HERE / "query-frames.json.sha256").read_text().strip():
        raise ValueError("Query-frame hash mismatch")
    frames = read("query-frames.json")
    if set(frames) != {row["id"] for row in queries}:
        raise ValueError("Query-frame coverage mismatch")
    for values in frames.values():
        if len(values) > 2 or any(len(frame) != len(base.FIELDS)
                                  or any(v not in field for v, field in zip(frame, base.FIELDS))
                                  for frame in values):
            raise ValueError("Invalid query frame")
    return frames


def hybrid_score(query, candidate):
    return max((base.similarity(a, b) for a in query for b in candidate
                if a[1] == b[1] or a[4] == b[4]), default=0)


def build():
    split = frozen()
    rows = base.records()
    queries, candidates = split["queries"], split["candidates"]
    query_frame = query_frames(queries)
    candidate_frame = base.artifact("candidate-frames.json", [row["id"] for row in candidates])
    lexical = dict(base.lexical_scores(candidates, queries, rows))
    rankings, labels, packet = {}, {}, []
    for query in queries:
        q = query["id"]
        eligible = [row["id"] for row in candidates if row["domain"] != query["domain"]]

        def tie(c):
            return base.rank("tie", q + "|" + c)

        baseline = sorted(eligible, key=lambda c: (-lexical[q].get(c, 0), tie(c)))[:3]
        candidates_for_slot = [(c, hybrid_score(query_frame[q], candidate_frame[c]))
                               for c in eligible if c not in baseline[:2]]
        best, strength = min(candidates_for_slot, key=lambda pair: (-pair[1], tie(pair[0])))
        third = best if strength >= 5 else baseline[2]
        hybrid = [*baseline[:2], third]
        rankings[q] = {"search": baseline, "hybrid": hybrid, "structural_score": strength,
                       "changed": third != baseline[2]}
        for candidate in set(baseline + hybrid):
            label = rank("review", q + "|" + candidate)[:12]
            if label in labels:
                raise ValueError("Reviewer label collision")
            labels[label] = {"query": q, "candidate": candidate}
            packet.append({"id": label, "query": rows[q]["text"], "candidate": rows[candidate]["text"]})
    return {"rankings": rankings, "labels": labels}, sorted(packet, key=lambda p: rank("display", p["id"]))


def score():
    key, packet = build()
    if key != read("rankings.json") or packet != read("review-packet.json"):
        raise ValueError("Frozen review packet changed")
    judgments = read("review.json")
    if set(judgments) != set(key["labels"]) or any(
            type(row.get("grade")) is not int or not 0 <= row["grade"] <= 2
            or not row.get("reason", "").strip() for row in judgments.values()):
        raise ValueError("Missing or invalid reviewer judgments")
    grades = {(r["query"], r["candidate"]): judgments[label]["grade"]
              for label, r in key["labels"].items()}
    totals = {arm: Counter() for arm in ARMS}
    per_query = {}
    for q, row in key["rankings"].items():
        score = {arm: [grades[q, c] for c in row[arm]] for arm in ARMS}
        for arm, values in score.items():
            totals[arm].update({"relevant": values.count(2), "adjacent": values.count(1),
                                "irrelevant": values.count(0), "graded_sum": sum(values),
                                "covered": int(2 in values)})
        per_query[q] = {
            "grades": score, "net": score["hybrid"].count(2) - score["search"].count(2),
            "changed": row["changed"],
            "added": score["hybrid"][-1] if row["changed"] else None,
            "displaced": score["search"][-1] if row["changed"] else None,
        }
    wins = sum(row["net"] > 0 for row in per_query.values())
    losses = sum(row["net"] < 0 for row in per_query.values())
    return {
        "queries": len(per_query), "reviewed_pairs": len(judgments),
        "totals": totals, "per_query": per_query, "wins": wins, "losses": losses,
        "ties": len(per_query) - wins - losses,
        "changed": sum(row["changed"] for row in per_query.values()),
        "added_relevant": sum(row["added"] == 2 for row in per_query.values()),
        "displaced_relevant": sum(row["displaced"] == 2 for row in per_query.values()),
        "net_relevant": totals["hybrid"]["relevant"] - totals["search"]["relevant"],
        "hashes": {k: sha(HERE / k) for k in (
            "frozen.json", "query-frames.json", "rankings.json", "review-packet.json", "review.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "show", "build", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "sha256": fingerprints(), "split": select()})
    elif action == "verify":
        print({k: Counter(row["domain"] for row in v) for k, v in frozen().items()})
    elif action == "show":
        rows = base.records()
        for row in frozen()["queries"]:
            print(json.dumps({**row, "text": rows[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "build":
        key, packet = build()
        write("rankings.json", key)
        write("review-packet.json", packet)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
