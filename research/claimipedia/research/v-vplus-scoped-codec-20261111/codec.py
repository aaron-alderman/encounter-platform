"""Render a typed V/V+ formula without access to source text."""

import re
from dataclasses import dataclass

TERMS = frozenset("""
actor affected agent audience authority author child citizen collective community
contributor cost data decision developer editor expert government group human
individual institution interface intermediary judge leader model operator other
participant person provider public researcher reviewer source subject system team
tool user worker
abuse access accountability action agency allegation alternative ambiguity
answerability appeal approval attention attribution autonomy belief benefit bias
boundary burden capacity capability category change choice classification coherence
commitment communication competence compliance consent consequence constraint
content context contestability continuity contract control coordination coercion
correction credibility criterion culture damage decision delegation dependence
design dignity disclosure discretion dissent distribution diversity domain duty
effect enforcement error evidence exit experience exposure fallback feedback
freedom function goal governance harm history identity impact incentive information
input instruction interpretation intervention judgment knowledge labor legitimacy
limit meaning mechanism memory method metric moral-responsibility norm objective
obligation operation option outcome output oversight participation performance
permission personhood policy power practice preference privacy procedure process
protection proxy purpose reason recognition record remedy relationship reliability
representation requirement responsibility response result reversal review right risk
role rule safety safeguard sanction scope signal speech stability standard state
status structure support surface task time tradeoff transparency trust truth
uncertainty verification version visibility vulnerability warning welfare workflow
AI artificial-intelligence attribution error-control redress review-path
decision-right decision-maker social-order institutional-order
coercive-control shared-authority human-judgment personal-choice identity-claim
actual-current durable future historical independent local long-term
observable repeated reversible short-term systemic voluntary
""".split())

# Predicate arity fixes argument order. Scope and modality belong to formula nodes.
PREDICATES = {
    1: """act agree change choose deliberate exist fail persist prevail
          recover respond suffer withdraw""",
    2: """accept access affect allocate answer-for apply assess attribute audit
          authorize avoid bear benefit-from bind cause classify conceal contest
          constrain control correct create decline decrease define delegate demand
          depend-on describe detect develop direct disclose displace distribute
          document enforce entail evaluate exclude exercise experience explain face
          follow govern grant ground guide harm hide identify improve increase
          influence infer intend interpret justify know label lack limit maintain
          measure mediate monitor need notice obey observe obtain oppose optimize
          override participate-in perform permit predict preserve prevent produce
          promote protect provide publish recognize record reduce refuse regulate
          reject rely-on remain remove repair replace represent require resist
          restore retain reveal review revise revoke risk select shape shift
          signal specify strengthen substitute support sustain test threaten track
          train transform transfer translate trust undermine update use validate
          verify weaken""",
    3: """assign attach compare confer derive distinguish-from expose grant-to
          impose link mediate-between offer protect-from refer relate
          render route transfer-to treat-as verify-against""",
}
ARITIES = {predicate: arity for arity, values in PREDICATES.items()
           for predicate in values.split()}
UNARY = {
    "not": "not", "can": "can", "must": "must", "may": "may", "should": "should",
    "increasingly": "increasingly", "initially": "initially", "eventually": "eventually",
    "always": "always", "never": "never", "typically": "typically",
    "only": "only", "explicitly": "explicitly", "still": "still", "possible": "possible",
    "unlikely": "unlikely", "necessarily": "necessarily", "often": "often",
    "partly": "partly", "independently": "independently", "voluntarily": "voluntarily",
}
BINARY = {
    "if": "if {a}, then {b}",
    "only-if": "{a} only if {b}",
    "iff": "{a} iff {b}",
    "unless": "{a} unless {b}",
    "despite": "{a} despite {b}",
    "without": "{a} without {b}",
    "enables": "{a} enables {b}",
    "prevents": "{a} prevents {b}",
    "undermines": "{a} undermines {b}",
    "causes": "{a} causes {b}",
    "supports": "{a} supports {b}",
    "requires": "{a} requires {b}",
    "not-sufficient": "{a} is insufficient for {b}",
    "rather-than": "{a} rather than {b}",
    "before": "{a} before {b}",
    "as": "{a} changes as {b} changes",
    "for": "{a} in order that {b}",
}
ID = re.compile(r"[a-z][a-z0-9]{0,11}\Z")


