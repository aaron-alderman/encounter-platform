"""Freeze, decode, or score the preregistered 2x2 vocabulary and coupling study."""

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from codec import BASELINE, compile_lexicon, decode

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "sourcery-applications/applications/claimipedia/docs"
PREVIOUS = HERE.parent
FILES = {
    "claims": DOCS / "identity-claims-map.json",
    "equivalence": DOCS / "identity-proposition-equivalence-ledger.json",
    "prior_crystallization": PREVIOUS / "semantic-crystallization-20261111/frozen-split.json",
    "prior_reconstruction": PREVIOUS / "v-vplus-reconstruction-20261111/frozen-holdout.json",
    "prior_scoped": PREVIOUS / "v-vplus-scoped-codec-20261111/frozen-holdout.json",
    "fixed_codec": BASELINE,
    **{name: HERE / name for name in ("codec.py", "study.py", "PREREGISTRATION.md")},
}
NAMESPACES = ("aiFutures", "claimipedia", "corpus400")
ARMS = ("fixed_off", "fixed_on", "grounded_off", "grounded_on")
KINDS = ("lexical", "roles", "scope", "coupling", "other")
EXAMPLES = {
    "claim.aiFutures.agency-preserving-assistance",
    "claim.contribution.9d5dfcc314cbf82a340a7f773bd5baee",
    "claim.contribution.c3e716044f2be48324fe900f17d01729",
    "claim.contribution.d85d33c73dd081d79488b76c137fb194",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rank(namespace, text):
    return sha(f"claimipedia-grounded-v3|{namespace}|{text}".encode())


def read(name):
    return json.loads(FILES.get(name, HERE / name).read_bytes())


def write(name, value):
    with (HERE / name).open("x") as file:
        json.dump(value, file, indent=2, ensure_ascii=False)
        file.write("\n")


def fingerprints():
    return {name: sha(path.read_bytes()) for name, path in FILES.items()}


def claims():
    return {record["id"]: record for record in read("claims")["claims"]}


def select():
    records = claims()
    exact = defaultdict(set)
    for key, row in records.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [records.keys() & set(decision["recordIds"])
                for decision in read("equivalence")["decisions"]
                if decision["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in records}
    for group in [*exact.values(), *reviewed]:
        members = set().union(*(components[key] for key in group))
        for key in members:
            components[key] = members

    excluded = (EXAMPLES | set(read("prior_reconstruction")["recordIds"])
                | set(read("prior_scoped")["ids"]))
    excluded.update(key for group in read("prior_crystallization")["groups"]
                    for cluster in group["records"] for key in cluster)
    result = []
    for namespace in NAMESPACES:
        candidates = sorted(
            (key for key, row in records.items() if key.split(".")[1] == namespace
             and set(row["facets"]) & {"agency", "attribution", "relation"}),
            key=lambda key: rank("holdout", key),
        )
        chosen = []
        for key in candidates:
            if not (excluded & components[key]):
                chosen.append(key)
                excluded.update(components[key])
                if len(chosen) == 4:
                    break
        if len(chosen) != 4:
            raise ValueError(f"Too few eligible {namespace} claims")
        orders = sorted(chosen, key=lambda key: rank("encoding-order", key))
        result.extend({"id": key, "namespace": namespace,
                       "encode_first": "fixed" if key in orders[:2] else "grounded"}
                      for key in chosen)
    return result


def verified_rows():
    frozen = read("frozen-holdout.json")
    if frozen["sha256"] != fingerprints() or frozen["records"] != select():
        raise ValueError("Frozen inputs, method or selection changed")
    return frozen["records"]


def frozen_probes(ids):
    probes = read("probes.json")
    if (HERE / "probes.sha256").read_text().strip() != sha((HERE / "probes.json").read_bytes()):
        raise ValueError("Probe hash mismatch")
    if set(probes) != set(ids):
        raise ValueError("Probe coverage mismatch")
    for row in probes.values():
        if not 2 <= len(row) <= 8 or any(p["kind"] not in KINDS or not p["text"].strip() for p in row):
            raise ValueError("Invalid semantic probes")
    return probes


def render():
    ids = [row["id"] for row in verified_rows()]
    frozen_probes(ids)
    records = claims()
    encodings = read("encodings.json")
    if set(encodings) != set(ids):
        raise ValueError("Encodings must cover exactly the holdout")
    outputs = {}
    for key in ids:
        row = encodings[key]
        if set(row) != {"fixed", "grounded", "bindings"}:
            raise ValueError("Expected fixed and grounded programs and source bindings")
        lexicon = compile_lexicon(records[key], row["bindings"])
        by_arm = {}
        for name, registry in (("fixed", None), ("grounded", lexicon)):
            off = decode(row[name], False, registry)
            on = decode(row[name], True, registry)
            if off != {key: value for key, value in on.items() if key != "couplings"}:
                raise ValueError("Ablation changed more than the couplings")
            by_arm[f"{name}_off"], by_arm[f"{name}_on"] = off, on
        outputs[key] = {
            arm_id(key, arm): by_arm[arm]
            for arm in sorted(ARMS, key=lambda arm: rank("display", f"{key}|{arm}"))
        }
    return outputs


def arm_id(key, arm):
    return rank("label", f"{key}|{arm}")[:16]


def score():
    outputs = render()
    probes = frozen_probes(outputs)
    judgments = read("judgments.json")
    if outputs != read("decoded.json") or set(judgments) != set(outputs):
        raise ValueError("Decoded output or judgment coverage mismatch")
    totals = {arm: Counter(exact=0, passed=0, unsupported=0, **dict.fromkeys(KINDS, 0))
              for arm in ARMS}
    records = {}
    for key, arms in outputs.items():
        if set(judgments[key]) != set(arms):
            raise ValueError("Missing arm judgment")
        kinds = [p["kind"] for p in probes[key]]
        per_arm = {}
        for arm in ARMS:
            result = judgments[key][arm_id(key, arm)]
            flags, errors = result["flags"], result["unsupported"]
            if (len(flags) != len(kinds) or set(flags) - {"0", "1"}
                    or not isinstance(errors, list) or any(not error.strip() for error in errors)):
                raise ValueError("Invalid judgment")
            row = dict(passed=flags.count("1"), exact=int("0" not in flags and not errors),
                       unsupported=int(bool(errors)))
            totals[arm].update(row)
            totals[arm].update(kind for kind, flag in zip(kinds, flags) if flag == "1")
            per_arm[arm] = row
        records[key] = {"probes": len(kinds), "arms": per_arm}

    contrasts = {}
    pairs = {
        "grounding_off": ("grounded_off", "fixed_off"),
        "grounding_on": ("grounded_on", "fixed_on"),
        "coupling_fixed": ("fixed_on", "fixed_off"),
        "coupling_grounded": ("grounded_on", "grounded_off"),
    }
    for name, (a, b) in pairs.items():
        contrasts[name] = {
            metric: totals[a][metric] - totals[b][metric]
            for metric in ("exact", "passed", "unsupported")
        }
        contrasts[name]["probe_records_better"] = sum(
            row["arms"][a]["passed"] > row["arms"][b]["passed"] for row in records.values()
        )
        contrasts[name]["probe_records_worse"] = sum(
            row["arms"][a]["passed"] < row["arms"][b]["passed"] for row in records.values()
        )
    interaction = {
        key: contrasts["coupling_grounded"][key] - contrasts["coupling_fixed"][key]
        for key in ("exact", "passed", "unsupported")
    }
    return {
        "records": records, "probe_denominators": Counter(p["kind"] for row in probes.values() for p in row),
        "totals": totals, "contrasts": contrasts, "interaction": interaction,
        "sha256": {name: sha((HERE / name).read_bytes()) for name in
                   ("frozen-holdout.json", "probes.json", "encodings.json", "decoded.json", "judgments.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "show", "freeze-probes", "decode", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen-holdout.json", {"utc": datetime.now(timezone.utc).isoformat(),
                                     "sha256": fingerprints(), "records": select()})
    elif action == "verify":
        print("Verified frozen inputs and selection for", len(verified_rows()), "claims")
    elif action == "show":
        records = claims()
        for row in verified_rows():
            print(json.dumps({**row, "text": records[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "freeze-probes":
        path = HERE / "probes.json"
        with (HERE / "probes.sha256").open("x") as output:
            output.write(sha(path.read_bytes()) + "\n")
    elif action == "decode":
        write("decoded.json", render())
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
