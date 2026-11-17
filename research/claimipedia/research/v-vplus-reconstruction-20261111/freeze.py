"""Select and freeze the Claimipedia reconstruction holdout without showing its text."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
DOCS = PROJECT / "sourcery-applications/applications/claimipedia/docs"
FILES = {
    "claims": DOCS / "identity-claims-map.json",
    "equivalence": DOCS / "identity-proposition-equivalence-ledger.json",
    "prior": HERE.parent / "semantic-crystallization-20261111/frozen-split.json",
    **{name: HERE / name for name in ("model.py", "freeze.py", "score.py", "PREREGISTRATION.md")},
}
EXAMPLES = {
    "claim.aiFutures.agency-preserving-assistance",
    "claim.contribution.9d5dfcc314cbf82a340a7f773bd5baee",
    "claim.contribution.c3e716044f2be48324fe900f17d01729",
    "claim.contribution.d85d33c73dd081d79488b76c137fb194",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(name):
    return json.loads(FILES[name].read_bytes())


def pick():
    claims = {row["id"]: row for row in read("claims")["claims"]}
    components = {key: {key} for key in claims}
    by_text = {}
    for key, row in claims.items():
        normal = " ".join(row["text"].casefold().split())
        by_text.setdefault(normal, set()).add(key)
    links = list(by_text.values()) + [
        claims.keys() & set(item["recordIds"])
        for item in read("equivalence")["decisions"]
        if item["decision"] == "confirm-equivalence"
    ]
    for keys in links:
        merged = set().union(*(components[key] for key in keys))
        for key in merged:
            components[key] = merged

    excluded = EXAMPLES | {record for group in read("prior")["groups"]
                           for cluster in group["records"] for record in cluster}
    chosen = []
    for namespace in ("claimipedia", "corpus400"):
        candidates = sorted(
            (key for key, row in claims.items() if key.split(".")[1] == namespace
             and set(row["facets"]) & {"agency", "attribution", "relation"}),
            key=lambda key: sha(("claimipedia-v-vplus-v1|" + key).encode()),
        )
        start = len(chosen)
        for key in candidates:
            if not components[key] & excluded:
                chosen.append(key)
                excluded.update(components[key])
                if len(chosen) == start + 4:
                    break
        if len(chosen) != start + 4:
            raise ValueError(f"Too few eligible {namespace} records")
    return chosen


def main():
    record_ids = pick()
    with (HERE / "frozen-holdout.json").open("x") as out:
        json.dump({"frozenUtc": datetime.now(timezone.utc).isoformat(),
                   "hashes": {k: sha(v.read_bytes()) for k, v in FILES.items()},
                   "recordIds": record_ids}, out, indent=2)
        out.write("\n")


if __name__ == "__main__":
    main()
