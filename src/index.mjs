import QWebSocket from './qws.mjs';
import { createEditor } from './editor.mjs';
import { createViewer } from './viewer.mjs';
import { createGrid } from './grid.mjs';

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

// Define ui.update_wdr handler for q server grid data push
// q sends (::;(`ui.update_wdr;data)) which invokes window.eval("ui.update_wdr")(data)
// window.ui = window.ui || {};
// window.ui.update_wdr = function(data) {
//  if (window.grid) {
//    window.grid.update(data);
//  }
//};