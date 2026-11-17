import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";
import { decode } from "../../../applications/encounter-runtime/test/rel-values.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(directory, "../../../..");
const { chromium } = await import(path.join(workspace, "env/browser-tools/node_modules/playwright/index.mjs"));
const chrome = JSON.parse(fs.readFileSync(path.join(workspace, "env/chrome-profile.json"), "utf8")).executable;
const binary = process.env.ENCOUNTER_RUST_HOST;

function facts(file, rows) {
  fs.writeFileSync(file, rows.map(row => "(" + row.map(value => JSON.stringify(String(value))).join(", ") + ")").join("\n") + "\n", { mode: 0o600 });
}

async function launch(args, executable = binary) {
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "inherit"] });
  const done = new Promise(resolve => child.once("close", resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Encounter startup timed out")), 15000);
      child.once("error", reject);
      child.once("exit", () => { clearTimeout(timer); reject(Error("Encounter exited during startup")); });
      child.stdout.on("data", chunk => {
        const match = /Encounter http:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString());
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    return { port, close: async () => { child.kill(); await done; } };
  } catch (error) {
    child.kill();
    await done;
    throw error;
  }
}

function hop(request, port) {
  return { hostname: "127.0.0.1", port, path: request.url, method: request.method, headers: request.headers };
}

function readFacts(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse("[" + line.slice(1, -1) + "]"));
}

function postStatus(url) {
  const { host, port, pathname } = new URL(url);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "127.0.0.1", port, path: pathname, method: "POST",
      headers: { Host: host }, rejectUnauthorized: false,
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject);
    request.end();
  });
}

async function verifyStages(page, url, previewOrigin, signIn) {
  const editor = url + "?task=primary&work=1&view=scenario";
  assert.equal((await page.goto(editor + "&step=4")).status(), 403);
  signIn();
  await page.goto(editor + "&step=4");
  const checks = [
    { step: 4, actor: "Recipient manager", account: "stage-recipient-manager", approved: 120, pending: true },
    { step: 5, actor: "Unrelated employee", account: "demo-sam", approved: 0, absent: true },
    { step: 6, actor: "Affected employee", account: "demo-maya", approved: 90 },
  ];
  for (const { step, actor, account, approved, pending, absent } of checks) {
    await page.getByRole("link", { name: new RegExp("^Step " + step + " ·") }).click();
    const link = page.getByRole("link", { name: "Open in staged app" });
    await link.waitFor();
    assert.equal(await page.locator(".nr-ed-preview, .nr-ed-stage-screen fieldset").count(), 0);
    await page.getByRole("table", { name: "Expected and observed" }).waitFor();
    await page.getByRole("button", { name: "Accept for handoff" }).waitFor();
    await page.getByRole("link", { name: "Request changes" }).waitFor();
    await link.click();
    await page.getByRole("heading", { name: "Sick leave", exact: true }).waitFor();
    const staged = new URL(page.url());
    assert.equal(staged.origin, previewOrigin);
    assert.match(staged.pathname, new RegExp("/stage-[a-f0-9]{64}-" + step + "/sick-leave$"));
    const chrome = page.getByRole("banner");
    await chrome.getByRole("link", { name: /North River/ }).waitFor();
    await chrome.getByRole("link", { name: "Add comment" }).waitFor();
    assert.equal(await page.locator("main").getByRole("link", { name: "Add comment" }).count(), 0);
    const checkScreen = async () => {
      await page.getByText("Step " + step + " - " + actor + " · Read-only staging", { exact: true }).waitFor();
      await page.getByText("Approved sick-leave minutes: " + approved, { exact: true }).waitFor();
      assert.equal(await page.getByText(/E-101 · 2026-11-12/).count(), absent ? 0 : 1);
      assert.equal(await page.getByText("Reduction to 90 minutes awaiting employee approval", { exact: true }).count(), pending ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "Approve reduction" }).count(), 0);
    };
    await checkScreen();
    const stagedResponse = await page.reload();
    assert.match((await stagedResponse.allHeaders())["content-security-policy"], /form-action 'none'/);
    assert.equal(await page.locator("main > .pilot-stage-content").count(), 0);
    assert.equal(page.url(), staged.href);
    await checkScreen();
    await page.getByRole("link", { name: "Timesheet", exact: true }).click();
    assert.equal(page.url(), staged.href.replace(/sick-leave$/, "timesheet"));
    await page.getByText("Signed in as " + account, { exact: true }).waitFor();
    await page.locator("main").getByRole("link", { name: "Sick leave", exact: true }).click();
    await checkScreen();
    const denied = await postStatus(staged.href);
    assert.equal(denied, 405);
    await page.getByRole("link", { name: "Back to the editor" }).click();
    assert.equal(new URL(page.url()).searchParams.get("step"), String(step));
    assert.equal(await page.getByRole("link", { name: new RegExp("^Step " + step + " ·") }).getAttribute("aria-current"), "step");
    console.log("PASS staged step " + step + " as " + account + ", including reload, navigation and return");
  }
  for (const legacy of ["&view=screen", "&pane=surface&scene=propose"]) {
    await page.goto(url + "?task=primary&work=1" + legacy);
    await page.getByRole("link", { name: "Scenario", exact: true }).waitFor();
    assert.equal(await page.locator(".nr-preview, .nr-ed-preview").count(), 0);
  }
  await page.goto(editor + "&step=999");
  await page.getByText("Scenario step unavailable for this run.", { exact: true }).waitFor();
  await page.goto(editor + "&step=4&scenario=stale");
  await page.getByText("Scenario run unavailable for this draft and attempt.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Open in staged app" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Accept for handoff" }).count(), 0);
  const unavailable = await page.goto(previewOrigin + "/encounter-pilot/stage-unknown/sick-leave");
  assert.equal(unavailable.status(), 404);
  await page.getByText("Staged app unavailable.", { exact: false }).waitFor();
  console.log("PASS stale stage and editor links are unavailable");
  await page.goto(previewOrigin + "/encounter-pilot/approval");
  await page.getByRole("heading", { name: "Demo approval receipt" }).waitFor();
  assert.equal(await page.locator(".pilot-stage").count(), 0);
  console.log("PASS the approved read-only demo still opens independently");
}

