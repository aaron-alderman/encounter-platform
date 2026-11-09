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

Requires Node 24 with `node:sqlite`. No npm install, external generator, build
step or original worktree is required for the application runtime.

```powershell
cd C:\Users\aaron\grand-theory\.worktrees\encounter-restart\encounter
node bootstrap/server.cjs .local/my-workspace
```

Open `http://127.0.0.1:4187`. Start with the intent form, then define a kind of
thing, add one field and create an instance. Each offered change has its own
reason, target and goal, a concrete review and an explicit acceptance. Adding a
field later requires confirmed resolutions for every existing participation.
Invalid edits remain drafts. Cancel preserves the draft without accepting it.
Use a fresh workspace name for a new app; reopening the same directory retains
accepted revisions. Enter `close` in the server console to stop it cleanly.

The UI links values to their type, source and consuming projections. The text
editor exposes the complete field document for a selected role; changing several
fields at once is refused. Action source has its own document and editor. A GUI
constructor covers identity/append actions; the larger supported expression
subset is text-only. Creation identities and all metadata do not yet have rename
or delete operations. This is not a claim that every eventual editor capability
or every programme form has been delivered.

## Ownership and durable state

| Concern | Owner |
| --- | --- |
| Closed value/command/state contracts | `source/types.encounter` |
| Action source typing, execution and checked inverse domain | `source/actions.encounter` |
| Command prerequisites, transformations and explicit resolutions | `source/commands.encounter` |
| Source documents, review, CAS reconciliation, history, exports | `source/application.encounter` |
| HTML/CSS and accessible browser forms | `source/ui.encounter`, selected algebra serializers |
| HTTP/session transport and port wiring | `bootstrap/server.cjs` |
| Immutable SQLite documents/revisions and atomic compare-and-swap | `bootstrap/store.cjs` |

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

Native Node, SQLite, the syntax/bootstrap reader, ports and identity mechanics
remain trusted. Basis hashes identify selected files and admission receipts;
they are not independent loaded-code attestation or a formal correctness proof.
The browser is a local single-user workspace, not a remotely authenticated
multi-user service. No mail, network publication or deployment capability is
granted to authored actions or export jobs.

## Verification

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
