---
applyTo: "src/qws.mjs"
---
# QWebSocket — src/qws.mjs

Central orchestrator: WebSocket lifecycle, HTTP handshake, message dispatch.

## Conventions

- **Hex-encoded q expressions** (`-9!` / `-8!`) sent as URL query params to avoid escaping issues.
- Remote JS invocation: q sends `(::;(`fn;args);(`callback;args))` — the `::` sentinel at index 0 signals a JS function call.
- `setEditor(viewer)` wires the viewer to `onMessage` — the `.cm` property is the **viewer**, not the editor.
- `serialize()` / `deserialize()` delegate to the `IPC` class from `ipc.mjs`.

## The `zws` Bootstrap

The `zws` hex string is a hex-encoded q function that becomes `.z.ws` on the server. To read/edit:
1. Decode in a q session: `-9!0x<hex>`
2. Edit the resulting q expression.
3. Re-encode: `-8!<expression>`
4. Replace the hex string in this file.

## When Modifying

### Changing the handshake
- The HTTP GET checks if `.z.ws` already matches. The check uses `(-8!.z.ws)~<zws hex>`.
- If adding new server-side setup, append it to the initialization sequence after WebSocket open.

### Adding new message types
- Inspect the k-type byte in `onMessage` to decide dispatch.
- Remote JS invocation is signaled by `::` at index 0 of a general list.
- All other results go through `this.cm.disp()`.
