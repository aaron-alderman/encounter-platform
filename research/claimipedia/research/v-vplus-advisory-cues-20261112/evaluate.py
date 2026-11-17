"""Freeze the holdout and compare unchecked, hard, and advisory causal links."""

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import advisory
from causal import check as hard
from study import CHAIN, CONTROL, EFFECT, EXAMPLES, FILES as PREVIOUS, corpus as main_corpus, sha, stress

HERE = Path(__file__).resolve().parent
APP = PREVIOUS["map"].parents[1]
FILES = {
    **{key: path for key, path in PREVIOUS.items() if key not in ("study.py", "PREREGISTRATION.md")},
    "prior_causal_holdout": advisory.PRIOR / "frozen-holdout.json",
    "prior_runner": advisory.PRIOR / "study.py",
    "evidence": APP / "research/third-order-influence-v0.5/evidence-corpus.json",
    "intake": APP / "research-inbox-nv-spin-force-data.json",
    **{name: HERE / name for name in ("advisory.py", "evaluate.py", "PREREGISTRATION.md")},
}
ARMS = ("unchecked", "hard", "advisory")
POSITIVE = ("evidence.paluck-shepherd-aronow-2016", "intake.RIO-041")


def read(key):
    return json.loads(FILES.get(key, HERE / key).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, indent=2, ensure_ascii=False)
        out.write("\n")


def fingerprints():
    return {name: sha(path.read_bytes()) for name, path in FILES.items()}


def corpus():
    records = main_corpus()
    evidence = read("evidence")
    for row in evidence["records"]:
        key = "evidence." + row["id"]
        if key == POSITIVE[0]:
            records[key] = {"id": key, "version": evidence["snapshotDate"], "text": row["finding"],
                            "source": "evidence-corpus finding"}
    intake = read("intake")
    key = "intake." + intake["id"]
    if key != POSITIVE[1]:
        raise ValueError("Unexpected research-intake record")
    records[key] = {"id": key, "version": intake["createdAt"], "text": intake["whyItMayMatter"],
                    "source": "research-inbox interpretation"}
    return records


