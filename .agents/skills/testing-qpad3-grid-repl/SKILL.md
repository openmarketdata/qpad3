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
  grid frame -> GRID; a REPL result -> REPL.
- A `::` (generic null) result is ambiguous: it is both the `.ws.grid` trailing echo AND
  the legit return of many commands. Discriminator: a `::` is suppressed (stays on GRID)
  **only when a grid frame immediately preceded it** (a `gridFrameForThisResult` flag set
  synchronously when the grid frame arrives, reset per result). A `::` with no preceding
  grid frame DOES switch to REPL. So `.ws.grid (...)` stays GRID, but a genuine
  `::`-returning call (e.g. `f:{x;}; f 5`) switches to REPL.
- Grid recreates its Perspective table when the incoming schema changes (column names/types).
- Nested-list and char columns are flattened/split to render (Perspective has no list type).

## Adversarial tests that distinguish working vs broken tab switching
- **Response-driven proof:** define `f:{.ws.grid x}` then run `f ([] a:1 2 3)`. The typed
  line has no literal `.ws.grid`, so a command-regex impl would stay on REPL; a correct
  response-driven impl switches to GRID.
- **Echo must not bounce:** run a direct `.ws.grid (...)`; tab must stay GRID even though
  the REPL pane receives a `=> ::` echo (click REPL afterward to confirm the echo exists).
- **Return to REPL:** run `til 5`; tab switches to REPL showing `=> 0 1 2 3 4`.
- **Genuine `::` must switch to REPL:** define `f:{x;}`, run a `.ws.grid (...)` to land on
  GRID, then run `f 5` (returns `::`, no grid frame). Tab must switch to REPL showing
  `=> ::`. A broken/over-suppressing impl stays on GRID. Pair with the echo test above to
  prove the `::` discriminator works both ways.

## GRID temporal display format (q-style dates/times)
- Date/datetime/timestamp grid columns render as q text strings (not Perspective
  locale form): date `d` -> `yyyy.mm.dd`, datetime `z` -> `yyyy.mm.ddTHH:MM:SS.fff`,
  timestamp `p` -> `yyyy.mm.ddDHH:MM:SS.fffffffff`. Implemented in `src/grid.mjs`
  (`qTemporal`, `prepareData(meta)`, `inferSchema` maps d/z/p -> `string`); `src/qws.mjs`
  decodes with `includeNanosecond=true` so timestamps keep full ns.
- Adversarial test query (single `.ws.grid` covers it):
  ```
  .ws.grid ([] d:2024.01.15 2024.02.29 0Nd; z:2024.01.15T10:30:00.123 2024.02.29T23:59:59.999 0Nz; p:2024.01.15D10:30:00.123456789 2024.02.29D23:59:59.999999999 0Np)
  ```
  Distinguishers vs a broken impl: timestamp keeps full ns (`.123456789`, not
  `.123000000`); `p` uses `D` and `z` uses `T`; leap-day `2024.02.29` proves no
  month/day transpose; `0Nd`/`0Nz`/`0Np` nulls render blank (not `NaN`/`Invalid Date`).
- Read exact cell text from the rendered `<regular-table>` DOM (returned with the
  screenshot) rather than eyeballing — it's authoritative.
- Scope: GRID only. The REPL pane shows raw values via JSON (not q-formatted).

## GRID reload vs append (`.ws.grid` reload, `.ws.grida` append)
- `.ws.grid <table>` **reloads** (replaces all rows) every call, even on the same schema.
  Implemented JS-side as `table.clear()` then `table.update()` (a bare `table.update`
  appends with no index). It also stores the displayed schema server-side in `.ws.gschema`.
- `.ws.grida <table>` **appends** rows; at the start it compares the incoming schema
  (`exec c!t from meta t`) against `.ws.gschema` and signals `'grida: schema mismatch` if
  they differ (different column names, order, or types). Wired via a separate `grida`
  response frame -> `grid.append()` (which also switches to GRID, like `grid.update`).
- Adversarial tests:
  - **Reload, not append:** run `.ws.grid ([] sym:`a`b`c; v:1 2 3)` then
    `.ws.grid ([] sym:`x`y; v:10 20)` (same schema). Must show **2 rows** (x/y), not 5.
    Same schema is the decisive check — the old behavior accumulated.
  - **Append:** then `.ws.grida ([] sym:`z`w; v:30 40)` -> **4 rows** (x,y,z,w). Only 2
    would mean grida reloaded instead of appended.
  - **Schema guard:** then `.ws.grida ([] foo:`q`r; bar:99 100)` -> REPL shows
    `=> 'grida: schema mismatch`, GRID unchanged at the 4 rows.
