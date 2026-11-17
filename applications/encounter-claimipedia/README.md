# Claimipedia Encounter development

`corpus/claimipedia-full-corpus-v1.0.0.rel` is the pinned, read-only public release
from 7 October 2026. The manifest verifies its SHA-256 before loading. It
contains 2,839 facts across 355 subjects, including 122 claims, 122 versions,
30 evidence items, 80 relationships and one challenge.

The browser offers separate collections for released claims, Frontier
assessments, Frontier research arms and references, research checkpoints, the research inbox, an evidence library, and internal
application records.

- **Released claims.** Save a draft and compare its statement and scope against
  its exact predecessor. Revise it again, discard it, or accept it into the local
  working corpus. The released version, its evidence and its relationships
  retain their published coordinates. Accepted wording becomes the local search
  result. Discarded and superseded drafts stay in history.
- **Frontier assessments.** Search 234 assessments and edit their assessment
  wording, warrant, proposed test and reversal conditions. The imported
  attribution, source and intake disposition remain visible. Every save appends
  a local revision with its predecessor and reason.
- **Research arms and references.** Browse six Frontier arms and 40 work packs,
  with their recorded progress and decision gates, and follow the associated
  assessments. Revise an arm’s working title, claim and next action. Search
  102 Frontier references by title, role, identifier or URL and revise their
  working title, role or URL. Each save records a reason and a predecessor.
  The imported arm and reference remain visible in the editor.
- **Research checkpoints.** Inspect the two Spin(2,3) checkpoint datasets with
  their original subjects, evidence coordinates and dispositions. Save or
  revise a local follow-up note with a reason and preceding revision. The
  imported source remains the predecessor of the first note.
- **Research inbox.** Search 41 opportunities by ID or imported wording,
  follow linked result subjects, and record local follow-up notes with
  revision history. Propose a manual next action against an exact evidence
  coordinate. A separate review can approve manual follow-up, reject, or
  defer. The inbox can filter by local review state. The typed REL ledger
  preserves all 2,268 ordered legacy
  tuples, including the original observation polarity.
- **Evidence library.** Search 2,296 transfer records by path, collection or
  SHA-256. The library includes all 895 transferred physics files, 1,346
  research evidence files, 41 documentary evidence files, 12 additional
  Claimipedia research files, and two preregistration receipts. Browse the
  original SRP10–SRP12 report and result and the RIO-022-W3 report and
  receipt directly from their records. Each file has a stable path-based
  coordinate and can carry its own revisioned local follow-up note. With
  the verified transfer mounted, its exact original bytes are downloadable
  from the evidence detail page.
- **Internal application records.** Inspect the retained legacy deployment
  admission and test policy as a separate historical collection.

Encounter source lives in `source/products/claimipedia/`. The private SQLite store selected by the active launch file is the authoring
source for released-claim drafts, Frontier assessments, research arm and
reference revisions, and local research notes. The typed REL files
`products/claimipedia/frontier-claims.rel` and
`products/claimipedia/frontier-research-arms.rel` hold the imported Frontier
baselines. Browser edits append local revisions against those baselines.
A reference coordinate derives from its imported ID and original URL, so
editing one row with a shared legacy ID leaves the other row distinct. `products/claimipedia/transfer-records.rel`
maps the additional records to their pinned REL datasets and verified
original paths. The separate `products/claimipedia/research-inbox.rel`
holds the imported opportunity ledger. Its browser notes share the same
SQLite revision store as the checkpoint notes. `evidence-library.rel` is the
transferred file catalogue, `evidence-links.rel` relates evidence paths to
their research records, and `evidence-texts.rel` holds four original UTF-8
texts for inspection in the app. The verified transfer remains the source
of every original file. With a mount, the app resolves its path from the
catalogue and the host checks the original size and SHA-256 before
delivering it. The app renders its views from those sources. The browser pages are generated from these
sources on request.

Accepting a draft or saving an assessment revision is a private local
operation. A configured reviewer can approve the exact accepted claim revision
for private staging. A different configured curator can stage that candidate
against the same content pin. A newer draft suspends staging and a replacement
revision needs its own approval. The candidate stays in the working store.
A curator can record one scientific admission handoff for that exact candidate.
The private claim page exposes the copyable REL packet and its SHA-256 pin.
The packet carries the staged wording, release coordinate, and editorial
approval reference for independent review. The handoff itself carries neither
scientific admission nor publication authority.

### Formalpedia

