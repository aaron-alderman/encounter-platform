"""Exercise the App Build HTTP contract against the normal AppDev workspace host."""

import json
from pathlib import Path
import subprocess
from time import sleep


PATH = "/workspace/app-build"
DECLARATION = """("application", "stateProfile", "encounter/isolated-app-smoke/1")
("application", "module", "main.encounter")
("application", "module", "checks.encounter")
("application", "entry", "app.page")
("application", "entry", "test.page")
"""
MAIN = """process-module "temple/surface-process-module/1"

process app.page:
  call sample.message

process sample.message:
  let result = "North River from zero"
"""
CHECKS = """process-module "temple/surface-process-module/1"

process test.page:
  call sample.message
  let result = eq($result, "North River from zero")
"""


def verify_app_build(get, origin, sign_in, stage, certificate, port, restart):
    steward, member, manager = sign_in()
    def api(status, cookie=steward, *, path=PATH, request_origin=origin, **payload):
        # The direct client shares the 12 requests per second ingress bucket with the browser.
        sleep(0.1)
        headers = {"Accept": "application/json"}
        options = {}
        if payload:
            headers.update({"Origin": request_origin, "Content-Type": "application/json"})
            options.update(method="POST", body=json.dumps(payload))
        code, _, body = get(path, cookie, headers=headers, **options)
        assert code == status, (path, payload.get("action"), code, body[:300])
        return json.loads(body) if status != 403 or body.startswith("{") else None

    api(401, "")
    api(403, member)
    api(403, request_origin="https://other.example.test", action="create", name="Wrong origin")
    created = api(201, action="create", name="North River HTTP")["app"]
    app = created["id"]
    assert created["active"] is None and created["candidates"] == []
    api(404, path=f"{PATH}/run?app={app}")
    api(400, action="submit", app=app, files={"application.rel": DECLARATION})
    files = {"application.rel": DECLARATION, "main.encounter": MAIN, "checks.encounter": CHECKS}
    failed = dict(files, **{"checks.encounter": CHECKS.replace("North River from zero", "Different text")})
    bad = api(201, action="submit", app=app, files=failed)["candidate"]["id"]
    assert not api(200, action="assure", app=app, candidate=bad)["candidate"]["assurance"]["passed"]
    for action in ["approve", "activate"]:
        api(409, action=action, app=app, candidate=bad)
    api(404, path=f"{PATH}/run?app={app}")
    candidate = api(201, action="submit", app=app, files=files)["candidate"]["id"]
    assert candidate != bad
    assert api(200, action="submit", app=app, files=dict(reversed(list(files.items()))))["candidate"]["id"] == candidate
    api(409, action="approve", app=app, candidate=candidate)
    passed = api(200, action="assure", app=app, candidate=candidate)["candidate"]["assurance"]
    assert passed["passed"] and passed["checks"] == ["test.page"]
    api(409, action="activate", app=app, candidate=candidate)
    approved = api(200, action="approve", app=app, candidate=candidate)["candidate"]["approval"]
    assert approved["candidate"] == candidate and approved["basis"] == passed["basis"]
    receipt = api(201, action="activate", app=app, candidate=candidate)["receipt"]
    assert receipt["candidate"] == candidate and receipt["approval"] == approved["id"] and receipt["previous"] is None
    assert api(200, action="activate", app=app, candidate=candidate)["receipt"] == receipt
    assert api(200, path=f"{PATH}?app={app}&receipt={receipt['id']}") == receipt
    code, _, body = get(f"{PATH}/run?app={app}", steward)
    assert code == 200 and body == "North River from zero", (code, body)
    print("PASS: signed-in App Build rejected failed Assurance and activated the exact approved candidate", flush=True)

    stateful = json.loads(Path(__file__).with_name("app-build-storage-fixture.json").read_text())
    assert {app["id"] for app in api(200)["apps"]} == {app}
    created = api(201, action="create", name="North River API")["app"]
    assert created["active"] is None and created["candidates"] == []
    fixture = created["id"]
    source = api(201, action="submit", app=fixture, files=stateful)["candidate"]["id"]
    checked = api(200, action="assure", app=fixture, candidate=source)["candidate"]["assurance"]
    assert checked["passed"], checked
    api(200, action="approve", app=fixture, candidate=source)
    runtime_receipt = api(201, action="activate", app=fixture, candidate=source)["receipt"]
    runtime = f"{PATH}/run?app={fixture}"
    api(404, member, path=runtime)
    api(403, member, action="access", app=fixture, email="member@example.test", role="manager")
    api(200, action="access", app=fixture, email="member@example.test", role="employee")
    api(200, action="access", app=fixture, email="other-customer@example.test", role="manager")
    assert api(200, member, path=runtime)["page"]["lines"] == ["No requests yet."]
    request = {"id": "NR-API", "description": "Review a timesheet"}
    assert api(200, member, action="runtime", app=fixture, command="submit", input=request)["page"]["lines"] == [
        "NR-API · Review a timesheet · Pending"]
    assert api(200, manager, path=runtime)["page"]["lines"] == ["NR-API · Review a timesheet · Pending"]
    api(409, member, action="runtime", app=fixture, command="approve", input={"id": "NR-API"})
    assert api(200, manager, action="runtime", app=fixture, command="approve", input={"id": "NR-API"})["page"]["lines"] == [
        "NR-API · Review a timesheet · Approved"]

    config = stage / "app-build-fixture.json"
    config.touch(mode=0o600)
    config.write_text(json.dumps({"origin": origin, "certificate": str(certificate), "port": port, "steward": steward,
        "apiApp": app, "stateful": stateful, "member": member, "manager": manager}))
    report = stage / "app-build-browser-result.json"
    subprocess.run(["node", Path(__file__).with_name("app-build-browser.mjs"), config, report], check=True, timeout=85)
    paths = {"api": {"app": fixture, "receipt": runtime_receipt["id"], "request": "NR-API"},
             **json.loads(report.read_text())}
    assert set(paths) == {"api", "manual", "replay"}
    assert len({path["app"] for path in paths.values()}) == 3
    assert app not in {path["app"] for path in paths.values()}

    def reopen(path, steward, employee, reviewer):
        app_id = path["app"]
        actual = api(200, steward, path=f"{PATH}?app={app_id}&receipt={path['receipt']}")
        assert actual["app"] == app_id and actual["id"] == path["receipt"]
        assert actual["outcome"] == "activated" and actual["previous"] is None
        record = api(200, steward, path=f"{PATH}?app={app_id}&candidate={actual['candidate']}")["candidate"]
        assert record["files"] == stateful
        assert record["assurance"]["passed"]
        assert record["assurance"]["checks"] == ["test.approval", "test.role-access"]
        assert actual["basis"] == record["assurance"]["basis"] == runtime_receipt["basis"]
        assert actual["approval"] == record["approval"]["id"]
        assert actual["candidate"] == record["id"] == record["approval"]["candidate"]
        assert actual["basis"] == record["approval"]["basis"]
        assert "state" not in api(200, steward, path=f"{PATH}?app={app_id}")["app"]
        expected = [f"{path['request']} · Review a timesheet · Approved"]
        for role in (employee, reviewer):
            assert api(200, role, path=f"{PATH}/run?app={app_id}")["page"]["lines"] == expected
        return actual

    before = {name: reopen(path, steward, member, manager) for name, path in paths.items()}
    assert before["api"] == runtime_receipt
    print("PASS: North River API, manual UI and guided replay activated equivalent checked sources in three isolated apps", flush=True)
    restart()
    fresh = sign_in()
    assert all(new != old for new, old in zip(fresh, (steward, member, manager)))
    for name, path in paths.items():
        assert reopen(path, *fresh) == before[name]
    assert api(200, fresh[0], action="activate", app=app, candidate=candidate)["receipt"] == receipt
    assert api(200, fresh[0], path=f"{PATH}?app={app}&receipt={receipt['id']}") == receipt
    print("PASS: North River employee submissions, manager approvals and all three exact receipts survived a workspace restart and fresh Temple sign-ins", flush=True)
    return receipt
