# When should V/V+ take the third Claimipedia search slot?

## Development and frozen policy

Use the preceding 16-query hybrid study only as development data. Its four wins and three losses suggested that third-slot replacements were riskier when the ordinary third result scored close to the second. A winning swap with near-tied second and third scores occurred when the first score was much higher than either. The chosen rule preserves a competitively ranked ordinary third result and permits exploration when the lexical scores separate.

Let b1, b2 and b3 be the nonnegative BM25 scores of the ordinary top three for the current query. Permit the current hybrid replacement if b3 is zero, b3 is strictly below 0.88 × b2, or b3 is strictly below 0.50 × b1. Otherwise keep ordinary search's third result. The current hybrid's original minimum V/V+ score and all eligibility and tie rules still apply. This rule can veto an existing proposed swap only. The numeric cutoffs were chosen after inspecting the development outcomes. On that set they allowed seven of 15 proposed swaps, preserved all four wins and blocked all three losses. The prior fit is an exploratory observation and will not be pooled with the new test.

## Holdout and arms

Reuse the same frozen 30-record candidate index and frame annotations. Select six AI and society and six Christian ethics and theology query records using the previous eligibility screen and domain rules. Exclude prior study records and the four initial examples, plus all exact normalized-text or confirmed-equivalence components touching those records. Choose one record per component by SHA-256 of the literal `claimipedia-gated-top-three-v1|query|` plus claim ID. Institutional design remains a candidate domain. Freeze the protocol, runner, previous index, development audit and query sample before displaying the selected texts. Manually code each unedited fresh query with up to two V/V+ frames, and freeze these before ranking. No parameter changes or substitutions after opening the holdout.

Each arm uses the same 20 eligible cross-domain candidates and returns three results:

1. Ordinary search uses the original stemmed BM25 top three.
2. Current hybrid keeps the first two ordinary results and uses its frozen structural rule for the third.
3. Gated hybrid keeps the first two and applies the lexical safeguard to the current hybrid's third-slot proposal.

## Review and outcomes

Pool and deduplicate results per query. Present a shuffled packet containing only the query, candidate and opaque pair ID to one fresh reviewer without prior conversation, ranks, method labels, source IDs, scores or frames. Use the unchanged relevance rubric. A grade 2 requires a grounded analogue or counterpoint with a concrete implication. Preserve every grade and reason.

Primary outcome is the count of relevant results at three per query. Compare gated against each baseline using paired net relevant results, wins, losses and ties. Call the gate an improvement only if its net is strictly positive against both baselines. Also report current hybrid versus search, coverage, adjacent and irrelevant counts, swaps made and vetoed, relevant additions and relevant displacements. Count beneficial, harmful and neutral vetoes to diagnose failure. Keep all queries. Report domain splits descriptively. No significance or broad deployment claim is planned. Report that the investigator coded the queries and one separate reviewer judged them.
