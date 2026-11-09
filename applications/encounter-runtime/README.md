# Encounter native command pilot

This package runs the existing Workgarden Add command against a journal-backed board.
The Linux `encounter` binary depends on the Temple3 Rust library in the sibling
research checkout. Node supplies test transports for the differential, browser and release checks.

From the aaron-dev development workspace:

```bash
source env/temple3-linux-toolchain/environment.sh
cd projects/applications/encounter-runtime
cargo build --locked --offline --release
target/release/encounter test
```

To try Add from the CLI, use a private disposable journal directory:

```bash
journal=$(mktemp -d)
target/release/encounter run "$journal" genesis demo-add '  Café 🌱  '
target/release/encounter run "$journal" genesis demo-add '  Café 🌱  '
```

The second invocation returns the original witness and journal record with
`replayed` set to true. `genesis` resolves to the exact root of the pinned
profile. For each additional Add, pass the last accepted result's `head` as
the basis and use a new operation ID. This laboratory profile uses a public signing seed and a
source-bound genesis. Use only disposable directories.

## Serve the Workgarden form

After building, start a foreground server with a disposable journal:

```bash
journal=$(mktemp -d)
target/release/encounter serve "$journal" 24211
```

Open [Workgarden](http://127.0.0.1:24211/) locally or forward the same port
from aaron-dev. The server binds only to IPv4 loopback. It serves the pinned
Encounter Add form and passes its exact base and operation coordinate to the
same command and Temple3 journal path as `encounter run`. Each Add uses the
current signed board state. Workgarden displays all committed items in order
and offers Add up to the Temple3 relation's eight-item bound. Restart with
the same journal to replay the board.
Port `0` selects a free port and prints the URL on startup.

To run the browser verification on aaron-dev, source the workspace
`environment.sh` as well as the Rust toolchain profile and use a short
private `TMPDIR`. From this package, run:

```bash
node test/browser.cjs
```

The browser test uses the existing Playwright profile, starts two successive
loopback server processes, and removes its disposable journal on exit. It
checks blank input, eight keyboard Adds, a stale submission from another tab
after the second Add, and the exact retained journal after a cold restart.

## Serve the Claimipedia release

The same executable also serves the read-only Claimipedia browser profile:

```bash
target/release/encounter serve --app claimipedia 24212
```

On aaron-dev, the native release preview is available through an SSH tunnel
to port 24212. The existing preview on port 24210 continues to serve the
editable working corpus, draft history, Frontier assessments, research and
references.

The native profile reads the pinned v1.0.0 REL release declared by the existing
Claimipedia application. It runs the existing Encounter catalogue, search and
released-history processes. Search results show the release wording, and each
result opens its released revision history. This profile has no draft or
journal binding and accepts GET requests only.

`node test/browser.cjs` also opens Claimipedia through the Rust executable,
checks the 122-claim catalogue, submits searches with matches and without
matches, follows a result to release history and verifies write refusal.

## Contracts and ownership

- `bootstrap/bootstrap.rel` versions the command profile, pins the existing
  reference foundation, selects the port registry, and declares the shared
  20M budget. The Rust source-command subset charges source bytes and
  evaluation steps to that budget, including nested calls. The JS oracle
  uses the existing source-policy compiler and its own meter. Agreement is
  checked on decisions and data values, with each implementation's own
  accounting.
- `bootstrap/ports.rel` names inputs, outputs, effects and failures. The
  source receives only the admitted command and text ports. The journal
  bindings are available to the adapter, outside the source's grant set.
  This Rust text matcher supports only the bounded whole-string UTF-16
  length pattern exercised by the app. Other patterns refuse.
- `profiles/workgarden.rel` pins the actual Workgarden command and helper
  modules. The native loader parses and admits the selected command closure
  from source. The pilot handles Add. Its state mapping assigns the next
  `todo.N` item coordinate from the verified board and uses a separate
  operation ID for retry. The existing application and its SQLite store keep their own
  interface and representation.
- `profiles/workgarden-covenant.rel` declares the exact authority and
  transition constraints. The native adapter binds the admitted result to
  the Temple3 command and proposed cell replacement. Temple3 independently
  verifies the normalized command, the selected before and after values, and
  the active covenant. Raw title normalization is exercised in the
  differential test at the Encounter boundary.
- The journal lock spans replay, basis check, decision and append. A stale
  basis and an operation ID conflict refuse before append. Temple3 covenant
  rejection has a signed witness and preserves the state root. A write
  error with uncertain outcome returns `unknown-write-outcome`. Reopen and retry the
  same operation. Journal records use Temple3's canonical JSON protocol.
  The CLI also returns JSON on stdout for inspection and test transport.
  Checked-in bootstrap, profile and fixture data use REL.

The web projection has a separate pinned profile, so browser UI changes
can be qualified independently of the command profile that anchors the journal.

## Verification scope

The differential, browser, release and transfer reconciliation programmes
are under `test/programmes/`. The CJS entry points supply the independent
oracles and the process, browser, filesystem and SQLite transports. The
app-specific upgrade workflows are defined in `upgrade-workflows.encounter`. The read-only Claimipedia browser scenario requires
source bytes that match the pins in `profiles/claimipedia-web.rel`.

`encounter test` launches fresh Rust processes against disposable journals
and runs the actual source through the independent JS Encounter front door.
It checks the non-ASCII Add, blank input refusal, stale basis, operation
conflict, exact retry after reopening, and rejection of a modified
successor. The JS Temple3 implementation independently rebuilds the accepted
delta and replays both journals, checking the exact signed witnesses and
resulting roots. The accepted journal contains genesis plus one transition.
The rejected journal contains genesis plus one rejection and retains
sequence zero.

This is a source-loaded Linux lab profile. A general compiler, portable
AOT image, production daemon operation, operational key custody, and existing
store migration are outside this slice. The test establishes behavior on
the selected command and refusal cases. It provides neither a full-language
conformance result nor production durability qualification.

## Check an application declaration

Run the loader against a package root and a declaration path relative to it:

```bash
target/release/encounter check ../encounter-claimipedia products/claimipedia/application.rel
target/release/encounter check ../encounter-work-boards products/workgarden/application.rel
```

The loader resolves modules and datasets inside the supplied root, verifies
declared data pins, and decodes both fact REL and typed ApplicationData.
It attempts native admission separately for each declared entry. The report
also lists unbound grants, partially implemented ports, and a syntax inventory
of the declared modules. That inventory includes helpers that may lie outside
an admitted entry's dependency graph.

Exit 0 means the declared entries and grant names passed static admission.
Exit 2 means the declaration loaded and admission reported blockers.
Exit 1 means the command or declaration could not be loaded. Static admission
and browser workflow verification are separate checks. The existing Workgarden
and Claimipedia pilot profiles continue to use narrower entry sets.

## Package and verify a Linux release

From this directory in a fresh platform checkout, with the aaron-dev Rust and
browser profiles loaded, stage the Temple3 input before building. On aaron-dev
`TEMPLE3_SOURCE` is the workspace's `projects/research/temple3` intake. The
staging script copies the files listed in `temple3.sha256`, checks their hashes,
and only then installs them at the path used by Cargo and the Node reference
tests.

```bash
./stage-temple3.sh "$TEMPLE3_SOURCE"
cargo build --locked --offline --release
./package-release.sh 0.1.7 target/release/encounter "$RELEASE_DIRECTORY"
```

The archive has a versioned directory, a Rust executable, compiled images for
all 12 applications in `release-applications-platform.rel`, and `release.rel`
with their SHA-256 pins. Releases starting with 0.1.3 include the pinned REL
platform and application port specifications. Check the separate archive
checksum with `sha256sum -c` in the output directory. The extracted README gives
the image-serving command. The package uses the host's x86-64 Linux system
libraries, including `libsqlite3.so.0`.

Run the existing workflows against a fresh extraction and disposable stores:

```bash
cargo build --locked --offline --release --features test-faults --target-dir target/fault-tests
test/release-workflows.sh "$RELEASE_DIRECTORY/encounter-0.1.7-linux-x86_64.tar.gz" target/fault-tests/release/encounter
```

The browser transport starts the extracted executable with each packaged
image and its manifest pin. Restarts reuse the same packaged image. The
reconciliation scenario runs separately with the supplied fault-test binary
and a matching image built for it.

Use the historical 13-app archives and matching external Claimipedia source for the 0.1.1 to 0.1.2 browser upgrade check. That harness reads the retained aggregate catalogue `release-applications.rel`:

```bash
releases=../../../builds/encounter-releases
node test/release.cjs "$releases/encounter-0.1.1-linux-x86_64.tar.gz" "$releases/encounter-0.1.2-linux-x86_64.tar.gz"
```

The 0.1.1 archive supplies the Workgarden and Claimipedia images. Its archived
executable builds the other 11 baseline images from the application source in
the workspace into a temporary directory. The test checks that each app has
the same source basis and compiled programme in both versions, and uses the
matching runtime-pinned image at each step.

Each baseline store is populated through the browser. The test shuts down the
old server, copies the checkpointed database, and checks the saved state in
the new server's browser UI. A new browser save must append one revision with
the previous head as its parent. The test compares every existing metadata,
revision and document row before and after the save, reopens the new
revision on the older runtime, and checks the baseline database hash.

To rehearse the current Claimipedia app update as well as the runtime upgrade,
pass the path to the private database. The harness opens it read-only, takes
an online SQLite backup, and writes only to disposable copies.

```bash
node test/reconcile-claimipedia.cjs
node test/release.cjs "$releases/encounter-0.1.5-linux-x86_64.tar.gz" \
  "$releases/encounter-0.1.6-linux-x86_64.tar.gz" \
  ../../../state/encounter-claimipedia/workspace.sqlite --claimipedia-update --evidence-library
```

The rehearsal checks released evidence, Frontier, research arms and
references. With `--evidence-library`, it follows the SRP10–SRP12 evidence
link and checks the source pin before saving a note. It reopens the same
copy with the older runtime and image, saves again, and verifies the new
note after switching back. It restores the original backup into a separate directory
and checks its contents. The test requires matching source and programme
pins for every app except the explicitly selected Claimipedia update.

## Run with a versioned REL launch file

`spec/platform.rel` defines the declaration, image, store and launch contracts.
`spec/application-ports.rel` lists port shapes, effects and the portable
boundaries exercised by the conformance fixtures. The original Temple3
bootstrap remains pinned by the journal profile.

A file beside an extracted release can select the image and store. Set the
SHA-256 from that release's `release.rel`.

```text
("launch", "version", "encounter/launch/1")
("launch", "mode", "image")
("launch", "image", "release/images/workgarden.rel")
("launch", "sha256", "<Workgarden image SHA-256>")
("launch", "store", "workgarden-store")
("launch", "port", "24211")
```

Run `release/bin/encounter --config launch.rel serve`. For the Temple3
Workgarden pilot, set mode `workgarden-journal` and replace the image fields
with `runtimeRoot` pointing to this source tree and `journal` pointing to the
journal directory. The same launch file supports `serve`,
`run BASIS OPERATION TITLE` and `test`. The configured test reads the source
tree and uses its own disposable journal.

The HTTP server listens on loopback and prints the bound origin. It drains
the active request and exits on SIGTERM, SIGINT or the `close` stdin command.
On aaron-dev, verify a packaged server under a transient user unit with
`test/supervised-release.sh RELEASE_ARCHIVE`. It checks both process exit
codes and that a browser save survives a stop and restart.

For a planned upgrade, stop the supervisor and take a checkpointed backup or
use SQLite online backup while the old process is running. Restore into a new
directory, check SQLite integrity, and start the new runtime with its own
pinned image. A rollback after writes reuses the current database only for an
application pair qualified by the compatibility check. Restore an earlier
snapshot into a separate directory when recovering that earlier point in time.

## Build and serve a pinned compiled image

```bash
workspace=$(mktemp -d)
pin=$(target/release/encounter build ../encounter-work-boards \
  products/workgarden/application.rel "$workspace/workgarden.rel")
target/release/encounter serve --image "$workspace/workgarden.rel" "$pin" \
  "$workspace/store" 24211
```

For Claimipedia, use package root `../encounter-claimipedia` and declaration
`products/claimipedia/application.rel`. Use a separate store directory.
Build parses, links and admits the declared entries from Encounter source.
The version 2 REL image contains the resulting instruction programme, the
declaration, source, datasets and any declared source catalogue. Builds from
the same runtime binary and file bytes produce identical image bytes,
independent of the output path and build time. Build prints the SHA-256 on
stdout and publishes to a fresh output path.

Use the expected image hash from a trusted build or release record. Before
opening the store, the loader checks the image hash, the exact runtime binary
pin, each embedded file hash, the application basis and the compiled programme
hash. It validates the instruction shapes, operators, grants and reachable
entries, then runs those instructions directly. The source-to-instruction
correspondence comes from the pinned build. Declared application source
compiles at build time. User-authored dynamic actions retain their bounded
source compilation path. A new runtime binary requires a fresh image build.

## Serve a declared application with SQLite

To run Workgarden's original browser application against a disposable store:

```bash
store=$(mktemp -d)
target/release/encounter serve --declaration ../encounter-work-boards \
  products/workgarden/application.rel "$store" 24211
```

The shared adapter invokes the declaration's `app.newSession`,
`app.request` and `ui.styles` entries. The application owns form handling,
revision review and HTML. The Rust host supplies HTTP sessions, the REL value
codec and SQLite revision ports. Restart with the same directory to reopen the
board. This uses the document-store profile. The Temple3 journal pilot remains
available through `encounter serve JOURNAL [PORT]`.

Browser verification exercises Add, Complete, stale-form refusal and Reopen
after a cold restart. The JS REL codec reads the stored document independently.
The SQLite checks cover exact retry, operation conflicts, immutable revisions,
and rollback when a document write fails. The host links the system
`libsqlite3.so.0` on aaron-dev.

Harborboard uses the same declared server and a separate store. Select
`products/harborboard/application.rel` to run it. The browser test saves an
epic, changes plans, adds dependencies, refuses a cycle without writing a
revision, and verifies the board after a cold restart.

Timesheet uses the same declared server with
`products/timesheet/application.rel`. The browser test checks calendar
validation, logging and approving fractional hours, the daily hours limit,
and the approved total after restart.

The numeric port supports `min`, `max`, `divide`, `subtract`,
`remainder`, `multiply`, `round`, `floor` and ordered comparisons. The
shared matcher covers bounded text lengths, HTML serializer patterns, date
and decimal inputs, identifiers, hex tokens and HTTP URLs. Declared apps can
read both default and named datasets through `application.data`. Broader regex and arithmetic
coverage remain separate checks.
Application admission and a home-page browser smoke test qualify launch.
Workflow tests qualify the particular operations they exercise.


## Serve the authoring loop

```bash
store=$(mktemp -d)
target/release/encounter serve --declaration ../encounter \
  bootstrap/application.rel "$store" 24213
```

The browser test constructs a typed journal entry through explicit review,
refuses an action with a mismatched output type, uses an accepted action in a
row projection, inspects the source catalogue and history, and cold-reopens the
workspace.

Source observation returns the inspected expression and source hash for the
one-expression `run` profile. Execution reparses the source under the caller's
meter and supplies only the event input. The executable profile accepts pure
scalar expressions with `concat`, `add`, `if`, and `eq`. The source catalogue
lists declared application modules and hash-verified foundation modules.
The native observation port currently exposes no per-token source spans.


## Run the original browser scenarios on Rust

After sourcing the aaron-dev browser and Rust profiles, build the standard
binary and the separate fault-test binary from this directory:

```bash
cargo build --locked --offline --release
cargo build --locked --offline --release --features test-faults --target-dir target/fault-tests
export ENCOUNTER_RUST_HOST="$PWD/target/release/encounter"
export ENCOUNTER_RUST_FAULT_HOST="$PWD/target/fault-tests/release/encounter"
export TMPDIR=$(mktemp -d /tmp/enc-workflows.XXXXXX)
export ENCOUNTER_TEST_OUTPUT="$TMPDIR"
```

Run these existing suites from their application roots. Setting the host
variable changes the browser transport to start the Rust declared server.
Set `ENCOUNTER_RUST_IMAGE=1` to build and launch each scenario from its
pinned compiled image. Restarts reuse the same image and pin within the scenario.
The suites retain their original scenario assertions.

| Application root | Commands |
| --- | --- |
| `encounter-portfolio` | `node test/run.cjs` |
| `encounter-claimipedia` | `node test/run.cjs` |
| `encounter-work-boards` | `node --test test/work-boards.test.cjs` |
| `encounter` | `node test/ui-only.cjs`, `node test/second-domain.cjs`, `node test/reconciliation.cjs` |

The authoring tests write their stores and generated evidence to
`ENCOUNTER_TEST_OUTPUT`. Remove the temporary directory after reviewing
the run. Only reconciliation uses the fault-test executable. It injects one
lost response before or after the actual SQLite commit. The regular binary
has no fault injection switch.
