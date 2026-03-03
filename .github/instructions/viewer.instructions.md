---
applyTo: "src/viewer.mjs"
---
# REPL Viewer — src/viewer.mjs

Readonly CodeMirror 6 instance that displays q input/output with gutter markers.

## Conventions

- Uses `StateField` + `StateEffect` (`addPrompt` / `clearPrompts`) with `RangeSet` for per-line gutter markers — follow this pattern for any new marker types.
- `PromptMarker` subclass of `GutterMarker` renders `q)` (input) and `=>` (output) markers.
- Auto-trims to last 16 `q)` calls and 64 `=>` results via `trimToFit()`.
- Theme is `viewerTheme`, defined inline — dark theme consistent with the editor.
- Shares `qLanguage` + `qHighlightStyle` from `lang-q.mjs`.

## When Modifying

### Adding a new display format
1. Extend `viewer.disp()` to handle the new prompt type.
2. Add a new `GutterMarker` subclass following the `PromptMarker` pattern.
3. Register the new marker in the gutter's `StateField` if needed.

### Adding visual panel tabs (future)
- The right pane (`div.two`) will host tabs: REPL, Chart, Grid.
- Viewer remains the REPL tab; new panels mount alongside in the same container.
- Tab switching should preserve viewer scroll position and state.
