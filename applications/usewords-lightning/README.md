# Usewords — for what matters

Usewords is a collaborative workbench for giving structure to what matters.
AI helps people articulate, explore and work with a matter; resolution is one
possible outcome. A clearer question, an acknowledged uncertainty, a faithful
disagreement or an informed decision to leave something open can also be useful
outcomes.

## Philosophical spine

**“What's the matter?”** is the opening invitation. A matter can be something
someone cares about, is creating, is trying to understand, or is seeking to
resolve. Matters can begin privately and develop through collaboration. They
need not begin as problems with predetermined answers.

**People supply the purpose.** Participants articulate what matters and to whom,
including differences in priorities, values and interests. AI can ask questions,
suggest distinctions and expose omissions. Its framing remains a proposal that
people can inspect, contest and change.

**Structure is provisional and expressive.** Participants can develop the
vocabulary, relationships, representations and processes their matter needs.
Encounters, journeys, negotiations and disagreement packets are possible
languages of expression. A useful structure preserves meaningful differences
and can evolve when those differences exceed its current vocabulary.

**AI helps make possibilities intelligible.** It can organise contributions,
connect evidence, expose assumptions, propose alternatives, simulate scenarios
and help draft resolutions. Participants must be able to distinguish their own
words, AI suggestions, source material and accepted contributions. Uncertainty
and missing evidence remain visible.

**Agreement and disagreement both deserve faithful representation.** Confirming
that a position has been represented accurately is distinct from endorsing its
claims. Acknowledging a contribution, agreeing on a fact, approving a term and
authorising an action are distinct commitments. The product must not collapse
them into a single ambiguous acceptance. These richer distinctions are product
requirements; the current prototype's proposal acceptance is a narrower local
editing protocol.

**Participation preserves agency and boundaries.** Private exploration, a party's
internal work and shared contributions have different scopes. Disclosure,
acceptance and external actions require explicit authority. AI assistance does
not itself grant access, consent or authority, and silence is not agreement.
The current persona simulation does not implement protected private spaces.

**Scenarios explore consequences under assumptions.** A counterfactual identifies
its baseline, changed assumptions, model and uncertainties. Its results remain
separate from the actual matter until an explicit authorised action incorporates
them. Reproducing a calculation establishes how it was obtained, not that its
assumptions are true.

**The process algebra makes consequences inspectable.** Definitions, proposals,
reviews and actions should have explicit meanings, scopes and histories. People
should be able to ask where a claim came from, what an edit changes, who accepted
which commitment and which alternatives remain open. Executable consistency and
replay are engineering properties; they do not by themselves establish truth,
fairness, consensus or a just outcome.

Resolution may take the form of agreement, a decision by a designated authority,
or a useful next step. A matter can also remain unresolved with its disagreements
better understood. Usewords should support these outcomes without pressuring
participants toward artificial closure.

The product test for a new feature is: **Does this help people understand and
work with what matters, while preserving their ability to question its framing,
control their contributions and choose what follows?**

## Current implementation

The app opens with **What's the matter?** Create a local matter in your own words, develop issues and positions, and consider possible proposals. AI framing enters through an explicit BYO-agent handoff and the same reviewable proposal protocol as participant framing. Encounter, journey and language tools remain available under **Review changes, encounters and language definitions**. No deployment work is included.

Requires Node.js 22 or later, with no package installation.

```sh
npm run build
npm test
npm run dev
```

The test scenarios and assertions are in `tests/*.encounter`. The test runner uses
the sibling Encounter checkout for compilation and admission. Its native adapter
supplies the application runtime, simulated browser and storage effects, and
local build, compiler, CLI and model fixtures. Use `npm test -- platform` to run
just the platform suite.

`source/owners/bootstrap.encounter` declares the publication inputs, preview
settings and shared source aliases. The optional local Ollama CLI runs its
validation, request and receipt policy in `source/owners/local-model.encounter`
with a separate data-only grant set. Node supplies the compiler, files, process
I/O and loopback HTTP. The private preview keeps its existing service launch path.

Open http://127.0.0.1:4197/. `USEWORDS_PORT` changes the port.

Live Temple persistence and publication are not connected yet. The inspected
platform exposes captured application reads without Usewords mutation authority.
The inactive, process-owned service candidate and exact receiver requirements
are documented in [platform/README.md](platform/README.md).