Open **Evidence library → Browse Formalpedia** in the Node development
workspace. Search by Lean declaration, title, toolchain, or upstream status.
The initial full import used the 12 November 2026 export pinned at commit
`b6f81971f69c98de86b02a8152c141128d82582b`.

| Lean | Theorem statements | Definition bundles | Solution files | Dependency edges |
| --- | ---: | ---: | ---: | ---: |
| 4.33.1 | 315,483 | 100,243 | 270,902 | 3,121,657 |
| 4.30.0 | 15,033 | 4,483 | 15,424 | 67,856 |
| 4.29.0-rc3 | 17,937 | 668 | 15,118 | 25,262 |
| Total | 348,453 | 105,394 | 301,444 | 3,214,775 |

`products/claimipedia/formalpedia/full.rel` records the counts, source
archive and index paths, SHA-256 pins, and audit results. The Node development
host opens the 2.97 GB index read-only and retrieves bounded pages and typed
REL detail records on demand. The original 7.41 GB compressed GitHub export
is retained under `formalpedia-sources/`; its Lean files total 23.93 GB before
compression. The catalogue and archive together occupy 10.38 GB.

The archive passed its gzip integrity check. File, catalogue, and dependency
counts reconcile with the upstream manifest. All graph edges resolve within
their Lean environment. The proof audit matched 301,169 exported bodies
directly to their published checksums. For the remaining 275, reversing only
the export's import-name suffixes reproduced the published checksum byte
for byte. The pinned `products/claimipedia/formalpedia/import-renames.rel`
receipt binds each result to the commit, proof ID, path, published checksum,
exported body checksum and exported file checksum. Claimipedia shows
**Checksum verified after import renaming** for matching records. The
exported files and original catalogue hashes remain intact. The import
records upstream evidence without running Lean locally.

#### Solution proof paths

On the indexed host, expand **Direct imports** under any solution to see the
modules declared in its Lean file, their same-environment catalogue links,
and the count of open direct imports. Mathlib and other external modules have
no Formalpedia status. An unresolved export module is marked separately.
The lists describe direct imports, so they do not measure actual declaration
use or transitive proof dependencies.

The full proof-path index is built from the archived solutions and their
exported-file SHA-256 pins. It preserves exact module names, including
import-renaming suffixes. The daily refresh extracts imports from changed
solution files and removes entries for deleted files. Dependency status
comes from the active catalogue, so an imported theorem closing updates the
open count even when the solution's file is unchanged. Reopen the development
host after a refresh to read the new snapshot.

The catalogue retains shortcuts to the Green–Tao and Erdős 1041 pilot
examples. The pinned pilot receipt remains available as a fallback.

#### Reviewed Lean links

The development workspace has a scope-reviewed pilot on three existing
Frontier assessments. Open **Frontier Claims** and search for **FC-OAB-01**,
**FC-FUR6-01**, or **FC-FUR6-04**. Each dossier gives the supported mathematical
subclaim, the exact declaration and pinned accepted proof, the formal
hypotheses, and the justification needed to apply the result to the assessment.
The review is attributed to Codex and attaches to the imported wording and
source coordinate.

`products/claimipedia/reviewed-lean-links.rel` retains the statement and proof
hashes, export commit, Lean toolchain, and Mathlib revision. The review compares
those artifacts and the existing assessment. Formal proof acceptance is
attributed to Prove2Me. Scientific admission and public release use their
existing separate workflows.

#### Research queue

From **Browse Formalpedia**, open **Research queue** to rank open lemmas
by the number of individual solutions for which each is the sole open direct
Formalpedia import. Imports resolve in the solution’s Lean environment.
A solution with an unresolved Formalpedia import is excluded. External
modules have no catalogue status.

**Latest refresh changes** compares the two most recent published snapshots.
It shows previous and current counts, gains and losses, and the lemma’s current
status. Swapped solutions can produce both gains and losses while leaving the
total unchanged. Earlier comparisons remain in the retained snapshot indexes.
A daily check that finds the same upstream commit leaves the latest comparison
in place. The refresh log includes queue totals and change counts.

#### Refresh the full catalogue

Run from the server development workspace root.

```sh
source environment.sh
node projects/encounter-platform/shared/node/formalpedia-refresh.cjs
```

The command checks the upstream `main` commit. An already active commit
returns `current`. For a new commit, a blob-filtered Git fetch supplies the
file inventories. The refresh downloads changed blobs at the pinned commit,
checks their Git object IDs, and reads cached metadata to reconcile the
index and graph. It stages updates and removals in a copy of the active
SQLite index. Unchanged records retain their payloads and search entries.
If the index is unchanged, the new snapshot reuses it. The first changed
snapshot seeds the metadata cache from the original archive. The cache can
be rebuilt from the original archive and the recorded deltas.