- **q table-literal gotcha (test-input pitfall, NOT a bug):** a literal with all-scalar
  columns like `([] sym:`z; v:30)` raises `'rank` when *constructed*, before `.ws.grida`
  ever runs. Always give list columns: `([] sym:`z`w; v:30 40)`, or
  `([] sym:enlist`z; v:enlist 30)` for a single row. If you see `'rank`, fix the query,
  don't conclude the feature is broken.

## If `test/serve.q` is missing from the checkout
Some branches don't carry the test scaffolding. Recreate `test/serve.q` (any q file works) so the
**same origin** serves `dist/` statically *and* evaluates `?<q expr>` HTTP queries — the client
bootstraps `.z.ws` with `fetch('/?(-8!.z.ws)~0x...')` and derives the WS URL from
`window.location`, so a separate static server will not work. Requirements:
- `.z.ph:{...}` → for `""`/`"/"` serve `dist/index.html`; for other paths serve `dist/<path>`
  with a correct `Content-Type` (`application/javascript`, `application/wasm`, `text/css`);
  a path starting with `?` must be `value`-d and returned as `"<pre>",(-3!result),"</pre>"`.
- On an eval error return **HTTP 400** — the client relies on the 400 to fall into its
  `.z.ws:-9!...` bootstrap path; returning 200 with the error text triggers the
  "`.z.ws` is already set by others" confirm dialog instead.
- `chmod +x bin/l64/q` may be needed.
- q exits immediately when started with stdin closed (`nohup ... < /dev/null`). Start it as
  `setsid bash -c 'QHOME=bin QLIC=bin exec ./bin/l64/q test/serve.q -p 5000 < <(tail -f /dev/null) > /tmp/qserve.log 2>&1' &`.

## Perspective viewer / plugin-switch testing (GRID tab)
- Hover the viewer → **configure** button at the far top-right (~988,91 at 1024x768) opens the
  settings panel. The plugin name button next to it (~957,91) opens the plugin list:
  Datagrid (y≈124), Treemap, Sunburst, Heatmap, X Bar, X/Y Line (y≈247), X/Y Scatter, Y Bar (y≈309),
  Y Area, Y Scatter, OHLC, Candlestick — offsets shift by one row depending on the current plugin,
  so screenshot the open list before clicking.
- Assigning a column to a named slot (X Axis / Y Axis / Columns) requires a **real drag** from the
  "All Columns" list row handle (x≈912) onto the slot box; clicking the round button at the right
  of a row only focuses it.
- The status line (`10 x 2 (4)`) is the fastest oracle: `rows x activeColumns (availableColumns)`.
  `10 x 0 (4)` = nothing selected; `10 x 4` = all columns active.
- Known caveat (as of PR #29/#30): after Datagrid → chart → Datagrid the datagrid can come back with
  **0 active columns** (blank). A same-schema `.ws.grid` reload does not recover it; only a query
  with a different schema (which recreates the Perspective table) or manually dragging columns back
  does. Check this whenever touching `perspective-config-update` / `viewer.restore` logic.
- **`config_column_names` does NOT distinguish datagrid from charts.** Measured live in this app
  (perspective 3.8): `Datagrid → ["Columns"]`, `Y Line → ["Y Axis"]`,
  `X/Y Line → ["X Axis","Y Axis","Tooltip"]`. So `if (!plugin.config_column_names) …` /
  `config_column_names.length === 1` are both wrong tests for "the datagrid"; `config_columns` and
  `constructor.config_columns` are `undefined` for all plugins, and `select_mode` is `toggle` for
  Datagrid *and* X/Y Line (`select` for Y Line). Use the plugin `name` / element tag
  (`Datagrid` / `PERSPECTIVE-VIEWER-DATAGRID`) if you need that distinction.
- The working discriminator is `plugin.min_config_columns` — a number for every d3fc chart, `undefined`
  for the datagrid. Verified end-to-end (PR #30, commit `7f12d23`): with it, Datagrid → chart → Datagrid
  restores all columns and rows.
- Dragging a column onto an axis slot that is *already occupied* does not replace the existing chip;
  drop into empty slots (or clear the slot first) when scripting axis assignments.
- Quick runtime introspection for diagnosis (read-only, don't drive the UI this way):
  `const v=document.querySelector('perspective-viewer'); await v.save(); await v.getPlugin('Datagrid')`.
  `save().columns` is the authoritative slot state — `[null,null,null]` means every slot blank.

## Evidence gathering
- Use `browser_console` to confirm a clean console (expect only `Connecting to Q`,
  `Connected, initializing`, `Deserializing type: N`, `Executing: ...` logs).
- Record browser interactions; annotate each test.

## Devin Secrets Needed
- None. The q license (`bin/kc.lic`) ships in the repo; no external secrets required.
