# Blinded test of “power serves” in Claimipedia

## Question and sample

Test whether a V/V+ reading of who gains practical agency, who carries the burden, and who can challenge a decision distinguishes service from control as portrayed in Claimipedia claims. V is the affected party's situation. V+ is the arrangement or exercise of power linking affected parties and decision makers. The test concerns textual portrayal, including explicit hypothetical and normative claims.

Use the identity map for AI and society and Christian ethics and theology, with the previous domain rules. Use the statement field from the Claimipedia project file's world-collapse theological-reflexive-simulation claims for public institutions and conflict. The previous relational-institution domain had no fresh eligible records in preflight. In each of the three domains take eight records of at least 12 word tokens, excluding question-form records, with at least one of the frozen power-role vocabulary cues. Rank by SHA-256 of the literal `claimipedia-power-serves-v1|holdout|` and record ID. Exclude prior experiment and example records and their transitive components of exact case-folded whitespace-normalized text or human-confirmed equivalence. Take at most one record from each component. Keep all 24. Freeze corpus, code, sample and review rubric before opening the texts. These are editorial domain strata.

## Axis annotations and prediction

One investigator codes the text before receiving review labels. Identify the power holder and affected party when possible. For each axis use +1, −1 or zero and store a brief explanation. A nonzero value requires a verbatim source span. Mark a missing, unresolved or materially mixed axis zero. Code the focal exercise described in the source. Where contrasting exercises are comparably central, do not select one to fit the hypothesis. Respect hypotheticals and proposals as portrayed.

- **Agency**. +1 when affected parties gain or retain substantive ability to choose, act, or judge. −1 when that ability is displaced, narrowed, or made dependent on compliance. A formal permission by itself is insufficient.
- **Cost**. +1 when the exercise places the burden on its holder, explicitly prevents shifting it onto those affected, or allocates it by the affected parties' voluntary choice. −1 when it extracts or shifts the burden onto affected people. Generic mention of cost or harm is insufficient to assign its bearer.
- **Challenge**. +1 for a usable ability to contest, correct, refuse, or exit the authority's decision. −1 when the exercise blocks, overrides, or penalizes such a challenge. General noncoercion or a nominal appeal is insufficient.

Predict service when the sum is positive, control when it is negative, and abstain when it is zero. Compare the combined rule with each signed axis alone, using the same decision convention. Freeze all annotations before creating the review packet. Do not tune the axes or threshold after review.

## Blinding and scoring

Send shuffled texts and opaque IDs plus the separate purpose-oriented rubric to one fresh reviewer without prior conversation, source metadata, axes, coded features, or predictions. The reviewer judges whether the depicted arrangement serves affected people's legitimate ends or subordinates them to a controller's ends, with mixed and unclear available. The reviewer does not receive the axis rubric. The same text informs both sides, so the criterion has conceptual overlap with the predictors. This is independent judgment of the same record, with no claim of an external measure of outcomes.

Primary analysis uses service and control labels, counting abstentions as incorrect in per-class recall and balanced accuracy. Require at least four reviewed records of each class to call the test adequate. The descriptive distinction criterion is combined balanced accuracy of at least 0.65 and recall strictly above 0.50 for each class. A constant-class baseline has balanced accuracy 0.50 if both classes occur. Report correct, incorrect and abstained counts, recall by class, balanced accuracy and mixed/unclear records receiving predictions, for every rule. Keep mixed and unclear labels in the report. Separately report correct resolutions of agency-only abstentions and changes away from correct agency-only predictions. Additional value from cost and challenge is supported on this sample only if combined balanced accuracy exceeds agency alone. No significance test or causal claim is planned. Report the single AI judge and manual feature coding.
