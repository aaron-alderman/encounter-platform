# Independent review of invitations and the option to decline

Use only the supplied claim text. Judge the arrangement actually stated, including a proposal or hypothetical if the text specifies one. Do not judge whether the claim is true. Keep an absent fact unknown. Identify the specific action or opportunity offered, to whom, and how.

**Invitation status.** Use `yes` for a stated offer, grant, or arrangement that makes a concrete opportunity for uptake available to someone. A nominal or apparent offer still qualifies if the text identifies it and states an adverse price for refusing. Use `no` for a statement about a symbol, demand, general principle or outcome without an offer or opening. Use `unclear` when an invitation is plausible but the recipient, opportunity or availability is too underspecified. Do not treat the words “offer,” “access,” or “voluntary” as sufficient evidence by themselves.

**Orders.** An invitation may use multiple mechanisms or have unresolved mechanism. Return a list from:

- `direct` when someone grants, yields, or immediately makes available a specified action, access, resource or permission to a recipient.
- `influence` when a communicative or incentive mechanism makes the opportunity salient or changes how uptake or refusal is expected to be received. A symbol carries this order only if the text states the audience, its operative context and how the symbol cues an expectation or meaning. A bare symbol or an interpretation of what it represents is insufficient.
- `space` when enduring infrastructure, rules, distributed support or material alternatives make the opportunity realistically available beyond a particular grant. References to community or institutions alone are insufficient.

**Decline status.** For an invitation, use `protected` when the text explicitly establishes a usable decline route and freedom from imposed adverse consequences, or gives an explicit safeguard that protects both. Use `penalized` when the text states an imposed consequence of declining, such as retaliation, exclusion, loss of a standing entitlement, or an explicitly prohibitive barrier to exit. Formal permission does not erase a practical penalty. Forgoing the benefit being offered is not itself a penalty. Use `unknown` when the source does not say enough, including bare assurances that something is voluntary. For a no or unclear invitation, use `not_applicable` and an empty orders list.

**Basis.** Use `reported` for a portrayed occurrence or existing arrangement, `proposed_or_conditional` for a recommendation, scenario or hypothetical, and `unspecified` otherwise. A reported portrayal is not independent verification. In the reason, identify the offer and mechanism if any, and why refusal consequences are supported or unknown.

Return a JSON object keyed by opaque ID. Each value has `invitation`, `orders`, `decline`, `basis` and a concise `reason`. Read only the packet and this rubric.
