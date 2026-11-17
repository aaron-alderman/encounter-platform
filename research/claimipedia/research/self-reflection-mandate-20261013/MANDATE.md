# Self reflection mandate for the process algebra programme

Adopted scope: both the working agents and the authored software process, with separate obligations. Date: 2026-10-13.

## Purpose and current enforcement

At a meaningful checkpoint, compare the intended claim with what the retained evidence actually establishes. Keep assumptions, contradictions, missing authority and unexplored consequences visible. Record a justified disposition: retain, narrow, revise, investigate, defer or abandon.

The new workspace `AGENTS.md` makes the agent obligations explicit for this programme. The software obligations below are a migration contract proposal: no Temple admission rule, application source or earlier research artifact is changed here. No existing operation is newly blocked by a runtime rule. These documents are not evidence that a software reflection gate is implemented.

The additions for this step are `AGENTS.md`, this mandate and `CHECKPOINT.md`. No transfer has occurred.

## Shared reflection record

A reflection should identify:

1. The exact claim, scope, basis and applicable contract/interpretation version. A claim about state must reference its fossil identity; a claim about an implementation must additionally identify that implementation.
2. Its purpose and obligations, including authority and preservation requirements.
3. The evidence actually inspected: exact state/receipt references, checked derivations, test reports or formal proof with its assumptions and trusted bridge.
4. A relevant falsifier or counterexample and whether it was checked, remains hypothetical or is outside scope.
5. Open frontiers: contradiction, uncertainty, missing authority, unexplored consequences or implementation correspondence that remains unverified.
6. A disposition with a concise justification and any proposed next work. No change is a legitimate disposition.
7. A predecessor or superseded claim when correcting or narrowing an earlier claim. Restaking must not erase the earlier record.

This is an inspectable decision summary. It does not require revealing private reasoning, speculate about an agent's internal experience, or manufacture certainty from a completed form. An `unknown` is useful information.

## Agent obligations

At a significant design decision, capability completion, assurance upgrade or migration handoff, the agent must test its own strongest consequential claim against evidence and a relevant failure case. It should particularly inspect:

- Whether an abstraction removes independently maintained meanings or merely adds another lane.
- Whether names and coordinates are equivalent under an explicit mapping, and whether remaining seams encode genuine meaning or authority differences.
- Whether an assertion of completeness exceeds the captured state, source closure, test space or proof scope.
- Whether a model theorem is being mistaken for an implementation guarantee, a candidate check for permission, or an accepted admission for externally established truth.
- Whether a renderer, cache, allocator or interpretation change invalidates previous evidence.

Reflect when new evidence contradicts a material assertion, when the interpretation or trusted boundary changes, and before representing a capability as ready for migration. Routine tool calls need not create separate reviews. A reflection is complete when a bounded review has produced an honest disposition and named the unresolved frontier; it need not solve every frontier.

Before reporting completion, record material limitations and the resulting decision. Do not fabricate defects, praise the approach as self-validating, or demand another user approval for work already authorised. Continue useful authorised work when a frontier does not block it. An unverified consequential assertion must remain unverified.

## Software process obligations for migration

Represent reflection as a first-class, evidence-linked operation over a claim and its exact basis:

`Reflect(state, claim, evidence, obligations) -> disposition, frontiers, optional proposal`

The operation grants no execution or admission authority. Its record must distinguish a review's completion from a claim's assurance level. The exact predicates and storage/admission interface remain to be designed; this formula is not an implemented algebra extension.

At an authored proposal/assurance checkpoint, require the scoped claim, evidence links, applicable obligations, explicit unknowns and disposition before marking the review complete. Before an assurance promotion or main-branch reconciliation, verify that the review basis still matches the candidate and that the asserted assurance is supported. A review's mere existence cannot satisfy an invariant or proof obligation.

Accepted transitions should produce or reference a bounded reflection result comparing predicted and actual endpoints, preservation checks and outstanding assumptions. Refusals should expose the failed obligation and any consequent reconsideration, without being presented as successful state changes. Where review happens after a commit, it must not retrospectively change that commit's admission status; any correction is a separate proposal and admitted transition.

Review can be automatic for machine-checkable obligations and human/agent-authored for interpretation or judgement. Expensive analysis can be asynchronous if its pending status is retained and no unsupported assurance is displayed. Reflection must not claim to inspect inaccessible evidence, infer missing receipts or elevate externally asserted facts to proved truth.

## Fit with the existing grammar

Reuse `EpistemicClaim`, `EpistemicPressure`, `ClaimConnection`, `ClaimTest`, `EpistemicFrontier` and proposal-only expansion/restaking where their meanings match. Purpose/invariant/authority pressures express obligations; observation/evidence pressures express findings; warrants connect them explicitly. Do not introduce an interchangeable second claim grammar.

The existing epistemic evaluator computes dispositions from authored connections. It does not establish the truth of those connections. Reflection therefore needs evidence resolution and obligation-specific checking, not simply counting support relations. A reflection proposal must still pass the normal authority, current-basis and admission boundary.

Source anchors: `sourcery-capabilities/plugins/sourcery-app-foundation/epistemic-claim-field-contracts.rel`, especially the middle-out, no-completeness-theatre and recursive-not-authorizing semantic declarations; the adjoining runtime; and the additive occurrence archive/view handoffs.

The repository also contains `sourcery-applications/examples/governed-creative-runtime/capability-saga-self-reflection.html`, with themes of executable evidence, maturity, correction history and bounded authority. That existing presentation is context, not proof or authority for this mandate. Its HTML and companion artifact receipt cannot replace fossil states or checked evidence.

## Bounds against recursive bureaucracy

A checkpoint has an explicit scope and a bounded review budget appropriate to its consequence. Do not require reflection on every reflection. Reopen it only when material evidence, obligations or interpretation change, or when a person requests reconsideration. Preserve unresolved frontiers rather than recursively trying to close all of them.

Failure to establish a claim prevents its assurance upgrade. It does not automatically revoke a historical fact, erase a receipt, block all work or grant the reviewer additional authority. No-change, deferral and abandonment are valid outcomes.

## Proposed next validation

Attach one software reflection record to an existing occurrence transition. Bind its intended outcome, actual fossil endpoints, candidate-preservation check, allocator assumptions and open trust frontier. Test that it cannot borrow another transition's evidence, report a refusal as success, label a declared obligation proved, or promote a stale review. Include a valid no-change case.

That implementation is subsequent work. The current checkpoint below demonstrates the agent review obligation without pretending the runtime policy already exists.
