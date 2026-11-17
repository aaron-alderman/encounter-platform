"""Compute preregistered conditional, interaction and ledger-order contrasts."""
from collections import Counter
from datetime import datetime, timezone
import json

from freeze import ORDERS, PRIOR
from run import HERE, load_protocol

ARMS = ("00", "10", "01", "11")
COMPARISONS = {
    "removeStaleWithoutSuccessor": ("00", "10"),
    "addSuccessorWithStale": ("11", "10"),
    "removeStaleWithSuccessor": ("01", "11"),
    "addSuccessorWithoutStale": ("01", "00"),
    "bundledRepair": ("01", "10"),
}


def summarize(values):
    counts = Counter(values)
    return {
        "pairs": len(values),
        "positive": sum(count for delta, count in counts.items() if delta > 0),
        "negative": sum(count for delta, count in counts.items() if delta < 0),
        "ties": counts[0],
        "contrast": sum(values) / len(values) if values else None,
    }


def rate(values):
    return {"approved": sum(values), "total": len(values)}


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")
    predecessor_sessions = set()
    for version in ("0.6", "0.7", "0.8", "0.9"):
        for path in (HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results").glob("*.json"):
            result = json.loads(path.read_text())
            predecessor_sessions.update(t["session"] for t in result.get("turns", {}).values())
            if "decision" in result:
                predecessor_sessions.add(result["decision"]["session"])

    prior_protocol = json.loads((PRIOR / "preregistration.json").read_text())
    prior = {key: [] for key in ("top1", "top2", "version-aware-top2")}
    for c in prior_protocol["cells"]:
        if c["case"] != "default-switch" or c["history"] != "approved":
            continue
        path = PRIOR / "actor-results" / f'{c["id"]}.json'
        if path.is_file():
            result = json.loads(path.read_text())
            if result["status"] == "valid":
                prior[c["variant"]].append(result["choice"] == c["approveLabel"])

    failures, sessions, outcomes = {}, set(), {arm: {} for arm in ARMS}
    for c in protocol["cells"]:
        path = HERE / "actor-results" / f'{c["id"]}.json'
        if not path.is_file():
            failures[c["id"]] = "missing"
            continue
        result = json.loads(path.read_text())
        if result["id"] != c["id"] or result["promptSha256"] != c["promptSha256"]:
            raise ValueError("Decision receipt differs from frozen cell")
        if result["status"] != "valid":
            failures[c["id"]] = result.get("error", result["status"])
            continue
        decision = result["decision"]
        session = decision["session"]
        if session in predecessor_sessions or session in sessions:
            raise ValueError("Decision reused an existing session")
        sessions.add(session)
        if (decision["toolItems"] or result["choice"] not in ("A", "B")
                or json.loads(decision["response"]) != {"choice": result["choice"]}):
            raise ValueError("Invalid saved choice")
        stratum = (c["approveLabel"], c["firstLabel"], c["ledgerOrderBlock"])
        if stratum in outcomes[c["arm"]]:
            raise ValueError("Duplicate arm observation")
        outcomes[c["arm"]][stratum] = int(result["choice"] == c["approveLabel"])

    def compare(left, right):
        return summarize([left[key] - right[key] for key in left.keys() & right.keys()])

    effects = {name: compare(outcomes[left], outcomes[right])
               for name, (left, right) in COMPARISONS.items()}
    common = set.intersection(*(set(outcomes[arm]) for arm in ARMS))
    effects["successorInteractionWithStale"] = summarize([
        outcomes["11"][key] - outcomes["10"][key] - (outcomes["01"][key] - outcomes["00"][key])
        for key in common
    ])
    both_orders = {order: {(label, first): choice
                           for (label, first, observed_order), choice in outcomes["11"].items()
                           if observed_order == order} for order in ORDERS}
    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-ledger-factorial-result/1.0",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(sessions),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "approvals": {arm: rate(list(rows.values())) for arm, rows in outcomes.items()},
        "matchedEffects": effects,
        "bothLedgersByOrder": {order: rate(list(rows.values())) for order, rows in both_orders.items()},
        "successorFirstMinusStaleFirst": compare(both_orders["successor-first"], both_orders["stale-first"]),
        "priorApprovedCheckpoint": {variant: rate(values) for variant, values in prior.items()},
        "canonicalEffect": "none",
    }
    text = json.dumps(report, indent=2) + "\n"
    (HERE / "final-results.json").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
