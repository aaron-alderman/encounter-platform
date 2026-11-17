import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decode, encode } from "../../encounter-runtime/test/rel-values.mjs";

const source = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(source, "../../../..");
const [scenarioDir, imageArg, pilotDir, releaseDir, portArg] = process.argv.slice(2).map((arg, index) => index === 4 ? arg : path.resolve(arg));
assert(portArg, "Usage: prepare-stage SCENARIO_DIR CANDIDATE_IMAGE PILOT_DIR RELEASE_DIR FIRST_PORT");
const firstPort = Number(portArg);
assert(Number.isInteger(firstPort) && firstPort > 1024 && firstPort < 65529);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => fs.readFileSync(file, "utf8");
const readFacts = file => read(file).trim().split("\n").map(line => JSON.parse("[" + line.slice(1, -1) + "]"));
const writeFacts = (file, rows) => fs.writeFileSync(file, rows.map(row =>
  "(" + row.map(value => JSON.stringify(String(value))).join(", ") + ")\n").join(""), { mode: 0o600 });
const facts = (subject, data) => Object.entries(data).map(([key, value]) => [subject, key, value]);

const recorded = read(path.join(scenarioDir, "observed.rel"));
const scenario = sha256(recorded);
const observed = decode(recorded, "EncounterScenarioEvidence");
const generated = decode(read(path.join(scenarioDir, "generated.rel")), "EncounterScenario");
for (const field of ["plan", "draft", "image", "approvedCheck"]) assert.equal(generated[field], observed[field], field);
assert.equal(sha256(fs.readFileSync(imageArg)), observed.image, "Candidate image digest");
assert(observed.steps.length > 0 && observed.steps.length === generated.steps.length);
const packet = decode(read(path.join(source, "../scenario-evidence.rel")), "ApplicationData")
  .filter(item => item.draft === observed.draft && item.image === observed.image && item.plan === observed.plan);
assert.equal(packet.length, 1, "Expected one editor evidence packet for this stage");
const editorEvidence = { ...packet[0], steps: packet[0].steps.map(({ item, ...step }) => step) };
assert(isDeepStrictEqual(editorEvidence, { ...observed, steps: observed.steps.map(step => ({ ...step })) }),
  "The editor evidence and staged run must match");

const editor = new DatabaseSync(path.join(pilotDir, "run/workspace.sqlite"), { readOnly: true });
const review = editor.prepare(`SELECT text FROM documents WHERE revision=(SELECT max(id) FROM revisions)
  AND path LIKE 'implementation-reviews/%' ORDER BY path`).all()
  .map(row => decode(row.text, "NorthRiverImplementationReview"))
  .filter(row => row.approval.hash === observed.plan && row.result?.diff && sha256(row.result.diff) === observed.draft);
assert.equal(review.length, 1, "Expected one saved implementation attempt matching this evidence");
const [saved] = review;
assert.equal(saved.approval.source, "project", "This saved pilot binds the primary project's scenario");
const task = "primary";
const attempt = saved.start.operation;
editor.close();

const fixtureFile = path.join(scenarioDir, "fixture/workspace.sqlite");
const fixture = new DatabaseSync(fixtureFile, { readOnly: true });
const at = fixture.prepare("SELECT text FROM documents WHERE revision=? AND path=?");
const operation = fixture.prepare("SELECT operation_id FROM revisions WHERE id=?");
const schema = read(path.join(workspace, "projects/encounter-core/src/revision-schema.sql"));
const gateway = readFacts(path.join(pilotDir, "gateway.rel"))
  .filter(([subject, field]) => subject !== "gateway" || field !== "stylesheet");