## Start with a matter

1. Give the matter a name and describe what matters in your own words, or use **Try an example**. Creation preserves that narrative as the starting framing and keeps the matter open.
2. Open **Let AI help structure this matter** and choose **Prepare an AI brief**. Inspect the exact context before sharing it with your agent. Only the selected matter's narrative, incorporated structure and recorded management context enter the public brief; unrelated encounters, other matters and form drafts are excluded.
3. Give the brief to an AI and paste its JSON response into **Agent response JSON**. **Check suggestions** validates the exact brief, source snapshot, matter identity, closed response fields, bounded text, unique identifiers and issue references. Nothing is automatically incorporated.
4. Select a suggestion and **Propose selected framing**. Incorporate its linked issue before proposing a position or approach about it. Alice and Bob can independently review and accept the structural change; Casey remains an observer. **Add your own framing** uses the same protocol.
5. Read the result under **Issues**, **Positions** and **Possible proposals**. Incorporation means accepting inclusion in the structure. Positions remain unconfirmed; approaches remain unaccepted as actions. These operations do not settle the matter or assert anyone's consent.
6. Switch between local matters, reload to replay saved work, or export the current matter with its proposal history. Import a history into the local list only if its identifier is absent. Existing matter histories are never replaced by import.

Matter creation uses the host's parameterless nonce effect to allocate a local identifier. The effect receives no matter content and grants no storage or network authority. Exchange history files between browsers running the same pinned release so each browser can replay the exact history.

The AI mode is **bring your own agent**, using a copy/paste brief and response or the local agent bridge. An opt-in shell runner can call one of two configured local Ollama models. The browser sends no matter text to a model by itself. The browser demonstration used actual suggestions generated by the assistant in this chat; automated tests use explicitly synthetic agent fixtures. Provider labels and browser-local run records carry no authenticated model provenance.

Each matter has its own version-bound board and checked AI draft in browser storage. Changing matters clears unsubmitted context-specific form text and restores only that matter's checked AI response. Unchecked response text and unsent review/form text are not durable drafts. This separation is a local product boundary, not authenticated confidentiality or a protected multiuser workspace. Source/runtime changes require a new version or explicit migration; old version keys are retained.

An incoming response to a stale brief refuses. Previously checked suggestions may be explicitly reconsidered against the current matter, with their original brief/source references visible and a fresh change proposal and review required. AI text is treated as data; it cannot invoke effects, add executable callbacks or set a matter to resolved. Replay reproduces the recorded contributions and decisions; it does not rerun or establish the correctness of model reasoning.

This first profile supports six local matters, twelve change proposals / 48 events per matter, up to 12 incorporated items in a source baseline, and up to six suggestions per AI response. The existing text, source-size and 20,000,000-step execution limits remain. Matter creation and record validation are fixed language constructs; the editable Encounter construct language remains available separately. Narrative revisions, counterfactual execution, authentication and network collaboration remain future work.

## Manage a matter over time

**My matters** is a local register with active, concluded, archived and pending-attention views. Its navigation summaries are caches, not authority; opening a matter replays the exact board. The selected matter overview shows purpose, scope, participants and capacities, lifecycle, response requests, declared relationships and activity.

Open **Manage this matter** to propose purpose/scope, participant capacities, a lifecycle transition, a response request, an answer or withdrawal, or a relationship. Each uses the same exact proposal, independent review, acceptance and replay protocol as encounter and language changes. A coordinator proposes management changes; only an assigned participant can propose their response. This local profile keeps three simulated personas, two contributors and at least one coordinator. Casey cannot be elevated beyond the pinned observer capability. These are local process rules, not authentication or protected permissions.

Lifecycle states are active (stored as `open`), waiting, paused, concluded and archived. Every transition requires a reason. Conclusion records agreement, disagreement, withdrawal or stopping; it does not attest consent or settle an issue. Archive follows conclusion and preserves its kind. Reopening clears the current conclusion label while retaining the entire history. Concluded/archived matters refuse new content and other management work until reopened.

Requests are open, answered or withdrawn. Recording an answer does not verify its claims. **Needs your attention** derives assigned requests, unreviewed current proposals and stale proposals from the current replayed board and selected persona. Related, part-of and depends-on links are one-way declared references: they do not mutate targets, confer access or prove a dependency; targets may be unavailable locally. This is not a global dependency graph or cycle checker.

