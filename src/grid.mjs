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
  let initPromise = null;  // serializes concurrent first-load calls

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
   * Convert q column-oriented table data into a Perspective-friendly format.
   * - Strips Symbol.for('meta') and Symbol.for('keys') metadata.
   * - Converts NaN (q numeric nulls) → null so Perspective accepts them.
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
          (typeof v === 'number' && isNaN(v)) ? null : v
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

  return {
    /**
     * Load or update the grid with a deserialized q table.
     * Accepts the column-oriented object produced by ipc.mjs, including
     * Symbol.for('meta') metadata for schema inference.
     * Creates a new Perspective table on first call, then updates in place.
     *
     * @param {object} data  Column-oriented q table object with Symbol.for('meta')
     */
    async update(data) {
      const meta = data[Symbol.for('meta')];
      const clean = prepareData(data);

      // Serialize concurrent init: only one table creation in flight at a time
      if (!table) {
        if (!initPromise) {
          initPromise = (async () => {
            const w = await getWorker();
            const schema = meta ? inferSchema(meta) : clean;
            table = await w.table(schema);
            await viewer.load(table);
          })();
        }
        await initPromise;
      }

      await table.update(clean);
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
