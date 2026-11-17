"""Verify workspace routes and Store continuation against disposable loopback hosts."""
import argparse
import base64
import contextlib
import hashlib
import hmac
from datetime import datetime, timezone
from http.client import HTTPConnection, HTTPSConnection
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import secrets
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlencode, urlsplit
from html import escape

WORKSPACE = Path(__file__).resolve().parents[5]
PROJECTS = WORKSPACE / "projects"
APP = PROJECTS / "applications/appdev-projects"
BINARY = Path(os.environ.get("ENCOUNTER_RUST_HOST", PROJECTS / "encounter-core/target/release/encounter"))
RELEASE_RUNTIME = Path(os.environ.get("APPDEV_RELEASE_RUNTIME", BINARY))
AUTH = "Basic dGVzdDp3b3Jrc3BhY2U="
BROKER = "workspace-broker.test"
STEWARD = "steward@example.test"
GAME_IMAGE = "sourcery-game-reference-global-logistics-tycoon.png"
GAME_IMAGE_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWioAAAAASUVORK5CYII=")


allocated_ports = set()


def free_port():
    while True:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        if port not in allocated_ports:
            allocated_ports.add(port)
            return port


def http(port, path, *, cookie="", host=None, method="GET", body=None, headers=None, tls=None, all_csp=False):
    request_headers = {"Cookie": cookie, **(headers or {})}
    if host:
        request_headers["Host"] = host
    connection = (HTTPSConnection("127.0.0.1", port, timeout=8, context=tls) if tls
                  else HTTPConnection("127.0.0.1", port, timeout=8))
    try:
        connection.request(method, path, body=body, headers=request_headers)
        reply = connection.getresponse()
        response_headers = dict(reversed(reply.getheaders()))
        if all_csp:
            response_headers["Content-Security-Policy"] = ",".join(
                value for name, value in reply.getheaders() if name.lower() == "content-security-policy")
        return reply.status, response_headers, reply.read().decode()
    finally:
        connection.close()


def stage_program(root, declaration, base=PROJECTS, shared_algebra=None):
    source = base / declaration
    paths = [declaration]
    for line in source.read_text().splitlines():
        if not line.startswith("("):
            continue
        subject, key, value = json.loads("[" + line[1:-1] + "]")
        if (subject == "application" and key in ("module", "dataSource")) or (
            subject.startswith("data.") and key == "source"
        ):
            paths.append(value)
    for relative in paths:
        dest = root / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        source = base / relative
        if shared_algebra and relative.startswith("algebra/") and not source.is_file():
            source = shared_algebra / relative
        shutil.copyfile(source, dest)


