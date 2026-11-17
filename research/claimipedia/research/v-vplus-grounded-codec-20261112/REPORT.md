# Source-grounded V/V+ comparison results

The frozen 2×2 was run on all 12 Claimipedia claims. The same probes were applied to the four outputs per claim. The 40 probes were frozen before manual encoding. Within each vocabulary the coupling-off arm removed only the cross-coordinate rules, keeping the roles, coordinate formulas and clause statuses byte-for-byte equivalent as structured data. One investigator authored the probes, encoded both vocabularies, and scored the outputs in shuffled order under opaque IDs. The syntax and highlighted lexical spans made the arms inferable.

| Arm | Exact claims | Passed probes | Claims with unsupported assertions |
| --- | ---: | ---: | ---: |
| Fixed, coupling off | 0/12 | 6/40 | 2/12 |
| Fixed, coupling on | 0/12 | 8/40 | 5/12 |
| Source-grounded, coupling off | 5/12 | 28/40 | 0/12 |
| Source-grounded, coupling on | 10/12 | 37/40 | 1/12 |

Exact means every essential meaning probe passed and no consequential unsupported assertion was found. The unsupported column counts claims with at least one such assertion.

| Arm | Lexical /10 | Roles /5 | Scope /11 | Coupling /6 | Other /8 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed off | 1 | 3 | 2 | 0 | 0 |
| Fixed on | 1 | 3 | 3 | 1 | 0 |
| Grounded off | 9 | 4 | 8 | 1 | 6 |
| Grounded on | 9 | 5 | 10 | 5 | 8 |

| Paired contrast | Δ exact | Δ probes | Δ unsupported claims | Claims with better/worse probe recall |
| --- | ---: | ---: | ---: | ---: |
| Grounding, coupling off | +5 | +22 | −2 | 10 / 0 |
| Grounding, coupling on | +10 | +29 | −4 | 11 / 0 |
| Coupling, fixed vocabulary | 0 | +2 | +3 | 2 / 0 |
| Coupling, grounded vocabulary | +5 | +9 | +1 | 6 / 0 |
| Difference between the two coupling effects | +5 | +7 | −2 | |

Grounding improved reconstruction with coupling either on or off. In the short provenance claim, grounding supplied both “source provenance” and “abstraction,” so the existing modal grammar could reconstruct the full requirement in either grounded arm. In the delegation case, the grounded coordinates preserved who gains and who can lose agency. The link placed both effects under the same possibility claim. Grounding also preserved the intended qualifier and vocabulary in the positive alternative order and Kingdom claims, letting the link assert their defining combinations.

The exit-cost claim shows how a link can still make an unsupported assertion even when its phrases come from the source. The coupled output said the effect of deteriorating alternatives on exit changes as participation concentrates. The source instead connects participation concentration to the deterioration of alternatives, which then makes exit harder. This was the only grounded-on record flagged for an unsupported assertion. The other non-exact grounded-on record was the short sustainability claim. The frozen lexical budget allowed three words, so the encoding kept “financial reasoning” and “sustainability” and lost the material qualifier “true.” Its longer failure-mode counterpart could retain both complete phrases.

## Record-level probe counts

| Claim | Probes | Fixed off | Fixed on | Grounded off | Grounded on |
| --- | ---: | ---: | ---: | ---: | ---: |
| Individual capability and collective dependency | 4 | 2 | 2 | 3 | 4 |
| Positive alternative to Beast-like systems | 5 | 0 | 0 | 3 | 5 |
| Delegation redistributes agency | 3 | 1 | 2 | 1 | 3 |
| Endogenous exit cost | 4 | 0 | 1 | 2 | 3 |
| Self-giving language used against the vulnerable | 4 | 0 | 0 | 2 | 4 |
| Kingdom as common life | 5 | 0 | 0 | 4 | 5 |
| Remedy separation | 3 | 0 | 0 | 3 | 3 |
| Adversarial procedure in continuing relationships | 3 | 1 | 1 | 3 | 3 |
| Provenance through abstraction | 2 | 0 | 0 | 2 | 2 |
| True sustainability in financial reasoning | 2 | 0 | 0 | 0 | 0 |
| Sustainability failure-mode variant | 2 | 0 | 0 | 2 | 2 |
| Representation becoming identity | 3 | 2 | 2 | 3 | 3 |

## Verification and interpretation

The fixed script verified the frozen corpus, protocol and codecs and replayed all 48 outputs. A separate tally reproduced the exact, recall and unsupported counts, checked all 24 on/off pairs, and exported verified grounded record IDs, versions, source hashes and lexical spans. The probe and encoding hashes checked before scoring. Validation-only corrections were made before the encoding freeze. The frozen protocol, probes, corpus and codecs were unchanged.

All 12 remained in the primary analysis. The holdout includes two formulations of the sustainability idea, and the representation-becoming-identity claim is a close paraphrase of a claim in an earlier experiment. These items passed the frozen exact-text and reviewed-equivalence filter. In a post hoc check dropping the longer sustainability variant and the representation paraphrase, exact counts were 0/10 and 0/10 for the fixed arms and 3/10 and 8/10 for the grounded arms. Unsupported counts were unchanged. This check does not establish source independence.

The disposition is to retain the grounded codec and coupling as a research prototype. The observed improvement measures manually encoded reconstruction under this probe set. The grounded arm was allowed to copy short source phrases by design, and the same investigator scored the visible representations. The study measures what happened when the authored links were rendered or removed from these encodings. It does not identify the best alternative uncoupled encoding or validate automatic extraction. The observed failure mode is compositional: a source-verified phrase can still enter an incorrect causal relation. This checkpoint makes no scientific admission or application integration.
