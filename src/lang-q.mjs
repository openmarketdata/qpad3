/**
 * CodeMirror 6 language support for kdb+/q
 *
 * Ported from the official CodeMirror 5 q mode:
 *   https://codemirror.net/5/mode/q/q.js
 * Original copyright (c) by Marijn Haverbeke and others, MIT license.
 *
 * Adapted for CodeMirror 6 StreamLanguage.
 */
import { StreamLanguage, indentUnit } from '@codemirror/language';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/* ── helpers ─────────────────────────────────────────────────────── */

const keywords = buildRE([
  "abs","acos","aj","aj0","all","and","any","asc","asin","asof",
  "atan","attr","avg","avgs","bin","by","ceiling","cols","cor","cos",
  "count","cov","cross","csv","cut","delete","deltas","desc","dev",
  "differ","distinct","div","do","each","ej","enlist","eval","except",
  "exec","exit","exp","fby","fills","first","fkeys","flip","floor",
  "from","get","getenv","group","gtime","hclose","hcount","hdel",
  "hopen","hsym","iasc","idesc","if","ij","in","insert","inter","inv",
  "key","keys","last","like","list","lj","load","log","lower","lsq",
  "ltime","ltrim","mavg","max","maxs","mcount","md5","mdev","med",
  "meta","min","mins","mmax","mmin","mmu","mod","msum","neg","next",
  "not","null","or","over","parse","peach","pj","plist","prd","prds",
  "prev","prior","rand","rank","ratios","raze","read0","read1",
  "reciprocal","reverse","rload","rotate","rsave","rtrim","save",
  "scan","select","set","setenv","show","signum","sin","sqrt","ss",
  "ssr","string","sublist","sum","sums","sv","system","tables","tan",
  "til","trim","txf","type","uj","ungroup","union","update","upper",
  "upsert","value","var","view","views","vs","wavg","where","while",
  "within","wj","wj1","wsum","xasc","xbar","xcol","xcols","xdesc",
  "xexp","xgroup","xkey","xlog","xprev","xrank"
]);

