import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

function send(port, method, headers, chunks = [], route = "/login") {
  return new Promise((resolve, reject) => {
    const call = request({ hostname: "127.0.0.1", port, path: route, method, headers }, async response => {
      try {
        const body = [];
        for await (const chunk of response) body.push(chunk);
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(body) });
      } catch (error) { reject(error); }
    });
    call.once("error", reject);
    for (const chunk of chunks) call.write(chunk);
    call.end();
  });
}

test("directory scopes preview transport and streams request and response bodies", async t => {
  let received;
  const fixture = createServer(async (request, response) => {
    const body = [];
    for await (const chunk of request) body.push(chunk);
    received = { headers: request.headers, body: Buffer.concat(body) };
    response.writeHead(303, {
      Location: `http://127.0.0.1:${fixture.address().port}/next`,
      "Set-Cookie": ["session=demo; Domain=127.0.0.1; HttpOnly; Path=/", "external=other; Domain=example.com"],
    });
    response.write("test");
    response.end(" body");
  }).listen(0, "127.0.0.1");
  await once(fixture, "listening");
  t.after(() => new Promise(resolve => fixture.close(resolve)));

  const source = mkdtempSync(path.join(tmpdir(), "encounter-directory-test-"));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  for (const file of ["directory.rel", "directory.encounter", "front-gate.css", "front-gate.js"]) {
    cpSync(new URL("../../applications/front-gate/" + file, import.meta.url), path.join(source, file));
  }
  writeFileSync(path.join(source, "services.encounter"),
    `process-module "temple/surface-process-module/1"\n\nprocess gate.apps:\n  let result = list({ id = "app"; name = "Test"; group = "Tests"; detail = "Fixture"; port = ${fixture.address().port}; readOnlyPaths = list("/login", "/decompiler/benchmark"); postPaths = list("/verify", "/decompiler/benchmark-action") })\n`);

  const child = spawn(process.env.ENCOUNTER_RUST_HOST, ["directory", source, "directory.rel", "0"], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = once(child, "exit");
  t.after(async () => { if (child.exitCode === null) child.kill(); await exited; });
  const lines = createInterface({ input: child.stdout });
  const [ready] = await once(lines, "line", { signal: AbortSignal.timeout(5000) });
  const port = Number(new URL(ready.replace("Encounter ", "")).port);
  const host = `app.localhost:${port}`;
  const origin = "http://" + host;
  const directory = await send(port, "GET", { Host: `localhost:${port}` }, [], "/");
  assert.equal(directory.status, 200);
  const status = JSON.parse(directory.body);
  assert.equal(status.schema, "encounter/front-gate-status/1");
  assert.deepEqual(status.services, [{ id: "app", name: "Test", group: "Tests", detail: "Fixture", online: true }]);
  assert.deepEqual(status.units.map(group => group.scope), ["system", "user"]);
  assert.deepEqual(status.timers.map(group => group.scope), ["system", "user"]);
  const response = await send(port, "POST", {
    Host: host, Origin: origin, Referer: origin + "/login", Authorization: "Basic demo",
    "X-Forwarded-Host": "untrusted.test",
  }, [Buffer.from([0, 255]), Buffer.from([5, 128])]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, origin + "/next");
  assert.deepEqual(response.headers["set-cookie"], ["session=demo; HttpOnly; Path=/"]);
  assert.equal(response.body.toString(), "test body");
  assert.deepEqual(received.body, Buffer.from([0, 255, 5, 128]));
  const backend = `127.0.0.1:${fixture.address().port}`;
  assert.equal(received.headers.host, backend);
  assert.equal(received.headers.origin, "http://" + backend);
  assert.equal(received.headers.referer, "http://" + backend + "/login");
  assert.equal(received.headers.authorization, "Basic demo");
  assert.equal(received.headers["x-forwarded-host"], undefined);

  received = undefined;
  const refusal = await send(port, "POST", { Host: host, Origin: `http://other.localhost:${port}` });
  assert.equal(refusal.status, 403);
  assert.equal(received, undefined);

  const browserPort = "localhost:57379";
  const direct = await send(port, "GET", {
    Host: browserPort, Cookie: "session=front-gate", Authorization: "Basic demo",
  });
  assert.equal(direct.status, 303);
  assert.equal(direct.headers["set-cookie"], undefined);
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.authorization, undefined);
  received = undefined;
  const write = await send(port, "POST", { Host: browserPort });
  assert.equal(write.status, 405);
  assert.equal(received, undefined);

  const alias = "/verify";
  assert.equal((await send(port, "GET", { Host: browserPort }, [], alias)).status, 405);
  assert.equal((await send(port, "POST", { Host: browserPort }, [], alias)).status, 403);
  assert.equal((await send(port, "POST", { Host: browserPort, Origin: "http://other.localhost" }, [], alias)).status, 403);
  const accepted = await send(port, "POST", { Host: browserPort, Origin: "http://" + browserPort,
    Cookie: "session=front-gate", Authorization: "Basic demo" }, [], alias);
  assert.equal(accepted.status, 303);
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.authorization, undefined);
  const benchmark = await send(port, "GET", { Host: browserPort }, [],
    "/decompiler/benchmark?action=feedback&job=experiment.fixture");
  assert.equal(benchmark.status, 303);
  assert.equal((await send(port, "GET", { Host: browserPort }, [], "/decompiler/benchmark-action")).status, 405);
  const benchmarkAction = await send(port, "POST", { Host: browserPort, Origin: "http://" + browserPort }, [],
    "/decompiler/benchmark-action?case=regression");
  assert.equal(benchmarkAction.status, 303);
});
