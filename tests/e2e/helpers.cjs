const base = require('@playwright/test');
const fs = require('fs');
const { expect } = base;

const DEV = 'http://127.0.0.1:5199/';
const PREVIEW = 'http://127.0.0.1:4199/';

// Console noise that is environmental (no internet for Google Fonts etc.), not a product defect.
const IGNORE = [
  /fonts\.g(oogleapis|static)\.com/,
  /favicon/,
  /ERR_INTERNET_DISCONNECTED/,
  /ERR_NAME_NOT_RESOLVED/,
  /ERR_CONNECTION/,
  /Failed to load resource/,
];

const test = base.test.extend({
  app: async ({ page, context, browserName }, use, testInfo) => {
    const errors = [];
    const infos = [];
    const warnings = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && !IGNORE.some((re) => re.test(t))) errors.push('console.error: ' + t);
      if (m.type() === 'warning') warnings.push(t);
      if (m.type() === 'info') infos.push(t);
    });

    const app = {
      page,
      context,
      browserName,
      errors,
      infos,
      warnings,
      DEV,
      PREVIEW,

      async boot({ url = DEV, init = null, waitState = 'done' } = {}) {
        if (init) await page.addInitScript(init);
        await page.goto(url);
        await page.waitForSelector('#editor');
        await expect(page.locator('#renderStatus')).toHaveAttribute('data-state', new RegExp(waitState), { timeout: 60000 });
      },

      status: () => page.locator('#renderStatus').getAttribute('data-state'),

      async waitRendered() {
        await expect(page.locator('#renderStatus')).not.toHaveAttribute('data-state', 'busy', { timeout: 30000 });
      },

      async setContent(text) {
        await page.evaluate((t) => {
          const ed = document.getElementById('editor');
          ed.value = t;
          ed.dispatchEvent(new Event('input', { bubbles: true }));
        }, text);
        await app.waitRendered();
      },

      content: () => page.inputValue('#editor'),

      async setCaret(start, end = start) {
        await page.evaluate(([s, e]) => {
          const ed = document.getElementById('editor');
          ed.focus();
          ed.setSelectionRange(s, e);
        }, [start, end]);
      },

      caret: () =>
        page.evaluate(() => {
          const ed = document.getElementById('editor');
          return { start: ed.selectionStart, end: ed.selectionEnd };
        }),

      async caretLine() {
        const { start } = await app.caret();
        const c = await app.content();
        return c.slice(0, start).split('\n').length;
      },

      toast: () => page.locator('#toast'),

      async press(keys) {
        await page.keyboard.press(keys);
      },

      expectNoErrors() {
        expect(errors, 'unexpected console/page errors:\n' + errors.join('\n')).toEqual([]);
      },

      // ---- image / file synthesis -------------------------------------------------
      async makeFileAndDispatch({ target, event, name, type, content, size, valid = true }) {
        return page.evaluate(
          async ({ target, event, name, type, content, size, valid }) => {
            const parts = [];
            if (type.startsWith('image/') && valid && type !== 'image/svg+xml') {
              const c = document.createElement('canvas');
              c.width = 8;
              c.height = 8;
              const ctx = c.getContext('2d');
              ctx.fillStyle = '#f00';
              ctx.fillRect(0, 0, 8, 8);
              const blob = await new Promise((r) => c.toBlob(r, type));
              parts.push(blob);
              if (size && size > blob.size) parts.push(new Uint8Array(size - blob.size));
            } else {
              parts.push(content || '');
              if (size) parts.push(new Uint8Array(size));
            }
            const file = new File(parts, name, { type });
            const dt = new DataTransfer();
            dt.items.add(file);
            const el = document.querySelector(target);
            if (event === 'paste') {
              const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
              el.dispatchEvent(ev);
              return { prevented: ev.defaultPrevented, size: file.size };
            }
            el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
            const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(ev);
            return { prevented: ev.defaultPrevented, size: file.size };
          },
          { target, event, name, type, content, size, valid }
        );
      },

      pasteImage(opts = {}) {
        return app.makeFileAndDispatch({ target: '#editor', event: 'paste', name: 'shot.png', type: 'image/png', ...opts });
      },
      dropFile(opts = {}) {
        return app.makeFileAndDispatch({ target: '#editor', event: 'drop', ...opts });
      },

      // ---- OPFS handles (stand-in for user-picked FileSystemFileHandles) ------------
      async makeOpfsFile(name, content) {
        await page.evaluate(
          async ({ name, content }) => {
            const root = await navigator.storage.getDirectory();
            const h = await root.getFileHandle(name, { create: true });
            const w = await h.createWritable();
            await w.write(content);
            await w.close();
            window.__h = window.__h || {};
            window.__h[name] = h;
          },
          { name, content }
        );
      },
      async announceHandle(name) {
        await page.evaluate((name) => {
          document.dispatchEvent(new CustomEvent('md-file-handle', { detail: { handle: window.__h[name] } }));
        }, name);
        // remember() is async (IndexedDB); give it a beat.
        await page.waitForTimeout(150);
      },
      async removeOpfsFile(name) {
        await page.evaluate(async (name) => {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry(name);
        }, name);
      },
      async readOpfsFile(name) {
        return page.evaluate(async (name) => {
          const root = await navigator.storage.getDirectory();
          const h = await root.getFileHandle(name);
          return (await h.getFile()).text();
        }, name);
      },

      async openViaInput(name, text) {
        await page.setInputFiles('#fileInput', { name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') });
        await expect(page.locator('#fileNameBadge')).toHaveText(name);
        await app.waitRendered();
      },

      async download(action) {
        const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
        const p = await dl.path();
        return { name: dl.suggestedFilename(), body: fs.readFileSync(p, 'utf8') };
      },

      async readClipboard() {
        return page.evaluate(async () => {
          const out = {};
          const items = await navigator.clipboard.read();
          for (const it of items) {
            for (const t of it.types) out[t] = await (await it.getType(t)).text();
          }
          return out;
        });
      },
    };

    await use(app);
    if (errors.length) await testInfo.attach('console-errors', { body: errors.join('\n'), contentType: 'text/plain' });
    if (warnings.length) await testInfo.attach('console-warnings', { body: warnings.join('\n'), contentType: 'text/plain' });
  },
});

module.exports = { test, expect, DEV, PREVIEW };
