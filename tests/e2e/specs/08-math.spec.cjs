const { test, expect } = require('../helpers.cjs');

test.describe('Phase 5 — Math (KaTeX)', () => {
  test('MA-01 inline $…$ renders KaTeX with MathML for accessibility', async ({ app }) => {
    await app.boot();
    await app.setContent('Einstein: $E = mc^2$ here.');
    await expect(app.page.locator('#preview p .katex')).toHaveCount(1);
    await expect(app.page.locator('#preview .katex-display')).toHaveCount(0);
    await expect(app.page.locator('#preview .katex math')).toHaveCount(1);
    await expect(app.page.locator('#preview .katex-html')).toHaveAttribute('aria-hidden', 'true');
    await expect(app.page.locator('#renderStatus')).toHaveText('Rendered');
    app.expectNoErrors();
  });

  test('MA-02 $$ block renders display math; inline $$…$$ is display mode too', async ({ app }) => {
    await app.boot();
    await app.setContent('$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n\nAnd $$y = x$$ inline.');
    await expect(app.page.locator('#preview .katex-display')).toHaveCount(2);
  });

  test('MA-03 broken math shows the source in red and never breaks the document', async ({ app }) => {
    await app.boot();
    await app.setContent('before $\\frac{a$ after\n\n# Still here');
    const err = app.page.locator('#preview .katex-error');
    await expect(err).toHaveCount(1);
    await expect(err).toContainText('\\frac{a');
    const color = await err.evaluate((e) => getComputedStyle(e).color);
    expect(color).toMatch(/rgb\(204, 0, 0\)/);
    await expect(app.page.locator('#preview h1')).toHaveText('Still here');
    await expect(app.page.locator('#renderStatus')).toHaveText('Rendered');
    await expect(app.page.locator('#preview .render-error')).toHaveCount(0);
  });

  test('MA-04 \\$ escapes to a literal dollar sign', async ({ app }) => {
    await app.boot();
    await app.setContent('Price \\$5 and \\$10 total.');
    await expect(app.page.locator('#preview .katex')).toHaveCount(0);
    await expect(app.page.locator('#preview p')).toHaveText('Price $5 and $10 total.');
  });

  test('MA-05 currency "$5 and $10" (closing $ followed by a digit) is not treated as math', async ({ app }) => {
    await app.boot();
    await app.setContent('Costs $5 and $10 today.');
    const n = await app.page.locator('#preview .katex').count();
    const text = await app.page.locator('#preview p').innerText();
    test.info().annotations.push({ type: 'observed', description: `katex spans: ${n}; text: "${text}"` });
    expect(n).toBe(0);
    await expect(app.page.locator('#preview p')).toHaveText('Costs $5 and $10 today.');
  });

  test('MA-06 "$5 and $x^2$" on one line (documented as "math per Pandoc convention")', async ({ app }) => {
    await app.boot();
    await app.setContent('Pay $5 and $x^2$ now.');
    const ok = await app.page.locator('#preview .katex').count();
    const bad = await app.page.locator('#preview .katex-error').count();
    const text = await app.page.locator('#preview p').innerText();
    test.info().annotations.push({ type: 'observed', description: `katex: ${ok}, katex-error: ${bad}; rendered text: "${text}"` });
    expect(bad, 'a dollar amount before inline math turns the whole span into a red KaTeX error').toBe(0);
    expect(ok).toBeGreaterThanOrEqual(1);
  });

  test('MA-06b "$5 and $10 or $x$": currency pair followed by real math', async ({ app }) => {
    await app.boot();
    await app.setContent('Pay $5 and $10 or $x$ now.');
    const ok = await app.page.locator('#preview .katex').count();
    const bad = await app.page.locator('#preview .katex-error').count();
    const text = await app.page.locator('#preview p').innerText();
    test.info().annotations.push({ type: 'observed', description: `katex: ${ok}, katex-error: ${bad}; rendered text: "${text}"` });
    expect(bad, 'currency amounts on the same line as math render as a red KaTeX error').toBe(0);
    expect(text).toContain('$5 and $10');
  });

  test('MA-07 dollars inside code spans / fenced code are never math', async ({ app }) => {
    await app.boot();
    await app.setContent('Use `$x$` and `$$y$$`.\n\n```sh\necho $HOME $x$ \n```');
    await expect(app.page.locator('#preview .katex')).toHaveCount(0);
    await expect(app.page.locator('#preview code').first()).toHaveText('$x$');
  });

  test('MA-08 math inside tables, lists, blockquotes and headings', async ({ app }) => {
    await app.boot();
    await app.setContent('| a | b |\n|---|---|\n| $x$ | $y$ |\n\n- item $z$\n\n> quote $w$\n\n## Head $h$');
    await expect(app.page.locator('#preview td .katex')).toHaveCount(2);
    await expect(app.page.locator('#preview li .katex')).toHaveCount(1);
    await expect(app.page.locator('#preview blockquote .katex')).toHaveCount(1);
    await expect(app.page.locator('#preview h2 .katex')).toHaveCount(1);
  });

  test('MA-09 angle brackets inside math are safe', async ({ app }) => {
    await app.boot();
    await app.setContent('$a < b > c$ and $<script>$');
    await expect(app.page.locator('#preview .katex')).toHaveCount(2);
    expect(await app.page.locator('#preview script').count()).toBe(0);
    app.expectNoErrors();
  });

  test('MA-10 javascript: URLs via \\href are blocked (KaTeX trust=false)', async ({ app }) => {
    await app.boot();
    await app.setContent('$\\href{javascript:alert(1)}{click}$');
    expect(await app.page.locator('#preview a[href^="javascript:"]').count()).toBe(0);
  });

  test('MA-11 unmatched / empty delimiters are literal and harmless', async ({ app }) => {
    await app.boot();
    await app.setContent('a $ b\n\nc $$ d\n\n$$\n$$');
    await expect(app.page.locator('#preview .katex-error')).toHaveCount(0);
    await expect(app.page.locator('#renderStatus')).toHaveText('Rendered');
    expect(await app.page.locator('#preview').innerText()).toContain('a $ b');
    app.expectNoErrors();
  });

  test('MA-12 display math maps to its source lines (locate)', async ({ app }) => {
    await app.boot();
    await app.setContent('# T\n\npara\n\n$$\nx^2\n$$\n\nend');
    const block = app.page.locator('#preview .katex-display');
    await expect(block).toHaveAttribute('data-line', '5');
    await block.click();
    expect(await app.caretLine()).toBe(5);
  });

  test('MA-13 KaTeX stylesheet is loaded in the app (MathML visually hidden)', async ({ app }) => {
    await app.boot();
    await app.setContent('$x$');
    const pos = await app.page.locator('#preview .katex-mathml').evaluate((e) => getComputedStyle(e).position);
    expect(pos).toBe('absolute');
  });

  test('MA-14 performance: 150 equations render promptly', async ({ app }) => {
    await app.boot();
    const t0 = Date.now();
    await app.setContent(Array.from({ length: 150 }, (_, i) => `Eq ${i}: $\\frac{a_{${i}}}{b} + \\sqrt{x^{${i}}}$`).join('\n\n'));
    await expect(app.page.locator('#preview .katex')).toHaveCount(150);
    expect(Date.now() - t0).toBeLessThan(6000);
  });

  test('MA-15 math survives a theme switch and reader mode', async ({ app }) => {
    await app.boot();
    await app.setContent('$x$');
    await app.page.click('#themeToggle');
    await app.page.click('#readerBtn');
    await app.waitRendered();
    await expect(app.page.locator('#preview .katex')).toHaveCount(1);
    app.expectNoErrors();
  });

  test('MA-16 sample document math renders as documented', async ({ app }) => {
    await app.boot();
    await expect(app.page.locator('#preview .katex-display')).toHaveCount(1);
    await expect(app.page.locator('#preview p .katex')).toHaveCount(1);
    expect(await app.page.locator('#preview').innerText()).toMatch(/write \$ (for|to force) a literal dollar sign/);
  });
});
