"""Prepare frozen retrieval packets, run reset actors, and score the three methods."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

from resolver import AuthorityArchive, DOCS, HERE, digest

METHODS = ("ordinary", "version-aware")


def read_verified(filename, sha):
    raw = (HERE / filename).read_bytes()
    if digest(raw)[7:] != sha:
        raise ValueError(f"Frozen file digest mismatch: {filename}")
    return json.loads(raw)


def load():
    sha = (HERE / "preregistration.sha256").read_text().split()[0]
    p = read_verified("preregistration.json", sha)
    bindings = read_verified("archive-bindings.json", p["archiveBindingsSha256"])
    return p, sha, AuthorityArchive(DOCS, bindings)


def write(filename, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    with (HERE / filename).open("xb") as output:
        output.write(raw)
    return digest(raw)[7:]


def projection(archive, source, cutoff):
    catalog = archive.bindings["catalog"]
    kind = catalog[source]["kind"]
    raw = archive.record(source, cutoff, kind)
    fields = {k: raw[k] for k in ("protocol", "cycle", "status", "id", "approval",
                                  "excludes", "exclusions", "authorityBoundary") if k in raw}
    if kind == "review":
        fields["reviewDecisions"] = raw["reviewPacket"]["decisions"]
    elif kind == "directive":
        fields["decisions"] = raw["decisions"]
    else:
        sections = {binding["ledgerPath"][0] for binding in archive.bindings["decisions"].values()
                    if binding["ledger"] == source}
        fields.update({name: raw[name] for name in sorted(sections)})
        fields.update({k: raw[k] for k in ("summary",) if k in raw})
    return "\n".join(f"{name}: {json.dumps(value, ensure_ascii=False)}" for name, value in fields.items())


def prepare(p, sha, archive):
    ranker = HERE.parents[5] / "applications/context-hub/tooling/search/search_corpus.mjs"
    if digest(ranker.read_bytes()) != p["rankerSha256"]:
        raise ValueError("Context Hub ranker differs from preregistration")
    catalog = archive.bindings["catalog"]
    packets = []
    for task in p["tasks"]:
        cutoff = archive.ordinal(task["asOf"])
        available = {name for name, meta in catalog.items()
                     if meta["kind"] != "receipt" and archive.available(name, cutoff)}
        links = archive.successors(cutoff)
        bodies = {name: projection(archive, name, cutoff) for name in sorted(available)}
        with tempfile.TemporaryDirectory(prefix="claimipedia-authority-index-") as directory:
            corpus = Path(directory) / "corpus"
            corpus.mkdir()
            for name, text in bodies.items():
                # Edge targets come from the captured review/approval bindings.
                linked = set()
                for binding in archive.bindings["decisions"].values():
                    review, directive, ledger = [binding[key] for key in ("review", "directive", "ledger")]
                    if name == directive:
                        linked.add(review)
                    elif name == ledger:
                        linked.add(directive)
                links_text = "\n".join(f"- [{target}]({target}.md)" for target in sorted(linked & available))
                title = name.removesuffix(".json").replace("-", " ")
                (corpus / f"{name}.md").write_text(f"# {title}\n\n{text}\n\n{links_text}\n")
            ranked = json.loads(subprocess.check_output(
                ["node", HERE / "rank.mjs", directory, task["query"]], text=True
            ))
        ranking = [entry["source"] for entry in ranked["ranking"]]
        if not ranking or not set(ranking) <= available:
            raise ValueError("Invalid checkpoint ranking")
        versioned = list(dict.fromkeys(links.get(name, name) for name in ranking))[:2]
        for method, selected in (("ordinary", ranking[:2]), ("version-aware", versioned)):
            records = "\n\n".join(f'<record source="{name}">\n{bodies[name]}\n</record>' for name in selected)
            prompt = (
                "Read-only historical classification. Use only the supplied records and do not use tools or files. "
                "Decide whether the exact named action had been approved at the requested checkpoint. "
                "Related approvals do not grant this scope. Use pending if the records do not establish approval. "
                "Return only JSON with keys decision (approved or pending) and citation (one exact supplied filename "
                "that governs the action at the checkpoint, or null if no supplied record does).\n\n"
                f"Checkpoint: {task['asOf']}\nQuestion: {task['question']}\n\n{records}"
            )
            id = digest(f"{method}|{task['id']}".encode())[7:19]
            packets.append({
                "id": id, "task": task["id"], "method": method, "selected": selected,
                "available": sorted(available), "versionLinks": links, "rankReceipt": ranked,
                "prompt": prompt, "promptSha256": digest(prompt.encode()),
            })
    packet_digest = write("retrieval-packets.json", {"preregistrationSha256": sha, "packets": packets})
    (HERE / "retrieval-packets.sha256").write_text(f"{packet_digest}  retrieval-packets.json\n")
    print(f"Froze {len(packets)} retrieval packets: {packet_digest}", flush=True)


def load_packets(sha):
    digest_value = (HERE / "retrieval-packets.sha256").read_text().split()[0]
    data = read_verified("retrieval-packets.json", digest_value)
    if data["preregistrationSha256"] != sha or len(data["packets"]) != 24:
        raise ValueError("Retrieval packets do not match preregistration")
    if any(digest(x["prompt"].encode()) != x["promptSha256"] for x in data["packets"]):
        raise ValueError("Actor prompt hash mismatch")
    return data["packets"], digest_value


def run(p, sha):
    packets, packets_sha = load_packets(sha)
    launcher = HERE.parent / "ai-consciousness-persistence-v0.6/run.py"
    if digest(launcher.read_bytes())[7:] != p["actor"]["launcherSha256"]:
        raise ValueError("Actor launcher differs from preregistration")
    spec = importlib.util.spec_from_file_location("claimipedia_actor", launcher)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    directory = HERE / "actor-results"
    directory.mkdir()
    write("runtime.json", {"preregistrationSha256": sha, "packetsSha256": packets_sha,
                            "startedAtUtc": datetime.now(timezone.utc).isoformat(),
                            "cli": subprocess.check_output(["codex", "--version"], text=True).strip(),
                            "requestedModel": p["actor"]["requestedModel"]})

    def one(packet):
        result = {"id": packet["id"], "promptSha256": packet["promptSha256"], "status": "invalid"}
        with tempfile.TemporaryDirectory(prefix="claimipedia-heldout-actor-") as cwd:
            try:
                turn = module.turn(cwd, p["actor"]["requestedModel"], packet["prompt"])
                result["session"] = turn["session"]
                result["response"] = turn["response"]
                if turn["toolItems"]:
                    raise ValueError("Actor used tools")
                pairs = json.loads(turn["response"], object_pairs_hook=list)
                answer = dict(pairs)
                if (len(pairs) != 2 or set(answer) != {"decision", "citation"}
                        or answer["decision"] not in ("approved", "pending")
                        or (answer["citation"] is not None and not isinstance(answer["citation"], str))):
                    raise ValueError("Malformed decision JSON")
                result.update(status="valid", **answer)
            except (ValueError, TypeError, RuntimeError, subprocess.TimeoutExpired) as error:
                result["error"] = str(error)
        write(f'actor-results/{packet["id"]}.json', result)
        print(packet["id"], result["status"], flush=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, sorted(packets, key=lambda x: x["id"])))


def score(p, sha, archive):
    gold = read_verified("gold.json", p["goldSha256"])
    packets, packets_sha = load_packets(sha)
    runtime = json.loads((HERE / "runtime.json").read_text())
    if runtime["preregistrationSha256"] != sha or runtime["packetsSha256"] != packets_sha:
        raise ValueError("Runtime does not match the frozen packets")
    tasks = {task["id"]: task for task in p["tasks"]}
    outcomes = {method: {} for method in (*METHODS, "resolver")}
    sessions = set()
    for packet in packets:
        path = HERE / "actor-results" / f'{packet["id"]}.json'
        answer = json.loads(path.read_text()) if path.is_file() else {"status": "missing"}
        if answer["status"] != "missing" and (
            answer["id"] != packet["id"] or answer["promptSha256"] != packet["promptSha256"]
        ):
            raise ValueError("Actor receipt differs from frozen prompt")
        if answer.get("session") is not None:
            if answer["session"] in sessions:
                raise ValueError("Decision session was reused")
            sessions.add(answer["session"])
        outcomes[packet["method"]][packet["task"]] = {
            "decision": answer.get("decision"), "citation": answer.get("citation"),
            "status": answer["status"], "delivered": packet["selected"],
        }
    for id, task in tasks.items():
        answer = archive.resolve(task["decision"], task["asOf"])
        citation = answer["citation"]
        outcomes["resolver"][id] = {
            "decision": answer["decision"], "citation": citation["record"] if citation else None,
            "status": "valid", "detail": answer,
        }

    summaries = {}
    for method, answers in outcomes.items():
        metrics = dict(missedApprovals=0, falseApprovals=0, correctDecisions=0, correctCitations=0,
                       correctDecisionAndCitation=0, invalidOrMissing=0, tasks=len(tasks))
        for id, answer in answers.items():
            expected = gold[id]
            valid = answer["status"] == "valid"
            correct = valid and answer["decision"] == expected["decision"]
            eligible = valid and answer["citation"] in expected["citations"] and (
                method == "resolver" or answer["citation"] in answer["delivered"]
            )
            metrics["missedApprovals"] += expected["decision"] == "approved" and not correct
            metrics["falseApprovals"] += expected["decision"] == "pending" and valid and answer["decision"] == "approved"
            metrics["correctDecisions"] += correct
            metrics["correctCitations"] += eligible
            metrics["correctDecisionAndCitation"] += correct and eligible
            metrics["invalidOrMissing"] += not valid
            answer.update(gold=expected, correctDecision=correct, correctCitation=eligible)
        summaries[method] = metrics
    report = {"preregistrationSha256": sha, "packetsSha256": packets_sha, "runtime": runtime,
              "freshSessionsVerifiedDistinct": len(sessions), "metrics": summaries,
              "outcomes": outcomes, "canonicalEffect": "none"}
    write("final-results.json", report)
    print(json.dumps(summaries, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("prepare", "run", "score"))
    args = parser.parse_args()
    p, sha, archive = load()
    if args.stage == "prepare":
        prepare(p, sha, archive)
    elif args.stage == "run":
        run(p, sha)
    else:
        score(p, sha, archive)


if __name__ == "__main__":
    main()
