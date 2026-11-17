import { createEditor } from './desk-editor.js';
import { richDocument, traceDocument, reportDocument } from './desk-rich.js';

const byId = id => document.getElementById(id);
const picker = byId('case');
const reading = byId('reading');
const files = byId('files');
const columns = ['left', 'right'].map(byId);
const outputs = columns.map(column => column.querySelector('pre'));
const previous = byId('previous');
const next = byId('next');
const tabs = [...document.querySelectorAll('[data-tab]')];
const sheets = new Map([...document.querySelectorAll('[data-sheet]')].map(sheet => [sheet.dataset.sheet, sheet]));
const folderButtons = new Map();
const paired = new Set(['overview', 'context', 'reply', 'effects', 'trace']);
const delivery = byId('trace-delivery');
const filter = byId('trace-filter');
const instruction = byId('trace-site');
const sourceLink = byId('trace-source');
const traceByCase = new Map();
const siteDetails = new Map();
const sourceFiles = new Map();
const traceSearch = byId('trace-search');
const differences = byId('trace-differences');
const replyDifferences = byId('reply-differences');
const previousField = byId('reply-previous');
const nextField = byId('reply-next');
const traceKinds = { when: 'Branch', assert: 'Check', catch: 'Caught refusal', 'port-end': 'Effect' };
const headings = {
  overview: 'Overview', context: 'Optional context', reply: 'Recorded replies', effects: 'Recorded effects',
  brief: 'Case brief', mandatory: 'Mandatory context', trace: 'Branches, checks and effects',
  pins: 'Evidence pins', files: 'Files', verification: 'Offline replay verification', judgment: 'Attributed benchmark judgment', experiment: 'Held-out experiment', feedback: 'Context Hub feedback', source: 'Admitted Encounter source'
};

for (const group of picker.querySelectorAll('optgroup')) {
  const heading = document.createElement('div');
  heading.className = 'folder';
  heading.textContent = group.label;
  byId('folders').append(heading);
  for (const option of group.children) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.dataset.short;
    button.title = option.textContent;
    button.addEventListener('click', () => {
      picker.value = option.value;
      openCase();
    });
    folderButtons.set(option.value, button);
    byId('folders').append(button);
  }
}

let view = 'overview';
let report = '';
let pages = [];
let rich = [];
let page = 0;
let replyIndex = 0;
let site;
let sourceTarget;
let traceStatus;
let editor;
let sourceLine;

async function readData(name, params) {
  const response = await fetch('/decompiler/' + name + '?' + new URLSearchParams(params));
  if (!response.ok) throw Error('Could not load ' + name.replace('-', ' ') + '.');
  return response.json();
}

async function loadTrace(caseId) {
  if (!traceByCase.has(caseId)) {
    traceByCase.set(caseId, await readData('trace-data', { case: caseId }));
  }
}

function traceRows() {
  return traceByCase.get(picker.value)?.[Number(delivery.value)] ?? [];
}

async function openTrace() {
  const caseId = picker.value;
  if (traceByCase.has(caseId)) {
    selectInstructions();
    openView('trace');
    return;
  }
  site = undefined;
  traceStatus = 'Loading recorded trace…';
  openView('trace');
  try {
    if (!sheets.has(caseId)) {
      if (!caseId.startsWith('benchmark-')) return;
      await loadReviewedCapture(caseId);
    }
    await loadTrace(caseId);
    if (picker.value === caseId && view === 'trace') {
      traceStatus = '';
      selectInstructions();
      openView('trace');
    }
  } catch (error) {
    if (picker.value === caseId && view === 'trace') {
      traceStatus = error.message;
      layout();
    }
  }
}

function instructionLabel(row) {
  const name = row.query ?? row.port ?? row.process;
  return traceKinds[row.kind] + ' · ' + name + ' · ' + row.address;
}

function selectInstructions(preferred) {
  const term = traceSearch.value.trim().toLowerCase();
  const options = traceRows().flatMap((row, index) => {
    const label = instructionLabel(row);
    const matches = (label + ' ' + row.process + ' ' + row.source.file).toLowerCase().includes(term);
    return matches && (!differences.checked || row.differs) && (filter.value === 'all' || filter.value === row.kind) ? [new Option(label, String(index))] : [];
  });
  instruction.replaceChildren(...options);
  if (preferred !== undefined && options.some(option => option.value === String(preferred))) {
    instruction.value = String(preferred);
  }
  selectInstruction();
}

