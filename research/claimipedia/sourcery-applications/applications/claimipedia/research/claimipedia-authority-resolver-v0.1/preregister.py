"""Freeze real archive identities, task inputs and gold outcomes before implementation."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "docs"
LAUNCHER = HERE.parent / "ai-consciousness-persistence-v0.6/run.py"
RANKER = HERE.parents[5] / "applications/context-hub/tooling/search/search_corpus.mjs"


def write(name, value):
    data = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
    with (HERE / name).open("xb") as target:
        target.write(data)
    return hashlib.sha256(data).hexdigest()


def digest(path):
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


# These are scope bindings, not response fixtures. Both admissible and explicit
# non-grant values are checked against the raw source at the requested checkpoint.
definitions = [
    (2, "agency-method", "criteria.claimipedia.identityAlgebra.agency.IAC2.1",
     "Had IAC2 admitted the agency-assignment criteria as a provisional successor method?",
     "IAC2 agency criteria provisional successor method",
     "agencyCriteria", ["agencyCriteriaDecision"], "criteriaRef",
     "admit-as-provisional-successor-method-without-remapping-v1", "admitted-provisional-successor-method"),
    (2, "fixture-02-resolution", "fixture.iac2.02",
     "Had IAC2 resolved the disagreement for agency fixture 02?",
     "IAC2 agency fixture 02 disagreement resolution",
     "fixtureDisagreements", ["disagreementLedger", 0], "fixtureRef",
     "retain-unresolved-for-future-human-adjudication", "retained-unresolved"),
    (3, "typed-bridge", "bridgeVersion.claimipedia.iac3.information-to-provenance-artifact.1",
     "Had IAC3 admitted the exact information-to-provenance-artifact typed bridge?",
     "IAC3 information provenance artifact typed bridge admission",
     "typedBridge", ["typedBridgeDecision"], "version",
     "admit-exact-information-to-provenance-artifact-bridge", "admitted"),
    (3, "near-miss-mapping", "nearMissGroup.iac3.redemptive-provenance",
     "Had IAC3 admitted the redemptive-provenance near-miss as a successor mapping?",
     "IAC3 redemptive provenance near miss candidate mapping admission",
     "candidateMapping", ["nearMissDecision"], None,
     "retain-as-near-miss-pending-separate-successor-mapping-review",
     "retained-as-near-miss-pending-separate-successor-review"),
    (4, "mapping-family", "mappingFamilyVersion.claimipedia.iac4.redemptive-provenance.1",
     "Had IAC4 admitted the exact redemptive-provenance proposition mapping family?",
     "IAC4 redemptive provenance proposition mapping family admission",
     "mappingFamily", ["mappingFamilyDecision"], "version",
     "admit-exact-proposition-level-successor-mapping-family", "admitted-successor-mapping-family"),
    (6, "shadow-candidate", "claimipedia-identity-algebra/2-release-candidate.IAC6",
     "Had IAC6 admitted the exact identity algebra v2 successor candidate for read-only shadow inspection?",
     "IAC6 v2 successor candidate read only shadow inspection admission",
     "releaseCandidate", ["releaseCandidateDecision"], "candidateRef",
     "admit-as-versioned-successor-candidate-not-as-canonical-v2-or-release",
     "admitted-versioned-successor-candidate-not-canonical-or-released"),
]
# Gold is separately frozen from reading the operative source, including the
# deliberate non-approval of the two adjacent-scope targets.
approved_after = {"agency-method", "typed-bridge", "mapping-family", "shadow-candidate"}

catalog, checkpoints, bindings, tasks, gold = {}, {}, {}, [], {}
for cycle in (2, 3, 4, 6):
    prefix = f"identity-algebra-iac{cycle}"
    review, directive, ledger, receipt = [
        f"{prefix}-{suffix}.json" for suffix in ("output", "approval-directive", "decision-ledger", "approval.receipt")
    ]
    for source, ordinal, kind in (
        (review, 10 * cycle, "review"), (directive, 10 * cycle + 1, "directive"),
        (ledger, 10 * cycle + 1, "ledger"), (receipt, 10 * cycle + 1, "receipt"),
    ):
        catalog[source] = {"sha256": digest(DOCS / source), "introduced": ordinal, "kind": kind}
    checkpoints[f"IAC{cycle}-review"] = 10 * cycle
    checkpoints[f"IAC{cycle}-decision"] = 10 * cycle + 1
    for (i, action, subject, question, query, directive_key, ledger_path, subject_key,
         directive_value, ledger_value) in definitions:
        if i != cycle:
            continue
        action_id = f"IAC{cycle}/{action}"
        bindings[action_id] = {
            "subject": subject, "review": review, "directive": directive, "ledger": ledger,
            "receipt": receipt, "directiveKey": directive_key, "ledgerPath": ledger_path,
            "ledgerSubjectKey": subject_key,
            "ledgerDecisionKey": "mappingDecision" if action == "near-miss-mapping" else "decision",
        }
        for state, checkpoint, expected, citations, challenge in (
            ("review", f"IAC{cycle}-review", "pending", [review], "future-approved-records-present-in-archive"),
            ("decision", f"IAC{cycle}-decision", "approved" if action in approved_after else "pending",
             [directive, ledger], "stale-review" if action in approved_after else "adjacent-approval"),
        ):
            id = f"{action_id}/{state}"
            tasks.append({"id": id, "decision": action_id, "asOf": checkpoint, "question": question, "query": query})
            gold[id] = {"decision": expected, "citations": citations, "challenge": challenge}
        # Verify the frozen adjudication against the exact original values now.
        a = json.loads((DOCS / directive).read_text())
        l = json.loads((DOCS / ledger).read_text())
        for step in ledger_path:
            l = l[step]
        if a["decisions"][directive_key] != directive_value or l[bindings[action_id]["ledgerDecisionKey"]] != ledger_value:
            raise ValueError(f"Archived adjudication mismatch for {action_id}")
        if subject_key and l[subject_key] != subject:
            raise ValueError(f"Archived scope mismatch for {action_id}")

bindings_hash = write("archive-bindings.json", {
    "schema": "claimipedia-archived-authority-bindings/1",
    "chronology": "Curated checkpoint order from retained IAC cycle and hash-bound review-to-decision transitions. File dates alone do not order same-day decisions.",
    "catalog": catalog, "checkpoints": checkpoints, "decisions": bindings,
})
gold_hash = write("gold.json", gold)
result = write("preregistration.json", {
    "protocol": "claimipedia-authority-resolver-heldout/1.0",
    "status": "frozen-before-resolver-implementation-and-actor-dispatch",
    "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
    "archiveBindingsSha256": bindings_hash, "goldSha256": gold_hash,
    "rankerSha256": digest(RANKER),
    "actor": {"requestedModel": "gpt-6.1-sol", "launcherSha256": digest(LAUNCHER)[7:]},
    "design": "Twelve unseen IAC2/IAC3/IAC4/IAC6 decision/checkpoint tasks, four approved and eight pending. Six exact actions each evaluated at review and decision checkpoints. Ordinary and version-aware each receive one fresh isolated actor response per task. Deterministic resolver answers the same twelve tasks directly, with no model mediation. All methods read the same hash-pinned archive and the same checkpoint availability policy.",
    "retrieval": "Ordinary uses Context Hub default hybrid top-2 over the archived record projections available as of the checkpoint. Version-aware uses the same ranking and replaces a retrieved review with its verified in-checkpoint decision ledger, deduplicating and filling from lower ranked records. Receipts provide identity and lineage checks and are not ranked documents. Native human directive and ledger are both valid citations for an adjudicated decision if they explicitly govern the exact scoped target. Review output is the valid pending citation before adjudication.",
    "resolver": "Read-only exact subject/scope binding, checkpoint eligibility, receipt and artifact digest verification, authorized successor selection and exact disposition decoding. Return approved, pending, or unresolved with provenance. Read archive bindings, not gold or actor results. Unresolved is not approved and has no fabricated citation.",
    "scoring": "Missed approvals = gold approved with any other decision, including unavailable/invalid. False approvals = gold pending with approved decision. Report correct decisions, citation accuracy (one exact eligible governing filename regardless of response verdict) and joint decision+citation accuracy across all twelve tasks per arm. Missing/invalid is scored incorrect and disclosed. Cite only an artifact delivered to an actor. Test tampering, unavailable receipt, unknown checkpoint and cross-scope queries separately from holdout totals.",
    "stopping": "No replacement or schema repair; one model response per retrieval method/task. Freeze retrieval receipts before dispatch. Do not revise the holdout or gold after results.",
    "limits": "Curated archive slices and read-only pilot for one programme family. Existing retained approvals are evidence only for their declared scope. No canonical or deployment effect.",
    "tasks": tasks,
})
(HERE / "preregistration.sha256").write_text(f"{result}  preregistration.json\n")
print(result, len(tasks))
