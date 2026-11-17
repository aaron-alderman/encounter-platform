"""Held-out test of a lexical safeguard for the V/V+ third slot."""
import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "v-vplus-hybrid-top-three-20261112"
sys.path.insert(0, str(PRIOR))
import study as previous

base = previous.base
ARMS = ("search", "hybrid", "gated")
FILES = {
    **{f"prior:{k}": v for k, v in previous.FILES.items()},
    **{f"development:{name}": PRIOR / name for name in (
        "frozen.json", "query-frames.json", "query-frames.json.sha256",
        "rankings.json", "review.json", "results.json")},
    **{name: HERE / name for name in ("gate.py", "PREREGISTRATION.md", "development.json")},
}


def read(name):
    return json.loads((HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")


def sha(path):
    return base.sha(path.read_bytes())


def rank(purpose, value):
    return base.sha(f"claimipedia-gated-top-three-v1|{purpose}|{value}".encode())


def select():
    corpus = base.records()
    index = base.frozen()
    earlier = previous.frozen()
    excluded = base.EXAMPLES | {r["id"] for p in index.values() for r in p}
    excluded |= {r["id"] for r in earlier["queries"]}
    excluded |= {key for g in base.read("crystal")["groups"] for p in g["records"] for key in p}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {r["id"] for r in base.read("v3")["records"]}
    for k in ("causal", "advisory"):
        excluded |= {r["id"] for r in base.read(k)["rows"]}

    exact = defaultdict(set)
    for key, row in corpus.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [corpus.keys() & set(item["recordIds"]) for item in base.read("equivalence")["decisions"]
                if item["decision"] == "confirm-equivalence"]
    components = {k: {k} for k in corpus}
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[k] for k in group))
        for k in merged:
            components[k] = merged

    queries = []
    for domain in previous.DOMAINS:
        eligible = sorted(
            (k for k, r in corpus.items() if base.domain(r) == domain and base.SCREEN.search(r["text"])
             and len(base.WORD.findall(r["text"])) >= 12 and not r["text"].rstrip().endswith("?")),
            key=lambda k: rank("query", k),
        )
        chosen = []
        for k in eligible:
            if not components[k] & excluded:
                chosen.append({"id": k, "domain": domain})
                excluded |= components[k]
                if len(chosen) == 6:
                    break
        if len(chosen) != 6:
            raise ValueError(f"Insufficient fresh queries for {domain}: {len(chosen)}")
        queries.extend(chosen)
    return {"queries": queries, "candidates": index["candidates"]}


def fingerprints():
    return {key: sha(path) for key, path in FILES.items()}


def frozen():
    doc = read("frozen.json")
    if doc["hashes"] != fingerprints() or doc["split"] != select():
        raise ValueError("Frozen method or split changed")
    return doc["split"]


def allow(lexical_top):
    first, second, third = lexical_top
    return third == 0 or third < 0.88 * second or third < 0.50 * first


def rank_lists(split, qframes):
    corpus = base.records()
    queries, candidates = split["queries"], split["candidates"]
    cframes = base.artifact("candidate-frames.json", [c["id"] for c in candidates])
    lexical = dict(base.lexical_scores(candidates, queries, corpus))
    result = {}
    for query in queries:
        q = query["id"]
        eligible = [c["id"] for c in candidates if c["domain"] != query["domain"]]

        def tie(c):
            return base.rank("tie", q + "|" + c)

        def bm25(c):
            return lexical[q].get(c, 0)

        ordinary = sorted(eligible, key=lambda c: (-bm25(c), tie(c)))[:3]
        options = [(c, previous.hybrid_score(qframes[q], cframes[c]))
                   for c in eligible if c not in ordinary[:2]]
        best, structural = min(options, key=lambda pair: (-pair[1], tie(pair[0])))
        hybrid = [*ordinary[:2], best] if structural >= 5 else ordinary
        values = [bm25(c) for c in ordinary]
        admitted = allow(values)
        result[q] = {
            "search": ordinary, "hybrid": hybrid, "gated": hybrid if admitted else ordinary,
            "lexical_top": values, "gate_open": admitted, "structural_score": structural,
        }
    return result


def development():
    split = previous.frozen()
    frames = previous.query_frames(split["queries"])
    result = rank_lists(split, frames)
    archived = previous.read("rankings.json")["rankings"]
    judgments = previous.read("results.json")["per_query"]
    rows = {}
    for key, ranked in result.items():
        if any(ranked[m] != archived[key][m] for m in ("search", "hybrid")):
            raise ValueError("Current method replay mismatch")
        rows[key] = {"lexical_top": ranked["lexical_top"], "gate_open": ranked["gate_open"],
                     "hybrid_changed": ranked["hybrid"] != ranked["search"],
                     "hybrid_net": judgments[key]["net"],
                     "gated_net": judgments[key]["net"] if ranked["gate_open"] else 0}
    return rows


