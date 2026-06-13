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
    return `<pre class="mermaid">${token.code}</pre>`;
  },
};

export default mermaidExtension;