async function verifyCommentPacket(page, url, database, hasReport) {
  const base = url + "?task=primary&work=1";
  const comments = page.frameLocator('iframe[title="Context comments"]');
  await page.goto(base);
  await page.getByRole("link", { name: "Open read-only preview" }).click();
  await page.getByRole("heading", { name: "Timesheet", exact: true }).waitFor();
  const chrome = page.getByRole("banner");
  await chrome.getByRole("link", { name: /North River/ }).waitFor();
  await chrome.getByRole("link", { name: "Back to live Project home" }).waitFor();
  await chrome.getByRole("link", { name: "Add comment" }).waitFor();
  assert.equal(await page.locator("main").getByRole("link", { name: "Add comment" }).count(), 0);
  if (process.env.ENCOUNTER_UI_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.ENCOUNTER_UI_SCREENSHOTS, "timesheet-review-toolbar.png") });
  }
  await page.getByRole("region", { name: "Your entries" }).waitFor();
  assert.equal(await page.locator("main > .pilot-stage-content").count(), 0);
  assert.equal(await page.locator("main form").first().getAttribute("action"), "/");
  const preview = new URL(page.url());
  const redirected = await page.goto(preview.origin + "/encounter-pilot/timesheet?review-task=primary");
  assert.equal(page.url(), preview.href);
  assert.match((await redirected.allHeaders())["content-security-policy"], /form-action 'none'/);
  assert.equal(await postStatus(preview.href), 405);
  if (hasReport) {
    const report = preview.origin + "/encounter-pilot/report-preview/report";
    await page.goto(preview.origin + "/encounter-pilot/report?review-task=primary&employee=E-101");
    assert.equal(page.url(), report + "?review-task=primary&employee=E-101");
    await page.getByRole("heading", { name: "Timesheet report" }).waitFor();
    await chrome.getByRole("link", { name: "Request changes" }).waitFor();
    assert.equal(await page.locator("main").getByRole("link", { name: "Add comment" }).count(), 0);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.waitForURL(report + "?**");
    assert.equal(new URL(page.url()).searchParams.get("employee"), "E-101");
    assert.equal(await postStatus(report), 405);
    await chrome.getByRole("link", { name: "Add comment" }).click();
    await comments.getByText("Read-only Timesheet report", { exact: true }).waitFor();
    await page.goto(preview.href);
  }
  await page.getByRole("link", { name: /^Correct / }).first().click();
  await page.getByRole("heading", { name: "Correct entry" }).waitFor();
  const entry = new URL(page.url()).searchParams.get("entry");
  assert.equal(new URL(page.url()).searchParams.get("review-task"), "primary");
  await page.getByRole("link", { name: "Add comment" }).click();
  const context = comments.getByLabel("Context", { exact: true });
  await context.waitFor();
  assert.equal(await context.inputValue(), entry);
  await comments.getByRole("textbox", { name: "Comment", exact: true }).fill("Clarify the entry label in the read-only preview.");
  await comments.getByRole("button", { name: "Stage comment" }).click();
  await comments.getByText("Clarify the entry label in the read-only preview.", { exact: true }).waitFor();
  await page.goto(base + "&view=scenario&step=4");
  await page.getByRole("link", { name: "Open in staged app" }).click();
  if (process.env.ENCOUNTER_UI_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.ENCOUNTER_UI_SCREENSHOTS, "staged-review-toolbar.png") });
  }
  const scenarios = page.getByRole("banner").getByRole("navigation", { name: "Scenarios", exact: true });
  const scenario = scenarios.getByRole("link", { name: "Exercise separate sessions" });
  assert.equal(await scenario.getAttribute("aria-current"), "page");
  const steps = page.getByRole("navigation", { name: "Scenario steps" });
  await steps.getByRole("link", { name: "Step 6 - Affected employee" }).click();
  await page.getByText("Approved sick-leave minutes: 90", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Add comment" }).click();
  await comments.getByLabel("Context", { exact: true }).selectOption({ label: "Confirm reduction" });
  await comments.getByRole("textbox", { name: "Comment", exact: true }).fill("Show that the reduction proposal was cleared.");
  await comments.getByRole("button", { name: "Stage comment" }).click();
  await comments.getByText("Scenario step 6 · Sick leave · Affected employee · Confirm reduction", { exact: true }).waitFor();
  await comments.getByText("Show that the reduction proposal was cleared.", { exact: true }).waitFor();
  const accepting = process.env.ENCOUNTER_TEST_ACCEPT === "1";
  if (accepting) {
    await page.getByRole("link", { name: "Review and approve" }).click();
    await page.getByRole("button", { name: "Accept with comments" }).click();
  } else {
    await page.getByRole("link", { name: "Request changes" }).click();
    const packet = page.getByRole("region", { name: "Request changes" });
    assert.equal(await packet.getByRole("listitem").count(), 2);
    await packet.getByRole("button", { name: "Send change requests" }).click();
  }
  const expected = accepting ? "accepted" : "returned";
  await page.getByRole("region", { name: "Current decision" }).getByRole("status").filter({ hasText: new RegExp(expected, "i") }).waitFor();
  const store = new DatabaseSync(database, { readOnly: true });
  try {
    const reviews = store.prepare("SELECT text FROM documents WHERE revision=(SELECT max(id) FROM revisions) AND path LIKE 'implementation-reviews/%'").all()
      .map(row => decode(row.text, "NorthRiverImplementationReview"));
    const review = reviews.find(row => row.state === expected && row.decision?.subpackets?.length === 2);
    assert.ok(review, "Expected two individual review subpackets");
    assert.equal(review.decision.draft, createHash("sha256").update(review.result.diff).digest("hex"));
    assert.equal(review.decision.run, review.start.operation);
    assert.equal(review.decision.subpackets[0].context.kind, "preview");
    assert.equal(review.decision.subpackets[0].context.route, "/timesheet");
    assert.equal(review.decision.subpackets[0].context.entry, entry);
    assert.equal(review.decision.subpackets[0].context.revision, 17);
    assert.equal(review.decision.subpackets[1].context.step, 6);
    assert.equal(review.decision.subpackets[1].context.route, "/sick-leave");
    assert.equal(review.decision.subpackets[1].context.revision, 22);
    assert.equal(review.decision.subpackets[1].context.subject.id, "confirm");
  } finally { store.close(); }
  console.log("PASS native Timesheet preview, scenario navigation, and " + expected + " packet with both contexts");
}

