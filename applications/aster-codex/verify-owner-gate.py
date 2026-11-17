"""Exercise the installed owner-gate location in isolated Nginx with a full Game Hub."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import socket
import subprocess
import tempfile
import time

class Gateway(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.paths.append(self.path)
        if self.headers.get("Cookie") != "fixture_session=owner":
            status = 303
        elif self.path == "/game/":
            status = 503
        elif self.path == "/game/styles.css":
            status = 200
        else:
            status = 404
        self.send_response(status)
        if status == 303:
            self.send_header("Location", "/identity")
        self.end_headers()

    def log_message(self, *_):
        pass

def read(url, cookie=None):
    headers = {} if cookie is None else {"Cookie": cookie}
    try:
        with urlopen(Request(url, headers=headers), timeout=4) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()

def verify(directory):
    installed = Path("/etc/nginx/snippets/sim-museum-appdev.conf").read_text()
    start = installed.index("location = /_sim_museum_game_access {")
    end = installed.index("\n}", start) + 2
    auth = installed[start:end]
    app = Path("/etc/nginx/snippets/aster-codex.conf").read_text()
    assert "auth_request /_sim_museum_game_access;" in app.split("location ^~ /aster-codex/ {", 1)[1].split("\n}", 1)[0]
    gateway = ThreadingHTTPServer(("127.0.0.1", 0), Gateway)
    gateway.paths = []
    Thread(target=gateway.serve_forever, daemon=True).start()
    nginx = None
    try:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        auth = auth.replace("127.0.0.1:24242", f"127.0.0.1:{gateway.server_port}")
        config = directory / "nginx.conf"
        config.write_text(f"""daemon off;
pid {directory}/nginx.pid;
error_log {directory}/error.log;
events {{}}
http {{
  access_log off;
  client_body_temp_path {directory}/client;
  proxy_temp_path {directory}/proxy;
  fastcgi_temp_path {directory}/fastcgi;
  uwsgi_temp_path {directory}/uwsgi;
  scgi_temp_path {directory}/scgi;
  server {{
    listen 127.0.0.1:{port};
    {auth}
    location @sim_museum_no_session {{ return 401; }}
    location = /aster-codex/ {{
      auth_request /_sim_museum_game_access;
      proxy_pass http://127.0.0.1:{gateway.server_port}/fixture-reader;
    }}
  }}
}}""")
        # A separate reader keeps admission distinct from the upstream Game Hub.
        class Reader(Gateway):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Private chat list fixture")
        reader = ThreadingHTTPServer(("127.0.0.1", 0), Reader)
        Thread(target=reader.serve_forever, daemon=True).start()
        config.write_text(config.read_text().replace(
            f"{gateway.server_port}/fixture-reader", f"{reader.server_port}/fixture-reader"))
        try:
            nginx = subprocess.Popen(["nginx", "-p", str(directory), "-c", str(config)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            origin = f"http://127.0.0.1:{port}"
            for _ in range(40):
                try:
                    read(origin + "/aster-codex/")
                    break
                except OSError:
                    if nginx.poll() is not None:
                        raise RuntimeError(nginx.stderr.read().decode())
                    time.sleep(.05)
            game = f"http://127.0.0.1:{gateway.server_port}"
            assert read(game + "/game/", "fixture_session=owner")[0] == 503
            assert read(origin + "/aster-codex/", "fixture_session=owner") == (200, b"Private chat list fixture")
            assert read(origin + "/aster-codex/")[0] == 401
            assert read(origin + "/aster-codex/", "fixture_session=other")[0] == 401
            assert gateway.paths.count("/game/") == 1, gateway.paths
            assert gateway.paths.count("/game/styles.css") == 4, gateway.paths
        finally:
            if nginx is not None:
                nginx.terminate()
                nginx.wait(timeout=5)
            reader.shutdown()
            reader.server_close()
    finally:
        gateway.shutdown()
        gateway.server_close()

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="aster-owner-gate-", dir=Path.home()) as directory:
        verify(Path(directory))
    print("PASS: owner opens Aster at Game Hub capacity, anonymous and non-owner requests are denied.")
