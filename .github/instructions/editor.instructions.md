---
applyTo: "src/editor.mjs"
---
# Code Editor — src/editor.mjs

CodeMirror 6 editor with q syntax highlighting and execution keybindings.

## Conventions

- Exports `createEditor(container, onExecute)` — factory function, not a class.
- `onExecute(code)` callback is called when the user presses Ctrl+Enter or Shift+Enter.
- Keybindings are defined in `executeKeymap` array.
- Theme is `darkTheme`, defined inline.
- Shares `qLanguage` + `qHighlightStyle` from `lang-q.mjs`.
- Exposed as `window.editor` for remote JS invocation from q server.

## When Modifying

### Adding new keybindings
1. Add to the `executeKeymap` array following the existing `Ctrl-Enter` / `Shift-Enter` pattern.
2. Each entry is `{ key, run }` where `run` receives the EditorView.
3. Use `Prec.highest()` if the binding must override CodeMirror defaults.
