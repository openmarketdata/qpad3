import QWebSocket from './qws.mjs';
import { createEditor } from './editor.mjs';
import { createViewer } from './viewer.mjs';
import { createGrid } from './grid.mjs';

console.log("Connecting to Q");
const qconn = new QWebSocket();
window.qconn = qconn;
qconn.connect();

// Mount the readonly Q viewer/REPL output in the right pane
const viewerContainer = document.getElementById('viewer-container');
const viewer = createViewer(viewerContainer);
window.cm = viewer; // expose as global 'cm' for q server eval calls (cm.disp, etc.)

// Mount the Perspective grid in the right pane (Grid tab)
const gridContainer = document.getElementById('grid-container');
const grid = createGrid(gridContainer);
window.psp = grid; // expose as global 'psp' for q server eval calls (psp.update, etc.)

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

// Auto-switch to grid tab when data is pushed — wrap psp.update
const origUpdate = grid.update.bind(grid);
grid.update = async function(data) {
  await origUpdate(data);
  switchTab('grid');
};

// Mount the Q code editor in the left pane
const editorContainer = document.getElementById('editor-container');
const editor = createEditor(editorContainer, (code) => {
  console.log('Executing:', code);
  viewer.appendInput(code);
  qconn.send(qconn.serialize(code));
});
window.editor = editor;
qconn.setEditor(viewer);

// Expose switchTab for programmatic use
window.switchTab = switchTab;

// Define ui.update_wdr handler for q server grid data push
// q sends (::;(`ui.update_wdr;data)) which invokes window.eval("ui.update_wdr")(data)
window.ui = window.ui || {};
window.ui.update_wdr = function(data) {
  if (window.psp) {
    window.psp.update(data);
  }
};