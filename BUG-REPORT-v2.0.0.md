# Bug Report — Read Your MD v2.0.0 (resolved in v2.0.1 — see Resolution at the end)

| | |
|---|---|
| **Build under test** | working tree at `8a4f7a9` + uncommitted v2.0.0 changes (all 6 phases) |
| **Tested on** | 27 Aug 2026, Windows 11 |
| **Browsers** | Chromium 1234, Firefox 1538, WebKit 2336 (Playwright 1.62.1) |
| **Targets** | Vite dev server (features) and a fresh `vite build` served by `vite preview` (PWA / offline) |
| **Dependencies** | marked 15.0.12 · marked-katex-extension 5.1.12 · katex 0.18.4 · mermaid 11.15.0 · vite 6.4.3 · vite-plugin-pwa 1.3.0 |
| **Method** | 190 automated Playwright cases (256 executions across 3 browsers) + static review of the diff |
| **Result** | 222 passed · 32 failed (22 defect confirmations, 8 soft/design checks, 2 environment) · 2 skipped |

## Verdict

**Not ready to ship as-is.** The six phases work on their main paths in every browser, with no console or page errors, but three defects should block release: the `hidden` attribute is inert on several controls (D1), autosave silently stops after a large image embed while still reporting "Draft saved" (D2), and the advertised "moved/deleted" clean-up for recent files is unreachable code (D3). Nine medium defects follow, two of which make the release note inaccurate (D4 currency-and-math, D5 CRLF front matter).

**Severity legend** — **P1**: data loss or a shipped feature broken · **P2**: misbehaves in common use · **P3**: edge case, polish, accessibility.

**Summary:** 3 × P1 · 9 × P2 · 18 × P3 — 30 findings.

