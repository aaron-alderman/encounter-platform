"""Scoped V/V+ formulas with an optional, source-verified lexical registry."""

import hashlib
import importlib.util
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

BASELINE = Path(__file__).resolve().parents[1] / "v-vplus-scoped-codec-20261111/codec.py"
spec = importlib.util.spec_from_file_location("claimipedia_scoped_v2", BASELINE)
fixed = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = fixed
spec.loader.exec_module(fixed)
ID, TERMS, ARITIES = fixed.ID, fixed.TERMS, fixed.ARITIES
UNARY, BINARY, Formula, require = fixed.UNARY, fixed.BINARY, fixed.Formula, fixed.require

LEXICAL_ID = re.compile(r"@[a-z][a-z0-9]{0,11}\Z")
WORD = re.compile(r"[^\W_]+(?:[’'\-][^\W_]+)*", re.UNICODE)
BLOCKED = frozenset("""
and or nor if iff unless because therefore whereas although despite rather
without whether than when while then which that must may can should cannot
never not only always entails implies requires causes enables prevents
""".split())


@dataclass(frozen=True)
class Binding:
    text: str
    kind: str
    arity: int | None
    start: int
    end: int

    @property
    def display(self):
        return f"‹{self.text}›"


@dataclass(frozen=True)
class Lexicon:
    record_id: str
    version: str
    source_sha256: str
    entries: MappingProxyType


def compile_lexicon(record, bindings):
    """Check zero-based Python character offsets and retain exact source provenance."""
    source = record["text"]
    require(isinstance(bindings, dict) and len(bindings) <= 16, "Invalid lexical registry")
    entries = {}
    spans = []
    word_count = 0
    seen = set()
    for key, item in bindings.items():
        require(LEXICAL_ID.fullmatch(key), "Invalid lexical identifier")
        kind = item["kind"]
        require(kind in {"term", "predicate", "qualifier"}, "Invalid lexical kind")
        fields = {"kind", "start", "end", "text"} | ({"arity"} if kind == "predicate" else set())
        require(set(item) == fields, "Unexpected lexical fields")
        arity = item.get("arity")
        require(kind != "predicate" or (type(arity) is int and 1 <= arity <= 3),
                "A lexical predicate needs arity 1–3")
        start, end = item["start"], item["end"]
        require(type(start) is int and type(end) is int and 0 <= start < end <= len(source),
                "Invalid lexical span")
        quote = source[start:end]
        require(quote == item["text"], "Lexical span does not match source")
        require(not (start and (source[start - 1].isalnum() or source[start - 1] in "’'-"))
                and not (end < len(source) and (source[end].isalnum() or source[end] in "’'-")),
                "Lexical span cuts a word")
        words = quote.split(" ")
        limit = 3 if kind == "qualifier" else 5
        require(1 <= len(words) <= limit and all(WORD.fullmatch(word) for word in words),
                "Expected a short lexical phrase")
        require(not {word.casefold() for word in words} & BLOCKED,
                "Use the formula grammar for connectives and modality")
        normalized = quote.casefold()
        require(normalized not in seen, "Duplicate lexical phrase")
        seen.add(normalized)
        word_count += len(words)
        spans.append((start, end))
        entries[key] = Binding(quote, kind, arity, start, end)
    spans.sort()
    require(word_count <= min(28, 3 * len(WORD.findall(source)) // 5)
            and all(a[1] <= b[0] for a, b in zip(spans, spans[1:])),
            "Lexical spans overlap or exceed the total word budget")
    return Lexicon(record["id"], record["version"], hashlib.sha256(source.encode()).hexdigest(),
                   MappingProxyType(entries))


def term(value, roles, entries, depth=0):
    require(depth < 5, "Term nesting too deep")
    if isinstance(value, str):
        if value in entries:
            require(entries[value].kind == "term", "Expected a lexical term")
            return entries[value].display
        return fixed.term(value, roles, depth)
    require(isinstance(value, list) and len(value) == 3 and value[0] in {"of", "for"},
            "Term must be a concept, role or scoped term")
    _, head, owner = value
    return f"({term(head, roles, entries, depth + 1)} {value[0]} {term(owner, roles, entries, depth + 1)})"


def formula(node, roles, entries, refs=None, depth=0):
    require(depth < 12 and isinstance(node, list) and node and isinstance(node[0], str),
            "Invalid formula or nesting")
    op, *args = node

    def child(item):
        return formula(item, roles, entries, refs, depth + 1)

    if op == "ref":
        require(refs is not None and len(args) == 1 and isinstance(args[0], str)
                and args[0] in refs, "Unknown or misplaced reference")
        return Formula(f"[{args[0]}]", frozenset(args))
    if op == "p":
        require(refs is None and args and isinstance(args[0], str),
                "Unknown or mis-scoped predicate")
        name, *arguments = args
        entry = entries.get(name)
        if entry is None:
            arity = ARITIES.get(name)
        else:
            require(entry.kind == "predicate", "Expected a lexical predicate")
            arity, name = entry.arity, entry.display
        require(arity == len(arguments), "Incorrect predicate arity")
        return Formula(f"{name}({', '.join(term(arg, roles, entries) for arg in arguments)})")
    if op in {"forall", "exists", "during", "in", "under"}:
        require(len(args) == 2, "Scoped operator needs a parameter and body")
        parameter = term(args[0], roles, entries if refs is None else {})
        if op in {"forall", "exists"}:
            require(isinstance(args[0], str) and args[0].startswith("$"),
                    "Quantifier must bind a declared role")
        body = child(args[1])
        return Formula(f"{op} {parameter} ({body.text})", body.refs)
    if op in UNARY or op in entries:
        if op in entries:
            require(refs is None and entries[op].kind == "qualifier",
                    "Use lexical qualifiers only within coordinate clauses")
        require(len(args) == 1, "Unary operator needs one formula")
        label = entries[op].display if op in entries else UNARY[op]
        body = child(args[0])
        return Formula(f"{label} ({body.text})", body.refs)
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


def decode(program, coupled, lexicon=None):
    if lexicon is None:
        return fixed.decode(program, coupled)
    require(set(program) == {"roles", "V", "V+", "couplings"}, "Invalid program fields")
    entries = lexicon.entries
    roles = program["roles"]
    require(len(roles) <= 10 and all(ID.fullmatch(key) and
                                    (value in TERMS or value in entries
                                     and entries[value].kind == "term")
                                    for key, value in roles.items()), "Invalid role table")
    output = {"roles": {key: term(value, roles, entries) for key, value in roles.items()},
              "V": {}, "V+": {}}
    locations = {}
    for axis in ("V", "V+"):
        clauses = program[axis]
        require(len(clauses) <= 8, "Too many clauses")
        for key, (status, node) in clauses.items():
            require(ID.fullmatch(key) and key not in locations
                    and status in {"asserted", "fragment"}, "Invalid clause identifier or status")
            output[axis][key] = {"status": status, "formula": formula(node, roles, entries).text}
            locations[key] = axis
    links = program["couplings"]
    require(len(links) <= 4, "Too many couplings")
    for link in links:
        value = formula(link, roles, entries, locations)
        require({locations[key] for key in value.refs} == {"V", "V+"},
                "A coupling must reference both coordinates")
        if coupled:
            output.setdefault("couplings", []).append(value.text)
    if coupled:
        output.setdefault("couplings", [])
    return output
