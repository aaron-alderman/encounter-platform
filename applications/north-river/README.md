# North River timesheet demo

The human creates a project and assigns its first task to a proposer. The
proposer submits a timesheet plan, the human answers its blocking question,
and the proposer submits a successor that includes the exact answer. The
human reviews the successor and approves it as the task's direction. The
task, earlier candidate, answer and approval receipt survive restart.

The application selects shared Encounter matter summaries, record and field
checks, form rendering and HTML serialization directly from their source
owners. Its task rules and browser projections are Encounter source. The
Timesheet source coordinate and its measured SHA-256 are reference data in
evidence.rel. The supplied proposal in test/proposal.rel is a verification
fixture and is outside the served image.

## Verification

From the workspace root, source environment.sh, set ENCOUNTER_RUST_HOST to
the absolute path of the development Encounter executable, and run
node projects/applications/north-river/test/browser.mjs. The verifier builds a
pinned image, creates private demo credentials, and exercises the task through
Chromium and the agent HTTP surface with a disposable store.

The ESM drivers collect browser and process observations. The workflow
declaration checks assignment, approval, live events, task isolation, repair
scope, and ranking invariants. The notebook declaration checks decision
placement, the project queue, and approval handoff.

The workflow and notebook declarations are authored in
`test/workflow.loader.encounter` and `test/notebook.loader.encounter`.
From this package, regenerate or check their loader REL with the shared tool.

```bash
node ../../encounter-platform/shared/node/loader-declarations.cjs --write test/{workflow,notebook}.rel
node ../../encounter-platform/shared/node/loader-declarations.cjs --check test/{workflow,notebook}.rel
```

From the workspace root, run the Encounter checks against the generated REL.

```bash
encounter test --declaration projects/applications north-river/test/workflow.rel
encounter test --declaration projects/applications north-river/test/notebook.rel
```

Run `node projects/applications/north-river/test/project.mjs /path/to/previous-image.rel`
to check that a project created by the previous image opens with its task
history intact. Set `ENCOUNTER_PREVIOUS_RUST_HOST` to the executable pinned by
that image when it differs from `ENCOUNTER_RUST_HOST`. Both executables serve
the test's disposable store in turn.

## Run an interactive gate

Build with the projects/applications directory as the Encounter application
root and north-river/application.rel as the declaration. Its source owner is
`application.loader.encounter`. From this directory, regenerate the loader REL
with `node ../../encounter-platform/shared/node/loader-declarations.cjs --write application.rel`. Serve the pinned
image with an external store and an operators REL file. Use a human identity
with role author and a different identity with role proposer. Assign the
proposer identity when creating the task. The browser verifier shows the
complete launch and credential setup. Use a new store for another project.

The agent is a separate caller. GET /agent returns typed REL
NorthRiverAgentContext with the assigned task, current revision, runtime basis,
reference and form token. Keep the returned session cookie. POST /agent uses
a URL-encoded form with action=propose, base, basis, _csrf, and plan, a typed
REL NorthRiverPlan document. Send the same cookie, proposer credential and
Origin. The plan contains assumptions (id, area, text, origin), steps (id,
title, change, check, assumptions, dependsOn), one question (text, why,
assumption), and the reference SHA-256 as evidence. The test fixture shows
the shape. The successor links the recorded answer with origin human-answer.

The browser refreshes the durable task timeline through Refresh task. This
slice exercises the agent protocol with a separate client and a deterministic
proposal. Autonomous model invocation and live WebSocket delivery are outside
this slice.

## Implementation investigation and handoff

Open an investigation from the selected draft change in the Notebook. The
review waits until the finding comes back against the same draft. Acceptance
records a handoff with the draft digest, approved plan, approval receipt, and
finding receipts. The recipient sees it in Your next decision and can
acknowledge it. The North River pilot routes model-led work to its configured
`north-river-agent` proposer account.

The operator-authenticated HTTP work interface is `/?task=primary&work-interface=1`.
GET returns `EncounterWorkReply` with the current revision and available moves.
POST uses the same session and CSRF token with `task`, `work-interface=1`,
`implementation`, `base`, `operation`, `action`, and any action-specific fields.
Keep the operation ID when retrying the same command. GET with `after` and
`/encounter-events?implementation=<review>&after=<revision>` follow the same
durable events. `/project?format=rel&work-interface=1` inspects the actor's queue.
Recipients can follow assigned handoffs using the queue's `after` parameter
or `/encounter-events?queue=handoffs&after=<revision>`.

