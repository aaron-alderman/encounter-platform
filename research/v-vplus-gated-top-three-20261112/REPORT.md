# Lexical safeguard for Claimipedia's V/V+ third slot

## Rule and outcome

Keep the first two ordinary search results. Let b1, b2 and b3 be ordinary search's top three BM25 scores. When the current hybrid proposes a structural substitute, permit it if b3 is zero, below 88% of b2, or below 50% of b1. Otherwise keep the ordinary third result.

The cutoffs were fitted using the prior 16-query study. The fitted rule retained all four wins, blocked all three losses and allowed seven of the 15 proposed swaps on that development set. The new holdout was scored separately.

| Outcome on 12 fresh queries | Ordinary search | Current hybrid | Gated hybrid |
| --- | ---: | ---: | ---: |
| Relevant results (grade 2) | 24/36 | 27/36 | 27/36 |
| Adjacent results (grade 1) | 9/36 | 7/36 | 7/36 |
| Irrelevant results (grade 0) | 3/36 | 2/36 | 2/36 |
| Summed grades | 57/72 | 61/72 | 61/72 |
| Queries with a relevant result | 10/12 | 12/12 | 11/12 |
| Swaps relative to search | — | 12 | 9 |
| Relevant additions / relevant displacements | — | 9 / 6 | 7 / 4 |

| Paired comparison | Net relevant results | Query wins | Losses | Ties |
| --- | ---: | ---: | ---: | ---: |
| Gated vs ordinary | +3 | 4 | 1 | 7 |
| Gated vs current hybrid | 0 | 1 | 1 | 10 |
| Current hybrid vs ordinary | +3 | 5 | 2 | 5 |

The gate failed the preregistered improvement criterion, which required a gain over both baselines. It tied the current hybrid on total relevance and reduced query coverage by one. The gate changed the blend of results and avoided three structural swaps.

## What the vetoes did

| Query | Ordinary third | Current hybrid third | Effect of veto |
| --- | ---: | ---: | --- |
| Contestable identity infrastructure and rights | 2 | 1 | Retained a relevant connection |
| Legitimating coercive authority | 2 | 2 | Preserved a different relevant connection |
| Testing the sufficiency of cost absorption | 1 | 2 | Blocked the query's only relevant connection |

For contestable identity infrastructure, the retained result distinguished access from authority. The reviewer applied that distinction to whether a credential can enable access without giving its issuer broad transaction control. The blocked hybrid result addressed general responsibility to others and gave less guidance on contestability or monopoly. The ordinary scores were 3.000, 2.954 and 2.879.

For the query about whether the Cross absorbs the relevant cost, the blocked hybrid result distinguished coercive punishment from obligation, tragedy and other consequences. The reviewer used that distinction to ask what kind of cost the narrative claims was absorbed. The ordinary third result was about the prohibitive costs of opting out of a sovereignty system and was judged adjacent. The ordinary scores were 1.845, 0.965 and 0.932. The relative gap rule protected the third result in both cases, with opposite effects.

By domain, relevant counts for ordinary, current hybrid and gated hybrid were 12, 13 and 14 out of 18 on AI and society queries, and 12, 14 and 13 out of 18 on Christian ethics and theology queries. These are descriptive six-query splits.

## Verification and checkpoint

The rule, development audit, scorer, index and 12 selected query IDs were frozen before displaying the fresh texts. The index was the existing 30-record panel. Each query searched its 20 eligible cross-domain candidates. One investigator coded the fresh query frames before ranking, and a separate Codex reviewer started with a fresh context and judged all 48 pooled query–candidate pairs. The reviewer received the rubric, texts and opaque IDs, without methods, ranks, frames, scores or prior outcomes.

A replay reproduced the old development rankings and the new rankings, packet and scores. Every arm had exactly three unique eligible records and identical first two results. A separate tally verified the three veto outcomes, arm totals and paired contrasts. The first AI query resembles earlier claims about the formation of Beast-like sovereignty through combined infrastructure. The frozen filter excluded exact and reviewed equivalents. Candidates from that AI domain were ineligible for the query.

The holdout supplies a counterexample to the fitted rule: close lexical scores can occur when the third result has little structural relevance and a useful V/V+ connection is available. The same fixed index, two query domains, manual query coding and one AI reviewer bound the conclusion. Retain this as a tested policy with no demonstrated gain over the current hybrid. No application or canonical claim was changed.