The closed language is authored in the shared [matter management modules](../encounter-libraries/workflows/) (`mm.initial/get/validate/authority/apply/summary/overview` and the corresponding UI processes). Changes use `{kind: "matter-manage", matterId, operation, payload, baseRevision}` inside `collaboration-command`; operations are `orient`, `participant`, `transition`, `request`, `respond`, `withdraw`, `link` and `unlink`. `matter-overview` takes a simulated actor and returns its derived view. No native ports or grants were added; existing Encounter field edits still use retained `ec.patch`.

This bounded profile supports six matters, twelve proposals/48 events per board, six response requests and six links per matter, with the unchanged 16-operation material segment and 20,000,000-step budget. Cache failures do not undo a durable board; reopening attempts to refresh its register summary. Unsent management form drafts clear when switching matters. Older version-bound records remain stored under their own runtime keys; no silent history migration occurs.

Current evidence is in `verification/management-checks.json`. The browser histories include a concluded disagreement and the later reopened matter. Earlier `matter-checks.json` evidence remains bound to its predecessor runtime.

## Prepare separately, share deliberately, preserve disagreement

The current two-party workflow is an executable **local simulation**, not live authenticated collaboration. The connected Temple worker still has no Usewords application write/session receiver. No application generation was activated, endpoint deployed or platform workspace substituted for product persistence. See `platform/party-live-observation.json` and `platform/party-receiver-contract.json`.

1. Open **Prepare separately, then choose what to share**. Save a draft under the selected persona. Its preparation note stays outside shared state, AI briefs and packets. Switching persona/matter clears unsent forms and loads only the selected preparation room; drafts can be reloaded after restart.
2. Select a saved draft and **Preview exactly what I will share**. The exact item and attribution are visible. **Share this preview as a proposal** refuses without a matching preview, or after selection, preparation revision or accepted material changes. Independent review and acceptance incorporate a copied contribution; later preparation edits never rewrite an existing shared proposal.
3. Use **My position, agreement and acceptance of the record** to make an explicit personal statement: record accuracy, a position representing you, agreement to a possible proposal, or a dispute. Only the selected actor speaks; origin impersonation and withdrawal by another actor refuse. Statements bind exact target hashes. A changed record makes earlier record-accuracy statements non-current; withdrawals and earlier statements remain in history. Inclusion/review approval never creates these personal commitments automatically.
4. Both parties can accept the accuracy of a record containing their disagreement. This does not make opposing claims true, resolve an issue, agree to a possible proposal, establish real identity or execute an external agreement.
5. **Inspect and export a matter packet** reproduces shared history and includes the matter, unresolved questions, recorded evidence requests/responses, proposal dispositions, personal statements, disputes and exact history. Download JSON for replay or readable HTML with escaped text and embedded JSON. Preparation notes and rooms are excluded. Evidence needs are recorded questions and unverified answers, not an assessment of evidentiary sufficiency.

The browser demonstration has an open issue, contrasting Alice/Bob positions, an unaccepted trial proposal and an outstanding evidence request. Each party identifies their position, disputes the other priority and accepts record accuracy; neither agrees to the trial. Synthetic unshared preparation notes are absent from the exported packet. Evidence is in `verification/party-checks.json`; the downloadable packet is `verification/party-matter-packet.json` and the readable copy is `verification/party-matter-packet.html`.

Party work rules and UI processes use the [shared library](../encounter-libraries/workflows/). The preparation storage operations stay in `source/party-work-ui.encounter`. Shared commands and statements use the same collaboration event history. Six preparation drafts per party, sixteen statements and 48 total shared events are bounded within the unchanged 20,000,000-step budget. Shared and preparation saves detect a previously changed browser-storage head, but read-before-write is not an atomic multiuser transaction. Browser owners can read every local persona's storage.

`platform/parties.encounter#pr.prepare` is a separately compiled, inactive receiver policy. It derives actor from receiver-supplied authenticated membership, separates principal/private and shared slots, prepares exact-head writes, and binds principal-scoped idempotency. Its tests use supplied trusted fixtures. Real identity binding, invitation/revocation, atomic persistence, concurrent transactions, protected private reads and restart durability still need an actual admitted receiver and effect-level qualification. The browser deliberately has no fake login or credential collection.

