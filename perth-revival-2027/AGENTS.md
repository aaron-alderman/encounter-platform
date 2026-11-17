# Encounter and Temple: start here

The editor website, workbench, Thing-iverse/Zoo UI and Mainframe were discarded at the user's request. They are not foundations for a replacement. Historical source remains on `codex/encounter-language-story` at `a4ec3be`; do not restore their layouts, interactions or build hooks without a new request.

This branch retains the public Perth Encounter event site and the headless language/algebra work. Read `docs/kernel-contract.md`, `bootstrap/README.md` and `docs/encounter-language-experiment.md` before architecture changes.

## Current authoring direction: read before continuing

The later bespoke first-step literal-binding page was also rejected as an
architectural foundation. Its retained code and tests are historical experiment
evidence, not permission to extend that surface.

Read `docs/authoring-reconstitution/README.md`, then its source inventory,
disposition map, dependency graph and correction record. Existing Sourcery
authoring/live/spatial/conversational machinery supplies the semantic starting
point. Reconstitute its selected contracts through the existing algebra rather
than inventing another parallel editor or importing its MJS implementation tree.

The original inventory and slice seal are design records. The user's later
instruction authorises Slice 01 implementation through the existing algebra,
with source/refusal verification and no new surfaces. Before implementation,
identify source hashes, inventory/disposition IDs, dependencies,
reason/target/goal and correspondence/refusal checks first. Keep supplied bootstrap
definitions distinct from user-authored application definitions. One admissible
semantic action at a time; no invalid intermediate accepted state, hidden defaults,
parallel mutation path or bespoke playbook page. Unresolved bridges remain explicit
in the design instead of being filled by a surface-specific helper.

The first bounded source/correspondence selection is sealed in
`docs/authoring-reconstitution/slice-01/README.md`. Read its closure, source versus
profile contracts, acceptance cases and seal before implementing any part of that
path. The seal is design integrity only: no translated runtime, behavioural pass
or authority admission is implied. Do not silently widen its scalar-operation,
callback, value or effect profile, or change its pinned source oracle.

The implementation successor is `docs/authoring-reconstitution/slice-01-implementation.md`.
Its source-input/collation amendments are explicit and the original seal is
preserved. Runtime semantics live in `algebra/slice-01.process.json`; the MJS
oracle is verification-only and excluded from the headless runtime closure.

The next bounded design is `docs/authoring-reconstitution/slice-02/README.md`.
Read its sealed dependencies, record contracts, human boundary, native contracts
and refusal/crash cases before implementing durable commit. It is design only:
no runtime or surface is authorised by that seal. Preserve Slice 01's source
identity; Slice 02 separately pins newer platform storage sources. Caller actor
strings are not human authentication, callback completion is not durability,
and uncertain commit outcomes must be resolved before any new attempt.

The subsequent user request authorises Slice 02 implementation and headless
source/refusal/crash verification. Its successor record is
`docs/authoring-reconstitution/slice-02-implementation.md`. Preserve the original
design seal. Protocol/type/consent/commit policy belongs to its algebra/REL;
the SQLite/crypto/OS-handle adapters expose mechanisms. A host checkpoint is
read-only external recovery evidence, not an authorable grant. No production
human issuer or backup-rollback assurance is implied by test signatures or local
SQLite checks. No new surfaces are authorised.

The 6 November user goal authorises Slice 03 source-intent intake and correction.
Its immutable source/design package is `docs/authoring-reconstitution/slice-03/`;
read the implementation successor and nullable canonical amendment before
continuing. Reuse the actual retention owner through algebra-owned composition;
do not copy its transaction policy into a new module or native helper. Original
text is authority for its words, proposed interpretation never becomes accepted
meaning merely because it is retained, and later clarification/correction must
preserve originals and explicit predecessor/source coordinates. Bootstrap source
meta-types are supplied; the authored graph starts empty. No new surfaces.