assert(!gateway.some(([subject, field]) => subject === "gateway" && field === "mount"), "Use the base pilot gateway release");
fs.mkdirSync(releaseDir, { mode: 0o700 });
const gateSource = "encounter-platform/applications/front-gate";
const gateFiles = [
  ...["pilot.rel", "pilot.encounter", "pilot-presentation.encounter"].map(file => path.join(gateSource, file)),
  "applications/encounter-libraries/workflows/sourcery-presentation.encounter",
];
for (const file of gateFiles) {
  const destination = path.join(releaseDir, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(workspace, "projects", file), destination);
}
for (const row of gateway) {
  if (row[0] === "gateway" && row[1] === "root") row[2] = releaseDir;
  if (row[0] === "gateway" && row[1] === "declaration") row[2] = gateSource + "/pilot.rel";
}
const roles = {
  "employee": ["demo-maya", "employee", "Affected employee"],
  "unrelated-employee": ["demo-sam", "employee", "Unrelated employee"],
  "recipient-manager": ["stage-recipient-manager", "manager", "Recipient manager"],
  "unrelated-manager": ["stage-other-manager", "manager", "Unrelated manager"],
};
const operatorRows = [["operators", "version", "encounter/operators/1"]];
const authorization = new Map();
for (const [account, role] of Object.values(roles)) {
  const basic = Buffer.from(account + ":" + randomBytes(32).toString("hex")).toString("base64");
  authorization.set(account, "Basic " + basic);
  operatorRows.push(...facts(account, { role, basicSha256: sha256(basic) }));
}
const operators = path.join(releaseDir, "stage-operators.rel");
writeFacts(operators, operatorRows);

const steps = [];
for (const [index, step] of observed.steps.entries()) {
  const { id, actor, revision, receipt } = step;
  assert.equal(id, index + 1);
  assert.equal(actor, generated.steps[index].actor);
  assert.deepEqual(step.expected, generated.steps[index].expected);
  assert.equal(step.passed, true);
  const route = step.screen.route;
  assert.equal(route, "/sick-leave", "Supported saved candidate route");
  assert(Object.hasOwn(roles, actor), "Unsupported scenario actor");
  assert(Number.isSafeInteger(revision) && operation.get(revision), "Missing retained stage revision");
  if (receipt) assert.equal(operation.get(revision).operation_id, receipt, "Stage operation receipt");
  const store = path.join(releaseDir, "step-" + id);
  fs.mkdirSync(store, { mode: 0o700 });
  const db = new DatabaseSync(path.join(store, "workspace.sqlite"));
  db.exec(schema);
  db.prepare("ATTACH DATABASE ? AS fixture").run(pathToFileURL(fixtureFile).href + "?mode=ro");
  db.exec("BEGIN; INSERT INTO metadata SELECT * FROM fixture.metadata;");
  db.prepare("INSERT INTO revisions SELECT * FROM fixture.revisions WHERE id<=? ORDER BY id").run(revision);
  db.prepare("INSERT INTO documents SELECT * FROM fixture.documents WHERE revision<=?").run(revision);
  db.exec("COMMIT;");
  db.close();
  const [account, role, label] = roles[actor];
  if (role === "employee") {
    const stageTask = decode(at.get(revision, "task.rel").text, "NorthRiverTask");
    const links = stageTask.import.links.filter(link => link.accountRef === account);
    assert.equal(links.length, 1, "Missing stage employee account");
    assert.equal(links[0].employee, actor === "employee" ? "E-101" : "E-102");
  }
  const port = firstPort + index;
  writeFacts(path.join(releaseDir, "step-" + id + ".rel"), facts("launch", {
    version: "encounter/launch/1", mode: "image", image: imageArg, sha256: observed.image, store, port, operators,
  }));
  const mount = "stage-" + scenario + "-" + id;
  gateway.push(["gateway", "mount", mount], ...facts(mount, {
    target: "preview", port, authorization: authorization.get(account), label: "Step " + id + " - " + label,
    returnPath: "/?task=" + task + "&work=1&view=scenario&step=" + id + "&scenario=" + scenario,
  }));
  if (id === 1) {
    gateway.push(...facts(mount, { collectionTitle: observed.title, collectionPath: route }));
  }
  steps.push({ id, route, actor, revision });
}
fixture.close();
writeFacts(path.join(releaseDir, "gateway.rel"), gateway);
fs.writeFileSync(path.join(releaseDir, "scenario-stages.rel"),
  encode([{ task, attempt, draft: observed.draft, plan: observed.plan, image: observed.image, scenario, steps }], "ApplicationData"));
console.log("Prepared " + steps.length + " pinned stages for scenario " + scenario);
