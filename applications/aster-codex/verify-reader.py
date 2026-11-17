"""Exercise Encounter's reader against disposable data and a real mobile browser."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, urlopen
import json
import os
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import time

class Links(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.hrefs = []
        self.labelled = {}
        self.current = None
        self.feed(html)

    def handle_starttag(self, name, attrs):
        if name == "a":
            self.current = (dict(attrs).get("href"), [])
            if self.current[0]:
                self.hrefs.append(self.current[0])

    def handle_data(self, data):
        if self.current:
            self.current[1].append(data)

    def handle_endtag(self, name):
        if name == "a" and self.current:
            href, text = self.current
            if href:
                self.labelled["".join(text).strip()] = href
            self.current = None

def fetch(url, token=None):
    headers = {"X-Aster-Codex-Admission": token} if token else {}
    try:
        response = urlopen(Request(url, headers=headers), timeout=12)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

def main():
    state, binary = map(Path, sys.argv[1:3])
    with tempfile.TemporaryDirectory(prefix="aster-codex-test-", dir=state) as tmp:
        test = Path(tmp)
        for name in ["sessions", "archived_sessions", "attachments", "generated_images", "visualizations"]:
            (test/name).mkdir()
        db = sqlite3.connect(test/"state_5.sqlite")
        db.execute("""CREATE TABLE threads(id text, rollout_path text, creator_account_id text,
            source text, thread_source text, name text, title text, first_user_message text,
            recency_at_ms integer, updated_at_ms integer, updated_at integer, archived integer)""")
        chat = "00000000-0000-0000-0000-000000000123"
        other = "00000000-0000-0000-0000-000000000124"
        legacy = "00000000-0000-0000-0000-000000000125"
        for i in range(30):
            db.execute("insert into threads values(?,?,?,?,?,?,?,?,?,?,?,?)", (
                f"00000000-0000-0000-1111-{i:012d}", "unavailable", "owner", "exec", "user", None,
                f"Fixture search {i}", "", 1000+i, 1000, 1, 0))
        file = test/"sessions/chat.jsonl"
        archived = test/"archived_sessions/legacy.jsonl"
        for identifier, path, account, title, when, archive in [
            (chat,file,"owner","Reader assurance",5000,0),
            (other,file,"other","OTHER_ACCOUNT",6000,0),
            (legacy,archived,"owner","Archived sample",5500,1)]:
            db.execute("insert into threads values(?,?,?,?,?,?,?,?,?,?,?,?)", (
                identifier,str(path),account,"vscode","user",None,title,"",when,when,1,archive))
        db.commit()
        db.close()
        def event(kind, payload):
            return json.dumps({"type":kind,"timestamp":"2026-11-15T00:00:00Z","payload":payload}).encode() + b"\n"
        def message(text, kind="AgentMessage"):
            return event("event_msg",{"type":"item_completed","item":{"type":kind,
                "content":[{"type":"text","text":text}]}})
        preview = test/"visualizations"/"preview.html"
        preview.write_text("<script>alert('fixture')</script>")
        with file.open("wb") as out:
            out.write(event("session_meta",{"history_mode":"paginated"}))
            for i in range(101):
                out.write(message(f"fixture-message-{i:03d}"))
            out.write(message("server progress", "UserMessage"))
            out.write(message("""### Markdown fixture

A **bold** and *emphasized* paragraph with `inline code`.

> Quoted content

- One item
- Second item

| Result | Value | Notes |
| :-- | --: | :--: |
| Alpha | 42 | **Pass** |
| Beta | 7 | `review` |

