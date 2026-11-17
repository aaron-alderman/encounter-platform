'use strict';

const http = require('node:http');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const { loadPolicy, loadEncounter, benchmarkAssignment } = require('./run.cjs');
const rel = require('../node/rel-values.cjs');
const { readHeldOut } = require('./held-out.cjs');
const { traceDocuments, lexSource } = require('./trace-source.cjs');
const { readBundle } = require('./decompiler.cjs');
const { contextFeedback } = require('./context-feedback.cjs');
const { readExperiment } = require('./benchmark-experiment.cjs');
const { benchmarkJobs } = require('./benchmark.cjs');
const { verifyOffline } = require('./offline-replay.cjs');
const { readIdentityTrace } = require('./identity-trace.cjs');

function offlineArchive(bundle) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'encounter-replay-archive-'));
  try {
    const runner = [
      readFileSync(path.join(__dirname, '../node/rel-values.cjs'), 'utf8'),
      'const bundledManifestSha256 = ' + JSON.stringify(bundle.capture.manifestSha256) + ';',
      readFileSync(path.join(__dirname, 'offline-replay.cjs'), 'utf8')
    ].join('\n');
    const files = {
      'manifest.rel': bundle.manifestBytes, 'encounter.gz': bundle.runtimeGzip,
      'repair-image.rel.gz': bundle.imageGzip, 'repair-run.rel.gz': bundle.traceGzip,
      'replay.cjs': runner
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(directory, name), content);
    return execFileSync('/usr/bin/tar', ['-cf', '-', '-C', directory, ...Object.keys(files)], { maxBuffer: 16_000_000 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function preview({ file, port }) {
  const bytes = readFileSync(file, 'utf8');
  const packet = await (await loadPolicy()).qualify(rel.decode(bytes, 'EncounterEvaluationReceipt'));
  if (packet.phase !== 'reviewed') throw Error('Preview requires a reviewed receipt.');
  const evaluate = loadEncounter();
  let identityTrace;
  try { identityTrace = readIdentityTrace(); }
  catch (error) { console.error(error.message); }
  const identityPage = identityTrace && await evaluate('decompiler.identityTrace', identityTrace.report);
  const replayPath = path.join(path.dirname(file), 'north-river-replay.rel');
  let rawReplay;
  try { rawReplay = readFileSync(replayPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pin = packet.trials.find(trial => trial.application === 'north-river')?.comparison.receiptSha256;
  const northReplay = rawReplay && createHash('sha256').update(rawReplay).digest('hex') === pin
    ? rel.decode(rawReplay, 'NorthRiverPageRankReplay') : null;
  const evidence = path.join(path.dirname(file), 'decompiler');
  const imagePath = path.join(evidence, 'repair-image.rel.gz');
  const tracePath = path.join(evidence, 'repair-run.rel.gz');
  const bundle = existsSync(evidence) ? readBundle(imagePath, tracePath) : null;
  const capture = bundle?.capture;
  const bundles = new Map();
  if (bundle) bundles.set('regression', bundle);
  const workspace = path.resolve(__dirname, '../../../..');
  const runtime = process.env.ENCOUNTER_BENCHMARK_RUNTIME ??
    path.join(workspace, 'projects/encounter-core/target/notebook-decompiler/release/encounter');
  const benchmarks = benchmarkJobs({
    bundles, runtime: existsSync(runtime) ? runtime : null,
    directory: path.join(workspace, 'state/encounter-evaluation/benchmarks')
  });
  const evidenceFiles = new Map([
    ['/decompiler/image.rel.gz', ['application/gzip', 'imageGzip', 'repair-image.rel.gz']],
    ['/decompiler/trace.rel.gz', ['application/gzip', 'traceGzip', 'repair-run.rel.gz']],
    ['/decompiler/encounter.gz', ['application/gzip', 'runtimeGzip', 'encounter.gz']],
    ['/decompiler/manifest.rel', ['application/octet-stream', 'manifestBytes', 'manifest.rel']],
    ['/decompiler/offline-replay.tar', ['application/x-tar', null, 'north-river-offline-replay.tar']]
  ]);
  const routes = new Map([
    ['/decompiler/notebook.css', ['text/css; charset=utf-8', await evaluate('decompiler.styles', null)]],
    ['/', ['text/html; charset=utf-8', await evaluate('evaluation.page', { ...packet, northReplay, hasDecompiler: Boolean(capture) })]],
    ['/evaluation.css', ['text/css; charset=utf-8', await evaluate('evaluation.styles', null)]],
    ['/receipt.rel', ['application/octet-stream', bytes, 'evaluation.rel']]
  ]);
  routes.set('/evaluation', routes.get('/'));
  const tracePayloads = new Map();
  const trace = traceDocuments(evaluate);
  const sourcePayloads = new Map();
  const feedbackReports = new Map();
  const sheet = ({ id, title, objective, expectation, query, order, model, digest, image, runtime, trace, manifestSha256, comparison }) =>
    ({ id, title, objective, expectation: expectation ?? null, query: query ?? null, order: order ?? [],
      model, digest: digest ?? '', image, runtime, trace, manifestSha256,
      comparison: { arms: comparison.arms, mandatory: comparison.mandatory, budgetBytes: comparison.budgetBytes } });
  if (capture) {
    let page;
    if (capture.comparison) {
      const current = await readHeldOut(path.join(path.dirname(file), 'held-out-access-refusal'), 'access-refusal');
      const baseline = await readHeldOut(path.join(path.dirname(file), 'held-out'), 'baseline');
      for (const [id, item] of current?.bundles ?? []) bundles.set(id, item);
      for (const [id, item] of baseline?.bundles ?? []) bundles.set('before-' + id, item);
      const groups = [
        { label: 'Held-out repairs', docs: current?.cases ?? [] },
        { label: 'Before the invariant', docs: (baseline?.cases ?? []).map(doc => ({ ...doc, caseId: doc.id, id: 'before-' + doc.id })) },
        { label: 'Regression', docs: [{ ...capture, imageFiles: bundle.imageFiles, id: 'regression', title: 'Original repair capture' }] }
      ].filter(group => group.docs.length);
      const sheets = await Promise.all(groups.flatMap(group => group.docs.map(async doc => {
        tracePayloads.set(doc.id, await trace.phases(doc.runs, doc.imageFiles));
        return evaluate('desk.sheet', sheet(doc));
      })));
      page = await evaluate('desk.page', {
        hasIdentityTrace: Boolean(identityPage),
        sheets: sheets.join(''),
        groups: groups.map(group => ({ label: group.label, docs: group.docs.map(({ id, title, caseId }) => ({ id, title, caseId: caseId ?? id })) }))
      });
      routes.set('/decompiler/desk.css', ['text/css; charset=utf-8', await evaluate('desk.styles', null)]);
      routes.set('/decompiler/desk-rich.js', ['text/javascript; charset=utf-8', readFileSync(path.join(__dirname, 'desk-rich.js'))]);
      routes.set('/decompiler/desk-editor.js', ['text/javascript; charset=utf-8', readFileSync(path.join(__dirname, 'desk-editor.js'))]);
      routes.set('/decompiler/desk.js', ['text/javascript; charset=utf-8', readFileSync(path.join(__dirname, 'desk.js'))]);
    } else {
      page = await evaluate('decompiler.page', capture);
    }
    routes.set('/decompiler', ['text/html; charset=utf-8', page]);
    for (const run of capture.runs ?? []) {
      routes.set('/decompiler/' + run.arm, ['text/html; charset=utf-8', await evaluate('decompiler.page', run)]);
    }

  }
  let verifying = false;
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  };
  return http.createServer(async (request, response) => {
    const [pathname, query] = request.url.split('?', 2);
    if (['/decompiler/trace-data', '/decompiler/trace-site', '/decompiler/source-data'].includes(pathname) &&
        ['GET', 'HEAD'].includes(request.method)) {
      const params = new URLSearchParams(query);
      const phases = tracePayloads.get(params.get('case'));
      let data;
      try {
        if (pathname === '/decompiler/trace-data' && phases) {
          data = phases.map(rows => rows.map(({ lexical, pagerank, diagnostic, ...site }) => site));
        }
        if (pathname === '/decompiler/trace-site' && phases && /^[01]$/.test(params.get('phase')) &&
            /^\d+$/.test(params.get('site'))) {
          const site = phases[Number(params.get('phase'))][Number(params.get('site'))];
          if (site) data = await evaluate('desk.traceSite', {
            ...site, differencesOnly: params.get('differences') === '1'
          });
        }
        if (pathname === '/decompiler/source-data') {
          const pin = params.get('pin');
          const file = trace.files.get(pin);
          if (file) {
            if (!sourcePayloads.has(pin)) {
              const text = file.text;
              const tokens = lexSource(text);
              const batches = [];
              for (let index = 0; index < tokens.length; index += 1500) {
                batches.push(evaluate('desk.syntax', tokens.slice(index, index + 1500)));
              }
              sourcePayloads.set(pin, Promise.all(batches).then(parts => ({ text, spans: parts.flat(), pin }))
                .catch(error => { sourcePayloads.delete(pin); throw error; }));
            }
            data = await sourcePayloads.get(pin);
          }
        }
        if (data) {
          const json = JSON.stringify(data);
          response.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
          response.end(request.method === 'HEAD' ? undefined : json);
          return;
        }
      } catch (error) {
        console.error(error.message);
        response.writeHead(500, { ...headers, 'Content-Length': 41 }).end('Recorded evidence could not be projected.');
        return;
      }
    }
    const parameters = new URLSearchParams(query);
    const caseId = parameters.get('case') ?? 'regression';
    if (pathname === '/decompiler/benchmark' ||
        (pathname === '/decompiler/benchmark-action' && request.method === 'POST')) {
      const jsonHeaders = { ...headers, 'Content-Type': 'application/json; charset=utf-8' };
      if (request.method === 'GET') {
        const params = new URLSearchParams(query);
        try {
          if (params.get('action') === 'feedback') {
            const id = params.get('job') ?? 'latest';
            const feedback = feedbackReports.get(id) ??
              await contextFeedback(path.join(workspace, 'state/encounter-evaluation'), id);
            feedbackReports.set(feedback.experiment, feedback);
            const html = await evaluate('decompiler.contextFeedback', feedback);
            response.writeHead(200, jsonHeaders).end(JSON.stringify({ id: feedback.experiment, html }));
            return;
          }
          if (params.get('action') === 'experiment') {
            const result = await readExperiment(path.join(workspace, 'state/encounter-evaluation'),
              params.get('job') ?? 'latest', benchmarks, bundles);
            if (!result) {
              response.writeHead(404, jsonHeaders).end(JSON.stringify({ message: 'No completed experiment is available.' }));
              return;
            }
            const arms = result.report.arms.map(arm => ({
              ...arm, meanScore: (arm.totals.score / arm.count).toFixed(2),
              meanModel: (arm.totals.modelUs / arm.count / 1e6).toFixed(2),
              meanTerminal: (arm.totals.terminalUs / arm.count / 1e6).toFixed(2)
            }));
            const html = await evaluate('decompiler.experiment', { ...result.report, arms });
            response.writeHead(200, jsonHeaders).end(JSON.stringify({ id: result.id, html }));
            return;
          }
          const job = await benchmarks.get(params.get('job'));
          if (job?.review && params.get('action') === 'compare') {
            const { scenario } = await benchmarkAssignment(job);
            const { capture: reviewed, imageFiles } = bundles.get(job.id);
            if (!tracePayloads.has(job.id)) tracePayloads.set(job.id, await trace.phases(reviewed.runs, imageFiles));
            const arms = reviewed.comparison.arms.map(arm => {
              const judgment = job.review.judgments.find(row => row.arm === arm.arm);
              return { ...arm, review: {
                assessment: ['Missed', 'Partial', 'Meets'][judgment.value],
                note: job.review.judge.identity + ' · ' + judgment.reason +
                  (judgment.disagreement ? ' · Judge and runtime differ.' : '')
              } };
            });
            const title = scenario.title + ' · ' + job.id.slice(10, 18);
            const html = await evaluate('desk.sheet', sheet({
              ...scenario, ...reviewed, id: job.id, title,
              comparison: { ...reviewed.comparison, arms }
            }));
            response.writeHead(200, jsonHeaders).end(JSON.stringify({ title, html }));
            return;
          }
          if (job?.review && params.get('action') === 'review') {
            if (params.get('format') === 'rel') {
              response.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="' + job.id + '-review.rel"' })
                .end(rel.encode(job.review, 'EncounterBenchmarkReview'));
            } else {
              response.writeHead(200, jsonHeaders).end(JSON.stringify({ html: await evaluate('decompiler.benchmarkReview', job.review) }));
            }
          } else {
            response.writeHead(job ? 200 : 404, jsonHeaders).end(JSON.stringify(job ?? { message: 'Benchmark job not found.' }));
          }
        } catch (error) {
          console.error('Benchmark projection: ' + error.message);
          response.writeHead(500, jsonHeaders).end(JSON.stringify({ message: 'Benchmark review could not be displayed.' }));
        }
      } else if (request.method === 'POST') {
        request.resume();
        const host = request.headers.host ?? '';
        if (!/^(?:127\.0\.0\.1|localhost|evaluation\.localhost):[0-9]+$/.test(host) ||
            request.headers.origin !== 'http://' + host) {
          response.writeHead(403, jsonHeaders).end(JSON.stringify({ message: 'Wrong origin.' }));
          return;
        }
        const params = new URLSearchParams(query);
        const { code, job, message } = params.get('action') === 'judge'
          ? await benchmarks.judge(params.get('job'))
          : await benchmarks.start(caseId);
        response.writeHead(code, jsonHeaders).end(JSON.stringify(job ?? { message }));
      } else {
        response.writeHead(405, { ...jsonHeaders, Allow: 'GET, POST' }).end();
      }
      return;
    }
    if (!bundles.has(caseId) && (evidenceFiles.has(pathname) || pathname === '/decompiler/verify')) {
      await benchmarks.get(caseId);
    }
    const selected = bundles.get(caseId);
    if (pathname === '/decompiler/verify' && selected?.capture.comparison) {
      if (request.method !== 'POST') {
        response.writeHead(405, { ...headers, Allow: 'POST' }).end();
        return;
      }
      request.resume();
      if (!/^(?:127\.0\.0\.1|localhost|evaluation\.localhost):[0-9]+$/.test(request.headers.host ?? '') ||
          request.headers.origin !== 'http://' + request.headers.host) {
        response.writeHead(403, { ...headers, 'Content-Length': 13 }).end('Wrong origin.');
        return;
      }
      if (verifying) {
        response.writeHead(409, { ...headers, 'Content-Length': 34 }).end('Offline replay is already running.');
        return;
      }
      verifying = true;
      try {
        const files = {
          'manifest.rel': selected.manifestBytes, 'encounter.gz': selected.runtimeGzip,
          'repair-image.rel.gz': selected.imageGzip, 'repair-run.rel.gz': selected.traceGzip
        };
        const report = await verifyOffline(name => files[name], selected.capture.manifestSha256);
        const page = await evaluate('decompiler.verification', { ...report, caseId });
        response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(page) }).end(page);
      } catch (error) {
        console.error(error.message);
        response.writeHead(500, { ...headers, 'Content-Length': 37 }).end('Offline replay could not be verified.');
      } finally { verifying = false; }
      return;
    }
    let route = routes.get(pathname);
    if (pathname === '/decompiler' && caseId === 'identity-management') {
      const download = parameters.get('download');
      route = !identityTrace ? undefined : download === null ? ['text/html; charset=utf-8', identityPage]
        : download === 'trace' ? ['application/octet-stream', identityTrace.bytes, identityTrace.filename]
        : undefined;
    }
    const artifact = evidenceFiles.get(pathname);
    if (selected && artifact && ['GET', 'HEAD'].includes(request.method)) {
      const [type, field, filename] = artifact;
      if (field || selected.capture.comparison) {
        const name = caseId === 'regression' ? filename : caseId + '-' + filename;
        const bytes = request.method === 'HEAD' ? undefined : field ? selected[field] : offlineArchive(selected);
        route = [type, bytes, name];
      }
    }
    if (!route || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404, { ...headers, 'Content-Length': 0 }).end();
      return;
    }
    const documentHeaders = { ...headers, 'Content-Type': route[0] };
    if (route[1] !== undefined) documentHeaders['Content-Length'] = Buffer.byteLength(route[1]);
    if (pathname === '/decompiler') {
      // Allow the private Decompiler document to frame only in the AppDev workspace.
      const platformView = parameters.get('platform') === '1';
      const ancestors = platformView ? 'https://appdev.sourcerytech.com.au' : "'none'";
      documentHeaders['Content-Security-Policy'] =
        "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; " +
        "script-src 'self'; connect-src 'self'; frame-ancestors " + ancestors;
    }
    response.writeHead(200, {
      ...documentHeaders,
      ...(route[2] ? { 'Content-Disposition': 'attachment; filename="' + route[2] + '"' } : {})
    }).end(request.method === 'HEAD' ? undefined : route[1]);
  }).listen(port, '127.0.0.1', function () {
    console.log('Encounter evaluation http://127.0.0.1:' + this.address().port + '/');
  });
}

if (require.main === module) preview({
  file: process.argv[2] ?? path.join(__dirname, 'evidence/pilot.rel'),
  port: Number(process.argv[3] ?? process.env.ENCOUNTER_EVALUATION_PORT ?? 24228)
}).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { preview };
