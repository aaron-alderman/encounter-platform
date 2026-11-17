export function createEditor(source, target) {
  const lines = [];
  const segments = [];
  const rawLines = source.text.split('\n');
  const width = String(rawLines.length).length;
  let offset = 0;
  let rawOffset = 0;
  let spanIndex = 0;

  for (const [index, rawLine] of rawLines.entries()) {
    const number = index + 1;
    const code = rawLine.replace(/\r$/, '');
    const executed = number === target.line;
    const prefix = (executed ? '▶ ' : '  ') + String(number).padEnd(width) + ' │ ';
    const line = { code, offset, prefixLength: prefix.length };
    lines.push(line);
    const push = (text, kind) => {
      if (!text) return;
      const css = [kind, executed ? 'executed' : ''].filter(Boolean).join(' ');
      segments.push({ start: offset, end: offset + text.length, text, css });
      offset += text.length;
    };
    push(prefix, 'gutter');
    let cursor = rawOffset;
    while (spanIndex < source.spans.length && source.spans[spanIndex].start < rawOffset + code.length) {
      const span = source.spans[spanIndex++];
      push(source.text.slice(cursor, span.start), '');
      push(source.text.slice(span.start, span.end), span.kind);
      cursor = span.end;
    }
    push(source.text.slice(cursor, rawOffset + code.length), '');
    if (number < rawLines.length) push('\n', '');
    rawOffset += rawLine.length + 1;
  }

  let match = null;
  function find(query) {
    if (!query) return null;
    const needle = query.toLowerCase();
    const first = match?.query === query ? match.line % lines.length : 0;
    for (let step = 0; step < lines.length; step += 1) {
      const index = (first + step) % lines.length;
      const line = lines[index];
      const column = line.code.toLowerCase().indexOf(needle);
      if (column >= 0) {
        const start = line.offset + line.prefixLength + column;
        match = { query, line: index + 1, start, end: start + query.length };
        return match.line;
      }
    }
    match = null;
    return null;
  }

  function render(output, start, end) {
    const fragment = document.createDocumentFragment();
    const append = (segment, a, b, css) => {
      if (a >= b) return;
      const text = segment.text.slice(a - segment.start, b - segment.start);
      if (!css) fragment.append(text);
      else {
        const token = document.createElement('span');
        token.className = css;
        token.textContent = text;
        fragment.append(token);
      }
    };
    for (const segment of segments) {
      if (segment.end <= start) continue;
      if (segment.start >= end) break;
      const a = Math.max(start, segment.start);
      const b = Math.min(end, segment.end);
      if (match && a < match.end && b > match.start) {
        append(segment, a, Math.min(b, match.start), segment.css);
        append(segment, Math.max(a, match.start), Math.min(b, match.end), segment.css + ' match');
        append(segment, Math.max(a, match.end), b, segment.css);
      } else append(segment, a, b, segment.css);
    }
    output.replaceChildren(fragment);
  }

  return { text: segments.map(segment => segment.text).join(''), lines, find, render };
}
