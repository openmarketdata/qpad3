---
applyTo: "src/ipc.mjs"
---
# IPC Codec — src/ipc.mjs

Pure-JavaScript implementation of the kdb+ IPC binary format. Handles **deserialization** (q → JS) and **serialization** (JS → q).

## Conventions

- Uses Node.js `Buffer` API polyfilled for browser (`buffer` npm package, configured in webpack `resolve.fallback`).
- Tables are **column-oriented objects** with `Symbol.for('meta')` for column names/types and `Symbol.for('keys')` for keyed table key columns.
- k-type metadata stored as `Symbol.for('kType')` — non-enumerable property, preserves q type info through JS.
- Null/infinity sentinel values map per q convention (e.g., `0x80000000` → `NaN` for int null). See `NULL_MAP`.

## When Modifying

### Adding q type support
1. Add the k-type constant in `SIZE_BY_K_TYPE`.
2. Handle deserialization in `deserialize`'s switch statement.
3. Add serialization support in `getKType` / `calcMsgLength` / `serialize`.
4. Map null/infinity sentinels if applicable.
5. Always handle both serialize **and** deserialize directions.
