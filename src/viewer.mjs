/**
 * Q Viewer — Readonly CodeMirror 6 REPL output pane
 *
 * Shows executed q expressions prefixed with "q)" in the gutter
 * and server responses prefixed with "=>" in the gutter.
 */
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSet } from '@codemirror/state';
import { qLanguage, qHighlightStyle } from './lang-q.mjs';

/* ── gutter markers ──────────────────────────────────────────────── */

class PromptMarker extends GutterMarker {
  constructor(label) {
    super();
    this.label = label;
  }
  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.label;
    span.style.fontFamily = '"JetBrains Mono", "Fira Code", "Consolas", "Monaco", monospace';
    span.style.fontSize = '13px';
    return span;
  }
}

const qPrompt = new PromptMarker('q)');
const resultPrompt = new PromptMarker('=>');

/* ── state effect & field to track prompt type per line ───────────── */

const addPrompt = StateEffect.define();
const clearPrompts = StateEffect.define();

const promptField = StateField.define({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    for (const e of tr.effects) {
      if (e.is(clearPrompts)) return RangeSet.empty;
    }
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addPrompt)) {
        set = set.update({ add: [e.value.marker.range(e.value.pos)] });
      }
    }
    return set;
  },
});

const promptGutter = gutter({
  class: 'cm-prompt-gutter',
  markers(view) {
    return view.state.field(promptField);
  },
  initialSpacer() {
    return qPrompt;
  },
});

/* ── dark theme for viewer ───────────────────────────────────────── */

const viewerTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: '#1e2127',
    color: '#abb2bf',
  },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Monaco", monospace',
    caretColor: 'transparent',
  },
  '.cm-cursor': {
    display: 'none',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#3e4451 !important',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-gutters': {
    backgroundColor: '#1e2127',
    color: '#e5c07b',
    border: 'none',
    minWidth: '28px',
  },
  '.cm-prompt-gutter .cm-gutterElement': {
    padding: '0 6px 0 4px',
    display: 'flex',
    alignItems: 'center',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
}, { dark: true });

/* ── public API ──────────────────────────────────────────────────── */

/**
 * Create and mount the readonly Q viewer/REPL output
 *
 * @param {HTMLElement} parent  DOM element to mount into
 * @returns {{ view: EditorView, appendInput: (code: string) => void, appendOutput: (text: string) => void, disp: (prompt: string, value: any) => void, setOpacity: (n: number) => void }}
 */
export function createViewer(parent) {
  const state = EditorState.create({
    doc: '',
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      promptField,
      promptGutter,
      qLanguage,
      qHighlightStyle,
      viewerTheme,
      EditorView.lineWrapping,
    ],
  });

  const view = new EditorView({ state, parent });

  const MAX_CALLS = 16;
  const MAX_RESULTS = 64;

  /**
   * Trim oldest content to keep only the last MAX_CALLS q) prompts
   * and no more than MAX_RESULTS => prompts (to auto-trim pub events).
   */
  function trimToFit() {
    const markers = view.state.field(promptField);

    // Collect positions of all q) and => prompt markers
    const qPositions = [];
    const resultPositions = [];
    const iter = markers.iter();
    while (iter.value) {
      if (iter.value === qPrompt) {
        qPositions.push(iter.from);
      } else if (iter.value === resultPrompt) {
        resultPositions.push(iter.from);
      }
      iter.next();
    }

    // Determine the earliest position to keep
    let cutoffPos = -1;

    // Enforce MAX_CALLS q) prompts
    if (qPositions.length > MAX_CALLS) {
      cutoffPos = qPositions[qPositions.length - MAX_CALLS];
    }

    // Enforce MAX_RESULTS => prompts
    if (resultPositions.length > MAX_RESULTS) {
      const resultCutoff = resultPositions[resultPositions.length - MAX_RESULTS];
      // Take the more aggressive (later) cutoff
      if (cutoffPos < 0 || resultCutoff > cutoffPos) {
        cutoffPos = resultCutoff;
      }
    }

    if (cutoffPos <= 0) return;

    const doc = view.state.doc;
    const cutoffLine = doc.lineAt(cutoffPos);

    if (cutoffLine.from <= 0) return;

    view.dispatch({
      changes: { from: 0, to: cutoffLine.from },
    });
  }

  /**
   * Append text lines and tag with a gutter marker.
   * @param {string} text       The text to append (may be multiline)
   * @param {GutterMarker} marker  qPrompt or resultPrompt
   * @param {boolean} firstOnly  If true, only the first line gets the marker
   */
  function appendLines(text, marker, firstOnly = false) {
    const doc = view.state.doc;
    const insert = (doc.length > 0 ? '\n' : '') + text;
    const fromPos = doc.length + (doc.length > 0 ? 1 : 0); // start of first new line

    const lines = text.split('\n');
    const effects = [];
    let pos = fromPos;
    for (let i = 0; i < lines.length; i++) {
      if (!firstOnly || i === 0) {
        effects.push(addPrompt.of({ pos, marker }));
      }
      pos += lines[i].length + 1; // +1 for newline
    }

    view.dispatch({
      changes: { from: doc.length, insert },
      effects,
    });

    // Auto-trim to keep only last MAX_CALLS q) prompts
    trimToFit();

    // Scroll to bottom
    view.dispatch({
      selection: { anchor: view.state.doc.length },
      scrollIntoView: true,
    });
  }

  return {
    view,

    /**
     * Append executed q code (shown with "q)" gutter)
     * @param {string} code
     */
    appendInput(code) {
      appendLines(code, qPrompt);
    },

    /**
     * Append q server result (shown with "=>" gutter on first line only)
     * @param {string} text
     */
    appendOutput(text) {
      appendLines(text, resultPrompt, true);
    },

    /**
     * Display a result — compatible with q server's cm.disp calls
     * @param {string} prompt  e.g. '=>'
     * @param {any} value
     */
    disp(prompt, value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      if (prompt === '=>') {
        appendLines(text, resultPrompt, true);
      } else {
        appendLines(text, qPrompt);
      }
    },

    /**
     * Set the opacity of the viewer (visual feedback for execution state)
     * @param {number} opacity  0–1
     */
    setOpacity(opacity) {
      view.dom.style.opacity = opacity;
    },

    /**
     * Clear all content and prompt markers from the viewer
     */
    clear() {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length },
        effects: [clearPrompts.of(null)],
      });
    },
  };
}