Each refresh compares the published and exported proof hashes. For a new or
changed discrepancy, it reverses the export's import-name suffixes in memory
and checks the result against the published SHA-256. It carries forward prior
audit outcomes only when the proof path and hashes match. Unresolved proofs
retain their checksum warning. Exported Lean bytes and both hashes are kept
as received.

The command writes a pinned delta archive under `formalpedia-sources/` with
the added or changed files and a list of deleted paths. The active
`formalpedia-full` declaration points to the new snapshot receipt, which
records the original archive and its ordered deltas. The active
`formalpedia-import-renames` declaration points to the matching checksum
receipt. The command switches the generated loader after validation and
keeps earlier indexes and receipts. Reopen the development host to read
the new snapshot.

#### Daily server schedule and logs

The server development workspace has a user cron job at **15:00 Perth time**
(07:00 UTC), after the usual Formalpedia publication window. The job runs
`projects/encounter-platform/shared/node/formalpedia-refresh-daily.sh` and writes
a dated log under `logs/formalpedia-refresh/` with Perth timestamps and its exit
status.

The result records the active commit, file and record counts, and each unresolved
proof's ID, source path and checksums when available. For an updated snapshot,
the log also names the delta archive and the JSONL entry listing individual
record additions, updates and removals. The archive contains the changed files
and a list of deleted paths. A no-change run reports zero changes and includes
any unresolved proofs carried by the active snapshot.

#### Retained pilot

