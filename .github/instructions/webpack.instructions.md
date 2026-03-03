---
applyTo: "webpack.config.mjs"
---
# Webpack Configuration — webpack.config.mjs

Webpack 5 build for an ESM browser app.

## Conventions

- Project uses **ESM throughout** (`"type": "module"`, `.mjs` extensions).
- Config file itself is ESM (`webpack.config.mjs`).
- Entry point: `src/index.mjs` → output: `dist/index.js`.
- `HtmlWebpackPlugin` injects the bundle into `src/index.html` → `dist/index.html`.

## Critical: Buffer Polyfill

`ipc.mjs` uses Node.js `Buffer` API. The browser polyfill is configured via:

```js
resolve: {
  fallback: { buffer: require.resolve('buffer/') }
}
```

Plus a `ProvidePlugin` to make `Buffer` globally available:

```js
new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })
```

**Do not remove these** — the IPC codec will break without them.

## When Modifying

- If adding new Node.js APIs (e.g., `stream`, `crypto`), add the corresponding polyfill to `resolve.fallback` and install the npm polyfill package.
- If adding new entry points or HTML pages, add them to `HtmlWebpackPlugin` instances.
