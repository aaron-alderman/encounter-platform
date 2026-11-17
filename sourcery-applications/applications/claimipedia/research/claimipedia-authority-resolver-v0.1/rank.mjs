import { searchCorpus } from "../../../../../../applications/context-hub/tooling/search/search_corpus.mjs";
const [root, query] = process.argv.slice(2);
const result = searchCorpus({ root, query, limit: 64, profile: "all" });
console.log(JSON.stringify({
  indexSha256: result.corpusContentSha256,
  weights: result.method.finalWeights,
  ranking: result.results.map(row => ({source: row.path.slice("corpus/".length, -".md".length), score: row.score})),
}));
