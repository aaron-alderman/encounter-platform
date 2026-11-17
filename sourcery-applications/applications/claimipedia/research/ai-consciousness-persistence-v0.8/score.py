"""Score matched historical choices and retrieval delivery."""
from collections import Counter
from datetime import datetime, timezone
import json

from run import HERE, load_protocol, sha

METHODS = ("pagerank", "lexical", "hybrid")
ARMS = ("none", "exact", *(f"{m}@{k}" for m in METHODS for k in (1, 2)))


def rate(rows, predicate):
    return {"count": sum(predicate(row) for row in rows), "total": len(rows)}


def summarize(deltas):
    counts = Counter(deltas)
    return {"pairs": len(deltas), "positive": counts[1], "negative": counts[-1], "ties": counts[0],
            "contrast": sum(deltas) / len(deltas) if deltas else None}


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")
    prior_sessions = set()
    for version in ("0.6", "0.7"):
        previous = HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results"
        for path in previous.glob("*.json"):
            row = json.loads(path.read_text())
            prior_sessions.update(turn["session"] for turn in row.get("turns", {}).values())
            if "decision" in row:
                prior_sessions.add(row["decision"]["session"])

    failures = {}
    sessions = set()
    outcomes = {}
    for cell in protocol["cells"]:
        path = HERE / "actor-results" / f'{cell["id"]}.json'
        if not path.is_file():
            failures[cell["id"]] = "missing"
            continue
        result = json.loads(path.read_text())
        if result["id"] != cell["id"] or result["promptSha256"] != cell["promptSha256"]:
            raise ValueError("Actor receipt does not match its frozen cell")
        if result["status"] != "valid":
            failures[cell["id"]] = result.get("error", result["status"])
            continue
        decision = result["decision"]
        session = decision["session"]
        if session in prior_sessions or session in sessions:
            raise ValueError("A fresh decision reused a session")
        sessions.add(session)
        if (decision["toolItems"] or result["choice"] not in ("A", "B")
                or json.loads(decision["response"]) != {"choice": result["choice"]}):
            raise ValueError("Invalid retained choice")
        stratum = (cell["case"], cell["approveLabel"], cell["firstLabel"])
        key = (cell["arm"], stratum, cell["history"])
        if key in outcomes:
            raise ValueError("Duplicate outcome")
        outcomes[key] = dict(cell, approved=result["choice"] == cell["approveLabel"])

    cases = [c["id"] for c in protocol["cases"]]
    paired = {arm: {} for arm in ARMS}
    for (arm, stratum, state), after in outcomes.items():
        before = outcomes.get((arm, stratum, "pending"))
        if state == "approved" and before is not None:
            if before["decision"] != after["decision"]:
                raise ValueError("Unmatched decision text")
            paired[arm][stratum] = int(after["approved"]) - int(before["approved"])

    history = {}
    for arm in ARMS:
        rows = [row for row in outcomes.values() if row["arm"] == arm]
        planned = [row for row in protocol["cells"] if row["arm"] == arm]
        history[arm] = {
            "matched": summarize(list(paired[arm].values())),
            "byCase": {case: summarize([delta for s, delta in paired[arm].items() if s[0] == case])
                       for case in cases},
            "correctByState": {
                state: rate([r for r in rows if r["history"] == state],
                            lambda r: r["approved"] == (state == "approved"))
                for state in ("pending", "approved")
            },
            "exactAnchorDelivery": rate(planned, lambda r: r["exact"] in r["selected"]),
        }

    def compare(left, right):
        delta = [paired[left][s] - paired[right][s] for s in paired[left].keys() & paired[right].keys()]
        return {"commonPairs": len(delta), "contrast": sum(delta) / len(delta) if delta else None}

    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-archived-ranking-result/0.8",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(outcomes),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "policyTransitions": cases, "history": history,
        "matchedDifferences": {
            "againstNoRetrieval": {arm: compare(arm, "none") for arm in ARMS if arm != "none"},
            "againstExact": {arm: compare(arm, "exact") for arm in ARMS if arm != "exact"},
            "topTwoMinusTopOne": {method: compare(f"{method}@2", f"{method}@1") for method in METHODS},
            "betweenRankers": {
                str(k): {f"{a}-minus-{b}": compare(f"{a}@{k}", f"{b}@{k}")
                         for a, b in (("lexical", "pagerank"), ("hybrid", "pagerank"), ("hybrid", "lexical"))}
                for k in (1, 2)
            },
        },
        "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for arm, values in history.items():
        print(arm, values["matched"], "correct", values["correctByState"],
              "exact anchor", values["exactAnchorDelivery"])


if __name__ == "__main__":
    main()
