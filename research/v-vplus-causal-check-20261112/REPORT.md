# Claimipedia causal-chain and effect-strength check

The test froze the sample and implementation before the selected texts were displayed, then froze reference links, ordinary proposals and source-witness annotations before scoring. All 15 claims were retained. The identity map lists all selected claims in its reviewed-excluded subset. The records are Claimipedia claims outside the identity-facet subset used by the earlier codec studies. Six came from an effect-cue stratum, six from a chain-cue stratum and three from a control-cue stratum. No selected record asserted that a third factor changes the strength of an existing causal effect.

The prototype distinguishes an event-to-event edge from a modifier applied to a directed effect. Its input is a structured causal link with ordered references to anchored V or V+ clauses, direction, modality and optional condition. A proposed link survives only if a source annotation has exactly that typed signature, covers its role and scope spans, and contains an eligible cue. The check returns a subset of the proposed links and leaves other clause content outside the intervention.

## Ordinary proposals

| Arm | Supported links retained | Unsupported links | Reference links omitted | Records with unsupported links |
| --- | ---: | ---: | ---: | ---: |
| Unchecked | 16/16 | 1 | 0 | 1/15 |
| Checked | 11/16 | 0 | 5 | 0/15 |

The ordinary comparison failed the preregistered success condition. It removed one unsupported causal link, while losing five supported links. The rejected proposal treated a conditional prediction of failure under Second Temple stress conditions as a causal assertion about relying on better law. The reference preserved the distinction between that conditional prediction and an explicit causal mechanism.

All five supported drops had an exact matching human-annotated witness. The cue whitelist rejected the source windows:

- A missing experimental signature **narrows** a programme to weaker analogues.
- **Through** death and resurrection, a death-closed pattern **is ruptured**, within the stated reading.
- Saul's partial obedience fails **because** it retains useful elements and discards costly requirements.
- Covenant **solves** the intergenerational problem of sustaining cost absorption.
- A demonstrated disposition to bear cost is the condition that **converts** formal grounds into genuine authority.

## Deterministic challenge and strength control

The frozen challenge generator created six supported two-edge chains paired with a competing effect-strength assertion on the same roles. It also generated six invented edges on records with no reference link and at least two role anchors. These were deliberate challenge cases.

| Arm | Supported edge instances retained | Unsupported strength links | Other invented links |
| --- | ---: | ---: | ---: |
| Unchecked | 12/12 | 6 | 6 |
| Checked | 10/12 | 0 | 0 |

For example, the covenant record supports a chain from covenant to sustaining cost absorption and onward to long-term livability. The fabricated variant treated covenant as changing the strength of the second link. The gate removed that variant and also dropped the supported first step because its source cue was out of vocabulary.

A constructed positive control said oversight increases the strength of the effect of audit frequency on correction speed. The check kept that strength assertion and rejected both an edge from oversight to audit frequency and the reversed strength direction. This verifies that the representation can pass an explicitly witnessed strength relation. It provides no real-corpus estimate of strength-link recall.

## Verification and checkpoint reflection

A replay reproduced the full frozen result. A separate tally verified the reference comparison, challenge counts and the absence of eligible cues in all five supported drops. The positive fixture also checked rejection of source revision, text and quotation mismatches. The frozen protocol and dataset remained intact.

The same investigator authored the reference, proposals and witnesses. The check received source annotations as inputs, so the challenge shows what typed matching does when a source witness is available. It does not validate independent semantic judgment or automatic extraction. The check neither reads arbitrary coupling prose nor rewrites the legacy codec's formula trees. This is a read-only research prototype on structured causal links. Retain the separate representations for chain edges and effect strength. The cue whitelist failed as a hard rejection gate on this sample. The experiment establishes fidelity to this annotation protocol, with causal truth, real-source strength recall, and application integration outside scope.
