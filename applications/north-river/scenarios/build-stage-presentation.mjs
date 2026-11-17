import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { decode } from "../../encounter-runtime/test/rel-values.mjs";

const [runtime, original, pin, output] = process.argv.slice(2);
assert(output, "Usage: build-stage-presentation RUNTIME ORIGINAL_IMAGE ORIGINAL_SHA256 OUTPUT_DIRECTORY");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const bytes = fs.readFileSync(original);
assert.equal(sha256(bytes), pin, "Original candidate image pin");
const image = decode(bytes.toString("utf8"), "EncounterApplicationImage");
assert.equal(sha256(fs.readFileSync(runtime)), image.runtimeSha256, "Candidate runtime pin");

const source = path.join(output, "stage-source");
fs.mkdirSync(source, { mode: 0o700 });
const ui = "north-river/timesheet-ui.encounter";
const start = "process nr.sickPage:";
const replacement = fs.readFileSync(new URL("./sick-leave-ui.encounter", import.meta.url), "utf8");
assert(replacement.startsWith(start));
assert(image.files[ui].text.includes(start));
for (const [file, record] of Object.entries(image.files)) {
  assert.equal(sha256(record.text), record.sha256, file);
  assert(!path.isAbsolute(file) && !file.split("/").includes(".."), file);
  const destination = path.join(source, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.writeFileSync(destination, file === ui ? record.text.slice(0, record.text.indexOf(start)) + replacement : record.text);
}

const presentationPath = path.join(output, "stage.image.rel");
const presentationPin = execFileSync(runtime, ["build", source, image.declaration, presentationPath], { encoding: "utf8" }).trim();
const presentation = decode(fs.readFileSync(presentationPath, "utf8"), "EncounterApplicationImage");
assert.equal(presentation.runtimeSha256, image.runtimeSha256);
assert.deepEqual(Object.keys(presentation.files), Object.keys(image.files));
assert.deepEqual(Object.keys(image.files).filter(file => image.files[file].sha256 !== presentation.files[file].sha256), [ui]);
console.log(presentationPin);
