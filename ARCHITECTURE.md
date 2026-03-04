# qweb3 — Architecture Document

## Overview

**qweb3** is a browser-based client for [kdb+/q](https://code.kx.com/q/), a high-performance columnar time-series database. It connects to a running q process over WebSocket, serializes/deserializes the native q IPC binary protocol in JavaScript, and provides a two-pane IDE-style interface with a CodeMirror 6 code editor and a readonly REPL viewer.

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser                                 │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ index.mjs │─▶│  qws.mjs  │─▶│ ipc.mjs  │  │  lang-q.mjs  │   │
│  │  (entry)  │  │(WebSocket)│  │(codec)   │  │ (q language) │   │
│  └─────┬─────┘  └─────┬─────┘  └──────────┘  └──────┬───────┘   │
│        │               │                             │           │
│        ▼               │                             ▼           │
│  ┌───────────┐         │ WebSocket          ┌──────────────┐     │
│  │editor.mjs │         │                    │  CodeMirror 6 │     │
│  │(code edit)│         │                    │  (shared dep) │     │
│  └───────────┘         │                    └──────────────┘     │
│        │               │                             ▲           │
│        ▼               │                             │           │
│  ┌───────────┐         │                             │           │
│  │viewer.mjs │◀────────┘ (results via cm.disp)       │           │
│  │(REPL out) │───────────────────────────────────────┘           │
│  └───────────┘                                                   │
└──────────────────────────┬───────────────────────────────────────┘
                           │  ws://host:port
                           ▼
                  ┌─────────────────┐
                  │   kdb+/q Server │
                  │   (.z.ws)       │
                  └─────────────────┘
```

## Project Structure

```
qweb3/
├── package.json              # npm manifest (webpack 5, ESM)
├── webpack.config.mjs        # Webpack build configuration
├── ARCHITECTURE.md           # This document
└── src/
    ├── index.html            # HTML shell (two-pane layout)
    ├── index.mjs             # Application entry point
    ├── qws.mjs               # QWebSocket – connection & message dispatch
    ├── ipc.mjs               # q IPC binary protocol codec
    ├── lang-q.mjs            # CodeMirror 6 q language mode (syntax highlighting)
    ├── editor.mjs            # CodeMirror 6 code editor (left pane)
    ├── viewer.mjs            # CodeMirror 6 readonly REPL viewer (right pane)
    └── grid.mjs              # Perspective data grid (right pane, Grid tab)
```

## Module Descriptions

### 1. `src/index.mjs` — Entry Point

Imports and bootstraps all modules. This is the Webpack entry point that gets bundled into `dist/index.js`.

| Responsibility | Detail |
|---|---|
| **QWebSocket** | Creates a `QWebSocket` instance, exposes it as `window.qconn`, and calls `connect()`. |
| **Viewer** | Creates the readonly REPL viewer in `#viewer-container` (right pane). Exposed as `window.cm` so the q server can call `cm.disp()`, `cm.clear()` via `window.eval`. |
| **Editor** | Creates the code editor in `#editor-container` (left pane). On execute (Ctrl+Enter / Shift+Enter), appends the code to the viewer with a `q)` gutter marker, then sends it to q. |
| **Wiring** | Calls `qconn.setEditor(viewer)` so that `onMessage` can display results via `this.cm.disp()` / `this.cm.setOpacity()`. |

### 2. `src/qws.mjs` — QWebSocket

The central orchestrator. Responsibilities:

| Concern | Detail |
|---|---|
| **Connection handshake** | Sends an HTTP request to check whether `.z.ws` (the q WebSocket handler) is already configured. If not, sets it to a hex-encoded q expression that provides a display/dispatch framework. |
| **WebSocket lifecycle** | Opens a `ws://` connection, binds `onopen`, `onmessage`, `onerror`, `onclose`. |
| **Initialization** | On open, sends `.ws.grid` — a hex-encoded q function that converts q objects into grid-friendly column metadata and pushes them to the browser via `ui.update_wdr`. |
| **Message dispatch** | Incoming binary messages are deserialized via `ipc.mjs`. The handler inspects the k-type byte to decide the action: <br>• **Remote JS invocation** — messages of the form `(::;(\`fn;args);(\`callback;args))` invoke a JavaScript function and optionally send a callback to q. <br>• **Display** — other results are rendered via `this.cm.disp()` (the viewer). |
| **Editor integration** | `setEditor(editor)` attaches a viewer instance. `this.cm.setOpacity()` and `this.cm.disp()` are called from `onMessage` to provide visual feedback and display results. |
| **Serialization helpers** | `serialize()` / `deserialize()` delegate to `IPC`. |

#### Connection Flow

```
Browser                                   q Server
  │                                          │
  │── GET /?(-8!.z.ws)~<zws hex> ──────────▶│  Check if .z.ws matches
  │◀─── 200 (body contains "1b") ───────────│  Already set → continue
  │  OR                                      │
  │◀─── 200 (mismatch) ────────────────────│  Prompt user to overwrite
  │── GET /?.z.ws:-9!<zws hex> ────────────▶│  Set .z.ws
  │                                          │
  │══ WebSocket upgrade (ws://?encoding=text)│
  │                                          │
  │── .ws.grid:-9!<grid hex> ──────────────▶│  Register grid formatter
  │◀── (::;(`ui.update_wdr;data)) ─────────│  Push table data
  │                                          │
