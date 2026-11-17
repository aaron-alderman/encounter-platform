"""Frozen cross-domain retrieval benchmark and pooled review packet."""
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
DOCS = HERE.parents[1] / "sourcery-applications/applications/claimipedia/docs"
PRIOR = {
    "crystal": "semantic-crystallization-20261111/frozen-split.json",
    "v1": "v-vplus-reconstruction-20261111/frozen-holdout.json",
    "v2": "v-vplus-scoped-codec-20261111/frozen-holdout.json",
    "v3": "v-vplus-grounded-codec-20261112/frozen-holdout.json",
    "causal": "v-vplus-causal-check-20261112/frozen-holdout.json",
    "advisory": "v-vplus-advisory-cues-20261112/frozen-holdout.json",
}
FILES = {
    **{k: RESEARCH / v for k, v in PRIOR.items()},
    "map": DOCS / "identity-claims-map.json",
    "equivalence": DOCS / "identity-proposition-equivalence-ledger.json",
    **{k: HERE / k for k in ("retrieval.py", "PREREGISTRATION.md", "REVIEW-RUBRIC.md")},
}
EXAMPLES = {
    "claim.aiFutures.agency-preserving-assistance",
    "claim.contribution.9d5dfcc314cbf82a340a7f773bd5baee",
    "claim.contribution.c3e716044f2be48324fe900f17d01729",
    "claim.contribution.d85d33c73dd081d79488b76c137fb194",
}
TOP = 3
DOMAINS = ("AI and society", "Christian ethics and theology", "Institutional design")
SCREEN = re.compile(r"\b(?:agenc\w*|authorit\w*|delegat\w*|choic\w*|choos\w*|cost\w*|"
                    r"responsib\w*|consent|participat\w*|control\w*|accountab\w*|"
                    r"coerci\w*|decision\w*|boundar\w*|discretion)\b", re.I)
THEOLOGY = re.compile(r"radical kenosis|biblical|trinitar|catholic|christian", re.I)
WORD = re.compile(r"[^\W_]+", re.UNICODE)
STOP = set("""a an and are as at be been being but by can could did do does for from had has have
he her hers him his how i if in into is it its may me might must no nor not of on one only or
our ours she should so than that the their them then there these they this those through to too
up us was we were what when where which who will with would you your""".split())
# Each frame is V(role, interest, direction), V+(relation), and the directed coupling.
FIELDS = (
    set("actor other institution collective".split()),
    set("agency burden standing judgment trust knowledge participation safety continuity benefit accountability".split()),
    set("gain loss retain allocate condition".split()),
    set("delegation authority representation cooperation accountability participation cost-bearing formation correction boundary dependency coercion exchange care evidence".split()),
    set("enables undermines preserves limits shifts requires substitutes distinguishes contrasts".split()),
)
WEIGHTS = (1, 3, 1, 2, 3)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rank(salt, item):
    return sha(f"claimipedia-vv-cross-domain-v1|{salt}|{item}".encode())


def read(name):
    return json.loads(FILES.get(name, HERE / name).read_bytes())


def write(name, obj):
    with (HERE / name).open("x") as out:
        json.dump(obj, out, indent=2, ensure_ascii=False)
        out.write("\n")


def records():
    source = read("map")
    return {row["id"]: row for k in ("reviewedExcludedClaims", "claims") for row in source[k]}


def domain(row):
    key = row["id"]
    if key.startswith(("claim.aiInquiry.", "claim.aiFutures.")):
        return DOMAINS[0]
    if key.startswith("claim.contribution.") and THEOLOGY.search(row.get("scope", "")):
        return DOMAINS[1]
    if key.startswith("claim.claimipedia.kingdom.relationalInstitution."):
        return DOMAINS[2]
    return None


def select():
    rows = records()
    exact = defaultdict(set)
    for key, row in rows.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    groups = [rows.keys() & set(row["recordIds"]) for row in read("equivalence")["decisions"]
              if row["decision"] == "confirm-equivalence"]
    connected = {key: {key} for key in rows}
    for group in [*exact.values(), *groups]:
        union = set().union(*(connected[key] for key in group))
        for key in union:
            connected[key] = union
    banned = set(EXAMPLES)
    banned |= {key for g in read("crystal")["groups"] for part in g["records"] for key in part}
    banned |= set(read("v1")["recordIds"]) | set(read("v2")["ids"])
    banned |= {row["id"] for row in read("v3")["records"]}
    for prior in ("causal", "advisory"):
        banned |= {row["id"] for row in read(prior)["rows"]}
    result = {"queries": [], "candidates": []}
    for name in DOMAINS:
        eligible = [key for key, row in rows.items() if domain(row) == name
                    and SCREEN.search(row["text"]) and len(WORD.findall(row["text"])) >= 12
                    and not row["text"].rstrip().endswith("?")]
        for partition, count in (("queries", 3), ("candidates", 10)):
            chosen = []
            for key in sorted(eligible, key=lambda key: rank(partition, key)):
                if not connected[key] & banned:
                    chosen.append({"id": key, "domain": name})
                    banned |= connected[key]
                    if len(chosen) == count:
                        break
            if len(chosen) != count:
                raise ValueError(f"Insufficient {partition} for {name}: {len(chosen)}")
            result[partition].extend(chosen)
    return result


def hashes():
    return {key: sha(path.read_bytes()) for key, path in FILES.items()}


