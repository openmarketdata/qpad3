---
name: testing-qpad3-grid-repl
description: Test the qpad3 REPL/GRID web UI end-to-end against a live q backend. Use when verifying grid rendering, tab switching, or `.ws.grid` behavior.
---

# Testing qpad3 (REPL + Perspective GRID)

qpad3 is a webpack-built web app: a CodeMirror editor (left) executes q expressions
against a live q WebSocket backend; the right pane has two tabs, **REPL** (CodeMirror
output) and **GRID** (Perspective datagrid).

## Run it locally
```bash
cd <repo>            # e.g. /home/ubuntu/qpad3
npm run build        # regenerates the served bundle (dist)
QHOME=bin QLIC=bin ./bin/l64/q test/serve.q -p 5000   # live q server + static serve
# open http://localhost:5000/
```
- `bin/l64/q` is a licensed Linux q binary (uses `bin/kc.lic`). The Windows `bin/w64/q.exe`
  is a placeholder and the license is rejected on Linux — always use `bin/l64/q`.
- `test/serve.q`, `test/*`, and `bin/` are test scaffolding, not part of any PR.
- If port 5000 is already bound, a q server from a prior session is likely still running —
  just reuse it (the freshly built bundle is served either way; confirm with
  `curl -s http://localhost:5000/ | grep -i grid`).
- **Always hard-refresh (Ctrl+Shift+R)** after `npm run build`; a stale cached `index.js`
  is the #1 cause of "fix doesn't work" confusion.

## Driving the UI
- Click the left editor, type a q expression, press **Ctrl+Enter** to execute.
- To replace the previous command: Ctrl+A then type.
- Tabs: REPL ~x=481,y=64; GRID ~x=520,y=64 (1024x768 space). Editor body ~x=230,y=90.

## Key behaviors / facts
- A `.ws.grid <table>` call pushes a grid frame AND emits a trailing REPL echo `=> ::`
  (the call returns generic null `::`). Normal commands emit `=> <result>`.
- Tab switching is **driven by the server response**, not the typed command:
  grid frame -> GRID; a `viewer.disp('=>', value)` with `value != '::'` -> REPL.
  So the `=> ::` echo from a grid call is intentionally ignored and must NOT bounce to REPL.
- Grid recreates its Perspective table when the incoming schema changes (column names/types).
- Nested-list and char columns are flattened/split to render (Perspective has no list type).

## Adversarial tests that distinguish working vs broken tab switching
- **Response-driven proof:** define `f:{.ws.grid x}` then run `f ([] a:1 2 3)`. The typed
  line has no literal `.ws.grid`, so a command-regex impl would stay on REPL; a correct
  response-driven impl switches to GRID.
- **Echo must not bounce:** run a direct `.ws.grid (...)`; tab must stay GRID even though
  the REPL pane receives a `=> ::` echo (click REPL afterward to confirm the echo exists).
- **Return to REPL:** run `til 5`; tab switches to REPL showing `=> 0 1 2 3 4`.

## Evidence gathering
- Use `browser_console` to confirm a clean console (expect only `Connecting to Q`,
  `Connected, initializing`, `Deserializing type: N`, `Executing: ...` logs).
- Record browser interactions; annotate each test.

## Devin Secrets Needed
- None. The q license (`bin/kc.lic`) ships in the repo; no external secrets required.
