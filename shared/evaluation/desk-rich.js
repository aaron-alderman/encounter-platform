const inlineTags = new Set(['STRONG', 'EM', 'CODE', 'A', 'MARK']);
const destinations = new Set(['#overview', '#context', '#reply', '#trace', '#mandatory', '#files']);

export function richDocument(root) {
  const spans = [];
  let length = 0;
  const visit = (node, style) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.data) {
        spans.push({ start: length, end: length + node.data.length, text: node.data, style });
        length += node.data.length;
      }
      return;
    }
    let inline = style;
    if (inlineTags.has(node.tagName)) {
      const href = node.getAttribute('href');
      inline = node.tagName === 'A' && !destinations.has(href) && !/^#reviewed\/benchmark-[a-f0-9-]{36}$/.test(href ?? '')
        ? style
        : [...style, { tag: node.tagName.toLowerCase(), css: node.className, href }];
    }
    for (const child of node.childNodes) visit(child, inline);
  };
  if (root) visit(root, []);

  function render(output, start, end) {
    const fragment = document.createDocumentFragment();
    let low = 0;
    let high = spans.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (spans[middle].end <= start) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < spans.length && spans[index].start < end; index += 1) {
      const span = spans[index];
      const text = span.text.slice(Math.max(0, start - span.start), end - span.start);
      let content = document.createTextNode(text);
      for (let index = span.style.length - 1; index >= 0; index -= 1) {
        const style = span.style[index];
        const node = document.createElement(style.tag);
        node.className = style.css;
        if (style.tag === 'a') node.href = style.href;
        node.append(content);
        content = node;
      }
      fragment.append(content);
    }
    output.replaceChildren(fragment);
  }
  return { text: spans.map(span => span.text).join(''), render };
}

export function traceDocument(html) {
  return richDocument(new DOMParser().parseFromString(html, 'text/html').body);
}

export function reportDocument(html) {
  const report = new DOMParser().parseFromString(html, 'text/html');
  const blocks = document.createDocumentFragment();
  for (const block of report.querySelectorAll('main h2, main h3, main p, main li, main pre')) {
    if (blocks.childNodes.length) blocks.append('\n\n');
    if (['H2', 'H3', 'PRE'].includes(block.tagName)) {
      const styled = document.createElement(block.tagName === 'PRE' ? 'code' : 'strong');
      styled.className = block.tagName === 'PRE' ? 'rich-code' : 'rich-heading';
      styled.textContent = block.textContent;
      blocks.append(styled);
    } else blocks.append(...block.childNodes);
  }
  return richDocument(blocks);
}