```

### 3. `src/ipc.mjs` — q IPC Binary Protocol Codec

A pure-JavaScript implementation of the kdb+ IPC binary format. Handles both **deserialization** (q → JS) and **serialization** (JS → q).

#### Supported k-Types

| k-Type | q Type | JS Representation |
|--------|--------|-------------------|
| 0 | mixed list | `Array` |
| 1 | boolean list | `Array<boolean>` |
| 2 | GUID list | `Array<string>` (hex) |
| 4 | byte list | `Array<number>` |
| 5 | short list | `Array<number>` |
| 6 | int list | `Array<number>` |
| 7 | long list | `Array<number\|BigInt>` |
| 8 | real list | `Array<number>` |
| 9 | float list | `Array<number>` |
| 10 | char list (string) | `string` |
| 11 | symbol list | `Array<string>` |
| 12 | timestamp list | `Array<Date\|string>` |
| 13 | month list | `Array<string>` |
| 14 | date list | `Array<Date\|number>` |
| 15 | datetime list | `Array<Date\|number>` |
| 16 | timespan list | `Array<string>` |
| 17 | minute list | `Array<string>` |
| 18 | second list | `Array<string>` |
| 19 | time (ms) list | `Array<string>` |
| 98 | table | `Object` with `Symbol.for('meta')` |
| 99 | dictionary / keyed table | `Object` |
| 100 | lambda | `string` (body) |
| 101 | unary primitive | `string` (operator) |
| 102 | operator | `string` |
| 103 | iterator (adverb) | `string` |
| 104 | projection | `Array` |
| 237–255 (atoms) | scalar versions of the above | corresponding scalar JS type |

#### Special Values

Null, positive infinity, and negative infinity are mapped per q convention:

| q Width | Null | +∞ | -∞ |
|---------|------|-----|-----|
| short (2 bytes) | `0x8000` → `NaN` | `0x7FFF` → `Infinity` | `0x8001` → `-Infinity` |
| int (4 bytes) | `0x80000000` → `NaN` | `0x7FFFFFFF` → `Infinity` | `0x80000001` → `-Infinity` |
| long (8 bytes) | `0x8000000000000000` → `NaN` | `0x7FFFFFFFFFFFFFFF` → `Infinity` | `0x8000000000000001` → `-Infinity` |

#### Decompression

Messages with the compression flag (`buffer[2] === 1`) are decompressed in-place using kdb+'s LZ-style algorithm before deserialization.

#### Deserialization Options

| Option | Default | Effect |
|--------|---------|--------|
| `useBigInt` | `false` | Return long values as `BigInt` instead of `Number` |
| `includeNanosecond` | `false` | Return timestamps as ISO strings with nanosecond precision |
| `dateToMillisecond` | `false` | Return dates/datetimes as epoch-ms numbers instead of `Date` objects |

#### Table Representation

Tables are deserialized into a column-oriented object:

```js
{
  sym: ["AAPL", "GOOG", "MSFT"],
  price: [150.5, 2800.1, 300.0],
  [Symbol.for('meta')]: { c: ["sym", "price"], t: ["s", "f"] }
}
```

- `Symbol.for('meta').c` — column names
- `Symbol.for('meta').t` — column type characters (matching q's type system)
- Keyed tables merge key and value columns, with `Symbol.for('keys')` tracking key columns.

#### Serialization

`serialize(obj)` writes a JavaScript value into a q IPC binary buffer. The function:

1. Infers the k-type from the JS value (`getKType`).
2. Pre-calculates the total message length (`calcMsgLength`).
3. Allocates a single `Buffer` and writes the 8-byte IPC header + payload.

An `ACK` constant (`01020000 0a000000 6500`) is exported for sending acknowledgement messages.

### 4. `src/lang-q.mjs` — Q Language Mode

CodeMirror 6 `StreamLanguage` definition for q syntax highlighting. Ported from the [official CodeMirror 5 q mode](https://codemirror.net/5/mode/q/q.js).

| Feature | Detail |
|---|---|
| **Comments** | Line (`/`), block (`/` … `\`), inline (space + `/`), and `\` to EOF |
| **Strings** | Double-quoted with backslash escapes |
| **Symbols** | Backtick literals (`` `sym ``, `` `path.to.sym ``) |
| **Numbers** | Integers, floats, hex (`0x`), binary (`01b`), typed (`42j`, `3.14f`), nulls/infinities (`0N`, `0W`) |
| **Temporals** | Dates, times, timestamps, timespans, months, minutes, seconds |
| **Keywords** | All q built-in functions |
| **System commands** | `\l`, `\t`, `\d`, etc. |
| **Indentation** | Context-aware bracket/brace indentation from the original mode |

Exports:
- `qLanguage` — the `StreamLanguage` instance
- `qHighlightStyle` — dark-themed `syntaxHighlighting` extension

### 5. `src/editor.mjs` — Code Editor (Left Pane)

A CodeMirror 6 editor for writing q code.

| Feature | Detail |
|---|---|
| **Language** | Uses `qLanguage` and `qHighlightStyle` from `lang-q.mjs` |
| **Theme** | One Dark-style dark theme (`#282c34` background) |
| **Keybindings** | **Ctrl+Enter** — send current line or selection; **Shift+Enter** — send entire buffer |
| **Extensions** | Line numbers, bracket matching, auto-close brackets, active line highlight, fold gutter, history, search |
| **API** | `getValue()`, `setValue(text)` |

