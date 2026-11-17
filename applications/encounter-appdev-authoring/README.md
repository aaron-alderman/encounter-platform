# Encounter authoring restart

Local implementation on `codex/encounter-restart`. The previous worktree and its
tracked/untracked research remain in place. The execution/compiler foundation is
copied from `applications/aaronalderman-mission-publication`; application state
starts empty. No site/application generator is selected.

The first loop is: intent → discovered typed command → exact source change →
review → atomic revision → live projections → source/rule inspection → authored
action → local export job → cold reopening/history/undo. All application policy
is Encounter source. HTTP and SQLite are mechanisms. Review is local single-user
engineering authority, not independently authenticated human identity.

Scalar fields are Text, Number, Boolean or Reference. References require an exact
nominal role. A thing may have one participation per nominal type, with explicit
aliases. Multi-field text edits are refused as one change; add-field resolutions
are one complete schema operation. Pure action source is one `run` process with
one expression-valued result; its supported expression/type profile is checked
before publication. Larger process forms are not silently accepted.

The two supplied projection representations are a web link and a row. They are
generic output mechanisms. User-authored selectors, contextual label overlays and
pure action source are authoritative application definitions. A row is not a
completed mainframe experience. Full nested values, graphical/agent authoring,
the event website and unrelated advanced platform contracts remain later work.

## Run locally

Use the native Encounter host. From the server development workspace:

```bash
source environment.sh
runtime="$PWD/projects/encounter-core/target/release/encounter"
authoring_preview=$(mktemp -d)
pin=$("$runtime" build-guarded-image projects authoring 0.1.15 "$runtime" "$authoring_preview/authoring.rel")
"$runtime" serve --image "$authoring_preview/authoring.rel" "$pin" "$authoring_preview/workspace" 4187
```

Open `http://127.0.0.1:4187`. Start with the intent form, then define a kind of
thing, add a field, and create an instance. Each change has its own reason,
target and goal, a concrete review, and an explicit acceptance. Adding a field
later requires confirmed resolutions for every existing participation.
Invalid edits remain drafts. Cancel preserves the draft. Reopen the same store
directory to retain accepted revisions. Enter `close` to stop the host cleanly.

The UI links values to their type, source and consuming projections. The text
editor exposes the complete field document for a selected role; changing several
fields at once is refused. Action source has its own document and editor. A GUI
constructor covers identity/append actions; the larger supported expression
subset is text-only. Creation identities and all metadata do not yet have rename
or delete operations. This is not a claim that every eventual editor capability
or every programme form has been delivered.

## Add a second blocker to a guarded command

On the target type, add a Reference field for the second blocker. Resolve its
value explicitly for each existing item. Then use **Add second blocker** for
the command and accept the reviewed change. Both referenced records must have
the command’s configured status field and required status. The row explains
which blockers still prevent the command from running.

## Ownership and durable state

| Concern | Owner |
| --- | --- |
| Closed value/command/state contracts | `source/types.encounter` |
| Action source typing, execution and checked inverse domain | `source/actions.encounter` |
| Command prerequisites, transformations and explicit resolutions | `source/commands.encounter` |
| Source documents, review, CAS reconciliation, history, exports | `source/application.encounter` |
| Window, forms and stylesheet | `source/ui.encounter`, `source/presentation.encounter`, shared Sourcery presentation and algebra serializers |
| HTTP, sessions, capability wiring and atomic SQLite storage | Native Encounter host |

The selected compiler hydrates, links and admits actual Encounter source. No MJS
module tree, executable JSON or external app generator is selected. `application.rel`
is typed data; authored programmes are separate `.encounter` documents. Pure
authored actions cannot obtain storage or ambient host grants. The shared 20M
execution budget includes nested compilation/policy work.

Each accepted revision binds source bytes, base revision, operation identity,
reason/target/goal, runtime basis and the stable `encounter/authoring-loop/1`
store profile. Stale reviews refuse. Unknown commit outcomes are resolved by
the exact operation receipt and retained documents. Restore creates a new
validated revision, preserving history. Incompatible store profiles and the
earlier development schema refuse; they are never silently rebound or migrated.

The native host, SQLite, source admission, capability ports and identity
mechanisms are part of the runtime boundary. Basis hashes identify selected files and admission receipts;
they are not independent loaded-code attestation or a formal correctness proof.
The browser is a local single-user workspace, not a remotely authenticated
multi-user service. No mail, network publication or deployment capability is
granted to authored actions or export jobs.

Authoring uses the platform's Sourcery presentation tokens, feedback component
and data tables. The app image captures the copy in
`algebra/presentation/sourcery-presentation.encounter`, checked against the
platform library by the inspector browser test. The Harbour field guide uses
its publication theme.

## App inspector

