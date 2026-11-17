import { readFileSync } from "node:fs";
import { parseRawFacts } from "../../../../../../encounter-conversion-inputs/sourcery-platform/sdk/core/rel-core.mjs";
import { materializeSrp7Admission } from "../../../../../sourcery-capabilities/plugins/scientific-inquiry-loop/srp7-admission-materializer.mjs";

const root = new URL("../../../../../other/random-thoughts/physics/candidate%20papers/spin2_3/programme/", import.meta.url);
const read = name => readFileSync(new URL(name, root), "utf8").replaceAll("\r\n", "\n");
const facts = parseRawFacts(read("spin23-srp7-run-v1.materialized.rel"));
const decision = JSON.parse(read("spin23-srp7-human-decision-v1.json"));
const result = materializeSrp7Admission({ runFacts: facts, decision });
if (result.rel !== read("spin23-srp7-approved-v1.materialized.rel")) {
  throw new Error("Replayed scoped approval differs from the retained normalized successor");
}
console.log(JSON.stringify({
  materializationHash: result.materializationHash, decisionHash: result.decisionHash, ...result.counts,
}));