[Example link](https://example.com/docs?one=two&three=four)
[Unsafe link](javascript:alert%281%29)

```text
A very long literal line without markdown: *preserved*
```
"""))
            out.write(message(f"<script>window.testInjection=1</script>\n[preview]({preview})\n"
                "http://127.0.0.1:9999/example\nhttp://localhost:9998/registered"))
            out.write(event("event_msg", {"type":"item_completed","item":{"type":"UserMessage","content":[{
                "type":"image","image_url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"}]}}))
            out.write(b'{"incomplete":')
        archived.write_bytes(event("session_meta",{"history_mode":"legacy"}) +
            event("response_item",{"type":"message","role":"assistant","content":[{"type":"output_text","text":"legacy transcript"}]}))
        token = secrets.token_hex(32)
        config = test/"config.json"
        config.write_text(json.dumps({"account":"owner", "admission":token,
            "previews":{"http://localhost:9998/registered":"/game/registered"}}))
        port = 24412
        url = f"http://127.0.0.1:{port}"
        root = url+"/aster-codex/"
        app = subprocess.Popen([str(binary),"aster-codex",str(test),str(test),str(port),str(config)],
            stdout=subprocess.DEVNULL)
        try:
            def get(href, expected=200):
                status, headers, body = fetch(url+href,token)
                assert status == expected, (href,status,expected)
                assert "no-store" in headers.get("Cache-Control","")
                return body
            for _ in range(30):
                try:
                    assert fetch(root)[0] == 404
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError("Encounter reader did not start")
            assert fetch(root,"f"*64)[0] == 404
            index = get("/aster-codex/")
            assert b"Reader assurance" in index and b"OTHER_ACCOUNT" not in index
            older_index = Links(index.decode()).labelled["Older chats"]
            assert b"Fixture search 0" in get(older_index)
            assert b"Archived sample" in get("/aster-codex/?archived=1")
            assert b"Fixture search 12" in get("/aster-codex/?q=search+12")
            get("/aster-codex/chat?id="+other,404)
            assert b"legacy transcript" in get("/aster-codex/chat?id="+legacy)
            href = "/aster-codex/chat?id="+chat
            latest = get(href)
            assert b"id='chat-list'" in latest and b"id='conversation'" in latest
            assert b"aria-current='true'><strong><code>Reader assurance</code></strong>" in latest
            assert b"<strong><code>Fixture search 29</code></strong>" in latest
            search = get(href+"&q=search+29")
            assert b"Fixture search 29" in search and b"Fixture search 28" not in search
            assert b"Reader assurance" in search and b"fixture-message-100" in search
            next_list = Links(latest.decode()).labelled["Older chats"]
            older_results = get(next_list)
            assert b"Fixture search 0" in older_results and b"fixture-message-100" in older_results
            selected_older = Links(latest.decode()).labelled["Older messages"]
            stateful_older = Links(get(selected_older+"&q=search+29").decode()).labelled["Older messages"]
            assert parse_qs(urlsplit(stateful_older).query)["q"] == ["search 29"]
            assert b"window.testInjection" in latest and b"<script>" not in latest
            assert b"<h3>Markdown fixture</h3>" in latest and b"<strong>bold</strong>" in latest
            assert b"class='sourcery-data-table' data-table-layout='grid'" in latest
            assert b"<th scope='col' data-align='right'>Value</th>" in latest
            assert b"<td data-align='right'>42</td>" in latest
            assert b"<pre><code class=\"language-text\">" in latest
            assert b"href='https://example.com/docs?one=two&amp;three=four'" in latest
            assert b"javascript:" not in latest
            style = get("/aster-codex/markdown.css")
            assert b".aster-markdown-link" in style and b"pointer:coarse" in style

            assert b"Server-only preview" in latest and b"/game/registered" in latest
            assert b"fixture-message-000" not in latest
            artifacts = list(dict.fromkeys(h for h in Links(latest.decode()).hrefs if "/artifact?" in h))
            assert len(artifacts) == 2
            for h in artifacts:
                assert fetch(url+h)[0] == 404
            assert get(artifacts[0]) == preview.read_bytes()
            assert get(artifacts[1]).startswith(b"\x89PNG\r\n\x1a\n")
            assert get(artifacts[1].replace(chat,other),404)
            assert get(artifacts[1].replace("&part=0","&part=9"),404)
            seen = []
            while True:
                body = get(href).decode()
                seen.extend(i for i in range(101) if f"fixture-message-{i:03d}" in body)
                href = Links(body).labelled.get("Older messages")
                if not href: break
            assert sorted(seen) == list(range(101))
            stamp = int(parse_qs(urlsplit(artifacts[1]).query)["event"][0])
            get(artifacts[1].replace(f"event={stamp}",f"event={stamp+1}"),404)
            print("Fixture passed: search, archive, 101-message paging, partial write, image, export, preview policy, cross-account and injected HTML")
            environment = dict(os.environ, ASTER_QA_ORIGIN=url, ASTER_QA_TOKEN=token, ASTER_QA_CHAT=chat, ASTER_QA_ROLLOUT=os.environ.get("ASTER_QA_ROLLOUT",""))
            subprocess.run(["node",str(Path(__file__).with_name("verify-mobile.mjs"))],check=True,env=environment)
        finally:
            app.terminate()
            app.wait(timeout=10)

if __name__ == "__main__":
    main()