class Provider(BaseHTTPRequestHandler):
    users = {"A": STEWARD, "B": "member@example.test", "C": "other-customer@example.test"}

    def do_GET(self):
        value = self.headers.get("Cookie", "").removeprefix("__Host-sourcery_session=src_session_")
        user = value[:1]
        if user not in self.users:
            self.send_error(401)
            return
        body = json.dumps({"kind": "user", "identity": {
            "id": user, "email": self.users[user], "issuer": "https://accounts.google.com"
        }}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class StoreFixture(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    releases = {"one-world-1.2.3": "Playing One World 1.2.3", "one-world-9.9.9": "Playing One World 9.9.9"}

    def do_GET(self):
        if urlsplit(self.path).path != "/":
            self.send_error(404)
            return
        release = parse_qs(urlsplit(self.path).query).get("play", [""])[0]
        title = self.releases.get(release, "Store catalog")
        body = ('<article id="store-content"><h2>' + title
                + '</h2><a href="/?play=one-world-9.9.9">Open the other release</a></article>').encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class IndexProviderFixture(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path = urlsplit(self.path).path
        if self.headers.get("Authorization") == AUTH and path == "/images/" + GAME_IMAGE:
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(GAME_IMAGE_BYTES)))
            self.end_headers()
            self.wfile.write(GAME_IMAGE_BYTES)
            return
        pages = {"/": '<nav class="navigation pane">Game Hub</nav>',
                 "/project": "<p>Project home · Tasks and decisions</p>"}
        page = pages.get(path)
        if not page or self.headers.get("Authorization") != AUTH:
            self.send_error(403)
            return
        body = f"<html><head></head><body>{page}</body></html>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class WorkMountFixture(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self.respond("GET")

    def do_POST(self):
        self.respond("POST")

    def respond(self, method):
        path = urlsplit(self.path).path
        if self.headers.get("Authorization") != AUTH:
            self.send_error(403)
            return
        if method == "GET" and path == "/decompiler":
            try:
                body = subprocess.check_output(
                    [RELEASE_RUNTIME, "appdev-decompiler-check", APP, "mount-document"], timeout=12)
            except (OSError, subprocess.SubprocessError):
                self.send_error(502, "Unable to verify the hosted Decompiler mount")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = f"{method} {path}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class StoreBroker(BaseHTTPRequestHandler):
    gateway = None

    def do_GET(self):
        url = urlsplit(self.path)
        fields = parse_qs(url.query)
        if url.path == "/identity/login":
            resume = fields["return"][0]
            body = ('<h1>Temple sign-in fixture</h1><a href="' + escape(resume, quote=True)
                    + '">Continue as test user</a> <a href="' + escape(resume + "&fixture=member", quote=True)
                    + '">Continue as member</a>').encode()
            status, headers = 200, {}
        else:
            user = ("B" if fields.pop("fixture", []) == ["member"] else "A") if "returned" in fields else ""
            request_path = url.path + "?" + urlencode(fields, doseq=True)
            status, headers, text = http(self.gateway, request_path, host=self.headers["Host"],
                cookie="__Host-sourcery_session=src_session_" + user * 43 if user else "")
            body = text.encode()
        self.send_response(status)
        if "Location" in headers:
            self.send_header("Location", headers["Location"])
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class ShopLogin(BaseHTTPRequestHandler):
    def do_GET(self):
        target = urlsplit(self.path)
        query = parse_qs(target.query)
        resume = query.get("return", [""])[0]
        parsed = urlsplit(resume)
        if parsed.netloc or parsed.scheme or parsed.path != "/shop/identity":
            self.send_error(400)
            return
        if target.path == "/identity/login":
            roles = (("A", "operator"), ("B", "customer"), ("C", "another customer"))
            links = ['<a href="/identity/fixture?' + escape(urlencode({"return": resume, "account": account}), quote=True)
                     + '">Continue as ' + role + '</a>' for account, role in roles]
            body = ("<h1>Temple sign-in fixture</h1>" + " ".join(links)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        account = query.get("account", [""])[0]
        if target.path != "/identity/fixture" or account not in ("A", "B", "C"):
            self.send_error(400)
            return
        self.send_response(303)
        self.send_header("Location", resume)
        self.send_header("Set-Cookie", "__Host-sourcery_session=src_session_" + account * 43 +
                         "; Path=/; Secure; HttpOnly; SameSite=Lax")
        self.end_headers()

    def log_message(self, *_):
        pass


def private_facts(path, rows):
    path.write_text("".join("(" + ", ".join(map(json.dumps, row)) + ")\n" for row in rows))
    path.chmod(0o600)


def stage_form_image(stage, name, source, declaration, shared_algebra=None):
    directory = stage / name
    root = directory / "source"
    stage_program(root, declaration, source, shared_algebra)
    image = directory / "board.rel"
    subprocess.run([BINARY, "build", root, declaration, image], check=True, stdout=subprocess.DEVNULL)
    state = directory / "state"
    state.mkdir()
    port = free_port()
    launch = directory / "launch.rel"
    private_facts(launch, [("launch", key, str(value)) for key, value in {
        "version": "encounter/launch/1", "mode": "image", "image": image,
        "sha256": hashlib.sha256(image.read_bytes()).hexdigest(), "port": port, "store": state}.items()])
    return port, [BINARY, "--config", launch, "serve"]


def stage_game_journey(stage):
    package = Path("/srv/encounter-apps/20261111T063026Z-game-recent-folio/game-hub")
    state = stage / "game-journey-state"
    state.mkdir()
    port = free_port()
    settings = {}
    for line in (package / "launch.rel").read_text().splitlines():
        if line.startswith("("):
            subject, key, value = json.loads("[" + line[1:-1] + "]")
            assert subject == "launch" and key not in settings
            settings[key] = value
    assert set(settings) == {"version", "mode", "image", "sha256", "store",
                             "attachmentRoot", "gameKernel", "gameKernelSha256", "port"}
    for key in ("image", "attachmentRoot", "gameKernel"):
        settings[key] = str((package / settings[key]).resolve(strict=True))
    settings.update(store=str(state), port=str(port))
    launch = stage / "game-journey.rel"
    private_facts(launch, [("launch", key, value) for key, value in settings.items()])
    return port, [package / "encounter", "--config", launch, "serve"]


def stage_north_journey(stage, name="north-journey"):
    package = PROJECTS / "release-rollouts/pilot-review-trips.v95v7AoI/pilot"
    runtime = WORKSPACE / "builds/encounter-releases/pilot-windows-presentation.dhQVpV/encounter"
    state = stage / (name + "-state")
    state.mkdir()
    port = free_port()
    token = base64.b64encode(secrets.token_bytes(48)).decode()
    operators = stage / (name + "-operators.rel")
    private_facts(operators, [("operators", "version", "encounter/operators/1"),
        ("formation", "role", "author"),
        ("formation", "basicSha256", hashlib.sha256(token.encode()).hexdigest())])
    settings = {}
    for line in (package / "live.rel").read_text().splitlines():
        if line.startswith("("):
            subject, key, value = json.loads("[" + line[1:-1] + "]")
            assert subject == "launch" and key not in settings
            settings[key] = value
    launch = stage / (name + ".rel")
    fields = {key: settings[key] for key in ("version", "mode", "sha256")}
    image = package / "live.image.rel"
    assert Path(settings["image"]).name == image.name
    fields.update(image=str(image.resolve(strict=True)),
                  operators=str(operators), store=str(state), port=str(port))
    private_facts(launch, [("launch", key, value) for key, value in fields.items()])
    return port, [runtime, "--config", launch, "serve"], "Basic " + token


def stage_aster_conversation(stage, release, origin, identity_config):
    bundle = release / "aster"
    runtime = release / "encounter"
    native = stage / "aster-native"
    native.mkdir(mode=0o700)
    seed = stage / "aster-seed.rel"
    seed.touch(mode=0o600)
    config = {"origin": origin, "steward": STEWARD, "adapter": "fixture",
              "streamKey": secrets.token_hex(32), "threads": [], "support": []}
    with seed.open("wb") as output:
        subprocess.run([runtime, "run", "--declaration", bundle / "seed", "seed-encoder.rel", json.dumps(config)],
                       stdout=output, check=True)
    source = stage / "aster-native-source"
    subprocess.run([runtime, "appdev-stage-aster", bundle / "source", seed, source],
                   stdout=subprocess.DEVNULL, check=True)
    image = native / "image.rel"
    pin = subprocess.check_output([runtime, "build", source, "application.rel", image], text=True).strip()
    port = free_port()
    token = base64.b64encode(secrets.token_bytes(48)).decode()
    operators = stage / "aster-native-operators.rel"
    private_facts(operators, [("operators", "version", "encounter/operators/1"),
        ("identity-gateway", "role", "steward"),
        ("identity-gateway", "basicSha256", hashlib.sha256(token.encode()).hexdigest())])
    launch = native / "launch.rel"
    store = stage / "aster-native-store"
    store.mkdir(mode=0o700)
    private_facts(launch, [("launch", key, str(value)) for key, value in {
        "version": "encounter/launch/1", "mode": "image", "image": image, "sha256": pin,
        "operators": operators, "store": store, "port": port, "gatewayIdentity": "temple",
    }.items()])
    with identity_config.open("a") as config_file:
        rows = [("gateway", "mount", "aster"), ("aster", "target", "run"),
                ("aster", "returnPath", "/workspace/home?view=aster"), ("aster", "label", "Ask Aster"),
                ("aster", "port", str(port)), ("aster", "authorization", "Basic " + token)]
        for row in rows:
            config_file.write("(" + ", ".join(map(json.dumps, row)) + ")\n")
    return port, [runtime, "--config", launch, "serve"]


def stage_paired_temples(stage, release):
    package = release / "temple"
    declaration = "applications/life-board-prototype/pilot/temple.rel"
    runtime = release / "encounter"
    subprocess.run([runtime, "check", "--browser-temple", package / "programme", declaration],
                   check=True, stdout=subprocess.DEVNULL)
    roles = {"coordinator": ("field-coordinator", "coordination-temple"),
             "recipient": ("site-contact", "field-temple")}
    fixtures, commands, public_keys = {}, {}, {}
    for role, (actor, temple) in roles.items():
        password = secrets.token_hex(32)
        token = base64.b64encode(f"{actor}:{password}".encode())
        operators = stage / (role + "-temple-operators.rel")
        private_facts(operators, [("operators", "version", "encounter/operators/1"),
            (actor, "role", role), (actor, "basicSha256", hashlib.sha256(token).hexdigest())])
        key = subprocess.check_output(["openssl", "genpkey", "-algorithm", "ED25519", "-outform", "DER"])
        public = subprocess.check_output(["openssl", "pkey", "-inform", "DER", "-pubout", "-outform", "DER"], input=key)
        seed = stage / (role + "-temple.seed")
        seed.touch(mode=0o600)
        seed.write_text(key[-32:].hex() + "\n")
        public_keys[role] = public[-32:].hex()
        port = free_port()
        store = stage / (role + "-temple-store")
        store.mkdir(mode=0o700)
        peers = stage / (role + "-temple-peers.rel")
        commands[role] = [runtime, "browser-host", "--temple-window", package / "programme", declaration,
                          package / "assets", store, operators, peers, str(port)]
        fixtures[role] = {"actor": actor, "password": password, "origin": f"http://127.0.0.1:{port}"}
    for role, remote in (("coordinator", "recipient"), ("recipient", "coordinator")):
        actor, temple = roles[role]
        remote_actor, remote_temple = roles[remote]
        private_facts(stage / (role + "-temple-peers.rel"), [
            ("peer", "version", "encounter/temple-peer/1"), ("local", "actor", actor),
            ("local", "templeId", temple), ("local", "seedFile", role + "-temple.seed"),
            ("remote", "actor", remote_actor), ("remote", "templeId", remote_temple),
            ("remote", "publicKey", public_keys[remote]), ("remote", "port", commands[remote][-1])])
    return fixtures, commands


def stage_encounter_authoring(stage):
    package = WORKSPACE / "builds/encounter-releases/20261109T105407709095Z-authoring-two-blocker-cutover-c7a03e25"
    image = package / "images/encounter.rel"
    pin = "3268febda953c3b2de8e97cf142e01a8c77978ddb8cfff0d2a1413365dca42bd"
    assert hashlib.sha256(image.read_bytes()).hexdigest() == pin
    store = stage / "encounter-authoring-store"
    store.mkdir()
    port = free_port()
    return port, [package / "bin/encounter", "serve", "--image", image, pin, store, str(port)]


def stage_claimipedia_editorial(stage):
    package = WORKSPACE / "state/encounter-claimipedia-deployment/corpus-aster.l63wcN"
    image = package / "application.rel"
    pin = "adb35e5d6a20085c808d1f2e011e92d1d46db3a1f7fac3c260917d04c0382c07"
    assert hashlib.sha256(image.read_bytes()).hexdigest() == pin
    store = stage / "claimipedia-editorial-store"
    store.mkdir()
    port = free_port()
    operators = stage / "claimipedia-editorial-operators.rel"
    rows = [("operators", "version", "encounter/operators/1")]
    passwords = {role: secrets.token_hex(32) for role in ("reviewer", "curator")}
    for role, password in passwords.items():
        token = base64.b64encode(f"{role}:{password}".encode())
        rows.extend([(role, "role", role), (role, "basicSha256", hashlib.sha256(token).hexdigest())])
    private_facts(operators, rows)
    launch = stage / "claimipedia-editorial.rel"
    fields = {"version": "encounter/launch/1", "mode": "image", "sha256": pin, "image": image,
              "operators": operators, "store": store, "port": port}
    private_facts(launch, [("launch", key, str(value)) for key, value in fields.items()])
    fixture = {"origin": f"http://127.0.0.1:{port}", "passwords": passwords}
    return port, [package / "encounter", "--config", launch, "serve"], fixture


def verify_portfolio(stage):
    platform = PROJECTS / "encounter-platform"
    project = platform / "applications/encounter-portfolio"
    release = stage / "portfolio-release"
    images = release / "images"
    images.mkdir(parents=True)
    runtime = release / "bin/encounter"
    runtime.parent.mkdir()
    shutil.copy2(RELEASE_RUNTIME, runtime)
    catalogue = platform / "applications/encounter-runtime/release-applications.rel"
    rows = []
    for line in catalogue.read_text().splitlines():
        app, package, declaration = json.loads("[" + line[1:-1] + "]")
        if package != project.name:
            continue
        source = stage / ("portfolio-" + app)
        stage_program(source, declaration, project, platform / "shared/rendering")
        image = "images/" + app + ".rel"
        pin = subprocess.check_output([runtime, "build", source, declaration, release / image], text=True).strip()
        assert re.fullmatch(r"[0-9a-f]{64}", pin)
        rows.extend([(app, "image", image), (app, "sha256", pin)])
    private_facts(release / "release.rel", rows)
    env = {**os.environ, "ENCOUNTER_RUST_RELEASE": str(release), "ENCOUNTER_RUST_HOST": str(runtime)}
    subprocess.run(["node", "test/run.cjs"], cwd=project, env=env, check=True)
    previews = {"foundry": "Foundry Mine to Port", "industrial-optimizer": "Industrial Systems Optimizer",
                "super-crm": "Super CRM", "timesheet": "Timesheet", "tradie": "Tradie",
                "outcome-value": "Outcome Value Navigator", "relationship": "Relationship Navigator",
                "world": "World", "sourcery-desktop": "Sourcery Desktop"}
    for app, title in previews.items():
        status, _, document = http(24220, "/", host=f"{app}.localhost:24220")
        assert status == 200 and f"<title>{title}</title>" in document, (app, status)
    print(f"PASS: Front Gate serves all {len(previews)} portfolio app previews", flush=True)
    return list(previews)


def stage_shop(stage, cleanup, authority, provider_port, start, package=None, active_release=None):
    stage = stage / "shop"
    stage.mkdir()
    (stage / "empty.css").touch()
    applications = PROJECTS / "applications"
    shop = package or applications / "sourcery-shop"
    state = stage / "shop-state"
    state.mkdir()
    upstream, gateway, broker = (free_port() for _ in range(3))
    login_ui = cleanup.enter_context(ThreadingHTTPServer(("127.0.0.1", 0), ShopLogin))
    threading.Thread(target=login_ui.serve_forever, daemon=True).start()
    cleanup.callback(login_ui.shutdown)
    token = base64.b64encode(("shop-fixture:" + secrets.token_hex(32)).encode()).decode()
    operators = stage / "shop-operators.rel"
    private_facts(operators, [("operators", "version", "encounter/operators/1"),
                              ("shop-fixture", "role", "customer"),
                              ("shop-fixture", "basicSha256", hashlib.sha256(token.encode()).hexdigest())])
    declaration = "sourcery-shop/application.rel"
    policy = "sourcery-shop/gateway.rel"

    if active_release:
        host_config = stage / "host.rel"
        private_facts(host_config, [("shop", key, str(value)) for key, value in {
            "contract": "encounter/appdev-shop/1", "store": state, "port": upstream,
            "operators": operators, "operatorPrincipal": "A"}.items()])
        gateway_host_config = gateway_config(stage, "gateway", gateway, "/shop", authority,
            upstream, provider_port, stage / "unused-policy", policy,
            ("identityAdmission", "appdev-shop"),
            broker_origin=f"http://127.0.0.1:{broker}", authorization="Basic " + token)

    def start_release(name, release, runtime):
        if active_release:
            app = start(name, upstream, [RELEASE_RUNTIME, "appdev-shop-host", active_release, host_config],
                        expected_runtime=runtime.resolve(strict=True))
            proxy = start(name + "-gateway", gateway, [RELEASE_RUNTIME, "appdev-shop-gateway",
                          active_release, gateway_host_config])
            return [proxy, app]
        source = release / "source" if release else applications
        root = stage / (name + "-source")
        stage_program(root, declaration, source)
        stage_program(root, policy, source)
        (root / "sourcery-shop/access.rel").write_text(
            '("rel.document", "kind", "ApplicationData")\n("v0", "type", "Sequence")\n("rel.document", "root", "v0")\n'
            '("v1", "type", "String")\n("v1", "scalar", "A")\n("v0", "item", "v1")\n')
        image = stage / (name + ".rel")
        subprocess.run([runtime, "build", root, declaration, image], check=True, stdout=subprocess.DEVNULL)
        launch = stage / (name + "-launch.rel")
        private_facts(launch, [("launch", key, str(value)) for key, value in {
            "version": "encounter/launch/1", "mode": "image", "image": image,
            "sha256": hashlib.sha256(image.read_bytes()).hexdigest(), "port": upstream,
            "store": state, "operators": operators, "gatewayIdentity": "temple"}.items()])
        config = gateway_config(stage, name + "-gateway", gateway, "/shop", authority, upstream, provider_port,
                                root, policy, ("identityAdmission", "appdev-shop"),
                                broker_origin=f"http://127.0.0.1:{broker}", authorization="Basic " + token)
        app = start(name, upstream, [runtime, "--config", launch, "serve"])
        proxy = start(name + "-gateway", gateway, [runtime, "gateway", config])
        return [proxy, app]

    processes = start_release("shop", package, BINARY)

    def switch(name, release, runtime):
        for process in processes:
            process.terminate()
            process.wait(timeout=8)
        processes[:] = start_release(name, release, runtime) if runtime else []

    if active_release:
        appdev_ingress = f"include {active_release}/shop/appdev.nginx.con[f];"
        broker_ingress = f"include {active_release}/shop/broker.nginx.con[f];"
    else:
        appdev_ingress = (shop / "appdev.nginx.conf").read_text()
        broker_ingress = (shop / "broker.nginx.conf").read_text()
    broker_server = f"""
    upstream sourcery_appdev_shop {{ server 127.0.0.1:{gateway}; }}
    limit_req_zone $binary_remote_addr zone=sourcery_identity_login:1m rate=30r/s;
    server {{
        listen 127.0.0.1:{broker};
        {broker_ingress}
        location ^~ /identity/ {{ proxy_pass http://127.0.0.1:{login_ui.server_port}; }}
    }}
    """
    return appdev_ingress, broker_server, gateway, broker, switch


def gateway_config(stage, name, port, prefix, authority, upstream, provider, root, declaration, admission,
                   broker_origin="https://" + BROKER, authorization=AUTH, target_origin=None,
                   mode="run", extra=()):
    path = stage / (name + ".rel")
    rows = [
        ("gateway", "version", "encounter/gateway/1"), ("gateway", "port", str(port)),
        ("gateway", "prefix", prefix), ("gateway", "broker", broker_origin),
        ("gateway", "identityPort", str(provider)), ("gateway", "identityPath", "/v1/me"),
        ("gateway", "root", str(root)), ("gateway", "declaration", declaration),
        ("gateway", "stylesheet", str(stage / "empty.css")), ("gateway", "target", mode),
        ("gateway", *admission), (mode, "port", str(upstream)),
        (mode, "origin", target_origin or "http://" + authority), (mode, "authorization", authorization),
        *extra,
    ]
    path.write_text("".join("(" + ", ".join(map(json.dumps, row)) + ")\n" for row in rows))
    path.chmod(0o600)
    return path


def login(gateway, prefix, authority, user):
    status, headers, _ = http(gateway, prefix + "/", host=authority)
    assert status in (302, 303), status
    state = headers["Set-Cookie"].split(";", 1)[0]
    start = urlsplit(headers["Location"])
    status, headers, _ = http(gateway, start.path + "?" + start.query, host=start.netloc,
                              cookie="__Host-sourcery_session=src_session_" + user * 43)
    assert status in (302, 303), status
    finish = urlsplit(headers["Location"])
    status, headers, _ = http(gateway, finish.path + "?" + finish.query, host=authority, cookie=state)
    assert status in (302, 303), status
    return headers["Set-Cookie"].split(";", 1)[0]


def check_registry_steward(get, gateway, authority, origin, steward, member, stage):
    destination = "/workspace/vm-manager?vm=sourcery-registry-demo&view=display"
    start = "/identity-management/?" + urlencode({"workspace-return": destination})
    status, _, body = get(destination)
    assert status == 401 and "Sign in to Workspace" in body
    assert get(destination, member)[0] == 403
    outsider = "/identity-management/?" + urlencode({"workspace-return": "//outside.test/"})
    assert http(gateway, outsider, host=authority)[0] == 403
    status, headers, _ = http(gateway, start, host=authority)
    assert status == 303
    state = headers["Set-Cookie"].split(";", 1)[0]
    broker = urlsplit(headers["Location"])
    status, headers, _ = http(gateway, broker.path + "?" + broker.query, host=broker.netloc,
                              cookie="__Host-sourcery_session=src_session_" + "A" * 43)
    assert status == 303
    callback = urlsplit(headers["Location"])
    status, headers, body = http(gateway, callback.path + "?" + callback.query, host=authority, cookie=state)
    assert status == 200 and "Signed in to Workspace" in body and escape(destination) in body
    assert 'class="vm-access-page"' in body
    assert 'href="/workspace/vm-manager/style.css"' in body
    assert f'content="2;url={escape(destination)}"' in body
    assert "style-src 'self'" in headers["Content-Security-Policy"]
    assert "Max-Age=86400" in headers["Set-Cookie"]
    assert http(gateway, callback.path + "?" + callback.query, host=authority, cookie=state)[0] == 400
    status, _, body = get(destination, steward)
    assert status == 200 and "Approve steward access for Registry Demo Display" in body
    approval = re.search(r'<input\b[^>]*\bname="approve"[^>]*>', body)[0]
    ticket = re.search(r'\bvalue="([^"]+)"', approval)[1]
    form = {"Origin": origin, "Content-Type": "application/x-www-form-urlencoded"}
    assert get(destination, steward, method="POST", body=urlencode({"approve": ticket}), headers=form)[0] == 400
    payload = urlencode({"approve": ticket, "acknowledge": "registry-display"})
    assert get(destination, steward, method="POST", body=payload,
               headers={**form, "Origin": "https://outside.test"})[0] == 403
    assert get(destination, member, method="POST", body=payload, headers=form)[0] == 403
    upgrade = {"Origin": origin, "Connection": "Upgrade", "Upgrade": "websocket",
               "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="}
    console = "/workspace/vm-manager/console?vm=sourcery-registry-demo"
    assert get(console, steward, headers=upgrade)[0] == 403
    status, headers, _ = get(destination, steward, method="POST", body=payload, headers=form)
    assert status == 303
    launch_url = headers["Location"]
    launch = parse_qs(urlsplit(launch_url).query)["launch"][0]
    assert get(destination, steward, method="POST", body=payload, headers=form)[0] == 409
    status, _, body = get(launch_url, steward)
    assert status == 200 and "Steward session approved" in body and "End steward session" in body
    assert 'data-mode="serial"' not in body
    assert re.search(r'<time datetime="[^"]+">\d{2}:\d{2} UTC</time>', body)
    selector = "registry-display:" + launch
    assert f'data-guest="{selector}"' in body and 'data-launch=' not in body
    approved_console = "/workspace/vm-manager/console?" + urlencode({"vm": selector})
    second_steward = login(gateway, "/identity-management", authority, "A")
    assert get(launch_url, member)[0] == 403
    assert get(approved_console, second_steward, headers=upgrade)[0] == 403
    assert get(approved_console, steward, headers={**upgrade, "Origin": "https://outside.test"})[0] == 403
    assert get("/workspace/vm-manager?launch=" + launch, steward)[0] == 400
    assert get(destination, steward, method="POST", body=urlencode({"end": launch}), headers=form)[0] == 303
    for attempt in range(5):
        status, _, body = get(approved_console, steward, headers=upgrade)
        if status != 429:
            break
        time.sleep(0.5)
    assert status == 403, (status, body)
    print("PASS: Registry sign-in continuation, 24-hour gateway cookie, single-use approval, scope and revocation", flush=True)
    fixture = stage / "registry-steward-fixture.json"
    fixture.write_text(json.dumps({"origin": origin, "steward": steward, "destination": destination}))
    subprocess.run(["node", Path(__file__).with_name("registry-steward.mjs"), fixture], check=True)


def stage_file_index(stage, cleanup, scheduled_receipts, home_release=None):
    release = stage / "index-kernel"
    (release / "bin").mkdir(parents=True)
    content = b"fixture runtime"
    (release / "bin" / "encounter").write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    def facts(path, rows):
        path.write_text("".join("(" + ", ".join(map(json.dumps, row)) + ")\n" for row in rows))
    def typed(kind, values):
        rows = [("rel.document", "kind", kind), ("v0", "type", "Record")]
        for index, (key, value) in enumerate(sorted(values.items()), 1):
            entry, scalar = f"v{index * 2 - 1}", f"v{index * 2}"
            rows.extend([("v0", "entry", entry), (entry, "type", "Entry"), (entry, "key", key),
                         (scalar, "type", "String"), (scalar, "scalar", value), (entry, "value", scalar)])
        rows.append(("rel.document", "root", "v0"))
        return "".join("(" + ", ".join(map(json.dumps, row)) + ")\n" for row in rows)
    def app(name, profile, programme, documents, assets=None):
        app_dir = stage / name
        app_dir.mkdir()
        (app_dir / "catalog.encounter").write_text('process-module "temple/surface-process-module/1"\n\n'
                                                  + programme)
        declaration = f"{name}/application.rel"
        entry = "hub.catalog" if name == "game-hub" else "fixture.source"
        facts(stage / declaration, [("application", "stateProfile", profile),
            ("application", "module", f"{name}/catalog.encounter"), ("application", "entry", entry)])
        image = app_dir / "image.rel"
        pin = subprocess.check_output([BINARY, "build", stage, declaration, image], text=True).strip()
        store = app_dir / "store"
        store.mkdir()
        with contextlib.closing(sqlite3.connect(store / "workspace.sqlite")) as db, db:
            db.executescript("CREATE TABLE metadata(key, value); CREATE TABLE revisions(id);"
                             "CREATE TABLE documents(revision, path, text); INSERT INTO revisions VALUES (1);")
            db.execute("INSERT INTO metadata VALUES ('profile', ?)", (profile,))
            db.executemany("INSERT INTO documents VALUES (1, ?, ?)", documents)
        launch = app_dir / "launch.rel"
        rows = [("version", "encounter/launch/1"), ("mode", "image"), ("image", str(image)),
                ("sha256", pin), ("store", str(store))]
        if assets:
            rows.append(("attachmentRoot", str(assets)))
        facts(launch, [("launch", key, value) for key, value in rows])
        return launch, store / "workspace.sqlite"
    archive = "bin/kernel-release-verification-artifact-with-a-very-long-file-name-for-the-narrow-window.tar"
    payload = bytes(12_345_678)
    (release / archive).write_bytes(payload)
    size_pins = []
    for name, size in [("bin/below-megabyte.tar", 999_949), ("bin/rounded-megabyte.tar", 999_950)]:
        content = bytes(size)
        (release / name).write_bytes(content)
        size_pins.append((name, "sha256", hashlib.sha256(content).hexdigest()))
    (release / "spec").mkdir()
    spec = b'("fixture", "protocol", "encounter/example/1")\n'
    (release / "spec/example.rel").write_bytes(spec)
    movie = (PROJECTS / "media/claimipedia-debates/applications/claimipedia-debates/assets/claimipedia-debates-ident.webm").read_bytes()
    (release / "fixture.webm").write_bytes(movie)
    facts(release / "release.rel", [("release", "format", "encounter/release/1"),
        ("release", "runtime", "bin/encounter"), ("bin/encounter", "sha256", digest),
        (archive, "sha256", hashlib.sha256(payload).hexdigest()), *size_pins,
        ("spec/example.rel", "sha256", hashlib.sha256(spec).hexdigest()),
        ("fixture.webm", "sha256", hashlib.sha256(movie).hexdigest())])
    sources = stage / "index-sources.rel"
    assets = stage / "index-assets"
    assets.mkdir()
    asset = GAME_IMAGE_BYTES
    (assets / GAME_IMAGE).write_bytes(asset)
    game, _ = app("game-hub", "encounter/game-hub/1",
        f'process hub.catalog:\n  let result = list({{ id = "fixture"; images = list({{ file = "{GAME_IMAGE}";'
        f' bytes = {len(asset)}; sha256 = "{hashlib.sha256(asset).hexdigest()}"; title = "Fixture" }}) }})\n',
        [], assets)
    # One committed task makes the project owner rule active in the file index.
    north, north_db = app("north-river", "encounter/north-river-plan/1",
        'process fixture.source:\n  let result = "North River fixture"\n', [
            ("project.rel", typed("NorthRiverProject", {"owner": "fixture-owner"})),
            ("task.rel", typed("NorthRiverTask", {"owner": "fixture-owner", "phase": "approved"})),
        ])
    configured_sources = [("index", "format", "encounter/file-index/1"), ("index", "source", "kernel"),
        ("kernel", "provider", "kernel-release"), ("kernel", "location", str(release)),
        ("kernel", "steward", "role:platform-steward"), ("index", "source", "game"),
        ("game", "provider", "game-hub"), ("game", "location", str(game)), ("index", "source", "north"),
        ("north", "provider", "north-river"), ("north", "location", str(north))]
    if scheduled_receipts:
        publication = stage / "scheduled-receipts"
        shutil.copytree(APP / "scheduled-run-receipts", publication)
        invocation = "b7" * 16
        name = invocation + ".rel"
        facts(publication / name, [("execution", "invocation-id", invocation), ("execution", "scope", "system"),
            ("execution", "service", "scheduled-receipt-fixture.service"),
            ("execution", "timer", "scheduled-receipt-fixture.timer"),
            ("execution", "last-trigger", "2026-11-11 09:20:10"),
            ("execution", "started", "2026-11-11 09:20:10"), ("execution", "result", "exit-code"),
            ("execution", "duration-seconds", "3")])
        pin = hashlib.sha256((publication / name).read_bytes()).hexdigest()
        with (publication / "publication.rel").open("a") as manifest:
            manifest.write(f'("publication", "receipt", "{name}")\n("{name}", "sha256", "{pin}")\n')
        configured_sources.extend([("index", "source", "scheduled-receipts"),
            ("scheduled-receipts", "provider", "scheduled-receipts"),
            ("scheduled-receipts", "location", str(publication))])
    if home_release:
        configured_sources.extend([
            ("index", "source", "home-release"), ("home-release", "provider", "home-release"),
            ("home-release", "location", str(home_release)),
            ("home-release", "steward", "role:platform-steward"),
        ])
    facts(sources, configured_sources)
    cache = stage / "index-cache"
    path = stage / "index.sock"
    subprocess.run([BINARY, "file-index", "--refresh", sources, cache], check=True)
    reader = subprocess.Popen([BINARY, "file-index", "--serve", sources, cache, path])
    def stop():
        if reader.poll() is None:
            reader.terminate()
            reader.wait(timeout=8)
    cleanup.callback(stop)
    for _ in range(100):
        if path.is_socket():
            return path, north_db
        if reader.poll() is not None:
            break
        time.sleep(.02)
    raise RuntimeError("file index bridge did not start")


def timed_browser(command, metric=None):
    if metric is None:
        subprocess.run(command, check=True)
        return None
    result = subprocess.run(command, stdout=subprocess.PIPE, text=True)
    print(result.stdout, end="", flush=True)
    result.check_returncode()
    reports = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
    if metric in ("home", "work"):
        scope = "fixture" if metric == "home" else "encounter-work-startup"
        assert len(reports) == 1 and reports[0]["passed"] is True and reports[0]["scope"] == scope
    else:
        reports = [report for report in reports if report.get("check") == metric]
        assert len(reports) == 1
    return reports[0]


def stage_catalogue_version(release, stage):
    variant = stage / "catalogue-variant"
    shutil.copytree(release, variant)
    descriptor = variant / "browser-programme/applications/appdev-projects/assurance-catalogue-version.rel"
    version = re.search(r'\("v0", "scalar", "([a-f0-9]{64})"\)', descriptor.read_text())[1]
    assets = variant / "browser-assets/assurance-catalogue"
    revised = (assets / (version + ".html")).read_bytes() + b"<!-- Encounter catalogue transition fixture -->"
    digest = hashlib.sha256(revised).hexdigest()
    (assets / (digest + ".html")).write_bytes(revised)
    descriptor_bytes = descriptor.read_bytes()
    revised_descriptor = descriptor_bytes.replace(version.encode(), digest.encode())
    descriptor.write_bytes(revised_descriptor)

    declaration = descriptor.with_name("browser.rel")
    old_pin = hashlib.sha256(descriptor_bytes).hexdigest()
    new_pin = hashlib.sha256(revised_descriptor).hexdigest()
    expected = f'("data.assurance-catalogue", "sha256", "{old_pin}")'
    revised_pin = f'("data.assurance-catalogue", "sha256", "{new_pin}")'
    programme = declaration.read_text()
    if '("data.assurance-catalogue", "sha256",' in programme:
        assert programme.count(expected) == 1, "Catalogue descriptor pin differs from its bytes"
        declaration.write_text(programme.replace(expected, revised_pin))
    return variant, digest


def stage_assurance_sweep(stage, cleanup, badge_bytes=False):
    jobs = APP / "dev-jobs"
    phase = stage / "assurance-phase"
    phase.write_text("initial")
    socket_path = stage / "performance.sock"
    scenario = "badge" if badge_bytes else "startup"
    process = subprocess.Popen([RELEASE_RUNTIME, "appdev-performance-mailbox-fixture", APP, socket_path, scenario])

    def stop():
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    cleanup.callback(stop)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Performance mailbox fixture exited with status {process.returncode}")
        if socket_path.is_socket():
            break
        time.sleep(0.025)
    else:
        raise RuntimeError("Performance mailbox fixture did not create its socket")
    snippet = (jobs / "performance-mailbox.nginx.conf").read_text().replace(
        "/run/sourcery-encounter-sweep-status/mailbox.sock", str(socket_path))
    return phase, snippet


def stage_browser_wasm(release, declaration="appdev.rel"):
    sources = PROJECTS / "encounter-core/browser"
    output = release.with_name(release.name + "-wasm-build")
    pin = subprocess.check_output(
        [BINARY, "build", "--browser", sources, declaration, sources, output], text=True
    ).strip()
    catalog = output / "browser-wasm.rel"
    assert pin == hashlib.sha256(catalog.read_bytes()).hexdigest()
    shutil.copy2(BINARY, release / "encounter")
    catalog.rename(release / catalog.name)
    (output / "browser-wasm").rename(release / "browser-wasm")
    runtime_pin = hashlib.sha256((release / "encounter").read_bytes()).hexdigest()
    receipt = release / "package-receipt.rel"
    if receipt.is_file():
        contents = receipt.read_text()
        for subject, field in (("package", "runtimeSha256"), ("artifact", "encounter")):
            prefix = f'("{subject}", "{field}", "'
            contents, count = re.subn(re.escape(prefix) + r"[a-f0-9]{64}", prefix + runtime_pin, contents)
            assert count == 1
    else:
        contents = ('("package", "contract", "encounter/gated-release/1")\n'
                    f'("package", "name", "{release.name}")\n'
                    f'("package", "runtimeSha256", "{runtime_pin}")\n'
                    f'("artifact", "encounter", "{runtime_pin}")\n')
    receipt.write_text(contents.rstrip() + f'\n("artifact", "browser-wasm.rel", "{pin}")\n')


def check_browser_wasm_delivery(port, release, *, work=False, retained=False):
    catalog = hashlib.sha256((release / "browser-wasm.rel").read_bytes()).hexdigest()
    paths = ("/_encounter/browser.mjs",) if work else ("/_encounter/browser.mjs", "/_encounter/browser.mjs?wasm=1")
    scripts = {}
    for path in paths:
        status, headers, script = http(port, path)
        assert status == 200 and headers["X-Encounter-Browser-Wasm"] == catalog
        assert headers["Cache-Control"] == "no-store"
        # Older Home catalogs allow compatibility on the canonical URL.
        # The retained document must use the explicit pinned URL.
        if not (retained and not work and path == paths[0]):
            fallback = "const encounterLegacy" if retained else "encounterLegacy"
            assert fallback not in script, path
        for name in (("interaction",) if work else ("interaction", "countdown", "assurance")):
            module = (release / "browser-wasm" / name / "browser.wasm").read_bytes()
            binding = "encounter" + name.capitalize() + "Wasm"
            assert f"const {binding} = '{base64.b64encode(module).decode()}';" in script
        scripts[path] = script
    if not work and not retained:
        assert scripts[paths[0]] == scripts[paths[1]]
    return catalog, scripts


def browser_bridge_evidence(catalog, scripts):
    return json.dumps({
        "catalog": catalog,
        "scripts": {path: hashlib.sha256(script.encode()).hexdigest() for path, script in scripts.items()},
    })


def check_work_wasm_ingress(port, release, front, session, *, retained=False):
    catalog, scripts = check_browser_wasm_delivery(port, release, work=True, retained=retained)
    status, headers, script = http(front, "/life-board/_encounter/browser.mjs", cookie=session)
    assert status == 200 and headers.get("X-Encounter-Browser-Wasm") == catalog
    assert headers["Cache-Control"] == "no-store"
    assert script == scripts["/_encounter/browser.mjs"], "Work gateway changed the pinned bridge"
    return browser_bridge_evidence(catalog, {"/life-board/_encounter/browser.mjs": script})


def check_aster_wasm_ingress(front, release, *, retained=False):
    catalog = hashlib.sha256((release / "browser-wasm.rel").read_bytes()).hexdigest()
    module = (release / "browser-wasm/interaction/browser.wasm").read_bytes()
    expected = base64.b64encode(module).decode()
    pinned_path = "/_aster/browser.mjs?wasm=1"
    canonical_path = "/_aster/browser.mjs"
    status, headers, pinned = http(front, pinned_path)
    assert status == 200 and headers.get("X-Encounter-Browser-Wasm") == catalog
    assert headers["Cache-Control"] == "no-store"
    assert f"const encounterInteractionWasm = '{expected}';" in pinned
    assert "encounterLegacyInteraction" not in pinned
    assert "const encounterCountdownWasm" not in pinned
    assert "const encounterAssuranceWasm" not in pinned
    status, headers, canonical = http(front, canonical_path)
    assert status == 200
    canonical_pin = headers.get("X-Encounter-Browser-Wasm")
    if canonical_pin is None:
        assert "const encounterLegacyInteraction" in canonical
        if not retained:
            assert f"const encounterInteractionWasm = '{expected}';" in canonical
            assert "const encounterLegacyCountdown" not in canonical
            assert "const encounterLegacyAssurance" not in canonical
    else:
        assert canonical_pin == catalog and headers["Cache-Control"] == "no-store"
        assert canonical == pinned, "The canonical Aster bridge differs from the pinned bridge"
    startup_path = "/workspace/aster/home-startup.mjs"
    status, headers, startup = http(front, startup_path)
    if status == 404 and retained:
        startup = None
    else:
        assert status == 200 and headers["Cache-Control"] == "no-store", (startup_path, status)
        assert "/_encounter/browser.mjs?wasm=1" in startup, startup_path
    scripts = {pinned_path: pinned, canonical_path: canonical}
    if startup is not None:
        scripts[startup_path] = startup
    evidence = {
        "catalog": catalog,
        "canonicalPinned": canonical_pin is not None,
        "scripts": {path: hashlib.sha256(script.encode()).hexdigest() for path, script in scripts.items()},
    }
    return evidence


def standalone_wasm_coordinates(release, name):
    catalog = release / "standalone-browser-wasm.rel"
    if not catalog.is_file():
        return None
    rows = [json.loads("[" + line[1:-1] + "]") for line in catalog.read_text().splitlines()]
    pins = [value for subject, field, value in rows if subject == name and field == "receiptSha256"]
    assert len(pins) == 1 and re.fullmatch(r"[0-9a-f]{64}", pins[0])
    return release / "standalone-browser-wasm" / name, pins[0]


def stage_co_build_wasm(stage, release, clients):
    runtime = release / "encounter"
    declaration = "encounter-co-build/application.rel"
    source = stage / "co-build-source"
    stage_program(source, declaration, base=PROJECTS / "applications")
    native = stage / "co-build-native"
    native.mkdir(mode=0o700)
    image = native / "image.rel"
    pin = subprocess.check_output([runtime, "build", source, declaration, image], text=True).strip()
    store = stage / "co-build-store"
    store.mkdir(mode=0o700)
    port = free_port()
    token = base64.b64encode(secrets.token_bytes(48)).decode()
    operators = stage / "co-build-operators.rel"
    private_facts(operators, [("operators", "version", "encounter/operators/1"),
        ("pilot", "role", "author"),
        ("pilot", "basicSha256", hashlib.sha256(token.encode()).hexdigest())])
    launch = native / "launch.rel"
    attachments = stage / "co-build-attachments"
    attachments.mkdir(mode=0o700)
    rows = [("launch", field, str(value)) for field, value in {
        "version": "encounter/launch/1", "mode": "image", "image": image, "sha256": pin,
        "operators": operators, "store": store, "port": port, "liveModel": "ollama-loopback",
        "attachmentRoot": attachments,
    }.items()]
    for name, (directory, receipt) in clients.items():
        rows.extend([(name, "directory", str(directory)), (name, "receiptSha256", receipt)])
    private_facts(launch, rows)
    mount = (("gateway", "mount", "co-build"), ("co-build", "target", "run"),
             ("co-build", "port", str(port)), ("co-build", "authorization", "Basic " + token),
             ("co-build", "label", "Co-build"), ("co-build", "returnPath", "/encounter-pilot/"))
    return port, [runtime, "--config", launch, "serve"], mount


def check_co_build_wasm_delivery(port, authority, clients):
    prefix = "/encounter-pilot"
    session = login(port, prefix, authority, "A")
    evidence = {}
    for name, filename, binding in (("live-events", "encounter-events.js", "encounterLiveEventsWasm"),
                                    ("canvas", "encounter-canvas.js", "encounterCanvasWasm")):
        directory, pin = clients[name]
        path = f"{prefix}/co-build/{filename}"
        status, headers, script = http(port, path, host=authority, cookie=session)
        assert status == 200 and headers["Content-Type"].startswith("text/javascript"), (path, status)
        assert headers.get("X-Encounter-Browser-Wasm") == pin, path
        module = base64.b64encode((directory / "browser.wasm").read_bytes()).decode()
        assert f"const {binding} = '{module}';" in script, path
        assert "encounterLegacy" not in script, path
        entry = "resumeCursor" if name == "live-events" else "timelineAdmission"
        evidence[path] = {"pin": pin, "sha256": hashlib.sha256(script.encode()).hexdigest(), "entry": entry}
        assert http(port, path, host=authority, cookie=session, method="POST")[0] == 405, path
    print("PASS: Pilot Co-build serves the pinned Live Events and Canvas scripts and refuses script POST", flush=True)
    policies = {}
    for view, filenames in (("workbench", ("encounter-events.js",)),
                          ("canvas", ("encounter-events.js", "encounter-canvas.js"))):
        path = f"{prefix}/co-build/" + ("?view=canvas" if view == "canvas" else "")
        status, headers, document = http(port, path, host=authority, cookie=session, all_csp=True)
        assert status == 200 and headers["Content-Type"].startswith("text/html"), (path, status)
        scripts = {f"{prefix}/co-build/{filename}": evidence[f"{prefix}/co-build/{filename}"] for filename in filenames}
        for script in scripts:
            assert f'src="{script}"' in document, (path, script)
        policies[f"Pilot Co-build {view}"] = {"policy": headers["Content-Security-Policy"], "path": path,
                                               "session": session, "scripts": scripts}
    return policies


def check_pilot_preview_wasm_delivery(port, authority, coordinates):
    directory, pin = coordinates
    prefix = "/encounter-pilot"
    path = prefix + "/preview-context.js"
    session = login(port, prefix, authority, "A")
    module = base64.b64encode((directory / "browser.wasm").read_bytes()).decode()
    scripts = []
    for cookie in ("", session):
        status, headers, script = http(port, path, host=authority, cookie=cookie)
        assert status == 200 and headers.get("X-Encounter-Browser-Wasm") == pin
        assert f"const encounterPreviewWasm = '{module}';" in script
        assert "encounterLegacyPreview" not in script
        scripts.append(script)
    assert scripts[0] == scripts[1], "Pilot changed the static client after sign-in"
    assert http(port, path, host=authority, cookie=session, method="POST")[0] == 405
    print("PASS: Pilot serves the pinned preview client before and after sign-in and refuses script POST", flush=True)
    path = prefix + "/timesheet-preview/timesheet?review-task=primary"
    status, headers, document = http(port, path, host=authority, cookie=session, all_csp=True)
    assert status == 200 and headers["Content-Type"].startswith("text/html"), (path, status)
    assert 'class="pilot-preview-surface"' in document and f'src="{prefix}/preview-context.js"' in document, path
    return {"policy": headers["Content-Security-Policy"], "path": path, "session": session,
            "scripts": {prefix + "/preview-context.js": {
                "pin": pin, "sha256": hashlib.sha256(scripts[0].encode()).hexdigest(), "entry": "supportCoordinates"}}}


WORKSPACE_WASM_ASSETS = (
    ("mobile", "Mobile", "/workspace/mobile/runtime.mjs"),
    ("mobile", "MobileWorker", "/workspace/mobile/worker.mjs"),
    ("temple", "Temple", "/workspace/temple/startup.mjs"),
    ("assurance", "Assurance", "/workspace/temple/assurance-updates.mjs"),
)


def check_workspace_wasm_delivery(port, release, *, retained=False, front=None):
    catalog = hashlib.sha256((release / "browser-wasm.rel").read_bytes()).hexdigest()
    scripts = {}
    for module_name, binding, path in WORKSPACE_WASM_ASSETS:
        status, headers, script = http(port, path)
        assert status == 200 and headers["X-Encounter-Browser-Wasm"] == catalog
        fallback = "const encounterLegacy" if retained else "encounterLegacy"
        assert fallback not in script, path
        assert headers["Cache-Control"] == "no-store"
        module = (release / "browser-wasm" / module_name / "browser.wasm").read_bytes()
        assert f"const encounter{binding}Wasm = '{base64.b64encode(module).decode()}';" in script
        scripts[path] = script
    aster_frame = release / "browser-wasm/aster-frame/browser.wasm"
    if aster_frame.is_file() or not retained:
        path = "/workspace/aster/frame-bridge.js"
        assert aster_frame.is_file(), "The candidate must package the Aster frame Wasm module"
        status, headers, script = http(port, path)
        assert status == 200 and headers["X-Encounter-Browser-Wasm"] == catalog
        assert headers["Cache-Control"] == "no-store"
        assert "encounterLegacy" not in script
        encoded = base64.b64encode(aster_frame.read_bytes()).decode()
        assert f"const encounterAsterFrameWasm = '{encoded}';" in script
        scripts[path] = script
    if front is not None:
        for path, script in scripts.items():
            status, headers, public_script = http(front, path)
            assert status == 200, (path, status)
            assert headers.get("X-Encounter-Browser-Wasm") == catalog, path
            assert headers.get("Cache-Control") == "no-store", path
            assert public_script == script, f"Ingress served different workspace Wasm script bytes for {path}"
    return browser_bridge_evidence(catalog, scripts)


def main(store_only, performance_only, front_gate_only, managers_only, candidate=None, work_candidate=None, rel_only=False,
         workspace_streams=False, work_performance=False, work_gateway_policy=None, enforce_work_budget=False,
         home_temple_startup=False, formation=False, shop=False, system=False, rollback=None, rollback_work=None, measurements=None, measure_only=False, workgarden=False, formation_tools=False, formation_desktop=False, formation_publications=False, formation_aster=False, assurance_bytes=False, badge_bytes=False, idle_bridge=False, capacity=False, frontend_rollback_work=None, frontend_rollback_package=None, catalogue_source=False, frontend_csp_policy=False, fixture_home_wasm_csp=False, frontend_wasm_journeys=False, frontend_previous_clients=None, app_build=False, fixture_front_gate_csp=False, vm_console=None, vm_display=None, vm_terminal=None, home_tray=False):
    if rollback:
        if not rollback_work:
            for name in ("workspace.nginx.conf", "workspace-temple-startup.nginx.conf",
                         "aster-browser.nginx.conf", "workspace-limits.nginx.conf"):
                ingress = Path("proxy") / name
                assert (candidate / ingress).read_bytes() == (rollback / ingress).read_bytes(), (
                    f"Rollback fixture requires matching ingress for {ingress}")
        assert (candidate / "index.html").read_bytes() != (rollback / "index.html").read_bytes(), (
            "Rollback fixture requires distinct Home documents")
    with tempfile.TemporaryDirectory(prefix="sourcery-routes-") as tmp, contextlib.ExitStack() as cleanup:
        stage = Path(tmp)
        provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        threading.Thread(target=provider.serve_forever, daemon=True).start()
        cleanup.callback(provider.server_close)
        cleanup.callback(provider.shutdown)
        store_fixture = ThreadingHTTPServer(("127.0.0.1", 0), StoreFixture)
        threading.Thread(target=store_fixture.serve_forever, daemon=True).start()
        cleanup.callback(store_fixture.server_close)
        cleanup.callback(store_fixture.shutdown)
        indexed_provider = ThreadingHTTPServer(("127.0.0.1", 0), IndexProviderFixture)
        threading.Thread(target=indexed_provider.serve_forever, daemon=True).start()
        cleanup.callback(indexed_provider.server_close)
        cleanup.callback(indexed_provider.shutdown)
        front, workspace, browser, aster, identity, work_gateway, work_host, store_gateway, game_gateway, north_gateway = (
            free_port() for _ in range(10))
        StoreBroker.gateway = store_gateway
        store_broker = ThreadingHTTPServer(("127.0.0.1", 0), StoreBroker)
        threading.Thread(target=store_broker.serve_forever, daemon=True).start()
        cleanup.callback(store_broker.server_close)
        cleanup.callback(store_broker.shutdown)
        authority = f"127.0.0.1:{front}"
        origin = "https://appdev-assurance.test" if app_build else "http://" + authority
        identity_authority = urlsplit(origin).netloc
        tls = None
        tls_config = ""
        if app_build:
            certificate = stage / "app-build-cert.pem"
            key = stage / "app-build-key.pem"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-subj", "/CN=appdev-assurance.test", "-addext", "subjectAltName=DNS:appdev-assurance.test,IP:127.0.0.1",
                "-keyout", key, "-out", certificate], check=True, capture_output=True)
            tls = ssl.create_default_context(cafile=str(certificate))
            tls_config = f"ssl_certificate {certificate}; ssl_certificate_key {key};"
        release = candidate or stage / "release"
        require_wasm = os.environ.get("ENCOUNTER_VERIFY_BROWSER_WASM") == "1"
        candidate_wasm = candidate is not None and (candidate / "browser-wasm.rel").is_file()
        browser_wasm = front_gate_only and (require_wasm or candidate_wasm)
        package_wasm = browser_wasm or frontend_csp_policy or (require_wasm and (workspace_streams or home_temple_startup))
        previous_browser_release = None
        coordinated_frontend_rollback = frontend_rollback_work is not None or frontend_rollback_package is not None
        primary_system_journey = system and formation and not measure_only
        active_release = stage / "active-release"
        assets = release / "browser-assets"
        if candidate is None:
            release.mkdir()
            stage_program(release / "version-programme", "applications/appdev-projects/versions.rel")
            stage_program(release / "claimipedia-programme", "applications/appdev-projects/claimipedia.rel")
            stage_program(release / "browser-programme", "applications/appdev-projects/browser.rel")
            html = subprocess.check_output(
                [BINARY, "run", "--declaration", PROJECTS, "applications/appdev-projects/application.rel"]
            )
            companion = Path(__file__).with_name("aster-fixture.html").read_bytes()
            html = html.replace(b"</body>", companion + b"</body>", 1)
            (release / "index.html").write_bytes(html)
            assets.mkdir()
            (assets / "index.html").write_bytes(html)
            shutil.copytree(APP / "fonts", assets / "fonts")
            if browser_wasm:
                previous_browser_release = stage / "browser-before-wasm"
                shutil.copytree(release, previous_browser_release)
            if package_wasm:
                stage_browser_wasm(release)
        if package_wasm and not (release / "browser-wasm.rel").is_file():
            raise RuntimeError("The Wasm browser check requires a package with a pinned browser Wasm catalog")

        aster_program = stage / "aster-program"
        aster_browser = "applications/appdev-projects/aster-browser/browser.rel"
        stage_program(aster_program, aster_browser)

        work_browser = "applications/life-board-prototype/hosting/application.rel"
        work_runtime = BINARY
        previous_work_release = None
        if frontend_rollback_work:
            previous_work_release = stage / "work-before-wasm"
            work_candidate = stage / "work-candidate"
            shutil.copytree(frontend_rollback_work, previous_work_release)
            shutil.copytree(previous_work_release, work_candidate)
            stage_browser_wasm(work_candidate, "work.rel")
        if frontend_rollback_package:
            previous_browser_release = stage / "system-before-wasm"
            shutil.copytree(frontend_rollback_package, previous_browser_release)
            previous_work_release = previous_browser_release / "work"
        if work_candidate:
            work_runtime = work_candidate / "encounter"
            work_program = work_candidate / "source"
            work_assets = work_candidate / "assets"
            subprocess.run([work_runtime, "check-package", work_candidate], check=True)
        else:
            work_program = stage / "work-program"
            work_assets = stage / "work-assets"
            work_assets.mkdir()
            stage_program(work_program, work_browser)
            work_decl = "life-board-prototype/shell.rel"
            for file, mode in [("index.html", "workspace"), ("life-board.css", "stylesheet")]:
                (work_assets / file).write_bytes(subprocess.check_output(
                    [BINARY, "run", "--declaration", PROJECTS / "applications", work_decl, "appdev", mode]
                ))

        identity_policy = release / "aster/identity-policy" if primary_system_journey else stage / "identity-policy"
        if not primary_system_journey:
            identity_policy.mkdir()
            for filename in ("identity-gateway.rel", "identity-gateway.encounter"):
                shutil.copyfile(APP / filename, identity_policy / filename)
        if system or work_gateway_policy:
            # The managed gateway must ignore policy coordinates in the private file.
            work_policy = stage / "unused-work-policy"
        else:
            work_policy = stage / "work-policy"
            work_policy.mkdir()
            for filename in ("gateway.rel", "gateway.encounter"):
                shutil.copyfile(PROJECTS / "applications/life-board-prototype/hosting" / filename, work_policy / filename)
        identity_config = gateway_config(stage, "identity", identity, "/identity-management", authority,
            workspace, provider.server_port, identity_policy, "identity-gateway.rel",
            ("identityAdmission", "appdev-office"), target_origin=origin)
        if primary_system_journey:
            aster_native_port, aster_native_args = stage_aster_conversation(stage, release, origin, identity_config)
        work_config = gateway_config(stage, "work", work_gateway, "/life-board", authority, work_host,
            provider.server_port, work_policy, "gateway.rel", ("owner", STEWARD))
        board_facts = []
        if system and formation and not measure_only:
            board_port = free_port()
            board_store = stage / "workgarden-state"
            board_store.mkdir()
            board_config = stage / "workgarden-host.rel"
            coordinates = {"contract": "encounter/appdev-workgarden/1", "store": board_store,
                           "port": board_port}
            if rollback_work:
                previous_image = Path(os.environ["APPDEV_LEGACY_WORKGARDEN_IMAGE"]).resolve(strict=True)
                previous_runtime = Path(os.environ["APPDEV_LEGACY_WORKGARDEN_RUNTIME"]).resolve(strict=True)
                coordinates.update(legacyImage=previous_image, legacyRuntime=previous_runtime,
                                   legacySha256=hashlib.sha256(previous_image.read_bytes()).hexdigest())
            private_facts(board_config, [("workgarden", key, str(value)) for key, value in coordinates.items()])
            board_args = [RELEASE_RUNTIME, "appdev-workgarden", active_release, board_config]
        elif workgarden:
            source = (release / "workgarden/source" if candidate else
                      PROJECTS / "encounter-platform/applications/encounter-work-boards")
            shared_algebra = None if candidate else PROJECTS / "encounter-platform/shared/rendering"
            board_port, board_args = stage_form_image(stage, "workgarden", source,
                "products/workgarden/application.rel", shared_algebra)
        else:
            board_args = None
        if board_args:
            board_facts = [
                ("gateway", "mount", "workgarden"), ("workgarden", "target", "run"),
                ("workgarden", "port", str(board_port)), ("workgarden", "authorization", AUTH),
                ("workgarden", "label", "Workgarden"), ("workgarden", "returnPath", "/workspace/work"),
            ]
            with work_config.open("a") as handle:
                for row in board_facts:
                    handle.write("(" + ", ".join(map(json.dumps, row)) + ")\n")
        if system and formation and not measure_only:
            platform = PROJECTS / "encounter-platform"
            crm_port, crm_args = stage_form_image(stage, "super-crm", platform / "applications/encounter-portfolio",
                "products/super-crm/application.rel", platform / "shared/rendering")
            harbor_port, harbor_args = stage_form_image(stage, "harborboard", platform / "applications/encounter-work-boards",
                "products/harborboard/application.rel", platform / "shared/rendering")
            mounts = cleanup.enter_context(ThreadingHTTPServer(("127.0.0.1", 0), WorkMountFixture))
            threading.Thread(target=mounts.serve_forever, daemon=True).start()
            cleanup.callback(mounts.shutdown)
            with work_config.open("a") as handle:
                for name, label, mount_port in [("super-crm", "Super CRM", crm_port),
                                                ("decompiler", "Decompiler", mounts.server_port)]:
                    rows = [("gateway", "mount", name), (name, "target", "run"),
                            (name, "port", str(mount_port)), (name, "authorization", AUTH),
                            (name, "label", label), (name, "returnPath", "/workspace/work")]
                    for row in rows:
                        handle.write("(" + ", ".join(map(json.dumps, row)) + ")\n")
        store_policy = stage / "store-policy"
        (store_policy / "platform-store").mkdir(parents=True)
        for filename in ("https.rel", "https.encounter"):
            shutil.copyfile(PROJECTS / "applications/platform-store" / filename, store_policy / "platform-store" / filename)
        store_config = gateway_config(stage, "store", store_gateway, "/store", authority, store_fixture.server_port,
            provider.server_port, store_policy, "platform-store/https.rel", ("owner", STEWARD),
            broker_origin=f"http://127.0.0.1:{store_broker.server_port}")
        game_policy = stage / "game-policy"
        (game_policy / "game-hub").mkdir(parents=True)
        for filename in ("https.rel", "https.encounter", "catalog.encounter"):
            shutil.copyfile(PROJECTS / "applications/game-hub" / filename, game_policy / "game-hub" / filename)
        game_port, game_args = stage_game_journey(stage) if primary_system_journey else (indexed_provider.server_port, None)
        game_config = gateway_config(stage, "game", game_gateway, "/game", authority, game_port,
            provider.server_port, game_policy, "game-hub/https.rel", ("owner", STEWARD))
        north_policy = stage / "north-policy"
        north_declaration = "encounter-platform/applications/front-gate/pilot.rel"
        stage_program(north_policy, north_declaration)
        north_port, north_args, north_authorization = (stage_north_journey(stage) if primary_system_journey else
            (indexed_provider.server_port, None, AUTH))
        pilot_preview_wasm = standalone_wasm_coordinates(release, "preview") if frontend_csp_policy else None
        co_build_wasm, co_build_mount = {}, ()
        if pilot_preview_wasm:
            co_build_wasm = {name: standalone_wasm_coordinates(release, name) for name in ("live-events", "canvas")}
            co_build_port, co_build_args, co_build_mount = stage_co_build_wasm(stage, release, co_build_wasm)
        north_config = gateway_config(stage, "north", north_gateway, "/encounter-pilot", authority, north_port,
            provider.server_port, north_policy, north_declaration, ("owner", STEWARD),
            authorization=north_authorization, extra=co_build_mount)
        if pilot_preview_wasm:
            pilot_preview_port = free_port()
            timesheet_port, timesheet_args, timesheet_auth = stage_north_journey(stage, "pilot-timesheet")
            timesheet_mount = (("gateway", "mount", "timesheet-preview"), ("timesheet-preview", "target", "preview"),
                               ("timesheet-preview", "port", str(timesheet_port)), ("timesheet-preview", "authorization", timesheet_auth),
                               ("timesheet-preview", "label", "Timesheet preview"), ("timesheet-preview", "returnPath", "/?task=primary"))
            directory, pin = pilot_preview_wasm
            pilot_preview_config = gateway_config(stage, "pilot-preview", pilot_preview_port, "/encounter-pilot",
                authority, north_port, provider.server_port, north_policy, north_declaration, ("owner", STEWARD),
                authorization=north_authorization, mode="preview",
                extra=(("preview-client", "directory", str(directory)), ("preview-client", "receiptSha256", pin),
                       ("gateway", "target", "run"), ("run", "origin", f"http://127.0.0.1:{north_gateway}"),
                       ("run", "port", str(north_port)), ("run", "authorization", north_authorization), *timesheet_mount))
        (stage / "empty.css").touch()
        private = stage / "private"
        private.mkdir()
        credentials = stage / "credentials"
        credentials.mkdir()
        (credentials / "identity-management-auth").write_text(AUTH)
        index_socket, north_db = stage_file_index(stage, cleanup, scheduled_receipts=candidate is None,
                                                home_release=release if catalogue_source else None)
        env = {**os.environ, "APPDEV_FILE_INDEX_SOCKET": str(index_socket), "APPDEV_PORT": str(workspace), "STATE_DIRECTORY": str(private),
               "APPDEV_FILE_INDEX_GAME_GATEWAY": f"http://127.0.0.1:{game_gateway}",
               "APPDEV_FILE_INDEX_STORE_GATEWAY": f"http://127.0.0.1:{store_gateway}",
               "APPDEV_FILE_INDEX_NORTH_GATEWAY": f"http://127.0.0.1:{north_gateway}",
               "CREDENTIALS_DIRECTORY": str(credentials), "APPDEV_ORIGIN": origin,
               "APPDEV_STEWARD_EMAIL": STEWARD, "APPDEV_IDENTITY_GATEWAY": f"http://127.0.0.1:{identity}",
               "APPDEV_NETWORK_STATE": str(private / "no-network-projection")}

        if vm_console:
            socket_path = vm_console.resolve(strict=True)
            assert socket_path.is_socket(), socket_path
            registry = stage / "vm-registry.rel"
            bindings = [
                ("registry", "format", "encounter/vm-manager/1"), ("registry", "guest", "sourcery-dev"),
                ("sourcery-dev", "title", "Sourcery OS Dev"), ("sourcery-dev", "serialSocket", str(socket_path)),
            ]
            if vm_display:
                display_path = vm_display.resolve(strict=True)
                assert display_path.is_socket(), display_path
                bindings.append(("sourcery-dev", "displaySocket", str(display_path)))
            if os.environ.get("APPDEV_REGISTRY_STEWARD_PROOF") == "1":
                assert vm_display and not vm_terminal
                bindings = [(("registry", "guest", "sourcery-registry-demo") if row[0:2] == ("registry", "guest")
                             else ("sourcery-registry-demo", *row[1:]) if row[0] == "sourcery-dev" else row)
                            for row in bindings]
            if vm_terminal:
                terminal_path = vm_terminal.resolve(strict=True)
                assert terminal_path.is_socket(), terminal_path
                bindings.extend([
                    ("registry", "guest", "linux-dev"), ("linux-dev", "title", "Linux Dev"),
                    ("linux-dev", "terminalSocket", str(terminal_path)),
                ])
            private_facts(registry, bindings)
            env["APPDEV_VM_REGISTRY"] = str(registry)

        temple_startup = (app_build or home_temple_startup or workspace_streams or work_performance or assurance_bytes or badge_bytes or idle_bridge or capacity
                          or (work_candidate is not None and not vm_console and not (system and formation)))
        formation_guides = candidate is None or (release / "formation-inventory.rel").is_file()
        desktop_journey = formation_desktop or (front_gate_only and formation_guides)
        if desktop_journey:
            env["APPDEV_CERTIFICATE_INVENTORY"] = "http://127.0.0.1:24376"
        if primary_system_journey:
            webhook_secret = secrets.token_hex(32)
            env.update(APPDEV_X_CLIENT_ID="formation-fixture", APPDEV_X_CLIENT_SECRET=webhook_secret,
                       APPDEV_X_FIXTURE_ORIGIN=origin)
            inbox = private / "x-mentions.json"
            inbox.write_text(json.dumps({"connection": {"userId": "12345", "username": "formation_office",
                "webhookId": "12346", "subscriptionId": "12347"}, "posts": []}))
            inbox.chmod(0o600)
        if temple_startup or fixture_front_gate_csp:
            env["APPDEV_TEMPLE_ID"] = "fixture-temple"

        def start(name, port, args, child_env=None, expected_runtime=None):
            log = cleanup.enter_context((stage / (name + ".log")).open("w+"))
            process = subprocess.Popen(args, env=child_env, stdout=log, stderr=log)
            def stop():
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=8)
            cleanup.callback(stop)
            for _ in range(120):
                if process.poll() is not None:
                    break
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        if expected_runtime is None or Path(f"/proc/{process.pid}/exe").resolve(strict=True) == expected_runtime:
                            return process
                except OSError:
                    pass
                time.sleep(0.025)
            log.seek(0)
            raise RuntimeError(f"{name} failed: {log.read()}")

        def start_home(package, suffix="", runtime=BINARY):
            return (
                start("workspace" + suffix, workspace, [runtime, "workspace-host", package], env),
                start("browser" + suffix, browser, [runtime, "appdev-browser-host", "--allow-aster-stream", package, str(browser)]),
            )

        def stop_together(processes):
            for process in processes:
                process.terminate()
            for process in processes:
                process.wait(timeout=8)

        workspace_process, browser_process = start_home(release)
        vm_manager_port = None
        vm_manager_bin = release / "vm-manager/encounter"
        if vm_manager_bin.is_file():
            vm_manager_port = free_port()
            vm_state = stage / "vm-manager-state"
            vm_state.mkdir()
            start("vm-manager", vm_manager_port, [vm_manager_bin, "appdev-vm-manager", release], {
                **env, "APPDEV_PORT": str(vm_manager_port), "STATE_DIRECTORY": str(vm_state),
            })

        catalogue_proxy = ""
        catalogue_digest = None
        if idle_bridge:
            variant, catalogue_digest = stage_catalogue_version(release, stage)
            variant_port = free_port()
            start("catalogue-variant", variant_port,
                  [BINARY, "appdev-browser-host", "--allow-aster-stream", variant, str(variant_port)])
            catalogue_proxy = (
                'map $cookie_encounter_catalogue_fixture $catalogue_fixture_browser {'
                f' default 127.0.0.1:{browser}; revised 127.0.0.1:{variant_port}; }}')
        def start_aster(package, suffix="", runtime=BINARY):
            return start("aster-browser" + suffix, aster, [runtime, "browser-host", "--allow-aster-stream",
                aster_program, aster_browser, package / "browser-assets", str(aster)],
                expected_runtime=runtime.resolve(strict=True))

        aster_process = start_aster(release)
        legacy_work = rollback_work or stage / "legacy-work"
        if system:
            active_release.symlink_to(release)
        elif work_gateway_policy:
            active_release.mkdir()

        def start_system_work(name, expected):
            return start(name, work_host, [RELEASE_RUNTIME, "appdev-work-host",
                active_release, legacy_work, str(work_host)],
                expected_runtime=(expected / "encounter").resolve(strict=True))

        def start_work(name, runtime, programme, assets):
            return start(name, work_host, [runtime, "browser-host", programme, work_browser, assets, str(work_host)])

        work_process = (start_system_work("work-host", work_candidate) if system else
            start_work("work-host", work_runtime, work_program, work_assets))
        if rollback_work:
            work_gateway_policy = Path(os.environ["APPDEV_LEGACY_WORK_GATEWAY_POLICY"]).resolve(strict=True)
        standalone_gateway = ["--standalone-policy", work_gateway_policy] if work_gateway_policy else []

        def start_managed_gateway(name):
            # Installed sweep drivers accept this positional layout for bundled Work.
            # The reserved slash carries no executable or policy authority.
            arguments = [work_config, *standalone_gateway] if standalone_gateway else ["/", work_config]
            return start(name, work_gateway, [RELEASE_RUNTIME, "appdev-work-gateway",
                active_release, *arguments],
                expected_runtime=RELEASE_RUNTIME.resolve(strict=True))

        if primary_system_journey:
            aster_native_process = start("aster-native", aster_native_port, aster_native_args)
        gateway_runtime = (vm_manager_bin if vm_manager_bin.is_file()
                           and os.environ.get("APPDEV_REGISTRY_STEWARD_PROOF") == "1" else BINARY)
        start("identity-gateway", identity, [gateway_runtime, "gateway", identity_config])
        if board_args:
            board_process = start("workgarden", board_port, board_args)
        if system and formation and not measure_only:
            crm_process = start("super-crm", crm_port, crm_args)
            harbor_process = start("harborboard", harbor_port, harbor_args)
        work_gateway_process = (start_managed_gateway("work-gateway") if system or work_gateway_policy else
            start("work-gateway", work_gateway, [BINARY, "gateway", work_config]))
        start("store-gateway", store_gateway, [BINARY, "gateway", store_config])
        if game_args:
            game_process = start("game-journey", game_port, game_args)
        start("game-gateway", game_gateway, [BINARY, "gateway", game_config])
        if north_args:
            north_process = start("north-journey", north_port, north_args)
        if co_build_wasm:
            start("co-build", co_build_port, co_build_args)
        start("north-gateway", north_gateway, [BINARY, "gateway", north_config])
        if pilot_preview_wasm:
            start("pilot-timesheet", timesheet_port, timesheet_args)
            start("pilot-preview-gateway", pilot_preview_port, [BINARY, "gateway", pilot_preview_config])

        shop_package = release / "shop" if system else None
        shop_ingress, shop_broker = "", ""
        if shop:
            shop_ingress, shop_broker, shop_gateway, shop_broker_port, switch_shop = stage_shop(
                stage, cleanup, authority, provider.server_port, start, shop_package,
                active_release if system else None)
        proxy = release / "proxy" if (release / "proxy").is_dir() or system else APP
        include = (proxy / "workspace.nginx.conf").read_text()
        include = include.replace("/var/www/appdev-projects/workspace/browser-assets/sourcery-os.css",
                                  str((active_release if system else release) / "browser-assets/sourcery-os.css"))
        if system:
            assert "location = /workspace/formation/records" not in include
            assert (release / "formation/records.nginx.conf").is_file()
            include += f"\ninclude {active_release}/formation/records.nginx.con[f];"
        elif formation and "location = /workspace/formation/records" not in include:
            include += "\n" + (APP / "formation/records.nginx.conf").read_text()
        platform_access_interstitial = False
        if temple_startup:
            temple_ingress = (proxy / "workspace-temple-startup.nginx.conf").read_text()
            temple_ingress = temple_ingress.replace("/var/www/appdev-projects/workspace/browser-assets/temple-compact.css",
                                                  str(release / "browser-assets/temple-compact.css"))
            installed_interstitial = "/var/www/appdev-projects/workspace/proxy/platform-access.html"
            platform_access_interstitial = installed_interstitial in temple_ingress
            if platform_access_interstitial:
                interstitial = proxy / "platform-access.html"
                assert interstitial.is_file(), "The staged Platform access interstitial is missing"
                temple_ingress = temple_ingress.replace(installed_interstitial, str(interstitial))
            if frontend_csp_policy:
                ingress = APP / "front-gate-ingress"
                temple_ingress = subprocess.check_output(
                    [BINARY, "run", "--declaration", ingress, "local-ingress.rel", "temple-startup", temple_ingress],
                    text=True)
            if coordinated_frontend_rollback:
                # Keep the direct Home regression route and exercise Work inside Temple on the same ingress.
                all_environments = "^(?:/|/workspace/(?:home|work|platform|mobile))$"
                assert temple_ingress.count(all_environments) == 1
                temple_ingress = temple_ingress.replace(all_environments, "^/workspace/work$")
            include += "\n" + temple_ingress
        vm_manager_csp = ""
        if vm_manager_port:
            include = include.replace("127.0.0.1:24413", f"127.0.0.1:{vm_manager_port}")
            marker = "location ^~ /workspace/ {"
            assert include.count(marker) == 1
            include = include.replace(marker, marker + """
    proxy_hide_header Content-Security-Policy;
    add_header Content-Security-Policy $vm_manager_fixture_csp always;
""")
            vm_manager_csp = f'''map "$uri:$upstream_http_content_security_policy" $vm_manager_fixture_csp {{
    default $upstream_http_content_security_policy;
    "~^/workspace/home:(?<vm_frame_pre>.*; frame-src [^;]+)(?<vm_frame_post>;.*)?$" "$vm_frame_pre {origin}/workspace/vm-manager$vm_frame_post";
}}'''
        for existing, staged in [(24249, workspace), (24257, browser), (24251, work_gateway)]:
            include = include.replace(f"127.0.0.1:{existing}", f"127.0.0.1:{staged}")
        home_wasm_map = ""
        if browser_wasm or candidate_wasm or fixture_front_gate_csp:
            ingress = APP / "front-gate-ingress"
            render_ingress = [BINARY, "run", "--declaration", ingress, "local-ingress.rel"]
            # Release checks exercise the staged ingress. The diagnostic
            # rehearsal can supply the separate loopback Home grant.
            use_home_fixture = fixture_front_gate_csp or fixture_home_wasm_csp or (
                not frontend_csp_policy and os.environ.get("ENCOUNTER_ENFORCE_BROWSER_CSP") != "1")
            prefix = "fixture-" if use_home_fixture else ""
            home_wasm_map = subprocess.check_output([*render_ingress, prefix + "home-map"], text=True)
            include = subprocess.check_output([*render_ingress, prefix + "home-site", include], text=True)
        if idle_bridge:
            address = f"127.0.0.1:{browser}"
            include = include.replace(
                f"proxy_pass http://{address}/assurance-catalogue/;",
                'rewrite ^/_encounter/(assurance-catalogue/.*)$ /$1 break;\n'
                '    proxy_pass http://$catalogue_fixture_browser;')
            include = include.replace(f"proxy_pass http://{address};", "proxy_pass http://$catalogue_fixture_browser;")
            include = include.replace(f"proxy_set_header Host {address};", "proxy_set_header Host $catalogue_fixture_browser;")
            include = include.replace(f"proxy_set_header Origin http://{address};",
                                      "proxy_set_header Origin http://$catalogue_fixture_browser;")
        if assurance_bytes or badge_bytes or idle_bridge:
            assurance_phase, mailbox_proxy = stage_assurance_sweep(stage, cleanup, badge_bytes)
            include += "\n" + mailbox_proxy.replace("127.0.0.1:24249", f"127.0.0.1:{workspace}")
        aster_include = (proxy / "aster-browser.nginx.conf").read_text().replace(
            "127.0.0.1:24372", f"127.0.0.1:{aster}"
        )
        limits = proxy / "workspace-limits.nginx.conf"
        if capacity:
            # Loopback clients share an address. Give each simulated client its own normal quota.
            fixture_limits = stage / "capacity-limits.nginx.conf"
            client_map = ('map $cookie_encounter_capacity_client $encounter_capacity_client {\n'
                          '    default $binary_remote_addr;\n' +
                          ''.join(f'    {index} capacity-client-{index};\n' for index in range(1, 10)) + '}\n')
            fixture_limits.write_text(client_map + limits.read_text().replace(
                'limit_req_zone $binary_remote_addr zone=appdev_workspace_requests',
                'limit_req_zone $encounter_capacity_client zone=appdev_workspace_requests'))
            limits = fixture_limits
        pilot_preview_ingress = ""
        if pilot_preview_wasm:
            pilot_preview_ingress = f"""
        location ~ ^/encounter-pilot/(timesheet-preview/|preview-context[.]js$|preview-comments/$) {{
            proxy_pass http://127.0.0.1:{pilot_preview_port};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
"""
        conf = stage / "nginx.conf"
        conf.write_text(f"""
pid {stage}/nginx.pid;
error_log {stage}/nginx-error.log;
events {{}}
http {{
    access_log off;
    {vm_manager_csp}
    client_body_temp_path {stage}/body;
    proxy_temp_path {stage}/proxy;
    fastcgi_temp_path {stage}/fastcgi;
    uwsgi_temp_path {stage}/uwsgi;
    scgi_temp_path {stage}/scgi;
    include {limits};
    upstream sourcery_appdev_formation {{ server 127.0.0.1:{workspace}; }}
    {shop_broker}
    {catalogue_proxy}
    {home_wasm_map}
    server {{
        listen 127.0.0.1:{front}{' ssl' if tls else ''};
        {tls_config}
        {include}
        {aster_include}
        {shop_ingress}
        location ^~ /identity-management/ {{
            proxy_pass http://127.0.0.1:{identity};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
        location ^~ /store/ {{
            proxy_pass http://127.0.0.1:{store_gateway};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
        location ^~ /game/ {{
            proxy_pass http://127.0.0.1:{game_gateway};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
        {pilot_preview_ingress}
        location /encounter-pilot/ {{
            proxy_pass http://127.0.0.1:{north_gateway};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
        location /life-board/ {{
            proxy_pass http://127.0.0.1:{work_gateway};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection upgrade;
        }}
    }}
}}
""".replace("proxy_set_header Host $host;", "proxy_set_header Host $http_host;"))
        nginx = shutil.which("nginx") or "/usr/sbin/nginx"
        subprocess.run([nginx, "-t", "-p", str(stage), "-c", str(conf)], check=True)
        start("nginx", front, [nginx, "-p", str(stage), "-c", str(conf), "-g", "daemon off;"])
        if primary_system_journey:
            temple_fixture, temple_commands = stage_paired_temples(stage, release)
            temple_processes = {role: start(role + "-temple", int(command[-1]), command)
                                for role, command in temple_commands.items()}
            editorial_port, editorial_args, editorial_fixture = stage_claimipedia_editorial(stage)
            editorial_process = start("claimipedia-editorial", editorial_port, editorial_args)
            authoring_port, authoring_args = stage_encounter_authoring(stage)
            authoring_process = start("encounter-authoring", authoring_port, authoring_args)
            usewords_port = free_port()
            ingress = stage / "front-gate-ingress"
            ingress.mkdir()
            ingress_config = ingress / "nginx.conf"
            ingress_source = release / "front-gate-ingress"
            # The staged ingress owns the socket upgrade. Ordinary HTTP still uses
            # the established Front Gate directory and the real Usewords preview.
            with ingress_config.open("wb") as output:
                subprocess.run([release / "encounter", "run", "--declaration", ingress_source,
                    "local-ingress.rel", json.dumps({"listen": usewords_port, "upstream": 24220,
                        "services": [{"id": "usewords", "port": 24193}]})],
                    stdout=output, check=True)
            prefix = str(ingress) + "/"
            subprocess.run([nginx, "-t", "-p", prefix, "-c", "nginx.conf"], check=True)
            start("front-gate-ingress", usewords_port, [nginx, "-p", prefix, "-c", "nginx.conf"])

        def get(path, cookie="", **kwargs):
            return http(front, path, cookie=cookie, tls=tls, **({'host': identity_authority, **kwargs} if tls else kwargs))

        steward = login(identity, "/identity-management", identity_authority, "A")
        if vm_console:
            member = login(identity, "/identity-management", authority, "B")
            status, _, sign_in = get("/workspace/vm-manager")
            assert status == 401 and "Sign in to Workspace" in sign_in
            if os.environ.get("APPDEV_REGISTRY_STEWARD_PROOF") == "1":
                check_registry_steward(get, identity, authority, origin, steward, member, stage)
                return
            assert get("/workspace/vm-manager", member)[0] == 403
            assert get("/workspace/vm-manager?vm=unregistered", steward)[0] == 404
            for query in ("", "?vm=sourcery-dev", *(("?vm=linux-dev",) if vm_terminal else ())):
                status, _, body = get("/workspace/vm-manager" + query, steward)
                assert status == 200, (query, status, body)
            upgrade = {"Origin": origin, "Connection": "Upgrade", "Upgrade": "websocket",
                       "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="}
            console = "/workspace/vm-manager/console?vm=sourcery-dev"
            assert get(console, headers=upgrade)[0] == 403
            assert get(console, member, headers=upgrade)[0] == 403
            assert get(console, steward, headers={**upgrade, "Origin": "https://other.test"})[0] == 403
            fixture = stage / "vm-manager-fixture.json"
            fixture.write_text(json.dumps({"origin": origin, "steward": steward, "display": bool(vm_display), "terminal": bool(vm_terminal)}))
            subprocess.run(["node", Path(__file__).with_name("vm-manager.mjs"), fixture], check=True)
            return
        if catalogue_source:
            member = login(identity, "/identity-management", authority, "B")
            status, _, body = get("/workspace/files", steward)
            assert status == 200 and len(body.encode()) > 131072, "Exercise a full-size steward index"
            source = "version-programme/applications/appdev-projects/workspace.encounter"
            line = (release / source).read_text().splitlines().index("process workspace.environmentPolicy:") + 1
            revision = hashlib.sha256((release / "package-receipt.rel").read_bytes()).hexdigest()
            source_text = (release / source).read_text()
            excerpt_id = hashlib.sha256(f"Platform/Releases/Home/spec/catalogue-source/{source}/workspace.environmentPolicy.encounter".encode()).hexdigest()
            authoring = f"/workspace/files?file={excerpt_id}&view=authoring&revision={revision}"
            assert get(authoring, member)[0] == 403
            assert get(authoring, "")[0] == 403
            assert get(authoring.replace(revision, "0" * 64), steward)[0] == 409
            assert get(authoring.replace(excerpt_id, "0" * 64), steward)[0] == 404
            assert get(authoring, steward, headers={"Origin": "https://other.example.test"})[0] == 403
            status, headers, body = get(authoring, steward)
            assert status == 200 and headers["Cache-Control"] == "no-store"
            assert json.loads(body) == {"revision": revision, "app": "appdev-projects",
                "file": "workspace.encounter", "process": "workspace.environmentPolicy", "line": line, "text": source_text}
            fixture = stage / "catalogue-source-fixture.json"
            fixture.touch(mode=0o600)
            fixture.write_text(json.dumps({"origin": origin, "steward": steward, "member": member, "catalogueLine": line, "catalogueRevision": revision}))
            subprocess.run(["node", Path(__file__).with_name("browser.mjs"), fixture, "--catalogue-source"], check=True)
            return
        if assurance_bytes or badge_bytes:
            config = stage / "assurance-fixture.json"
            config.touch(mode=0o600)
            config.write_text(json.dumps({"origin": origin, "steward": steward, "phase": str(assurance_phase)}))
            probe = "performance-badge-bytes.mjs" if badge_bytes else "mobile-assurance-bytes.mjs"
            scope = "encounter-performance-badge-bytes" if badge_bytes else "encounter-mobile-assurance-bytes"
            result = subprocess.run(["node", Path(__file__).with_name(probe), config],
                                    stdout=subprocess.PIPE, text=True, timeout=100)
            samples = json.loads(result.stdout) if result.stdout else []
            request = json.dumps({"operation": "browser-byte-report", "scope": scope,
                                  "samples": samples, "browserPassed": result.returncode == 0})
            declaration = "applications/appdev-projects/verification/performance/measurements.rel"
            output = subprocess.check_output([BINARY, "run", "--declaration", PROJECTS, declaration, request],
                                             text=True, timeout=10)
            report = json.loads(output)
            # The sweep journal selects reports by their leading scope field.
            print(json.dumps({"scope": report["scope"], **report}, separators=(",", ":")), flush=True)
            return 0 if report["passed"] else 1
        if idle_bridge and os.environ.get("ENCOUNTER_RELEASE_PERFORMANCE_GATE") == "1":
            startup = Path(__file__).resolve().parents[1] / "sourcery-home/hosted-startup.mjs"
            subprocess.run(["node", startup], env={**os.environ, "ENCOUNTER_HOME_FIXTURE_ORIGIN": origin},
                           check=True, timeout=45)
        if idle_bridge or capacity:
            config = stage / "idle-bridge-fixture.json"
            config.touch(mode=0o600)
            work_session = login(work_gateway, "/life-board", authority, "A")
            config.write_text(json.dumps({"origin": origin, "steward": steward, "workSession": work_session,
                                          "catalogueDigest": catalogue_digest}))
            return subprocess.run(
                ["node", Path(__file__).with_name("resource-performance.mjs"), "capacity" if capacity else "idle", config],
                timeout=85).returncode
        if app_build:
            from app_build_test import verify_app_build

            def restart_workspace():
                workspace_process.terminate()
                workspace_process.wait(timeout=8)
                restarted = start("workspace-restarted", workspace, [BINARY, "workspace-host", release], env)
                assert restarted.pid != workspace_process.pid

            def sign_in():
                return tuple(login(identity, "/identity-management", identity_authority, role) for role in "ABC")

            receipt = verify_app_build(get, origin, sign_in, stage, certificate, front, restart_workspace)
            output = os.environ.get("APPDEV_BUILD_RECEIPT")
            if output:
                Path(output).write_text(json.dumps(receipt, indent=2) + "\n")
            return 0
        member = login(identity, "/identity-management", authority, "B")
        work_session = login(work_gateway, "/life-board", authority, "A")

        def verify_routes(phase, applications=None):
            route_fixture = json.dumps({"port": front, "workspacePort": workspace,
                                        "certificate": str(certificate) if tls else None,
                                        "member": member, "steward": steward, "work": work_session,
                                        "stewardEmail": STEWARD, "applications": applications,
                                        "identity": {"port": identity, "authorization": AUTH} if phase == "access" else None})
            subprocess.run([RELEASE_RUNTIME, "appdev-check-workspace-routes", APP, phase],
                           input=route_fixture, text=True, check=True, timeout=120)

        if system and formation and not measure_only:
            verify_routes("work-mounts")
            print("PASS: bundled Work gateway preserves Super CRM and Decompiler routes and method restrictions", flush=True)
        browser_fixture = stage / "browser-fixture.json"
        browser_data = {"origin": origin, "steward": steward, "member": member, "workSession": work_session,
                        "platformAccessInterstitial": platform_access_interstitial}
        if desktop_journey or primary_system_journey:
            browser_data["gameSession"] = login(game_gateway, "/game", authority, "A")
        if primary_system_journey:
            browser_data["northSession"] = login(north_gateway, "/encounter-pilot", authority, "A")
            browser_data["harborOrigin"] = f"http://127.0.0.1:{harbor_port}"
            browser_data["usewordsOrigin"] = f"http://usewords.localhost:{usewords_port}"
            browser_data["editorial"] = editorial_fixture
            browser_data["authoringOrigin"] = f"http://127.0.0.1:{authoring_port}"
            browser_data["pairedTemples"] = temple_fixture
            payload = json.dumps({"data": [{"event_type": "post.mention.create", "tag": "sourcery-notes-mentions",
                "filter": {"user_id": "12345"},
                "payload": {"id": "90001", "author_id": "56789", "text": "Formation field visit reminder",
                            "created_at": "2026-11-11T12:30:00Z"},
                "includes": {"users": [{"id": "56789", "username": "field_team"}]}}]})
            signature = "sha256=" + base64.b64encode(hmac.digest(webhook_secret.encode(), payload.encode(), "sha256")).decode()
            def deliver(signature):
                return get("/workspace/webhooks/x", method="POST", body=payload,
                    headers={"Content-Type": "application/json", "X-Twitter-Webhooks-Signature-OAuth2": signature})[0]
            assert deliver("sha256=" + "A" * 44) == 401
            assert deliver(signature) == 200 and deliver(signature) == 200
        browser_fixture.touch(mode=0o600)
        browser_fixture.write_text(json.dumps(browser_data))
        browser_check = ["node", Path(__file__).with_name("browser.mjs"), browser_fixture]
        if home_tray:
            resources = "/workspace/server-resources"
            for cookie, expected in [("", 401), (member, 403), (steward, 200)]:
                status, headers, body = get(resources, cookie)
                assert status == expected and headers["Cache-Control"] == "no-store"
                if expected != 200:
                    assert not body
                    continue
                payload = json.loads(body)
                assert payload["memory"]["totalBytes"] >= payload["memory"]["availableBytes"] > 0
                assert payload["disks"][0]["usage"]["totalBytes"] > 0
                assert payload["cpuPercent"] is None or 0 <= payload["cpuPercent"] <= 100
            assert get(resources, steward, method="POST", headers={"Origin": origin})[0] == 404
            workloads = "/workspace/server-workloads"
            fresh_storage = os.environ.get("APPDEV_VERIFY_FRESH_STORAGE") == "1"
            if fresh_storage:
                snapshot = json.loads(Path("/var/lib/sourcery-appdev-workloads/storage.json").read_text())
                collected = datetime.fromisoformat(snapshot["sampledAt"])
                age = (datetime.now(timezone.utc) - collected).total_seconds()
                assert 0 <= age < 900, f"Disk snapshot age is {age:.0f} seconds"
                assert snapshot["areas"]["apps"]["bytes"] > 0
            for cookie, expected in [("", 401), (member, 403), (steward, 200)]:
                status, headers, body = get(workloads + "?sort=memory", cookie)
                assert status == expected and headers["Cache-Control"] == "no-store"
                if expected != 200:
                    assert not body
                    continue
                payload = json.loads(body)
                memories = [row["memoryBytes"] for row in payload["activities"] if row["memoryBytes"] is not None]
                assert memories and memories == sorted(memories, reverse=True)
                assert all(row["cpuTenths"] is None or 0 <= row["cpuTenths"] <= 1000 for row in payload["activities"])
                if fresh_storage:
                    storage = payload["storage"]
                    assert datetime.fromisoformat(storage["sampledAt"]) == collected
                    areas = {row["activity"]: row for row in storage["areas"]}
                    assert areas["Application development"]["bytes"] == snapshot["areas"]["apps"]["bytes"]
                    assert len(areas) == len(snapshot["areas"])
                    browser_data["workloadStorageTimestamp"] = storage["sampledAt"]
                    browser_fixture.write_text(json.dumps(browser_data))

            assert get(workloads, steward, method="POST", headers={"Origin": origin})[0] == 404
            subprocess.run([*browser_check, "--home-tray"], check=True)
            return
        if formation_guides:
            browser_check.append("--formation-guides")
        if formation_tools:
            subprocess.run([*browser_check, "--formation-tools"], check=True)
            return
        if formation_desktop:
            subprocess.run([*browser_check, "--formation-desktop"], check=True)
            return
        if formation_publications:
            subprocess.run([*browser_check, "--formation-publications"], check=True)
            return
        def run_aster_journey():
            browser_data["asterProof"] = timed_browser([*browser_check, "--formation-aster"], "formation-aster")
            aster_native_process.terminate()
            aster_native_process.wait(timeout=8)
            start("aster-native-reopened", aster_native_port, aster_native_args)
            browser_fixture.write_text(json.dumps(browser_data))
            subprocess.run([*browser_check, "--formation-aster-reopen"], check=True)

        if formation_aster:
            run_aster_journey()
            return
        if board_args:
            subprocess.run([*browser_check, "--workgarden"], check=True)
            board_process.terminate()
            board_process.wait(timeout=8)
            board_process = start("workgarden-reopened", board_port, board_args)
            subprocess.run([*browser_check, "--workgarden-reopen"], check=True)
            if workgarden:
                return
        if shop:
            report = timed_browser([*browser_check, "--shop"], "shop-workspace" if measurements is not None else None)
            if measurements is not None:
                measurements["shop"] = report
            if not formation:
                return
        if system and formation and not measure_only:
            subprocess.run([*browser_check, "--formation-publications"], check=True)
            browser_data["portfolioPreviews"] = verify_portfolio(stage)
            browser_fixture.write_text(json.dumps(browser_data))
            subprocess.run([*browser_check, "--formation-portfolio"], check=True)
            subprocess.run([*browser_check, "--formation-platform-previews"], check=True)
            editorial_process.terminate()
            editorial_process.wait(timeout=8)
            start("claimipedia-editorial-reopened", editorial_port, editorial_args)
            subprocess.run([*browser_check, "--formation-editorial-reopen"], check=True)
            authoring_process.terminate()
            authoring_process.wait(timeout=8)
            start("encounter-authoring-reopened", authoring_port, authoring_args)
            subprocess.run([*browser_check, "--formation-authoring-reopen"], check=True)
            harbor_process.terminate()
            harbor_process.wait(timeout=8)
            start("harborboard-reopened", harbor_port, harbor_args)
            subprocess.run([*browser_check, "--formation-harbor-reopen"], check=True)
            subprocess.run([*browser_check, "--formation-signed-in"], check=True)
            north_process.terminate()
            north_process.wait(timeout=8)
            start("north-journey-reopened", north_port, north_args)
            subprocess.run([*browser_check, "--formation-north-reopen"], check=True)
            browser_data["gameProof"] = timed_browser([*browser_check, "--formation-game"], "formation-game")
            game_process.terminate()
            game_process.wait(timeout=8)
            start("game-journey-reopened", game_port, game_args)
            browser_fixture.write_text(json.dumps(browser_data))
            subprocess.run([*browser_check, "--formation-game-reopen"], check=True)
            subprocess.run([*browser_check, "--formation-work"], check=True)
            crm_process.terminate()
            crm_process.wait(timeout=8)
            start("super-crm-reopened", crm_port, crm_args)
            subprocess.run([*browser_check, "--formation-work-reopen"], check=True)
            subprocess.run([*browser_check, "--formation-paired-temples"], check=True)
            for process in temple_processes.values():
                process.terminate()
                process.wait(timeout=8)
            for role, command in temple_commands.items():
                start(role + "-temple-reopened", int(command[-1]), command)
            subprocess.run([*browser_check, "--formation-paired-temples-reopen"], check=True)
            run_aster_journey()
            subprocess.run([*browser_check, "--store-only"], check=True)
        if formation:
            try:
                temple_exercise = ["--formation-temple-manager"] if primary_system_journey else []
                report = timed_browser([*browser_check, "--formation", *temple_exercise], "formation-browser" if measurements is not None else None)
                if measurements is not None:
                    measurements["formation"] = report
            except subprocess.CalledProcessError:
                print((stage / "browser.log").read_text(), flush=True)
                print((stage / "workspace.log").read_text(), flush=True)
                raise
            records_path = "/workspace/formation/records"
            status, headers, data = get(records_path, steward)
            assert status == 200 and headers["Cache-Control"] == "no-store"
            saved = json.loads(data)
            assert saved["records"]["note"]["text"].endswith("Check the schedule tomorrow.")
            assert get(records_path)[0] == 401
            assert json.loads(get(records_path, member)[2])["records"] == {}
            fields = {"kind": "note", "action": "save", "owner": saved["owner"], "base": "",
                      "text": "Attempt to overwrite a newer note"}
            def change(cookie, site):
                return http(front, records_path, cookie=cookie, host=authority, method="POST",
                            body=urlencode(fields), headers={"Origin": site,
                            "Content-Type": "application/x-www-form-urlencoded"})[0]
            assert change(member, origin) == 409
            assert change(steward, origin) == 409
            assert change(steward, "https://untrusted.example") == 403
            if rollback:
                def order_snapshot():
                    customer_cookie = login(shop_gateway, "/shop", authority, "B")
                    status, _, html = get("/shop/", customer_cookie)
                    assert status == 200 and "Field notebook" in html
                    orders = re.findall(r'<article id="(order-[a-f0-9]{48})">(.*?)</article>', html, re.DOTALL)
                    assert len(orders) == 1
                    order_id, detail = orders[0]
                    assert "<strong>fulfilled</strong>" in detail
                    assert "<li>requested</li><li>accepted</li><li>fulfilled</li>" in detail
                    return order_id

                order = order_snapshot()
                running = [workspace_process, browser_process, work_gateway_process, work_process]
                if board_args:
                    running.append(board_process)
                def switch_ingress(available):
                    subprocess.run([nginx, "-t", "-p", str(stage), "-c", str(conf)], check=True)
                    subprocess.run([nginx, "-p", str(stage), "-c", str(conf), "-s", "reload"], check=True)
                    for _ in range(100):
                        try:
                            app_status = get("/shop/")[0]
                            broker_status = http(shop_broker_port, "/shop/identity")[0]
                            records_status = get(records_path)[0]
                        except OSError:
                            time.sleep(.05)
                            continue
                        if available and app_status in (302, 303) and broker_status in (400, 403) and records_status == 401:
                            return
                        if not available and app_status == broker_status == records_status == 404:
                            return
                        time.sleep(.05)
                    raise AssertionError("AppDev and broker ingress did not converge after the release-link switch")

                for name, package in (("previous", rollback), ("restored", release)):
                    legacy = name == "previous" and rollback_work is not None
                    if legacy:
                        switch_shop("shop-disabled", None, None)
                    for process in running:
                        process.terminate()
                        process.wait(timeout=8)
                    runtime = package / "encounter"
                    work = rollback_work if legacy else package / "work"
                    pending = stage / "pending-release"
                    pending.symlink_to(package)
                    pending.replace(active_release)
                    running = [
                        start("workspace-" + name, workspace, [runtime, "workspace-host", package], env),
                        start("browser-" + name, browser, [runtime, "appdev-browser-host", "--allow-aster-stream", package, str(browser)]),
                        start_managed_gateway("work-gateway-" + name),
                        start_system_work("work-host-" + name, work),
                    ]
                    if board_args:
                        running.append(start("workgarden-" + name, board_port, board_args))
                    if not legacy:
                        switch_shop("shop-" + name, package / "shop", runtime)
                    switch_ingress(not legacy)
                    build = re.search(r'id="about-build-id">([^<]+)', (package / "index.html").read_text())[1]
                    status, _, home_page = get("/workspace/home", steward)
                    assert status == 200 and f'id="about-build-id">{build}<' in home_page
                    work_cookie = login(work_gateway, "/life-board", authority, "A")
                    status, _, work_page = get("/workspace/work", work_cookie)
                    assert status == 200 and 'id="board-stage"' in work_page
                    status, _, data = get(records_path, steward)
                    if legacy:
                        assert status == 404
                        assert 'href="/shop/"' not in home_page and 'href="/shop/"' not in work_page
                    else:
                        assert status == 200 and json.loads(data) == saved
                        assert order_snapshot() == order
                    preview_links = re.findall(r'<a class="app-link" href="(http://[a-z0-9-]+\.localhost:[0-9]+/)"',
                                               (work / "assets/index.html").read_text())
                    browser_fixture.write_text(json.dumps({
                        "origin": origin, "steward": steward, "member": member, "workSession": work_cookie,
                        "rollbackBuild": build, "rollbackRecords": None if legacy else saved["records"],
                        "rollbackOrder": None if legacy else order, "rollbackWorkPreviews": preview_links}))
                    subprocess.run([*browser_check, "--rollback-reopen"], check=True)
                    if board_args:
                        check = "--workgarden-legacy-open" if legacy else "--workgarden-verify-open"
                        subprocess.run([*browser_check, check], check=True)
                    if legacy:
                        print("PASS: previous Home and Work booted with Shop unavailable on both ingress hosts", flush=True)
                    else:
                        print(f"PASS: {name} package reopened Home and Work and retained the same Formation records and fulfilled order", flush=True)
                    if name == "previous" and not legacy:
                        note = saved["records"]["note"]
                        edit = {**fields, "base": note["revision"],
                                "text": note["text"] + "\nSaved while the previous package was active."}
                        status, _, body = http(
                            front, records_path, cookie=steward, host=authority, method="POST",
                            body=urlencode(edit), headers={"Origin": origin,
                                "Content-Type": "application/x-www-form-urlencoded"})
                        assert status == 200
                        status, _, data = get(records_path, steward)
                        assert status == 200
                        after = json.loads(data)
                        assert after["owner"] == saved["owner"]
                        assert after["records"]["project"] == saved["records"]["project"]
                        assert after["records"]["note"]["text"] == edit["text"]
                        assert after["records"]["note"]["revision"] != note["revision"]
                        saved = after
                if not rollback_work:
                    print("PASS: a Formation edit saved under the previous release survived restoration", flush=True)
                return
            workspace_process.terminate()
            workspace_process.wait(timeout=8)
            reopened_workspace = start("workspace-reopened", workspace, [BINARY, "workspace-host", release], env)
            status, _, data = get(records_path, steward)
            assert status == 200 and json.loads(data) == saved
            if primary_system_journey:
                subprocess.run([*browser_check, "--formation-x-reopen"], check=True)
                browser_data["templeRecords"] = saved["records"]
                browser_fixture.write_text(json.dumps(browser_data))
                subprocess.run([*browser_check, "--formation-temple-manager-reopen"], check=True)
                subprocess.run([*browser_check, "--formation-office-environments"], check=True)
                reopened_workspace.terminate()
                reopened_workspace.wait(timeout=8)
                start("workspace-office-reopened", workspace, [BINARY, "workspace-host", release], env)
                subprocess.run([*browser_check, "--formation-office-environments-reopen"], check=True)
            print("PASS: Formation signed-in records reject stale, cross-account, and cross-origin writes and survive host restart", flush=True)
            return
        if work_performance:
            command = ["node", Path(__file__).with_name("work-performance.mjs"), browser_fixture]
            if enforce_work_budget:
                command.append("--enforce-budget")
            report = timed_browser(command, "work" if measurements is not None else None)
            if measurements is not None:
                measurements["work"] = report
            return
        if fixture_front_gate_csp:
            catalog, scripts = check_browser_wasm_delivery(front, release)
            aster_bridge = check_aster_wasm_ingress(front, release)
            browser_env = {**os.environ, "ENCOUNTER_VERIFY_BROWSER_WASM": "1",
                           "ENCOUNTER_ENFORCE_BROWSER_CSP": "1",
                           "ENCOUNTER_HOME_BRIDGE_EVIDENCE": browser_bridge_evidence(catalog, scripts),
                           "ENCOUNTER_ASTER_BRIDGE_EVIDENCE": json.dumps(aster_bridge),
                           "ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE": check_workspace_wasm_delivery(workspace, release)}
            subprocess.run([*browser_check, "--fixture-front-gate-csp"], env=browser_env, check=True)
            return
        if frontend_csp_policy:
            catalog, scripts = check_browser_wasm_delivery(front, release)
            workspace_evidence = check_workspace_wasm_delivery(workspace, release, front=front)
            work_evidence = check_work_wasm_ingress(work_host, work_candidate, front, work_session)
            check_aster_wasm_ingress(front, release)
            pilot_policies = {}
            if pilot_preview_wasm:
                pilot_policies["Pilot Timesheet preview"] = check_pilot_preview_wasm_delivery(
                    pilot_preview_port, authority, pilot_preview_wasm)
                pilot_policies.update(check_co_build_wasm_delivery(north_gateway, authority, co_build_wasm))
            browser_env = {**os.environ, "ENCOUNTER_VERIFY_BROWSER_WASM": "1",
                           "ENCOUNTER_ENFORCE_BROWSER_CSP": "1",
                           "ENCOUNTER_HOME_BRIDGE_EVIDENCE": browser_bridge_evidence(catalog, scripts),
                           "ENCOUNTER_WORK_BRIDGE_EVIDENCE": work_evidence,
                           "ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE": workspace_evidence}
            policy_check = [*browser_check, "--frontend-csp-policy"]
            browser_data["pilotPolicies"] = pilot_policies
            browser_fixture.write_text(json.dumps(browser_data))
            if fixture_home_wasm_csp:
                policy_check.append("--fixture-home-wasm-csp")
            workspace_policy = subprocess.run(policy_check, env=browser_env)
            standalone = ["node", PROJECTS / "encounter-core/tests/browser-clients-wasm.mjs", BINARY]
            has_standalone = (release / "standalone-browser-wasm.rel").is_file()
            if has_standalone:
                standalone.extend(["--package", release])
            if frontend_previous_clients:
                standalone.extend(["--previous-runtime", frontend_previous_clients / "encounter"])
                if (frontend_previous_clients / "standalone-browser-wasm.rel").is_file():
                    standalone.extend(["--previous-package", frontend_previous_clients])
            if not frontend_wasm_journeys or workspace_policy.returncode != 0 or not has_standalone:
                standalone.append("--csp-preflight")
            if frontend_wasm_journeys and not has_standalone:
                print("Release requires the pinned standalone browser Wasm catalog", flush=True)
            standalone_policy = subprocess.run(standalone, env=browser_env)
            workspace_policy.check_returncode()
            standalone_policy.check_returncode()
            if frontend_wasm_journeys:
                if not has_standalone:
                    raise RuntimeError("Release requires the pinned standalone browser Wasm catalog")
                subprocess.run([*browser_check, "--frontend-wasm-journeys"], env=browser_env, check=True)
            return
        if workspace_streams:
            if package_wasm:
                check_workspace_wasm_delivery(workspace, release)
            status, _, platform = get("/workspace/platform", steward)
            assert status == 200 and "data-platform-workspace" in platform
            assert 'id="workspace"' not in platform and 'src="/_encounter/browser.mjs"' not in platform
            assert get("/workspace/platform", member)[0] == 403
            assert get("/workspace/temple/connection", headers={
                "Origin": "https://untrusted.example", "Upgrade": "websocket"})[0] == 403
            subprocess.run([*browser_check, "--workspace-streams"], check=True)
            return
        if home_temple_startup:
            browser_env = os.environ.copy()
            if package_wasm:
                browser_env["ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE"] = check_workspace_wasm_delivery(workspace, release)
            subprocess.run([*browser_check, "--home-temple-startup"], env=browser_env, check=True)
            return
        if work_candidate and not coordinated_frontend_rollback:
            browser_env = os.environ.copy()
            if require_wasm:
                browser_env["ENCOUNTER_WORK_BRIDGE_EVIDENCE"] = check_work_wasm_ingress(
                    work_host, work_candidate, front, work_session)
                if candidate_wasm:
                    browser_env["ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE"] = check_workspace_wasm_delivery(workspace, release)
            subprocess.run([*browser_check, "--work-candidate"], env=browser_env, check=True)
            return
        if front_gate_only:
            scope = "--browser-wasm" if browser_wasm else "--front-gate-only"
            browser_env = os.environ.copy()
            if previous_browser_release:
                browser_env["ENCOUNTER_HOME_ROLLBACK_PROFILE"] = str(stage / "home-rollback-profile")
            if coordinated_frontend_rollback:
                browser_env["ENCOUNTER_MOBILE_ROLLBACK_PROFILE"] = str(stage / "mobile-rollback-profile")
            if frontend_rollback_package:
                browser_env["ENCOUNTER_FRONTEND_ROLLBACK_PACKAGE"] = "1"
            rollback_wasm = bool(frontend_rollback_package and (previous_browser_release / "browser-wasm.rel").is_file())
            browser_env["ENCOUNTER_FRONTEND_ROLLBACK_WASM"] = "1" if rollback_wasm else "0"
            if browser_wasm:
                catalog, scripts = check_browser_wasm_delivery(front, release)
                seed_bridge = browser_bridge_evidence(catalog, scripts)
                browser_env["ENCOUNTER_HOME_BRIDGE_EVIDENCE"] = seed_bridge
                seed_workspace_scripts = check_workspace_wasm_delivery(workspace, release, front=front)
                browser_env["ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE"] = seed_workspace_scripts
                seed_aster_bridge = check_aster_wasm_ingress(front, release)
                browser_env["ENCOUNTER_ASTER_BRIDGE_EVIDENCE"] = json.dumps(seed_aster_bridge)
            subprocess.run([*browser_check, scope], env=browser_env, check=True)
            if coordinated_frontend_rollback:
                seed_work_bridge = check_work_wasm_ingress(work_host, work_candidate, front, work_session)
                browser_env["ENCOUNTER_WORK_BRIDGE_EVIDENCE"] = seed_work_bridge
                subprocess.run([*browser_check, "--work-candidate"], env=browser_env, check=True)
            if previous_browser_release:
                rejected = stage / "browser-wasm-rejected"
                shutil.copytree(release, rejected)
                home_host = [BINARY, "appdev-browser-host", "--allow-aster-stream", rejected, "0"]

                def refuses_wasm(message, command=home_host):
                    check = subprocess.run(command, capture_output=True, text=True, timeout=8)
                    assert check.returncode != 0 and message in check.stderr, check.stderr

                package_receipt = rejected / "package-receipt.rel"
                original_package_receipt = package_receipt.read_text()
                catalog = rejected / "browser-wasm.rel"
                original_catalog_pin = hashlib.sha256(catalog.read_bytes()).hexdigest()
                package_receipt.write_text(original_package_receipt.replace(original_catalog_pin, "0" * 64))
                refuses_wasm("browser Wasm catalog differs from its package receipt")
                package_receipt.write_text(original_package_receipt)
                catalog.rename(rejected / "catalog-hidden.rel")
                (rejected / "browser-wasm").rename(rejected / "modules-hidden")
                refuses_wasm("package receipt pins a missing browser Wasm catalog")
                (rejected / "catalog-hidden.rel").rename(catalog)
                (rejected / "modules-hidden").rename(rejected / "browser-wasm")
                original_catalog = catalog.read_text()
                for version, removed in [(1, {"aster-frame", "mobile", "temple"}), (2, {"aster-frame"})]:
                    legacy_catalog = "".join(line for line in original_catalog.splitlines(keepends=True)
                                             if not any(line.startswith(f'("{name}", ') for name in removed))
                    legacy_catalog = re.sub(r'encounter/appdev-browser-wasm/\d+', f"encounter/appdev-browser-wasm/{version}",
                                            legacy_catalog)
                    catalog.write_text(legacy_catalog)
                    package_receipt.write_text(original_package_receipt.replace(original_catalog_pin,
                        hashlib.sha256(catalog.read_bytes()).hexdigest()))
                    refuses_wasm("current Home runtime requires a complete browser Wasm catalog")
                catalog.write_text(original_catalog)
                package_receipt.write_text(original_package_receipt)
                mutations = [("countdown/browser.wasm", "module differs"),
                             ("countdown/browser.wasm.map.rel", "source map differs"),
                             ("mobile/browser.wasm", "AppDev browser Wasm mobile: browser Wasm module differs"),
                             ("temple/browser.wasm", "AppDev browser Wasm temple: browser Wasm module differs")]
                if (rejected / "browser-wasm/aster-frame/browser.wasm").is_file():
                    mutations.append(("aster-frame/browser.wasm", "AppDev browser Wasm aster-frame: browser Wasm module differs"))
                for file, message in mutations:
                    path = rejected / "browser-wasm" / file
                    saved = path.read_bytes()
                    path.write_bytes(saved + b"changed")
                    refuses_wasm(message)
                    path.write_bytes(saved)
                receipt = rejected / "browser-wasm/countdown/build-receipt.rel"
                old_receipt = receipt.read_bytes()
                countdown = rejected / "browser-wasm/countdown/browser.wasm"
                original_module = countdown.read_bytes()
                altered_module = original_module + b"\x00\x02\x01x"
                repinned_receipt = old_receipt.replace(hashlib.sha256(original_module).hexdigest().encode(),
                                                       hashlib.sha256(altered_module).hexdigest().encode())
                assert repinned_receipt != old_receipt
                countdown.write_bytes(altered_module)
                receipt.write_bytes(repinned_receipt)
                catalog.write_text(original_catalog.replace(hashlib.sha256(old_receipt).hexdigest(),
                                                           hashlib.sha256(repinned_receipt).hexdigest()))
                package_receipt.write_text(original_package_receipt.replace(original_catalog_pin,
                    hashlib.sha256(catalog.read_bytes()).hexdigest()))
                refuses_wasm("browser Wasm module differs from the Encounter build")
                countdown.write_bytes(original_module)
                receipt.write_bytes(old_receipt)
                catalog.write_text(original_catalog)
                package_receipt.write_text(original_package_receipt)
                altered_receipt, count = re.subn(rb'(\("source", "countdown.rel", ")[a-f0-9]{64}', rb'\g<1>' + b'0' * 64, old_receipt)
                assert count == 1
                receipt.write_bytes(altered_receipt)
                catalog.write_text(catalog.read_text().replace(hashlib.sha256(old_receipt).hexdigest(),
                                                               hashlib.sha256(altered_receipt).hexdigest()))
                package_receipt.write_text(original_package_receipt.replace(original_catalog_pin,
                    hashlib.sha256(catalog.read_bytes()).hexdigest()))
                refuses_wasm("source pin differs for countdown.rel")
                if coordinated_frontend_rollback:
                    rejected_work = stage / "work-wasm-rejected"
                    shutil.copytree(work_candidate, rejected_work)
                    work_receipt = rejected_work / "package-receipt.rel"
                    work_pin = hashlib.sha256((rejected_work / "browser-wasm.rel").read_bytes()).hexdigest()
                    work_receipt.write_text(work_receipt.read_text().replace(work_pin, "0" * 64))
                    refuses_wasm("browser Wasm catalog differs from its package receipt",
                                 [rejected_work / "encounter", "browser-host", rejected_work / "source", work_browser,
                                  rejected_work / "assets", str(work_host)])
                rolling_back = [browser_process, workspace_process]
                if coordinated_frontend_rollback:
                    rolling_back.extend([work_process, aster_process])
                stop_together(rolling_back)
                previous_runtime = previous_browser_release / "encounter" if frontend_rollback_package else BINARY
                previous_hosts = list(start_home(previous_browser_release, "-rollback", previous_runtime))
                if coordinated_frontend_rollback:
                    previous_hosts.append(start_work("work-rollback", previous_work_release / "encounter",
                               previous_work_release / "source", previous_work_release / "assets"))
                    previous_hosts.append(start_aster(previous_browser_release, "-rollback", previous_runtime))
                    browser_env.pop("ENCOUNTER_ASTER_BRIDGE_EVIDENCE", None)
                    if rollback_wasm:
                        browser_env["ENCOUNTER_WORK_BRIDGE_EVIDENCE"] = check_work_wasm_ingress(
                            work_host, previous_work_release, front, work_session, retained=True)
                        retained_aster_bridge = check_aster_wasm_ingress(front, previous_browser_release, retained=True)
                        browser_env["ENCOUNTER_ASTER_BRIDGE_EVIDENCE"] = json.dumps(retained_aster_bridge)
                    else:
                        status, headers, _ = http(work_host, "/_encounter/browser.mjs")
                        assert status == 200 and "X-Encounter-Browser-Wasm" not in headers
                        status, headers, _ = http(front, "/_aster/browser.mjs")
                        assert status == 200 and "X-Encounter-Browser-Wasm" not in headers
                        status, headers, _ = get("/life-board/_encounter/browser.mjs", work_session)
                        assert status == 200 and "X-Encounter-Browser-Wasm" not in headers
                if rollback_wasm:
                    catalog, scripts = check_browser_wasm_delivery(front, previous_browser_release, retained=True)
                    browser_env["ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE"] = check_workspace_wasm_delivery(
                        workspace, previous_browser_release, retained=True, front=front)
                else:
                    browser_env.pop("ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE", None)
                    catalog = None
                    scripts = {}
                    for path in ("/_encounter/browser.mjs", "/_encounter/browser.mjs?wasm=1"):
                        status, headers, script = http(front, path)
                        if path.endswith("?wasm=1") and status == 404:
                            continue
                        assert status == 200 and "X-Encounter-Browser-Wasm" not in headers
                        if not frontend_rollback_package:
                            assert "const encounterLegacyCountdown" in script
                        scripts[path] = script
                    for _, binding, path in WORKSPACE_WASM_ASSETS:
                        status, headers, script = http(workspace, path)
                        assert status == 200 and "X-Encounter-Browser-Wasm" not in headers
                        if not frontend_rollback_package:
                            assert f"const encounterLegacy{binding}" in script
                browser_env["ENCOUNTER_HOME_BRIDGE_EVIDENCE"] = browser_bridge_evidence(catalog, scripts)
                subprocess.run([*browser_check, "--browser-wasm-rollback"], env=browser_env, check=True)
                if coordinated_frontend_rollback:
                    subprocess.run([*browser_check, "--frontend-work-rollback"], env=browser_env, check=True)
                    print("PASS: previous Home, Work, and Aster runtimes reopened through the same loopback ingress", flush=True)
                    stop_together(previous_hosts)
                    start_home(release, "-restored")
                    start_work("work-restored", work_runtime, work_program, work_assets)
                    start_aster(release, "-restored")
                    catalog, scripts = check_browser_wasm_delivery(front, release)
                    restored_bridge = browser_bridge_evidence(catalog, scripts)
                    assert restored_bridge == seed_bridge, "The restored Home bridge differs from the original candidate"
                    browser_env["ENCOUNTER_HOME_BRIDGE_EVIDENCE"] = restored_bridge
                    restored_workspace_scripts = check_workspace_wasm_delivery(workspace, release, front=front)
                    assert restored_workspace_scripts == seed_workspace_scripts, "The restored workspace scripts differ from the original candidate"
                    browser_env["ENCOUNTER_WORKSPACE_SCRIPT_EVIDENCE"] = restored_workspace_scripts
                    restored_aster_bridge = check_aster_wasm_ingress(front, release)
                    assert restored_aster_bridge == seed_aster_bridge, "The restored Aster bridge differs from the original candidate"
                    browser_env["ENCOUNTER_ASTER_BRIDGE_EVIDENCE"] = json.dumps(restored_aster_bridge)
                    restored_work_bridge = check_work_wasm_ingress(work_host, work_candidate, front, work_session)
                    assert restored_work_bridge == seed_work_bridge, "The restored Work bridge differs from the original candidate"
                    browser_env["ENCOUNTER_WORK_BRIDGE_EVIDENCE"] = restored_work_bridge
                    subprocess.run([*browser_check, "--frontend-wasm-restored"], env=browser_env, check=True)
                    print("PASS: verified Home, Work, and Aster candidates restored through the same loopback ingress", flush=True)
                print("PASS: verified Home Wasm delivery, partial catalog and changed pin refusal, and loopback Home rollback", flush=True)
            return
        verify_routes("access")
        verify_routes("index")
        print("PASS: workspace file index and selected-file access", flush=True)
        game_session = login(game_gateway, "/game", authority, "A")
        store_session = login(store_gateway, "/store", authority, "A")
        north_session = login(north_gateway, "/encounter-pilot", authority, "A")
        application_sessions = {"gamePort": game_gateway, "game": game_session,
                                "store": store_session, "north": north_session}
        verify_routes("application-files", application_sessions)
        with contextlib.closing(sqlite3.connect(north_db)) as db, db:
            db.execute("INSERT INTO revisions VALUES (2)")
            db.execute("INSERT INTO documents SELECT 2, path, replace(text, 'fixture-owner', 'changed-owner') FROM documents WHERE revision = 1")
        verify_routes("north-changed", application_sessions)
        if rel_only:
            with contextlib.closing(sqlite3.connect(north_db)) as db, db:
                db.execute("DELETE FROM documents WHERE revision = 2")
                db.execute("DELETE FROM revisions WHERE id = 2")
            browser_fixture.write_text(json.dumps({"origin": origin, "steward": steward,
                                                   "member": member, "workSession": work_session,
                                                   "northSession": north_session,
                                                   "gameSession": game_session, "gameImage": GAME_IMAGE}))

        verify_routes("admitted")
        Provider.users["A"] = "former-steward@example.test"
        verify_routes("revoked")
        verify_routes("files-revoked", application_sessions)
        print("PASS: application file collections, gateway access, and revocation", flush=True)
        Provider.users["A"] = STEWARD
        print("PASS: canonical routes, legacy links, per-user default, Work gateway assets, and direct Platform access", flush=True)
        verify_routes("store")
        if store_only:
            browser_check.append("--store-only")
        if performance_only:
            browser_check.append("--performance-only")
        if managers_only:
            browser_check.append("--managers-only")
        if rel_only:
            browser_check.append("--rel-only")
        subprocess.run(browser_check, check=True)
        if store_only or performance_only or managers_only or rel_only:
            return
        for cookie, visible in [(member, False), (steward, True), ("", False)]:
            status, _, body = get("/workspace/home", cookie)
            assert status == 200
            assert ('href="/workspace/platform"' in body) == visible
            assert (' id="notes-platform-launch"' in body) == visible
            cards = body.split('data-group="workspaces"', 1)[1].split("</section>", 1)[0]
            assert ('href="/workspace/platform"' in cards) == visible
            assert 'href="/workspace/work"' in cards
            assert 'href="/life-board/' not in cards and 'view=platform' not in cards
            assert 'Work · Manage Versions' in body



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--store-only", action="store_true", help="Run the Store browser flows without the broader browser suite.")
    scope.add_argument("--home-tray", action="store_true", help="Verify the Home tray and operator resource access.")
    scope.add_argument("--performance-only", action="store_true", help="Run the Performance browser flows without the broader browser suite.")
    scope.add_argument("--system-work-performance", action="store_true", help="Enforce the packaged Work startup latency and exchange budgets.")
    scope.add_argument("--system-work-startup", action="store_true", help="Verify Work startup using the bundled Work browser and gateway.")
    scope.add_argument("--system-journeys", action="store_true", help="Verify the staged Home, Work and Shop together as one package.")
    scope.add_argument("--shop", action="store_true", help="Verify Shop launch, Temple sign-in and order workflow through both ingress hosts.")
    scope.add_argument("--formation-tools", action="store_true", help="Verify Formation guides for About, Assurance and Semantic Compiler.")
    scope.add_argument("--formation-desktop", action="store_true", help="Verify Formation's Home customization, steward, inventory and Game Zone exercises.")
    scope.add_argument("--formation-publications", action="store_true", help="Verify Formation's six publication preview exercises.")
    scope.add_argument("--formation-aster", action="store_true", help="Verify the staged Ask Aster conversation and cold reopen.")
    scope.add_argument("--workgarden", action="store_true", help="Verify Formation to Workgarden and cold reopen.")
    scope.add_argument("--formation", action="store_true", help="Verify signed-in Formation migration and the offline phone receipt.")
    scope.add_argument("--home-temple-startup", action="store_true", help="Verify signed-in Home with a delayed Temple connection.")
    scope.add_argument("--app-build", action="store_true", help="Check North River API, manual UI, guided replay and restart persistence.")
    scope.add_argument("--fixture-front-gate-csp", action="store_true",
                       help="Qualify the pinned countdown and startup under the loopback-only Home CSP grant.")
    scope.add_argument("--front-gate-only", action="store_true", help="Run the Front Gate and Service Manager browser flows.")
    scope.add_argument("--managers-only", action="store_true", help="Run the manager browser flows and file index access checks.")
    scope.add_argument("--catalogue-source", action="store_true", help="Verify a signed-in Catalogue source jump with the full release index.")
    scope.add_argument("--rel-only", action="store_true", help="Run the REL viewer and file index access checks.")
    scope.add_argument("--work-candidate", type=Path, help="Verify the signed-in Work route using a staged Work package.")
    scope.add_argument("--work-performance", type=Path, help="Measure signed-in Temple startup with a staged Work package.")
    scope.add_argument("--capacity", action="store_true", help="Measure fixed Home, Work and Mobile overlap.")
    scope.add_argument("--idle-bridge", action="store_true", help="Measure idle Work and Mobile bridge traffic.")
    scope.add_argument("--badge-bytes", action="store_true", help="Measure the Platform and Mobile badge deltas in a signed-in browser.")
    scope.add_argument("--assurance-bytes", action="store_true", help="Measure Mobile Assurance response bodies in a signed-in browser.")
    scope.add_argument("--workspace-streams", action="store_true", help="Verify direct Platform loading and the shared Temple connection.")
    scope.add_argument("--frontend-csp-policy", action="store_true", help="Report CSP admission for staged workspaces and standalone browser clients.")
    scope.add_argument("--frontend-wasm-journeys", action="store_true", help="Check staged CSP and exercise pinned Wasm with CSP enforced.")
    parser.add_argument("--rollback-work-package", type=Path, help="Previous standalone Work package for a first-rollout rollback rehearsal.")
    parser.add_argument("--rollback-package", type=Path, help="Rehearse a previous assured system package after the system journeys.")
    frontend_rollback = parser.add_mutually_exclusive_group()
    frontend_rollback.add_argument("--frontend-rollback-work", type=Path,
                        help="Use a previous standalone Work package for the loopback Home and Work Wasm rollback rehearsal.")
    frontend_rollback.add_argument("--frontend-rollback-package", type=Path,
                        help="Rehearse rollback to a retained system package using its bundled Home and Work runtimes.")
    parser.add_argument("--frontend-previous-clients", type=Path,
                        help="Use a verified retained package for standalone browser-client rollback.")
    parser.add_argument("--fixture-home-wasm-csp", action="store_true",
                        help="Include the approved loopback-only Home grant in the CSP preflight.")
    parser.add_argument("--candidate", type=Path, help="Run the focused regression against an intact AppDev Home release package.")
    parser.add_argument("--work-gateway-policy", type=Path, help="Use the managed standalone Work gateway policy in the performance probe.")
    parser.add_argument("--enforce-work-budget", action="store_true", help="Require sub-second Work startup and at most two exchanges at 100 and 200 ms.")
    parser.add_argument("--vm-terminal", type=Path, help="Also exercise Linux Dev through a private guest terminal provider.")
    parser.add_argument("--vm-display", type=Path, help="Also verify the running guest framebuffer and F1 over a display provider socket.")
    parser.add_argument("--vm-console", type=Path, help="Run only the VM Manager browser proof against a development guest's COM1 socket.")
    args = parser.parse_args()
    if args.vm_console:
        candidate = args.candidate.resolve(strict=True) if args.candidate else None
        if candidate:
            BINARY = candidate / "encounter"
            subprocess.run([BINARY, "check-package", candidate], check=True)
        packaged_work = candidate / "work" if candidate and os.environ.get("APPDEV_REGISTRY_STEWARD_PROOF") == "1" else None
        raise SystemExit(main(False, False, False, False, candidate=candidate, work_candidate=packaged_work,
                              vm_console=args.vm_console, vm_display=args.vm_display, vm_terminal=args.vm_terminal))
    frontend_csp_policy = args.frontend_csp_policy or args.frontend_wasm_journeys
    if args.fixture_front_gate_csp and not args.candidate:
        parser.error("--fixture-front-gate-csp requires a staged Home package")
    if args.frontend_previous_clients and not args.frontend_wasm_journeys:
        parser.error("--frontend-previous-clients requires --frontend-wasm-journeys")
    if os.environ.get("ENCOUNTER_ENFORCE_BROWSER_CSP") == "1":
        if os.environ.get("ENCOUNTER_VERIFY_BROWSER_WASM") != "1" or not args.candidate or not (
                args.front_gate_only or args.fixture_front_gate_csp or args.work_candidate or args.workspace_streams
                or args.home_temple_startup or frontend_csp_policy):
            parser.error("ENCOUNTER_ENFORCE_BROWSER_CSP=1 requires a staged candidate and a Wasm browser check")
    frontend_rollback_work = None
    if args.frontend_rollback_work:
        if not args.front_gate_only or args.candidate or os.environ.get("ENCOUNTER_VERIFY_BROWSER_WASM") != "1":
            parser.error("--frontend-rollback-work requires --front-gate-only and ENCOUNTER_VERIFY_BROWSER_WASM=1 with a generated Home fixture")
        frontend_rollback_work = args.frontend_rollback_work.resolve(strict=True)
        if (frontend_rollback_work / "browser-wasm.rel").exists():
            parser.error("The previous standalone Work package must predate the browser Wasm catalog")
        subprocess.run([frontend_rollback_work / "encounter", "check-package", frontend_rollback_work], check=True)
    system = (args.system_journeys or args.system_work_startup or args.system_work_performance
              or args.formation_aster or frontend_csp_policy)
    if args.fixture_home_wasm_csp and not args.frontend_csp_policy:
        parser.error("--fixture-home-wasm-csp requires --frontend-csp-policy")
    if frontend_csp_policy and not args.candidate:
        parser.error("--frontend-csp-policy requires a staged Home and Work package")
    if args.catalogue_source and not args.candidate:
        parser.error("--catalogue-source requires a staged release with the indexed excerpts")
    if args.candidate and not (args.home_tray or args.app_build or frontend_csp_policy or args.fixture_front_gate_csp or args.catalogue_source or args.front_gate_only or args.work_candidate or args.work_performance or args.rel_only or args.workspace_streams or args.assurance_bytes or args.badge_bytes or args.idle_bridge or args.capacity
                               or args.home_temple_startup or args.formation or args.shop
                               or args.formation_tools or args.formation_desktop or args.formation_publications or system):
        parser.error("--candidate requires a focused browser check")
    if args.app_build and not args.candidate:
        parser.error("--app-build requires a staged system package")
    if bool(args.work_gateway_policy) != bool(args.work_performance):
        parser.error("--work-gateway-policy and --work-performance require one another")
    if args.enforce_work_budget and not args.work_performance:
        parser.error("--enforce-work-budget requires --work-performance")
    candidate = args.candidate.resolve(strict=True) if args.candidate else None
    if candidate:
        if args.fixture_front_gate_csp and not (candidate / "browser-wasm.rel").is_file():
            parser.error("--fixture-front-gate-csp requires the pinned Home browser Wasm catalog")
        BINARY = candidate / "encounter"
        subprocess.run([BINARY, "check-package", candidate], check=True)
        if frontend_csp_policy and "APPDEV_RELEASE_RUNTIME" not in os.environ:
            RELEASE_RUNTIME = BINARY
    frontend_rollback_package = None
    frontend_receipts = {}
    frontend_previous_clients = None
    if args.frontend_previous_clients:
        frontend_previous_clients = args.frontend_previous_clients.resolve(strict=True)
        previous_runtime = frontend_previous_clients / "encounter"
        if (frontend_previous_clients == candidate or
                hashlib.sha256(previous_runtime.read_bytes()).digest() ==
                hashlib.sha256((candidate / "encounter").read_bytes()).digest()):
            parser.error("Standalone client rollback requires a distinct retained runtime")
        subprocess.run([previous_runtime, "check-package", frontend_previous_clients], check=True)
        receipt = frontend_previous_clients / "package-receipt.rel"
        frontend_receipts["previous-standalone"] = (frontend_previous_clients, hashlib.sha256(receipt.read_bytes()).hexdigest())
    if args.frontend_rollback_package:
        if not args.front_gate_only or candidate is None or os.environ.get("ENCOUNTER_VERIFY_BROWSER_WASM") != "1":
            parser.error("--frontend-rollback-package requires --front-gate-only, --candidate and ENCOUNTER_VERIFY_BROWSER_WASM=1")
        frontend_rollback_package = args.frontend_rollback_package.resolve(strict=True)
        if frontend_rollback_package == candidate:
            parser.error("Frontend rollback requires a distinct previous system package")
        for package in (candidate, candidate / "work"):
            if not (package / "browser-wasm.rel").is_file():
                parser.error(f"The candidate must include a browser Wasm catalog in {package}")
        previous = (frontend_rollback_package, frontend_rollback_package / "work")
        pinned = [(package / "browser-wasm.rel").is_file() for package in previous]
        if pinned[0] != pinned[1]:
            parser.error("The previous Home and Work packages must both be pinned or both predate Wasm")
        for label, package in zip(("candidate-home", "candidate-work", "previous-home", "previous-work"),
                                  (candidate, candidate / "work", *previous), strict=True):
            subprocess.run([package / "encounter", "check-package", package], check=True)
            frontend_receipts[label] = (package, hashlib.sha256((package / "package-receipt.rel").read_bytes()).hexdigest())
    if args.assurance_bytes or args.badge_bytes:
        if candidate is None:
            parser.error("The Assurance byte check requires a staged Home package")
        raise SystemExit(main(False, False, False, False, candidate=candidate,
                              assurance_bytes=args.assurance_bytes, badge_bytes=args.badge_bytes))
    if args.idle_bridge or args.capacity:
        if candidate is None or not (candidate / "work/package-receipt.rel").is_file():
            parser.error("This performance check requires a staged Encounter system package")
        raise SystemExit(main(False, False, False, False, candidate=candidate, work_candidate=candidate / "work",
                              system=True, measure_only=True, idle_bridge=args.idle_bridge, capacity=args.capacity))
    if system and candidate is None:
        parser.error("The system check requires a staged system package")
    rollback = args.rollback_package.resolve(strict=True) if args.rollback_package else None
    if rollback:
        if not args.system_journeys or rollback == candidate:
            parser.error("--rollback-package requires --system-journeys and a distinct assured package")
        for package in (candidate, rollback):
            subprocess.run([package / "encounter", "check-appdev-release", package], check=True)
    rollback_work = args.rollback_work_package.resolve(strict=True) if args.rollback_work_package else None
    if rollback_work:
        if not rollback:
            parser.error("--rollback-work-package requires the previous Home via --rollback-package")
        legacy_inputs = ("APPDEV_LEGACY_WORK_GATEWAY_POLICY",
                         "APPDEV_LEGACY_WORKGARDEN_RUNTIME", "APPDEV_LEGACY_WORKGARDEN_IMAGE")
        if not all(os.environ.get(key) for key in legacy_inputs):
            parser.error("Set " + ", ".join(legacy_inputs) + " for the first-rollout rehearsal")
        subprocess.run([rollback_work / "encounter", "check-package", rollback_work], check=True)
    work_package = (candidate / "work" if system or frontend_rollback_package else
                    (args.work_candidate or args.work_performance))
    work_candidate = work_package.resolve(strict=True) if work_package else None
    gateway_policy = args.work_gateway_policy.resolve(strict=True) if args.work_gateway_policy else None
    evidence = os.environ.get("APPDEV_SYSTEM_MEASUREMENTS")
    measurements = [] if evidence and args.system_journeys else None
    sample_count = 1
    if measurements is not None:
        policy = (candidate / "performance-policy.rel").read_text().splitlines()
        counts = [int(value) for row in policy if row.startswith("(")
                  for subject, property_name, value in [json.loads("[" + row[1:-1] + "]")]
                  if subject == "policy" and property_name == "journeySamples"]
        assert len(counts) == 1 and 3 <= counts[0] <= 10
        sample_count = counts[0]
    for sample in range(sample_count):
        report = {} if measurements is not None or (evidence and args.system_work_performance) else None
        main(args.store_only, args.performance_only, args.front_gate_only, args.managers_only, candidate, work_candidate,
             args.rel_only, args.workspace_streams, bool(args.work_performance or args.system_work_performance),
             gateway_policy, args.enforce_work_budget or args.system_work_performance,
             home_temple_startup=args.home_temple_startup, formation=args.formation or args.system_journeys or args.formation_aster,
             shop=args.shop or args.system_journeys, system=system, rollback=rollback, rollback_work=rollback_work,
             measurements=report, measure_only=sample > 0, workgarden=args.workgarden,
             formation_tools=args.formation_tools, formation_desktop=args.formation_desktop,
             formation_publications=args.formation_publications, formation_aster=args.formation_aster,
             frontend_rollback_work=frontend_rollback_work, frontend_rollback_package=frontend_rollback_package,
             catalogue_source=args.catalogue_source, frontend_csp_policy=frontend_csp_policy,
             fixture_home_wasm_csp=args.fixture_home_wasm_csp, frontend_wasm_journeys=args.frontend_wasm_journeys,
             frontend_previous_clients=frontend_previous_clients, app_build=args.app_build,
             fixture_front_gate_csp=args.fixture_front_gate_csp, home_tray=args.home_tray)
        if measurements is not None:
            measurements.append(report)
    if measurements is not None:
        (Path(evidence) / "journeys.json").write_text(json.dumps(measurements))
    if evidence and args.system_work_performance:
        (Path(evidence) / "work.json").write_text(json.dumps(report["work"]))
    if args.front_gate_only and candidate:
        sweep = Path(__file__).resolve().parent.parent / "sourcery-home" / "launch-sweep.mjs"
        report = timed_browser(["node", sweep, "--summary", candidate], "home" if evidence else None)
        if evidence:
            (Path(evidence) / "home.json").write_text(json.dumps(report))
    if frontend_receipts:
        for label, (package, digest) in frontend_receipts.items():
            subprocess.run([package / "encounter", "check-package", package], check=True)
            assert hashlib.sha256((package / "package-receipt.rel").read_bytes()).hexdigest() == digest, label
        print("PASS: Frontend rollback package receipts " +
              " ".join(f"{label}={digest}" for label, (_, digest) in frontend_receipts.items()), flush=True)