### 6. `src/viewer.mjs` — REPL Viewer (Right Pane)

A readonly CodeMirror 6 instance that displays the REPL session with custom gutter prompts.

| Feature | Detail |
|---|---|
| **Readonly** | `EditorState.readOnly` + `EditorView.editable.of(false)` |
| **Gutter prompts** | Custom `GutterMarker` subclasses: `q)` for input lines, `=>` for result lines |
| **Result markers** | `=>` shown only on the first line of multi-line results |
| **State management** | `StateField` with `addPrompt` / `clearPrompts` effects tracking per-line prompt markers via `RangeSet` |
| **History limit** | Keeps the last 16 `q)` calls and their results; older entries are auto-trimmed |
| **Scrolling** | Enabled (`overflow: auto`), auto-scrolls to bottom on new content |
| **API** | `appendInput(code)`, `appendOutput(text)`, `disp(prompt, value)`, `clear()`, `setOpacity(n)` |

The viewer is exposed as `window.cm` so the q server can call functions like `cm.disp('=>', result)` or `cm.clear()` via `window.eval`.

### 7. `src/grid.mjs` — Data Visualization Panel

A Perspective-powered data grid and visualization panel for rendering interactive grids from q query results.

| Aspect | Detail |
|---|---|
| **Library** | [@finos/perspective](https://perspective.finos.org/) JavaScript client — a high-performance WebAssembly-powered data grid and visualization engine. |
| **Factory** | `createGrid(container)` — mounts a `<perspective-viewer>` element, returns an API object. |
| **Global variable** | The grid instance is exposed as `window.psp` (paralleling `window.cm` for the REPL viewer), enabling q-side remote invocation via `window.eval`. |
| **Data updates** | `psp.update(data)` — accepts column-oriented objects (matching the existing table representation from `ipc.mjs` with `Symbol.for('meta')` metadata). Strips symbol metadata before passing to Perspective. |
| **Integration point** | `qws.mjs` message dispatch — when the q server pushes table data via `ui.update_wdr`, the handler routes it to `psp.update()`. |
| **Webpack** | `@finos/perspective` and its WASM assets are bundled via Webpack 5 using `@finos/perspective-webpack-plugin`. |
| **API** | `update(data)`, `clear()`, `getTable()`, `getViewer()` |

#### Data Flow

```
q Server ──ws──▶ qws.mjs ──deserialize──▶ ipc.mjs
                    │
                    ├──▶ cm.disp()      (REPL viewer)
                    └──▶ psp.update()   (Perspective grid)
```

### 8. Visual Panel Tabs

A lightweight tab system switching between REPL output and grid view within the right pane (`.two`).

| Aspect | Detail |
|---|---|
| **Tab bar** | A tab strip rendered above `#viewer-container` inside `.two`, with tabs for **REPL** and **Grid**. |
| **Switching** | Clicking a tab toggles `display: none` on the inactive container and `display: flex` on the active one. No content is destroyed — both the CodeMirror viewer and Perspective grid remain mounted in the DOM. |
| **HTML structure** | `#viewer-container` (existing REPL) and a new `#grid-container` (Perspective viewer) sit as siblings inside `.two`, below the tab bar. |
| **Active tab state** | Managed via a CSS class (`.tab-active`) on the selected tab element; no framework state required. |
| **Auto-switch** | When `psp.update()` receives new data, the grid tab auto-activates to surface results immediately. |

#### Updated Layout

```
┌──────────────────────┬──────────────────────────────┐
│  .one (420px fixed)  │  .two (flex: 1)              │
│                      │  ┌──────┬──────┐             │
│  #editor-container   │  │ REPL │ Grid │  ◀ tab bar  │
│  (CodeMirror editor) │  ├──────┴──────┤             │
│                      │  │ #viewer-container          │
│                      │  │   OR                       │
│                      │  │ #grid-container            │
│                      │  │  (Perspective viewer)      │
│                      │  └────────────────────────────│
└──────────────────────┴──────────────────────────────┘
```

### 9. `src/index.html` — HTML Shell

Two-pane flexbox layout with tab bar:

```
┌──────────────────────┬──────────────────────────────┐
│  .one (420px fixed)  │  .two (flex: 1)              │
│                      │                              │
│  #editor-container   │  #viewer-container           │
│  (CodeMirror editor) │  (CodeMirror viewer)         │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

Inline `<style>` sets dark background (`#1e1e1e`), full-height layout, and ensures both CodeMirror instances fill their containers.

## Build Pipeline

| Tool | Purpose |
|------|---------|
| **Webpack 5** | Module bundler (ESM output via `experiments.outputModule`) |
| **HtmlWebpackPlugin** | Injects the bundle into `index.html` |
| **style-loader + css-loader** | Bundles CSS into the JS output |
| **buffer polyfill** | Provides Node.js `Buffer` API in the browser (`resolve.fallback`) |
| **CodeMirror 6** | Code editor framework (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, etc.) |
| **Lezer** | Syntax highlighting infrastructure (`@lezer/highlight`) |
| **@finos/perspective** | WebAssembly-powered data grid and visualization engine |
| **@finos/perspective-webpack-plugin** | Bundles Perspective WASM assets via Webpack 5 |

```
src/index.mjs ───┐
src/qws.mjs ─────┤
src/ipc.mjs ─────┤  webpack
src/lang-q.mjs ──┤  ──────▶  dist/index.js + dist/index.html
src/editor.mjs ──┤
src/viewer.mjs ──┤
src/grid.mjs ────┘
```

Build commands:

```sh
npm run build    # webpack --config webpack.config.mjs
npm run clean    # rm -rf dist
```

## Data Flow Summary

1. **User opens the page** → `index.mjs` creates a `QWebSocket`, a viewer, and an editor.
2. **HTTP handshake** → verifies/sets `.z.ws` on the q server.
3. **WebSocket opens** → sends `.ws.grid` function to q.
4. **User writes q code** in the editor (left pane) and presses Ctrl+Enter.
5. **Editor callback** → code is appended to the viewer with a `q)` gutter marker, then serialized and sent to q.
6. **q evaluates the expression** → result is serialized in q IPC binary format and pushed via `.z.ws`.
7. **`onMessage`** → binary `ArrayBuffer` is deserialized by `ipc.mjs` into JS objects.
8. **Dispatch** → q can invoke arbitrary JS functions on the client (e.g., `cm.disp('=>', result)`) for display in the viewer with a `=>` gutter marker.
9. **History management** → viewer auto-trims to keep the last 16 calls; `cm.clear()` resets all content and markers.

## Key Design Decisions

- **Binary protocol over WebSocket** — uses `arraybuffer` binary type for efficient transfer of typed numeric data, avoiding JSON overhead.
- **Hex-encoded q bootstrap** — `.z.ws` and `.ws.grid` are sent as hex-encoded q byte vectors (`-9!`) to avoid escaping issues in URL/query strings.
- **Column-oriented tables** — mirrors q's native column store layout for zero-copy-style access patterns.
- **Symbol metadata** — `Symbol.for('meta')` and `Symbol.for('kType')` annotations are non-enumerable markers that preserve q type information through the JS layer without polluting object keys.
- **Browser Buffer polyfill** — uses the `buffer` npm package to provide Node.js `Buffer` semantics (little-endian reads, subarray, etc.) in the browser.
- **CodeMirror 6 for both editor and viewer** — shared language mode (`lang-q.mjs`) provides consistent q syntax highlighting across the editable code editor and readonly REPL output.
- **Custom gutter markers** — `StateField` with `RangeSet` tracks per-line prompt types (`q)` / `=>`), with dedicated `addPrompt` / `clearPrompts` effects for clean state management.
- **`window.cm` global** — the viewer is exposed as `window.cm` so the q server can call `cm.disp()`, `cm.clear()`, etc. via remote JS invocation (`window.eval`), maintaining compatibility with the q-side dispatch framework.


