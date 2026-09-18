# Read Your MD

<p align="center">
  <strong>A fast, distraction-free Markdown reader and editor with live preview, math typesetting, diagram generation, and native file system integration.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.2.0-teal.svg?style=flat-square" alt="Version 2.2.0" />
  <img src="https://img.shields.io/badge/vite-6.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/pwa-ready-green.svg?style=flat-square" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/playwright-tested-45ba4b.svg?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" />
</p>

---

## Overview

**Read Your MD** is an offline-capable, progressive web application designed for focused writing and reading. It combines split-pane markdown editing with a real-time rendered preview, interactive diagrams, LaTeX math equations, document outline navigation, and native file access.

Whether you are crafting documentation, writing notes, or previewing local `.md` files, **Read Your MD** runs entirely client-side with zero telemetry and instant performance.

---

## Features

### 📝 Live Split Editor & Reader Mode
- **Dual-Pane Layout**: Side-by-side editing and preview with an interactive drag divider.
- **Dedicated Reader Mode**: Hide the editor with `Ctrl+\` for a clean, distraction-free reading experience.
- **Synchronized Scrolling**: Both panes scroll in lockstep, accounting for element ratios and heading anchors.
- **Bi-Directional Spotlight**:
  - Click any block in the preview pane to navigate directly to its line in the editor.
  - Position your cursor in the editor to subtly spotlight the rendered element in the preview.

### 📐 Diagrams, Math & Code Highlighting
- **Mermaid.js Diagrams**: Render flowcharts, sequence diagrams, state machines, and Gantt charts inline—automatically themed to match dark or light mode.
- **KaTeX Math Typesetting**: Full support for inline (`$E = mc^2$`) and block display math (`$$\int_0^1 x^2 \, dx = \frac{1}{3}$$`), complete with smart currency handling (`$5` remains plain text).
- **Syntax Highlighting**: Pre-styled code blocks powered by Highlight.js with language badges and one-click copy buttons.

### 🎨 GitHub-Flavored Markdown & Callouts
- **GitHub Alerts**: Beautifully styled admonition callouts for `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, and `[!CAUTION]`.
- **Task Lists & Tables**: Interactive checkboxes, formatted tables, strikethrough, blockquotes, and smart list continuation (indent/outdent with `Tab`/`Shift+Tab`).
- **YAML Front Matter**: Parsed and neatly displayed in metadata cards.

### 💾 File System Integration & Autosave
- **Native File System Access API**: Open files with `Ctrl+O` and save changes directly back in-place with `Ctrl+S` (on supported browsers).
- **Cross-Browser Fallback**: Drag-and-drop `.md` files or use standard file upload/download on Firefox and Safari.
- **Recent Files Menu**: Quickly reopen recently viewed local documents.
- **Automatic Draft Persistence**: Unsaved changes are persisted to browser storage automatically, protecting against accidental window closures or crashes.
- **Image Handling**: Drag & drop or paste images directly into your documents.

### 🔍 Search, Replace & Outline Navigation
- **In-Editor Find & Replace**: Built-in search bar with `Ctrl+F` and `Ctrl+H`, live match count, case sensitivity toggle, and one-click replace single or all.
- **Interactive Document Outline**: Collapsible table of contents that reflects document headings with active section highlighting.

### 📤 Export & Sharing
- **Print to PDF**: Custom print stylesheet removes UI clutter and prepares a clean, paginated document for PDF printing (`Ctrl+P`).
- **HTML Export**: Export self-contained HTML files ready for publishing.
- **Rich Text Copy**: Copy rendered rich text directly to clipboard for pasting into Google Docs, Microsoft Word, or email clients.
- **Markdown Copy**: Quick one-click copy of raw Markdown.

### 📱 Progressive Web App (PWA) & Themes
- **Installable Desktop/Mobile App**: Runs offline through service worker caching.
- **File Handler Integration**: Can be registered in your OS as the default handler to open `.md` files.
- **Theming**: Dark and Light themes with ambient gradient backdrops and smooth transitions (`Ctrl+Shift+D`).
- **Typography**: Clean typographic hierarchy utilizing *Space Grotesk*, *Lora*, and *JetBrains Mono*.

---

## Keyboard Shortcuts