function selectInstruction() {
  site = instruction.value === '' ? undefined : traceRows()[Number(instruction.value)];
  byId('trace-previous').disabled = instruction.selectedIndex <= 0;
  byId('trace-next').disabled = instruction.selectedIndex >= instruction.options.length - 1;
  const name = differences.checked ? 'difference' : 'instruction';
  byId('trace-previous').setAttribute('aria-label', 'Previous ' + name);
  byId('trace-next').setAttribute('aria-label', 'Next ' + name);
  byId('trace-position').textContent = site
    ? (instruction.selectedIndex + 1) + ' / ' + instruction.options.length + (differences.checked ? ' differing' : '')
    : '0 sites';
  sourceLink.hidden = !site;
  if (site) {
    const { file, line, column } = site.source;
    sourceLink.textContent = '↗ ' + file + ':' + line + ':' + column;
    sourceLink.title = sourceLink.textContent;
    sourceLink.href = '#source/' + siteKey() + '/' + site.source.sha256 + '/' + site.source.start;
    loadSite();
  }
}

function siteKey() {
  return [picker.value, delivery.value, instruction.value].join('/');
}

async function loadSite() {
  const key = detailKey();
  if (siteDetails.has(key)) return;
  const params = { case: picker.value, phase: delivery.value, site: instruction.value, differences: differences.checked ? '1' : '0' };
  siteDetails.set(key, null);
  try {
    const result = await readData('trace-site', params);
    siteDetails.set(key, Object.fromEntries(Object.entries(result).map(([arm, html]) => [arm, traceDocument(html)])));
  } catch (error) {
    siteDetails.set(key, { lexical: error.message, pagerank: error.message });
  }
  if (view === 'trace' && site && detailKey() === key) layout();
}

function detailKey() {
  return siteKey() + '/' + differences.checked;
}

function traceText(arm) {
  if (!site) return traceStatus || (differences.checked
    ? 'No differing visits in this selection. Run-specific plan and storage hashes are ignored.'
    : 'No recorded instructions for this filter.');
  return siteDetails.get(detailKey())?.[arm] ?? 'Loading recorded instruction…';
}

function jumpToLine(line) {
  if (!editor?.lines[line - 1]) return;
  sourceLine = line;
  layout();
}

async function followSource() {
  const fragment = location.hash;
  const match = /^#source\/([a-z0-9-]+)\/([01])\/(\d+)(?:\/([a-f0-9]{64})\/(\d+))?$/.exec(fragment);
  if (!match) {
    if (view === 'source') openView('trace');
    return;
  }
  const [, caseId, phase, index, pin, start] = match;
  try {
    if (!sheets.has(caseId)) {
      if (!caseId.startsWith('benchmark-')) return;
      await loadReviewedCapture(caseId);
    }
    await loadTrace(caseId);
  } catch (error) {
    if (location.hash === fragment) {
      site = undefined;
      traceStatus = error.message;
      openView('trace');
    }
    return;
  }
  if (location.hash !== fragment) return;
  if (picker.value !== caseId) {
    picker.value = caseId;
    updateDocument();
  }
  delivery.value = phase;
  const row = traceRows()[Number(index)];
  if (!row || (pin && (row.source.sha256 !== pin || row.source.start !== Number(start)))) {
    site = undefined;
    traceStatus = 'This source link differs from the pinned trace.';
    openView('trace');
    return;
  }
  if (filter.value !== 'all' && filter.value !== row.kind) filter.value = 'all';
  traceSearch.value = '';
  if (!row.differs) differences.checked = false;
  selectInstructions(Number(index));
  const target = row.source;
  try {
    if (!sourceFiles.has(target.sha256)) {
      sourceFiles.set(target.sha256, await readData('source-data', { pin: target.sha256 }));
    }
    if (location.hash !== fragment) return;
    const source = sourceFiles.get(target.sha256);
    if (source.pin !== target.sha256) throw Error('Source pin differs from the recorded instruction.');
    editor = createEditor(source, target);
  } catch (error) {
    if (location.hash === fragment) {
      site = undefined;
      traceStatus = error.message;
      openView('trace');
    }
    return;
  }
  sourceTarget = target;
  sourceLine = target.line;
  byId('source-line').max = editor.lines.length;
  byId('source-search').value = '';
  const coordinate = byId('source-coordinate');
  coordinate.textContent = target.file + ':' + target.line + ':' + target.column;
  coordinate.title = coordinate.textContent + ' · SHA-256 ' + target.sha256;
  openView('source');
  byId('source-back').focus();
}

