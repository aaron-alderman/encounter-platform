# Dot: behind the picture

9 November 2026, Australia/Perth. A user-directed mascot performance about the actual production experience. Dot's words are assistant-authored commentary, voiced locally; they are not a personal religious testimony or an official OpenAI voice or endorsement.

The 73.04-second companion starts with eight seconds of the finished church cut. Over 1.6 seconds the real picture pulls back into a captured programme monitor. The editor is visible before Dot starts speaking at 9.6 seconds. The seven narrated beats then cover the invitation's rhythm, Encounter identities and edit routes, a real off-frame refusal, the first-pass title problems and Windows file lock, the boundary between Temple and native media rendering, and the choice to let the worship breathe. The last five seconds return to the original worship picture and church audio.

## Words, voice and character

`source/behind-the-scenes.json` owns the exact script, local voice selection, narrative scenes and programme windows. `source/behind-the-scenes.encounter` and `source/behind-the-scenes-contracts.rel` supply real typed Beat projections over the generated observation binding in `.local/bts/voice-facts.rel`. The binding's generated status is explicit: it is not a second independently authored script.

The installed Microsoft Catherine voice is selected explicitly, en-AU, rate 2, mono 16 kHz. `native/narrate.ps1` uses the installed .NET/System.Speech mechanism through PowerShell 7. No remote synthesis, cloned voice, downloaded voice model, altered Windows execution policy or account credential is used. The older Windows PowerShell host refused local script execution; the existing PowerShell 7 host allows locally authored scripts under its existing RemoteSigned policy. Speech synthesis needed the ordinary local host outside the Codex sandbox.

Speech-progress events supply word positions. The initial 24 kHz observation exposed a timebase disagreement; the final 16 kHz WAVs agree with the reported positions. Event delivery occasionally arrived out of chronological order. `native/observe_narration.py` retains raw event JSON, sorts the derived word list by its reported time, validates every time against the actual WAV duration, and verifies the ordered words against the authored script. No original observation is silently replaced by a timing guess. Narration totals 58.263 seconds of source audio, padded to 1,461 picture frames for exact composition.

The mascot is the actual bundled `codex-spritesheet-v6` artwork from the installed Codex app, retained only in `.local/bts/` with its exact archive entry and SHA-256 in `mascot-source.json`. The observed sheet is 1,536×2,288, eight columns of 192×208 cells. Its existing idle, wave, review, waiting and jumping rows supply the performance. Voice RMS drives the small level meter and body movement. The local synthetic narrator label remains visible during the commentary. The voice is an artistic casting of Dot, not a claim about an official mascot voice.

## Real screens, explicit composition

The studio, rhythm analysis, Encounter source inspector, invalid edit and worship selection were captured from the actual local application at 1,440×900. The browser viewport was restored afterwards. The invalid source start of 36.69 seconds really produced `AIR-P008`; its screenshot was taken while the refusal message was visible, and the unsaved field was restored to 36.68. No accepted church-film source was changed during capture.

These are actual UI stills composited with moving programme footage, a corresponding programme clock, explanatory focus graphics and the animated mascot. They are not represented as an uninterrupted recording of someone operating an Adobe product. The source-code excerpt is read from the actual Encounter file and explicitly labelled as a source excerpt. The outtakes use the retained first-pass film alongside the director's cut, and label the Windows issue as a production note rather than fabricating a live terminal.

Original church audio is the cold open, a quiet bed during commentary and the closing return. It is lowered by 24 dB under the narration. The combined local voice is levelled to a −16 LUFS target and the final mix is limited. The final verification receipt reports achieved peak and decoded format; the target alone is not an achieved loudness measurement.

## Semantic and native boundary

`algebra/behind-the-scenes.process.json` owns ordered narrative composition, matching authored/projected words to measured voice, permitted scenes and mascot states, programme frame-grid/source bounds and the opening/voice/closing timeline. Its entrypoint is effect-admitted through the existing Temple runtime. Its 20-million-step budget is unchanged.

`native/render_bts.py` supplies the explicit camera/compositing, sprite rasterization, caption drawing, audio assembly and codec mechanisms. `bootstrap/behind-the-scenes.cjs` pins the selected script, captures, semantic closure and source film. Native rendering rechecks the film, voice and image bytes and refuses source changes during its execution. The resulting content-addressed movie and hash-bound receipts are separate from the original clean church film.

## Reproduce

```powershell
node applications/church-on-air/cli.cjs narrate
node applications/church-on-air/cli.cjs bts-plan
node applications/church-on-air/cli.cjs bts
node applications/church-on-air/cli.cjs bts-verify
```

The current task's local media, captured studio screens and bundled sprite are already bound. The Windows host needs the installed Catherine voice and PowerShell 7 (`pwsh.exe`); an explicit `powershell` path can be supplied in `.local/config.json` if it is not on PATH. Fresh machine capture/artwork bindings are deliberate setup, not silently rediscovered user data.

The making-of tests are `test/behind-the-scenes.test.cjs`; original composition checks remain in `test/composition.test.cjs`. Native output verification runs:

```powershell
node applications/church-on-air/cli.cjs bts-verify
```

Review `.local/bts/plan.json`, `render-receipt.json`, `verification.json`, `captures.json`, `narration-observations.json`, `dot-making-of.vtt` and the per-chapter WAV/word files for exact local evidence. The initial test compared floating-point seconds exactly; the correction compares the actual integer frame boundary. This changes a test assertion, not the intended cut. These observations and repeated renders remain one production/evidence family.

## Delivered result

The delivered companion is `.local/bts/dot-making-of-88d71702dd6eb41c.mp4`, SHA-256 `88d71702dd6eb41c61564725edafa7c3a81f3bb5fae6872fd72ee04a0b00e1b1`. A full native decode verified all 1,826 frames, 73.04 seconds, 1,920×1,080 at 25 fps and stereo AAC at 48 kHz. The measured final audio peak is −4.5 dBFS. The 152 speech-word events agree with the authored narration. The retained clean church film still has its original `b77f1cb50f72c2c4…` identity.

The ten existing composition cases passed with the new module loaded; all four making-of cases passed after correcting the frame-boundary assertion. The initial audio assembly also refused a `.6` fade-duration token; spelling it `0.6` corrected the native FFmpeg argument. Its original failure is retained at `.local/bts/failed-audio-parse.log`. Contact-sheet review covered the real UI reveal, mascot states, source excerpt, refusal, first-pass comparison and closing worship. The owned local capture server was stopped after the task.