| Category | Action | Shortcut (Windows/Linux) | Shortcut (macOS) |
| :--- | :--- | :--- | :--- |
| **Document** | Open file | <kbd>Ctrl</kbd> + <kbd>O</kbd> | <kbd>Cmd</kbd> + <kbd>O</kbd> |
| | Save file (in-place) | <kbd>Ctrl</kbd> + <kbd>S</kbd> | <kbd>Cmd</kbd> + <kbd>S</kbd> |
| | Save as… | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> |
| | Print / Save as PDF | <kbd>Ctrl</kbd> + <kbd>P</kbd> | <kbd>Cmd</kbd> + <kbd>P</kbd> |
| | Find | <kbd>Ctrl</kbd> + <kbd>F</kbd> | <kbd>Cmd</kbd> + <kbd>F</kbd> |
| | Replace | <kbd>Ctrl</kbd> + <kbd>H</kbd> | <kbd>Cmd</kbd> + <kbd>H</kbd> |
| | Undo / Redo | <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | <kbd>Cmd</kbd> + <kbd>Z</kbd> / <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> |
| **View** | Reader mode toggle | <kbd>Ctrl</kbd> + <kbd>\</kbd> | <kbd>Cmd</kbd> + <kbd>\</kbd> |
| | Toggle Dark/Light theme | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> |
| | Help & shortcuts dialog | <kbd>Ctrl</kbd> + <kbd>/</kbd> | <kbd>Cmd</kbd> + <kbd>/</kbd> |
| **Formatting** | Bold | <kbd>Ctrl</kbd> + <kbd>B</kbd> | <kbd>Cmd</kbd> + <kbd>B</kbd> |
| | Italic | <kbd>Ctrl</kbd> + <kbd>I</kbd> | <kbd>Cmd</kbd> + <kbd>I</kbd> |
| | Inline code | <kbd>Ctrl</kbd> + <kbd>E</kbd> | <kbd>Cmd</kbd> + <kbd>E</kbd> |
| | Hyperlink | <kbd>Ctrl</kbd> + <kbd>K</kbd> | <kbd>Cmd</kbd> + <kbd>K</kbd> |
| | Strikethrough | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>5</kbd> | <kbd>Opt</kbd> + <kbd>Shift</kbd> + <kbd>5</kbd> |
| | Bullet list | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>8</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>8</kbd> |
| | Numbered list | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>7</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>7</kbd> |
| | Task list | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> |
| | Blockquote | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd> |
| | Indent / Outdent list item | <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> | <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> |

---

## Tech Stack

- **Bundler & Tooling**: [Vite 6](https://vitejs.dev/) with [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
- **Core Engine**: Vanilla JavaScript (ES Modules), zero heavy UI frameworks for fast load times
- **Markdown Parser**: [Marked](https://marked.js.org/)
- **Mathematics**: [KaTeX](https://katex.org/) via [`marked-katex-extension`](https://github.com/UziTech/marked-katex-extension)
- **Diagrams**: [Mermaid.js](https://mermaid.js.org/)
- **Syntax Highlighting**: [Highlight.js](https://highlightjs.org/)
- **HTML Sanitization**: [DOMPurify](https://github.com/cure53/DOMPurify)
- **Testing**: [Playwright](https://playwright.dev/) end-to-end testing suite

---

## Project Structure

```text
MarkdownReader/
├── index.html               # Main application shell and UI markup
├── package.json             # Project dependencies and npm scripts
├── vite.config.js           # Vite configuration & PWA Service Worker setup
├── public/                  # Static assets & PWA manifest icons
│   └── icons/
├── src/                     # Application source modules
│   ├── main.js              # Application entry point & orchestration
│   ├── editor.js            # Editor input handling, line numbers & shortcuts
│   ├── preview.js           # Markdown rendering pipeline & sanitization
│   ├── fileIO.js            # Native File System Access API & file loading/saving
│   ├── persistence.js       # Local draft storage & autosaving
│   ├── scrollsync.js        # Ratio-based synchronized scrolling
│   ├── locate.js            # Bi-directional source-preview element spotlighting
│   ├── outline.js           # Heading extraction and interactive outline tree
│   ├── find.js              # Find and replace bar with match highlights
│   ├── format.js            # Formatting toolbar actions & smart list continuation
│   ├── export.js            # Print, HTML export, and clipboard copy operations
│   ├── images.js            # Image paste and drag-and-drop embedding
│   ├── mermaid.js           # Mermaid initialization and dynamic theme switching
│   ├── recent.js            # Recent files management & quick picker
│   ├── theme.js             # Dark / light theme management
│   ├── view.js              # View toggles (Reader mode, status badges, banners)
│   ├── style.css            # Complete design system, layouts, and responsive styles
│   └── extensions/          # Custom Marked extensions
│       ├── alerts.js        # GitHub-style callout alerts ([!NOTE], etc.)
│       └── mermaid-renderer.js # Mermaid code block token parsing
└── tests/                   # Test suite
    └── e2e/                 # Playwright E2E test specs and configuration
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/AkashM010/MarkdownReader.git
cd MarkdownReader
npm install
```

### Development Server
Start the local Vite development server:

```bash
npm run dev
```

Open the displayed URL (usually `http://localhost:5173`) in your browser.

### Production Build
To create an optimized production build in the `dist/` directory:

```bash
npm run build
```

To locally preview the production build:

```bash
npm run preview
```

### Running Tests
Run the comprehensive Playwright end-to-end test suite:

```bash
# Run tests on Chromium (default)
npm test

# Run tests across all configured browsers
npm run test:e2e:all

# View the test report
npm run test:e2e:report
```

---

## Browser Support

| Browser | Full Features (File System Access) | Fallback Mode (Upload/Download) |
| :--- | :---: | :---: |
| **Google Chrome** (86+) | ✅ Yes | — |
| **Microsoft Edge** (86+) | ✅ Yes | — |
| **Brave / Opera / Chromium** | ✅ Yes | — |
| **Mozilla Firefox** | ⚠️ Fallback | ✅ Supported |
| **Apple Safari** | ⚠️ Fallback | ✅ Supported |

> **Note:** Browsers supporting the File System Access API enable in-place saving (`Ctrl+S`) directly to the opened file on disk. In other browsers, saving downloads the updated `.md` file.

---

## License

This project is private or licensed under the repository terms. See the repository configuration for details.
