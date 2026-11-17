"""Freeze a provenance split, then evaluate facet associations and holdout prediction."""

import argparse
import hashlib
import itertools
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "sourcery-applications/applications/claimipedia/docs"
INPUTS = (
    "identity-claims-map.json",
    "identity-proposition-equivalence-ledger.json",
    "identity-algebra-ia1-source-ledger.json",
    "identity-algebra-ia1-remediated-source-ledger.json",
)
SALT = "claimipedia-semantic-crystallization-v1|"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(name, value):
    with (HERE / name).open("x") as out:
        json.dump(value, out, indent=2, sort_keys=True, allow_nan=False)
        out.write("\n")


def linked_components(items, links):
    parents = {item: item for item in items}

    def root(item):
        while parents[item] != item:
            parents[item] = parents[parents[item]]
            item = parents[item]
        return item

    for group in links:
        group = sorted(set(group))
        for item in group[1:]:
            parents[root(item)] = root(group[0])
    components = defaultdict(list)
    for item in sorted(parents):
        components[root(item)].append(item)
    return list(components.values())


def freeze(inputs, fingerprint):
    claims, equivalence, *ledgers = inputs
    texts = defaultdict(list)
    ids = {claim["id"] for claim in claims["claims"]}
    for claim in claims["claims"]:
        texts[" ".join(claim["text"].casefold().split())].append(claim["id"])
    reviewed = [
        ids.intersection(row["recordIds"])
        for row in equivalence["decisions"]
        if row["decision"] == "confirm-equivalence"
    ]
    propositions = linked_components(ids, [*texts.values(), *reviewed])

    memberships = defaultdict(set)
    by_identity = defaultdict(set)
    keys = set()
    for ledger in ledgers:
        for source in ledger["decisions"]:
            if source["sourceIdentityDecision"] != "admit-source-identity":
                continue
            lineage = {
                ".".join(request.split(".")[:2])
                for request in source.get("requestIds", [])
            } or {source["reference"]}
            keys.update(lineage)
            by_identity[source["sourceId"]].update(lineage)
            if source.get("sourceHash"):
                by_identity[source["sourceHash"]].update(lineage)
            for record in ids.intersection(source["linkedRecordIds"]):
                memberships[record].update(lineage)

    sourced = []
    for proposition in propositions:
        records = [record for record in proposition if record in memberships]
        if records:
            lineages = set.union(*(memberships[record] for record in records))
            sourced.append((records, lineages))
    groups = linked_components(keys, [*by_identity.values(), *(keys for _, keys in sourced)])
    assert len(groups) >= 5
    groups.sort(key=lambda group: digest((SALT + "|".join(group)).encode()))
    partition = [
        {
            "lineages": group,
            "records": [records for records, lineage in sourced if lineage.intersection(group)],
        }
        for group in groups
    ]
    assert sum(len(group["records"]) for group in partition) == len(sourced)
    stage_size, surplus = divmod(len(groups) - 2, 3)
    cursor = 2
    for index in range(3):
        stop = cursor + stage_size + (index < surplus)
        for group in partition[cursor:stop]:
            group["stage"] = index + 1
        cursor = stop
    for group in partition[:2]:
        group["stage"] = "holdout"
    assert all(group["records"] for group in partition)
    write("frozen-split.json", {
        "frozenUtc": datetime.now(timezone.utc).isoformat(),
        "sha256": fingerprint,
        "groups": partition,
    })


def pair_stats(blocks, left, right):
    cross, var_left, var_right, n, count_left, count_right = 0, 0, 0, 0, 0, 0
    votes = {}
    for name, rows in blocks.items():
        size = len(rows)
        a = sum(left in row for row in rows)
        b = sum(right in row for row in rows)
        both = sum(left in row and right in row for row in rows)
        numerator = both * size - a * b
        votes[name] = sign(numerator)
        cross += numerator / size
        var_left += a * (size - a) / size
        var_right += b * (size - b) / size
        n += size
        count_left += a
        count_right += b
    phi = cross / math.sqrt(var_left * var_right) if var_left and var_right else None
    direction = sign(phi) if phi is not None else 0
    lit = (
        phi is not None and abs(phi) >= 0.20
        and min(count_left, n - count_left, count_right, n - count_right) >= 4
        and direction in votes.values()
    )
    return {"phi": phi, "direction": direction, "lit": lit, "votes": votes}


def sign(value):
    return (value > 1e-12) - (value < -1e-12)


def fit(blocks, target, feature):
    rows = list(itertools.chain.from_iterable(blocks.values()))
    baseline = (1 + sum(target in row for row in rows)) / (2 + len(rows))
    conditional = []
    for present in (False, True):
        subset = [row for row in rows if (feature in row) == present]
        conditional.append((sum(target in row for row in subset) + 4 * baseline) / (len(subset) + 4))
    return baseline, conditional


def loss(probability, observed):
    return -math.log(probability if observed else 1 - probability)