function splitPages(text, output, render) {
  if (!text) return [''];
  const parts = [];
  let start = 0;
  while (start < text.length) {
    // Find the last character whose wrapped lines fit inside the reading pane.
    let low = start + 1;
    let high = Math.min(start + 256, text.length);
    const fits = end => {
      if (render) render(output, start, end);
      else output.textContent = text.slice(start, end);
      return output.scrollHeight <= output.clientHeight;
    };
    while (high < text.length && fits(high)) {
      low = high + 1;
      high = Math.min(text.length, start + (high - start) * 2);
    }
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(middle)) low = middle + 1;
      else high = middle - 1;
    }
    let end = Math.max(start + 1, high);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf(' ', end - 1), text.lastIndexOf('\n', end - 1));
      if (boundary >= start + Math.floor((end - start) * 0.75)) end = boundary + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end += end === start + 1 ? 1 : -1;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

function showPage() {
  const count = Math.max(1, ...pages.map(parts => parts.length));
  page = Math.min(page, count - 1);
  for (const [index, output] of outputs.entries()) {
    if (view === 'source' && index === 0) {
      const start = pages[0].slice(0, page).reduce((offset, part) => offset + part.length, 0);
      editor.render(output, start, start + pages[0][page].length);
    } else if (rich[index] && pages[index]?.[page]) {
      const start = pages[index].slice(0, page).reduce((offset, part) => offset + part.length, 0);
      rich[index].render(output, start, start + pages[index][page].length);
    } else output.textContent = pages[index]?.[page] ?? '';
  }
  byId('counter').textContent = view === 'files' ? 'Selected case' : 'Page ' + (page + 1) + ' / ' + count;
  previous.disabled = page === 0;
  next.disabled = page + 1 >= count;
}

function layout() {
  const sheet = sheets.get(picker.value);
  const split = paired.has(view);
  reading.hidden = view === 'files';
  files.hidden = view !== 'files';
  byId('trace-controls').hidden = view !== 'trace' || !traceByCase.has(picker.value);
  byId('source-controls').hidden = view !== 'source';
  byId('reply-controls').hidden = view !== 'reply';
  reading.classList.toggle('single', !split);
  outputs[0].classList.toggle('source-code', view === 'source');
  for (const output of outputs) output.classList.toggle('rich-body', !['reply', 'source'].includes(view));
  columns[1].hidden = !split;
  columns[0].querySelector('h3').textContent = split ? 'Lexical' : headings[view];
  byId('view-name').textContent = headings[view];
  for (const button of tabs) button.setAttribute('aria-pressed', String(button.dataset.tab === view || (button.dataset.tab === 'trace' && view === 'source')));
  const field = (root, name) => richDocument(root.querySelector('[data-field="' + name + '"]'));
  rich = [];
  const paginate = (content, index) => {
    if (typeof content === 'string') return splitPages(content, outputs[index]);
    rich[index] = content;
    return splitPages(content.text, outputs[index], content.render);
  };
  if (view === 'files') pages = [];
  else if (view === 'trace') {
    pages = ['lexical', 'pagerank'].map((arm, index) => paginate(traceText(arm), index));
  } else if (view === 'source') {
    const offset = editor.lines[sourceLine - 1].offset;
    const before = offset ? splitPages(editor.text.slice(0, offset), outputs[0]) : [];
    pages = [[...before, ...splitPages(editor.text.slice(offset), outputs[0])]];
    page = before.length;
    byId('source-line').value = sourceLine;
  } else if (view === 'reply' && replyDifferences.checked) {
    const changes = sheet.querySelectorAll('[data-reply-difference]');
    replyIndex = Math.max(0, Math.min(replyIndex, changes.length - 1));
    const change = changes[replyIndex];
    const message = sheet.querySelector('[data-reply-diff-status]').textContent;
    byId('reply-position').textContent = change ? (replyIndex + 1) + ' / ' + changes.length : '0 fields';
    previousField.disabled = replyIndex === 0;
    nextField.disabled = replyIndex + 1 >= changes.length;
    pages = ['lexical', 'pagerank'].map((arm, index) => paginate(
      change ? richDocument(change.querySelector('[data-value="' + arm + '"]')) : message, index));
  } else if (split) {
    if (view === 'reply') {
      byId('reply-position').textContent = 'Full replies';
      previousField.disabled = true;
      nextField.disabled = true;
    }
    pages = ['lexical', 'pagerank'].map((arm, index) =>
      paginate(field(sheet.querySelector('[data-arm="' + arm + '"]'), view), index));
  } else {
    pages = [paginate(['verification', 'judgment', 'experiment', 'feedback'].includes(view) ? report : field(sheet, view), 0)];
  }
  showPage();
}

function openView(name) {
  if (name !== 'source' && location.hash.startsWith('#source/')) history.replaceState(null, '', '#trace');
  view = name;
  page = 0;
  layout();
}

