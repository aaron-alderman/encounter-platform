# Local delivery verification

9 November 2026, Australia/Perth. One construction and verification family; no independent review or platform admission is claimed.

The delivered film is `.local/church-on-air-b77f1cb50f72c2c4.mp4`, SHA-256 `b77f1cb50f72c2c418bd30ee6893bc25d9f23df1666eb59d55f8aff949b7f463`. It contains 1,812 video frames, 72.48 seconds at 25 fps, 960×720 / 4:3, with AAC stereo audio at 48 kHz. A complete FFmpeg decode passed. Measured audio peak was −4.8 dBFS. This verifies byte identity, frame count, decode and audio format/peak; it is not a perceptual phrase-alignment or lip-sync certificate.

The ten headless tests in `test/composition.test.cjs` passed. They exercise actual retained Encounter compilation and patching through the Temple kernel, frame-exact asymmetric composition, continuous source groups, authored graphics selection, preserved unrelated projections, stale-basis refusal, undeclared reverse routes, off-frame values, out-of-range media, malformed numbers, unknown transitions, competing cardinality and text limits.

Browser observations exercised programme playback, source playback, timeline shot selection, source inspection, the rhythm/source analysis view, an off-frame refusal (`AIR-P008`) and an accepted caption proposal returning to `source/composition.rel`. The render control initiated a real native render. The final programme monitor played to 9.62 seconds with duration 72.48, readyState 4 and no media error. The resulting UI is retained in `.local/studio-preview.jpg`; the analysis view is `.local/studio-analysis.jpg`. The owned QA server was stopped after capture; `node applications/church-on-air/cli.cjs serve --port 4187` starts the delivered local studio.

Visual review exposed title overflow, a source-encoding artifact, an opening-title line break and a Windows preview file lock. Corrections were made at source/recipe/native ownership boundaries. Source attribution uses ASCII under this retained language profile. Content-addressed video files now allow an older preview to remain open while a new result is selected. Prior artifacts, distinct receipt hashes and a mechanism-identity amendment remain retained locally; the current receipt supersedes earlier delivery candidates.

The current source basis is `820d2266fc916b1144814bdd848011a85a9a0687c4b1f9dd08f3c50cdc4ca98f`. `.local/plan.json` records the project and graphics hashes, source hashes, selected recipes and exact semantic runtime closure. `.local/render-receipt.json` records native source stability, codec/font hashes and Python/NumPy/Pillow/FFmpeg versions. `.local/verification.json` is the native verification result. A later source or mechanism change requires a new render and verification.

Reproduce:

```powershell
node --test --test-concurrency=1 applications/church-on-air/test/composition.test.cjs
node applications/church-on-air/cli.cjs compile
node applications/church-on-air/cli.cjs render
node applications/church-on-air/cli.cjs verify
```

The CLI's local media binding and Python dependencies are described in the application README. This delivery changes only the new video application. Existing public sites, retained authoring prototypes, general authoring admission and scientific corpus status are outside its effects.
