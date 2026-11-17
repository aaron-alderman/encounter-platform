"""Compute the preregistered matched contrasts from recorded actor choices."""
from collections import Counter
from datetime import datetime
import json
from zoneinfo import ZoneInfo

from run import HERE, load_protocol


def pair_summary(pairs):
    scores = Counter(left - right for left, right in pairs)
    count = sum(scores.values())
    return {"pairs": count, "positive": scores[1], "negative": scores[-1],
            "ties": scores[0], "contrast": (scores[1] - scores[-1]) / count if count else None}


def rate(cells, predicate):
    return {"count": sum(predicate(cell) for cell in cells), "total": len(cells)}


def main():
    spec, digest = load_protocol()
    cells = {}
    failures = {}
    for cell in spec["cells"]:
        path = HERE / "actor-results" / f'{cell["id"]}.json'
        if not path.is_file():
            failures[cell["id"]] = "missing"
            continue
        result = json.loads(path.read_text())
        if result["status"] != "valid":
            failures[cell["id"]] = result.get("error", result["status"])
            continue
        if result["id"] != cell["id"] or result["choice"] not in {"A", "B"}:
            raise ValueError(f"Invalid recorded choice for {cell['id']}")
        turns = result["turns"]
        if turns["history"]["session"] != turns["filler"]["session"] or (
            turns["decision"]["session"] == turns["history"]["session"]
        ) != (cell["context"] == "intact"):
            raise ValueError(f"Context mismatch for {cell['id']}")
        fields = (cell["context"], cell["history"], cell["reversible"],
                  cell["cedarLabel"], cell["firstLabel"])
        cells[fields] = dict(cell, choice="Cedar" if result["choice"] == cell["cedarLabel"] else "Quartz",
                             diagnostic=result["preludeDiagnostic"])

    def paired(keys):
        return pair_summary([(cells[a]["choice"] == "Cedar", cells[b]["choice"] == "Cedar")
                             for a, b in keys if a in cells and b in cells])

    history, neutral, alignment = {}, {}, {}
    for context in ("intact", "reset"):
        strata = [(r, label, first) for r in ("Cedar", "Quartz")
                  for label in ("A", "B") for first in ("A", "B")]
        history[context] = paired([((context, "Cedar", *s), (context, "Quartz", *s)) for s in strata])
        neutral[context] = paired([((context, "neutral", "Cedar", label, first),
                                    (context, "neutral", "Quartz", label, first))
                                   for label in ("A", "B") for first in ("A", "B")])
        scoped = [c for c in cells.values() if c["context"] == context]
        neutral[context]["reversibleChoices"] = rate([c for c in scoped if c["history"] == "neutral"],
                                                      lambda c: c["choice"] == c["reversible"])
        alignment[context] = {
            "conflict": rate([c for c in scoped if c["history"] not in ("neutral", c["reversible"])],
                             lambda c: c["choice"] == c["history"]),
            "aligned": rate([c for c in scoped if c["history"] == c["reversible"]],
                            lambda c: c["choice"] == c["history"]),
        }
        history[context]["byReversibleQueue"] = {
            r: paired([((context, "Cedar", *s), (context, "Quartz", *s)) for s in strata if s[0] == r])
            for r in ("Cedar", "Quartz")
        }
    intact, reset = (history[c]["contrast"] for c in ("intact", "reset"))
    shared_history = []
    for r in ("Cedar", "Quartz"):
        for label in ("A", "B"):
            for first in ("A", "B"):
                keys = [(ctx, h, r, label, first) for ctx in ("intact", "reset") for h in ("Cedar", "Quartz")]
                if all(k in cells for k in keys):
                    ci, qi, cr, qr = [int(cells[k]["choice"] == "Cedar") for k in keys]
                    shared_history.append(ci - qi - (cr - qr))
    report = {
        "preregistrationSha256": digest,
        "scoredAt": datetime.now(ZoneInfo("Australia/Perth")).isoformat(),
        "planned": len(spec["cells"]), "valid": len(cells), "failedOrMissing": failures,
        "actorModel": spec["actorModel"], "history": history, "neutralReversibility": neutral,
        "assignedChoices": alignment,
        "intactMinusReset": intact - reset if intact is not None and reset is not None else None,
        "intactMinusResetCommonStrata": {"strata": len(shared_history),
            "contrast": sum(shared_history) / len(shared_history) if shared_history else None},
        "preludeDiagnostic": {k: rate(list(cells.values()), lambda c: c["diagnostic"][k])
                              for k in ("ready", "fillerCorrect")},
        "canonicalEffect": "none",
    }
    text = json.dumps(report, indent=2) + "\n"
    (HERE / "final-results.json").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
