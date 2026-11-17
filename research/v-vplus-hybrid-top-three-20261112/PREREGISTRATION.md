# Does a V/V+ result improve ordinary Claimipedia search at the same three-result limit?

## Sample

Use the 30-record candidate index and its manually authored frames from the previous cross-domain study, unchanged. This is a test on fresh queries against an existing index. Draw eight new AI and society queries and eight new Christian ethics and theology queries using the earlier frozen domain and vocabulary screen, 12-token minimum, and exclusion of question-form records. The preregistration eligibility check found no unused institutional-design query meeting those rules, so institutional design remains a candidate domain. Exclude every earlier study sample and the initial discussion examples, plus normalized exact-text matches and confirmed equivalence components. Select one record per component using ascending SHA-256 of `claimipedia-hybrid-top-three-v1|query|` plus the record ID within each domain. Freeze the sample, runner, previous index and code, and corpus hashes before displaying the 16 query texts. Use unedited query texts. Each arm searches the same 20 candidates outside the query's editorial domain.

## Ranking

The ordinary search arm is the previous SQLite FTS5 BM25 and Porter-stemmed query implementation, with the same stopword handling, zero-fill, and deterministic tie-break. Return its first three results.

The hybrid arm keeps the first two ordinary results in order. For its last slot, rank the remaining eligible candidates by the previous V/V+ weighted frame similarity, considering only frame pairs that match on the interest or coupling field. Break ties the same way as search. Use the highest scoring remaining candidate if its similarity is at least five. The threshold of five requires a match beyond a single interest or coupling match and excludes score-zero tie-fill. If no candidate meets it, keep the ordinary third result. If the highest scoring candidate already occupies the ordinary third position, the lists remain the same. No claim is made about other fusion policies or result budgets.

The investigator manually codes the 16 fresh query texts using at most two frames each in the previous fixed vocabulary. Use empty frames when the source offers no suitable decomposition. Freeze the query frames by SHA-256 before ranking. Do not revise the frames, ranker or threshold based on the retrieved results or review.

## Blinded review and outcomes

Pool the two lists per query, deduplicate pairs, and present them to one fresh separate reviewer with the prior rubric. The reviewer sees only shuffled opaque IDs and the query and candidate texts, without rankings, method labels, scores, annotations, source identifiers or the prior conversation. Preserve one grade and reason per pair. Grade 2 requires a grounded structural analogy or counterpoint with a concrete implication for the query.

Primary outcome is the paired difference in the total number of grade-2 connections at three results per query. Count wins, losses and ties by query, and relevant V/V+ additions versus relevant ordinary results displaced. A positive total difference and more wins than losses constitute improvement on this sample. Also report coverage of queries with at least one relevant result, ordinal grade counts and summed grades. Report how often hybrid changed the third slot. Include queries without qualifying frames. Report the effect descriptively, with no significance tests. This tests manual query coding, the reused index, the frozen policy, and one blinded reviewer.
