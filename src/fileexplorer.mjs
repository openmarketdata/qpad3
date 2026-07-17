/**
 * Server-side file explorer (right of the control-menu sidebar).
 *
 * Browses files under the q server's `<wwwroot>/opt` directory. All access is
 * mediated by the server-side `.ws.ls` / `.ws.get` / `.ws.put` functions which
 * are locked to that folder (path-traversal is rejected server-side), so this
 * module only ever deals in paths relative to `opt`.
 *
 * The module sends q commands via `qconn.fsCmd(...)`; responses arrive as
 * `fs.list` / `fs.open` / `fs.saved` / `fs.error` frames that index.mjs routes
 * back into the `list` / `open` / `saved` / `error` handlers returned here.
 */

/** Quote a JS string as a q string literal (escaping the q-significant chars). */
export function qstr(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') + '"';
}

/** Join a relative dir and a name into a normalized relative path. */
function joinRel(dir, name) {
  if (!dir) return name;
  return dir.replace(/\/+$/, '') + '/' + name;
}

/** Parent of a relative path, or '' when already at the opt root. */
function parentRel(rel) {
  if (!rel) return '';
  const i = rel.replace(/\/+$/, '').lastIndexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panel      the .fx-panel element
 * @param {HTMLElement} opts.listEl     the .fx-list element
 * @param {HTMLElement} opts.pathEl     the .fx-path element
 * @param {HTMLElement} opts.refreshEl  the refresh control
 * @param {(qcode: string) => void} opts.send  sends a q command to the server
 * @param {(rel: string, content: string) => void} opts.onOpenFile called when a file's content arrives
 */
export function createFileExplorer(opts) {
  const { panel, listEl, pathEl, refreshEl, send, onOpenFile } = opts;
  let cwd = '';  // current directory, relative to opt

  function ls(rel) {
    send('.ws.ls ' + qstr(rel));
  }

  function refresh() {
    ls(cwd);
  }

  function openFile(rel) {
    send('.ws.get ' + qstr(rel));
  }

  function save(rel, content) {
    send('.ws.put[' + qstr(rel) + ';' + qstr(content) + ']');
  }

  function renderError(msg) {
    listEl.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'fx-item';
    el.style.color = '#e06c75';
    el.textContent = '! ' + msg;
    listEl.appendChild(el);
  }

  // Render a directory listing pushed by the server (`fs.list` frame).
  function renderList(rel, names, isdir, sizes) {
    cwd = rel || '';
    pathEl.textContent = '/' + cwd;
    listEl.innerHTML = '';

    // ".." entry to go up, unless already at the opt root.
    if (cwd) {
      const up = document.createElement('div');
      up.className = 'fx-item dir';
      up.innerHTML = '<span class="fx-icon">&#128193;</span><span>..</span>';
      up.addEventListener('click', () => ls(parentRel(cwd)));
      listEl.appendChild(up);
    }

    const n = names ? names.length : 0;
    // directories first, then files; each alphabetical
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ name: names[i], dir: !!isdir[i], size: sizes[i] });
    rows.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));

    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'fx-item' + (row.dir ? ' dir' : '');
      const icon = row.dir ? '&#128193;' : '&#128196;';
      item.innerHTML = '<span class="fx-icon">' + icon + '</span>' +
        '<span class="fx-name"></span>' +
        (row.dir ? '' : '<span class="fx-size">' + row.size + '</span>');
      item.querySelector('.fx-name').textContent = row.name;
      const rel2 = joinRel(cwd, row.name);
      item.addEventListener('click', () => (row.dir ? ls(rel2) : openFile(rel2)));
      listEl.appendChild(item);
    }
  }

  if (refreshEl) refreshEl.addEventListener('click', refresh);

  return {
    /** Toggle/refresh: called when the panel becomes visible. */
    activate() { refresh(); },
    save,
    // frame handlers (wired to qconn in index.mjs)
    list: renderList,
    open: (rel, content) => onOpenFile(rel, content),
    saved: (rel) => { if (panel.classList.contains('open')) refresh(); },
    error: renderError,
    getCwd: () => cwd,
  };
}
