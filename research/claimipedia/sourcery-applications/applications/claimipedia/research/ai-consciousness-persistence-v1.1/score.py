"""Score false approvals and matched repair effects by decision lineage."""
from collections import Counter
from datetime import datetime, timezone
import json

from run import HERE, load_protocol

ARMS = ("00", "10", "01", "11")
STATES = ("pending", "approved")
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
        "positive": sum(n for delta, n in counts.items() if delta > 0),
        "negative": sum(n for delta, n in counts.items() if delta < 0),
        "ties": counts[0],
        "contrast": sum(values) / len(values) if values else None,
    }


def rate(values):
    return {"approved": sum(values), "total": len(values)}


def compare(left, right):
    return summarize([left[key] - right[key] for key in left.keys() & right.keys()])


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")

    prior_sessions = set()
    for version in ("0.6", "0.7", "0.8", "0.9", "1.0"):
        for path in (HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results").glob("*.json"):
            row = json.loads(path.read_text())
            prior_sessions.update(t["session"] for t in row.get("turns", {}).values())
            if "decision" in row:
                prior_sessions.add(row["decision"]["session"])

    cases = [case["id"] for case in protocol["cases"]]
    outcomes = {case: {state: {arm: {} for arm in ARMS} for state in STATES} for case in cases}
    failures, sessions = {}, set()
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
        if session in prior_sessions or session in sessions:
            raise ValueError("Decision reused an existing session")
        sessions.add(session)
        if (decision["toolItems"] or result["choice"] not in ("A", "B")
                or json.loads(decision["response"]) != {"choice": result["choice"]}):
            raise ValueError("Invalid saved choice")
        stratum = (c["approveLabel"], c["firstLabel"], c["ledgerOrderBlock"])
        arm = outcomes[c["case"]][c["state"]][c["arm"]]
        if stratum in arm:
            raise ValueError("Duplicate decision")
        arm[stratum] = int(result["choice"] == c["approveLabel"])

    history = {}
    for case, states in outcomes.items():
        details = {}
        for state, arms in states.items():
            common = set.intersection(*(set(arms[arm]) for arm in ARMS))
            effects = {name: compare(arms[left], arms[right]) for name, (left, right) in COMPARISONS.items()}
            effects["successorInteractionWithStale"] = summarize([
                (arms["11"][k] - arms["10"][k]) - (arms["01"][k] - arms["00"][k]) for k in common
            ])
            both = {order: {(label, first): v for (label, first, o), v in arms["11"].items() if o == order}
                    for order in ("stale-first", "successor-first")}
            details[state] = {
                "approvals": {arm: rate(list(values.values())) for arm, values in arms.items()},
                "matchedEffects": effects,
                "bothRecordsByOrder": {o: rate(list(values.values())) for o, values in both.items()},
                "successorFirstMinusStaleFirst": compare(both["successor-first"], both["stale-first"]),
            }
            if state == "approved":
                losses = [key for key in arms["00"].keys() & arms["10"].keys()
                          if arms["00"][key] == 1 and arms["10"][key] == 0]
                observable = [key for key in losses if key in arms["11"]]
                details[state]["observedStaleOnlyFailures"] = len(losses)
                details[state]["recoveredByRemoval"] = {"count": len(losses), "total": len(losses)}
                details[state]["recoveredBySuccessorWhileStaleRemains"] = {
                    "count": sum(arms["11"][key] for key in observable), "total": len(observable),
                }
                details[state]["repairTested"] = bool(losses)
        details["matchedHistory"] = {arm: compare(states["approved"][arm], states["pending"][arm]) for arm in ARMS}
        history[case] = details

    false_approvals = {}
    for arm in ARMS:
        pooled = [v for case in cases for v in outcomes[case]["pending"][arm].values()]
        false_approvals[arm] = {"falseApprovals": sum(pooled), "total": len(pooled)}
    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-cross-lineage-factorial-result/1.1",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(sessions),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "falseApprovalsByArm": false_approvals, "lineages": history, "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for case, details in history.items():
        print(case, "approved", details["approved"]["approvals"], "pending", details["pending"]["approvals"],
              "stale-only failures", details["approved"]["observedStaleOnlyFailures"],
              "rescued with stale present", details["approved"]["recoveredBySuccessorWhileStaleRemains"])
    print("False approvals", false_approvals)


if __name__ == "__main__":
    main()
