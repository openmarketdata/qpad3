/**
 * Plot — SciChart.js charting panel
 *
 * Renders charts in a WebAssembly-powered SciChartSurface. Exposes a global
 * `window.plot(chartType, data, config)` wrapper so charts can be driven from
 * the browser console (and, later, from the q server). No `.ws` wiring yet.
 *
 * SciChart's 2D WebAssembly runtime is served from the app origin — the
 * `scichart2d.wasm` / `scichart2d.js` assets are copied next to the bundle by
 * webpack (see webpack.config.mjs) and loaded via `SciChartSurface.useWasmLocal()`.
 */
import {
  SciChartSurface,
  NumericAxis,
  XyDataSeries,
  FastLineRenderableSeries,
  FastColumnRenderableSeries,
  FastMountainRenderableSeries,
  XyScatterRenderableSeries,
  EllipsePointMarker,
  SciChartJsNavyTheme,
} from 'scichart';

// Load the WebAssembly context from the same origin as the app (the copied
// scichart2d.* assets), rather than SciChart's CDN.
SciChartSurface.useWasmLocal();

// Use SciChart's free community license (no key, no licensing-wizard lookup).
// Swap for SciChartSurface.setRuntimeLicenseKey('...') if a commercial key is
// provisioned.
SciChartSurface.UseCommunityLicense();

// A palette used to auto-colour series that don't specify a colour.
const PALETTE = [
  '#e5c07b', '#61afef', '#98c379', '#e06c75',
  '#c678dd', '#56b6c2', '#d19a66', '#abb2bf',
];

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

/**
 * Build a renderable series for the given chart type.
 */
function makeRenderable(wasmContext, type, dataSeries, color) {
  const stroke = color;
  switch ((type || 'line').toLowerCase()) {
    case 'scatter':
      return new XyScatterRenderableSeries(wasmContext, {
        dataSeries,
        pointMarker: new EllipsePointMarker(wasmContext, {
          width: 7, height: 7, fill: color, stroke: color,
        }),
      });
    case 'column':
    case 'bar':
      return new FastColumnRenderableSeries(wasmContext, { dataSeries, fill: color, stroke });
    case 'mountain':
    case 'area':
      return new FastMountainRenderableSeries(wasmContext, {
        dataSeries, stroke, fill: color + '55',
      });
    case 'line':
    default:
      return new FastLineRenderableSeries(wasmContext, { dataSeries, stroke, strokeThickness: 2 });
  }
}

/**
 * Create and mount the SciChart plot panel.
 *
 * @param {HTMLElement} container  DOM element to mount into
 * @returns {{ plot: Function, clear: Function, getSurface: () => object }}
 */
export function createPlot(container) {
  // SciChartSurface.create needs its own element to own.
  const host = document.createElement('div');
  host.style.width = '100%';
  host.style.height = '100%';
  container.appendChild(host);

  let surface = null;
  let wasmContext = null;
  let ready = null;   // Promise resolving once the surface is created
  let queue = Promise.resolve();  // serialize concurrent plot() calls

  async function getSurface() {
    if (!ready) {
      ready = SciChartSurface.create(host, {
        theme: new SciChartJsNavyTheme(),
      }).then(({ sciChartSurface, wasmContext: wc }) => {
        surface = sciChartSurface;
        wasmContext = wc;
        surface.xAxes.add(new NumericAxis(wasmContext));
        surface.yAxes.add(new NumericAxis(wasmContext));
        return surface;
      });
    }
    return ready;
  }

  /**
   * Render a chart.
   *
   * @param {string} chartType  'line' | 'scatter' | 'column'/'bar' | 'mountain'/'area'
   * @param {object|Array} data  see normalizeSeries()
   * @param {object} [config]    { title, xLabel, yLabel }
   * @returns {Promise<object>}  the SciChartSurface
   */
  function plot(chartType, data, config = {}) {
    queue = queue.then(async () => {
      await getSurface();

      // Reset existing content.
      surface.renderableSeries.clear();

      surface.xAxes.get(0).axisTitle = config.xLabel || '';
      surface.yAxes.get(0).axisTitle = config.yLabel || '';

      const seriesList = normalizeSeries(data);
      seriesList.forEach((s, i) => {
        const color = s.color || PALETTE[i % PALETTE.length];
        const dataSeries = new XyDataSeries(wasmContext, {
          xValues: s.x,
          yValues: s.y,
          dataSeriesName: s.name,
        });
        surface.renderableSeries.add(
          makeRenderable(wasmContext, s.type || chartType, dataSeries, color),
        );
      });

      return surface;
    }).catch((err) => {
      console.error('plot() failed:', err);
      throw err;
    });
    return queue;
  }

  function clear() {
    if (surface) surface.renderableSeries.clear();
  }

  return { plot, clear, getSurface: () => surface };
}
