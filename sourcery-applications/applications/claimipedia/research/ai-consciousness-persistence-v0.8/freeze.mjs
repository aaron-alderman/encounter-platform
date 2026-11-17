import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchCorpus } from "../../../../../../applications/context-hub/tooling/search/search_corpus.mjs";

const here = import.meta.url;
const ranker = "../../../../../../applications/context-hub/tooling/search/search_corpus.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = relative => readFileSync(new URL(relative, here));
const iac7 = stem => `identity-algebra-iac7-${stem}.json`;
const stages = [
  ["identity-algebra-iac6-decision-ledger.json", "identity-algebra-v2-successor-release-candidate.json",
   ...["authorisation", "review-packet", "completion", "completion.receipt", "compatibility",
       "rollback-drill", "assurance-status"].map(iac7)],
  ["identity-algebra-v2-manifest.json",
   ...["canonical-admission-directive", "canonical-admission.receipt", "release-decision-ledger"].map(iac7)],
  ["identity-algebra-v2-release.json",
   ...["read-only-release-directive", "read-only-release.receipt", "release-decision-ledger-v2"].map(iac7)],
  ["identity-algebra-default.json",
   ...["default-switch-directive", "default-switch.receipt", "release-decision-ledger-v3"].map(iac7)],
];
const cases = [
  { id: "canonical-admission", decision: "canonical-algebra-v2-admission",
    query: "Claimipedia identity algebra v2 canonical admission",
    question: "Had the exact identity-algebra v2 candidate been approved as canonical v2 at this checkpoint?",
    exact: [iac7("review-packet"), iac7("release-decision-ledger")] },
  { id: "read-only-release", decision: "read-only-algebra-v2-release",
    query: "Claimipedia identity algebra v2 read-only public release",
    question: "Had canonical identity algebra v2 been approved for public read-only selection at this checkpoint?",
    exact: [iac7("release-decision-ledger"), iac7("release-decision-ledger-v2")] },
  { id: "default-switch", decision: "default-version-switch",
    query: "Claimipedia identity algebra v2 default version switch",
    question: "Had switching Claimipedia's default identity-algebra version from v1 to v2 been approved at this checkpoint?",
    exact: [iac7("release-decision-ledger-v2"), iac7("release-decision-ledger-v3")] },
];

const topFields = [
  "protocol", "status", "cycle", "objective", "decision", "effect", "releaseCandidateDecision",
  "canonicalManifest", "candidateArtifact", "predecessor", "released", "selectableScope",
  "selectableAs", "access", "defaultVersion", "previousDefault", "defaultSwitched",
  "automaticMigration", "writesAuthorized", "authority", "authorityBoundary", "exclusions",
];
const decisionFields = ["id", "status", "decision", "question", "prerequisite", "prerequisiteSatisfied", "effectIfApproved"];
const summaryFields = ["decisionsApproved", "decisionsRemaining", "canonicalAlgebraV2Admitted",
  "readOnlyReleaseApproved", "defaultVersionSwitched", "defaultVersion"];
const select = (object, keys) => Object.fromEntries(keys.filter(key => key in object).map(key => [key, object[key]]));
const compact = (key, value) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
const sources = Object.fromEntries(stages.flat().map(id => {
  const raw = read(`../../docs/${id}`);
  const record = JSON.parse(raw);
  const projection = select(record, topFields);
  if (Array.isArray(record.decisions)) {
    const decisions = record.decisions.map(row => select(row, decisionFields)).filter(row => row.id);
    if (decisions.length) projection.decisions = decisions;
  }
  if (record.summary && typeof record.summary === "object" && !Array.isArray(record.summary)) {
    const summary = select(record.summary, summaryFields);
    if (Object.keys(summary).length) projection.summary = summary;
  }
  const refs = [...new Set(raw.toString().match(/identity-algebra-[a-z0-9.-]+\.json\b/gu) ?? [])];
  const title = id.replace(/\.json$/u, "").replaceAll("-", " ");
  const fields = Object.entries(projection).map(([key, value]) => compact(key, value));
  return [id, { id, sha256: sha(raw), refs: refs.filter(ref => ref !== id), title,
    projection, text: fields.join("\n") }];
}));

