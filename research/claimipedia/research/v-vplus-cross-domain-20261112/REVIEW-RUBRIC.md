# Cross-domain relevance review

Judge each query and candidate pair independently, from its two texts. The retrieval goal is a useful connection that can inform the query. Grade the connection, including a close analogue, an instructive inversion, or a directly relevant counterpoint. The evidence that either source claim is true lies outside this review. Respect each claim's scope.

- **2, relevant connection.** State a specific shared relationship or an informative difference between relationships. Identify the roles, dependency, or constraint on each side, and how the candidate gives the reader a concrete question, comparison, or implication for the query. A relationship can be implicit when tightly supported by the text. A chain of speculative inferences fails this threshold.
- **1, adjacent.** The texts share an issue, vocabulary, or broad theme. The mapping is weak or the candidate gives no specific insight into the query.
- **0, irrelevant.** No substantive connection can be grounded in the two texts.

Return a JSON object keyed by opaque pair ID, with a numeric `grade` and concise `reason` for every pair. For a 2, name the connection and what it contributes. Ignore order. Do not seek rankings, method labels, or other records.