The following user goal authorises Slice 04 general typed construction, sealed
in `docs/authoring-reconstitution/slice-04/` before implementation. Reconstitute
the selected Sourcery Type/Field/Instance meanings; sample Story names and values
are verification inputs, never supplied app definitions. Every added field needs
an explicit whole-existing-instance resolution. Construction must retain its
source and reason/target/goal and use the actual shared human/retention owner.
Discovery is not mutation authority. Preserve original seals and runtime bytes;
new profile adaptations and qualification belong in successor records. No new
surfaces, parallel transaction engine, runtime MJS or additional native domain
policy. General process/projection authoring and the UI-only construction proof
remain separate, uncompleted obligations.

## Ownership

The later user instruction, "Goal continue until full completion not just next
slice", supersedes slice-sized stopping points. Read
`docs/authoring-reconstitution/completion/README.md`. The active goal is the full
G1–G6 authoring/application/recovery/self-extension endpoint. Checkpoints and
passing suites do not complete that goal. The instruction includes the already
specified UI-only construction witness: shared generic authoring realization is
authorised after its common contracts/source closure are justified. The old
discarded surfaces and bespoke playbook pages remain rejected. Preserve prior
sealed runtime bytes and qualify explicit successors. Continue through the
remaining dependencies; do not ask for permission already supplied by this goal.

## Ownership table

| Concern | Owner |
| --- | --- |
| Shared public navigation and footer | `source/language/encounter.temple` |
| Public content, routes, presentation and configuration | Manifest-declared `source/semantic/*.rel` and `algebra/view.rel` |
| Public HTML/CSS, browser/worker decisions and assurance | `algebra/{dom,html,css,browser,worker,assurance,build}.process.json` |
| Fact-language syntax and REL emission | `algebra/language.process.json` |
| Headless Encounter compiler, types and projection/edit rules | `algebra/encounter-code-{compiler,types,runtime}.process.json`, `source/experiment/` |
| Pure source handling and process reflection | `algebra/source.process.json`, `algebra/reflection.process.json` |
| Shared lossless lexical source and readable core-process frontend | `algebra/source-lex.process.json`, `algebra/language-process.process.json`, supplied `source/lexical/`; normal lowering/admission/kernel, JSON authority retained |
| Shared lossless source/type presentation, generated listings and role themes | `algebra/source-presentation.process.json`, supplied `source/presentation/source-presentation.json`; composes source encoding and CSS algebra |
| Lowering, operators, indexing and admission | Corresponding modules in `algebra/` |
| Native effects and observation | Explicit adapters in `bootstrap/ports/`, selected by `bootstrap/ports.json` |
| Pure execution mechanics | `bootstrap/temple-seed.cjs` |

The retained `source/semantic/encounter-desire.rel` records intent, not an accepted interface or completed capabilities. Recovery sources are provenance, not runtime dependencies or authority.

## Boundaries

- Generated HTML, CSS and JavaScript are disposable output. Edit their owners.
- Keep language semantics and application policy in algebra; a CJS/MJS helper hiding application policy does not satisfy this boundary.
- Keep the seed and 20-million-step budget unchanged unless a concrete unmet requirement justifies a separate kernel decision.
- Types, explicit ownership, contextual contributions and checked edit routes remain language requirements. They imply no particular UI.
- Refuse ambiguity and undeclared effects. Preserve original failures and direct corrections to their owner; do not widen grants to make tests pass.
- Do not introduce a replacement surface during removal or maintenance work.

## First authoring-bootstrap step

Historical experiment, superseded as the architectural direction by the
authoring-reconstitution design above. The earlier request to start the playbook authorised the separately
supplied first-step entry point in `bootstrap/authoring.json`. It provides exactly
one construction action: retain the shown source as a primitive Text binding.
`algebra/authoring-first-step.process.json` owns its checks, transition, receipt
and display; `source/bootstrap/first-step.rel` owns the supplied input and styles.
This apparatus is bootstrap two, supplied externally, not a UI-constructed app.
Do not extend this rejected surface. The public-site manifest remains separate.

## Verification

```powershell
node --test --test-concurrency=1 bootstrap/*.test.cjs
node bootstrap/run.cjs
node bootstrap/preview.cjs
```

The preview defaults to the public `index.html`. No editor bundle, Mainframe or language-lab page is generated. The isolated proof builds all eight public pages without MJS modules, node_modules or an external Sourcery service. Headless compiler tests are separate from the public build. Report verification scope accurately; discarded UI receipts are not product acceptance evidence and have been removed.