Verify a packet in a fresh process:

```sh
node bootstrap/cli.cjs matter-packet-check verification/party-matter-packet.json
```

## Try the proposal workbench

1. Select **Alice** under **Act as**, and optionally give the next proposal a title.
2. Use an encounter edit, object, journey or construct form. Every authoring action creates an immutable proposal. The journey previews continue to show accepted material.
3. Select the proposal to inspect its before/proposed values, author, content hash and inverse destination. Definition proposals compare the old and new definitions.
4. Select **Bob**, write a review comment and approve or request changes. Authors cannot review their own proposals. **Casey** is an observer and cannot mutate the board.
5. **Accept selected proposal** requires an independent persona's approval of the exact content, no outstanding request for changes, and the same material head used by the proposal. Rejection closes a proposal without changing material.
6. **Verify history & save** checks the board without accepting open proposals. **Export proposal history** exports proposals, reviews, decisions and their baseline for exact replay. Reload restores the board after replay.

Alice, Bob and Casey are local illustrative personas controlled by the same browser owner. They are not authenticated collaborators. This version has no network synchronisation or protected multiuser authority.

Competing proposals are preserved. Once one changes the accepted head, the other requires resubmission against the current head and a fresh review. This first profile performs no automatic rebase or merge. To amend content after a request for changes, create a new proposal from the current material; the old proposal and discussion remain. A reviewer can explicitly replace their decision; prior decisions remain in proposal activity and event history.

The seed reconstructs the real `place.water` encounter from aaronalderman.com in Listening well and Making with care, with different introductions. It retains two source paragraphs, not the entire original artwork. Earlier fixed demonstrations remain under **Earlier proof**.

## Define a construct

```text
construct Question
field prompt text shared required max 240
field invitation text local optional max 600
heading prompt
paragraph invitation
```

This first language profile supports named constructs, text fields, shared/local ownership, required/optional values, maximum lengths, and heading/paragraph representations. Optional text can be empty. Definitions generate closed REL contracts, facts, Encounter views and context contributions; the retained compiler checks actual instances. Incompatible changes to existing instances refuse before a proposal can be created. Accepted definitions become available as object types; open definition proposals do not. An empty workspace may hold definitions before its first executable instance.

This profile is bounded: 6 constructs, 6 fields per type, 8 objects, 4 journeys, 6 entries per journey, field limits up to 4,000 characters, and 16 operations per acceptance segment. It does not install arbitrary executable callbacks, native effects or unrestricted grammars. Defining richer field types and semantics requires extending the admitted language profile.

## Process ownership

| Concern | Source owner |
| --- | --- |
| Construct grammar, validation, generation, operations, inverse correspondence, replay and acceptance | `source/workspace.encounter` and the shared workspace module |
| Forms, rendering, inspection, persistence, import/export and agent entry | `source/workspace-ui.encounter` and the shared workspace UI module |
| Matter records, validation, scoped AI briefs and response contracts | `source/matters.encounter` |
| Matter UI, local registry and scoped AI draft persistence | `source/matters-ui.encounter` |
| Management language, lifecycle and authority | Shared `matter-management.encounter` |
| Matter register, management forms and attention projection | Shared `matter-management-ui.encounter` |
| Preparation, disclosure, personal statements and packet semantics | Shared `party-work.encounter` |
| Preparation/statement controls and packet import/export | Shared `party-work-ui.encounter` and app-local preparation storage |
| Earlier demonstrations and common rendering/hash processes | `source/usewords.encounter` |
| Initial workspace and imported source provenance | `source/workspace-seed.json`, `source/reference/water.rel` |
| Language catalogue and pinned process frontend | `source/languages.json`, `source/languages/` |
| Shared highlighting and source presentation | `source/presentation/source-algebra.encounter` |
| Page, style, command grammar and execution closure | `source/owners/*.encounter`. The build writes their JSON projections and source maps under `dist/source/`. |
| Retained evaluator, admission, lowering, compiler and inverse semantics | `vendor/worldwright/` |
| Generic loading, browser mechanisms, build and CLI IO | `bootstrap/` |

All nine editable process modules are authored in Encounter and compiled before Temple lowering and admission. `dist/` contains generated JSON, complete source maps and browser artifacts; it is never an authoring input. Vendor files remain pinned. Shared/local edits select exact projections and invoke retained `ec.patch`; regenerated meaning must match that inverse result. There is no independent application patcher.

