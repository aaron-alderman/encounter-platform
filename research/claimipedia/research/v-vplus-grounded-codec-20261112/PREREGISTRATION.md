# Source-grounded V/V+ vocabulary and coupling

## Question

Does access to exact, short lexical spans in the source claim preserve more of its meaning than the prior fixed vocabulary? Does a directed cross-coordinate rule add meaning under each vocabulary? Use a paired 2×2 design in which every claim appears in all four arms.

## Frozen sample

Use the Claimipedia identity claims map. Select four claims each from the aiFutures, claimipedia and corpus400 namespaces, in that order, with at least one of the agency, attribution or relation tags. Exclude the 129 crystallization records, the two earlier reconstruction holdouts, the four original discussion examples and their transitive equivalence components. Form components using human-reviewed confirmed equivalence and whitespace-normalized, case-folded exact text. Choose at most one per component. Within each namespace rank ascending by SHA-256 of the literal `claimipedia-grounded-v3|holdout|` followed by the record ID. Freeze the corpus, equivalence ledger, prior splits, both codec implementations, protocol, script and chosen record IDs before displaying holdout text. Keep all 12. Namespaces are record categories. Source and authorship independence have not been established.

## Treatments

| Arm | Vocabulary | Cross-coordinate rules |
| --- | --- | --- |
| Fixed off | Existing scoped codec's fixed registry | Removed |
| Fixed on | Existing scoped codec's fixed registry | Included |
| Grounded off | Same fixed registry plus verified lexical spans from that record | Removed |
| Grounded on | Same fixed registry plus verified lexical spans from that record | Included |

Both vocabularies receive the same source text during manual encoding. Keep the existing role and formula structure, atom and coupling limits, and shared fixed meanings. The grounded registry can assign an exact source span to a term, an atomic predicate with declared arity, or a unary qualifier. Store the record ID, version, UTF-8 source SHA-256 and zero-based Python code-point span. Span validity checks lexical provenance. It does not verify the assigned lexical kind, predicate arity, or the proposed interpretation of a sentence.

Each extension is one to five words for a term or predicate, or one to three for a qualifier. Require whole-word boundaries, disjoint spans, distinct case-folded strings, and no formula markers from the frozen blocked list. Allow at most 16 bindings and no more than 28 source tokens or 60% of that claim's word tokens, whichever is smaller. The record's lexical registry is available only for encoding and decoding that record. The decoder receives a structured program and verified registry. It has no source-lookup or free-prose field. Keep atomic assertions and source lexemes inside coordinate clauses. Cross-coordinate links use clause references and fixed operators. Copying names and terms is intentionally allowed in the grounded arms, and no score measures extraction from a fresh document without human coding.

For each claim, make one encoding per vocabulary. Use the same coder and instructions, with the encoding order balanced in each namespace. Assign the first two claims by a separate SHA-256 ranking with prefix `claimipedia-grounded-v3|encoding-order|` to fixed first and the other two to grounded first. Freeze one program per vocabulary before decoding. Turn coupling off by omitting the rules at render time while preserving roles, lexical definitions used in the coordinate clauses, formulas, and clause status. Do not change an encoding after examining scores.

## Outcomes and analysis

Before encoding, write two to eight essential meaning probes per claim and freeze the probe file by SHA-256. Tag each probe according to its main distinction (lexical, roles, scope, coupling, other). Use one probe set across all four arms. Give credit only for explicit preservation of the source's material meaning. A fragment can satisfy a probe about fragment content, but cannot be treated as an asserted conclusion. A coupling probe can pass in an uncoupled arm if an actual formula conveys the requisite relation. Adjacent fragments alone do not establish it. Flag consequential unsupported assertions separately, including wrong roles, polarity, scope or direction. Treat an output as an exact reconstruction when it passes every probe and makes no consequential unsupported assertion.

Present arm outputs in deterministic per-record shuffled order under opaque IDs. Render structure and lexical spans can reveal the treatment. Report that limitation and the identity or shared role of the encoder and evaluator. For each arm report exact claims, passed probes by kind and overall, and claims with unsupported assertions. For each claim retain paired scores. Report grounding on minus fixed on, grounding off minus fixed off, on minus off separately within each vocabulary, and the difference between the two coupling effects, for exact reconstructions, passed probes and unsupported-assertion counts. For each paired contrast report counts of records improving and worsening on probe recall. Interpret the results descriptively. A gain in recall accompanied by more unsupported assertions is a tradeoff. Twelve records support a bounded sample comparison and no significance or corpus-wide adequacy claim.

The comparison uses the same fresh records across all four arms. Prior failed cases are development examples only. If the experiment is opened, first verify the frozen manifest, then display text, freeze probes, encode in the assigned order, decode, judge and score.
