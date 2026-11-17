# Semantic crystallization on Claimipedia identity facets

The preregistration, input hashes, and deterministic split were frozen before scoring. The run covered 129 source-linked identity records from seven provenance lineages. Each retained record had a distinct representative after exact-expression and reviewed-equivalence blocking. The five training lineages provided 64 records. The held-out theological-depth and radical-kenosis lineages provided 24 and 41 records respectively. [Preregistration](PREREGISTRATION.md) · [Frozen split](frozen-split.json) · [Full results](results.json)

| Cumulative stage | Added lineages | Training records | Edges meeting the threshold |
| --- | --- | ---: | ---: |
| 1 | Jessica Alderman, theology co-recovery | 15 | 3 |
| 2 | Redemptive technology, biblical arc | 52 | 7 |
| 3 | AI futures | 64 | 5 |

These are all pairs that met the light-up threshold at any stage. Bold indicates that the stage passed the threshold. The coefficient centers each binary facet within each lineage, then pools the centered values.

| Pair | Stage 1 | Stage 2 | Stage 3 | Stable |
| --- | ---: | ---: | ---: | --- |
| Agency–attribution | −0.234 | **−0.245** | **−0.348** | Yes |
| Agency–belonging | **−0.284** | −0.111 | +0.066 | |
| Agency–moral status | −0.182 | **+0.234** | +0.179 | |
| Agency–relation | **−0.234** | **+0.233** | **+0.202** | |
| Agency–theological | 0.000 | **−0.237** | **−0.205** | |
| Attribution–belonging | −0.365 | −0.135 | **−0.332** | |
| Attribution–relation | −0.300 | **−0.249** | **−0.218** | Yes |
| Attribution–theological | 0.000 | **−0.228** | −0.199 | |
| Belonging–relation | **−0.365** | −0.107 | −0.088 | |
| Moral status–theological | 0.000 | **−0.219** | −0.193 | |

Agency–relation met the threshold at every stage and reversed sign. Agency–theological met the threshold in the last two stages and lost its sign on removing one training lineage. Both failed the stability rule. The two stable edges had the same negative sign within each held-out lineage.

| Feature → masked facet | Held-out centered correlation for pair | Radical kenosis log-loss gain | Theological depth log-loss gain | Equal-lineage mean gain |
| --- | ---: | ---: | ---: | ---: |
| Attribution → agency | −0.304 | 0.0252 | 0.0685 | 0.0469 |
| Agency → attribution | −0.304 | 0.0285 | 0.0735 | 0.0510 |
| Relation → attribution | −0.388 | 0.0448 | 0.0914 | 0.0681 |
| Attribution → relation | −0.388 | 0.0321 | 0.0879 | 0.0600 |

All four directions passed the preregistered predictive rule. Gains are in natural-log units per prediction relative to a training-prevalence baseline. The model that picked at most one feature per target using training associations used edges for agency, attribution, and relation. Across all eight targets and with equal weight for each held-out lineage, log loss fell from 0.4384 to 0.4187 (4.50%). Loss fell by 0.0107 on radical kenosis and 0.0287 on theological depth. The model receives another label as input, so the measured task is masked-label prediction.

## Verification and checkpoint reflection

A replay reproduced the full results apart from the scoring timestamp. A separate calculation using per-record exact-rational centering matched all 84 training coefficients and both held-out coefficients, including any undefined coefficient cases. A likelihood-ratio calculation reproduced the directional log-loss gains. The verification also checked each frozen input and protocol hash, the result's split hash, and record uniqueness across the partition. There were no scoring deviations from the frozen plan.

The result supports a bounded claim about transferring facet associations across provenance lineages in the existing identity map. A relationship could fail through sign reversal, dependence on one training lineage, or worsening prediction in either held-out lineage. The run checked all three. Both stable edges involve attribution. The strongest unresolved alternative explanation is that the two negative associations reflect how the common annotation rubric assigns facets, or how related materials were authored and curated. The source ledgers record independent evidential events as unknown. Only two held-out lineages were scored, both from the existing archive. The disposition is to retain this as a corpus-level result, with independent empirical replication, inference from raw text, causality, and new scientific claim admission outside its scope. The files add a reproducible research checkpoint.
