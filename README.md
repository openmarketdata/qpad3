# qweb3

Browser-based IDE for [kdb+/q](https://code.kx.com/q/). Connects directly to a running q process over WebSocket and speaks the **q IPC binary protocol** natively in JavaScript — no backend server required.

## Features

- **CodeMirror 6 editor** with q syntax highlighting, autocomplete, and Ctrl+Enter / Shift+Enter execution
- **Readonly REPL viewer** with `q)` / `=>` gutter markers and automatic history trimming
- **Native q IPC codec** — full binary serialize/deserialize including nested types, compressed messages, and temporal types
- **Remote JS invocation** — q server can push function calls to the browser via `window.eval`

## Roadmap

- **Data visualization panel** — tabbed pane alongside the REPL viewer for rendering charts and grids from q query results
- **Charting library integration** — interactive time-series, bar, scatter, and candlestick charts driven by q table data
- **Visual panel tabs** — switch between REPL output, chart view, and grid view within the right pane

## Prerequisites

- **Node.js** ≥ 18
- **kdb+/q** server running with WebSocket support (port accessible from browser)

## Build & Run

```bash
npm install
npm run build      # webpack 5 → dist/index.js + dist/index.html
```

Serve the `dist/` directory behind a running q process. The app connects via `ws://host:port`.

```bash
npm run clean      # removes dist/
```

## Architecture

Six ESM modules, no framework. See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

```
src/
├── index.mjs    → entry point, wires QWebSocket ↔ editor ↔ viewer
├── qws.mjs      → WebSocket lifecycle, HTTP handshake, message dispatch
├── ipc.mjs      → q IPC binary codec (serialize / deserialize / decompress)
├── editor.mjs   → CodeMirror 6 code editor (left pane)
├── viewer.mjs   → CodeMirror 6 readonly REPL viewer (right pane)
└── lang-q.mjs   → StreamLanguage tokenizer for q syntax highlighting
```

## License

[MIT](LICENSE)