async function main() {
  const deployed = Object.fromEntries(readFacts(process.argv[2])
    .filter(([subject]) => subject === "preview").map(([, field, value]) => [field, value]));
  const stageRelease = process.argv[3];
  const stageProcesses = [];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "encounter-pilot-test-"));
  const ownerEmail = "pilot@example.test";
  const session = "src_session_" + randomBytes(32).toString("base64url");
  const otherSession = "src_session_" + randomBytes(32).toString("base64url");
  const token = Buffer.from("north-river-owner:" + randomBytes(32).toString("hex")).toString("base64");
  const operatorFile = path.join(directory, "operators.rel");
  fs.writeFileSync(operatorFile, [
    ["operators", "version", "encounter/operators/1"],
    ["north-river-owner", "role", "author"],
    ["north-river-owner", "basicSha256", createHash("sha256").update(token).digest("hex")],
    ["north-river-agent", "role", "proposer"],
    ["north-river-agent", "basicSha256", randomBytes(32).toString("hex")],
  ].map(row => "(" + row.map(value => JSON.stringify(value)).join(", ") + ")").join("\n") + "\n", { mode: 0o600 });
  let browser, live, tls, provider, page, gateway;
  try {
    const image = stageRelease ? path.resolve(stageRelease, "editor-image.rel") : path.join(directory, "app.rel");
    const pin = stageRelease ? createHash("sha256").update(fs.readFileSync(image)).digest("hex")
      : execFileSync(binary, ["build", path.join(workspace, "projects/applications"), "north-river/application.rel", image], { encoding: "utf8" }).trim();
    if (stageRelease) {
      const source = new DatabaseSync(path.resolve(process.argv[4]), { readOnly: true });
      try { await backup(source, path.join(directory, "workspace.sqlite")); }
      finally { source.close(); }
    }
    const liveLaunch = path.join(directory, "live.rel");
    facts(liveLaunch, Object.entries({
      version: "encounter/launch/1", mode: "image", image, sha256: pin, store: directory, port: 0,
      operators: operatorFile, liveModel: "ollama-loopback",
    }).map(([key, value]) => ["launch", key, value]));
    live = await launch(["--config", liveLaunch, "serve"], stageRelease ? process.env.ENCOUNTER_STAGE_HOST : binary);
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=front-gate.test", "-keyout", "key.pem", "-out", "cert.pem"],
    { cwd: directory, stdio: "ignore" });
    provider = http.createServer((request, response) => {
      const value = request.headers.cookie?.split("=")[1];
      if (![session, otherSession].includes(value)) return response.writeHead(401).end();
      response.end(JSON.stringify({
        kind: "user", identity: { id: value === session ? "owner" : "other",
          issuer: "https://accounts.google.com", email: value === session ? ownerEmail : "other@example.test" },
      }));
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => provider.once("listening", resolve));
    tls = https.createServer({
      key: fs.readFileSync(path.join(directory, "key.pem")), cert: fs.readFileSync(path.join(directory, "cert.pem")),
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => tls.once("listening", resolve));
    const origin = name => `https://${name}.front-gate.test:${tls.address().port}`;
    const broker = origin("identity");
    const config = path.join(directory, "gateway.rel");
    const gatewayFacts = [
      ...Object.entries({ version: "encounter/gateway/1", port: 0, prefix: "/encounter-pilot", broker,
        owner: ownerEmail, identityPort: provider.address().port, identityPath: "/v1/me", root: path.join(workspace, "projects"),
        declaration: "encounter-platform/applications/front-gate/pilot.rel"
      }).map(([key, value]) => ["gateway", key, value]),
      ["gateway", "target", "run"], ["gateway", "target", "preview"],
      ["run", "origin", origin("run")], ["run", "port", live.port], ["run", "authorization", "Basic " + token],
      ["preview", "origin", origin("preview")], ["preview", "port", deployed.port], ["preview", "authorization", deployed.authorization],
    ];
    if (stageRelease) {
      const prepared = readFacts(path.join(stageRelease, "gateway.rel"));
      for (const [, , mount] of prepared.filter(([s, p]) => s === "gateway" && p === "mount")) {
        if (mount === "co-build") continue;
        const demo = mount === "timesheet-preview" || mount === "report-preview";
        const launchName = demo ? mount + ".rel" : "step-" + mount.split("-").at(-1) + ".rel";
        const launchFile = path.join(directory, launchName);
        const candidate = readFacts(path.join(stageRelease, launchName));
        facts(launchFile, candidate.map(row => row[1] === "port" ? ["launch", "port", 0] : row));
        const candidateProcess = await launch(["--config", launchFile, "serve"], demo ? process.env.ENCOUNTER_PREVIEW_HOST : process.env.ENCOUNTER_STAGE_HOST);
        stageProcesses.push(candidateProcess);
        gatewayFacts.push(["gateway", "mount", mount], ...prepared.filter(([s]) => s === mount)
          .map(row => row[1] === "port" ? [mount, "port", candidateProcess.port] : row));
      }
    }
    facts(config, gatewayFacts);
    gateway = await launch(["gateway", config]);
    let fakeToken = otherSession;
    let authorizationCode;
    tls.on("request", (request, response) => {
      const url = new URL(request.url, broker);
      if (request.headers.host === new URL(broker).host && url.pathname === "/identity/login") {
        response.writeHead(303, {
          Location: url.searchParams.get("return"),
          "Set-Cookie": "__Host-sourcery_session=" + fakeToken + "; Path=/; Secure; HttpOnly; SameSite=Lax",
        }).end();
        return;
      }
      if (url.pathname === "/encounter-pilot/finish" && !authorizationCode) authorizationCode = url.href.replace(broker, origin("run"));
      const upstream = http.request(hop(request, gateway.port), incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on("error", () => response.writeHead(502).end());
      request.pipe(upstream);
    });
    tls.on("upgrade", (request, client, head) => {
      client.on("error", () => client.destroy());
      const upstream = http.request(hop(request, gateway.port));
      upstream.on("error", () => client.destroy());
      upstream.on("response", incoming => { incoming.resume(); client.destroy(); });
      upstream.on("upgrade", (incoming, socket, initial) => {
        socket.on("error", () => client.destroy());
        socket.on("close", () => client.destroy());
        client.on("close", () => socket.destroy());
        client.write("HTTP/1.1 101 Switching Protocols\r\n" +
          Object.entries(incoming.headers).map(([name, value]) => name + ": " + value + "\r\n").join("") + "\r\n");
        if (initial.length) client.write(initial);
        if (head.length) socket.write(head);
        socket.pipe(client).pipe(socket);
      });
      upstream.end();
    });
    browser = await chromium.launch({
      headless: true, executablePath: chrome, args: ["--host-resolver-rules=MAP *.front-gate.test 127.0.0.1"],
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();
    if (stageRelease) page.setDefaultTimeout(6000);
    const url = origin("run") + "/encounter-pilot/";
    if (stageRelease) {
      await verifyStages(page, url, origin("preview"), () => { fakeToken = session; });
      if (fs.existsSync(path.join(stageRelease, "timesheet-preview.rel"))) {
        await verifyCommentPacket(page, url, path.join(directory, "workspace.sqlite"), fs.existsSync(path.join(stageRelease, "report-preview.rel")));
      }
      return;
    }
    const refused = await page.goto(url);
    assert.equal(refused.status(), 403);
    await page.getByText("This Google account does not have access").waitFor();
    fakeToken = session;
    await page.goto(url);
    await page.getByRole("link", { name: "Create project", exact: true }).waitFor();
    await page.getByRole("complementary", { name: "Live workspace" }).getByText("Project home", { exact: true }).waitFor();
    assert.equal(page.url(), url);
    assert.ok(authorizationCode);
    const replay = await context.newPage();
    assert.equal((await replay.goto(authorizationCode)).status(), 400);
    await replay.close();
    console.log("PASS unauthorized identity refused and sign-in code cannot be reused");
    const events = [];
    page.on("websocket", socket => {
      assert.ok(socket.url().startsWith(url.replace("https:", "wss:") + "encounter-events?"));
      socket.on("framereceived", ({ payload }) => { if (typeof payload === "string") events.push(JSON.parse(payload)); });
    });
    await page.getByRole("link", { name: "Create project", exact: true }).click();
    assert.equal(page.url(), url + "task");
    await page.getByLabel("Project name").fill("North River Science Labs");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: "Project home", exact: true }).click();
    assert.equal(page.url(), url);
    if (process.env.ENCOUNTER_UI_SCREENSHOTS) {
      await page.screenshot({ path: path.join(process.env.ENCOUNTER_UI_SCREENSHOTS, "project-home.png") });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const newTask = page.getByRole("link", { name: "New task", exact: true });
    const taskAction = await newTask.boundingBox();
    assert.ok(taskAction && taskAction.y + taskAction.height <= 844);
    await newTask.click();
    await page.getByLabel("What do you want to do?").fill("I want to set up a timesheet app for my business.");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.getByRole("link", { name: "I want to set up a timesheet app for my business.", exact: true }).click();
    await page.getByRole("link", { name: "Open task", exact: true }).click();
    await page.getByRole("button", { name: "Start live agent run" }).click();
    await page.getByLabel("Your answer").waitFor({ timeout: 185_000 });
    assert.ok(events.some(event => event.kind === "question"));
    const disconnected = await context.newPage();
    await disconnected.goto(url + "task");
    await disconnected.getByLabel("Your answer").waitFor();
    await page.getByLabel("Your answer").fill("Managers can view reports. Employees may edit their own entries only.");
    await page.getByRole("button", { name: "Save answer" }).click();
    await disconnected.getByRole("button", { name: "Approve this plan" }).waitFor({ timeout: 185_000 });
    console.log("PASS live North River question and answer catch-up over WSS");
    const previewLink = disconnected.getByRole("link", { name: "Open read-only preview" });
    assert.match(await previewLink.getAttribute("href"), /\/timesheet-preview\/timesheet$/);
    await disconnected.goto(origin("preview") + "/encounter-pilot/approval");
    assert.equal(new URL(disconnected.url()).origin, origin("preview"));
    await disconnected.getByRole("heading", { name: "Demo approval receipt" }).waitFor();
    await disconnected.setViewportSize({ width: 390, height: 844 });
    await disconnected.goto(origin("preview") + "/encounter-pilot/task");
    await disconnected.getByRole("heading", { name: "Demo approval receipt" }).waitFor();
    const previewMode = disconnected.getByRole("complementary", { name: "Read-only preview" });
    const liveAction = previewMode.getByRole("link", { name: "Create a task in live workspace" });
    await liveAction.waitFor();
    assert.equal(await disconnected.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await disconnected.locator("form[method=post]").count(), 0);
    const receiptLink = disconnected.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Release receipt" });
    assert.equal(await receiptLink.getAttribute("href"), "#preview-receipt");
    await disconnected.locator("#preview-receipt").waitFor();
    if (process.env.ENCOUNTER_UI_SCREENSHOTS) {
      await disconnected.screenshot({ path: path.join(process.env.ENCOUNTER_UI_SCREENSHOTS, "read-only-preview.png") });
    }
    await liveAction.click();
    await disconnected.getByRole("region", { name: "New task" }).getByLabel("What do you want to do?").waitFor();
    await disconnected.goBack();
    await disconnected.getByRole("link", { name: "Back to live Project home" }).click();
    assert.equal(disconnected.url(), url);
    await disconnected.getByRole("link", { name: "New task" }).waitFor();
    const denied = await postStatus(origin("preview") + "/encounter-pilot/approval");
    assert.equal(denied, 405);
    console.log("PASS separately authenticated preview shows approval and refuses writes");
  } catch (error) {
    if (page) console.error((await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")).slice(0, 1000));
    throw error;
  } finally {
    await browser?.close();
    tls?.closeAllConnections();
    provider?.closeAllConnections();
    tls?.close();
    provider?.close();
    await gateway?.close();
    await live?.close();
    await Promise.all(stageProcesses.map(process => process.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
