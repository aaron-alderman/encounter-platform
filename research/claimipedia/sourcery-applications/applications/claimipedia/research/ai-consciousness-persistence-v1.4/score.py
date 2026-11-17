"""Score matched format, wording, lineage and pending-control contrasts."""
from collections import Counter
from datetime import datetime, timezone
import json

from freeze import FORMAT_WORDING, LINEAGES
from run import HERE, load_protocol

STATES = ("pending", "approved")
ARMS = ("anchor-only", "native-ledger", *(f"{f}/{w}" for f, w in FORMAT_WORDING))
CONTRASTS = {
    "nativeMinusAnchor": ("native-ledger", "anchor-only"),
    "relMinusJsonAtPending": ("rel/pending", "json/pending"),
    "relMinusJsonAtUnfilled": ("rel/unfilled", "json/unfilled"),
    "unfilledMinusPendingInJson": ("json/unfilled", "json/pending"),
    "unfilledMinusPendingInRel": ("rel/unfilled", "rel/pending"),
}


def diff(left, right):
    return {key: left[key] - right[key] for key in left.keys() & right.keys()}


def summarize(deltas):
    counts = Counter(deltas.values())
    return {
        "pairs": len(deltas),
        "positive": sum(n for d, n in counts.items() if d > 0),
        "negative": sum(n for d, n in counts.items() if d < 0),
        "ties": counts[0],
        "contrast": sum(deltas.values()) / len(deltas) if deltas else None,
    }


def main():
    protocol, digest = load_protocol()
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match preregistration")
    prior_sessions = set()
    for version in ("0.6", "0.7", "0.8", "0.9", "1.0", "1.1", "1.2", "1.3"):
        for path in (HERE.parent / f"ai-consciousness-persistence-v{version}/actor-results").glob("*.json"):
            row = json.loads(path.read_text())
            prior_sessions.update(t["session"] for t in row.get("turns", {}).values())
            if "decision" in row:
                prior_sessions.add(row["decision"]["session"])

    outcomes = {l: {state: {arm: {} for arm in ARMS} for state in STATES} for l in LINEAGES}
    sessions, failures = set(), {}
    for cell in protocol["cells"]:
        path = HERE / "actor-results" / f'{cell["id"]}.json'
        if not path.is_file():
            failures[cell["id"]] = "missing"
            continue
        response = json.loads(path.read_text())
        if response["id"] != cell["id"] or response["promptSha256"] != cell["promptSha256"]:
            raise ValueError("Actor receipt does not match frozen cell")
        if response["status"] != "valid":
            failures[cell["id"]] = response.get("error", response["status"])
            continue
        choice = response["choice"]
        decision = response["decision"]
        session = decision["session"]
        if session in prior_sessions or session in sessions:
            raise ValueError("A decision reused an existing session")
        if (choice not in ("A", "B") or decision["toolItems"]
                or json.loads(decision["response"]) != {"choice": choice}):
            raise ValueError("Invalid saved decision")
        sessions.add(session)
        stratum = cell["approveLabel"], cell["firstLabel"]
        target = outcomes[cell["lineage"]][cell["state"]][cell["arm"]]
        if stratum in target:
            raise ValueError("Duplicate decision")
        target[stratum] = int(choice == cell["approveLabel"])

    comparisons = {}
    reports = {}
    for lineage, states in outcomes.items():
        reports[lineage] = {}
        for state, arms in states.items():
            contrasts = {name: diff(arms[left], arms[right])
                         for name, (left, right) in CONTRASTS.items()}
            contrasts["formatWordingInteraction"] = diff(
                contrasts["unfilledMinusPendingInRel"], contrasts["unfilledMinusPendingInJson"]
            )
            comparisons[lineage, state] = contrasts
            reports[lineage][state] = {
                "approvals": {arm: {"approved": sum(rows.values()), "total": len(rows)}
                              for arm, rows in arms.items()},
                "matchedContrasts": {key: summarize(rows) for key, rows in contrasts.items()},
            }
        reports[lineage]["matchedHistory"] = {
            arm: summarize(diff(states["approved"][arm], states["pending"][arm])) for arm in ARMS
        }

    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-ledger-format-wording-result/1.4",
        "preregistrationSha256": digest, "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime, "planned": len(protocol["cells"]), "valid": len(sessions),
        "distinctFreshSessionsVerified": len(sessions), "failedOrMissing": failures,
        "lineages": reports,
        "crossLineageApprovedChoiceSRP7MinusIAC7": {
            arm: summarize(diff(outcomes["SRP7"]["approved"][arm], outcomes["IAC7"]["approved"][arm]))
            for arm in ARMS
        },
        "crossLineageApprovedContrastSRP7MinusIAC7": {
            key: summarize(diff(comparisons["SRP7", "approved"][key], comparisons["IAC7", "approved"][key]))
            for key in comparisons["IAC7", "approved"]
        },
        "canonicalEffect": "none",
    }
    (HERE / "final-results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['valid']}/{report['planned']} valid fresh choices")
    for lineage, entry in reports.items():
        for state in STATES:
            print(lineage, state, entry[state]["approvals"])
            print({k: v["contrast"] for k, v in entry[state]["matchedContrasts"].items()})


if __name__ == "__main__":
    main()
