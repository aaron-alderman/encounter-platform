"""Evidence gate for directed V/V+ causal links and effect-strength links."""

import hashlib
import re

# These cues qualify an annotation for checking. They do not parse the claim.
EDGE = re.compile(
    r"\b(?:caus\w*|enabl\w*|lead(?:s|ing)? to|led to|mak\w*|reduc\w*|"
    r"increas\w*|weaken\w*|strengthen\w*|amplif\w*|undermin\w*|"
    r"prevent\w*|produc\w*|result\w* in|shift\w*|preserv\w*|"
    r"driv\w*|generat\w*|promot\w*|becom\w*|creat\w*|expos\w*|"
    r"threaten\w*|lock\w*|render\w*|thereby|forces?|forcing|allows?|allowing)\b",
    re.I,
)
STRENGTH = re.compile(
    r"\b(?:(?:strength|magnitude|size) of (?:the |an? )?(?:effect|impact|influence)|"
    r"(?:effect|impact|influence)[^.;]{0,48}\b(?:depends on|varies with|stronger|weaker)|"
    r"(?:amplif\w*|attenuat\w*|magnif\w*|moderat\w*|weaken\w*|strengthen\w*) "
    r"(?:the |an? )?(?:effect|impact|influence))\b",
    re.I,
)
MODES = {"possible", "asserted", "conditional"}
DIRECTIONS = {"increase", "decrease", "change"}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def span(text, anchor):
    require(isinstance(anchor, dict) and set(anchor) == {"start", "end", "quote"},
            "Expected source offsets and quote")
    start, end = anchor["start"], anchor["end"]
    require(type(start) is int and type(end) is int and 0 <= start < end <= len(text)
            and text[start:end] == anchor["quote"], "Source span mismatch")
    return text[start:end]


def signature(link, nodes):
    require(isinstance(link, list) and link and isinstance(link[0], str), "Invalid link")
    kind, *args = link
    require(kind in {"edge", "strength"} and len(args) == (5 if kind == "edge" else 6),
            "Invalid link type or arity")
    *refs, direction, mode, scope = args
    require(len(set(refs)) == len(refs) and set(refs) <= nodes.keys(),
            "Link requires distinct, declared clause references")
    require(direction in DIRECTIONS and mode in MODES and (scope is None or scope in nodes),
            "Invalid direction, modality, or scope")
    require(mode != "conditional" or scope is not None, "Conditional link needs its condition")
    return tuple(link)


def check(record, nodes, proposed, support):
    """Return a subset of proposed couplings, with a receipt for every decision."""
    source = record["text"]
    require(support["record"] == record["id"] and support["version"] == record["version"]
            and support["sha256"] == hashlib.sha256(source.encode()).hexdigest(),
            "Support belongs to a different source revision")
    for node in nodes.values():
        require(node["axis"] in {"V", "V+"}, "Invalid coordinate")
        span(source, node["span"])
    licensed = set()
    for witness in support["witnesses"]:
        claim = signature(witness["link"], nodes)
        snippet = span(source, witness["span"])
        start, end = witness["span"]["start"], witness["span"]["end"]
        if (STRENGTH if claim[0] == "strength" else EDGE).search(snippet) is None:
            continue
        # All referenced events and the scope must be grounded in the witness's source window.
        refs = [*claim[1:-3], *([claim[-1]] if claim[-1] is not None else [])]
        if all(start <= nodes[ref]["span"]["start"] < nodes[ref]["span"]["end"] <= end
               for ref in refs):
            licensed.add(claim)
    outcomes = []
    for item in proposed:
        link = signature(item, nodes)
        accepted = link in licensed
        outcomes.append({"link": item, "accepted": accepted,
                         "reason": "matching sourced link" if accepted else "no matching sourced link"})
    return outcomes
