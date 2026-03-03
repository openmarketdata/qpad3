# Copilot Instructions — qweb3

## Project Overview

Browser-based kdb+/q IDE: WebSocket client that speaks the **q IPC binary protocol** natively in JavaScript. Two-pane layout — CodeMirror 6 editor (left) + readonly REPL viewer (right). No backend server; connects directly to a running q process via `ws://`.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for full module descriptions, diagrams, and data flow.

## Goals

- **Data visualization panel** — tabbed pane alongside the REPL viewer for rendering charts and grids from q query results.
- **Charting** — interactive time-series, bar, scatter, and candlestick charts driven by q table data.
- **Visual panel tabs** — switch between REPL output, chart view, and grid view within the right pane.

## Build & Run

- **Build:** `npm run build` (webpack 5, outputs `dist/index.js` + `dist/index.html`)
- **Clean:** `npm run clean` (removes `dist/`)
- **No dev server, no tests, no linter** configured. Serve `dist/` behind a running q process that accepts WebSocket connections.
- Uses **ESM throughout** (`"type": "module"`, `.mjs` extensions, `webpack.config.mjs`).

## Global Conventions

- Each module exports a single factory or class: `createEditor()`, `createViewer()`, `class QWebSocket`, `class IPC`.
- No default exports except `QWebSocket` and `IPC`. Editor/viewer use named exports.
- Globals on `window`: `window.qconn` (WebSocket), `window.cm` (viewer), `window.editor` — required for q server remote JS invocation via `window.eval`.
- Dark theme defined inline per component (`darkTheme` in editor, `viewerTheme` in viewer).
- Both editor and viewer share `qLanguage` + `qHighlightStyle` from `lang-q.mjs`.

## Scoped Instructions

Component-specific conventions and modification guides are in `.github/instructions/`:

| File | Applies to |
|---|---|
| `ipc.instructions.md` | `src/ipc.mjs` |
| `viewer.instructions.md` | `src/viewer.mjs` |
| `editor.instructions.md` | `src/editor.mjs` |
| `qws.instructions.md` | `src/qws.mjs` |
| `webpack.instructions.md` | `webpack.config.mjs` |