The stdio MCP adapter is
`projects/encounter-platform/shared/node/mcp/encounter-work.cjs`. Make
`@modelcontextprotocol/sdk` and `zod` resolvable, then set
`ENCOUNTER_WORK_ORIGIN` to the loopback app origin and
`ENCOUNTER_WORK_AUTHORIZATION` to the operator's configured Basic authorization.
Its inspect, act, and follow tools call the same HTTP interface as other
operator clients. The adapter does not open the store.

Run `node projects/applications/north-river/test/round-trip.mjs RELEASE_DIR BACKUP_SQLITE`
through the workspace runner with the SDK available. Use a North River pilot
backup with the revision-3 implementation review open. The test clones the
backup and supplies its own operator credentials.

## Employee import

After plan approval, attach a UTF-8 employee CSV through the browser. The
assigned proposer receives that attachment and its SHA-256 while the mapping
is pending. Submit POST /agent with the normal session coordinates and
action=preview-import, file set to the attachment SHA-256, employee set to
employee_id, name set to display_name and account set to account_ref.
Encounter checks those approved columns by header name in any order. CSV
mechanics support quoted fields, UTF-8 BOM, LF and CRLF. The demo accepts up
to 100 rows and a 24 KiB file.

Encounter trims surrounding whitespace, checks employee IDs and demo
references, flags every conflicting row and blocks the whole batch on any
error. The human reviews original cells and the mapped records. Acceptance
saves the employee records, demo links and approval receipt in one task
revision. Repeating the exact accepted review returns the original receipt.
Demo references provide no account or login authority.

## Timesheet entry and demo accounts

After employee import approval, open /timesheet as a configured demo
identity. Use role employee and an operator ID that matches exactly one
accepted demo account reference. For example, demo-maya resolves to E-101.
Configure a different role manager for the manager demo. The employee
dropdown lists the one bound employee and the server checks the binding
again on every write. A manager or unlinked identity has no entry controls.

Each employee can add and correct their own dated whole-minute entries.
Corrections retain the entry ID and owner. The server resolves a requested
entry only within the signed-in employee's entries. The time records are
stored in timesheet.rel alongside the task in the same revision store.
The browser verifier uses separate credentialed contexts, checks forged
cross-account and manager requests, and reopens all three employee views
after restart. The manager view links to the read-only report.

## Manager report

Open /report from the manager's timesheet page. Employee selection and the
inclusive From and Through dates are URL filters. Leave either date blank for
an open range. Invalid dates and reversed ranges withhold the totals.

Encounter reads the current revision once and calculates minutes and entry
counts by employee and date. The table and both charts use that result.
The calculation details identify the approved plan, the source document
revision, and the owning Encounter process. The verifier checks the table
cells, plotted SVG geometry and rendered bar widths before and after a
restart. It also opens the same report URL as an employee and checks that
the report data is withheld.

## Final image approval

As the task owner, open **Review North River demo image** after approving the
employee import. The review shows the original request, approved assumptions,
the pinned image, runtime and programme hashes, the source inventory, declared
ports and the demo operator roles. Each behavior links to its reviewed typed
change, the exact embedded source and the compiler-emitted instruction list.
The report also opens the individual minute contributions behind each total.

The browser suite exercises a pinned compiled image against a disposable
store. A separate verifier credential submits its observations through
/review-evidence. The verifier can record evidence and the task owner can
approve it. Encounter requires a passing result for each reviewed behavior
and binds the evidence to the image, roles, plan, import and exact data
snapshot. Reflected lowerings and browser observations are inspection data.
The reviewed correspondence is declared in review-map.rel.

Approval saves the image and evidence coordinates and the human decision in
release.rel. The receipt designates the image for the private North River
demo. It is a review record in that workspace, separate from deployment.

## Live Ollama planning run

