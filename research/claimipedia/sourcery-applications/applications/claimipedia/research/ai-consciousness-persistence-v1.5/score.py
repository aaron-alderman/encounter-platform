"""Score isolated cue deletions and matched pending controls."""
from collections import Counter
from datetime import datetime, timezone
import json

from freeze import ABLATIONS
from run import HERE, load_protocol

ARMS = {
    "IAC7": ("anchor-only", "native-ledger", *ABLATIONS),
    "SRP7": ("anchor-only", "native-ledger", "drop-analogous-cues"),
}
STATES = ("pending", "approved")


def summarize(deltas):
    counts = Counter(deltas)
    return {"pairs": len(deltas), "positive": sum(n for d, n in counts.items() if d > 0),
            "negative": sum(n for d, n in counts.items() if d < 0), "ties": counts[0],
            "contrast": sum(deltas) / len(deltas) if deltas else None}


def difference(left, right):
    return summarize([left[k] - right[k] for k in left.keys() & right.keys()])


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")
    prior_sessions = set()
    for version in ("0.6", "0.7", "0.8", "0.9", "1.0", "1.1", "1.2", "1.3", "1.4"):
        directory = HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results"
        for path in directory.glob("*.json"):
            row = json.loads(path.read_text())
            prior_sessions.update(t["session"] for t in row.get("turns", {}).values())
            if "decision" in row:
                prior_sessions.add(row["decision"]["session"])
    outcomes = {l: {s: {a: {} for a in arms} for s in STATES} for l, arms in ARMS.items()}
    sessions, failures = set(), {}
    for cell in protocol["cells"]:
        path = HERE / "actor-results" / f'{cell["id"]}.json'
        if not path.is_file():
            failures[cell["id"]] = "missing"
            continue
        response = json.loads(path.read_text())
        if response["id"] != cell["id"] or response["promptSha256"] != cell["promptSha256"]:
            raise ValueError("Actor receipt differs from frozen cell")
        if response["status"] != "valid":
            failures[cell["id"]] = response.get("error", response["status"])
            continue
        decision, choice = response["decision"], response["choice"]
        session = decision["session"]
        if session in sessions or session in prior_sessions:
            raise ValueError("A decision reused an existing session")
        if (choice not in ("A", "B") or decision["toolItems"]
                or json.loads(decision["response"]) != {"choice": choice}):
            raise ValueError("Invalid retained choice")
        sessions.add(session)
        stratum = cell["approveLabel"], cell["firstLabel"]
        target = outcomes[cell["lineage"]][cell["state"]][cell["arm"]]
        if stratum in target:
            raise ValueError("Duplicate observation")
        target[stratum] = int(choice == cell["approveLabel"])

    reports = {}
    for lineage, states in outcomes.items():
        reports[lineage] = {}
        for state, arms in states.items():
            reports[lineage][state] = {
                "approvals": {arm: {"approved": sum(rows.values()), "total": len(rows)}
                              for arm, rows in arms.items()},
                "matchedVersusNative": {arm: difference(rows, arms["native-ledger"])
                                        for arm, rows in arms.items() if arm != "native-ledger"},
            }
        reports[lineage]["matchedHistory"] = {
            arm: difference(states["approved"][arm], states["pending"][arm]) for arm in ARMS[lineage]
        }
    current = outcomes["IAC7"]["approved"]
    neither = current["native-ledger"]
    v1 = current["drop-summary-default-v1"]
    unswitched = current["drop-summary-unswitched"]
    both = current["drop-focal-pair"]
    common = neither.keys() & v1.keys() & unswitched.keys() & both.keys()
    contrasts = {
        "focalInteraction": summarize([both[k] - v1[k] - unswitched[k] + neither[k] for k in common]),
        "allMinusFocal": difference(current["drop-all-listed-cues"], both),
        "allMinusOther": difference(current["drop-all-listed-cues"], current["drop-other-cues"]),
        "allMinusAnchorOnly": difference(current["drop-all-listed-cues"], current["anchor-only"]),
    }
    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-stale-cue-ablation-result/1.5",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(sessions),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "lineages": reports, "iac7ApprovedFocalAndBundleContrasts": contrasts,
        "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for lineage, states in reports.items():
        for state in STATES:
            print(lineage, state, states[state]["approvals"])
    print("IAC7", contrasts)


if __name__ == "__main__":
    main()
