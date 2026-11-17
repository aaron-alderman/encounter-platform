import datetime, re, base64, hashlib, http.client, json, os, socketserver, sqlite3, struct, subprocess, sys, tempfile, threading, time
from pathlib import Path
from urllib.parse import urlencode

chat="00000000-0000-0000-0000-000000000101"
turn="00000000-0000-0000-0000-000000000201"
other="00000000-0000-0000-0000-000000000202"
token=os.urandom(32).hex()
delta=threading.Event()
stopped=threading.Event()
interrupts=[]
starts=[]
active=threading.Event()

class Desktop(socketserver.StreamRequestHandler):
    def handle(self):
        lines={}
        while line:=self.rfile.readline().strip():
            if b":" in line:
                name,value=line.split(b":",1)
                lines[name.lower()]=value.strip()
        accept=base64.b64encode(hashlib.sha1(lines[b"sec-websocket-key"]+b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest())
        self.wfile.write(b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: "+accept+b"\r\n\r\n")
        def send(value):
            b=json.dumps(value).encode()
            h=bytes([129,len(b)]) if len(b)<126 else bytes([129,126])+struct.pack("!H",len(b))
            self.wfile.write(h+b)
        def next_request():
            h=self.rfile.read(2)
            if not h: return None
            n=h[1]&127
            if n==126: n=int.from_bytes(self.rfile.read(2),"big")
            mask=self.rfile.read(4)
            return json.loads(bytes(c^mask[i%4] for i,c in enumerate(self.rfile.read(n))))
        while (r:=next_request()):
            m=r.get("method"); i=r.get("id")
            if i is None: continue
            thread={"id":chat,"status":{"type":"active" if active.is_set() else "idle"}}
            result={
                "initialize":{},
                "thread/read":{"thread":thread},
                "thread/list":{"data":[thread]},
                "thread/resume":{"thread":thread},
                "thread/turns/list":{"data":[{"id":turn,"status":"inProgress"}]},
                "turn/start":{"turn":{"id":turn,"status":"inProgress"}},
                "turn/interrupt":{},
            }.get(m)
            if m=="turn/start":
                starts.append(r["params"]); active.set()
            if m=="turn/interrupt":
                interrupts.append(r["params"])
                stopped.set()
            if result is None: raise AssertionError(m)
            send({"id":i,"result":result})
            if m=="thread/resume" and active.is_set():
                assert delta.wait(12)
                send({"method":"item/agentMessage/delta","params":{"threadId":chat,
                    "itemId":"fixture","turnId":turn,"delta":"first <b>live</b> token"}})
                assert stopped.wait(12)
                send({"method":"turn/completed","params":{"threadId":chat,"turn":{"id":turn,"status":"interrupted"}}})
                return

def main():
    with tempfile.TemporaryDirectory(prefix=".ac-live-",dir=Path.home()) as raw:
        root=Path(raw)
        (root/"app-server-control").mkdir()
        db=sqlite3.connect(root/"state_5.sqlite")
        db.execute("""create table threads(id, name, title, first_user_message, rollout_path, archived,
          creator_account_id, source, thread_source, recency_at_ms integer, updated_at_ms integer, updated_at integer)""")
        file=root/"sessions"/"fixture.jsonl"
        file.parent.mkdir()
        def complete_at(stamp):
            with file.open("a") as log:
                log.write(json.dumps({"type":"event_msg","timestamp":stamp,"payload":{"type":"task_complete"}})+"\n")
        complete_at("2020-01-01T00:00:00Z")
        db.execute("insert into threads values(?,?,?,?,?,?,?,?,?,?,?,?)",(chat,None,"Fixture",None,str(file),0,"owner","vscode","user",1000,1000,1))
        db.commit();db.close()
        config=root/"config.json"
        config.write_text(json.dumps({"account":"owner","admission":token,"previews":{}}))
        host=socketserver.ThreadingUnixStreamServer(str(root/"app-server-control/app-server-control.sock"),Desktop)
        host.daemon_threads=True
        threading.Thread(target=host.serve_forever,daemon=True).start()
        app=subprocess.Popen([sys.argv[1],"aster-codex",str(root),str(root),"24417",str(config)],stdout=subprocess.DEVNULL,env=dict(os.environ,STATE_DIRECTORY=str(root)))
        def call(method,path,fields=None,origin=None,permit=True):
            c=http.client.HTTPConnection("127.0.0.1",24417,timeout=12)
            headers={"X-Aster-Codex-Admission":token} if permit else {}
            if origin:headers.update({"Origin":origin,"Content-Type":"application/x-www-form-urlencoded"})
            c.request(method,path,urlencode(fields) if fields else None,headers)
            return c,c.getresponse()
        def get(path):
            connection,response=call("GET",path)
            status,content=response.status,response.read()
            connection.close()
            assert status==200,status
            return content
        root_route="/aster-codex/"
        chat_route="/aster-codex/chat?id="+chat
        running=b"data-badge='running'"
        finished=b"data-badge='finished'"
        try:
            time.sleep(.5)
            initial=get(root_route)
            assert running not in initial and finished not in initial and b"aster-unread" not in initial
            assert (root/"seen.json").exists()
            active.set()
            time.sleep(3.1)
            active_page=get(root_route)
            assert running in active_page and b" Running</span>" in active_page
            active.clear()
            complete_at(datetime.datetime.now(datetime.timezone.utc).isoformat())
            time.sleep(3.1)
            combined=get(root_route)
            assert finished in combined and b"1 unread reply" in combined
            assert "Finished · unread</span>".encode() in combined
            active.set()
            time.sleep(3.1)
            combined=get(root_route)
            assert running in combined and b"1 unread reply" in combined
            active.clear()
            time.sleep(3.1)
            get(chat_route+"&before=1")
            assert finished in get(root_route)
            assert finished not in get(chat_route)
            final=get(root_route)
            assert finished not in final and b"aster-unread" not in final
            assert chat in json.loads((root/"seen.json").read_text())["chats"]
            print("PASS: initial chats seen, running displayed, completion unread, notification survives another active turn and clears only when latest opens.")
        finally:
            app.terminate();app.wait(timeout=10)
            host.shutdown();host.server_close()
if __name__=="__main__": main()