function updateDocument() {
  const selected = picker.selectedOptions[0];
  byId('document-title').textContent = selected.textContent;
  byId('collection').textContent = selected.parentElement.label;
  byId('benchmark').hidden = selected.parentElement.label !== 'Held-out repairs';
  for (const link of files.querySelectorAll(':scope > div a')) {
    link.search = new URLSearchParams({ case: picker.value }).toString();
  }
  for (const [id, button] of folderButtons) button.setAttribute('aria-current', String(id === picker.value));
}

function openCase() {
  updateDocument();
  replyIndex = 0;
  if (view === 'trace' || view === 'source') openTrace();
  else openView(view === 'reply' ? 'reply' : 'overview');
}

picker.addEventListener('change', openCase);
for (const button of tabs) button.addEventListener('click', () => {
  if (button.dataset.tab === 'trace' && view !== 'source') openTrace();
  else openView(button.dataset.tab);
});
for (const picker of [delivery, filter]) picker.addEventListener('change', () => {
  selectInstructions();
  openView('trace');
});
replyDifferences.addEventListener('change', () => {
  replyIndex = 0;
  openView('reply');
});
previousField.addEventListener('click', () => {
  replyIndex -= 1;
  openView('reply');
});
nextField.addEventListener('click', () => {
  replyIndex += 1;
  openView('reply');
});
differences.addEventListener('change', () => {
  selectInstructions(instruction.value);
  openView('trace');
});
traceSearch.addEventListener('input', () => {
  selectInstructions();
  openView('trace');
});
byId('source-executed').addEventListener('click', () => jumpToLine(sourceTarget.line));
byId('source-goto').addEventListener('submit', event => {
  event.preventDefault();
  jumpToLine(Number(byId('source-line').value));
});
byId('source-find').addEventListener('submit', event => {
  event.preventDefault();
  const line = editor.find(byId('source-search').value.trim());
  if (line) jumpToLine(line);
  else showPage();
  byId('view-name').textContent = line ? 'Match on line ' + line : 'No matching text';
});
instruction.addEventListener('change', () => {
  selectInstruction();
  openView('trace');
});
byId('trace-previous').addEventListener('click', () => {
  instruction.selectedIndex -= 1;
  selectInstruction();
  openView('trace');
});
byId('trace-next').addEventListener('click', () => {
  instruction.selectedIndex += 1;
  selectInstruction();
  openView('trace');
});
byId('source-back').addEventListener('click', () => {
  openView('trace');
  sourceLink.focus();
});
function followLocation() {
  const destination = location.hash.slice(1);
  if (destination === 'trace' && view !== 'trace') openTrace();
  else if (['overview', 'context', 'reply', 'mandatory', 'files'].includes(destination)) openView(destination);
  else if (destination.startsWith('feedback/')) void openExperiment(destination.slice('feedback/'.length), 'feedback');
  else if (destination.startsWith('experiment/')) void openExperiment(destination.slice('experiment/'.length));
  else if (destination.startsWith('reviewed/')) void openReviewedCapture(destination.slice('reviewed/'.length));
  else followSource();
}

reading.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState(null, '', link.hash);
  followLocation();
});
window.addEventListener('hashchange', followLocation);
for (const button of document.querySelectorAll('[data-menu]')) {
  button.addEventListener('click', () => openView(button.dataset.menu));
}
previous.addEventListener('click', () => { page -= 1; showPage(); });
next.addEventListener('click', () => { page += 1; showPage(); });
byId('verify').addEventListener('click', async () => {
  const button = byId('verify');
  button.disabled = true;
  const caseId = picker.value;
  report = 'Replaying the selected pair against the pinned runtime…';
  openView('verification');
  try {
    const response = await fetch('/decompiler/verify?' + new URLSearchParams({ case: caseId }), { method: 'POST' });
    if (!response.ok) throw Error(await response.text());
    report = reportDocument(await response.text());
  } catch (error) {
    report = 'Offline replay could not be verified.\n\n' + error.message;
  } finally {
    button.disabled = false;
    if (view === 'verification' && picker.value === caseId) openView('verification');
  }
});
const benchmarkStart = byId('benchmark-start');
const benchmarkJudge = byId('benchmark-judge');
const benchmarkReview = byId('benchmark-review');
const benchmarkCompare = byId('benchmark-compare');
const benchmarkDownload = byId('benchmark-download');
const reviewDownload = byId('benchmark-review-download');
const benchmarkStatus = byId('benchmark-status');
let benchmarkJob;
let tracking = false;