const E = /[|/&^!+:\\\-*%$=~#;@><,?_'"\[\(\]\)\s{}]/;

function buildRE(w) {
  return new RegExp("^(" + w.join("|") + ")$");
}

/* ── tokenizers ──────────────────────────────────────────────────── */

function tokenBase(stream, state) {
  var sol = stream.sol(), c = stream.next();
  state.curPunc = null;

  if (sol) {
    if (c === "/") {
      return (state.tokenize = tokenLineComment)(stream, state);
    } else if (c === "\\") {
      if (stream.eol() || /\s/.test(stream.peek())) {
        stream.skipToEnd();
        if (/^\\\s*$/.test(stream.current())) {
          state.tokenize = tokenCommentToEOF;
        } else {
          state.tokenize = tokenBase;
        }
        return "comment";
      } else {
        state.tokenize = tokenBase;
        return "builtin";
      }
    }
  }

  if (/\s/.test(c)) {
    if (stream.peek() === "/") {
      stream.skipToEnd();
      return "comment";
    }
    return null; // whitespace
  }

  if (c === '"') {
    return (state.tokenize = tokenString)(stream, state);
  }

  if (c === '`') {
    stream.eatWhile(/[A-Za-z\d_:/.]/);
    return "atom";
  }

  if (("." === c && /\d/.test(stream.peek())) || /\d/.test(c)) {
    var t = null;
    stream.backUp(1);
    if (stream.match(/^\d{4}\.\d{2}(m|\.\d{2}([DT](\d{2}(:\d{2}(:\d{2}(\.\d{1,9})?)?)?)?)?)/)
        || stream.match(/^\d+D(\d{2}(:\d{2}(:\d{2}(\.\d{1,9})?)?)?)/)
        || stream.match(/^\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?/)
        || stream.match(/^\d+[ptuv]{1}/)) {
      t = "number"; // temporal
    } else if (stream.match(/^0[NwW][hijefgpmdznuvt]?/)
        || stream.match(/^0x[\da-fA-F]*/)
        || stream.match(/^[01]+[b]{1}/)
        || stream.match(/^\d+[chijn]{1}/)
        || stream.match(/-?\d*(\.\d*)?(e[+\-]?\d+)?(e|f)?/)) {
      t = "number";
    }
    if (t && (!(c = stream.peek()) || E.test(c))) return t;
    stream.next();
    return "error";
  }

  if (/[A-Za-z]|\./.test(c)) {
    stream.eatWhile(/[A-Za-z._\d]/);
    return keywords.test(stream.current()) ? "keyword" : "variableName";
  }

  if (/[|/&^!+:\\\-*%$=~#;@><.,?_']/.test(c)) return null;

  if (/[{}\(\[\]\)]/.test(c)) {
    state.curPunc = c;
    return null;
  }

  return "error";
}

function tokenLineComment(stream, state) {
  stream.skipToEnd();
  if (/\/\s*$/.test(stream.current())) {
    state.tokenize = tokenBlockComment;
  } else {
    state.tokenize = tokenBase;
  }
  return "comment";
}

function tokenBlockComment(stream, state) {
  var f = stream.sol() && stream.peek() === "\\";
  stream.skipToEnd();
  if (f && /^\\\s*$/.test(stream.current())) {
    state.tokenize = tokenBase;
  }
  return "comment";
}

function tokenCommentToEOF(stream) {
  stream.skipToEnd();
  return "comment";
}

function tokenString(stream, state) {
  var escaped = false, next, end = false;
  while ((next = stream.next())) {
    if (next === '"' && !escaped) { end = true; break; }
    escaped = !escaped && next === "\\";
  }
  if (end) state.tokenize = tokenBase;
  return "string";
}

/* ── context stack for indentation ───────────────────────────────── */

function pushContext(state, type, col) {
  state.context = { prev: state.context, indent: state.indent, col: col, type: type };
}

function popContext(state) {
  state.indent = state.context.indent;
  state.context = state.context.prev;
}

/* ── mode definition (StreamLanguage-compatible) ─────────────────── */

const qStreamParser = {
  name: "q",

  startState() {
    return {
      tokenize: tokenBase,
      context: null,
      indent: 0,
      col: 0,
      curPunc: null,
    };
  },

  token(stream, state) {
    if (stream.sol()) {
      if (state.context && state.context.align == null) {
        state.context.align = false;
      }
      state.indent = stream.indentation();
    }
    if (stream.eatSpace()) return null;

    var style = state.tokenize(stream, state);

    if (style !== "comment" && state.context && state.context.align == null && state.context.type !== "pattern") {
      state.context.align = true;
    }

    var curPunc = state.curPunc;
    if (curPunc === "(") pushContext(state, ")", stream.column());
    else if (curPunc === "[") pushContext(state, "]", stream.column());
    else if (curPunc === "{") pushContext(state, "}", stream.column());
    else if (/[\]\}\)]/.test(curPunc)) {
      while (state.context && state.context.type === "pattern") popContext(state);
      if (state.context && curPunc === state.context.type) popContext(state);
    } else if (curPunc === "." && state.context && state.context.type === "pattern") {
      popContext(state);
    } else if (/atom|string|variableName/.test(style) && state.context) {
      if (/[\}\]]/.test(state.context.type)) {
        pushContext(state, "pattern", stream.column());
      } else if (state.context.type === "pattern" && !state.context.align) {
        state.context.align = true;
        state.context.col = stream.column();
      }
    }

    return style;
  },

  indent(state, textAfter, cx) {
    var firstChar = textAfter && textAfter.charAt(0);
    var context = state.context;
    if (/[\]\}]/.test(firstChar)) {
      while (context && context.type === "pattern") context = context.prev;
    }
    var closing = context && firstChar === context.type;
    if (!context) return 0;
    else if (context.type === "pattern") return context.col;
    else if (context.align) return context.col + (closing ? 0 : 1);
    else return context.indent + (closing ? 0 : (cx ? cx.unit : 2));
  },
};

export const qLanguage = StreamLanguage.define(qStreamParser);

/**
 * Dark theme highlighting style for q
 */
export const qHighlightStyle = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.atom, color: '#e5c07b' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#e06c75' },
  { tag: tags.meta, color: '#be5046' },
  { tag: tags.invalid, color: '#ffffff', backgroundColor: '#e05252' },
]));
