# Claimipedia semantic crystallization test

## Scope and hypothesis

Adding source lineages will reveal recurring positive or negative associations between existing identity-facet labels. Some associations will persist across stages and improve prediction of a masked label on records from unseen lineages. The measurement unit is a retained, source-linked identity proposition. These are associations under the existing Claimipedia rubric. The source ledgers mark evidential independence unknown, and authorship and annotation can be shared. This run tests transfer across documented provenance lineages.

## Corpus and split

Use the identity claims map, the human-reviewed proposition equivalence ledger, and both IA1 admitted source identity ledgers. Freeze input and runner SHA-256 hashes and group membership before computing facet frequencies or associations in this run. The corpus and its prior analyses were already available. Holdout means withheld from this run's edge selection and model fit.

Group admitted documents by the first two dot-separated segments of each derive request ID. Group other sources by their full conversation reference. Merge groups linked by a source identity, source hash, shared record, human-confirmed proposition equivalence, or exact claim text after case folding and whitespace collapse. Apply equivalence and text linkage across all included identity-map IDs before filtering for admitted source linkage. Within each sourced equivalence class use the lexicographically first source-linked record as its representative. Use its existing facet labels and report label disagreements among sourced equivalents. This is a snapshot of the identity-labeled subset and does not estimate facet occurrence in the full corpus.

Sort resulting groups by SHA-256 of the UTF-8 string formed from `claimipedia-semantic-crystallization-v1|` and the sorted group keys joined with `|`. Assign the first two groups to holdout. Add the remaining groups in sorted order in three cumulative stages, with the integer surplus assigned to the earliest stages. Require at least five groups total. Use no holdout outcomes to select edges or tune thresholds.

## Edge rules

Score all 28 unordered facet pairs at every stage. For each pair, center both binary labels within each lineage and compute the Pearson correlation of the centered values pooled over lineages, equivalent to the sum of within-lineage cross-products divided by the square root of the product of within-lineage sums of squares. A lineage contributes a directional vote when both facets vary and the within-lineage cross-product is nonzero. A pair lights up at a stage if the absolute centered correlation is at least 0.20, each facet has at least four labeled and four unlabeled rows, and at least one lineage votes in that direction.

A pair stabilizes if it lights up in the same direction at stages 2 and 3, at least two stage-3 lineages vote in that direction, at least two-thirds of directional votes agree, and the final correlation keeps its strict sign after removing any one training lineage. Report each edge's stage effects, light-up flags, directional votes and final stability. The thresholds are descriptive and no significance claim is planned.

## Held-out prediction

For every stable pair, score both directions with the other facet supplied as a feature. Fit a smoothed prevalence baseline on final-stage training rows using one positive and one negative pseudocount. Fit a conditional predictor using separate estimates for the two feature values, with four pseudocounts centered on the training baseline. Report held-out mean log-loss gain (baseline minus model) for each direction, equal-weighted over held-out lineages, with per-lineage scores. Label a direction predictive in this run only if the pooled within-lineage holdout correlation has the stable training sign, the conditional training rates have that sign, and log-loss gain is positive overall and in each held-out lineage. Report all tested directions even if none pass.

For a single aggregate prediction score, select at most one feature per target facet before opening holdout labels. Among stable edges with training conditional rates in the stable direction, choose the largest absolute stage-3 correlation, breaking ties lexicographically by feature ID. Average log loss across held-out lineages and across all eight target facets, using the prevalence baseline for targets with no selected feature. Report stage edge counts, the final aggregate and its per-lineage scores, and distinguish retrospective cohort transfer from independent replication. Preserve the frozen plan and report any deviations.
