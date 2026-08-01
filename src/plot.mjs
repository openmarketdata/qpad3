/**
 * Plot — webgl-plot charting panel
 *
 * Renders charts on a GPU-accelerated WebGL canvas via the pure-JS `webgl-plot`
 * library (no WebAssembly, no runtime license). Exposes a global
 * `window.plot(chartType, data, config)` wrapper so charts can be driven from
 * the browser console (and, later, from the q server). No `.ws` wiring yet.
 *
 * webgl-plot draws in normalised clip space ([-1, 1] on both axes), so this
 * module computes the data bounds and drives the plot's global scale/offset to
 * map data coordinates into clip space. A thin HTML overlay adds a title, axis
 * labels and min/max value markers since webgl-plot itself renders no axes.
 */
import {
  WebglPlot,
  WebglLine,
  WebglSquare,
  ColorRGBA,
} from 'webgl-plot';

// A palette used to auto-colour series that don't specify a colour.
const PALETTE = [
  '#e5c07b', '#61afef', '#98c379', '#e06c75',
  '#c678dd', '#56b6c2', '#d19a66', '#abb2bf',
];

const BACKGROUND = [0x1e / 255, 0x21 / 255, 0x27 / 255, 1];
const MARGIN = 0.08;          // clip-space padding around the data
const MARKER_PX = 5;          // scatter marker size, in device pixels

/** Parse a `#rgb`/`#rrggbb` string into a webgl-plot ColorRGBA (0..1, a=1). */
function toColor(hex) {
  let h = (hex || '#61afef').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new ColorRGBA(r, g, b, 1);
}

/**
 * Normalize the many accepted `data` shapes into a list of series objects.
 *
 * Accepted shapes:
 *   { x: [...], y: [...] }                       one series
 *   { x: [...], y: [[...], [...]] }              multiple series sharing x
 *   { x: [...], series: [{ name, y, color }] }   named series sharing x
 *   [{ x, y, name, color, type }, ...]           independent series
 *   [1, 2, 3]                                    single y series, x = index
 *
 * @returns {Array<{name:string, x:number[], y:number[], color?:string, type?:string}>}
 */
function normalizeSeries(data) {
  if (data == null) return [];

  // Bare array of numbers -> single series with implicit index x.
  if (Array.isArray(data) && (data.length === 0 || typeof data[0] === 'number')) {
    return [{ name: 'series 0', x: data.map((_, i) => i), y: data }];
  }

  // Array of per-series objects.
  if (Array.isArray(data)) {
    return data.map((s, i) => normalizeOne(s, i));
  }

  // Object form.
  const x = data.x;
  if (Array.isArray(data.series)) {
    return data.series.map((s, i) => normalizeOne({ x: s.x || x, ...s }, i));
  }
  if (Array.isArray(data.y) && Array.isArray(data.y[0])) {
    return data.y.map((y, i) => ({ name: `series ${i}`, x: x || y.map((_, k) => k), y }));
  }
  return [normalizeOne(data, 0)];
}

function normalizeOne(s, i) {
  const y = s.y || [];
  const x = s.x || y.map((_, k) => k);
  return { name: s.name || `series ${i}`, x, y, color: s.color, type: s.type };
}

/** Combined [min, max] over a list of numeric arrays, with a degenerate-range guard. */
function extent(arrays) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const arr of arrays) {
    for (const v of arr) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

/** Smallest positive gap between consecutive sorted x values (for bar width). */
function minGap(xs) {
  const s = [...new Set(xs)].sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < s.length; i += 1) g = Math.min(g, s[i] - s[i - 1]);
  return Number.isFinite(g) ? g : 1;
}

/**
 * Create and mount the webgl-plot panel.
 *
 * @param {HTMLElement} container  DOM element to mount into
 * @returns {{ plot: Function, clear: Function, getSurface: () => object }}
 */