Code views reuse Worldwright's `sp.present`, lexer and source-role rules through the process algebra. Highlighting is presentation; compilation establishes validity. The kernel budget remains 20,000,000 steps. The generic browser host supplies mechanisms; domain policy and orchestration live in the admitted processes.

## Source, history and acceptance

The [shared workspace modules](../encounter-libraries/workflows/) own the common `cw.*` collaboration and rendering processes. Usewords owns persistence and its local agent entry in `source/workspace-ui.encounter`.

The board starts from an explicit replay-checked workspace baseline. Proposal content is immutable and includes its author, semantic operation, source hash and material revision. Review decisions bind the proposal content hash. Acceptance re-executes the change and checks the exact preview source/projection hashes; the complete board history is then replayed before saving and exposing the accepted head. Checked before/after comparisons are derived during proposal creation and reproduced during replay, rather than recompiling them on every repaint.

The board is bounded to twelve proposals and 48 events, within the unchanged 20,000,000-step budget. The underlying construct/document limits still apply. Source size and execution limits can refuse an oversized action; the previous saved board stays active. There is no destructive board reset button. Use a separate browser profile for a separate local board; import history only into an empty board.

History is stored under `usewords.collaboration.v1.<programHash>`. Every runtime version has a distinct key; older histories are not overwritten or silently reinterpreted. Incomplete construct editor text is stored separately. Source exports contain only current accepted material, excluding open proposals. Source imports establish a new explicit baseline in an empty board. History imports replay the same exact runtime's proposal/review events. Imported source does not import earlier human authority or reviews.

The collaboration receipt binds the exact application/native source closure, baseline receipt, ordered actor operations and final complete board hash. Restore, history import/export and acceptance reproduce the event history. A predecessor hash alone does not reproduce unavailable earlier history. Browser ownership still permits rewriting local data; persona attribution is not an identity signature.

Select a proposal in the workbench and choose **Download visual receipt** for a printable HTML summary with the full collaboration receipt embedded. Open **Inspect proposal data**, an event in the decision trail, or a fingerprint to see its underlying data or what the digest binds. In the matching Usewords build, choose that HTML file under **Import a matter history**, then click **Check and import matter**. You can also paste the HTML or the receipt JSON. The browser reads the selected file as text, extracts the embedded JSON, and runs normal history replay. The HTML carries the matter’s full history. The optional model-run record can be shared separately.

In the HTML, **Open JSON viewer** shows the full pretty-printed receipt in a large dialog. **Inspect proposal data**, decision events and the fingerprints open that same viewer at the corresponding entry. Large receipts use plain pretty JSON to bound the size of the export. The compact payload is still available under **Replayable collaboration JSON**.

Replay an exported history in a fresh process:

```sh
node bootstrap/cli.cjs collaboration-replay verification/collaboration-browser-history.json
```

Current party-work evidence is recorded in `verification/party-checks.json`. Earlier management evidence is recorded in `verification/management-checks.json` and remains bound to its predecessor runtime; `verification/management-browser-history.json` replays the current demonstration with the same `collaboration-replay` command. The earlier `matter-checks.json` and `matter-browser-history.json` remain bound to their predecessor runtime. Earlier collaboration evidence is recorded in `verification/collaboration-checks.json` and remains tied to its own runtime. Previous workspace receipts and platform reports remain tied to their own earlier programme versions. The predecessor browser history retained during execution-budget optimisation is explicitly under `verification/predecessor/`; it is not current acceptance.

## Agent integration

The same local bridge exposes the board and invokes its authored command process:

```js
const board = await window.usewords.invoke({operation:'collaboration-status'});
await window.usewords.invoke({
  operation:'collaboration-command',
  request:{
    action:'propose', actor:'alice', expectedBoardRevision:board.revision,
    id:'new_encounter', title:'Invite another interpretation',
    change:{kind:'edit', scope:'shared', object:'water', field:'title',
      value:'An invitation to listen', baseRevision:board.head.revision}
  }
});
```

Review commands carry `actor`, proposal `id`, exact `contentHash`, `decision` (approve or request-changes), `comment` and `expectedBoardRevision`. Accept commands identify that same content and current board revision. Agents cannot use the old direct `apply` bridge to bypass proposal review. Personas remain simulated for agents too.

