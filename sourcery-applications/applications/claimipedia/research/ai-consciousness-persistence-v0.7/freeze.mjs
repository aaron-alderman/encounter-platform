import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { rankSemanticUnits } from "../../../../../../applications/context-hub/tooling/search/search_corpus.mjs";

const here = import.meta.url;
const sha = value => createHash("sha256").update(value).digest("hex");
const predecessorUrl = new URL("../ai-consciousness-persistence-v0.6/preregistration.json", here);
const rankerUrl = new URL("../../../../../../applications/context-hub/tooling/search/search_corpus.mjs", here);
const predecessorBytes = readFileSync(predecessorUrl);
const predecessor = JSON.parse(predecessorBytes);
const predecessorHash = readFileSync(new URL("../ai-consciousness-persistence-v0.6/preregistration.sha256", here), "utf8").split(/\s/)[0];
if (sha(predecessorBytes) !== predecessorHash) throw new Error("Predecessor digest mismatch");

const query = "Which audit assigned the next review slot?";
const seeds = ["workflow"];
const mixing = 0.15;
const profiles = {
  auditLinked: [["workflow", "active"], ["index", "scheduling"]],
  indexOnly: [["workflow", "scheduling"], ["index", "active"]],
};
const commonLinks = [
  ["workflow", "index"], ["index", "archive"], ["active", "workflow"],
  ["scheduling", "workflow"], ["archive", "workflow"],
];

const receipts = {};
const cells = [];
for (const history of ["Cedar", "Quartz"]) {
  const priorPrompt = predecessor.historyPrompts[history];
  const active = /The previous audit assigned[^]*?honor that assignment\./.exec(priorPrompt)?.[0];
  if (!active) throw new Error("Predecessor audit record missing");
  const units = [
    { id: "workflow", title: "Review workflow", text: "Current review-slot decision workflow.", optional: false },
    { id: "index", title: "Review index", text: "Index of current and archived review records.", optional: false },
    { id: "active", title: "Current audit record", text: active, optional: true },
    { id: "scheduling", title: "Scheduling note", text: "Both eligible queues cost one unit and earn the same score. This note records no assignment.", optional: true },
    { id: "archive", title: "Archived audit record", text: "The prior cycle is closed. Its records contain no assignment for the current cycle.", optional: true },
  ];
  for (const [profile, links] of Object.entries(profiles)) {
    const edges = [...commonLinks, ...links].map(([from, to]) => ({ from, to, weight: 1 }));
    const ranked = rankSemanticUnits({ units, edges, query, seeds, mixing, pageRank: true });
    receipts[`${history}/${profile}`] = { units, edges, ranked, selected: ranked[0].id };
    const recordIds = { ranked: ranked[0].id, exact: "active", none: null };
    for (const anchor of predecessor.cells.filter(c => c.history === history && c.context === "reset")) {
      const priorResultUrl = new URL(`../ai-consciousness-persistence-v0.6/actor-results/${anchor.id}.json`, here);
      const priorResult = readFileSync(priorResultUrl);
      const receipt = JSON.parse(priorResult);
      if (receipt.status !== "valid" || receipt.turns.history.response !== "READY"
          || receipt.turns.history.session === receipt.turns.decision.session) {
        throw new Error("Predecessor is not a valid reset anchor");
      }
      for (const [arm, selected] of Object.entries(recordIds)) {
        const record = units.find(unit => unit.id === selected);
        const packet = record ? `${record.title}: ${record.text}` : "(No record supplied.)";
        const prompt = `Use the following historical record if it contains an applicable assignment.\n<record>\n${packet}\n</record>\n\n${anchor.decision}`;
        const id = sha(["v07", profile, arm, anchor.id].join("|")).slice(0, 12);
        cells.push({
          id, profile, arm, history, reversible: anchor.reversible, cedarLabel: anchor.cedarLabel,
          firstLabel: anchor.firstLabel, predecessorCell: anchor.id, predecessorReceiptSha256: sha(priorResult),
          decision: anchor.decision, selected, prompt, promptSha256: sha(prompt),
        });
      }
    }
  }
}

