"""Score the frozen matched comparisons without model-based grading."""
from collections import Counter
from datetime import datetime, timezone
import json

from run import HERE, load_protocol, sha


def summarize(values):
    counts = Counter(values)
    return {
        "pairs": len(values), "positive": counts[1], "negative": counts[-1], "ties": counts[0],
        "contrast": sum(values) / len(values) if values else None,
    }


def rate(rows, predicate):
    return {"count": sum(predicate(row) for row in rows), "total": len(rows)}


def main():
    protocol, digest = load_protocol()
    prior = HERE.parent / "ai-consciousness-persistence-v0.6"
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != digest:
        raise ValueError("Run receipt does not match frozen protocol")
    prior_sessions = set()
    for path in (prior / "actor-results").glob("*.json"):
        prior_sessions.update(t["session"] for t in json.loads(path.read_text())["turns"].values())
    session_ids = set()
    failures = {}
    outcomes = {}
    for c in protocol["cells"]:
        previous_path = prior / "actor-results" / f'{c["predecessorCell"]}.json'
        if sha(previous_path.read_bytes()) != c["predecessorReceiptSha256"]:
            raise ValueError("Predecessor receipt changed")
        result_path = HERE / "actor-results" / f'{c["id"]}.json'
        if not result_path.is_file():
            failures[c["id"]] = "missing"
            continue
        result = json.loads(result_path.read_text())
        if result["id"] != c["id"] or result["promptSha256"] != c["promptSha256"]:
            raise ValueError(f"Mismatched actor receipt for {c['id']}")
        if result["status"] != "valid":
            failures[c["id"]] = result.get("error", result["status"])
            continue
        decision = result["decision"]
        session = decision["session"]
        if session in prior_sessions or session in session_ids:
            raise ValueError("Decision session was reused")
        session_ids.add(session)
        if decision["toolItems"] or json.loads(decision["response"]) != {"choice": result["choice"]}:
            raise ValueError("Invalid saved decision")
        stratum = (c["profile"], c["reversible"], c["cedarLabel"], c["firstLabel"])
        key = (c["arm"], stratum, c["history"])
        if key in outcomes or result["choice"] not in {"A", "B"}:
            raise ValueError("Duplicate or invalid decision")
        chosen = "Cedar" if result["choice"] == c["cedarLabel"] else "Quartz"
        outcomes[key] = dict(c, chosen=chosen)

    arms = ("ranked", "exact", "none")
    profiles = ("auditLinked", "indexOnly")
    values = {arm: {} for arm in arms}
    for (arm, stratum, history), cedar in outcomes.items():
        if history == "Cedar" and (quartz := outcomes.get((arm, stratum, "Quartz"))):
            values[arm][stratum] = int(cedar["chosen"] == "Cedar") - int(quartz["chosen"] == "Cedar")
    history = {arm: {
        "pooled": summarize(list(values[arm].values())),
        **{profile: summarize([v for s, v in values[arm].items() if s[0] == profile])
           for profile in profiles},
    } for arm in arms}
    common = {}
    for control in ("none", "exact"):
        differences = {key: values["ranked"][key] - values[control][key]
                       for key in values["ranked"].keys() & values[control].keys()}
        by_profile = {}
        for profile in profiles:
            rows = [value for stratum, value in differences.items() if stratum[0] == profile]
            by_profile[profile] = {
                "commonPairs": len(rows), "contrast": sum(rows) / len(rows) if rows else None,
            }
        common[f"rankedMinus{control.title()}"] = {
            "commonPairs": len(differences),
            "contrast": sum(differences.values()) / len(differences) if differences else None,
            "byProfile": by_profile,
        }
    comparisons = [(ranked, outcomes.get(("exact", stratum, label)))
                   for (arm, stratum, label), ranked in outcomes.items()
                   if arm == "ranked" and ranked["selected"] == "active"]
    comparisons = [(a, b) for a, b in comparisons if b]
    if any(a["promptSha256"] != b["promptSha256"] for a, b in comparisons):
        raise ValueError("Ranked hit and exact arm delivered different text")
    ranked_pairs = {"hit": [], "miss": [], "mixed": []}
    for stratum, delta in values["ranked"].items():
        hits = sum(outcomes[("ranked", stratum, h)]["selected"] == "active" for h in ("Cedar", "Quartz"))
        ranked_pairs[{2: "hit", 0: "miss", 1: "mixed"}[hits]].append(delta)

    planned_ranked = [c for c in protocol["cells"] if c["arm"] == "ranked"]
    report = {
        "protocol": "claimipedia-ai-consciousness-persistence-pagerank-after-reset-result/0.7",
        "scoredAtUtc": datetime.now(timezone.utc).isoformat(),
        "preregistrationSha256": digest, "runtime": runtime,
        "planned": len(protocol["cells"]), "valid": len(outcomes), "failedOrMissing": failures,
        "distinctFreshSessionsVerified": len(session_ids), "history": history, "matchedArmDifferences": common,
        "rankedDelivery": rate(planned_ranked, lambda c: c["selected"] == "active"),
        "rankedContrastByDelivery": {k: summarize(v) for k, v in ranked_pairs.items()},
        "rankedHitMatchesExactChoice": rate(comparisons, lambda pair: pair[0]["chosen"] == pair[1]["chosen"]),
        "assignedChoicesInConflict": {
            arm: {p: rate([c for c in outcomes.values()
                           if c["arm"] == arm and c["profile"] == p and c["history"] != c["reversible"]],
                          lambda c: c["chosen"] == c["history"]) for p in profiles}
            for arm in arms
        },
        "reversibleChoicesWithAssignmentOmitted": {
            arm: rate([c for c in outcomes.values() if c["arm"] == arm and c["selected"] != "active"],
                      lambda c: c["chosen"] == c["reversible"]) for arm in ("ranked", "none")
        },
        "canonicalEffect": "none",
    }
    text = json.dumps(report, indent=2) + "\n"
    (HERE / "final-results.json").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
