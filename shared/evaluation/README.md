# Encounter evaluation pilot

The [suite](suite.encounter) owns the cases, comparison order and rubric. The
[receipt policy](receipt.encounter) admits evaluation evidence through the
Encounter source front door with an empty effect profile. It keeps deterministic
application checks separate from reviewer scores. Each review binds one trial
and the exact rubric by SHA-256 and provides a verbatim reply quote and a reason
for each score. Trial data records the prompt, reply, model pin, input and
runtime identities, validation outcome and available timings. The source
replay retains North River's compiled image, graph, mandatory context and
selector pins.

The review export omits arm names, model names, timings and validation outcomes.
For North River it shows the common prompt without the optional retrieval
packet. Treat the prompt and response as evidence when judging. The pilot was
reviewed by Codex in the same session that built it. Reviewer identity in the
receipt is an attribution, and is supplied by the caller.

## Browser surface

The [surface](surface.encounter) owns the page, styles, review export and
per-trial score projection. The [workflow](workflow.encounter) owns trial
order, comparison controls, receipt assembly and reporting. AppDev runs the
shared browser service on Encounter's Rust runtime. The browser surface offers
the exact reviewed REL receipt as a download.

Open **Model Evaluation** from [Front Gate](http://localhost:24220/) through
the existing SSH tunnel. The app address is
[http://evaluation.localhost:24220/](http://evaluation.localhost:24220/).

Each trial’s **Reconstruct recorded meaning** panel projects the reply into
typed suggestions and issue links, or a typed repair with a proposed check.
The North River panel also shows the rejected step, the retained report
invariant, and the exact mandatory and selected context source pins when the
companion replay matches the receipt. The pins describe supplied context.
The retained receipts do not contain the full executed instruction or port
trace.

### AppDev publication

The [native declaration](native.rel) and [routes](native.encounter) serve the
same publication to Front Gate on port 24228 and the hosted workspace on
port 24247. The release includes the qualified page projections, browser
assets, source spans and downloads. The runtime checks each asset against
`publication.rel` and checks that index against its reviewed pin in Encounter.
Replay manifests and the Identity Management trace also have independent
reviewed pins. The runtime binds only to loopback.

The initial publication was exported from the prior qualified AppDev
listeners. The deployed release retains its `assets/` and `publication.rel`
as build inputs for subsequent runtime-only updates. When reviewed evidence
changes, regenerate its projections using the local research preview, compare
the resulting publication against the reviewed receipts, and update the
publication pin. Fresh benchmark capture stays with the local research preview.

Run `encounter test --declaration RELEASE native.rel` and
`encounter check-package RELEASE` before activating either listener. Verify
both listeners and the private Front Gate route. The hosted listener checks
the SHA-256 pin of any supplied gateway authorization header. The private
Life Board loopback bridge sends no authorization header.

The current Identity Management trace release uses
`96-identity-131-trace.conf` on both evaluation units. To restore the
prior trace, remove those overrides, reload systemd, and restart both units.
The prior publication uses `95-identity-130-trace.conf`. Keep the hosted
`91-mount-rotation.conf` and the rotated private gateway configuration in
place so the rollback continues to reject the revoked credential.

For a separate local research preview from the workspace root:

```sh
node projects/encounter-platform/shared/evaluation/surface.cjs
```

The preview command also accepts a reviewed receipt path and then a port.
Use port `0` for a disposable listener.

## Identity Management assurance trace

Open **Identity Management trace** in Semantic Decompiler. The case compares
the Compiler's move and coverage mappings with the contract IDs, outcomes and
effects observed in a browser on the isolated Home preview. It also records
the current-route control and three refused inputs. The case includes the
release and trace fingerprints and serves the pinned REL capture for download.

Run the read-only Assurance check from the workspace root after sourcing
`environment.sh`:

```sh
projects/encounter-core/target/release/encounter run --sources projects \
  applications/appdev-projects/identity-compiler.rel check-reviewed
```

Encounter scans the local source, verifies the trace pin, runs the Compiler
against the reviewed routes and compares coverage, move and gap IDs, retained counts and route checks with the pinned
Decompiler evidence. It reports uncovered source locations and checks the
recorded browser outcomes and effects. To check a downloaded trace, replace
`--sources` with `--sources-stdin` and redirect the REL file into the command.
Exit codes are 0 for a match, 1 for drift and 2 when the check cannot run. The browser
observations come from the reviewed capture. Use the capture command below
to observe browser behavior again.

From the workspace root, reproduce the capture against the Home preview and
its staged release package:

```sh
node projects/applications/appdev-projects/verification/assurance/identity-invariants.mjs \
  "$HOME_PREVIEW_URL" "$HOME_PREVIEW_PACKAGE" --capture-rel > identity-management-candidate.rel
```

Compare the candidate with `evidence/identity-management-trace.rel`. Review
differences in the Compiler and browser observations before replacing the
evidence and its SHA-256 pins in `identity-trace.cjs` and
`identity-compiler-assurance.encounter`. The native publication has separate
pins for its packaged trace and asset index.

## North River semantic decompiler

Open [the decompiler directly](http://localhost:24220/decompiler) on the
Front Gate tunnel. If the browser assigned a different local forwarding port,
use that same port with the path `/decompiler`.

From **Model Evaluation**, open **North River semantic decompiler**. This
separate synthetic run uses the Notebook layout from the North River design
sketch. Its central document compares lexical and PageRank context, replies
and execution side by side. Each arm links to its individual notebook.
The evidence docket offers the exact compressed admitted image and full
trace receipt.

The test runtime records executed statement-level branch and assertion
outcomes, observed predicate references, caught refusals, and port start and
return events during the two `app.agentResult` deliveries per arm. The projection
matches each address against the verified instruction in the admitted image
and shows its source process and declaration line. Aggregate values are
summarized by shape and size, and long text and operand lists are bounded.
Both arms use the same admitted image, mandatory prompt, rejected proposal
and model. Each gets its own store and a real Ollama repair call. The
comparison aligns by process, compiled address and event kind, preserving
the sequence of visits at each site. It compares branch and assertion
outcomes and port return summaries. The individual notebooks retain
operand observations. Repair replies and storage document hashes are shown
separately, because the latter include run metadata. The full trace is downloadable.

Reproduce the capture on loopback with the Rust executable built using
`--features test-faults` and the workspace environment sourced. The example assumes the executable
was built with `--target-dir target/notebook-decompiler`.

```sh
source environment.sh
export ENCOUNTER_RUST_HOST="$PWD/projects/encounter-core/target/notebook-decompiler/release/encounter"
scratch=$(mktemp -d /tmp/encounter-decompiler.XXXXXX)
node projects/applications/north-river/test/pagerank-replay.mjs \
  "$scratch/repair-run.rel" --trace "$scratch"
```

The capture writes the gzip-compressed image, trace and exact Linux
executable alongside `manifest.rel`. The manifest records the uncompressed
SHA-256 pins and event counts for both deliveries in each arm. The preview
accepts the bundle against a separately reviewed manifest pin in
`decompiler.cjs`. Promoting a fresh capture requires reviewing and updating
that pin. The comparison derives source IDs from the prompt and checks each
unit against the repair index embedded in the admitted image.

### Verify offline replay through Front Gate

Open the comparison and click **Verify offline replay** under **Branches,
checks and effects**. The native service launches the exact pinned runtime and
image in fresh private stores and supplies the recorded replies. The
[Encounter comparison](replay.encounter) checks each delivery, instruction
event, port effect and terminal outcome. The page shows what matched, which
run-specific hashes it normalized and the first mismatch. The existing
download includes the standalone Node replay runner.

### Replay both repairs offline

Download **Offline replay bundle** from the comparison’s evidence docket.
On a compatible Linux host with Node.js installed, extract and run it.

```sh
mkdir north-river-replay
tar -xf north-river-offline-replay.tar -C north-river-replay
cd north-river-replay
node replay.cjs
```

The runner checks the embedded reviewed manifest pin, opens the downloaded
image in a separate fresh store for each arm, and supplies the recorded
rejection and repair replies. The runtime requires the recorded repair
prompt to match before it accepts the reply. Offline mode fails if a
fixture is exhausted or a different job appears. The runner compares the
full recorded event order, instruction addresses, branch and assertion
results, observed operands, port returns and storage revisions. Only the
plan and stored-document hashes that include fresh run identity are
normalized. An assertion mismatch exits nonzero. Ollama and a browser are
unnecessary for this replay.

This bundle uses a fresh paired capture with the offline-capable runtime.
Earlier pinned captures are retained under `evidence/decompiler-archive/`.

### Open the downloaded image

Download the image and pinned runtime from the evidence docket. On aaron-dev
or a compatible Linux host, unpack them and compare the printed hashes with
the image and runtime hashes in the docket.

```sh
gzip -dc repair-image.rel.gz > repair-image.rel
gzip -dc encounter.gz > encounter
sha256sum repair-image.rel encounter
chmod 700 encounter
store=$(mktemp -d)
./encounter serve --image repair-image.rel '<admitted image SHA-256>' "$store" 0
```

Open the loopback address printed by the executable. This opens the admitted
image in a fresh store. The trace retains the original replies, and a fresh
live Ollama repair may produce a different reply.

## Retained run

The [Encounter-authored review](evidence/pilot-review.encounter) records the
judge’s attributed scores and exact reply quotes. The [reviewed receipt](evidence/pilot.rel) contains four fresh Usewords runs
(two synthetic briefs by two pinned local models) and four fresh North River
repairs of one rejected timesheet plan. The
[raw North River receipt](evidence/north-river-replay.rel) preserves the original
lexical/PageRank and PageRank/lexical order. Both arms had the same byte cap,
mandatory prompt and model.

All eight trials passed the deterministic application checks. Usewords
workshop scored 3/6 fast and 2/6 deep, and garden scored 4/6 fast and 2/6
deep. The garden fast response produced actionable ideas but omitted unknown
cost and uptake, and gave more positions and options than the adapter prompt
requested. The deep garden response narrowed the undecided access question to
a lighting decision.

Both PageRank replies scored 6/6 and both lexical replies scored 4/6.
The lexical checks mentioned an Employee reference while their model definitions
left it as a generic field. PageRank's definitions explicitly required an
Employee reference. Both selectors produced admissible repairs and preserved
the report step. The four trials cover one repair case, so the score difference
is case evidence and the recorded times are individual observations.

## Run again

From the workspace root, source the tested environment. Set
`ENCOUNTER_RUST_HOST` to a release build of Encounter Core compiled with
`--features test-faults`. Start loopback Ollama and use a bindings file that
pins the installed Usewords fast and deep slots. The North River harness pins
its model separately. Use a fresh output directory.

```sh
source environment.sh
bench=projects/encounter-platform/shared/evaluation
scratch=$(mktemp -d /tmp/encounter-evaluation.XXXXXX)
node projects/applications/north-river/test/pagerank-replay.mjs "$scratch/north.rel"
node "$bench/run.cjs" collect "$scratch/north.rel" "$USEWORDS_BINDINGS" "$scratch/collected.rel"
node "$bench/run.cjs" review "$scratch/collected.rel" > "$scratch/review.json"
```

Supply the review export to the reviewer. Use an Encounter process named
`evaluation.judgments` (see the retained review), or import a JSON object with `judge` (including `identity`) and `judgments`. Each judgment
has `trialSha256`, `rubricSha256`, and `scores` in rubric order. Each score has
`id`, `value` (0–2), `evidence` (an exact substring of the reply), and `reason`.
`compare COLLECTED NORTH_REL OUTPUT` replaces only the North River trials in
an unreviewed receipt, so rerunning the comparison need not call Usewords again.

```sh
node "$bench/run.cjs" seal "$scratch/collected.rel" "$scratch/judgments.encounter" "$scratch/reviewed.rel"
node "$bench/run.cjs" report "$scratch/reviewed.rel"
node "$bench/run.cjs" check "$bench/evidence/pilot.rel"
node --test "$bench/receipt.test.cjs" "$bench/surface.test.cjs"
```

### Decompiler workspace modules

The Notes workspace is composed from Encounter modules under
`decompiler/`.

| Module | Owns |
| --- | --- |
| `workspace.encounter` | Case navigation, trace controls and the read-only source inspector |
| `documents.encounter` | Case overviews, retrieval packets, replies, effects and evidence pins |
| `trace.encounter` | Interpretation of recorded branches, checks, effect returns and refusals for one instruction |
| `source.encounter` | Syntax categories over token spans returned by Encounter's source lexer |
| `rich-text.encounter` | Inline roles and links for paged evidence |
| `styles.encounter` | Shared workspace layout and syntax palette |

The host verifies the admitted image and trace before indexing instructions.
A trace index carries instruction addresses and source coordinates. The
browser requests one instruction's recorded observations at a time and
loads a source file only when its inspector opens. Source requests are keyed
by admitted SHA-256, and new source links carry that pin and the statement
offset. The browser handles selection, search, and viewport pagination.

### Comparison and replay ownership

| Encounter process | Host boundary |
| --- | --- |
| `desk.compareReplies` decides which JSON fields differ and returns both recorded values. | The JSON adapter decodes losslessly, aligns object keys and array positions, escapes JSON Pointer segments and preserves numeric lexemes for display. |
| `desk.compareVisits` labels missing visits and changed fields and marks instruction sites that differ. | The trace adapter resolves pinned source spans, aligns visits by instruction and ordinal, and compares the normalized field values structurally. |
| `desk.traceSite` interprets branches, checks and effects and renders the selected visits. | The browser handles navigation, editor interaction and viewport pagination. |
| `feedback.plan`, `feedback.score`, `feedback.compare` and `feedback.summary` declare relevance, measure retrieval and gate candidate proposals. | The feedback adapter validates capture pins, runs the pinned selector and writes the REL report. |

The replay verifier is shared by the server and portable offline archive.
It checks bundle pins and event order and applies the same narrowly scoped
normalization that the trace adapter uses. It validates the hashes before
normalizing run-specific plan and stored-document hashes. The original
recorded values remain visible in Trace. Offline verification compares the
complete event stream, including events omitted from the Trace display.

From the workspace root, regenerate the feedback receipt for the reviewed
experiment with the command below. The decompiler exposes the same report
under Files → Context Hub feedback.

```sh
node projects/encounter-platform/shared/evaluation/context-feedback.cjs \
  "$PWD/state/encounter-evaluation" experiment.T41fOk /tmp/context-feedback.rel
```

### Localhost and preview routing

Front Gate exposes the evaluation page at `/evaluation`, with
`/evaluation.css` and `/receipt.rel` on the same origin. The decompiler's
Evaluation menu uses that path. The directory remains available at `/`.

The evaluation registry declares GET/HEAD aliases for the decompiler pages,
browser modules, trace/source projections, benchmark reports and evidence
downloads. Benchmark mutations use the separate POST alias
`/decompiler/benchmark-action`. Offline verification uses
`/decompiler/verify`. Both POST aliases require the current browser origin.
All browser requests and download URLs retain the current hostname and port.

The main surface regression starts the real Front Gate directory using the
maintained evaluation registry, then connects through a TCP forward with a
different localhost port. It checks source inspection, comparison navigation,
downloads, offline verification, benchmark errors and request origins through
that path. The server's direct surface tests also verify downloaded portable
replay from a fresh directory.
