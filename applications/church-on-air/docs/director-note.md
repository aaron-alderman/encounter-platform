# Direction: acquire, invite, open, return

9 November 2026, Australia/Perth. Assistant-authored editorial interpretation of the user's brief and supplied videos. These are edit decisions, not facts discovered about the congregation.

The first film's fixed frame and similar shot durations made the package repetitive. The successor uses contrast in time and surface area. Tape damage is strongest during the opening receiver lock and around selected transitions. The principal worship passage loses the purple enclosure and most graphic movement. This makes the exuberant return to a split screen feel intentional, and gives the final invitation somewhere to land.

The visual reference is a late-night local television invitation, made with early desktop graphics: purple perspective grid, cyan vector edges, yellow extruded lettering, an animated wireframe object, an invitation seal, a rolling information strip and slightly misregistered colour. Push, venetian-blind, iris and spin arrivals are brief transitions rather than constant interruption. The supplied real footage remains the human centre.

## Source observations

Audio observations use mono 11,025 Hz, 1,024-sample Hann windows, a 256-sample hop, positive log-spectral flux, 65–170 BPM autocorrelation and RMS. Scope is the first 120 seconds of each source, or its full duration if shorter. Twenty-five frames per long source were visually surveyed at five-second intervals; the shortest source has twenty samples. This is a bounded review, not a review or transcription of every minute of the two longer videos.

| X source ID | Scope observed | Tempo candidate | Visual/wording basis for selection |
| --- | --- | --- | --- |
| `2118035556764684571` | 120 seconds | 143.55 BPM | Around 35–48 seconds the burned-in words progress from the overflow invitation toward bringing people; camera moves between singer and congregation. |
| `2118033330834997550` | 120 seconds | 152.00 BPM | Around 30–43 seconds the names-of-God refrain alternates wide room and singer coverage. |
| `2112164997589774488` | 120 seconds | 143.55 BPM | Around 50–64 seconds the scene opens around “There is no other name” and “Jesus, you're worthy.” |
| `2106759066815225895` | 120 seconds | 73.83 BPM | Around 57–70 seconds the “Way Maker” passage has stronger dynamic contrast and wide room coverage. The author's “I love my church” comes from the supplied tweet, not an invented spoken line. |
| `2048307680318750886` | 98.267 seconds | 71.78 BPM | Around 13–33 seconds the bright final source alternates stage and congregation around the repeated glory/praise refrain. |

Tempo values are heuristic candidates. Half/double-time ambiguity remains, particularly among the ~144 BPM readings. A phase match does not identify a downbeat or the start of a lyric phrase. Source starts and durations are editorial choices placed on the 25 fps grid, informed by those observations and visible words. An audio ear-check and phrase-level transcription would be the next discriminator for tighter musical entry/exit points. No claim of automatic lyric or bar detection is made.

## Authored sequence

| Film time | Duration | Encounter | Source in | Surface and purpose |
| --- | --- | --- | --- | --- |
| 00:00.00–00:03.36 | 3.36 s | Signal | Overflow, 35.00 s | Receiver lock, large title, picture window, strong tracking; immediately establishes the era. |
| 00:03.36–00:13.40 | 10.04 s | Invitation | Overflow, 38.36 s | Push into a larger VGA copy panel. Audio continues from the previous shot without a splice. |
| 00:13.40–00:19.72 | 6.32 s | Names | Revival, 30.36 s | Venetian arrival and broadcast frame; a brisk new movement. |
| 00:19.72–00:26.04 | 6.32 s | Make room | Revival, 36.68 s | Iris opens the enclosure; source and audio remain continuous. |
| 00:26.04–00:39.40 | 13.36 s | Worship | Sunday service, 50.32 s | Longer held passage. Intro label disappears after 1.25 s. Picture, room and original audio carry the centre. |
| 00:39.40–00:52.40 | 13.00 s | Home | Way Maker, 57.08 s | A deliberately cheesy spin returns to a typographic invitation and the author's own church statement. |
| 00:52.40–01:05.76 | 13.36 s | Glory | Glory/praise, 13.20 s | Push into a brighter broadcast frame; keep secondary copy in the rolling strip. |
| 01:05.76–01:12.48 | 6.72 s | Invitation held | Glory/praise, 26.56 s | Iris to a large “Come as you are” card, moving cube and seal, real picture window and continuous final-source audio. |

Original audio stays with each source. Contiguous ranges are grouped before audio assembly, avoiding unnecessary fades within one phrase. Different sources receive RMS-based level matching and 120 ms edge fades; these are not crossfades and do not shorten the checked sequence. No fake service time, phone number, scarcity claim or healing guarantee is added.

## Evidence and next review

Exact source-video hashes, RMS samples, onset/tempo candidates and candidate windows are in `.local/analysis.json`. Contact sheets are `.local/survey-<id>.jpg`. The checked edit, selected graphics recipes, source basis, runtime closure and execution usage are in `.local/plan.json`. `.local/render-receipt.json` binds the film to its source and native mechanisms; `.local/verification.json` reports decoded frames and audio checks. The source predecessor from the successful browser edit is retained under `.local/revisions/`.

Ten headless contract tests passed during construction. Browser work separately exercised shot selection, an off-frame refusal and a successful source-backed caption edit. The first visual review exposed title overflow and non-ASCII source decoding; title fitting and ASCII attribution were corrected at their owners. Earlier render bytes and receipts remain retained. The final render and current receipts determine the delivered state, rather than this historical test count alone.

These files and checks are one engineering/evidence family. They are not independent corroboration of any religious, scientific or platform-admission claim.
