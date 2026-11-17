"""Frozen sampling and blinded agreement scoring for Claimipedia invitations."""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
POWER = HERE.parent / "v-vplus-power-serves-20261112"
sys.path.insert(0, str(POWER))
import study_power as prior
import challenge as prior_challenge

base = prior.base
ORDERS = ("direct", "influence", "space")
INVITATION = {"yes", "no", "unclear"}
DECLINE = {"protected", "penalized", "unknown", "not_applicable"}
BASIS = {"reported", "proposed_or_conditional", "unspecified"}
FILES = {
    **{f"prior:{k}": v for k, v in prior.FILES.items()},
    "power_holdout": POWER / "frozen.json",
    "challenge_holdout": POWER / "challenge-frozen.json",
    "challenge_runner": POWER / "challenge.py",
    **{name: HERE / name for name in ("invitation.py", "PREREGISTRATION.md", "REVIEW-RUBRIC.md")},
}


def rx(text):
    return re.compile(text, re.I)


INVITE = rx(r"\b(?:invit\w*|welcome\w*|offer\w*)\b")
REFUSE = rx(r"\b(?:refus\w*|declin\w*|opt[ -]out|dissent\w*|exit\w*|withdraw\w*|nonparticipat\w*)\b")
CONSEQUENCE = rx(r"\b(?:penalt\w*|punish\w*|retaliat\w*|prohibitive|los(?:e|es|ing|s)|"
                 r"revoke\w*|exclus\w*|exclud\w*|coerci\w*|sanction\w*|burden\w*)\b")
DURABLE = rx(r"\b(?:infrastructure|institution\w*|default\w*|communit\w*|fallback\w*|system\w*)\b")
OPENING = rx(r"\b(?:access|participat\w*|alternativ\w*|pathway\w*|option\w*|room|possibilit\w*)\b")
GRANT = rx(r"\b(?:grant\w*|permission\w*|authoriz\w*|permit\w*|allow\w*)\b")
SYMBOL = rx(r"\b(?:symbol\w*|imagery|ritual\w*|sign\w*)\b")


def rank(purpose, value):
    return base.sha(f"claimipedia-invitations-v1|{purpose}|{value}".encode())


def sha(path):
    return base.sha(path.read_bytes())


def read(name):
    return json.loads((HERE / name).read_bytes())


def write(name, obj):
    with (HERE / name).open("x") as out:
        json.dump(obj, out, indent=2, ensure_ascii=False)
        out.write("\n")


def select():
    records = prior.corpus()
    excluded = base.EXAMPLES | {r["id"] for r in prior.frozen() + prior_challenge.frozen()}
    for sample in (base.frozen(), prior.fresh.prior.frozen(), prior.fresh.gate.frozen(), prior.fresh.frozen()):
        excluded |= {row["id"] for part in sample.values() for row in part}
    excluded |= {key for group in base.read("crystal")["groups"] for part in group["records"] for key in part}
    excluded |= set(base.read("v1")["recordIds"]) | set(base.read("v2")["ids"])
    excluded |= {row["id"] for row in base.read("v3")["records"]}
    for key in ("causal", "advisory"):
        excluded |= {row["id"] for row in base.read(key)["rows"]}

    exact = defaultdict(set)
    for key, row in records.items():
        exact[" ".join(row["text"].casefold().split())].add(key)
    reviewed = [records.keys() & set(row["recordIds"]) for row in base.read("equivalence")["decisions"]
                if row["decision"] == "confirm-equivalence"]
    components = {key: {key} for key in records}
    for group in [*exact.values(), *reviewed]:
        merged = set().union(*(components[key] for key in group))
        for key in merged:
            components[key] = merged

    strata = (
        ("explicit-invitation-cue", 6, lambda t: INVITE.search(t)),
        ("refusal-consequence-cue", 6, lambda t: REFUSE.search(t) and CONSEQUENCE.search(t)),
        ("durable-opening-cue", 5, lambda t: DURABLE.search(t) and OPENING.search(t)),
        ("permission-cue", 4, lambda t: GRANT.search(t)),
        ("symbol-control-cue", 3, lambda t: SYMBOL.search(t) and not
         (INVITE.search(t) or REFUSE.search(t) or CONSEQUENCE.search(t) or GRANT.search(t))),
    )
    result = []
    for name, size, eligible in strata:
        chosen = []
        for key in sorted(records, key=lambda item: rank(name, item)):
            text = records[key]["text"]
            if (not components[key] & excluded and len(base.WORD.findall(text)) >= 12
                    and not text.rstrip().endswith("?") and eligible(text)):
                chosen.append({"id": key, "stratum": name, "source": records[key]["source"]})
                excluded |= components[key]
                if len(chosen) == size:
                    break
        if len(chosen) != size:
            raise ValueError(f"Insufficient fresh records in {name}: {len(chosen)}")
        result.extend(chosen)
    return result


def fingerprints():
    return {key: sha(path) for key, path in FILES.items()}


def frozen():
    data = read("frozen.json")
    if data["sha256"] != fingerprints() or data["rows"] != select():
        raise ValueError("Frozen corpus or method changed")
    return data["rows"]


