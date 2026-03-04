---
applyTo: "src/grid.mjs"
---
# Data Grid — src/grid.mjs

Perspective-powered data grid for rendering interactive tables from q query results.

## Conventions

- Exports `createGrid(container)` — factory function, not a class.
- Exposed as `window.psp` for remote JS invocation from q server.
- Accepts column-oriented objects from `ipc.mjs` with `Symbol.for('meta')` metadata.
- Strips symbol metadata (`Symbol.for('meta')`, `Symbol.for('keys')`) before passing to Perspective.
- Schema is inferred from q meta type characters on first load; subsequent calls use `table.update()`.
- Worker and table are lazily initialized on first `update()` call.

## When Modifying

### Changing the schema inference
1. Update the `typeMap` in `inferSchema()` to map q type characters → Perspective types.
2. Perspective supports: `boolean`, `integer`, `float`, `string`, `date`, `datetime`.

### Adding new API methods
1. Add to the returned object from `createGrid()`.
2. Follow the existing `update()` / `clear()` pattern (async, null-safe on `table`).
3. Ensure methods are accessible via `window.psp.<method>()` for q server calls.
