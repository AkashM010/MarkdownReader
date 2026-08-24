/**
 * Marked extension for mermaid code blocks.
 * Transforms ```mermaid ... ``` blocks into `<pre class="mermaid">` elements
 * that mermaid.js can later render into SVG diagrams.
 */
const mermaidExtension = {
  name: 'mermaid',
  level: 'block',
  start(src) {
    return src.match(/^```mermaid\n/m)?.index;
  },
  tokenizer(src) {
    const rule = /^(```mermaid\n[\s\S]*?```)/;
    const match = rule.exec(src);
    if (match) {
      const raw = match[1];
      const code = raw
        .replace(/```mermaid\n/, '')
        .replace(/```$/, '')
        .trim();
      return {
        type: 'mermaid',
        raw,
        code,
      };
    }
  },
  renderer(token) {
    // Escape so the source survives innerHTML parsing intact: a literal
    // </pre> or tag-like text in a diagram must not become real markup.
    // mermaid entity-decodes when it reads the element, and textContent
    // then equals the raw source (which the SVG cache key relies on).
    const escaped = token.code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre class="mermaid">${escaped}</pre>`;
  },
};

export default mermaidExtension;
