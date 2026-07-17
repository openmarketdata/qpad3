import QWebSocket from './qws.mjs';
import { createEditor } from './editor.mjs';
import { createViewer } from './viewer.mjs';
import { createGrid } from './grid.mjs';
import { createFileExplorer } from './fileexplorer.mjs';

console.log("Connecting to Q");
const qconn = new QWebSocket();
window.qconn = qconn;
qconn.connect();

// Mount the Q code editor in the left pane
const editorContainer = document.getElementById('editor-container');
const editor = createEditor(editorContainer, (code) => {
  console.log('Executing:', code);
  viewer.appendInput(code);
  qconn.send(qconn.serialize(code));
}, () => {
  if (!loadingFile) markDirty();
});
window.editor = editor;

// Mount the readonly Q viewer/REPL output in the right pane
const viewerContainer = document.getElementById('viewer-container');
const viewer = createViewer(viewerContainer);
window.viewer = viewer; // expose as global 'viewer' for q server eval calls (viewer.disp, etc.)
qconn.setViewer(viewer);

// Mount the Perspective grid in the right pane (Grid tab)
const gridContainer = document.getElementById('grid-container');
const grid = createGrid(gridContainer);
qconn.setGrid(grid); // expose as global 'grid' for q server eval calls (grid.update, etc.)

// Tab switching logic
const tabBar = document.querySelector('.tab-bar');
const tabs = tabBar.querySelectorAll('.tab');

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('tab-active', t.dataset.tab === tabName));
  viewerContainer.style.display = tabName === 'repl' ? 'flex' : 'none';
  gridContainer.style.display = tabName === 'grid' ? 'flex' : 'none';
}

tabBar.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) switchTab(tab.dataset.tab);
});

// Drive the active tab from the server's response, not the typed command:
//  - a grid frame (grid.update) shows the Grid tab
//  - a REPL result (viewer.disp '=>') shows the REPL tab
// A `.ws.grid` call emits a grid frame followed by a trailing `=> ::` echo; that
// echo must not pull focus back to the REPL. But a genuine command that just
// returns `::` (with no grid frame) should still switch to the REPL. So only the
// `::` echo immediately following a grid frame is suppressed.
let gridFrameForThisResult = false;

const origUpdate = grid.update.bind(grid);
grid.update = async function(data) {
  gridFrameForThisResult = true;
  await origUpdate(data);
  switchTab('grid');
};

const origAppend = grid.append.bind(grid);
grid.append = async function(data) {
  gridFrameForThisResult = true;
  await origAppend(data);
  switchTab('grid');
};

const origDisp = viewer.disp.bind(viewer);
viewer.disp = function(prompt, value) {
  origDisp(prompt, value);
  if (prompt !== '=>') return;
  const isNull = value === '::' || value === '::\n';
  if (!(isNull && gridFrameForThisResult)) switchTab('repl');
  gridFrameForThisResult = false;
};

// Expose switchTab for programmatic use
window.switchTab = switchTab;

// ---------------------------------------------------------------------------
// Control-menu sidebar + server-side file explorer
// ---------------------------------------------------------------------------

// Editor <-> open-file state
let currentFile = null;   // path relative to opt, or null for an unsaved buffer
let dirty = false;
let loadingFile = false;  // suppresses the dirty flag while loading a file

const etFile = document.getElementById('et-file');
const etSave = document.getElementById('et-save');
const etNew = document.getElementById('et-new');

function renderFileLabel() {
  etFile.innerHTML = '';
  etFile.appendChild(document.createTextNode(currentFile || 'untitled'));
  if (dirty) {
    const dot = document.createElement('span');
    dot.className = 'dirty';
    dot.textContent = ' \u25CF';
    etFile.appendChild(dot);
  }
  etSave.disabled = !(dirty || currentFile);
}

function markDirty() {
  dirty = true;
  renderFileLabel();
}

function setCurrentFile(rel) {
  currentFile = rel;
  dirty = false;
  renderFileLabel();
}

const fxPanel = document.getElementById('fx-panel');
const fx = createFileExplorer({
  panel: fxPanel,
  listEl: document.getElementById('fx-list'),
  pathEl: document.getElementById('fx-path'),
  refreshEl: document.getElementById('fx-refresh'),
  send: (qcode) => qconn.fsCmd(qcode),
  onOpenFile: (rel, content) => {
    loadingFile = true;
    editor.setValue(content);
    loadingFile = false;
    setCurrentFile(rel);
  },
});

// Route fs.* frames to the explorer; set the grid-frame flag first so the
// trailing `=> ::` echo from each `.ws.*` call doesn't switch the REPL/GRID tab.
qconn.setFs({
  list:  (...a) => { gridFrameForThisResult = true; return fx.list(...a); },
  open:  (...a) => { gridFrameForThisResult = true; return fx.open(...a); },
  saved: (...a) => { gridFrameForThisResult = true; return fx.saved(...a); },
  error: (...a) => { gridFrameForThisResult = true; return fx.error(...a); },
});

// Sidebar button toggles the file-explorer panel.
const btnFiles = document.getElementById('btn-files');
btnFiles.addEventListener('click', () => {
  const open = fxPanel.classList.toggle('open');
  btnFiles.classList.toggle('active', open);
  if (open) fx.activate();
});

// Editor toolbar: New / Save
etNew.addEventListener('click', () => {
  loadingFile = true;
  editor.setValue('');
  loadingFile = false;
  setCurrentFile(null);
});

etSave.addEventListener('click', () => {
  let rel = currentFile;
  if (!rel) {
    const name = prompt('Save as (in /opt/' + (fx.getCwd() || '') + '):');
    if (!name) return;
    rel = (fx.getCwd() ? fx.getCwd().replace(/\/+$/, '') + '/' : '') + name;
    setCurrentFile(rel);
  }
  fx.save(rel, editor.getValue());
  dirty = false;
  renderFileLabel();
});

renderFileLabel();

// Editor toolbar overflow (⋮) menu
const etMore = document.getElementById('et-more');
const etMenu = document.getElementById('et-menu-dropdown');
const etFixWidth = document.getElementById('et-fixwidth');

etMore.addEventListener('click', (e) => {
  e.stopPropagation();
  etMenu.classList.toggle('open');
});
// close the menu on any outside click
document.addEventListener('click', () => etMenu.classList.remove('open'));

etFixWidth.addEventListener('click', () => {
  const on = editorContainer.classList.toggle('fixed-81');
  if (on) {
    // Exact width for 81 columns from the font metrics, plus CodeMirror's
    // 8px .cm-line padding (6 left + 2 right) and a 1px epsilon, so column
    // 81 fits and column 82 wraps.
    const cw = editor.view.defaultCharacterWidth || 7.8;
    const px = Math.ceil(81 * cw) + 9;
    editorContainer.style.setProperty('--cm81', px + 'px');
  }
  etFixWidth.classList.toggle('checked', on);
  etMenu.classList.remove('open');
});

// Define ui.update_wdr handler for q server grid data push
// q sends (::;(`ui.update_wdr;data)) which invokes window.eval("ui.update_wdr")(data)
// window.ui = window.ui || {};
// window.ui.update_wdr = function(data) {
//  if (window.grid) {
//    window.grid.update(data);
//  }
//};