def select():
    rows = corpus()
    exact = defaultdict(set)
    for key, row in rows.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [rows.keys() & set(decision["recordIds"])
                for decision in read("equivalence")["decisions"]
                if decision["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in rows}
    for group in [*exact.values(), *reviewed]:
        joined = set().union(*(components[key] for key in group))
        for key in joined:
            components[key] = joined
    excluded = EXAMPLES | set(read("v1")["recordIds"]) | set(read("v2")["ids"])
    excluded |= {row["id"] for row in read("v3")["records"]}
    excluded |= {row["id"] for row in read("prior_causal_holdout")["rows"]}
    excluded |= {key for group in read("crystal")["groups"] for cluster in group["records"] for key in cluster}
    chosen = []
    for key in POSITIVE:
        if components[key] & excluded:
            raise ValueError("Positive record overlaps an exclusion")
        chosen.append({"id": key, "stratum": "effect-strength"})
        excluded |= components[key]
    ordered = sorted(rows, key=lambda key: sha(("claimipedia-advisory-v1|" + key).encode()))
    for stratum, size, pattern in (("chain-cue", 6, CHAIN), ("control-cue", 3, CONTROL)):
        eligible = []
        for key in ordered:
            text = rows[key]["text"]
            if (components[key] & excluded or not pattern.search(text)
                    or stratum == "control-cue" and (CHAIN.search(text) or EFFECT.search(text))):
                continue
            eligible.append({"id": key, "stratum": stratum})
            excluded |= components[key]
            if len(eligible) == size:
                break
        if len(eligible) != size:
            raise ValueError("Insufficient claims for the frozen stratum")
        chosen.extend(eligible)
    return chosen


def frozen():
    data = read("frozen-holdout.json")
    if data["sha256"] != fingerprints() or data["rows"] != select():
        raise ValueError("Frozen inputs or sample changed")
    return data["rows"]


def read_frozen(name, ids):
    path = HERE / name
    if sha(path.read_bytes()) != (HERE / (name + ".sha256")).read_text().strip():
        raise ValueError(f"Changed artifact: {name}")
    value = read(name)
    if set(value) != set(ids):
        raise ValueError(f"Incomplete artifact: {name}")
    return value


def compare(record, nodes, gold, proposed, witnesses):
    hard_decisions = hard(record, nodes, proposed, witnesses)
    advisory_decisions = advisory.check(record, nodes, proposed, witnesses)
    for h, a in zip(hard_decisions, advisory_decisions, strict=True):
        if h["accepted"] != (a["accepted"] and bool(a["cue_matched"])):
            raise ValueError("Hard and advisory differ on more than cue enforcement")
    accepted = {
        "unchecked": set(map(tuple, proposed)),
        "hard": {tuple(d["link"]) for d in hard_decisions if d["accepted"]},
        "advisory": {tuple(d["link"]) for d in advisory_decisions if d["accepted"]},
    }
    return {
        "scores": {arm: {
            "supported": len(links & gold),
            "unsupported": len(links - gold),
            "omitted": len(gold - links),
            "unsupported_records": int(bool(links - gold)),
            "supported_strength": sum(link[0] == "strength" for link in links & gold),
        } for arm, links in accepted.items()},
        "hard": hard_decisions, "advisory": advisory_decisions,
    }


def tally(rows):
    totals = {arm: Counter() for arm in ARMS}
    for row in rows:
        for arm in ARMS:
            totals[arm].update(row["scores"][arm])
    return totals


def evaluate():
    rows = frozen()
    ids = [row["id"] for row in rows]
    records = corpus()
    refs, proposals, annotations = (read_frozen(name, ids) for name in
                                     ("reference.json", "proposals.json", "witnesses.json"))
    ordinary, challenge, witness_error = {}, [], []
    for row in rows:
        key = row["id"]
        record, ref, witness = records[key], refs[key], annotations[key]
        nodes = ref["nodes"]
        gold = {advisory.signature(link, nodes) for link in ref["gold"]}
        ordinary[key] = {"stratum": row["stratum"],
                         **compare(record, nodes, gold, proposals[key], witness)}
        for case in stress(gold, nodes):
            supported = case["supported"]
            decoy = case["confusion"]
            expected = set(map(tuple, supported))
            inputs = [*supported, decoy]
            challenge.append({"id": key, **case, **compare(record, nodes, expected, inputs, witness)})
            # Fault injection is limited to swapped types. Keep it separate from ordinary scoring.
            if supported:
                text = record["text"]
                corrupted = {**witness, "witnesses": [*witness["witnesses"],
                             {"link": decoy, "span": {"start": 0, "end": len(text), "quote": text}}]}
                witness_error.append({"id": key, **case,
                                      **compare(record, nodes, expected, inputs, corrupted)})
    strength = [row for row in ordinary.values() if row["stratum"] == "effect-strength"]
    return {
        "ordinary": ordinary, "ordinary_totals": tally(ordinary.values()),
        "effect_strength_stratum": tally(strength),
        "challenge": challenge, "challenge_totals": tally(challenge),
        "corrupted_witness_challenge": witness_error, "corrupted_witness_totals": tally(witness_error),
        "frozen_inputs": {name: sha((HERE / name).read_bytes()) for name in
                          ("frozen-holdout.json", "reference.json", "proposals.json", "witnesses.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "show", "verify", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen-holdout.json", {"utc": datetime.now(timezone.utc).isoformat(),
                                     "sha256": fingerprints(), "rows": select()})
    elif action == "verify":
        print(Counter(row["stratum"] for row in frozen()))
    elif action == "show":
        records = corpus()
        for row in frozen():
            print(json.dumps({**row, "text": records[row["id"]]["text"]}, ensure_ascii=False))
    else:
        write("results.json", evaluate())


if __name__ == "__main__":
    main()
