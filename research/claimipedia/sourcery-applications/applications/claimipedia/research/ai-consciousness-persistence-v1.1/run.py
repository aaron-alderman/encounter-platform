"""Dispatch the frozen retrieval packets to fresh Codex decision sessions."""
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load_protocol():
    raw = (HERE / "preregistration.json").read_bytes()
    digest = sha(raw)
    if digest != (HERE / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Preregistration digest mismatch")
    protocol = json.loads(raw)
    if len(protocol["cells"]) != 192 or len({c["id"] for c in protocol["cells"]}) != 192:
        raise ValueError("Unexpected preregistered design")
    if any(sha(c["prompt"].encode()) != c["promptSha256"] for c in protocol["cells"]):
        raise ValueError("Prompt digest mismatch")
    return protocol, digest


def load_actor(protocol):
    path = HERE.parent / "ai-consciousness-persistence-v0.6/run.py"
    if sha(path.read_bytes()) != protocol["actor"]["launcherSha256"]:
        raise ValueError("Actor launcher digest mismatch")
    spec = importlib.util.spec_from_file_location("predecessor_actor", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.turn


def record_cell(actor, model, cell, directory):
    result = {"id": cell["id"], "promptSha256": cell["promptSha256"], "status": "failed"}
    with tempfile.TemporaryDirectory(prefix="claimipedia-actor-") as cwd:
        try:
            decision = result["decision"] = actor(cwd, model, cell["prompt"])
            if decision["toolItems"]:
                result["status"] = "tool-use"
                raise ValueError("Decision actor used tools")
            pairs = json.loads(decision["response"], object_pairs_hook=list)
            if pairs not in [[("choice", "A")], [("choice", "B")]]:
                raise ValueError("Invalid choice JSON")
            result.update(status="valid", choice=pairs[0][1])
        except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
            result["error"] = str(exc)
    with (directory / f'{cell["id"]}.json').open("x") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    return result["status"]


def main():
    protocol, digest = load_protocol()
    actor = load_actor(protocol)
    for source in protocol["sources"]:
        if sha((HERE / "../.." / source["id"]).read_bytes()) != source["sha256"]:
            raise ValueError(f"Source digest mismatch for {source['id']}")
    directory = HERE / "actor-results"
    directory.mkdir(exist_ok=True)
    runtime = {
        "preregistrationSha256": digest,
        "startedAtUtc": datetime.now(timezone.utc).isoformat(),
        "cli": subprocess.check_output(["codex", "--version"], text=True).strip(),
        "requestedModel": protocol["actor"]["requestedModel"],
    }
    with (HERE / "runtime.json").open("x") as output:
        json.dump(runtime, output, indent=2)
        output.write("\n")
    print(f"Frozen {digest}, {len(protocol['cells'])} cells", flush=True)
    print(runtime["cli"], flush=True)
    model = runtime["requestedModel"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = {}
        cells = iter(protocol["cells"])
        failures = 0
        stopped = False

        def replenish():
            while not stopped and len(pending) < 4 and (cell := next(cells, None)) is not None:
                pending[pool.submit(record_cell, actor, model, cell, directory)] = cell

        replenish()
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                cell = pending.pop(future)
                status = future.result()
                print(f"{cell['id']} {status}", flush=True)
                failures = failures + 1 if status == "failed" else 0
                if status == "tool-use" or failures >= 4:
                    stopped = True
                    print("Stopped further dispatch under the preregistered boundary", flush=True)
            replenish()


if __name__ == "__main__":
    main()