Launch a pinned image with private operators and the additional REL launch
fact ("launch", "liveModel", "ollama-loopback"). Use a separate disposable
store. After creating the task, the owner can choose **Start live agent run**.
The run uses the installed qwen2.5:3b model pinned by its local Ollama digest.
It records the input and actual reply on each turn. Encounter supplies the
North River plan categories, dependency scaffold and response shape. The
model supplies the proposal text, question and revised access check.
Encounter records the human answer exactly and owns validation and approval.

The browser connects to the task's authenticated WebSocket and retains its
last event cursor for replay. Start, question, answer, resume, revision and
approval events come from the committed task record. The decision comes
first, alongside the plan on desktop and above it on mobile. While an answer
draft is dirty, incoming events leave the field and scroll position in place.
**Show latest** applies the update and retains the unsent text in that tab.
Model input, replies, and the previous candidate are in **Activity & evidence**.
This live profile ends
at plan approval. Ollama runs off the request thread and an invalid or failed
reply appears as a failed run in the timeline.

With Ollama running locally and ENCOUNTER_RUST_HOST pointing to the development
runtime, run node projects/applications/north-river/test/live.mjs from the
workspace root after sourcing environment.sh. The separate deterministic suite
continues to exercise the entire demo with the model transport disabled.

### Live plan scope checks

Live proposals carry a typed target and check kind for each step. Encounter
checks that pair against the step's contract. It separately flags direct
report-rendering wording in the model step as a suspected prose mismatch.
A model reference may still be named as a dependency of a later report.
The prose check covers the targeted North River pattern rather than general
semantic classification.

When scope validation finds a mismatch, Encounter requests at most one
Ollama repair per run. The repair can change only the flagged steps.
Activity & evidence retains the original reply, diagnostic and repair.
The repaired candidate must pass the same checks before review. A targeted
session repair must supply a check object with `actor`, `action`, `resource`
and `expected`. Encounter requires a supported forbidden operation and the
expected outcome `denied`, then renders the validated check in the plan.
The raw structured reply remains in Activity & evidence.

The scope test declaration is authored in `test/scope.loader.encounter`.
From this directory, regenerate `test/scope.rel` with the shared loader
compiler. Use `--check` with the same path to verify the projection.

```sh
node ../../encounter-platform/shared/node/loader-declarations.cjs --write test/scope.rel
```

From the workspace root, run `encounter test --declaration projects/applications
north-river/test/scope.rel` for the pure checks. For the browser regression, use a development
binary built with test-faults and set ENCOUNTER_NORTH_RIVER_REPLAY=1 when
running test/live.mjs. The first reply replays the misplaced model step.
Ollama supplies the actual repair and the resumed answer turn. Ordinary live
runs use Ollama for every reply.

### Attention and standing

The shared attention projection takes the current standing and available
human decision. The live task renders a blocked candidate as a labeled red
card with its diagnostic and exact flagged text. The pending repair cannot
expose an approval button. Once checked, the answer or approval decision
comes first, with the completed repair shown as supporting information.
Plan dependencies remain ordinary context and hashes stay in Activity &
evidence. The projection does not change validation or approval authority.

The live browser verifier checks the blocker and next decision with
ENCOUNTER_NORTH_RIVER_REPLAY=1. Run it with ENCOUNTER_NORTH_RIVER_REPLAY=valid
to verify that a legitimate report dependency stays ordinary. Both replay
modes use a binary built with test-faults.

### PageRank replay

The experiment uses a pinned REL index of mandatory repair rules and optional
semantic units. The same compiled image and rejected reply are replayed in
fresh stores. Context Hub's lexical scorer and personalized PageRank share
the candidate universe and optional byte budget. Encounter resolves the
selected IDs against the pinned index and assembles the mandatory context
independently of ranking.

Build the development runtime with test-faults, source environment.sh, set
ENCOUNTER_RUST_HOST to that executable, and run
node projects/applications/north-river/test/pagerank-replay.mjs with a new
receipt path. The test transport replays only the rejected first reply.
Every measured repair is a real local Ollama call. The run uses two pairs
in lexical/PageRank and PageRank/lexical order and stops each arm at its first
checked replacement or terminal block.

