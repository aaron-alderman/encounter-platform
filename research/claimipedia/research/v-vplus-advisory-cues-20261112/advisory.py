"""Validate typed V/V+ witnesses with lexical cues reported as diagnostics."""

import hashlib
import sys
from pathlib import Path

PRIOR = Path(__file__).resolve().parents[1] / "v-vplus-causal-check-20261112"
sys.path.insert(0, str(PRIOR))

from causal import EDGE, STRENGTH, require, signature, span


def check(record, nodes, proposed, support):
    source = record["text"]
    require(support["record"] == record["id"] and support["version"] == record["version"]
            and support["sha256"] == hashlib.sha256(source.encode()).hexdigest(),
            "Support belongs to a different source revision")
    for node in nodes.values():
        require(node["axis"] in {"V", "V+"}, "Invalid coordinate")
        span(source, node["span"])

    witnesses = {}
    for witness in support["witnesses"]:
        link = signature(witness["link"], nodes)
        snippet = span(source, witness["span"])
        start, end = witness["span"]["start"], witness["span"]["end"]
        refs = [*link[1:-3], *([link[-1]] if link[-1] is not None else [])]
        if all(start <= nodes[ref]["span"]["start"] < nodes[ref]["span"]["end"] <= end
               for ref in refs):
            cue = bool((STRENGTH if link[0] == "strength" else EDGE).search(snippet))
            witnesses[link] = witnesses.get(link, False) or cue
    result = []
    for item in proposed:
        link = signature(item, nodes)
        accepted = link in witnesses
        cue = witnesses.get(link)
        result.append({"link": item, "accepted": accepted, "cue_matched": cue,
                       "reason": ("typed witness with cue" if cue else "typed witness without cue")
                       if accepted else "no matching typed witness"})
    return result