App inspector renders Temple Manager's window and detail pane from the pure
Home Encounter processes captured in `inspection/home/`. The four record
states use empty synthetic record inputs. The REL evidence beside the capture
records the Home release, source coordinates, and links from declared control
attributes to the inspected event and data paths. The shared Formation editor
is linked as a separate surface. Browser actions and record requests are
displayed as source.

File Manager projects the Home folder, sample folder, inline Encounter preview,
search results and unavailable states from captured Home renderers. Its small
fixture index comes from the published workspace policy example. Inspect a
folder control to see its destination, or use the preview branch to inspect the
file row, renderer and source excerpt. The Open in File Viewer action links its
handoff event to the separate File Viewer window. Both trees use the same
published file fixture and read-only source coordinates.

Service Manager projects the published Runs view from Home's Encounter
definitions. The qualification run links its Outcome action to the receipt
handoff and opens the same receipt in the File Manager and File Viewer
inspection trees. The preview shows the published text and links to the
Encounter declaration and catalogue lookup. The walkthrough reads a bundled
published receipt.

Schedules uses a recorded timer observation from a pinned scheduled-run
receipt. The last-execution control shows how Home matches scope, service,
timer and trigger time before opening the selected invocation in Runs.
File Manager and File Viewer render the same published REL receipt with the
Home preview definitions.

Services uses a sample Front Gate snapshot to show listener availability for
registered apps and scope membership for running systemd services. Selecting
a row links its event and cached observation to the status projection and
the State cell in the Service Manager detail pane.

## Verification

For the native browser tests, source `environment.sh`, set
`ENCOUNTER_RUST_HOST` to the native executable, then run
`node test/app-inspector.cjs`, `node test/ui-only.cjs`, or
`node test/guarded-command.cjs` from this application directory. The Node
bootstrap and storage modules are retained for compatibility and contract
fixtures.

```powershell
node --test --test-concurrency=1 test/contracts.test.cjs test/storage.test.cjs
node test/reconciliation.cjs
node test/ui-only.cjs
node test/second-domain.cjs
```

Browser tests require Playwright and installed Chrome. `ENCOUNTER_PLAYWRIGHT`
can select the Playwright module path; the default is this machine's bundled
Codex runtime. Every browser construction starts with empty authored state and
uses visible controls. Native storage tests use separate disposable fixtures.
See [verification scope and receipts](verification/README.md), including retained
failures, the two domain witnesses and explicit performance/usability limits.

The former work remains at `C:/Users/aaron/grand-theory/perth-revival-2027` on
`codex/authoring-first-step`, including its uncommitted research. It is not imported
by this runtime. The root event site remains historical material in this branch.

## Server authoring prototype

The loopback server reflects a single operation, checking a pure typed action.
A proposer discovers the contract, submits actual Encounter source and gets a
diagnostic or a portable candidate. In **Actions → Review a server proposal**,
the operator pastes the candidate, reads the normal Encounter source review
and explicitly accepts it. The proposal is checked again on import and the
review is checked again before the existing atomic commit.

Run the prototype with a development build of the standalone Rust executable.
Use a disposable directory. For separate identities, build the image with the
[guarded release command](../encounter-libraries/guards/README.md) using the
`authoring` profile and use
the existing REL launch and operator contracts. Give the human operator role
`author` and the calling client role `proposer`. The verifier fixture
`test/authoring-server.cjs` shows the complete launch with private, generated
credentials. An unconfigured loopback launch uses the existing single-user
authority, so use an operator file when giving an agent access.

- `GET /authoring` returns typed REL `EncounterAuthoringContract`. Retain its
  session cookie. It declares the current base revision, accepted source-set
  hash, application basis, scalar types and the action's empty port grant set.
- `POST /authoring` sends the reflected form fields with `_csrf` from discovery,
  the same cookie, and the service origin. A configured proposer authenticates
  on each request. The reply is `EncounterAuthoringCheck` with a `refused`
  diagnostic or a `reviewable` candidate and the SHA-256 of its action source.
- The candidate is plain, unsigned REL data. The browser treats it as a draft
  even if it came from a successful server check. No proposal state is stored
  on the server. The accepted revision and its history use the existing
  authoring store.
- Keep Context Hub retrieval receipts and source coordinates with the
  proposal's rationale when they inform the change. Context Hub retrieval
  stays in its own service. This prototype checks application source and
  authority, while the operator evaluates cited evidence. It performs no
  retrieval or scientific admission.
- The standalone core owns form transport and session binding. Encounter
  source owns role checks, candidate validation and review. The pilot uses
  the existing SQLite store. A Temple-backed store or a Sourcery publication
  decision can sit behind a separately declared boundary.

From the workspace root, source `environment.sh` and set `ENCOUNTER_RUST_HOST`
to the development executable's absolute path. Then run
`node test/authoring-server.cjs` from this application directory. The check
launches a pinned image and uses a disposable store and two operator roles.