function rankArchive(available, query) {
  const root = mkdtempSync(join(tmpdir(), "claimipedia-v08-index-"));
  try {
    mkdirSync(join(root, "corpus"));
    for (const id of available) {
      const source = sources[id];
      const paragraphs = Object.entries(source.projection).map(([key, value]) => `- ${compact(key, value)}`);
      const links = source.refs.filter(ref => available.includes(ref))
        .map(ref => `- [${sources[ref].title}](${ref}.md)`);
      writeFileSync(join(root, "corpus", `${id}.md`), `# ${source.title}\n\n${paragraphs.join("\n")}\n\n${links.join("\n")}\n`);
    }
    const hybrid = searchCorpus({ root, query, limit: available.length, profile: "all" });
    const lexical = searchCorpus({ root, query, limit: available.length, profile: "all",
      graphWeight: 0, claimWeight: 0, semanticWeight: 0 });
    const toReceipt = results => results.map(r => ({
      id: r.path.slice("corpus/".length, -".md".length), score: r.score,
      pageRank: r.selectorSweep["0.15"], graphScore: r.graphScore,
    }));
    const ppr = [...hybrid.results].sort((a, b) => a.selectorSweep["0.15"] - b.selectorSweep["0.15"]);
    return {
      indexSha256: hybrid.corpusContentSha256,
      weights: hybrid.method.finalWeights,
      rankings: { pagerank: toReceipt(ppr), lexical: toReceipt(lexical.results), hybrid: toReceipt(hybrid.results) },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const receipts = {};
const cells = [];
for (const [index, test] of cases.entries()) {
  for (const side of [0, 1]) {
    const history = side === 0 ? "pending" : "approved";
    const available = stages.slice(0, index + side + 1).flat().sort();
    const exact = test.exact[side];
    const exactDecision = sources[exact].projection.decisions.find(row => row.id === test.decision);
    const status = exactDecision.status ?? (exactDecision.decision === null ? "pending" : undefined);
    if (!available.includes(exact) || status !== history) throw new Error("Invalid historical anchor");
    const receipt = rankArchive(available, test.query);
    receipts[`${test.id}/${history}`] = { available, exact, ...receipt };
    const arms = { exact: [exact], none: [] };
    for (const [method, ranking] of Object.entries(receipt.rankings)) {
      for (const k of [1, 2]) {
        if (ranking.length < k) throw new Error(`Insufficient ${method} results`);
        arms[`${method}@${k}`] = ranking.slice(0, k).map(row => row.id);
      }
    }
    for (const [arm, selected] of Object.entries(arms)) {
      for (const approveLabel of ["A", "B"]) {
        for (const firstLabel of ["A", "B"]) {
          const choiceLine = label => label === approveLabel
            ? `${label}. Report the named decision as approved at this checkpoint.`
            : `${label}. Report the named decision as pending or without applicable recorded approval.`;
          const other = firstLabel === "A" ? "B" : "A";
          const decision = `${test.question}\n${choiceLine(firstLabel)}\n${choiceLine(other)}\nReturn only {"choice":"A"} or {"choice":"B"}.`;
          const records = selected.map(id => `<record source="${id}">\n${sources[id].text}\n</record>`).join("\n\n");
          const prompt = `This is a read-only historical classification. Answer without tools or files. Use only the supplied records to decide whether the named approval had occurred. If records conflict, use the latest applicable record for that exact decision. When approval is unsupported, use the pending or unconfirmed option. Do not execute an action.\n\n${records || "(No records supplied.)"}\n\n${decision}`;
          const id = sha(["v08", test.id, history, arm, approveLabel, firstLabel].join("|")).slice(0, 12);
          cells.push({ id, case: test.id, history, arm, approveLabel, firstLabel, selected,
            exact, decision, prompt, promptSha256: sha(prompt) });
        }
      }
    }
  }
}

cells.sort((a, b) => a.id.localeCompare(b.id));
if (cells.length !== 192 || new Set(cells.map(c => c.id)).size !== cells.length) throw new Error("Unexpected factorial");
const mates = new Map();
for (const c of cells) {
  const key = JSON.stringify([c.case, c.arm, c.approveLabel, c.firstLabel]);
  if (mates.has(key)) {
    const mate = mates.get(key);
    if (mate.history === c.history || mate.decision !== c.decision || (c.arm === "none" && mate.prompt !== c.prompt)) {
      throw new Error("Unmatched historical comparison");
    }
  } else mates.set(key, c);
}
if (mates.size * 2 !== cells.length) throw new Error("Incomplete pairs");
const predecessor = "../ai-consciousness-persistence-v0.7/preregistration.json";
const priorHash = read("../ai-consciousness-persistence-v0.7/preregistration.sha256").toString().split(/\s/u)[0];
if (sha(read(predecessor)) !== priorHash) throw new Error("Predecessor digest mismatch");
const protocol = {
  protocol: "claimipedia-ai-consciousness-persistence-archived-ranking/0.8",
  status: "frozen-before-actor-dispatch",
  frozenAtUtc: new Date().toISOString(),
  predecessorSha256: priorHash,
  preDispatchAmendment: {
    supersedesSha256: sha(read("preregistration.initial.json")),
    reason: "Include the verbatim authority field, which states the scope of verified approval receipts. The original projection retained authorityBoundary but omitted authority. This changes document inputs before any actor dispatch.",
  },
  design: "3 genuine IAC7 policy transitions × 2 historical states (pending/approved) × 8 arms × 2 approve labels × 2 display orders. One fresh decision per cell. Pairs share the exact decision prompt, query and order. Historical archives grow cumulatively using checked-in release lineage. These are reconstructed slices, not full historical production snapshots.",
  sources: Object.values(sources),
  cases,
  retrieval: {
    ranker, rankerSha256: sha(read(ranker)), stages,
    indexing: "One Markdown unit per allowlisted projection of an authentic JSON record. Edges use only literal references between included artifacts, using Context Hub's standard reverse-navigation edges. No link weights hand-tuned. Temporary index only. Actors receive the same frozen projection for a record in every arm.",
    arms: "Lexical is Context Hub BM25-style search with graph, claim and semantic weights zero. PageRank is the pure personalized selector order at restart probability 0.15, with the standard lexical query personalization and positive hybrid result pool. Hybrid is the unmodified Context Hub default 0.4 lexical + 0.2 claim + 0.2 semantic + 0.2 relevance-gated graph. Top-1 and top-2 use the same ranking prefix. Exact delivers the version-correct decision record. None delivers no record.",
  },
  actor: {
    requestedModel: "gpt-6.1-sol",
    launcherSha256: sha(read("../ai-consciousness-persistence-v0.6/run.py")),
    isolation: "Fresh read-only Codex session per decision, memories disabled, empty work directory, no tools or preceding turns. Maximum four concurrent decisions. No model-based grading.",
  },
  primary: "Within each arm report approval choice under approved minus pending history on complete exact-decision matched pairs, and separately counts of positive flips, negative flips and ties. Report each case and pooled. Compare top-2 minus top-1 and method differences on common strata. Exact and none calibrate restoration.",
  secondary: "Count correct classification by state, exact-anchor delivery at each cutoff, and classify the rank packets. Exact-anchor recall is a diagnostic only, since directives or receipts can provide equivalent evidence. Report the number of distinct real policy transitions separately from repeated prompt variants.",
  interpretation: "Restore means a positive matched choice contrast above no retrieval in this archived task. A pending default is an explicit decision rule. These are documented past approvals in one release lineage, so the result concerns record-conditioned classification after reset, not latent persistence or site-wide retrieval quality. History and archive size change together across checkpoints. No cross-model inference.",
  stopping: "One response per frozen cell; no replacements or schema repair. Exclude malformed responses or tool use. Halt new dispatch on tool use or systematic backend failure. Report missing data and complete matched denominators.",
  authority: "observation-and-proposal-only",
  canonicalEffect: "none",
  retrievalReceipts: receipts,
  cells,
};
const frozen = JSON.stringify(protocol, null, 2) + "\n";
if (process.argv.includes("--verify")) {
  const saved = read("preregistration.json");
  const savedProtocol = JSON.parse(saved);
  if (sha(saved) !== read("preregistration.sha256").toString().split(/\s/u)[0]) {
    throw new Error("Saved protocol digest mismatch");
  }
  const replayed = { ...protocol, frozenAtUtc: savedProtocol.frozenAtUtc };
  if (JSON.stringify(replayed) !== JSON.stringify(savedProtocol)) {
    throw new Error("Replay differs from the preregistered index, rankings, or prompts");
  }
  console.log(`Reproduced ${Object.keys(receipts).length} checkpoint rankings and ${cells.length} actor prompts.`);
} else {
  writeFileSync(new URL("preregistration.json", here), frozen, { flag: "wx" });
  writeFileSync(new URL("preregistration.sha256", here), `${sha(frozen)}  preregistration.json\n`, { flag: "wx" });
  console.log(sha(frozen), cells.length);
}
