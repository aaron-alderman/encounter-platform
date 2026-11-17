"""Run preregistered Codex actor cells and retain only the observable responses."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
TOOL_ITEMS = {
    "command_execution", "file_change", "mcp_tool_call", "dynamic_tool_call",
    "collab_tool_call", "collab_agent_tool_call", "web_search", "image_view", "image_generation",
}


def load_protocol():
    frozen = (HERE / "preregistration.json").read_bytes()
    digest = hashlib.sha256(frozen).hexdigest()
    if digest != (HERE / "preregistration.sha256").read_text().split()[0]:
        raise ValueError("Preregistration digest mismatch")
    return json.loads(frozen), digest


def turn(cwd, model, prompt, session=None):
    command = ["codex", "--ask-for-approval", "never", "exec", "--sandbox", "read-only",
               "--skip-git-repo-check", "--ignore-user-config", "--disable", "memories",
               "--json", "--model", model]
    if session:
        command.extend(["resume", session])
    command.append(prompt)
    proc = subprocess.run(command, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True,
                          text=True, timeout=100)
    events = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    sessions = {e["thread_id"] for e in events if e.get("type") == "thread.started"}
    items = [e["item"] for e in events if e.get("type") == "item.completed"]
    messages = [item["text"] for item in items if item.get("type") == "agent_message"]
    tools = sorted({item["type"] for item in items if item.get("type") in TOOL_ITEMS})
    if proc.returncode or len(sessions) != 1 or not messages or not any(
        e.get("type") == "turn.completed" for e in events
    ):
        errors = [e.get("message") or e.get("error", {}).get("message") for e in events
                  if e.get("type") in {"error", "turn.failed"}]
        raise RuntimeError(f"Exit {proc.returncode}, session count {len(sessions)}, "
                           f"message count {len(messages)}. {errors or proc.stderr[-1400:]}")
    observed, = sessions
    if session and session != observed:
        raise ValueError("Resumed session ID differs from prelude session")
    return {"session": observed, "response": messages[-1], "toolItems": tools}


def cell_run(spec, cell, output):
    model = spec["actorModel"]
    result = {"id": cell["id"], "status": "failed", "turns": {}}
    with tempfile.TemporaryDirectory(prefix="claimipedia-actor-") as cwd:
        try:
            turns = result["turns"]
            history = turns["history"] = turn(cwd, model, spec["historyPrompts"][cell["history"]])
            session = history["session"]
            turns["filler"] = turn(cwd, model, spec["fillerPrompt"], session)
            if any(t["toolItems"] for t in turns.values()):
                raise ValueError("Tool use in the prelude")
            decision_session = session if cell["context"] == "intact" else None
            decision = turns["decision"] = turn(cwd, model, cell["decision"], decision_session)
            if cell["context"] == "reset" and decision["session"] == session:
                raise ValueError("Reset reused the prelude session")
            if decision["toolItems"]:
                raise ValueError("Tool use at the decision")
            response = json.loads(decision["response"])
            if not isinstance(response, dict) or set(response) != {"choice"} or response["choice"] not in ("A", "B"):
                raise ValueError("Invalid choice JSON")
            result.update(status="valid", choice=response["choice"],
                          preludeDiagnostic={"ready": history["response"] == "READY",
                                             "fillerCorrect": turns["filler"]["response"] == "43"})
        except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
            result["error"] = str(exc)
    (output / f'{cell["id"]}.json').write_text(json.dumps(result, indent=2) + "\n")
    return result["status"]


def main():
    spec, digest = load_protocol()
    output = HERE / "actor-results"
    output.mkdir(exist_ok=True)
    print(f"Frozen {digest}, {len(spec['cells'])} cells", flush=True)
    print(subprocess.check_output(["codex", "--version"], text=True).strip(), flush=True)
    pending = [cell for cell in spec["cells"] if not (output / f'{cell["id"]}.json').exists()]
    if not pending:
        return
    if len(pending) == len(spec["cells"]):
        first = pending.pop(0)
        status = cell_run(spec, first, output)
        print(f"{first['id']} {status}", flush=True)
        if status != "valid":
            print("First frozen cell failed. Check the retained error before further dispatch.", flush=True)
            return
    with ThreadPoolExecutor(max_workers=4) as pool:
        remaining = iter(pending)
        futures = {}
        for _ in range(4):
            if (cell := next(remaining, None)) is not None:
                futures[pool.submit(cell_run, spec, cell, output)] = cell
        failures = 0
        while futures:
            future = next(as_completed(futures))
            cell = futures.pop(future)
            status = future.result()
            print(f"{cell['id']} {status}", flush=True)
            failures = failures + 1 if status == "failed" else 0
            if failures >= 4:
                remaining = iter(())
                print("Halted further dispatch after four consecutive failures.", flush=True)
            if (cell := next(remaining, None)) is not None:
                futures[pool.submit(cell_run, spec, cell, output)] = cell


if __name__ == "__main__":
    main()
