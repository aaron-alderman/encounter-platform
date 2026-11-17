"""Closed vocabulary V/V+ claim codec. The decoder never reads source claims."""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENTITIES = frozenset("""
person user child parent agent other group institution community public
system model tool mediator authority decision maker participant affected
developer operator reviewer source record evidence claim action goal judgment
cost risk benefit outcome power control responsibility trust knowledge meaning
identity context constraint consent oversight appeal refusal exit choice
relationship commitment capability interpretation rights visibility process
attribution accountability information governance procedure output feedback
participation continuity harm coercion consent alternatives access default
""".split())
PREDICATES = frozenset("""
act choose refuse consent exit contest decide judge know learn interpret review
verify observe access disclose decide delegate authorize revoke govern control
support enable limit constrain preserve weaken threaten replace override
bear impose shift absorb assign allocate benefit harm depend share coordinate
cooperate participate commit recognize protect trust deserve distinguish
attribute trace explain record maintain restore persist remain retain require
reduce increase assume exercise represent resist pursue legitimize
""".split())
MODALITIES = {
    "asserted": "{subject} {predicate}{object}",
    "possible": "{subject} can {predicate}{object}",
    "required": "{subject} must {predicate}{object}",
    "forbidden": "{subject} must avoid {predicate}{object}",
    "negative": "{subject} does not {predicate}{object}",
    "impossible": "{subject} cannot {predicate}{object}",
    "permitted": "{subject} may {predicate}{object}",
}
COUPLINGS = {
    "enables": "{left} enables {right}.",
    "requires": "{left} requires {right}.",
    "only-if": "{left} holds only if {right}.",
    "if": "If {left}, then {right}.",
    "without": "{left} can hold without {right}.",
    "threatens": "{left} threatens {right}.",
    "obligates": "{left} creates an obligation for {right}.",
    "purpose": "{left} serves the purpose of {right}.",
    "instead-of": "{left} holds in place of {right}.",
    "as": "{left} changes as {right} changes.",
    "even-if": "{left} holds even if {right}.",
    "joint": "{left} and {right} hold jointly.",
}


def atom(clause):
    subject, predicate, obj, mode = clause
    if subject not in ENTITIES or (obj is not None and obj not in ENTITIES):
        raise ValueError(f"Unknown role or object in {clause!r}")
    if predicate not in PREDICATES or mode not in MODALITIES:
        raise ValueError(f"Unknown predicate or modality in {clause!r}")
    # Use quoted propositions to keep roles and scope explicit in controlled text.
    return MODALITIES[mode].format(subject=subject, predicate=predicate,
                                   object=f" [{obj}]" if obj is not None else "")


def decode(program, arm):
    if set(program) != {"V", "V+", "couplings"}:
        raise ValueError("Expected V, V+, and couplings")
    coordinates = {axis: [atom(clause) for clause in program[axis]]
                   for axis in ("V", "V+")}
    if any(len(clauses) > 4 for clauses in coordinates.values()) or len(program["couplings"]) > 3:
        raise ValueError("Maximum four propositions per coordinate and three couplings")
    for kind, axis, left, right in program["couplings"]:
        if kind not in COUPLINGS or axis not in coordinates:
            raise ValueError("Unknown coupling kind or direction")
        other = "V+" if axis == "V" else "V"
        if type(left) is not int or not 0 <= left < len(coordinates[axis]):
            raise ValueError("Invalid coupling source")
        if type(right) is not int or not 0 <= right < len(coordinates[other]):
            raise ValueError("Invalid coupling destination")

    if arm not in {"full", "uncoupled", "V", "V+"}:
        raise ValueError("Unknown arm")
    axes = (arm,) if arm in coordinates else tuple(coordinates)
    output = {axis: coordinates[axis] for axis in axes}
    if arm == "full":
        output["couplings"] = [
            COUPLINGS[kind].format(
                left=f"‘{coordinates[axis][left]}’",
                right=f"‘{coordinates['V+' if axis == 'V' else 'V'][right]}’",
            )
            for kind, axis, left, right in program["couplings"]
        ]
    return output


def main():
    encodings = json.loads((HERE / "encodings.json").read_text())
    plan = json.loads((HERE / "frozen-holdout.json").read_text())
    if set(encodings) != set(plan["recordIds"]):
        raise ValueError("Encodings must cover exactly the frozen records")
    result = {record: {arm: decode(encodings[record], arm)
                       for arm in ("full", "uncoupled", "V", "V+")}
              for record in plan["recordIds"]}
    with (HERE / "decoded.json").open("x") as out:
        json.dump(result, out, indent=2, ensure_ascii=False)
        out.write("\n")


if __name__ == "__main__":
    main()
