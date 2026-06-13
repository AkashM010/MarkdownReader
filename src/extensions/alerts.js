/**
 * Marked extension for GitHub-flavored alerts (callouts).
 * Transforms `> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`
 * into styled admonition blocks.
 */
const alertExtension = {
  name: 'alert',
  level: 'block',
  start(src) {
    return src.match(/>\s*\[!/)?.index;
  },
  tokenizer(src) {
    const rule = /^(>[ ]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*\n(?:>[^\n]*\n?)*)/;
    const match = rule.exec(src);
    if (match) {
      const raw = match[1];
      const typeMatch = raw.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
      const alertType = typeMatch[1].toLowerCase();

      const lines = raw.split('\n');
      const bodyLines = lines.slice(1).map(l => l.replace(/^>\s?/, ''));
      const bodyText = bodyLines.join('\n').trim();

      return {
        type: 'alert',
        raw,
        tokens: bodyText ? this.lexer.blockTokens(bodyText) : [],
        alertType,
      };
    }
  },
  renderer(token) {
    const iconMap = {
      note: '📝',
      tip: '💡',
      important: 'ℹ️',
      warning: '⚠️',
      caution: '🚫',
    };
    const labelMap = {
      note: 'Note',
      tip: 'Tip',
      important: 'Important',
      warning: 'Warning',
      caution: 'Caution',
    };
    const bodyHTML = token.tokens.length > 0
      ? this.parser.parse(token.tokens)
      : '';
    return `<div class="markdown-alert markdown-alert-${token.alertType}">
      <p class="markdown-alert-title">
        <span class="markdown-alert-icon">${iconMap[token.alertType]}</span>
        ${labelMap[token.alertType]}
      </p>
      ${bodyHTML}
    </div>`;
  },
};

export default alertExtension;
