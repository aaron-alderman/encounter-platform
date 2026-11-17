"""Frozen Claimipedia selection and paired causal-link evaluation."""

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from causal import STRENGTH, check, signature, span

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
DOCS = HERE.parents[1] / "sourcery-applications/applications/claimipedia/docs"
FILES = {
    "map": DOCS / "identity-claims-map.json",
    "equivalence": DOCS / "identity-proposition-equivalence-ledger.json",
    "crystal": RESEARCH / "semantic-crystallization-20261111/frozen-split.json",
    "v1": RESEARCH / "v-vplus-reconstruction-20261111/frozen-holdout.json",
    "v2": RESEARCH / "v-vplus-scoped-codec-20261111/frozen-holdout.json",
    "v3": RESEARCH / "v-vplus-grounded-codec-20261112/frozen-holdout.json",
    **{name: HERE / name for name in ("PREREGISTRATION.md", "causal.py", "study.py")},
}
CHAIN = re.compile(r"\b(?:thereby|which (?:in turn|can|then)|in turn|making|resulting in|"
                   r"leading to|by (?:enabling|reducing|increasing|shifting|preserving|"
                   r"removing|creating|making)|so that)\b", re.I)
EFFECT = re.compile(r"\b(?:(?:effect|impact|influence) (?:of|on|depends|varies)|"
                    r"stronger|weaker|amplif\w*|attenuat\w*|magnif\w*|moderat\w*|"
                    r"more likely|less likely)\b", re.I)
CONTROL = re.compile(r"\b(?:distinguish\w*|rather than|does not entail|should remain|is defined)\b", re.I)
EXAMPLES = {
    "claim.aiFutures.agency-preserving-assistance",
    "claim.contribution.9d5dfcc314cbf82a340a7f773bd5baee",
    "claim.contribution.c3e716044f2be48324fe900f17d01729",
    "claim.contribution.d85d33c73dd081d79488b76c137fb194",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(name):
    return json.loads(FILES.get(name, HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, indent=2, ensure_ascii=False)
        out.write("\n")


def corpus():
    data = read("map")
    return {r["id"]: {**r, "version": r.get("version") or "map-snapshot",
                      "identity_mapped": field == "claims"}
            for field in ("reviewedExcludedClaims", "claims") for r in data[field]}


def fingerprints():
    return {key: sha(path.read_bytes()) for key, path in FILES.items()}


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
    excluded |= {key for group in read("crystal")["groups"] for cluster in group["records"] for key in cluster}
    ordered = sorted(rows, key=lambda key: sha(("claimipedia-causal-check-v1|" + key).encode()))
    chosen = []
    for name, pattern, maximum in (
            ("effect-cue", EFFECT, 6), ("chain-cue", CHAIN, 6), ("control-cue", CONTROL, 3)):
        count = 0
        for key in ordered:
            text = rows[key]["text"]
            if (not components[key] & excluded and pattern.search(text)
                    and (name != "control-cue" or not (CHAIN.search(text) or EFFECT.search(text)))):
                chosen.append({"id": key, "stratum": name, "identity_mapped": rows[key]["identity_mapped"]})
                excluded.update(components[key])
                count += 1
                if count == maximum:
                    break
    return chosen


def frozen():
    doc = read("frozen-holdout.json")
    if doc["sha256"] != fingerprints() or doc["rows"] != select():
        raise ValueError("Frozen inputs or selection changed")
    return doc["rows"]


def frozen_input(name):
    path = HERE / name
    receipt = HERE / f"{name}.sha256"
    if sha(path.read_bytes()) != receipt.read_text().strip():
        raise ValueError(f"Frozen artifact changed: {name}")
    return read(name)


def load_inputs():
    rows = corpus()
    ids = [row["id"] for row in frozen()]
    references = frozen_input("reference.json")
    candidates = frozen_input("proposals.json")
    evidence = frozen_input("witnesses.json")
    if any(set(data) != set(ids) for data in (references, candidates, evidence)):
        raise ValueError("Inconsistent holdout coverage")
    return ((key, rows[key], references[key], candidates[key], evidence[key]) for key in ids)


def compare(expected, proposed, checks):
    accepted = {tuple(decision["link"]) for decision in checks if decision["accepted"]}
    unchecked = set(map(tuple, proposed))
    result = {}
    for arm, links in (("unchecked", unchecked), ("checked", accepted)):
        result[arm] = {
            "supported": len(expected & links),
            "unsupported": len(links - expected),
            "omitted": len(expected - links),
            "unsupported_record": int(bool(links - expected)),
        }
    return result


def stress(expected, nodes):
    """A supported chain and the alternate effect-strength statement on the same nodes."""
    variants = []
    edges = [link for link in sorted(expected, key=repr) if link[0] == "edge"]
    for a in edges:
        for b in edges:
            if a[2] != b[1] or a[-1] != b[-1] or len({a[1], a[2], b[2]}) != 3:
                continue
            swapped = ("strength", a[1], b[1], b[2], "change", b[-2], b[-1])
            if swapped not in expected:
                variants.append({"supported": [list(a), list(b)], "confusion": list(swapped)})
    for m in sorted(expected, key=repr):
        if m[0] == "strength":
            confusion = ("edge", m[1], m[2], "change", m[-2], m[-1])
            if confusion not in expected:
                variants.append({"supported": [list(m)], "confusion": list(confusion)})
    if not expected and len(nodes) >= 2:
        a, b, *_ = sorted(nodes)
        variants.append({"supported": [], "confusion": ["edge", a, b, "change", "possible", None]})
    return variants


def run():
    paired, stress_rows, totals = {}, [], defaultdict(Counter)
    for key, record, ref, proposed, support in load_inputs():
        nodes = ref["nodes"]
        expected = {signature(link, nodes) for link in ref["gold"]}
        if any(set(node) != {"axis", "span"} for node in nodes.values()):
            raise ValueError("Invalid node data")
        for node in nodes.values():
            span(record["text"], node["span"])
        receipt = check(record, nodes, proposed, support)
        pair = compare(expected, proposed, receipt)
        for arm, scores in pair.items():
            totals[arm].update(scores)
        paired[key] = {"scores": pair, "decisions": receipt, "gold_links": len(expected)}
        for item in stress(expected, nodes):
            proposed_stress = [*item["supported"], item["confusion"]]
            checked_stress = check(record, nodes, proposed_stress, support)
            stress_rows.append({"id": key, **item, "decisions": checked_stress})
    return {"paired": paired, "totals": totals, "stress": stress_rows,
            "frozen_inputs": {name: sha((HERE / name).read_bytes()) for name in
                              ("frozen-holdout.json", "reference.json", "proposals.json", "witnesses.json")}}


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
        write("results.json", run())


if __name__ == "__main__":
    main()
