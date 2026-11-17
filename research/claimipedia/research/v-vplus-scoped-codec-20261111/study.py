"""Freeze, decode and score the paired scoped-codec study."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from codec import decode

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "sourcery-applications/applications/claimipedia/docs"
FILES = {
    "claims": DOCS / "identity-claims-map.json",
    "equivalence": DOCS / "identity-proposition-equivalence-ledger.json",
    "prior_crystallization": HERE.parent / "semantic-crystallization-20261111/frozen-split.json",
    "prior_reconstruction": HERE.parent / "v-vplus-reconstruction-20261111/frozen-holdout.json",
    **{name: HERE / name for name in ("PREREGISTRATION.md", "codec.py", "study.py")},
}
ARMS = ("coupled", "uncoupled")
EXAMPLES = {
    "claim.aiFutures.agency-preserving-assistance",
    "claim.contribution.9d5dfcc314cbf82a340a7f773bd5baee",
    "claim.contribution.c3e716044f2be48324fe900f17d01729",
    "claim.contribution.d85d33c73dd081d79488b76c137fb194",
}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def load(name):
    return json.loads(FILES.get(name, HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, indent=2)
        out.write("\n")


def fingerprints():
    return {key: sha(path.read_bytes()) for key, path in FILES.items()}


def select():
    rows = {row["id"]: row for row in load("claims")["claims"]}
    prior = load("prior_crystallization")
    excluded = EXAMPLES | set(load("prior_reconstruction")["recordIds"])
    excluded |= {record for group in prior["groups"] for cluster in group["records"]
                 for record in cluster}
    components = {key: {key} for key in rows}
    exact = defaultdict(list)
    for key, row in rows.items():
        exact[" ".join(row["text"].casefold().split())].append(key)
    reviewed = [rows.keys() & set(item["recordIds"]) for item in load("equivalence")["decisions"]
                if item["decision"] == "confirm-equivalence"]
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[key] for key in group))
        for key in merged:
            components[key] = merged
    selected = []
    for namespace in ("aiInquiry", "claimipedia"):
        candidates = [key for key, row in rows.items() if key.split(".")[1] == namespace
                      and set(row["facets"]) & {"agency", "attribution", "relation"}]
        for key in sorted(candidates, key=lambda x: sha(("claimipedia-scoped-v2|" + x).encode())):
            if not components[key] & excluded:
                selected.append(key)
                excluded |= components[key]
                if sum(item.split(".")[1] == namespace for item in selected) == 4:
                    break
    if len(selected) != 8:
        raise ValueError("Insufficient fresh claims")
    return selected


def verified_ids():
    frozen = load("frozen-holdout.json")
    if frozen["sha256"] != fingerprints() or frozen["ids"] != select():
        raise ValueError("Frozen inputs or deterministic holdout changed")
    return frozen["ids"]


def decoded():
    encodings = load("encodings.json")
    ids = verified_ids()
    if set(encodings) != set(ids):
        raise ValueError("Expected exactly the frozen IDs")
    outputs = {key: {arm: decode(encodings[key], coupled=arm == "coupled") for arm in ARMS}
               for key in ids}
    for pair in outputs.values():
        if {key: value for key, value in pair["coupled"].items() if key != "couplings"} != pair["uncoupled"]:
            raise ValueError("Ablation changed coordinate material")
    return outputs


def score():
    ids = verified_ids()
    probes, judgments, saved = map(load, ("probes.json", "judgments.json", "decoded.json"))
    if set(probes) != set(ids) or set(judgments) != set(ids) or saved != decoded():
        raise ValueError("Inconsistent artifacts")
    if sha((HERE / "probes.json").read_bytes()) != (HERE / "probes.sha256").read_text().strip():
        raise ValueError("Frozen probes changed")
    totals = {arm: Counter() for arm in ARMS}
    comparisons = {}
    for key in ids:
        record = judgments[key]
        kinds = [probe["kind"] for probe in probes[key]]
        if not 2 <= len(kinds) <= 8 or set(kinds) - {"local", "coupling"} or set(record) != set(ARMS):
            raise ValueError("Invalid probe or judgment coverage")
        for arm in ARMS:
            flags, errors = record[arm]["flags"], record[arm]["unsupported"]
            if set(flags) - {"0", "1"} or len(flags) != len(kinds) or not isinstance(errors, list):
                raise ValueError("Malformed investigator judgment")
            totals[arm]["exact"] += "0" not in flags and not errors
            totals[arm]["passed"] += flags.count("1")
            totals[arm]["unsupportedRecords"] += bool(errors)
            for kind, flag in zip(kinds, flags):
                totals[arm][kind] += flag == "1"
        full, ablated = (record[arm]["flags"] for arm in ARMS)
        comparisons[key] = {
            "coupled": full.count("1"), "uncoupled": ablated.count("1"), "total": len(kinds),
            "gainedProbes": [i for i, (a, b) in enumerate(zip(full, ablated), 1) if a > b],
            "lostProbes": [i for i, (a, b) in enumerate(zip(full, ablated), 1) if a < b],
        }
    gained = sum(bool(r["gainedProbes"]) for r in comparisons.values())
    return {
        "records": len(ids),
        "probesByKind": dict(Counter(p["kind"] for row in probes.values() for p in row)),
        "totals": totals, "paired": comparisons,
        "couplingCriterionPassed": gained >= 2 and totals["coupled"]["exact"] > totals["uncoupled"]["exact"],
        "majorityExact": totals["coupled"]["exact"] * 2 > len(ids),
        "sha256": {name: sha((HERE / name).read_bytes()) for name in
                   ("frozen-holdout.json", "probes.json", "encodings.json", "decoded.json", "judgments.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "decode", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen-holdout.json", {"frozenUtc": datetime.now(timezone.utc).isoformat(),
                                     "sha256": fingerprints(), "ids": select()})
    elif action == "decode":
        write("decoded.json", decoded())
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