@dataclass(frozen=True)
class Formula:
    text: str
    refs: frozenset[str] = frozenset()


def require(test, message):
    if not test:
        raise ValueError(message)


def term(value, roles, depth=0):
    require(depth < 5, "Term nesting too deep")
    if isinstance(value, str):
        if value.startswith("$"):
            require(value[1:] in roles, "Unknown role")
            return value
        require(value in TERMS, f"Unknown concept: {value}")
        return value
    require(isinstance(value, list) and len(value) == 3 and value[0] in {"of", "for"},
            "Term must be a concept, role or scoped term")
    _, head, owner = value
    return f"({term(head, roles, depth + 1)} {value[0]} {term(owner, roles, depth + 1)})"


def formula(node, roles, refs=None, depth=0):
    require(depth < 12 and isinstance(node, list) and bool(node)
            and isinstance(node[0], str), "Invalid formula or nesting")
    op, *args = node

    def child(item):
        return formula(item, roles, refs, depth + 1)

    if op == "ref":
        require(refs is not None and len(args) == 1 and isinstance(args[0], str)
                and args[0] in refs, "Unknown or misplaced reference")
        return Formula(f"[{args[0]}]", frozenset(args))
    if op == "p":
        require(refs is None and args and isinstance(args[0], str)
                and ARITIES.get(args[0]) == len(args) - 1, "Unknown or mis-scoped predicate")
        return Formula(f"{args[0]}({', '.join(term(x, roles) for x in args[1:])})")
    if op in {"forall", "exists", "during", "in", "under"}:
        require(len(args) == 2, "Scoped operator needs a parameter and body")
        parameter = term(args[0], roles)
        if op in {"forall", "exists"}:
            require(isinstance(args[0], str) and args[0].startswith("$"),
                    "Quantifier must bind a declared role")
        body = child(args[1])
        return Formula(f"{op} {parameter} ({body.text})", body.refs)
    if op in UNARY:
        require(len(args) == 1, "Unary operator needs one formula")
        body = child(args[0])
        return Formula(f"{UNARY[op]} ({body.text})", body.refs)
    if op in {"and", "or"}:
        require(2 <= len(args) <= 6, "Conjunction or disjunction needs 2–6 formulas")
        parts = [child(x) for x in args]
        return Formula(f" {op} ".join(f"({part.text})" for part in parts),
                       frozenset.union(*(part.refs for part in parts)))
    if op in BINARY:
        require(len(args) == 2, "Binary operator needs two formulas")
        a, b = map(child, args)
        return Formula(BINARY[op].format(a=f"({a.text})", b=f"({b.text})"), a.refs | b.refs)
    raise ValueError(f"Unknown operator: {op}")


def decode(program, coupled):
    require(set(program) == {"roles", "V", "V+", "couplings"}, "Invalid program fields")
    roles = program["roles"]
    require(len(roles) <= 10 and all(ID.fullmatch(key) and value in TERMS
                                    for key, value in roles.items()), "Invalid role table")
    output = {"roles": roles, "V": {}, "V+": {}}
    locations = {}
    for axis in ("V", "V+"):
        clauses = program[axis]
        require(len(clauses) <= 8, "Too many clauses")
        for key, (status, node) in clauses.items():
            require(ID.fullmatch(key) and key not in locations
                    and status in {"asserted", "fragment"}, "Invalid clause identifier or status")
            output[axis][key] = {"status": status, "formula": formula(node, roles).text}
            locations[key] = axis
    links = program["couplings"]
    require(len(links) <= 4, "Too many couplings")
    for link in links:
        value = formula(link, roles, locations)
        require({locations[key] for key in value.refs} == {"V", "V+"},
                "A coupling must reference both coordinates")
        if coupled:
            output.setdefault("couplings", []).append(value.text)
    if coupled:
        output.setdefault("couplings", [])
    return output