def packet():
    records = prior.corpus()
    key = {rank("pair", row["id"])[:12]: row["id"] for row in frozen()}
    if len(key) != 24:
        raise ValueError("Invalid opaque IDs")
    items = [{"id": label, "text": records[record]["text"]} for label, record in key.items()]
    return key, sorted(items, key=lambda item: rank("display", item["id"]))


def validate(row):
    values = row["orders"]
    if (row["invitation"] not in INVITATION or row["decline"] not in DECLINE
            or row["basis"] not in BASIS or type(values) is not list or len(set(values)) != len(values)
            or set(values) - set(ORDERS) or not row["reason"].strip()
            or row["invitation"] != "yes" and (values or row["decline"] != "not_applicable")
            or row["invitation"] == "yes" and row["decline"] == "not_applicable"):
        raise ValueError("Invalid invitation judgment")


def coded():
    values = read("annotations.json")
    if sha(HERE / "annotations.json") != (HERE / "annotations.sha256").read_text().strip():
        raise ValueError("Annotations changed")
    if set(values) != {row["id"] for row in frozen()}:
        raise ValueError("Annotation coverage mismatch")
    corpus = prior.corpus()
    for key, row in values.items():
        validate(row)
        anchors = row["anchors"]
        required = set(row["orders"])
        if row["decline"] in {"protected", "penalized"}:
            required.add("decline")
        if row["invitation"] == "yes":
            required.add("invitation")
        if set(anchors) != required or any(not q or q not in corpus[key]["text"] for q in anchors.values()):
            raise ValueError(f"Missing or unmatched source span: {key}")
    return values


def safe_ratio(n, d):
    return n / d if d else None


def score():
    annotations = coded()
    key, display = packet()
    if key != read("review-key.json") or display != read("review-packet.json"):
        raise ValueError("Blind packet changed")
    review = read("review.json")
    if set(review) != set(key):
        raise ValueError("Incomplete review")
    for row in review.values():
        validate(row)
    pairs = {record: {"coded": {k: v for k, v in annotations[record].items() if k != "anchors"},
                      "review": review[opaque]} for opaque, record in key.items()}
    orders = {}
    for name in ORDERS:
        tp = sum(name in p["coded"]["orders"] and name in p["review"]["orders"] for p in pairs.values())
        predicted = sum(name in p["coded"]["orders"] for p in pairs.values())
        reference = sum(name in p["review"]["orders"] for p in pairs.values())
        precision, recall = safe_ratio(tp, predicted), safe_ratio(tp, reference)
        orders[name] = {"agreement_positive": tp, "coded_positive": predicted, "review_positive": reference,
                        "precision": precision, "recall": recall, "adequate": reference >= 3,
                        "criterion": reference >= 3 and precision is not None
                                     and precision >= 2/3 and recall >= 2/3}
    reference_invitations = [p for p in pairs.values() if p["review"]["invitation"] == "yes"]
    either_invitation = [p for p in pairs.values() if
                         any(p[who]["invitation"] == "yes" for who in ("review", "coded"))]
    decline = {}
    for name in ("protected", "penalized"):
        n = sum(p["review"]["decline"] == name for p in reference_invitations)
        a = sum(p["review"]["decline"] == name == p["coded"]["decline"] for p in reference_invitations)
        decline[name] = {"review_positive": n, "agreement_positive": a,
                         "adequate": n >= 3, "recall": safe_ratio(a, n)}
    return {
        "pairs": pairs,
        "invitation_counts": {who: Counter(p[who]["invitation"] for p in pairs.values())
                              for who in ("coded", "review")},
        "invitation_agreement": sum(p["coded"]["invitation"] == p["review"]["invitation"] for p in pairs.values()),
        "orders": orders,
        "exact_order_set_among_either_invitation": {
            "count": sum(set(p["coded"]["orders"]) == set(p["review"]["orders"]) for p in either_invitation),
            "denominator": len(either_invitation)},
        "decline_on_review_invitations": {who: Counter(p[who]["decline"] for p in reference_invitations)
                                        for who in ("coded", "review")},
        "decline_status_agreement": sum(p["coded"]["decline"] == p["review"]["decline"]
                                       for p in reference_invitations),
        "decline_classes": decline,
        "decline_criterion": all(d["adequate"] and d["recall"] >= 2/3 for d in decline.values()),
        "sha256": {name: sha(HERE / name) for name in (
            "frozen.json", "annotations.json", "review-packet.json", "review.json")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "verify", "show", "packet", "score"))
    action = parser.parse_args().action
    if action == "freeze":
        write("frozen.json", {"utc": datetime.now(timezone.utc).isoformat(),
                              "sha256": fingerprints(), "rows": select()})
    elif action == "verify":
        print(Counter(row["stratum"] for row in frozen()))
    elif action == "show":
        records = prior.corpus()
        for row in frozen():
            print(json.dumps({**row, "text": records[row["id"]]["text"]}, ensure_ascii=False))
    elif action == "packet":
        coded()
        key, items = packet()
        write("review-key.json", key)
        write("review-packet.json", items)
    else:
        write("results.json", score())


if __name__ == "__main__":
    main()
