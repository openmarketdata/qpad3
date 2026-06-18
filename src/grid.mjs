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

/**
 * Create and mount a Perspective grid viewer
 *
 * @param {HTMLElement} container  DOM element to mount into
 * @returns {{ update: (data: object) => void, clear: () => void, getTable: () => object, getViewer: () => HTMLElement }}
 */
export function createGrid(container) {
  const viewer = document.createElement('perspective-viewer');
  container.appendChild(viewer);

  let worker = null;
  let table = null;
  let queue = Promise.resolve();  // serializes concurrent update() calls

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

  /**
   * Convert q column-oriented table data into a Perspective-friendly format.
   * - Strips Symbol.for('meta') and Symbol.for('keys') metadata.
   * - Converts NaN (q numeric nulls) → null so Perspective accepts them.
   * - Flattens nested list cells to strings (Perspective has no list type).
   * - Leaves Date objects and strings untouched.
   *
   * @param {object} data  Column-oriented object from ipc.mjs
   * @returns {object}     Plain column-oriented object safe for Perspective
   */
  function prepareData(data) {
    const clean = {};
    for (const key of Object.keys(data)) {
      const col = data[key];
      if (Array.isArray(col)) {
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
      'p': 'datetime',    // timestamp
      'm': 'date',        // month
      'd': 'date',        // date
      'z': 'datetime',    // datetime
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
   * @param {object} current   Current Perspective schema { col: type }
   * @param {object} desired   Desired Perspective schema { col: type }
   * @param {boolean} hasMeta  Whether q meta (and thus types) is available
   */
  function schemaChanged(current, desired, hasMeta) {
    const curKeys = Object.keys(current);
    const newKeys = Object.keys(desired);
    if (curKeys.length !== newKeys.length) return true;
    return newKeys.some((k, i) =>
      k !== curKeys[i] || (hasMeta && current[k] !== desired[k])
    );
  }

  /**
   * Core update logic, always run serialized via the queue.
   *
   * @param {object} data  Column-oriented q table object with Symbol.for('meta')
   */
  async function applyUpdate(data) {
    const meta = data[Symbol.for('meta')];
    const clean = prepareData(data);
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
    }

    await table.update(clean);
  }

  return {
    /**
     * Load or update the grid with a deserialized q table.
     * Accepts the column-oriented object produced by ipc.mjs, including
     * Symbol.for('meta') metadata for schema inference.
     * Creates a new Perspective table on first call, then updates in place.
     *
     * @param {object} data  Column-oriented q table object with Symbol.for('meta')
     */
    update(data) {
      // Serialize updates so concurrent calls can't race on (re)creating
      // the table.
      queue = queue.then(() => applyUpdate(data));
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
