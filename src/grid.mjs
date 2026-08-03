/**
 * Grid — Perspective data grid panel
 *
 * Renders q table data in a high-performance WebAssembly-powered grid
 * using @finos/perspective. Exposed as `window.psp` so the q server
 * can call `psp.update()`, `psp.clear()` via `window.eval`.
 */
import perspective from '@finos/perspective';
import '@finos/perspective-viewer';
import '@finos/perspective-viewer-datagrid';
import '@finos/perspective-viewer-d3fc';
// Perspective ships its toolbar icons and button styling as CSS custom
// properties (base64 data-URIs) defined by a theme stylesheet. Without a theme
// loaded the icon/button slots render as bare red placeholder blocks, so the
// dark theme is bundled and applied to match the rest of the app.
import '@finos/perspective-viewer/dist/css/pro-dark.css';

/**
 * Create and mount a Perspective grid viewer
 *
 * @param {HTMLElement} container  DOM element to mount into
 * @returns {{ update: (data: object) => void, clear: () => void, getTable: () => object, getViewer: () => HTMLElement }}
 */
export function createGrid(container) {
  const viewer = document.createElement('perspective-viewer');
  viewer.setAttribute('theme', 'Pro Dark');
  container.appendChild(viewer);

  let worker = null;
  let table = null;
  let queue = Promise.resolve();  // serializes concurrent update() calls

  // Perspective fills a plugin's named column slots (e.g. the X/Y axes of the
  // "X/Y Line" chart) with whatever columns the table happens to expose when
  // the plugin is selected. Blank those slots on a plugin switch so a chart
  // starts with no axis selected and the user picks them explicitly. Plugins
  // without named slots (the datagrid) show every column, so switching back to
  // one has to re-activate all of them — Perspective carries the blanked
  // `columns` config across the switch, which would otherwise leave the grid
  // with no active columns at all.
  let lastPlugin = null;
  let configQueue = Promise.resolve();

  async function resetColumnsOnPluginSwitch() {
    const config = await viewer.save();
    const switched = lastPlugin !== null && config.plugin !== lastPlugin;
    lastPlugin = config.plugin;
    if (!switched) return;
    const plugin = await viewer.getPlugin(config.plugin);
    const named = plugin && plugin.config_column_names;
    if (named) {
      if (config.columns.some(c => c != null)) {
        await viewer.restore({ columns: config.columns.map(() => null) });
      }
    } else if (table && config.columns.some(c => c == null)) {
      await viewer.restore({ columns: await table.columns() });
    }
  }

  viewer.addEventListener('perspective-config-update', () => {
    configQueue = configQueue.then(resetColumnsOnPluginSwitch).catch(() => {});
  });

  // Record the plugin the viewer starts on, so the first switch is detected.
  configQueue = viewer.save().then(c => { lastPlugin = c.plugin; }).catch(() => {});

  /**
   * Lazily initialize the Perspective worker
   */
  async function getWorker() {
    if (!worker) {
      worker = await perspective.worker();
    }
    return worker;
  }

  /**
   * Render a nested q value (a list cell, e.g. a symbol or numeric vector)
   * as a space-separated string. Perspective has no nested/list column type,
   * so list cells must be flattened to text or the whole column is rejected.
   *
   * @param {Array} v  A list cell from a general (mixed) q column
   * @returns {string}
   */
  function stringifyCell(v) {
    return v
      .map(e => (Array.isArray(e) ? stringifyCell(e) : e == null ? '' : String(e)))
      .join(' ');
  }

  const pad = (n, w) => String(n).padStart(w, '0');

  /**
   * Format a q temporal value as its q text representation:
   *   date `d`      -> yyyy.mm.dd
   *   datetime `z`  -> yyyy.mm.ddTHH:MM:SS.fff
   *   timestamp `p` -> yyyy.mm.ddDHH:MM:SS.fffffffff
   *
   * Date/datetime arrive as UTC-based Date objects; timestamps arrive as the
   * nanosecond ISO string produced by ipc when includeNanosecond is set
   * (e.g. "2024-01-15T10:30:00.123456789").
   *
   * @param {Date|string|null} v  Decoded temporal cell
   * @param {string} t            q type char ('d' | 'z' | 'p')
   * @returns {string|null}
   */
  function qTemporal(v, t) {
    if (v == null || v === '') return null;
    if (t === 'p') {
      const i = v.indexOf('T');
      return v.slice(0, i).replace(/-/g, '.') + 'D' + v.slice(i + 1);
    }
    const ymd = `${v.getUTCFullYear()}.${pad(v.getUTCMonth() + 1, 2)}.${pad(v.getUTCDate(), 2)}`;
    if (t === 'd') return ymd;
    return `${ymd}T${pad(v.getUTCHours(), 2)}:${pad(v.getUTCMinutes(), 2)}:${pad(v.getUTCSeconds(), 2)}.${pad(v.getUTCMilliseconds(), 3)}`;
  }

  /**
   * Convert q column-oriented table data into a Perspective-friendly format.
   * - Strips Symbol.for('meta') and Symbol.for('keys') metadata.
   * - Converts NaN (q numeric nulls) → null so Perspective accepts them.
   * - Flattens nested list cells to strings (Perspective has no list type).
   * - Splits char-typed columns into one single-char string per row.
   * - Leaves Date objects untouched.
   *
   * A q char column (e.g. `c:"abc"`) is a char vector that ipc.mjs decodes to
   * a single JS string ("abc"), not a per-row array. Perspective expects each
   * column to be an array with one value per row, so a bare string is rejected
   * and the whole row batch silently disappears. Splitting "abc" → ['a','b','c']
   * gives the one-char-per-row column Perspective needs (count always matches,
   * since a char vector has exactly one char per row).
   *
   * @param {object} data  Column-oriented object from ipc.mjs
   * @returns {object}     Plain column-oriented object safe for Perspective
   */
  function prepareData(data, meta) {
    const types = {};
    if (meta) for (let i = 0; i < meta.c.length; i++) types[meta.c[i]] = meta.t[i];
    const clean = {};
    for (const key of Object.keys(data)) {
      const col = data[key];
      const t = types[key];
      if ((t === 'd' || t === 'z' || t === 'p') && Array.isArray(col)) {
        clean[key] = col.map(v => qTemporal(v, t));
      } else if (typeof col === 'string') {
        clean[key] = col.split('');
      } else if (Array.isArray(col)) {
        clean[key] = col.map(v =>
          Array.isArray(v) ? stringifyCell(v)
            : (typeof v === 'number' && isNaN(v)) ? null
            : v
        );
      } else {
        clean[key] = col;
      }
    }
    return clean;
  }

  /**
   * Infer Perspective schema from q meta information
   *
   * @param {object} meta  { c: string[], t: string[] } from Symbol.for('meta')
   * @returns {object}     Perspective schema { colName: type, ... }
   */
  function inferSchema(meta) {
    const schema = {};
    const typeMap = {
      'b': 'boolean',     // boolean
      'g': 'string',      // GUID
      'x': 'integer',     // byte
      'h': 'integer',     // short
      'i': 'integer',     // int
      'j': 'integer',     // long
      'e': 'float',       // real
      'f': 'float',       // float
      'c': 'string',      // char
      's': 'string',      // symbol
      'p': 'string',      // timestamp (rendered in q text form)
      'm': 'date',        // month
      'd': 'string',      // date (rendered in q text form)
      'z': 'string',      // datetime (rendered in q text form)
      'n': 'string',      // timespan
      'u': 'string',      // minute
      'v': 'string',      // second
      't': 'string',      // time
    };
    for (let i = 0; i < meta.c.length; i++) {
      schema[meta.c[i]] = typeMap[meta.t[i]] || 'string';
    }
    return schema;
  }

  /**
   * Returns true when the incoming schema differs from the table currently
   * loaded in the viewer (different column names, count, or types). q sends
   * meta on every table result, so type changes are detected too.
   *
   * The comparison is order-insensitive: Perspective's `table.schema()` does
   * not preserve the q column order, so comparing by position gives false
   * positives that would recreate the table on every append (dropping the
   * existing rows). Compare column names as a set and types by name instead.
   *
   * @param {object} current   Current Perspective schema { col: type }
   * @param {object} desired   Desired Perspective schema { col: type }
   * @param {boolean} hasMeta  Whether q meta (and thus types) is available
   */
  function schemaChanged(current, desired, hasMeta) {
    const curKeys = Object.keys(current);
    const newKeys = Object.keys(desired);
    if (curKeys.length !== newKeys.length) return true;
    return newKeys.some(k =>
      !(k in current) || (hasMeta && current[k] !== desired[k])
    );
  }

  /**
   * Core update logic, always run serialized via the queue.
   *
   * @param {object} data    Column-oriented q table object with Symbol.for('meta')
   * @param {boolean} append When false (default) the grid is reloaded: existing
   *   rows are replaced by the incoming data. When true the rows are appended to
   *   the current table.
   */
  async function applyUpdate(data, append) {
    const meta = data[Symbol.for('meta')];
    const clean = prepareData(data, meta);
    const desiredSchema = meta ? inferSchema(meta) : clean;

    // (Re)create the table on first call or whenever the schema changes, so a
    // new query with different columns replaces the grid instead of being
    // silently dropped by table.update().
    const recreate =
      !table || schemaChanged(await table.schema(), desiredSchema, !!meta);

    if (recreate) {
      const w = await getWorker();
      const next = await w.table(desiredSchema);
      await viewer.load(next);
      if (table) await table.delete();
      table = next;
    } else if (!append) {
      // Reload: drop the existing rows so the incoming data replaces them
      // rather than being appended to the previous result.
      await table.clear();
    }

    await table.update(clean);
  }

  return {
    /**
     * Load (reload) the grid with a deserialized q table, replacing any
     * existing rows. Accepts the column-oriented object produced by ipc.mjs,
     * including Symbol.for('meta') metadata for schema inference.
     *
     * @param {object} data  Column-oriented q table object with Symbol.for('meta')
     */
    update(data) {
      // Serialize updates so concurrent calls can't race on (re)creating
      // the table.
      queue = queue.then(() => applyUpdate(data, false));
      return queue;
    },

    /**
     * Append rows to the current grid without clearing existing data. The
     * server (`.ws.grida`) guarantees the schema matches before sending.
     *
     * @param {object} data  Column-oriented q table object with Symbol.for('meta')
     */
    append(data) {
      queue = queue.then(() => applyUpdate(data, true));
      return queue;
    },

    /**
     * Clear all data from the grid
     */
    async clear() {
      if (table) {
        await table.clear();
      }
    },

    /**
     * Get the underlying Perspective Table
     * @returns {object|null}
     */
    getTable() {
      return table;
    },

    /**
     * Get the Perspective Viewer element
     * @returns {HTMLElement}
     */
    getViewer() {
      return viewer;
    },
  };
}
