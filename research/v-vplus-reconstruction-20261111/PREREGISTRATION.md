# V and V+ reconstruction on held-out Claimipedia claims

## Question

Can a small, typed semantic representation reconstruct Claimipedia claims from V (a subject's agency, choice, judgment, or cost-bearing) and V+ (the subject in a relationship or shared arrangement) together with directed coupling? Test a human-authored encoding and deterministic decoder. Held out means reserved from this codec's design and outside the earlier semantic crystallization sample. The existing archive may contain related meanings. The two chosen namespaces are record categories, with source independence unverified.

## Fixed holdout

Use the identity claims map. Require at least one of agency, attribution, and relation. Exclude all 129 records used in the earlier crystallization experiment, the four named examples in the preceding discussion (including their exact duplicates), and human-reviewed equivalents or normalized exact-text matches to those exclusions, transitively. Within the remaining rows, keep only one record per exact-text or reviewed-equivalence component. Select four from the claimipedia namespace and four from corpus400, by ascending SHA-256 of `claimipedia-v-vplus-v1|` plus record ID, taking one per component. Freeze the input, prior split, codec, scoring scripts, protocol, and eight selected IDs before opening the selected texts. No replacements or coding vocabulary changes after opening. Namespace choice ensures two different record categories and does not imply independent authors or sources.

## Encoding and ablations

Use the frozen codec with its fixed entity, predicate, modality, and coupling vocabulary. Up to four atoms per axis and three cross-axis links. Code each record once by interpreting its source text. The decoder gets only the structured encoding. It has no free-text fields, source lookup, record-specific templates, or copy path. Atom lists can leave a coordinate empty. Preserve unsupported material as omissions in evaluation, without adding arbitrary payload. Score all eight, including failures.

Decode four arms from each encoding. Full includes both axes and coupling. Uncoupled includes the same two axes with coupling dropped. Single-axis arms include V or V+ alone. Score the explicit content in each arm. A list of facts without a rule does not entail a directional, conditional or normative relation by adjacency.

## Outcomes and scoring

Before authoring encodings, read each source and freeze a short set of essential semantic probes. Each probe is a meaning that a faithful reconstruction must preserve, including essential role identity, polarity, modality and scope when present. Probes may concern a coordinate, a coupling, or other essential content. Use the same probes across arms. An investigator checks each decoded output against the probes and marks unsupported consequential assertions, including stronger modalities, reversed roles, and incorrect polarity. An exact semantic reconstruction passes every probe and contains no unsupported consequential assertion. Partial score is passed probes divided by total probes, reported with record-level counts. Report exact pass counts, total probe recall and unsupported-assertion cases per arm. Report the paired per-record recall difference between full and uncoupled, and track any losses caused by adding coupling. Use a descriptive decision rule for a contribution of coupling: at least two records gain an essential probe and the full arm has more exact reconstructions than the uncoupled arm. Treat exact reconstruction on a majority of eight as the threshold for adequacy on this set. These are descriptive thresholds without a significance claim.

The same investigator supplies references, encodes and scores. Arm structure is visible. The results measure expressibility under assisted coding and this rubric. Free-form extraction, blinded judgments, source-independent replication, and reconstruction of arbitrary claims remain outside scope.
