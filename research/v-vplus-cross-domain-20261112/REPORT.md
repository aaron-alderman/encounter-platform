# Blinded cross-domain Claimipedia retrieval

The frozen sample comprised nine query claims and 30 candidate claims from AI and society, Christian ethics and theology, and institutional design. Each query searched the 20 candidates outside its own editorial domain. Both methods returned three results per query. The lexical baseline was SQLite FTS5 BM25 with Porter stemming. The V/V+ arm matched manually coded roles, interests, directions, relational mechanisms and couplings. Candidate frames were frozen before opening the queries. Query frames were frozen before ranking.

A separate Codex reviewer started in a fresh context and received only the rubric and the 47 unique pooled pairs in shuffled opaque-ID order. The packet included query and candidate text. It omitted method, rank, corpus identifiers, structural frames and unpooled candidates. The reviewer supplied a grade and reason for every pair. Grade 2 required a specific relationship and a concrete question, comparison or implication for the query. One investigator coded both query and candidate frames, and one AI reviewer judged relevance.

## Results

| Outcome | V/V+ | Ordinary search |
| --- | ---: | ---: |
| Relevant (grade 2) | 17/27 | 19/27 |
| Adjacent (grade 1) | 8/27 | 5/27 |
| Irrelevant (grade 0) | 2/27 | 3/27 |
| Queries with a relevant result | 8/9 | 8/9 |
| Relevant pairs unique to the method's top three | 11 | 13 |
| Queries with a unique relevant pair | 7/9 | 7/9 |

Six relevant pairs appeared in both top-three lists. The pooled top-three lists contained 30 distinct relevant pairs. V/V+ passed the preregistered threshold of at least three unique relevant pairs across at least two queries. Ordinary search had more relevant results overall and more unique relevant pairs. The result supports complementary retrieval in this sample. The 11 V/V+-only pairs were absent from ordinary search's first three; the benchmark leaves their lower-rank positions unmeasured.

| Query | V/V+ relevant | Search relevant | V/V+ only | Search only |
| --- | ---: | ---: | ---: | ---: |
| Decomposing AI effects | 2 | 2 | 0 | 0 |
| Formal versus practical agency | 2 | 2 | 1 | 1 |
| Appeal and scope in protective AI constraints | 3 | 3 | 2 | 2 |
| Church alignment and displaced costs | 2 | 3 | 2 | 3 |
| Theology as continuation of earlier inquiries | 0 | 0 | 0 | 0 |
| Election and the bearing of cost | 1 | 1 | 1 | 1 |
| Corrigibility without system failure | 1 | 3 | 1 | 3 |
| Apparent consensus concealing coercion | 3 | 2 | 2 | 1 |
| Managerial proxies and lived welfare | 3 | 3 | 2 | 2 |

## Examples of what the methods added

For **apparent consensus concealing coercion**, V/V+ retrieved the AI claim that defaults, incentives and penalties alter the cost of independent judgment. The reviewer turned the analogy into a concrete check: examine the cost of dissent before treating consensus as evidence of safety. Search instead found the complementary case of human sign-off surviving after independent review has disappeared. The reviewer suggested testing whether people can meaningfully withhold approval.

For **appealable and narrowly scoped safety constraints**, V/V+ retrieved a theological claim about stronger authority restraining its own coercive presence so that others can act. The reviewer asked whether a protective design limits the gatekeeper's discretion as well as harmful conduct. Search instead retrieved a warning that compliance, quick closure or agreement can diverge from agency and safety, prompting a direct check of practical appeal and viable alternatives.

## Verification and checkpoint reflection

Ranking replay reproduced the frozen packet and ranking key. Every arm returned three eligible cross-domain candidates per query, every pooled pair had one grade and reason, and a separate tally checked the grade distributions. The top-three lists overlapped on seven pairs. One query about the theology layer as a continuation of prior inquiries supported no V/V+ frame and used the frozen hash tie-break. Both methods returned zero relevant results on that query, which stayed in the analysis.

The comparison measures the usefulness of one manually encoded structural index under one reviewer and a cue-enriched candidate panel. Editorial domains share a corpus and intellectual lineage. Exact-text and known-equivalence blocking cannot rule out unreviewed paraphrases, and the coding and source-text review may favor some relationships over others. The blind review separates relevance judgment from the ranking method, while using only one AI judge. The study did not compare a merged ranking at the same result budget, so it establishes complementary candidates in the pooled results and leaves deployment payoff at a fixed reading budget open. Retain as a bounded retrieval result. No claim was admitted or application changed.
