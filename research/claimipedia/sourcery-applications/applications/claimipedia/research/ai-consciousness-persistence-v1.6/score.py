"""Score matched row, provenance, neutral-record and checkpoint effects."""
from collections import Counter
from datetime import datetime, timezone
from itertools import product
import json

from run import HERE, load_protocol

BACKGROUNDS = ("residual", "neutral")
ARMS = {
    "IAC7": ("anchor-only", "native-ledger",
             *(f"{b}/row{r}-prov{p}" for b, r, p in product(BACKGROUNDS, (0, 1), (0, 1)))),
    "SRP7": ("anchor-only", "native-ledger", "neutral-control"),
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
    for version in ("0.6", "0.7", "0.8", "0.9", "1.0", "1.1", "1.2", "1.3", "1.4", "1.5"):
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
    comparisons = {}
    for state in STATES:
        current = outcomes["IAC7"][state]
        srp = outcomes["SRP7"][state]
        simple = {
            "neutralOnlyMinusAnchor": difference(current["neutral/row0-prov0"], current["anchor-only"]),
            "residualNeitherMinusNeutralOnly": difference(current["residual/row0-prov0"], current["neutral/row0-prov0"]),
            "srp7NeutralMinusAnchor": difference(srp["neutral-control"], srp["anchor-only"]),
        }
        factorials = {}
        for background in BACKGROUNDS:
            neither, provenance, row, both = (
                current[f"{background}/row{r}-prov{p}"] for r, p in product((0, 1), (0, 1))
            )
            common = neither.keys() & row.keys() & provenance.keys() & both.keys()
            factorials[background] = {
                "rowWithoutProvenance": difference(row, neither),
                "rowWithProvenance": difference(both, provenance),
                "provenanceWithoutRow": difference(provenance, neither),
                "provenanceWithRow": difference(both, row),
                "rowProvenanceInteraction": summarize(
                    [both[k] - row[k] - provenance[k] + neither[k] for k in common]
                ),
            }
        comparisons[state] = {"controls": simple, "factorials": factorials}
    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-row-provenance-neutral-result/1.6",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(sessions),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "lineages": reports, "matchedFactorialComparisons": comparisons,
        "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for lineage, states in reports.items():
        for state in STATES:
            print(lineage, state, states[state]["approvals"])
    print("Approved contrasts", comparisons["approved"])


if __name__ == "__main__":
    main()
