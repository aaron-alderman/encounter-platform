"""Score the frozen matched comparisons and baseline replication."""
from collections import Counter
from datetime import datetime, timezone
import json

from freeze import METHODS, VARIANTS
from run import HERE, load_protocol


def rate(rows, predicate):
    return {"count": sum(predicate(row) for row in rows), "total": len(rows)}


def summarize(values):
    counts = Counter(values)
    return {"pairs": len(values), "positive": counts[1], "negative": counts[-1], "ties": counts[0],
            "contrast": sum(values) / len(values) if values else None}


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")
    previous = {}
    previous_sessions = set()
    for version in ("0.6", "0.7", "0.8"):
        directory = HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results"
        for path in directory.glob("*.json"):
            row = json.loads(path.read_text())
            previous_sessions.update(turn["session"] for turn in row.get("turns", {}).values())
            if "decision" in row:
                previous_sessions.add(row["decision"]["session"])
            if version == "0.8":
                previous[row["id"]] = row

    failures, sessions, outcomes = {}, set(), {}
    for cell in protocol["cells"]:
        path = HERE / "actor-results" / f'{cell["id"]}.json'
        if not path.is_file():
            failures[cell["id"]] = "missing"
            continue
        result = json.loads(path.read_text())
        if result["id"] != cell["id"] or result["promptSha256"] != cell["promptSha256"]:
            raise ValueError("Decision receipt differs from frozen cell")
        if result["status"] != "valid":
            failures[cell["id"]] = result.get("error", result["status"])
            continue
        decision = result["decision"]
        session = decision["session"]
        if session in previous_sessions or session in sessions:
            raise ValueError("Decision reused a session")
        sessions.add(session)
        if (decision["toolItems"] or result["choice"] not in ("A", "B")
                or json.loads(decision["response"]) != {"choice": result["choice"]}):
            raise ValueError("Invalid saved choice")
        key = (cell["arm"], cell["case"], cell["approveLabel"], cell["firstLabel"], cell["history"])
        if key in outcomes:
            raise ValueError("Duplicate decision")
        outcomes[key] = dict(cell, choice=result["choice"], approved=result["choice"] == cell["approveLabel"])

    cases = [c["id"] for c in protocol["cases"]]
    arms = [f"{method}/{variant}" for method in METHODS for variant in VARIANTS]
    deltas = {arm: {} for arm in arms}
    for (arm, case, label, order, history), after in outcomes.items():
        before = outcomes.get((arm, case, label, order, "pending"))
        if history == "approved" and before:
            if before["decision"] != after["decision"]:
                raise ValueError("Unmatched decision")
            deltas[arm][(case, label, order)] = int(after["approved"]) - int(before["approved"])

    history = {}
    for arm in arms:
        rows = [row for row in outcomes.values() if row["arm"] == arm]
        history[arm] = {
            "pooled": summarize(list(deltas[arm].values())),
            "byCase": {
                case: {
                    "matched": summarize([v for s, v in deltas[arm].items() if s[0] == case]),
                    "correctByState": {
                        state: rate([row for row in rows if row["case"] == case and row["history"] == state],
                                    lambda row: row["approved"] == (state == "approved"))
                        for state in ("pending", "approved")
                    },
                }
                for case in cases
            },
        }

    comparisons = {}
    for method in METHODS:
        intervention = deltas[f"{method}/version-aware-top2"]
        comparisons[method] = {}
        for baseline in ("top1", "top2"):
            control = deltas[f"{method}/{baseline}"]
            paired_differences = {s: intervention[s] - control[s] for s in intervention.keys() & control.keys()}
            by_case = {}
            for case in ("all", *cases):
                values = [v for s, v in paired_differences.items() if case == "all" or s[0] == case]
                by_case[case] = {
                    "pairs": len(values),
                    "contrast": sum(values) / len(values) if values else None,
                }
            comparisons[method][f"versionAwareMinus{baseline.title()}"] = by_case

    baseline_rows = [row for row in outcomes.values() if row["variant"] in ("top1", "top2")
                     and previous.get(row["sourceCell"], {}).get("status") == "valid"]
    if any(row["promptSha256"] != previous[row["sourceCell"]]["promptSha256"] for row in baseline_rows):
        raise ValueError("Baseline repetition changed the actor input")
    unchanged = []
    for (arm, case, label, order, state), row in outcomes.items():
        if row["variant"] == "version-aware-top2":
            ordinary = outcomes.get((f'{row["method"]}/top2', case, label, order, state))
            if ordinary and ordinary["promptSha256"] == row["promptSha256"]:
                unchanged.append((row, ordinary))

    passed = {}
    for method in METHODS:
        primary = history[f"{method}/version-aware-top2"]["byCase"]["default-switch"]
        passed[method] = (primary["matched"]["pairs"] == primary["matched"]["positive"] == 4
                          and primary["correctByState"]["pending"] == {"count": 4, "total": 4})

    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-version-aware-top-two-result/0.9",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(outcomes),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "history": history, "matchedDifferences": comparisons, "fullRepairCriterion": passed,
        "baselineAgreementWithV08": rate(baseline_rows, lambda row: row["choice"] == previous[row["sourceCell"]]["choice"]),
        "samePromptVersionAwareAndOrdinaryTop2Agreement": rate(unchanged, lambda pair: pair[0]["choice"] == pair[1]["choice"]),
        "changedTop2Packets": {
            key: {policy: receipt["packets"][policy] for policy in ("top2", "version-aware-top2")}
            for key, receipt in protocol["retrievalReceipts"].items()
            if receipt["packets"]["top2"] != receipt["packets"]["version-aware-top2"]
        },
        "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for arm, entry in history.items():
        print(arm, "overall", entry["pooled"], "default switch", entry["byCase"]["default-switch"])
    print("full repair", passed)
    print("v0.8 baseline agreement", report["baselineAgreementWithV08"])
    print("unchanged prompt agreement", report["samePromptVersionAwareAndOrdinaryTop2Agreement"])


if __name__ == "__main__":
    main()
