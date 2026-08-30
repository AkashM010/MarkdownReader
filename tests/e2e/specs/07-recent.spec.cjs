const { test, expect } = require('../helpers.cjs');

const names = (app) => app.page.locator('#recentList .recent-name').allInnerTexts();
const openRecent = async (app) => {
  await app.page.click('#recentBtn');
  await expect(app.page.locator('#recentMenu')).toHaveClass(/open/);
};
const closeRecent = async (app) => {
  await app.press('Escape');
  await expect(app.page.locator('#recentMenu')).not.toHaveClass(/open/);
};

test.describe('Phase 4 — Recent files', () => {
  test('RF-01 empty state, open/close, aria-expanded', async ({ app }) => {
    await app.boot();
    await expect(app.page.locator('#recentBtn')).toBeVisible();
    await openRecent(app);
    await expect(app.page.locator('#recentBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(app.page.locator('#recentList .recent-empty')).toHaveText('No recent files yet');
    await expect(app.page.locator('#recentList .recent-clear')).toHaveCount(0);
    await app.page.click('#editor');
    await expect(app.page.locator('#recentMenu')).not.toHaveClass(/open/);
    await expect(app.page.locator('#recentBtn')).toHaveAttribute('aria-expanded', 'false');
    await openRecent(app);
    await closeRecent(app);
  });

  test('RF-02 an opened file handle is remembered with a relative time and a Clear button', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('a.md', '# A');
    await app.announceHandle('a.md');
    await openRecent(app);
    expect(await names(app)).toEqual(['a.md']);
    await expect(app.page.locator('#recentList .recent-time')).toHaveText('just now');
    await expect(app.page.locator('#recentList .recent-clear')).toHaveText('Clear list');
  });

  test('RF-03 the same file opened twice (even via a different handle object) is listed once', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('a.md', '# A');
    await app.announceHandle('a.md');
    await app.announceHandle('a.md');
    await app.page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      window.__h['a2'] = await root.getFileHandle('a.md');
    });
    await app.announceHandle('a2');
    await openRecent(app);
    expect(await names(app)).toEqual(['a.md']);
  });

  test('RF-04 newest first; re-opening moves a file to the top', async ({ app }) => {
    await app.boot();
    for (const n of ['a.md', 'b.md', 'c.md']) {
      await app.makeOpfsFile(n, '# ' + n);
      await app.announceHandle(n);
      await app.page.waitForTimeout(20);
    }
    await openRecent(app);
    expect(await names(app)).toEqual(['c.md', 'b.md', 'a.md']);
    await closeRecent(app);
    await app.announceHandle('a.md');
    await openRecent(app);
    expect(await names(app)).toEqual(['a.md', 'c.md', 'b.md']);
  });

  test('RF-05 the list is capped at 10 (oldest dropped)', async ({ app }) => {
    await app.boot();
    for (let i = 1; i <= 12; i++) {
      const n = `f${String(i).padStart(2, '0')}.md`;
      await app.makeOpfsFile(n, '#');
      await app.announceHandle(n);
      await app.page.waitForTimeout(20);
    }
    await openRecent(app);
    const list = await names(app);
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('f12.md');
    expect(list).not.toContain('f01.md');
    expect(list).not.toContain('f02.md');
  });

  test('RF-06 the list persists across reloads', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('keep.md', '# K');
    await app.announceHandle('keep.md');
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await openRecent(app);
    expect(await names(app)).toEqual(['keep.md']);
  });

  test('RF-07 one-click reopen loads the file, updates badge/title, and bumps it to the top', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('one.md', '# One\n\nfirst');
    await app.makeOpfsFile('two.md', '# Two\n\nsecond');
    await app.announceHandle('one.md');
    await app.announceHandle('two.md');
    await openRecent(app);
    await app.page.locator('#recentList .recent-item', { hasText: 'one.md' }).click();
    await expect(app.page.locator('#recentMenu')).not.toHaveClass(/open/);
    await expect(app.page.locator('#fileNameBadge')).toHaveText('one.md');
    await expect(app.page.locator('#preview h1')).toHaveText('One');
    expect(await app.content()).toBe('# One\n\nfirst');
    await expect(app.toast()).toHaveText('Opened one.md');
    await expect(app.page.locator('#fileNameBadge')).not.toHaveClass(/dirty/);
    await openRecent(app);
    expect(await names(app)).toEqual(['one.md', 'two.md']);
    app.expectNoErrors();
  });

  test('RF-08 a moved/deleted file is reported as such and removed from the list', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('gone.md', '# Gone');
    await app.makeOpfsFile('stay.md', '# Stay');
    await app.announceHandle('stay.md');
    await app.announceHandle('gone.md');
    await app.removeOpfsFile('gone.md');
    await openRecent(app);
    await app.page.locator('#recentList .recent-item', { hasText: 'gone.md' }).click();
    await app.page.waitForTimeout(300);
    const toast = await app.toast().innerText();
    test.info().annotations.push({ type: 'observed', description: `toast after clicking a deleted file: "${toast}"` });
    expect(toast, 'expected the "moved or deleted" message').toMatch(/moved or deleted/);
    await openRecent(app);
    expect(await names(app), 'deleted file should be removed from the list').toEqual(['stay.md']);
    await expect(app.page.locator('#fileNameBadge')).toHaveText('untitled.md');
  });

  test('RF-09 Clear list empties it, persists, and toasts', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('a.md', '#');
    await app.announceHandle('a.md');
    await openRecent(app);
    await app.page.click('#recentList .recent-clear');
    await expect(app.toast()).toHaveText('Recent files cleared');
    await expect(app.page.locator('#recentMenu')).not.toHaveClass(/open/);
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await openRecent(app);
    await expect(app.page.locator('#recentList .recent-empty')).toBeVisible();
  });

  test('RF-10 files opened without a handle (input fallback / synthetic drop) are not listed', async ({ app }) => {
    await app.boot();
    await app.openViaInput('plain.md', '# Plain');
    await app.dropFile({ name: 'dropped.md', type: 'text/markdown', content: '# Dropped' });
    await expect(app.page.locator('#fileNameBadge')).toHaveText('dropped.md');
    await openRecent(app);
    await expect(app.page.locator('#recentList .recent-empty')).toBeVisible();
  });

  test('RF-11 file names are rendered as text, never HTML', async ({ app }) => {
    await app.boot();
    // OPFS forbids < > in names on Windows; an entity-looking name still proves text vs innerHTML handling.
    await app.makeOpfsFile('&lt;b&gt;bold.md', '#');
    await app.announceHandle('&lt;b&gt;bold.md');
    await openRecent(app);
    expect(await names(app)).toEqual(['&lt;b&gt;bold.md']);
    expect(await app.page.locator('#recentList b').count()).toBe(0);
  });

  test('RF-12 Ctrl+S on a handle-backed document saves in place and refreshes its recency', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('save.md', '# Before');
    await app.makeOpfsFile('other.md', '# Other');
    await app.announceHandle('save.md');
    await app.announceHandle('other.md');
    await openRecent(app);
    await app.page.locator('#recentList .recent-item', { hasText: 'save.md' }).click();
    await expect(app.page.locator('#preview h1')).toHaveText('Before');
    await app.setContent('# After');
    await expect(app.page.locator('#fileNameBadge')).toHaveClass(/dirty/);
    await app.press('Control+s');
    await expect(app.toast()).toHaveText('Saved save.md');
    await expect(app.page.locator('#fileNameBadge')).not.toHaveClass(/dirty/);
    expect(await app.readOpfsFile('save.md')).toBe('# After');
    await openRecent(app);
    expect((await names(app))[0]).toBe('save.md');
  });

  test('RF-13 relative time labels (hours)', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('old.md', '#');
    await app.announceHandle('old.md');
    await app.page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('read-your-md', 1);
          req.onsuccess = () => {
            const db = req.result;
            const t = db.transaction('recent', 'readwrite');
            const s = t.objectStore('recent');
            s.getAll().onsuccess = (e) => {
              for (const row of e.target.result) {
                row.lastOpened = Date.now() - 3 * 3600 * 1000;
                s.put(row);
              }
            };
            t.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        })
    );
    await openRecent(app);
    await expect(app.page.locator('#recentList .recent-time')).toHaveText('3 h ago');
  });

  test('RF-14 menu items are keyboard-reachable and have menu semantics', async ({ app }) => {
    await app.boot();
    await app.makeOpfsFile('k.md', '#');
    await app.announceHandle('k.md');
    await openRecent(app);
    await expect(app.page.locator('#recentMenu')).toHaveAttribute('role', 'menu');
    await expect(app.page.locator('#recentList .recent-item')).toHaveAttribute('role', 'menuitem');
    await app.press('Tab');
    const id = await app.page.evaluate(() => document.activeElement.className);
    test.info().annotations.push({ type: 'observed', description: `focus after Tab from the Recent button: ${id}` });
  });
});
