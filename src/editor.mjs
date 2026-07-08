/**
 * Q Code Editor — CodeMirror 6 wrapper
 *
 * Creates a CodeMirror editor instance with q language support, dark theme,
 * line numbers, and Ctrl+Enter / Shift+Enter keybindings to send code to
 * the q server via QWebSocket.
 */
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { qLanguage, qHighlightStyle } from './lang-q.mjs';

/**
 * Dark editor theme matching the q highlight style
 */
const darkTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: '#282c34',
    color: '#abb2bf',
  },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Monaco", monospace',
    caretColor: '#528bff',
  },
  '.cm-cursor': {
    borderLeftColor: '#528bff',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#3e4451 !important',
  },
  '.cm-activeLine': {
    backgroundColor: '#2c313a',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2c313a',
  },
  '.cm-gutters': {
    backgroundColor: '#21252b',
    color: '#495162',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: '#515a6b',
    outline: 'none',
  },
}, { dark: true });

/**
 * Create and mount the Q code editor
 *
 * @param {HTMLElement} parent  DOM element to mount into
 * @param {function(string):void} onExecute  Called with the code string when user presses Ctrl+Enter
 * @param {function():void} [onChange]  Called whenever the document content changes
 * @returns {{ view: EditorView, getValue: () => string, setValue: (s: string) => void }}
 */
export function createEditor(parent, onExecute, onChange) {
  const executeKeymap = keymap.of([
    {
      // Ctrl+Enter / Cmd+Enter: send current line or selection
      key: 'Ctrl-Enter',
      mac: 'Cmd-Enter',
      run(view) {
        const state = view.state;
        const sel = state.selection.main;
        let code;
        if (sel.empty) {
          // no selection → send entire current line
          const line = state.doc.lineAt(sel.head);
          code = line.text;
        } else {
          code = state.sliceDoc(sel.from, sel.to);
        }
        if (code.trim() && onExecute) onExecute(code);
        return true;
      },
    },
    {
      // Shift+Enter: send entire editor content
      key: 'Shift-Enter',
      run(view) {
        const code = view.state.doc.toString();
        if (code.trim() && onExecute) onExecute(code);
        return true;
      },
    },
  ]);

  const state = EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      executeKeymap,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
      ]),
      qLanguage,
      qHighlightStyle,
      darkTheme,
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && onChange) onChange();
      }),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
  };
}