async function benchmarkRequest(query, options) {
  const path = options?.method === 'POST' ? 'benchmark-action' : 'benchmark';
  const response = await fetch('/decompiler/' + path + '?' + new URLSearchParams(query), options);
  if (!response.headers.get('content-type')?.startsWith('application/json')) {
    const error = Error('The preview gateway could not load the benchmark (' + response.status + ').');
    error.status = response.status;
    throw error;
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.message);
  return result;
}

async function trackBenchmark(request) {
  tracking = true;
  benchmarkStart.disabled = benchmarkJudge.disabled = true;
  try {
    let job = await request;
    benchmarkJob = job;
    sessionStorage.setItem('evaluation-benchmark', job.id);
    while (['capturing', 'verifying', 'judging'].includes(job.status)) {
      benchmarkStatus.textContent = job.caseId + ' · ' + job.status + '…';
      await new Promise(resolve => setTimeout(resolve, 1500));
      job = await benchmarkRequest({ job: job.id });
      benchmarkJob = job;
    }
    if (!['verified', 'judged'].includes(job.status)) throw Error(job.message);
    benchmarkStatus.textContent = job.caseId + ' · ' + (job.status === 'judged'
      ? 'Attributed model judgment available.'
      : job.message ?? 'Both arms matched offline. Awaiting review.');
    benchmarkDownload.search = new URLSearchParams({ case: job.id }).toString();
    benchmarkDownload.hidden = false;
    benchmarkJudge.hidden = job.status !== 'verified';
    benchmarkReview.hidden = benchmarkCompare.hidden = reviewDownload.hidden = job.status !== 'judged';
    reviewDownload.search = new URLSearchParams({ job: job.id, action: 'review', format: 'rel' }).toString();
  } catch (error) {
    benchmarkStatus.textContent = error.message;
  } finally {
    tracking = false;
    benchmarkStart.disabled = benchmarkJudge.disabled = false;
  }
}

benchmarkStart.addEventListener('click', () => {
  benchmarkDownload.hidden = benchmarkJudge.hidden = benchmarkReview.hidden = benchmarkCompare.hidden = reviewDownload.hidden = true;
  benchmarkStatus.textContent = 'Starting benchmark…';
  void trackBenchmark(benchmarkRequest({ case: picker.value }, { method: 'POST' }));
});
benchmarkJudge.addEventListener('click', () => {
  void trackBenchmark(benchmarkRequest({ action: 'judge', job: benchmarkJob.id }, { method: 'POST' }));
});
benchmarkReview.addEventListener('click', async () => {
  const id = benchmarkJob.id;
  try {
    const result = await benchmarkRequest({ action: 'review', job: id });
    if (benchmarkJob.id === id && view === 'files') {
      report = traceDocument(result.html);
      openView('judgment');
    }
  } catch (error) {
    benchmarkStatus.textContent = error.message;
  }
});
async function loadReviewedCapture(id) {
  if (sheets.has(id)) return;
  const { title, html } = await benchmarkRequest({ action: 'compare', job: id });
  const doc = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-sheet]');
  if (!doc || doc.dataset.sheet !== id) throw Error('Reviewed comparison did not match its capture.');
  const sheet = document.importNode(doc, true);
  document.body.append(sheet);
  sheets.set(id, sheet);
  let group = picker.querySelector('[data-reviewed-captures]');
  if (!group) {
    group = document.createElement('optgroup');
    group.label = 'Reviewed benchmark captures';
    group.dataset.reviewedCaptures = '';
    picker.append(group);
  }
  group.append(new Option(title, id));
}

async function openReviewedCapture(id) {
  try {
    await loadReviewedCapture(id);
    picker.value = id;
    updateDocument();
    replyIndex = 0;
    openView('overview');
  } catch (error) {
    benchmarkStatus.textContent = error.message;
    openView('files');
  }
}

benchmarkCompare.addEventListener('click', () => {
  history.pushState(null, '', '#reviewed/' + benchmarkJob.id);
  void openReviewedCapture(benchmarkJob.id);
});
async function openExperiment(id, action = 'experiment') {
  try {
    const result = await benchmarkRequest({ action, job: id });
    history.replaceState(null, '', '#' + action + '/' + result.id);
    report = traceDocument(result.html);
    openView(action);
  } catch (error) {
    report = error.message;
    openView(action);
  }
}
byId('benchmark-experiment').addEventListener('click', () => void openExperiment('latest'));
byId('benchmark-feedback').addEventListener('click', () => void openExperiment('latest', 'feedback'));
const previousJob = sessionStorage.getItem('evaluation-benchmark');
if (previousJob && !tracking) void trackBenchmark(benchmarkRequest({ job: previousJob }));
window.addEventListener('resize', layout);
updateDocument();
layout();
followLocation();