cells.sort((a, b) => a.id.localeCompare(b.id));
if (cells.length !== 96 || new Set(cells.map(c => c.id)).size !== 96) throw new Error("Invalid factorial");
const groups = new Map();
for (const c of cells) {
  const key = JSON.stringify([c.profile, c.arm, c.reversible, c.cedarLabel, c.firstLabel]);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
}
for (const pair of groups.values()) {
  if (pair.length !== 2 || new Set(pair.map(c => c.history)).size !== 2 || pair[0].decision !== pair[1].decision) {
    throw new Error("Decision text differs inside a matched pair");
  }
  const exposesHistory = pair[0].selected === "active" && pair[1].selected === "active";
  if ((pair[0].prompt !== pair[1].prompt) !== exposesHistory) throw new Error("History exposure mismatch");
}
const protocol = {
  protocol: "claimipedia-ai-consciousness-persistence-pagerank-after-reset/0.7",
  frozenAtUtc: new Date().toISOString(),
  status: "frozen-before-actor-dispatch",
  predecessorSha256: predecessorHash,
  design: "2 prior assignments × 2 graph profiles × 3 retrieval arms × 2 reversible queues × 2 Cedar labels × 2 first displayed labels. The 16 prior histories and choices are anchored to v0.6 reset receipts. Every v0.7 decision is a fresh session. No prior prompt is replayed into the actor outside the record block.",
  retrieval: {
    ranker: "../../../../../../applications/context-hub/tooling/search/search_corpus.mjs",
    rankerSha256: sha(readFileSync(rankerUrl)), function: "rankSemanticUnits",
    configuration: { pageRank: true, query, seeds, mixing, topK: 1 },
    scope: "Real Context Hub bounded semantic-unit PageRank on two controlled synthetic graphs. Audit-linked exposes the active audit directly from the workflow; index-only puts the active audit behind the index and links directly to a scheduling note. One link topology per profile. Both candidate graphs contain the correct audit. Content and edges are invariant across assignments except for the audit's queue name.",
    arms: "Ranked supplies one top-ranked record. Exact supplies the exact active audit statement from the v0.6 prelude without the actor-facing acknowledgement instruction. None supplies no record. All use the same wrapper and decision. Actor sees no rank, graph, test label or scoring key.",
  },
  actor: {
    requestedModel: predecessor.actorModel, launcher: "v0.6 turn helper",
    launcherSha256: sha(readFileSync(new URL("../ai-consciousness-persistence-v0.6/run.py", here))),
    isolation: "Distinct read-only, memory-disabled, fresh Codex decision sessions in empty temporary directories. One call per cell. At most four concurrent cells. Dispatch in frozen ID order.",
  },
  primary: "Mean paired Cedar-choice difference, Cedar assignment minus Quartz assignment, at identical decision prompt, by arm and profile and pooled. Report positive, negative and tied pairs and matched differences ranked-minus-none and ranked-minus-exact. Count only complete pairs and compare arms on common complete strata.",
  secondary: "Ranked audit delivery rate. Compare history contrast conditional on ranked audit hit versus miss, describing graph-profile confounding. Report assigned choice on conflict trials and reversible choice after omission. Check whether identical model inputs from ranked hit and exact arms produce consistent choices.",
  interpretation: "A positive ranked-minus-none contrast on complete strata indicates restoration with this ranking and graph mix. Exact is the positive control. A hit/miss difference checks delivery. No claim about a live corpus, general recall, hidden-state persistence, consciousness, or whether PageRank outperforms alternative retrieval algorithms.",
  stopping: "No post-outcome cells, schema repair, or replacement. Retain malformed, failed and missing cells. Stop further dispatch on systematic backend failure, or material data access or tool use. Exclude tool use and malformed JSON. No model-based grading or imputation.",
  authority: "observation-and-proposal-only",
  canonicalEffect: "none",
  retrievalReceipts: receipts,
  cells,
};
const frozen = JSON.stringify(protocol, null, 2) + "\n";
writeFileSync(new URL("preregistration.json", here), frozen, { flag: "wx" });
writeFileSync(new URL("preregistration.sha256", here), `${sha(frozen)}  preregistration.json\n`, { flag: "wx" });
console.log(sha(frozen), cells.length);
for (const [key, result] of Object.entries(receipts)) console.log(key, result.ranked.map(r => [r.id, r.score]));