Static REL hosts continue to open the 1,000-record pilot.
Each entry links to its Prove2Me record and to the Lean files at the pinned
[export commit](https://github.com/prove2me/formalpedia/tree/b6f81971f69c98de86b02a8152c141128d82582b).
Dependencies link to other pilot records where present. The catalogue retains
the names and import roles of dependencies outside the selected theorem set.

`products/claimipedia/formalpedia/pilot.rel` is the typed, SHA-256-pinned
catalogue for the 12 November 2026 export. It takes the first 334 theorem rows
in the default environment and the first 333 theorem rows in each of the
other two, in upstream index order and skipping definition rows. The pilot
contains 943 proved, 55 open, and two disproved statements, with 980 solutions
(including 11 accepted sketches), 305 direct definition files, and 2,294
dependency edges. Of those edges, 519 point to selected theorem records.

`products/claimipedia/formalpedia/sources.tar.gz` contains the original
statement, solution, and direct definition bytes, the upstream manifest,
and the Apache 2.0 license. Its SHA-256 is
`c1f447d8df776319fcd72f543e666fde512b434282a8cb09609c40955f98d660`.
The audit checked the ordered selection and dependency edges against the
pinned indexes, checked all archived files against the catalogue, and matched
all 980 solution bodies against the upstream hashes after removing the export
headers. The source archive is 2,609,428 bytes and its Lean files total
15,684,253 bytes. The catalogue is 8,828,883 bytes. The selective fetch
retrieved 112,302,966 response-body bytes, including the three index shards
and three graph shards used to select and audit the records.

Upstream proof statuses are retained as source evidence. This pilot has no
local Lean recheck, transitive import closure, or scientific admission.

### Scientific admission receipts

A curator can import an independently signed receipt for the current staged
candidate. The private image pins `products/claimipedia/scientific-admission-authorities.rel`
as a declared dataset. Its `ed25519PublicKey` facts bind verified authority IDs
to raw 32-byte public keys in lowercase hex. The checked-in registry starts
empty. An independently verified key and an updated dataset SHA-256 are required
before building an image that trusts that authority.

The authority signs the exact UTF-8 bytes of the typed REL
`ClaimipediaScientificAdmissionDecision`. Encode the value as a sequence of
two-item sequences containing the field name and its text value. The sequence
starts with `protocol`
(`claimipedia/scientific-admission-decision/1`), `id`, `authority`, `decision`
(`admitted`), `claim`, `revision`, `candidate`, `candidateSha256`,
`handoff` and `handoffSha256`. The intake envelope is typed REL
`ClaimipediaScientificAdmissionReceipt` with the decision record in
`decision` and the detached 64-byte signature in `signature` as lowercase
hex. Claimipedia checks the current review basis, candidate and handoff pins,
trusted authority signature, and replay before recording the signed decision.
Public release requires separate publication authority.

The editable preview on aaron-dev uses the Encounter 0.1.15 executable and
a pinned private Claimipedia image. Its active launch file is
`../../../state/encounter-claimipedia-deployment/corpus-aster.l63wcN/private-launch.rel`.
It selects the working store, verified attachment mount, and separate reviewer
and curator identities. Sign in on loopback port 24210 with the account for the
desired editorial action. Both accounts were verified on the live preview.
Approval, staging, scientific admission handoff, and publication refusal were
exercised on a disposable copy of its store. The
[handoff cutover receipt](../../../receipts/20261109T102759280927Z-claimipedia-admission-handoff-cutover-d3338b70/RUN.md)
records the separate public reader checks.

The user service is `encounter-claimipedia-private-preview.service`.
Use `systemctl --user restart encounter-claimipedia-private-preview` to
restart the installed release. Source edits require a new compiled image
before they appear in this preview. To try source changes separately, use
the JS host with a disposable store and a free port.

```bash
scratch=$(mktemp -d /tmp/claimipedia-source.XXXXXX)
ENCOUNTER_PORT=0 node bootstrap/server.cjs "$scratch"
```

Set `ENCOUNTER_ATTACHMENT_ROOT` to the verified transfer root to try
original downloads in that source preview.

When using the installed preview, open a Windows tunnel:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 24210:127.0.0.1:24210 aaron-dev
```

Open http://127.0.0.1:24210. For the test suite, use the server's existing
`bin/browser-profile.cjs` via `ENCOUNTER_PLAYWRIGHT` and a short private
`TMPDIR`, then run `node test/run.cjs`.

## Loader declarations

The editable workspace and the public reader declare their modules, entries,
effect grants and dataset pins in `products/claimipedia/application.loader.encounter`
and `products/claimipedia/reader.loader.encounter`. Both select the same pinned
release corpus and keep their own grant lists.

From the Claimipedia package root, regenerate and verify the loader projections
with the shared Encounter declaration tool.

```sh
node ../../encounter-platform/shared/node/loader-declarations.cjs --write \
  products/claimipedia/application.rel products/claimipedia/reader.rel
node ../../encounter-platform/shared/node/loader-declarations.cjs --check \
  products/claimipedia/application.rel products/claimipedia/reader.rel
```

The Node and Rust loaders consume the generated REL at the existing paths.

## Claimipedia design contract

`source/products/claimipedia/design.encounter` owns the Claimipedia palette,
shell, named styles and element contract for the reader and steward workspace.
Its reference is the transferred Claimipedia identity v2 in
`../../claimipedia-source/sourcery-applications/applications/claimipedia/ui/`.
The shield comes from `claimipedia-mark.svg`. The Claims view and claim reader
in `app.js` and their rules in `styles.css` supply the teal masthead, hero,
reading path, statement-first rows and claim dossier. Search rows identify
released and locally accepted wording. Claim detail gives released versions,
evidence, relationships and local drafts distinct panels. The Encounter
preview uses its own corpus and collection links. All steward collections
use the same compact workspace shell and named form styles.

The declared `ui.styles` entry generates CSS from the named style catalogue.
Every page tree is checked before HTML serialization. The validator checks
component tags, approved parent slots, list and form structure, and link
nesting. It refuses unknown classes, inline CSS and alternate stylesheets.
The reader retains its own hero and atlas styles. Steward pages use a compact
heading and panel layout. Panel row selectors apply to direct list rows so
nested evidence and dependency lists retain their own structure.

Both declarations pin `products/claimipedia/style-approval.rel`. Its digest
covers the generated stylesheet and the catalogue's parent placements.
The HTML and stylesheet entry points refuse a mismatch. A proposed change
to CSS or placements requires review of the generated stylesheet and the
affected pages before updating the separate approval record and its two
declaration pins. This is a source-review boundary shared by Node and Rust.

Use the source preview instructions above to try the UI with a disposable
store. For the Rust equivalent, build and serve a pinned image from this
directory after sourcing the workspace environment:

```bash
scratch=$(mktemp -d /tmp/claimipedia-design.XXXXXX)
runtime="$DEV_ROOT/projects/encounter-core/target/release/encounter"
pin=$("$runtime" build-guarded-image \
  "$DEV_ROOT/projects" claimipedia 0.1.15 "$runtime" "$scratch/claimipedia.rel")
"$runtime" serve --image "$scratch/claimipedia.rel" "$pin" "$scratch/store" 0
```

The suite checks the claims pages, stylesheet, keyboard navigation, narrow
viewports and projection refusals. Run `node test/run.cjs` for Node and
`ENCOUNTER_RUST_HOST="$runtime" ENCOUNTER_RUST_IMAGE=1 node test/run.cjs`
for the freshly compiled Rust image.

## Released reader and steward entry

The forwarded development preview uses two compiled declarations.
`products/claimipedia/reader.rel` selects the pinned release and shares the
Claimipedia component catalogue with the editable image. The reader owns
search, atlas, released evidence and related-claim navigation. It has no
application grants for working-store reads, writes or attachments.

`source/products/claimipedia/atlas.encounter` adapts the region cards, first
trails and region bearing from Worldwright's source-owned geography. Its
regions use the recorded claim types in the released corpus. Returning from
a dossier restores the search query or atlas region and anchors to the
original claim. The first trail starts with the released claim about
counterfactual exploration in simulations. The reader projection retires
the three North River demonstration claims and their attached records.
The pinned corpus retains the fixture for steward and regression workflows.
`atlas-map.encounter` ports the geometry of Worldwright’s
`source/assets/world/atlas-grid.svg` and its station canvas. It places released
claims in their recorded type regions and draws directed lines from the corpus
relationship subjects. Selecting a station highlights its connections and
gives a text route to each neighbour. The dossier links back to that station.
The map is SVG in the shared projection and needs no client-side script.
Regions shows the full graph. Dependencies, Arguments and Revision lineage
show the corresponding released relationship kinds. Selecting a claim in
one of those maps arranges its immediate neighbours in incoming and outgoing
lanes, with reciprocal neighbours in the middle lane. Switching maps and
opening the dossier preserve the selected claim and current region. Each
connection shows its released relationship ID and provenance in the atlas
and dossier. Parallel and reciprocal records use separate curves. Selecting
a stroke takes the reader to the corresponding relationship record.

The preview proxy serves the reader at `/` and routes the steward workspace
through the entry page at `/steward`. Choosing to enter sets a browser-session
flag and takes the visitor to `/steward/`. This entry step is an audience
choice without sign-in. The steward image uses the existing editable preview
store and prefixes its links and form targets. Verified operator actions
continue to use their own existing role checks.

## Knowledge ecology and Ask Aster

The reader and development workspace link to `/ecology` and `/aster`. The
mounted steward workspace lists them under Surface index. Forward the reader
preview with `ssh -N -L 51912:127.0.0.1:24211 aaron-dev` and open
`http://localhost:51912/ecology` or `http://localhost:51912/aster`. The ecology map
projects six roles and five directed relationships from
`products/claimipedia/knowledge-ecology.rel`, which records their retained
Claimipedia source. The static SVG motifs use the shared Encounter renderer.

Ask Aster searches the released claim wording, scope, and linked evidence
metadata. Results explain the matching terms and link to the exact claim and
evidence coordinates. The same search programme is used in Sourcery Notes.
Questions are submitted by form and are not written to the corpus store.

## Surface index

Open the Surface index from the steward collection navigation. The index lists
the eight editable collections and the selected published entry points.
Its historical register is searchable by title, route, type or status. It
reads the pinned, byte-identical copy of the 307-record transferred
`content-surface-register.rel`. Historical paths are shown as text. Published
links come from the separate list in `surfaces.encounter`.

## Conversion checkpoints

The draft browser scenario checks a release-to-draft comparison, revision of a
saved draft, rejection of a stale acceptance, acceptance of the reviewed
version, discard after acceptance, and cold reopening at phone width. It checks
the release hash and byte identity. The existing statusless format is read as
pending for the newest legacy draft and superseded for earlier drafts.

The Frontier baselines were checked against the legacy
`frontier-claims.mjs` and `frontier-research-arms.mjs` data exports in
`../../claimipedia-source/sourcery-applications/applications/claimipedia/`.
Both legacy validators passed, and the typed REL round trips reproduced their
data values. The imported originals and transfer verification are in
`../../claimipedia-source/.migration/`. The shared host loads declared REL
datasets. Encounter owns the search, rendering, field validation, revision
policy and storage commands.

The Frontier browser scenarios check local warrant editing and search after
cold reopening, two successive arm edits, a stale arm submission, and a
reference edit whose legacy ID also identifies another row. They verify
the imported arm, its assessment links, and the reference’s original URL
alongside the local revision history. Seven reference
IDs occur in multiple original rows, so the reference catalogue retains rows
and URLs independently of the legacy ID. These checks establish
local behavior and transfer fidelity. Research dispositions are historical
records. The Evidence library carries the wider physics and selected evidence
collections as verified provenance records. The four linked texts travel
with the image. A configured mount provides the full set of originals. The internal deployment records are available for
inspection. The legacy authority workflows still use their original system. The local
revision document shares the existing host size bound, so this is a
development store with bounded history capacity.


The host defaults to the Claimipedia declaration. The retired authoring demo
and its unused modules are recoverable under
`../../../state/encounter-claimipedia/retired-authoring-files/`. The two
generic sources exercised by the type and action contracts remain in the app.
The app tree has zero JSON files. Native CommonJS modules supply the host,
bootstrap, storage, codecs and verification transport.

### Checkpoint transfer qualification

The SRP8 and SRP10–SRP12 records and the internal deployment admission facts
are byte-identical to their verified sources. The local notes use a
discriminated revision record carried in the existing revision document.
The browser test rejects a stale note, checks both revisions after an
unrelated draft save and cold restart, and confirms that the imported status
and source bytes are identical. The release rehearsal also checks that an
older image can save a Frontier revision without discarding the newer note.

This qualifies source fidelity, local revision behavior and the tested
runtime rollback. Evidence files beyond the transferred record coordinates,
scientific conclusions and operational authority retain their original
scope. Additional collection and workflow transfers remain separate slices.

### Research review boundary

The local proposal and disposition stages follow the separate decision
pattern in the transferred `research-control-plane-kernel.mjs` and
`research-control-plane-operations.mjs`. Encounter stores the opportunity
ID, imported status, evidence coordinate and SHA-256 with the proposal.
A decision links to the exact proposal and requires a rationale. The
configured host verifies the operator and passes the proposer or reviewer
identity to Encounter. Existing records with self-entered names stay in
history with their original attribution. The workflow records a local
decision and leaves the historical disposition visible. The original
execution leases, upstream reconciliation and operational authority remain
in the legacy system. The browser and release tests verify stale refusal,
the pinned evidence link and survival across restart and rollback. They
also check that a valid proposer session cannot record a decision using
a forged reviewer name. The runtime README documents the private REL
operator file.


### Frozen manual follow-up packet

A verified reviewer can freeze a current approval once. The packet includes
the imported opportunity facts, exact proposal and decision, pinned
evidence coordinate, and reviewer rationale. Encounter stores the canonical
REL text and its SHA-256, and renders the text for inspection. Approvals
from images that predate the opportunity source pin remain in review
history. Freezing requires a new proposal and decision with that pin.

The packet is a handoff for manual follow-up. It records separate
execution, scientific admission and publication boundaries. This translates
the frozen-input step from the legacy Research Control Plane. The release
rehearsal checks the packet bytes on a disposable copy before and after an
older-image write. Legacy general-purpose execution and worker operations retain their own
authority.

### Supervised evidence check

A verified reviewer can issue a 15-minute lease for the current frozen
packet to a named worker operator. The worker checks the exact mounted file
against the size and SHA-256 stored in that packet. The result appends one
integrity receipt and consumes the lease. A missing mount leaves the lease
available. A missing or changed file on a configured mount records a failed
check. A reviewer can issue another lease after a failed check or expiry.
The current packet and lease coordinates and the SQLite compare-and-swap
head protect against stale forms and duplicate committed receipts.

This is a bounded translation of the legacy supervised lease into an
evidence integrity check. The host supplies the operator and request time
and reads the bounded file. Encounter decides who can issue and consume the
lease and records the history. The receipt records a byte comparison.
Scientific admission and publication remain separate.


### Independent evidence review and reconciliation

The verifier checks the worker, lease window, frozen packet hash and
evidence coordinates, then independently rechecks the mounted bytes.
An integrity hold stays in history. A confirmed review lets a reviewer
propose a REL patch containing only evidence integrity links. The patch
carries its source, packet and receipt coordinates and its own SHA-256.
A separate reconciler can approve it for manual application, reject it
or defer it. A curator can explicitly confirm and apply the approved patch
to the local working copy. Application rechecks the frozen source facts,
approved patch, review and receipt before appending the two evidence
integrity links and an application record. Source pins for new proposals
hash ordered REL fact tuples so both hosts use the same representation.

This translates the evidence-integrity branch of the legacy independent
review and reconciliation workflows. The imported research facts stay
visible alongside the local history. Manual upstream application,
scientific admission and publication remain distinct decisions. The
rehearsal uses a disposable copy and verifies the exact proposal text and
recorded disposition and applied local evidence facts after an older-image write.