export function createPlot(container) {
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  // HTML overlay for title / axis labels / value markers (webgl-plot has none).
  const overlay = document.createElement('div');
  overlay.className = 'plot-overlay';
  container.appendChild(overlay);

  let wglp = null;
  let last = null;   // last { chartType, data, config } so we can re-render on resize

  function label(cls, text) {
    const el = document.createElement('div');
    el.className = `plot-label ${cls}`;
    el.textContent = text;
    overlay.appendChild(el);
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return '';
    if (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)) return v.toExponential(2);
    return Number(v.toFixed(3)).toString();
  }

  function render(chartType, data, config) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;

    wglp = new WebglPlot(canvas, { backgroundColor: BACKGROUND });

    const seriesList = normalizeSeries(data);
    overlay.innerHTML = '';
    if (!seriesList.length) { wglp.update(); return; }

    const types = seriesList.map((s) => (s.type || chartType || 'line').toLowerCase());
    const hasBars = types.some((t) => t === 'bar' || t === 'column');

    const [xmin, xmax] = extent(seriesList.map((s) => s.x));
    let [ymin, ymax] = extent(seriesList.map((s) => s.y));
    if (hasBars) { ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0); }

    // Map data space -> clip space [-1+MARGIN, 1-MARGIN].
    const span = 1 - MARGIN;
    wglp.gScaleX = (2 * span) / (xmax - xmin);
    wglp.gOffsetX = -span - wglp.gScaleX * xmin;
    wglp.gScaleY = (2 * span) / (ymax - ymin);
    wglp.gOffsetY = -span - wglp.gScaleY * ymin;

    // Faint zero axes when 0 lies inside the visible range.
    const axisColor = new ColorRGBA(0.35, 0.38, 0.44, 1);
    if (ymin < 0 && ymax > 0) {
      const ax = new WebglLine(axisColor, 2);
      ax.setX(0, xmin); ax.setX(1, xmax); ax.setY(0, 0); ax.setY(1, 0);
      wglp.addLine(ax);
    }
    if (xmin < 0 && xmax > 0) {
      const ay = new WebglLine(axisColor, 2);
      ay.setX(0, 0); ay.setX(1, 0); ay.setY(0, ymin); ay.setY(1, ymax);
      wglp.addLine(ay);
    }

    // Pixel-square scatter markers: convert MARKER_PX to data units per axis.
    const mhx = (MARKER_PX * (2 / w)) / wglp.gScaleX;
    const mhy = (MARKER_PX * (2 / h)) / wglp.gScaleY;

    seriesList.forEach((s, i) => {
      const type = types[i];
      const color = toColor(s.color || PALETTE[i % PALETTE.length]);
      const n = Math.min(s.x.length, s.y.length);

      if (type === 'scatter') {
        for (let k = 0; k < n; k += 1) {
          const sq = new WebglSquare(color);
          sq.setSquare(s.x[k] - mhx, s.y[k] - mhy, s.x[k] + mhx, s.y[k] + mhy);
          wglp.addSurface(sq);
        }
      } else if (type === 'bar' || type === 'column') {
        const half = (minGap(s.x) * 0.4) / seriesList.length;
        const shift = (i - (seriesList.length - 1) / 2) * half * 2;
        for (let k = 0; k < n; k += 1) {
          const sq = new WebglSquare(color);
          const cx = s.x[k] + shift;
          sq.setSquare(cx - half, 0, cx + half, s.y[k]);
          wglp.addSurface(sq);
        }
      } else {
        // line (default): connect points in order.
        const line = new WebglLine(color, n);
        for (let k = 0; k < n; k += 1) { line.setX(k, s.x[k]); line.setY(k, s.y[k]); }
        wglp.addLine(line);
      }
    });

    wglp.update();

    // Overlay: title, axis labels, corner value markers.
    if (config.title) label('title', config.title);
    if (config.xLabel) label('xlabel', config.xLabel);
    if (config.yLabel) label('ylabel', config.yLabel);
    label('v-xmin', fmt(xmin));
    label('v-xmax', fmt(xmax));
    label('v-ymin', fmt(ymin));
    label('v-ymax', fmt(ymax));
  }

  /**
   * Render a chart.
   *
   * @param {string} chartType  'line' | 'scatter' | 'column'/'bar'
   * @param {object|Array} data  see normalizeSeries()
   * @param {object} [config]    { title, xLabel, yLabel }
   */
  function plot(chartType, data, config = {}) {
    last = { chartType, data, config };
    try {
      render(chartType, data, config);
    } catch (err) {
      console.error('plot() failed:', err);
      throw err;
    }
  }

  function clear() {
    if (wglp) { wglp.clear(); wglp.removeAllLines(); }
    overlay.innerHTML = '';
    last = null;
  }

  // Re-render on container resize so the chart tracks the pane size.
  const ro = new ResizeObserver(() => {
    if (last && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      render(last.chartType, last.data, last.config);
    }
  });
  ro.observe(container);

  return { plot, clear, getSurface: () => wglp };
}
