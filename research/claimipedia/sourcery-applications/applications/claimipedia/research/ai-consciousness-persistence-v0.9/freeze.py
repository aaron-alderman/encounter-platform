"""Freeze or replay the successor-aware retrieval experiment."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "ai-consciousness-persistence-v0.8"
METHODS = ("lexical", "hybrid")
VARIANTS = ("top1", "top2", "version-aware-top2")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def successor_index(available, sources):
    """Use explicit predecessor filenames within a single versioned protocol."""
    links = {}
    for current in available:
        record = sources[current]["projection"]
        previous = record.get("predecessor")
        if previous not in available:
            continue
        old = sources[previous]["projection"]
        family, separator, version = record["protocol"].rpartition("/")
        old_family, old_separator, old_version = old["protocol"].rpartition("/")
        if (not separator or not old_separator or family != old_family
                or not version.isdigit() or not old_version.isdigit()
                or int(version) <= int(old_version)):
            raise ValueError(f"Invalid successor edge {previous} -> {current}")
        if previous in links:
            raise ValueError(f"Ambiguous successor for {previous}")
        links[previous] = current
    return links


def versioned_top_two(ranking, links):
    selected = []
    trace = []
    for candidate in ranking:
        current = candidate
        chain = [current]
        while current in links:
            current = links[current]
            chain.append(current)
        kept = current not in selected
        trace.append({"candidate": candidate, "chain": chain, "kept": kept})
        if kept:
            selected.append(current)
        if len(selected) == 2:
            return selected, trace
    raise ValueError("The ranking has fewer than two distinct current records")


def render(prior_cell, selected, sources):
    heading, _, _ = prior_cell["prompt"].partition("\n\n")
    records = "\n\n".join(
        f'<record source="{record}">\n{sources[record]["text"]}\n</record>' for record in selected
    )
    return f'{heading}\n\n{records or "(No records supplied.)"}\n\n{prior_cell["decision"]}'


def prepare():
    prior_bytes = (PRIOR / "preregistration.json").read_bytes()
    prior_digest = sha(prior_bytes)
    if prior_digest != (PRIOR / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Prior preregistration digest mismatch")
    prior = json.loads(prior_bytes)
    sources = {record["id"]: record for record in prior["sources"]}
    for record in sources.values():
        if sha((HERE / "../../docs" / record["id"]).read_bytes()) != record["sha256"]:
            raise ValueError(f"Source digest mismatch: {record['id']}")

    receipts = {}
    for key, archive in prior["retrievalReceipts"].items():
        available = set(archive["available"])
        links = successor_index(available, sources)
        for method in METHODS:
            ranked = [row["id"] for row in archive["rankings"][method]]
            if not set(ranked) <= available:
                raise ValueError("Ranking crossed the historical checkpoint")
            current, trace = versioned_top_two(ranked, links)
            receipts[f"{key}/{method}"] = {
                "available": archive["available"], "indexSha256": archive["indexSha256"],
                "successorEdges": links, "trace": trace,
                "packets": {"top1": ranked[:1], "top2": ranked[:2], "version-aware-top2": current},
            }

    cells = []
    for original in prior["cells"]:
        method, separator, cutoff = original["arm"].partition("@")
        if not separator or method not in METHODS:
            continue
        receipt = receipts[f'{original["case"]}/{original["history"]}/{method}']
        baseline = f"top{cutoff}"
        variants = [baseline]
        if cutoff == "2":
            variants.append("version-aware-top2")
        for variant in variants:
            selected = receipt["packets"][variant]
            prompt = render(original, selected, sources)
            if variant == baseline and (selected != original["selected"] or prompt != original["prompt"]):
                raise ValueError("Baseline prompt differs from v0.8")
            cell_id = sha(f'v09|{original["id"]}|{variant}'.encode())[:12]
            cells.append({
                "id": cell_id, "sourceCell": original["id"], "case": original["case"],
                "history": original["history"], "method": method, "variant": variant,
                "arm": f"{method}/{variant}", "approveLabel": original["approveLabel"],
                "firstLabel": original["firstLabel"], "decision": original["decision"],
                "selected": selected, "prompt": prompt, "promptSha256": sha(prompt.encode()),
            })

    cells.sort(key=lambda cell: cell["id"])
    strata = {}
    for cell in cells:
        key = tuple(cell[k] for k in ("case", "approveLabel", "firstLabel"))
        strata.setdefault(key, []).append(cell)
    if len(cells) != 144 or len({c["id"] for c in cells}) != 144 or len(strata) != 12:
        raise ValueError("Incomplete frozen design")
    for group in strata.values():
        observed = {(c["history"], c["method"], c["variant"]) for c in group}
        expected = {(h, m, v) for h in ("pending", "approved") for m in METHODS for v in VARIANTS}
        if observed != expected or len({c["decision"] for c in group}) != 1:
            raise ValueError("Incomplete or unmatched choice stratum")

    return {
        "protocol": "claimipedia-ai-consciousness-persistence-version-aware-top-two/0.9",
        "status": "frozen-before-actor-dispatch",
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "predecessorSha256": prior_digest,
        "design": "Three original IAC7 transitions × two historical states × two rankers × three packet policies × two label assignments × two display orders. All 144 decisions are newly sampled after reset. Ordinary top-1 and top-2 reuse byte-identical v0.8 prompts.",
        "sources": prior["sources"],
        "cases": prior["cases"],
        "retrieval": {
            "ranker": prior["retrieval"]["ranker"], "rankerSha256": prior["retrieval"]["rankerSha256"],
            "policies": "Keep the original lexical or hybrid ranking. Ordinary arms deliver the first one or two records. Version-aware top-2 walks explicit successor links inside the checkpoint archive before delivering each candidate. Require matching versioned protocol family, a strictly increasing version and unique successor. Deduplicate resolved records and fill from later ranked candidates. Actor wrapper, record rendering and decision text are identical to controls. The selector does not inspect approval status, the question, actor choices, or the expected answer.",
        },
        "actor": prior["actor"],
        "primary": "For default-switch pairs, compare version-aware top-2 against ordinary top-2 and top-1 by method, holding case, exact decision text, label and order fixed. A full repair requires version-aware top-2 to restore pending-to-approved flips in all four default-switch pairs per method, with zero false approvals in pending trials. Report all paired differences even if the ordinary top-2 failure does not replicate.",
        "secondary": "Report matched history contrasts and correct choices by transition and historical state. Check for regressions against ordinary top-2 on the remaining transitions. Report packet changes and document IDs by checkpoint. Distinguish new-session behavior from previous-run outcomes.",
        "interpretation": "Tests an archive-aware successor substitution in the retained release lineage. The effect of adding records and the effect of choosing versions depend on the observed packets. Four label/order variants per transition do not constitute four independent source events. No live-index, cross-model, or hidden-state claim.",
        "stopping": "One response per frozen cell. No replacements or schema repair. Exclude tool use and invalid choice JSON. Halt further dispatch on tool use or systematic backend failure. Report missing cells and complete denominators.",
        "authority": "observation-and-proposal-only",
        "canonicalEffect": "none",
        "retrievalReceipts": receipts,
        "cells": cells,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    path = HERE / "preregistration.json"
    checksum = HERE / "preregistration.sha256"
    protocol = prepare()
    if args.verify:
        data = path.read_bytes()
        frozen = json.loads(data)
        protocol["frozenAtUtc"] = frozen["frozenAtUtc"]
        if sha(data) != checksum.read_text().split()[0] or protocol != frozen:
            raise ValueError("Replay differs from the frozen protocol")
        print(f"Reproduced {len(protocol['retrievalReceipts'])} rankings and {len(protocol['cells'])} prompts.")
    else:
        data = (json.dumps(protocol, indent=2) + "\n").encode()
        with path.open("xb") as target:
            target.write(data)
        with checksum.open("x") as target:
            target.write(f"{sha(data)}  preregistration.json\n")
        print(sha(data), len(protocol["cells"]))
        for key, receipt in protocol["retrievalReceipts"].items():
            ordinary = receipt["packets"]["top2"]
            versioned = receipt["packets"]["version-aware-top2"]
            if ordinary != versioned:
                print(key, ordinary, "=>", versioned)


if __name__ == "__main__":
    main()