Read-only `status`, `inspect`, `check-definition` and `export-source` remain available. Earlier standalone CLI proposal/replay protocols remain compatibility interfaces; they do not modify a live collaboration board. Authenticated remote agent enrollment remains a future capability.

### Switch between two local models

Run Ollama at `127.0.0.1:11434` in local-only mode (`OLLAMA_NO_CLOUD=1` on the server). Create a local `bindings.json` with a `fast` and a `deep` entry. Give each entry its installed `model` tag and full `digest` from [Ollama's model list](https://docs.ollama.com/api/tags).

In the browser, export the scoped brief with `await window.usewords.invoke({operation: "matter-brief"})` and save the returned JSON as `brief.json`. Run either slot from this application's directory.

```sh
node bootstrap/matter-model.cjs fast bindings.json < brief.json > result.json
node bootstrap/matter-model.cjs deep bindings.json < brief.json > result.json
```

Use one command per attempt. Pass the resulting `{ response, run }` object as `result` to the same browser bridge.

```js
await window.usewords.invoke({ operation: "matter-suggestions", ...result });
```

The runner checks the selected tag against its pinned catalogue digest before generation and sends only the scoped brief request. Usewords checks the response through the existing suggestion checker and saves the slot, adapter, model tag, catalogue digest, backend-reported name and brief/response hashes alongside the checked draft. These are browser-local records of the bridge submission. Collaboration replay continues to bind proposal and review events.

Proposing a suggestion from a draft with a checked model run adds `origin.modelRunHash` to the proposal event. A manual draft can omit the link. Replay uses the proposal event alone. To verify a separately supplied run, save the event’s `request.change.origin` and the run record as `{ "origin": ..., "run": ... }` in `check.json`, then run `node bootstrap/cli.cjs matter-verify-model-run check.json`. Use the origin from a receipt you have successfully replayed.

In the workbench, select a linked proposal to see its SHA-256 digest. A matching local draft is verified automatically. When its record is unavailable, paste the run record itself into **Supply model-run record JSON** and choose **Verify supplied record**. The pasted record stays in that view for the check. The collaboration receipt is sufficient to restore the proposal and its link.

## Verification

The automated suite covers real-encounter provenance, shared/local propagation and isolation, edit-order experiments, stale/no-op/invalid input, compiler ownership and source maps, pinned native identities, deterministic builds, receipt tampering, fresh replay, browser storage failures, construct validation, generated execution, inverse correspondence, empty authoring states and source literal safety.

Browser QA created an encounter, journey, custom Question construct and instance; composed it in two journeys; checked shared propagation and local isolation; refused incomplete syntax without erasing it; accepted and restored the workspace. These are same-author engineering checks, not independent scientific evidence or a universal equivalence proof.

The matter agent operations are `matter-status`, `matter-brief` (returns a scoped request and hash, saving its replay basis locally), and `matter-suggestions` with `response`. Checked suggestions still enter through proposals; agents cannot bypass review. Matter structure is validated by the admitted `mw.*` processes and rendered through the retained HTML algebra. Encounter/REL projections describe the encounter dialect, while the full workspace source and receipt also bind the matter structure.

### Native browser build

Run `npm run build` with the native Encounter executable on `PATH` or set
`ENCOUNTER_BIN`. The build writes `native-dist/` by default. Set
`ENCOUNTER_BROWSER_OUTPUT` to a fresh directory to compare two builds.
The direct command from this app's directory is

```sh
encounter build --browser . bootstrap/native-build.rel ../encounter-libraries native-dist
encounter browser-host --release native-dist "$RECEIPT_SHA256" 0
```

Capture `RECEIPT_SHA256` from the verified build and retain the digest separately
from the release directory.

The output contains the admitted image, pinned launch declaration, assets,
source projections, maps, and `build-receipt.rel`. Serve only the assets directory.
The receipt measures the native input closure and the output files. That
closure has its own program identity. Browser saves from another program
identity require their own migration. The prior publication and launcher
remain the rollback path.

The legacy preview launcher runs `encounter check-package` before starting
the app. Set `ENCOUNTER` to the approved platform executable. Packages
containing JSON, MJS, Python or Rust files fail this check and require
migration before installation or boot.