| ID | Sev | Title | Area |
|---|---|---|---|
| D1 | P1 | `hidden` attribute does nothing on flex-styled controls (Replace row, Install button, Recent button) | Find, PWA, Recent |
| D2 | P1 | Autosave silently stops after a large image embed; status still says "Draft saved" | Images, Autosave |
| D3 | P1 | "Moved or deleted" clean-up in Recent files never runs | Recent |
| D4 | P2 | Dollar amount before inline math turns the span into a red KaTeX error | Math |
| D5 | P2 | CRLF (Windows) files: front matter not detected on open, appears after first keystroke | Front matter |
| D6 | P2 | Exported HTML and rich-text copies show every formula twice | Export, Math |
| D7 | P2 | Ctrl+Z / Ctrl+Y inside Find/Replace boxes undo the document | Find |
| D8 | P2 | Ctrl+F in reader mode opens an invisible find bar that reappears later | Reader mode, Find |
| D9 | P2 | Math in a heading is tripled in tab title, outline and exported `<title>` | Math, Title |
| D10 | P2 | Service-worker auto-update reloads open tabs without warning | PWA |
| D11 | P2 | Enter during IME composition is captured by list continuation | Smart lists |
| D12 | P2 | Phone widths scroll sideways (35 px overflow at 420 px) | Layout |
| D13–D30 | P3 | See [Minor findings](#minor-findings-p3) | — |

---

## P1 — Blocking

### D1 · The `hidden` attribute is inert on flex-styled controls

**Severity:** P1 · **Area:** Find & Replace, PWA install button, Recent files (cross-browser) · **Tests:** FR-01, RP-01, PW-05, XB-02 (Firefox + WebKit)

**Steps to reproduce**
1. Open the app in any browser and press **Ctrl+F**.
2. Observe the find bar.
3. Click the ⇄ (toggle replace) button.
4. Press **Ctrl+/** to open Help in a browser that has not offered install (e.g. Firefox).
5. Open the app in Firefox or Safari and look at the header next to **Open**.

**Expected**
- Ctrl+F shows only the Find row; the ⇄ button shows/hides the Replace row.
- "Install as an app" is shown only after the browser fires `beforeinstallprompt`.
- The Recent-files chevron is hidden where `showOpenFilePicker` is unavailable (release note: "Hidden on browsers without File System Access").

**Actual**
- The Replace row is always visible; Ctrl+F and Ctrl+H look identical; the ⇄ button does nothing visible.
- "Install as an app" is always visible in the help dialog; clicking it does nothing.
- In Firefox and WebKit the Recent chevron is rendered and has no click handler (dead button).

**Root cause**
`src/style.css` contains no `[hidden]` rule. Author rules always beat the UA stylesheet's `[hidden] { display: none }`, so `.find-row { display: flex }` (style.css:2481) and `.action-btn { display: flex }` (style.css:405) keep the elements visible. Only `.findbar[hidden]` and `.overlay[hidden]` were special-cased.

**Evidence**
PW-05 measured `installBtn.hidden === true` while the element was visible. XB-02: `#recentBtn` visible in both non-Chromium browsers.

**Suggested fix**
Add `[hidden] { display: none !important; }` near the top of `style.css` (one line). Re-run FR-01, RP-01, PW-05, XB-02.

---

### D2 · Autosave silently stops after a large image is embedded

**Severity:** P1 · **Area:** Images, Autosave · **Tests:** IM-14, IM-18

**Steps to reproduce**
1. New document; type `# Big`. Wait for "Draft saved hh:mm" in the status bar.
2. Drag a PNG larger than ~4 MB onto the editor (or paste one). Toast: "Embedded a 4.5 MB image — large images make the file heavy".
3. Type a few more words; wait 2 s.
4. DevTools console: `JSON.parse(localStorage['md-reader-draft']).content.length`
5. Reload the page.

**Expected**
Either the draft is saved, or the user is told autosave is paused and why.

**Actual**
- Step 4 returns **5** (the original `# Big`) while the editor holds **6,291,495** characters; the status bar still reads "Draft saved 19:09" (stale time from before the embed).
- Step 5 restores the pre-image document: the image and everything typed after it are gone, with no warning at any point.

**Root cause**
`src/persistence.js` `flushDraft()` wraps `localStorage.setItem` in a bare `catch {}`; a `QuotaExceededError` is swallowed and the status element is never updated.

**Related performance observation (IM-18):** with a 4 MB data-URL in the document, 10 keystrokes took 7.5 s — every keystroke re-renders the whole document and pushes a full copy of the content into the 150-entry undo history (`src/editor.js` `pushHistory`), i.e. up to 150 × 6 MB of strings.

**Suggested fix**
- On quota failure show a persistent status ("Autosave paused — document too large for browser storage; save to a file") and a toast.
- Move drafts to IndexedDB (no ~5 MB cap) or store embedded images separately from the text.
- Cap the undo history by total bytes, or store diffs instead of full snapshots.

---

### D3 · "Moved or deleted" clean-up in Recent files never runs

**Severity:** P1 · **Area:** Recent files · **Tests:** RF-08

**Steps to reproduce** (Chrome/Edge)
1. Open a file with **Ctrl+O** so it lands in Recent.
2. In Explorer, delete or rename that file.
3. Click the Recent chevron and pick the file.

**Expected** (per release note "moved/deleted cleanup")
Toast "That file was moved or deleted — removed from recent"; the entry disappears.

**Actual**
Toast "Could not open file"; the entry stays in the list permanently.

**Root cause**
`src/fileIO.js:104-112` `openHandle()` catches every error from `handle.getFile()` and shows the generic toast, so the `NotFoundError` branch in `src/recent.js:215-223` (`forget(id)` + specific toast) is dead code.

**Suggested fix**
Let `openHandle` rethrow (or return `false`) and keep the user-facing toast in the caller; RF-08 then passes.

---

## P2 — Medium

### D4 · A dollar amount before inline math turns the whole span into a red KaTeX error

**Severity:** P2 · **Area:** Math · **Tests:** MA-06, MA-06b (MA-05 passes)

**Steps to reproduce**
1. Type `Pay $5 and $x^2$ now.` on one line.
2. Type `Pay $5 and $10 or $x$ now.` on another line.
3. For comparison type `Costs $5 and $10 today.` (no math on the line).

**Expected** (release note: "`$5` and `$x^2$` on one line = math per Pandoc convention")
Line 1 renders "Pay $5 and *x²* now."; line 2 renders "Pay $5 and $10 or *x* now."

**Actual**
- Line 1 renders as **`Pay`** + red error span **`5 and $x^2`** + **`now.`** — no math, the text is visibly corrupted.
- Line 2 renders **`Pay`** + red **`5 and $10 or $x`** + **`now.`**.
- Line 3 is fine (plain currency is safe).

**Root cause**
marked-katex-extension 5.1.12's inline rule allows `$` inside the math body and only validates the character after the closing `$`; the first `$` on the line opens the expression, and KaTeX then rejects the inner `$` (`throwOnError: false` → `.katex-error`).

**Suggested fix**
Pre-process `$<digit>` to `\$` outside code spans before lexing, or wrap the extension's tokenizer to reject matches whose body contains an unescaped `$`. Either way, correct the release note and the sample document ("write `\$` for a literal dollar sign" is only necessary on lines that also contain math — say so).

---

### D5 · CRLF (Windows) files: front matter not detected when opened, appears after the first keystroke

**Severity:** P2 · **Area:** Front matter, File open · **Tests:** FM-10, FM-10b (FM-09 passes)

**Steps to reproduce**
1. Create `win.md` with Windows line endings: `---␍␊title: Windows␍␊---␍␊# Doc␍␊`
2. Open it with **Ctrl+O** (or drop it, or via the input fallback).
3. Observe the preview; then type any character in the editor.

**Expected**
"Document info" card with `title: Windows` immediately on open.

**Actual**
On open: a horizontal rule and the raw `title: Windows` as paragraph text (card count 0). After the first keystroke the card appears (card count 1). An HTML export made before the first edit carries the wrong rendering.

**Root cause**
`src/fileIO.js` `loadFile()` calls `renderNow(content)` with the raw file text (CRLF). Every later render uses `editor.value`, which the textarea normalises to LF. `FRONT_MATTER` in `src/preview.js:197` is `/^---[ \t]*\n…/` and does not accept `\r`.

**Suggested fix**
Normalise `\r\n?` → `\n` in `loadFile` before both `setEditorContent` and `renderNow` (or render from `getEditorContent()`), and make the regex tolerate `\r?`.

---

### D6 · Exported HTML and rich-text copies show every formula twice

**Severity:** P2 · **Area:** Export, Math · **Tests:** EH-06, CP-01

**Steps to reproduce**
1. Document containing `Inline $E=mc^2$ here.`
2. Export → **Export HTML file**; open the file in a browser.
3. Export → **Copy as rich text**; paste into Word/Gmail.

**Expected**
The formula appears once.

**Actual**
"𝐸=𝑚𝑐2E=mc2" — the MathML copy (normally clipped by KaTeX's stylesheet) and the HTML copy are both visible.

**Root cause**
`EXPORT_CSS` in `src/export.js` contains no KaTeX rules; in-app, `main.js` imports `katex.min.css`. Both export paths share `previewSnapshot()`.

**Suggested fix**
Strip `.katex-mathml` from the export snapshot (keep the accessible MathML in-app only), or inline the KaTeX stylesheet, or render exports with `output: 'html'`.

---

### D7 · Ctrl+Z / Ctrl+Y inside the Find or Replace box undo the document

**Severity:** P2 · **Area:** Find & Replace, Undo · **Tests:** FR-13

**Steps to reproduce**
1. Type `one two` in the editor.
2. **Ctrl+F**, type `abc` in the Find box.
3. Press **Ctrl+Z** (to fix a typo in the query).

**Expected**
The Find box undoes; the document is untouched.

**Actual**
The editor content becomes `one tw`; the Find box still says `abc`.

**Root cause**
`src/editor.js` registers the undo/redo shortcut on `document` with `preventDefault()` and no check of the focused element.

**Suggested fix**
Skip the handler when `document.activeElement` is an `input`/`textarea` other than the editor.

---

### D8 · Ctrl+F in reader mode opens an invisible find bar that reappears, focus-less, when the editor returns

**Severity:** P2 · **Area:** Reader mode, Find · **Tests:** RM-06

**Steps to reproduce**
1. **Ctrl+\** (reader mode).
2. **Ctrl+F**. Nothing visible happens.
3. Press **Escape**. Nothing happens (focus never reached the bar).
4. **Ctrl+\** to return to the editor.

**Expected**
Ctrl+F either leaves reader mode and searches, or is ignored in reader mode.

**Actual**
Step 4 reveals an open find bar with no focus; the user did not "open" it in any visible sense.

**Root cause**
`src/find.js` `open()` does not consider `body.reader-mode`; the editor pane (and the bar inside it) is `display:none`.

**Suggested fix**
Product decision (see Open questions #2): exit reader mode before opening, or ignore the shortcut while in reader mode.

---

### D9 · Math in a heading is tripled in the tab title, the outline and the exported `<title>`

**Severity:** P2 · **Area:** Tab title, Outline, Export · **Tests:** TT-02, TT-03

**Steps to reproduce**
1. Type `# Energy $E=mc^2$`.
2. Look at the browser tab; open the outline; export HTML and check `<title>`.

**Expected**
"Energy E=mc²" (or the TeX source) once.

**Actual**
Tab title `Energy E=mc2E=mc^2E=mc2 · Read Your MD`; outline entry `Energy E=mc2E=mc^2E=mc2`; same in the export title.

**Root cause**
`textContent` of a KaTeX node includes the MathML (with its `<annotation>` TeX source) plus the HTML rendering. Used by `updateDocumentTitle()` (preview.js), `outline.js` `rebuild()` and `documentTitle()` (export.js).

**Suggested fix**
Add a `headingText(el)` helper that clones the heading, removes `.katex-mathml` (or replaces each `.katex` with its annotation text), and use it in all three places.

---

### D10 · Service-worker auto-update reloads open tabs without warning

**Severity:** P2 · **Area:** PWA · **Source:** code review — vite-plugin-pwa 1.3.0 `dist/client/build/register.js`; not reproducible against a single build

**Scenario**
1. A user has the app open with a file-backed document and unsaved edits (or is mid-sentence in the installed app).
2. A new version is deployed; the browser's next SW update check installs it.

**Expected**
"New version available — reload" affordance; no unexpected navigation.

**Actual (by code)**
With `registerType: 'autoUpdate'` and no `onNeedReload` passed to `registerSW()` in `main.js`, the plugin calls `window.location.reload()` as soon as the new SW activates (`event.isUpdate`). For a scratch draft the `visibilitychange` flush covers it; for a dirty file-backed document the `beforeunload` guard pops a context-free "Leave site?" dialog; an installed app can reload mid-edit.

**Suggested fix**
Pass `onNeedReload` and show a "New version ready — reload" toast/button, or switch to `registerType: 'prompt'`.

---

### D11 · Enter during IME composition is captured by list continuation

**Severity:** P2 · **Area:** Smart lists · **Tests:** SL-19

**Steps to reproduce**
1. Enable a Japanese/Chinese/Korean IME.
2. On a line starting with `- `, type text and press **Enter** to commit the composition.

**Expected**
The composition commits; no new bullet.

**Actual**
A new `- ` line is inserted (keydown with `isComposing: true` is not ignored), breaking the composition.

**Root cause**
`src/format.js` `onEditingKeys` checks only modifier keys.

**Suggested fix**
Return early when `e.isComposing || e.keyCode === 229`.

---

### D12 · Phone widths scroll sideways (35 px overflow at 420 px)

**Severity:** P2 · **Area:** Layout · **Tests:** RG-12 (stacked layout and reader mode work)

**Steps to reproduce**
1. DevTools device toolbar, 420 × 800.
2. Swipe/scroll horizontally.

**Expected**
No horizontal scrolling.

**Actual**
`scrollWidth` exceeds the viewport by 35 px. Measured elements past the right edge: `.header-actions` / `#themeToggle` (right = 455 px) and the decorative `.ambient-blob` elements (right = 540–611 px).

**Suggested fix**
`overflow-x: hidden` on `body` or `.ambient`; let `.header-actions` wrap or drop labels below 480 px (v2 added Recent, Export, Reader and Help buttons to the header).

---

## Minor findings (P3)

| ID | Finding | Tests | Repro / detail | Suggested fix |
|---|---|---|---|---|
| D13 | Print: if `afterprint` never fires, the theme stays light and the print latch never releases (Ctrl+P dead). Theoretical in current browsers. | PR-05 (soft) | Stub `window.print` without dispatching `afterprint`; press Ctrl+P twice. | Fallback timer (~10 s) that restores the theme and clears `printing`. |
| D14 | Export and Recent header menus can be open simultaneously. | EX-02 | Click Export ▾, then Recent ▾. | Close all `.hdr-dropdown` menus when one opens. |
| D15 | Help dialog has `aria-modal="true"` but no focus trap; Tab leaves the dialog after four presses. | HP-06 | Ctrl+/, press Tab ×4. | Trap Tab/Shift+Tab within `.dialog`, or use `<dialog>.showModal()`. |
| D16 | Exported HTML strips heading ids, so `[jump](#md-section-two)` anchors break in the file. | EH-11 (soft) | Export a doc with an internal link; open; click it. | Keep `md-*` heading ids in `previewSnapshot()`. |
| D17 | "Copy as rich text" loses diagram styling — Chromium's clipboard sanitizer drops the SVG `<style>`, so pasted diagrams are black outlines. | CP-03 (soft) | Copy a doc with a diagram; paste into Word. | Inline computed styles into the SVG before copying, or copy diagrams as PNG data URLs. |
| D18 | Ctrl+F while the bar is open replaces the typed query with the current match's casing (`ALPHA` → `alpha`). | FR-12 | Ctrl+F, type `ALPHA`, Ctrl+F again. | Only seed from the selection when the bar was closed. |
| D19 | Ctrl+H when the bar is already open shows the Replace row but leaves focus in Find. | FR-18 | Ctrl+F, type, Ctrl+H. | Focus `#replaceInput` when invoked via Ctrl+H. |
| D20 | Escape with focus in the editor does not close an open find bar (VS Code closes it). | FR-16 (observed) | Ctrl+F, click into the editor, Escape. | Product decision (question #3). |
| D21 | "Replace" acts on the tracked match even after the user has clicked elsewhere in the document. | RP-10 (observed) | Ctrl+H, query `beta`, click near the end of the doc, Replace → first `beta` replaced. | Re-select the match first when the editor selection no longer equals it. |
| D22 | Clicking "Aa" (match case) leaves focus on the button, so Enter re-toggles it instead of advancing. | FR-04 (observed) | Ctrl+F, type, click Aa, press Enter. | Return focus to the query field after toggling. |
| D23 | `+ item` bullets and `1) item` lists (valid CommonMark) are not continued by Enter. | SL-15, SL-16 (soft) | Type `+ item`, Enter. | Extend `LIST_LINE` to `[-*+]` and `\d+[.)]`. |
| D24 | Shift+Tab does not outdent lines indented with a tab character. | TB-09 (soft) | Line `\t- a`, Shift+Tab. | Accept `^\t` in `outdent()`. |
| D25 | Precache manifest lists the three icons twice (`includeAssets` + `globPatterns`): 81 entries, 78 unique. Harmless. | PW-10 (soft) | Inspect `dist/sw.js`. | Drop `includeAssets`. |
| D26 | Italic on already-bold text strips a bold marker (`**abc**` → `*abc*`). Pre-existing toolbar quirk, not v2. | RG-02b (soft) | Select the inner text of `**abc**`, Ctrl+I. | In `wrapInline`, only unwrap when the outer marker equals the command's own marker. |
| D27 | Word count / reading time count image markup (`![pasted image](…)`) as two words. | IM-15 (observed) | Paste an image; header shows +2 words. | Strip image/link syntax before counting, if desired. |
| D28 | Raw HTML in an opened `.md` executes (`<img onerror>` ran). Pre-existing, but v2 adds IndexedDB file handles to the same origin. | RG-17 (observed) | Open a file containing `<img src=x onerror="…">`. | Product decision (question #5): DOMPurify on rendered HTML, or accept for a local tool. |
| D29 | Ctrl+Shift+D (theme) checks `ctrlKey` only, while every v2 shortcut also accepts `metaKey`; inconsistent on macOS. | code review | `main.js` keydown handler. | Use `ctrlKey \|\| metaKey` like the other shortcuts. |
| D30 | Manifest has no `launch_handler`; each "Open with" launches a new window instead of focusing the running app; only `files[0]` is opened. | code review | `vite.config.js`, `main.js` launchQueue consumer. | Add `launch_handler: { client_mode: 'focus-existing' }`; handle multiple files. |

---

## Coverage against the release note

| Phase / claim | Tests | Result |
|---|---|---|
| **P1** Reader mode (Ctrl+\ / button, editor hides, full width, persists) | RM-01…05, RM-07…10, XB-03 | ✅ Pass (Ctrl+F interaction: D8) |
| **P1** Print/PDF forces light theme + light diagrams, restores after | PR-01…04, PR-06, PR-07, XB-10 | ✅ Pass (no-`afterprint` robustness: D13) |
| **P1** Standalone HTML export (self-styled, diagrams re-rendered light) | EH-01…05, EH-07…10, XB-08 | ✅ Pass (math: D6; anchors: D16) |
| **P1** Copy as rich text (HTML + plain), Copy markdown | CP-01, CP-02 | ✅ Pass (diagram styling: D17) |
| **P1** Smart lists: Enter continues `-`, `2.`, `- [ ]`, `>`; empty item ends list; Tab/Shift+Tab | SL-01…11, SL-17, SL-20, SL-24…27, TB-01…08, TB-10, XB-05 | ✅ Pass (IME: D11; `+` / `1)`: D23; tab chars: D24) |
| **P1** Front matter → Document info card, line mapping intact | FM-01…09, FM-11…15, XB-06 | ✅ Pass (CRLF files: D5) |
| **P1** Tab title from H1, reading time, Ctrl+/ overlay, spellcheck persists | TT-01, TT-04, RT-01 ×8, RT-02, HP-01…05, HP-07, SP-01, S-04 | ✅ Pass (math headings: D9; focus trap: D15) |
| **P1** Version v2.0.0 in status bar, help, console.info (from package.json) | S-02, PW-02, PW-09 | ✅ Pass |
| **P2** Find: live count, Enter/Shift+Enter cycle + wrap, match-case, selection seeds, far matches scrolled, count updates while editing | FR-02…11, FR-14, FR-15, FR-17, XB-04 | ✅ Pass (6000 matches in a 200 KB doc < 3 s) |
| **P2** Replace / Replace All, undoable | RP-02…09 | ✅ Pass |
| **P2** Replace row hidden for Ctrl+F; toggle | FR-01, RP-01 | ❌ D1 |
| **P2** Keyboard details | FR-12, FR-13, FR-18, FR-04, FR-16, RP-10 | D7, D18–D22 |
| **P3** Manifest, icons, `file_handlers` | PW-01, PW-09 | ✅ Pass |
| **P3** SW precaches 81 files / 4 MB; "Ready to work offline" | PW-02 | ✅ Pass (81 entries, 78 unique — D25) |
| **P3** Real offline reload: shell, preview, diagrams, math | PW-03 | ✅ Pass — incl. lazily-loaded sequence/pie chunks and display math while offline |
| **P3** No reload loop on return visits | PW-04 | ✅ Pass (update policy: D10) |
| **P3** "Install as an app" button appears when offered; reacts to accept/dismiss/appinstalled | PW-05, PW-05b | ❌ D1 (event handling itself works) |
| **P3** "Open with" via `launchQueue` opens the file and adds it to Recent | PW-06, PW-07 | ✅ Pass (simulated; OS integration manual) |
| **P3** Google Fonts runtime-cached | PW-08 | ⚠️ Not verified — no external network in the test environment |
| **P4** Recent: chevron, IndexedDB, dedupe, newest first, cap 10, persists, one-click reopen, Clear | RF-01…07, RF-09…14 | ✅ Pass (origin-private handles as stand-in) |
| **P4** Ctrl+S saves in place through the handle, refreshes recency | RF-12 | ✅ Pass |
| **P4** moved/deleted cleanup | RF-08 | ❌ D3 |
| **P4** Hidden on browsers without File System Access | XB-02 | ❌ D1 |
| **P5** `$inline$`, `$$display$$`, MathML, red source on error, never breaks doc, `\$` literal | MA-01…04, MA-07…16, XB-01 | ✅ Pass (150 equations < 6 s; `\href{javascript:}` blocked; `<script>` in math inert) |
| **P5** "`$5` and `$x^2$` on one line = math" | MA-05, MA-06, MA-06b | ❌ D4 |
| **P6** Paste/drop image → embedded at caret with padding; filename → alt; > 1 MB warns; `.md` drops open; text paste untouched | IM-01…13, IM-16, IM-17, XB-09 (WebKit) | ✅ Pass |
| **P6** Large images vs autosave / editing performance | IM-14, IM-18 | ❌ D2 |
| **P6** Firefox image paste | XB-09 (Firefox) | ⚠️ Inconclusive — synthetic clipboard events carry no files in Firefox; manual |
| **Regression** toolbar, shortcuts, undo/redo, theme, autosave restore, file open, locate, outline, scroll sync, code copy, alerts, mermaid error, divider, line numbers, menus | RG-01…11, RG-13…16, S-01…07 | ✅ Pass |
| **Regression** narrow viewport | RG-12 | ❌ D12 |
| **Regression** Firefox / WebKit fallbacks (boot, reader/help/spell, find/replace, lists, front matter, Ctrl+S → download, export, print, file open) | XB-01, XB-03…08, XB-10, XB-11 | ✅ Pass |

## Not automatable — manual checklist

| Check | Why manual |
|---|---|
| Print dialog → "Save as PDF": page breaks, light background, diagrams and math legible on paper | Headless browsers stub `window.print()`; the flow up to it is covered (PR-01…07). |
| Chrome/Edge "Install" prompt, installed window, Windows "Open with → Read Your MD" on a `.md` (single and multiple files) | Real OS integration; in-app handling of `beforeinstallprompt` / `appinstalled` / `launchQueue` is covered (PW-05…07). |
| Recent files with user-picked handles after a browser restart: permission prompt once, read-only fallback when write is denied | Requires the native file picker; logic tested with origin-private handles (RF-*). |
| Google Fonts available offline after one online visit | No external network in the test environment (PW-08). |
| Firefox: paste a screenshot from the real clipboard | Synthetic paste events carry no files in Firefox (XB-09); WebKit and Chromium verified. |
| Ctrl+S / Ctrl+Shift+S with the native save picker; "Leave site?" only when a file-backed document is dirty | Native dialogs. |
| Touch devices: divider drag, reader mode, click-to-locate not popping the keyboard | No touch emulation was run. |

## Open questions

1. **Currency vs. math (D4):** protect `$<digit>` automatically, or document "escape currency as `\$` on any line that contains math" and correct the release note?
2. **Ctrl+F in reader mode (D8):** exit reader mode and search, or ignore the shortcut?
3. **Escape in the editor (D20):** should it close an open find bar (VS Code convention)?
4. **Test suite:** it lives in the session scratchpad (below). Add it to the repo as `tests/e2e` with `@playwright/test` as a devDependency and an `npm test` script? `package.json` was not modified.
5. **Raw HTML execution (D28):** accepted risk for a local tool, or sanitize now that the origin holds file handles?
6. **Auto-update policy (D10):** silent reload, "reload when ready" toast, or prompt?

## How to re-run

Suite: `C:\Users\Akash\AppData\Local\Temp\claude\d--Akash-Personal-Work-MarkdownReader\e3dd5449-b160-4564-8aee-e80000b36d27\scratchpad\qa` — 12 spec files, `helpers.js` fixture, `playwright.config.js`. Merged results in `results\merged.json`; HTML report with screenshots and traces of every failure in `results\html\index.html`.

```sh
# in the project
npx vite --port 5199 --strictPort --host 127.0.0.1
npx vite build && npx vite preview --port 4199 --strictPort --host 127.0.0.1

# in the qa folder
npx playwright test --project=chromium --workers=3          # all Chromium checks (~7 min)
npx playwright test --project=firefox --project=webkit      # fallback browsers
npx playwright test -g "FR-01|RP-01|PW-05|XB-02"           # re-check D1 after the fix
npx playwright show-report results/html
```

Each test starts in a fresh browser context (empty localStorage/IndexedDB). Image paste/drop, `launchQueue`, `beforeinstallprompt` and print were driven with synthetic events; file handles came from the origin-private file system; console and page errors were captured in every test.

---

## Resolution — v2.0.1

All 30 findings addressed. Decisions on the open questions: **#1** currency is protected automatically (a `$` inside a would-be formula rejects the match, so `$5 and $x^2$` renders the price as text and the math as math; `\$` still forces a literal) · **#2** Ctrl+F leaves reader mode and searches · **#3** Escape in the editor closes the find bar · **#4** the suite lives in `tests/e2e` (`npm test`) · **#5** rendered HTML is sanitized with DOMPurify · **#6** updates show a "new version ready — Reload / Later" banner, never a silent reload.

| ID | Fix |
|---|---|
| D1 | `[hidden] { display: none !important }` — Replace row, Install button and Recent chevron now honor the attribute. |
| D2 | Drafts moved to IndexedDB (no ~5 MB cap); small documents also keep a synchronous localStorage copy; if every store fails the status bar reads "Autosave paused…" and a toast explains. Undo history additionally capped at 24 MB of snapshots. |
| D3 | `openHandle()` propagates errors; a deleted/moved recent file now shows the specific toast and is removed from the list. |
| D4 | Inline-math matches whose body contains an unescaped `$` are rejected (see #1). Sample document wording updated. |
| D5 | Opened files are normalised to LF before the first render; the front-matter regex tolerates `\r`. |
| D6 | Exports keep only the MathML rendering (browsers render it natively, no KaTeX CSS needed); rich-text copies replace formulas with their `$TeX$` source so mail/Word keep the meaning. |
| D7 | Ctrl+Z / Ctrl+Y are ignored by the document undo when focus is in another input; a mouse-click Replace hands focus back to the editor so undo still applies to the replacement. |
| D8 | Ctrl+F / Ctrl+H exit reader mode before opening the bar. |
| D9 | `headingText()` (MathML stripped) feeds the tab title, outline entries/ids and the exported `<title>`. |
| D10 | `registerType: 'prompt'` + update banner; `clientsClaim` kept so the first install controls the page (offline works on the first visit). |
| D11 | Enter/Tab handling ignores IME composition (`isComposing` / keyCode 229). |
| D12 | `overflow-x: hidden` on the document; at ≤480 px the header drops Redo and Help and tightens spacing (no sideways scroll at 420 px). |
| D13 | Theme is restored as soon as `window.print()` returns (browsers block inside it while the dialog is open) plus a 10 s fallback; the latch always releases. |
| D14 | Header dropdowns close each other (`md-header-menu-open`). |
| D15 | Focus trap in the help dialog. |
| D16 | `md-*` heading ids survive export, so internal links work in the file. |
| D17 | Rich-text copy rasterizes diagrams to PNG data URLs (survives clipboard sanitizers). |
| D18 | The selection only seeds the query when the bar opens, not on re-press. |
| D19 | Ctrl+H on an open bar focuses the Replace box. |
| D20 | Escape in the editor closes the find bar. |
| D21 | Replace first re-selects a drifted match, the next press replaces it. |
| D22 | Buttons in the bar never take focus (mousedown prevented); Aa returns focus to the query. |
| D23 | `+` bullets and `1)` lists continue / toggle like the others. |
| D24 | Shift+Tab removes a leading tab as well as spaces. |
| D25 | `includeManifestIcons: false` — 78 unique precache entries. |
| D26 | Inline toggles only unwrap when the surrounding marker is exactly their own (`**abc**` + italic → `***abc***`). |
| D27 | Word count / reading time ignore image and link syntax. |
| D28 | Every rendered block passes through DOMPurify (`onerror`, `javascript:` etc. stripped; SVG/MathML/data images kept). |
| D29 | Ctrl+Shift+D also accepts Meta. |
| D30 | `launch_handler: focus-existing`; multi-file launches open the first file and say so. |

Spec adjustments (the suite encoded pre-fix behaviour in a few places): RP-10 (recommended re-select-then-replace flow), IM-14 (reads IndexedDB), IM-15 (image markup no longer counted), MA-16 (new wording), EH-06 (MathML-only export accepted, math-italic code points folded), CP-03 (PNG diagrams), PW-08 (runtime cache checked on the second visit), version assertions read `package.json`.

**Verification (v2.0.1):** full Chromium suite — 246 passed (incl. the 14-case `12-fixes` verification spec), 0 failed, 2 skipped (native-dialog cases); plus a 35-check regression script covering D1–D30 directly. Run it with `npm test` (starts the dev and preview servers itself; `npm run test:e2e:report` opens the HTML report).

## Independent verification of v2.0.1 (29 Aug 2026)

Re-tested by QA against the fixed working tree (`package.json` 2.0.1, fresh `vite build`), using the in-repo suite plus a new `tests/e2e/specs/12-fixes.spec.cjs` that asserts the decided behaviours the base suite only observed (D2 paused-state and IndexedDB drafts, D4 currency text preserved next to math, D6 MathML-only export and TeX-source rich copy, D7/D20/D22 focus and undo rules, D8 Ctrl+F/Ctrl+H leaving reader mode, D10 prompt-mode SW, D13 print latch, D28 sanitizer keeps legitimate markup, D29 Meta+Shift+D, D30 `launch_handler` and multi-file launch).

| Batch | Scope | Result |
|---|---|---|
| 1 | Chromium · specs 00–05 (smoke, view, export/print/copy, lists, front matter, find/replace) | 144 passed |
| 2 | Chromium · specs 06–12 (PWA, recent, math, images, regression, cross-browser cases, fix verification) | 102 passed · 2 skipped (native-dialog cases) |
| 3 | Firefox + WebKit · `@xbrowser` fallbacks | 21 passed · 1 environment-only failure (XB-09: Firefox ignores synthetic paste events — verify a real screenshot paste manually) |

**Outcome: all 30 findings verified fixed; no regressions found.** 270 executions, 267 passed, 2 skipped, 1 environment-only. Review of the spec adjustments confirmed each one re-encodes the decided behaviour rather than removing a check. Two over-strict assertions in the new spec were corrected during the run (Ctrl+H on a closed bar focuses the query field, as in VS Code and FR-18; MathML `innerText` must be compared with all whitespace stripped). Still manual, as before: real print-to-PDF output, OS-level install / "Open with", picker permission re-prompts, offline Google Fonts after a real online visit, Firefox clipboard paste, native save dialogs, touch devices.

**Follow-up (same release):** printing no longer flips the on-screen theme. Paper is made light purely under `@media print` (the light tokens are re-declared for the dark theme, code cards print light with a dark token palette, transitions are disabled for the snapshot), and diagrams get light-palette copies that exist only while printing (`.mermaid-print`, removed on afterprint). Reader mode now uses a wider measure (up to 1200 px, 18 px type). Specs PR-01 / XB-10 updated accordingly.
