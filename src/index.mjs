import QWebSocket from './qws.mjs';
import { createEditor } from './editor.mjs';
import { createViewer } from './viewer.mjs';

console.log("Connecting to Q");
const qconn = new QWebSocket();
window.qconn = qconn;
qconn.connect();

// Mount the readonly Q viewer/REPL output in the right pane
const viewerContainer = document.getElementById('viewer-container');
const viewer = createViewer(viewerContainer);
window.cm = viewer; // expose as global 'cm' for q server eval calls (cm.disp, etc.)

// Mount the Q code editor in the left pane
const editorContainer = document.getElementById('editor-container');
const editor = createEditor(editorContainer, (code) => {
  console.log('Executing:', code);
  viewer.appendInput(code);
  qconn.send(qconn.serialize(code));
});
window.editor = editor;
qconn.setEditor(viewer);