def query_frames(queries):
    name = "query-frames.json"
    if sha(HERE / name) != (HERE / (name + ".sha256")).read_text().strip():
        raise ValueError("Unfrozen query frames")
    frames = read(name)
    if set(frames) != {r["id"] for r in queries} or any(
        not isinstance(values, list) or len(values) > 2 or any(
            len(v) != len(base.FIELDS) or any(x not in allowed for x, allowed in zip(v, base.FIELDS))
            for v in values)
        for values in frames.values()
    ):
        raise ValueError("Invalid query frames")
    return frames


def build():
    split = frozen()
    rankings = rank_lists(split, query_frames(split["queries"]))
    corpus = base.records()
    labels, packet = {}, []
    for q, ranked in rankings.items():
        for c in set().union(*(ranked[arm] for arm in ARMS)):
            label = rank("review", q + "|" + c)[:12]
            if label in labels:
                raise ValueError("Reviewer label collision")
            labels[label] = {"query": q, "candidate": c}
            packet.append({"id": label, "query": corpus[q]["text"], "candidate": corpus[c]["text"]})
    return {"rankings": rankings, "labels": labels}, sorted(packet, key=lambda r: rank("display", r["id"]))


def score():
    key, packet = build()
    if key != read("rankings.json") or packet != read("review-packet.json"):
        raise ValueError("Review packet or ranking changed")
    judgments = read("review.json")
    if set(judgments) != set(key["labels"]) or any(
        type(row.get("grade")) is not int or not 0 <= row["grade"] <= 2
        or not row.get("reason", "").strip() for row in judgments.values()
    ):
        raise ValueError("Invalid reviewer judgments")
    grades = {(r["query"], r["candidate"]): judgments[label]["grade"]
              for label, r in key["labels"].items()}
    per_query = {}
    totals = {arm: Counter() for arm in ARMS}
    for q, ranked in key["rankings"].items():
        row = {arm: [grades[q, c] for c in ranked[arm]] for arm in ARMS}
        for arm, values in row.items():
            totals[arm].update(relevant=values.count(2), adjacent=values.count(1),
                               irrelevant=values.count(0), graded_sum=sum(values),
                               covered=int(2 in values))
        per_query[q] = {
            "grades": row, "gate_open": ranked["gate_open"],
            "hybrid_changed": ranked["hybrid"] != ranked["search"],
            "gated_changed": ranked["gated"] != ranked["search"],
            "net_gated_search": row["gated"].count(2) - row["search"].count(2),
            "net_gated_hybrid": row["gated"].count(2) - row["hybrid"].count(2),
            "net_hybrid_search": row["hybrid"].count(2) - row["search"].count(2),
        }
    contrasts = {}
    for label in ("gated_search", "gated_hybrid", "hybrid_search"):
        scores = [r["net_" + label] for r in per_query.values()]
        contrasts[label] = {
            "net_relevant": sum(scores), "wins": sum(x > 0 for x in scores),
            "losses": sum(x < 0 for x in scores), "ties": scores.count(0),
        }
    switches = {}
    for arm in ("hybrid", "gated"):
        changed = [r for r in per_query.values() if r[arm + "_changed"]]
        switches[arm] = {
            "changed": len(changed),
            "relevant_added": sum(r["grades"][arm][-1] == 2 for r in changed),
            "relevant_displaced": sum(r["grades"]["search"][-1] == 2 for r in changed),
        }
    return {
        "queries": len(per_query), "reviewed_pairs": len(judgments), "totals": totals,
        "contrasts": contrasts, "switches": switches, "per_query": per_query,
        "gate_vetoed_switches": switches["hybrid"]["changed"] - switches["gated"]["changed"],
        "hashes": {name: sha(HERE / name) for name in (
            "frozen.json", "query-frames.json", "rankings.json", "review-packet.json", "review.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("develop", "freeze", "verify", "show", "build", "score"))
    action = parser.parse_args().action
    if action == "develop":
        write("development.json", development())
    elif action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "hashes": fingerprints(), "split": select()})
    elif action == "verify":
        print({k: Counter(r["domain"] for r in v) for k, v in frozen().items()})
    elif action == "show":
        corpus = base.records()
        for row in frozen()["queries"]:
            print(json.dumps({**row, "text": corpus[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "build":
        key, packet = build()
        write("rankings.json", key)
        write("review-packet.json", packet)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