def frozen():
    data = read("frozen.json")
    if data["hashes"] != hashes() or data["split"] != select():
        raise ValueError("Frozen method or sample changed")
    return data["split"]


def artifact(name, keys):
    obj = read(name)
    if ((HERE / (name + ".sha256")).read_text().strip() != sha((HERE / name).read_bytes())
            or set(obj) != set(keys)):
        raise ValueError(f"Unfrozen or incomplete {name}")
    for frames in obj.values():
        if (not isinstance(frames, list) or len(frames) > 2
                or any(len(f) != len(FIELDS) or any(v not in field for v, field in zip(f, FIELDS))
                       for f in frames)):
            raise ValueError(f"Invalid frames in {name}")
    return obj


def similarity(left, right):
    matches = [a == b for a, b in zip(left, right, strict=True)]
    return sum(w for w, match in zip(WEIGHTS, matches) if match) + 2 * (matches[1] and matches[4])


def lexical_scores(candidates, queries, rows):
    with sqlite3.connect(":memory:") as db:
        db.execute("CREATE VIRTUAL TABLE claims USING fts5(id UNINDEXED, text, tokenize='porter unicode61')")
        db.executemany("INSERT INTO claims VALUES (?, ?)", [(c["id"], rows[c["id"]]["text"]) for c in candidates])
        for query in queries:
            key = query["id"]
            words = sorted(set(WORD.findall(rows[key]["text"].casefold())) - STOP)
            expression = " OR ".join(f'"{term}"' for term in words)
            scores = (dict(db.execute("SELECT id, -bm25(claims) FROM claims WHERE claims MATCH ?", (expression,)))
                      if words else {})
            yield key, scores


def build():
    split, rows = frozen(), records()
    candidates, queries = split["candidates"], split["queries"]
    cframes = artifact("candidate-frames.json", [row["id"] for row in candidates])
    qframes = artifact("query-frames.json", [row["id"] for row in queries])
    lexical = dict(lexical_scores(candidates, queries, rows))
    rankings, labels, packet = {}, {}, []
    for query in queries:
        key, name = query["id"], query["domain"]
        eligible = [c["id"] for c in candidates if c["domain"] != name]
        scores = {
            "search": {c: lexical[key].get(c, 0) for c in eligible},
            "vv": {c: max((similarity(x, y) for x in qframes[key] for y in cframes[c]), default=0)
                   for c in eligible},
        }
        rankings[key] = {
            method: [{"id": c, "score": values[c]} for c in
                     sorted(eligible, key=lambda c: (-values[c], rank("tie", key + "|" + c)))[:TOP]]
            for method, values in scores.items()
        }
        pooled = {row["id"] for arm in rankings[key].values() for row in arm}
        for c in pooled:
            label = rank("review", key + "|" + c)[:12]
            if label in labels:
                raise ValueError("Reviewer label collision")
            labels[label] = {"query": key, "candidate": c}
            packet.append({"id": label, "query": rows[key]["text"], "candidate": rows[c]["text"]})
    return {"rankings": rankings, "labels": labels}, sorted(packet, key=lambda row: rank("display", row["id"]))


def score():
    key, packet = build()
    if key != read("rankings.json") or packet != read("review-packet.json"):
        raise ValueError("Pooled inputs changed")
    judgments = read("review.json")
    if set(judgments) != set(key["labels"]) or any(
            type(x.get("grade")) is not int or not 0 <= x["grade"] <= 2 or not x.get("reason", "").strip()
            for x in judgments.values()):
        raise ValueError("Invalid reviewer coverage")
    pair_grades = {(pair["query"], pair["candidate"]): judgments[label]["grade"]
                   for label, pair in key["labels"].items()}
    per_query = {}
    for q, methods in key["rankings"].items():
        relevant = {}
        for method, ranked in methods.items():
            relevant[method] = {row["id"] for row in ranked if pair_grades[q, row["id"]] == 2}
        per_query[q] = {
            "vv_relevant": sorted(relevant["vv"]),
            "search_relevant": sorted(relevant["search"]),
            "vv_only": sorted(relevant["vv"] - relevant["search"]),
            "search_only": sorted(relevant["search"] - relevant["vv"]),
        }
    counts = {metric: sum(len(r[metric]) for r in per_query.values())
              for metric in ("vv_relevant", "search_relevant", "vv_only", "search_only")}
    for method in ("vv", "search"):
        counts[f"{method}_coverage"] = sum(bool(row[f"{method}_relevant"]) for row in per_query.values())
        counts[f"{method}_unique_queries"] = sum(bool(row[f"{method}_only"]) for row in per_query.values())
    return {"reviewed_pairs": len(judgments), "review_grades": Counter(r["grade"] for r in judgments.values()),
            "counts": counts, "per_query": per_query,
            "hashes": {name: sha((HERE / name).read_bytes()) for name in
                       ("frozen.json", "candidate-frames.json", "query-frames.json", "rankings.json",
                        "review-packet.json", "review.json")}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "candidates", "queries", "build", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "hashes": hashes(), "split": select()})
    elif action == "verify":
        print({k: Counter(row["domain"] for row in v) for k, v in frozen().items()})
    elif action in {"queries", "candidates"}:
        split = frozen()
        if action == "queries":
            artifact("candidate-frames.json", [row["id"] for row in split["candidates"]])
        rows = records()
        for row in split[action]:
            print(json.dumps({**row, "text": rows[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "build":
        key, packet = build()
        write("rankings.json", key)
        write("review-packet.json", packet)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
