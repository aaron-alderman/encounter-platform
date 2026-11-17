"""Aggregate preregistered investigator judgments against fixed semantic probes."""
import json

from freeze import FILES, HERE, pick, sha
from model import decode

ARMS = ("full", "uncoupled", "V", "V+")


def load(name):
    return json.loads((HERE / name).read_bytes())


def main():
    freeze = load("frozen-holdout.json")
    keys = freeze["recordIds"]
    if keys != pick() or freeze["hashes"] != {k: sha(v.read_bytes()) for k, v in FILES.items()}:
        raise ValueError("Frozen split or inputs changed")
    probes = load("probes.json")
    if (HERE / "probes.sha256").read_text().strip() != sha((HERE / "probes.json").read_bytes()):
        raise ValueError("Frozen probes changed")
    encodings, decoded, judgments = map(load, ("encodings.json", "decoded.json", "judgments.json"))
    if any(set(obj) != set(keys) for obj in (probes, encodings, decoded, judgments)):
        raise ValueError("Files must cover exactly the holdout IDs")
    totals = {arm: {"exact": 0, "passed": 0, "unsupportedRecords": 0} for arm in ARMS}
    paired = {}
    for key in keys:
        n = len(probes[key])
        if n < 2 or set(judgments[key]) != set(ARMS) or set(decoded[key]) != set(ARMS):
            raise ValueError(f"Incomplete record {key}")
        for arm in ARMS:
            if decoded[key][arm] != decode(encodings[key], arm):
                raise ValueError(f"Decode replay mismatch {key} {arm}")
            flags, unsupported = judgments[key][arm]
            if len(flags) != n or set(flags) - {"0", "1"} or not isinstance(unsupported, list):
                raise ValueError(f"Invalid judgment {key} {arm}")
            count = flags.count("1")
            totals[arm]["passed"] += count
            totals[arm]["exact"] += count == n and not unsupported
            totals[arm]["unsupportedRecords"] += bool(unsupported)
        full, uncoupled = (judgments[key][arm][0] for arm in ("full", "uncoupled"))
        paired[key] = {"probes": n,
                       "full": full.count("1"), "uncoupled": uncoupled.count("1"),
                       "gainedProbes": [i + 1 for i, (a, b) in enumerate(zip(full, uncoupled))
                                        if a == "1" and b == "0"],
                       "lostProbes": [i + 1 for i, (a, b) in enumerate(zip(full, uncoupled))
                                      if a == "0" and b == "1"]}
    result = {
        "inputHashes": {name: sha((HERE / name).read_bytes()) for name in
                        ("frozen-holdout.json", "probes.json", "encodings.json",
                         "decoded.json", "judgments.json")},
        "records": len(keys),
        "probes": sum(map(len, probes.values())),
        "totals": totals,
        "paired": paired,
        "couplingCriterionPassed": (sum(bool(row["gainedProbes"]) for row in paired.values()) >= 2
                                    and totals["full"]["exact"] > totals["uncoupled"]["exact"]),
        "majorityExact": totals["full"]["exact"] * 2 > len(keys),
    }
    with (HERE / "results.json").open("x") as out:
        json.dump(result, out, indent=2)
        out.write("\n")


if __name__ == "__main__":
    main()
