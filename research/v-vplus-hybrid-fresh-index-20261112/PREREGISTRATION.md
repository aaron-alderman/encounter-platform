# Current hybrid on fresh Claimipedia queries and a fresh index

## Sample

Test the current, ungated third-slot hybrid against ordinary search. Freeze both methods and draw a new query sample and candidate panel from the Claimipedia identity map, including the identity-mapped and reviewed-excluded portions. Use the earlier editorial domain rules for AI and society, Christian ethics and theology, and institutional design. Add science and research strategy using the strategy and capabilityAtlas namespaces. A metadata preflight found too few unused records in the AI and institutional domains under the earlier vocabulary screen, so omit that screen uniformly. Keep the previous minimum of 12 word tokens and exclude question-form records. The change broadens coverage and includes records for which V/V+ may be inapplicable.

Exclude the initial discussion examples and all previously sampled queries and candidates, including the causal studies. Form transitive components by normalized exact text and human-confirmed equivalence, then exclude components touching earlier records and take at most one record from each remaining component. In the frozen domain order select four queries, then six candidate records per domain, by ascending SHA-256 of `claimipedia-hybrid-fresh-index-v1|`, partition name (`queries` or `candidates`), a pipe and record ID. Both arms search the same 18 eligible out-of-domain candidates per query. Freeze the corpus, sample, runner, prior rankings, method and rubric before displaying selected texts.

## Methods and review

The investigator manually annotates the 24 candidate records first using the existing V/V+ frame vocabulary and at most two frames per record. Freeze the candidate frames by SHA-256 before opening the 16 query texts. Then annotate and freeze query frames before ranking. Record no frames where the text does not express a suitable relationship. Use unedited source text. No changes to the sample, weights or thresholds after opening.

Ordinary search uses the earlier SQLite FTS5 stemmed BM25 implementation and returns three results. Current hybrid keeps ordinary search's first two. It selects the highest-scoring remaining V/V+ candidate if the score is at least five, considering only pairs of frames matching on interest or coupling. It otherwise keeps ordinary search's third result. Use the existing deterministic tie-break and weighting. Verify that this implementation reproduces the archived prior rankings.

Pool and deduplicate the three-result lists per query. One fresh, separate reviewer receives only the previous rubric and a deterministically shuffled packet containing opaque pair IDs and raw query and candidate texts. The reviewer has no prior conversation, method labels, ranks, scores, frames or source identifiers. Grade all pairs from 0 to 2 with a reason. A grade 2 requires a grounded relationship with a concrete implication for the query.

## Outcomes

Primary outcome is the paired difference in the number of grade-2 results at three per query. A positive net count and more query wins than losses support improvement on this sample. Report total relevance, query wins/losses/ties, coverage, adjacent and irrelevant counts, and summed grades. Report how often the structural slot changed, relevant additions and displacements, and below-threshold fallbacks. Domain splits are descriptive. Keep all queries. Interpret this as a test of the fixed policy, manual annotations, and this small, fresh cross-domain panel under one AI reviewer. No significance claim, pooled estimate across studies or deployment decision is planned.
