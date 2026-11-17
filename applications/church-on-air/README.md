# Church on Air

A local video composition CLI and production studio. The supplied church footage becomes a 72.48-second, 4:3 broadcast: VHS receiver lock, animated VGA panels, perspective grid, rotating wireframe cubes, rolling copy, sound-responsive meters and five transition mechanisms. The original church audio follows the corresponding pictures. No replacement music, voice generation or synthetic church footage is used in that clean church cut.

A separate [Dot making-of film](docs/dot-making-of.md) reveals the real studio interface, brings in the bundled Codex mascot and adds locally synthesized first-person commentary. The original church cut remains available. Its script, word timings, actual UI captures and Encounter projections are kept distinct from the original footage.

The director's cut deliberately changes register. A short opening and two brisk invitation movements lead into a longer open worship passage. Graphics return for the invitation home and the closing hold. Read [the timing and direction note](docs/director-note.md) for source windows, observations and editorial reasons.

## Run

From the outer repository:

```powershell
node applications/church-on-air/cli.cjs help
node applications/church-on-air/cli.cjs compile
node applications/church-on-air/cli.cjs inspect worship
node applications/church-on-air/cli.cjs render
node applications/church-on-air/cli.cjs verify
node applications/church-on-air/cli.cjs serve --port 4187
```

Open the loopback URL printed by `serve`. The local production surface has a source bin, source/programme monitor, transport and frame stepping, V1/G1/A1 timeline, measured waveform, shot inspector, rhythm/source inspection, Encounter edit destinations and a real render control. It is a focused production tool, not an implementation of every Adobe editor feature. Editing a field changes checked source; rendered picture remains explicitly stale until the next render. One field is applied per proposal.

This working folder is already bound to the five downloaded source files and the task-local FFmpeg executable. For a fresh setup, supply explicit local paths:

```powershell
node applications/church-on-air/cli.cjs init --media-dir ABSOLUTE_MEDIA_DIRECTORY --ffmpeg ABSOLUTE_FFMPEG_EXE --python ABSOLUTE_PYTHON_EXE
node applications/church-on-air/cli.cjs analyze
node applications/church-on-air/cli.cjs compile
```

Each media file is named `<tweet-id>.mp4`, with its original X syndication metadata beside it as `<tweet-id>.json`. Python needs NumPy and Pillow. The supplied raster profile uses Windows `CascadiaMono.ttf` and `arialbd.ttf`; other operating systems/fonts require an explicit native-profile adaptation. Node needs the sibling `perth-revival-2027` runtime. No external web service, CDN font, external API credential or hosted Site is required.

`.local/` holds machine paths, downloaded-media bindings, observations, contact sheets, render snapshots, videos, source predecessors and verification receipts. It is ignored. Source media remains in its original task directory rather than being duplicated into the repository. Running a render retains a prior result under `.local/renders/<sha256>/`, stages its replacement and serializes this tool's render work with an exclusive lock. An interrupted render leaves a lock with its owning PID for deliberate inspection; no automatic stale-lock takeover occurs.

## Source and execution

| Owner | Role |
| --- | --- |
| `source/composition.rel` | Authored shot facts: source in, duration, title, copy, layout, transition, tracking and editorial reason. |
| `source/contracts.rel` | Closed Shot and Cut interfaces. Decimal seconds are strings under the retained Encounter profile. |
| `source/composition.encounter` | Typed views, visual representation and explicit reverse routes back to REL facts. This is actual retained Encounter syntax, not a renamed JSON edit list. |
| `source/project.json` | Intent, source set, output profile, palette and explicit policy limits. |
| `source/graphics.json` | Graphic recipes, picture-window geometry, component membership, text sources, entrance and hold values. |
| `algebra/broadcast.process.json` | Pure checked composition, recipe selection, timing/source bounds and continuity decisions. |
| `bootstrap/runtime.cjs` | Loads, lowers, admits and invokes the existing Temple/Encounter modules. Records exact dependency hashes and measured budgets. |
| `native/analyze.py` | Explicit media observations: RMS, spectral-flux candidates, source hashes and contact sheets. |
| `native/render.py` | Raster and codec mechanisms selected by the plan: text metrics, geometric projection, tape distortion, transitions and encoding. |
| `surface/` | Local browser projection and controls over the same checked plan and edit routes. It owns no alternative project database. |

The existing Encounter compiler, closed type checker, forward projections and `ec.patch` run through the existing unmodified Temple seed, lowerer, admission and kernel bridges. The new broadcast algebra uses explicit value and numeric-observation ports. Its entrypoint is effect-admitted; its model is shape-admitted. Compiled Encounter representations retain their own existing effect checks. The 20-million-step execution limit is unchanged.

This reuses the existing Sourcery-derived expression/algebra contracts. Worldwright contributes the separation between available world/source, authored composition, temporal journey and presentation, documented in the [repository's storytelling exposition](../../corpus/programmes/worldwright-storytelling/README.md). No import or admission of the Worldwright application itself is claimed. [Architecture and correspondence](docs/architecture.md) identifies the shared owners and the explicit native extension.

The browser and CLI both call `propose`, which invokes the real `ec.patch`, forward-verifies its result, and reruns broadcast planning before replacing the REL owner. An exact source basis refuses stale proposals. The previous source and proposal are retained locally. This is a single-host local file workflow, not Slice 02's signed-human durable authoring protocol. Filesystem CAS across independent outside writers, general platform authority, self-hosting and recovery from arbitrary filesystem failure are not claimed. The fixture compiler's legacy diagnostic file labels are retained; receipts separately identify this application's exact source owners.

`bootstrap/make-source.cjs` records the one-time initial source construction. It is not a runtime dependency or the owner of subsequent edits. Do not rerun it to overwrite a composition you have revised.

## Verify

```powershell
node --test --test-concurrency=1 applications/church-on-air/test/composition.test.cjs
node applications/church-on-air/cli.cjs verify
```

The first suite checks actual compilation, source-bound edits, preserved unrelated projections, stale refusals, undeclared edits, off-frame times, malformed time values, source overruns, unknown transitions, duplicate cardinality and text limits. Native verification checks the output hash, all decoded frames, output format and audio peak. Its receipt states the limit: this is not certification of perceived musical phrase boundaries, lyric timing or lip sync. Contact-sheet and browser reviews are additional same-run checks, not independent confirmations.

No existing Encounter editor, Mainframe, Worldwright application, public website, publication authority or scientific admission is changed. This new video application and its local surface are the scope of the current request.
