'use strict';

const { isDeepStrictEqual } = require('node:util');
const { comparable } = require('./offline-replay.cjs');
const { sourceIndex, lexSource } = require('../../../applications/encounter-libraries/semantic/source-index.cjs');

function alignVisits(site) {
  const normalize = ({ sequence, ...data }) => comparable({
    process: site.process, kind: site.kind, data
  }, []).data;
  const lexical = site.lexical.map(normalize);
  const pagerank = site.pagerank.map(normalize);
  return Array.from({ length: Math.max(lexical.length, pagerank.length) }, (_, index) => {
    const left = lexical[index];
    const right = pagerank[index];
    if (!left || !right) return { paired: false, fields: [] };
    const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => ({
      key, equal: isDeepStrictEqual(left[key], right[key])
    }));
    return { paired: true, fields };
  });
}

function traceDocuments(evaluate) {
  const { files, resolve } = sourceIndex();

  function phases(runs, imageFiles) {
    return Promise.all(runs[0].phases.map(async (phase, index) => {
      const sites = new Map();
      for (const run of runs) {
        for (const event of run.phases[index].events) {
          if (event.kind === 'port-start') continue;
          const key = JSON.stringify([event.process, event.address, event.kind]);
          if (!sites.has(key)) {
            sites.set(key, {
              process: event.process, address: event.address.join('.'), kind: event.kind,
              port: event.data.port ?? null, query: event.data.query ?? null,
              diagnostic: event.diagnostic, source: resolve(event, imageFiles).source,
              lexical: [], pagerank: []
            });
          }
          sites.get(key)[run.arm].push({ sequence: event.sequence, ...event.data });
        }
      }
      const rows = [...sites.values()];
      const comparisons = await evaluate('desk.compareVisits', rows.map(alignVisits));
      return rows.map((site, index) => {
        const { differs, changed } = comparisons[index];
        return {
          ...site, differs,
          lexical: site.lexical.map((event, visit) => ({ ...event, changed: changed[visit] })),
          pagerank: site.pagerank.map((event, visit) => ({ ...event, changed: changed[visit] }))
        };
      });
    }));
  }
  return { files, phases };
}

module.exports = { traceDocuments, lexSource };