def predict(blocks, target, feature, baseline, conditional):
    scores = {}
    for name, rows in blocks.items():
        base = mean(loss(baseline, target in row) for row in rows)
        model = mean(loss(conditional[feature in row], target in row) for row in rows)
        scores[name] = {"baseline": base, "model": model, "gain": base - model}
    return scores


def evaluate(claims, split):
    facets = sorted(facet["id"] for facet in claims["facets"])
    labels = {record["id"]: set(record["facets"]) for record in claims["claims"]}

    def blocks(groups):
        return {
            "|".join(group["lineages"]): [labels[records[0]] for records in group["records"]]
            for group in groups
        }

    stages = [
        blocks(group for group in split["groups"] if group["stage"] in range(1, stage + 1))
        for stage in range(1, 4)
    ]
    train = stages[-1]
    edges = []
    selected = {}
    for left, right in itertools.combinations(facets, 2):
        metrics = [pair_stats(stage, left, right) for stage in stages]
        final = metrics[-1]
        direction = final["direction"]
        votes = [vote for vote in final["votes"].values() if vote]
        leave_one_out = {
            key: pair_stats({k: v for k, v in train.items() if k != key}, left, right)["direction"]
            for key in train
        }
        stable = (
            final["lit"] and metrics[1]["lit"] and metrics[1]["direction"] == direction
            and votes.count(direction) >= 2 and votes.count(direction) * 3 >= 2 * len(votes)
            and all(vote == direction for vote in leave_one_out.values())
        )
        edge = {
            "facets": [left, right], "stages": metrics, "stable": stable,
            "leaveOneLineageOutDirections": leave_one_out,
        }
        edges.append(edge)
        if stable:
            edge["models"] = {}
            for target, feature in ((left, right), (right, left)):
                baseline, conditional = fit(train, target, feature)
                agrees = sign(conditional[1] - conditional[0]) == direction
                edge["models"][target] = {
                    "feature": feature, "baseline": baseline,
                    "conditionalAbsentPresent": conditional, "trainingDirectionAgrees": agrees,
                }
                rank = (-abs(final["phi"]), feature)
                if agrees and (target not in selected or rank < selected[target]):
                    selected[target] = rank

    holdout = blocks(group for group in split["groups"] if group["stage"] == "holdout")
    for edge in edges:
        if edge["stable"]:
            held = pair_stats(holdout, *edge["facets"])
            edge["holdout"] = held
            for target, model in edge["models"].items():
                scores = predict(holdout, target, model["feature"], model["baseline"],
                                 model["conditionalAbsentPresent"])
                model["heldoutLineages"] = scores
                model["gain"] = mean(row["gain"] for row in scores.values())
                model["predictive"] = (
                    held["direction"] == edge["stages"][-1]["direction"]
                    and model["trainingDirectionAgrees"]
                    and all(row["gain"] > 0 for row in scores.values())
                )

    target_scores = {}
    for target in facets:
        feature = selected[target][1] if target in selected else None
        baseline, conditional = fit(train, target, feature)
        if feature is None:
            conditional = [baseline, baseline]
        target_scores[target] = {
            "selectedFeature": feature,
            "lineages": predict(holdout, target, feature, baseline, conditional),
        }
    aggregate_lineages = {
        name: {metric: mean(target["lineages"][name][metric] for target in target_scores.values())
               for metric in ("baseline", "model", "gain")}
        for name in holdout
    }
    return {
        "frozenSplitSha256": digest((HERE / "frozen-split.json").read_bytes()),
        "scoredUtc": datetime.now(timezone.utc).isoformat(),
        "eligibleRecords": sum(len(records) for g in split["groups"] for records in g["records"]),
        "disagreements": [
            records for group in split["groups"] for records in group["records"]
            if any(labels[record] != labels[records[0]] for record in records)
        ],
        "stages": [
            {"groups": {key: len(rows) for key, rows in stage.items()},
             "litEdges": sum(edge["stages"][index]["lit"] for edge in edges)}
            for index, stage in enumerate(stages)
        ],
        "edges": edges,
        "holdoutGroupSizes": {key: len(rows) for key, rows in holdout.items()},
        "aggregate": {metric: mean(group[metric] for group in aggregate_lineages.values())
                      for metric in ("baseline", "model", "gain")},
        "aggregateByLineage": aggregate_lineages,
        "aggregateByTarget": target_scores,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "score"))
    args = parser.parse_args()
    raw = {name: (DOCS / name).read_bytes() for name in INPUTS}
    fingerprints = {name: digest(data) for name, data in raw.items()}
    for name in ("PREREGISTRATION.md", "run.py"):
        fingerprints[name] = digest((HERE / name).read_bytes())
    inputs = [json.loads(raw[name]) for name in INPUTS]
    if args.action == "freeze":
        freeze(inputs, fingerprints)
    else:
        split = json.loads((HERE / "frozen-split.json").read_bytes())
        if split["sha256"] != fingerprints:
            raise SystemExit("Frozen inputs, protocol, or runner differ")
        write("results.json", evaluate(inputs[0], split))


if __name__ == "__main__":
    main()