The REL receipt records rankings, selections, source and model pins, actual
repair prompts and replies, prompt and reply tokens, and phase timings.
Time to the first admissible move adds selector time to the server interval
from the rejected reply becoming available to the checked repair committing.
It excludes workspace creation, browser navigation and model warm-up.

## Implementation on the task

An approved task opens its implementation card. The card shows the current
run state, recent activity, and the action available to the owner. The review panel leads with the draft user surface and approval flow when evidence is attached. The
summary, highlighted source diff, checks, activity and approved
plan open in dedicated views. The Task plan link reopens the planning and import workflow. Earlier
project-plan implementations stay in project history and cannot be changed.

Accept draft records a decision against the exact draft digest, plan and run.
Source changes and publication require a separate handoff. Return draft
records the required change. The owner can queue a new attempt from the
returned or blocked state. Each attempt has a new run coordinate.

The owner can read the same committed project status as REL from
`/project?format=rel`. No separate projection service reads the task store.

An authorized runner can read `/implementation-worker` with the configured
implementation-worker operator identity. The REL reply supplies the current
job, revision and form token. Post URL-encoded forms to that route using the
same session and origin. Supply `id`, `run` from the job's start operation,
`base`, and `_csrf` with `action=claim`, `action=progress` or `action=finish`.
Use `message` for progress. For finish supply `state`, `summary`, `diff`,
`checks`, `reason`, and `next`, including empty fields where appropriate.
Encounter binds the claim to the runner and refuses a superseded attempt.
The runner executes its checks outside the application and reports evidence.
The pilot does not currently run a background implementation runner.

The sick-leave review evidence is bound to the SHA-256 of the saved draft
diff. The candidate image serves the Sick Leave screen through the existing
signed-in dev pilot. A result with a different diff cannot use this draft's
scenario binding.

## Editor work screen

The task selects a single review item by address. Changes, Flow, Data and
Code share that selection. The source excerpts and process
coordinates come from the retained compiled draft. Worldwright's existing
reflection and source presenter supply the compiled statement coordinates and
formatted excerpts. The editor verifies the source excerpt digest before
displaying its tokens. The Data view labels sample records.

Implementation evidence is selected by the saved diff digest. Packets
supply the draft image identity, ordered items, dependency links, preview
scenes, table rows and exact source references. An unavailable packet leaves
the task's ordinary run and technical evidence available. Changes to the
managed application still use the internal approval process.

A change request carries the chosen item through the existing implementation
decision command. Encounter resolves the submitted reference against the
current draft and records its source coordinate in the decision. An unknown
reference is refused. Accept for handoff records the decision against the
existing draft digest and run.

## Generated staging scenario pilot

The scenario CLI takes an EncounterScenarioContext REL document containing
the approved check, pinned draft and image coordinates, available role
slots and admitted command inventory. It selects actions and computes
expected states for the sick-leave check vocabulary. A missing expectation
or eligible command is reported as an evidence gap.

Use the existing native executable to invoke the generator.

```sh
encounter run --declaration projects/applications/north-river/scenarios scenario.rel "$(cat scenario-input.rel)"
```

The pilot exercised the exact candidate on an isolated copy of the approved
demo store. The generated evidence records the acting role, expected and
observed values, native revisions, and read-only captures of the staged
screens. The editor resolves the packet by draft digest, image and plan.
The Scenario tab replays the recorded observations. Step navigation is
read-only. The pilot generation and browser execution were run separately
from the task start command.

For the saved sick-leave run, `scenarios/prepare-stage.mjs` prepares private
launch records and stores for the existing dev gateway. It verifies the
candidate image, saved attempt, generated and observed steps, and retained
revision receipts. The per-step stores copy native revisions from the
scenario run. The editor's `scenario-stages.rel` carries the matching typed
binding. The gateway permits read-only access after the usual pilot sign-in
and preserves the mounted context across app links.

The saved-draft browser check uses the Front Gate harness with the prepared
release directory and a copy of the pilot editor store. Set
`ENCOUNTER_RUST_HOST` to the gateway executable and `ENCOUNTER_STAGE_HOST`
to the runtime pinned by the candidate and editor images.

```bash
node projects/encounter-platform/applications/front-gate/pilot.browser.mjs \
  "$pilot/gateway.rel" "$release" "$pilot/run/workspace.sqlite"
```
