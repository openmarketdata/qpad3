import path from 'path'; // cjs: const path = require('path');
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

const require = createRequire(import.meta.url);
const PerspectivePlugin = require('@finos/perspective-webpack-plugin');

// Resolve all paths relative to this config file (not the current working
// directory) so the build works no matter where it is invoked from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Copy SciChart's 2D WebAssembly runtime next to the bundle so it is served
// from the app's own origin (SciChartSurface.useWasmLocal()). Implemented
// inline with Node's fs to avoid an extra build dependency (copy-webpack-plugin
// v14 needs Node >= 20.9, breaking builds on older Node). The scichart install
// dir is resolved via require.resolve so it is found regardless of cwd or where
// node_modules is hoisted.
const SCICHART_WASM_DIR = path.join(path.dirname(require.resolve('scichart/package.json')), '_wasm');
const SCICHART_WASM_FILES = ['scichart2d.wasm', 'scichart2d-nosimd.wasm', 'scichart2d.js'];

class CopySciChartWasmPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopySciChartWasmPlugin', () => {
      const out = compiler.options.output.path;
      fs.mkdirSync(out, { recursive: true });
      for (const f of SCICHART_WASM_FILES) {
        fs.copyFileSync(path.join(SCICHART_WASM_DIR, f), path.join(out, f));
      }
    });
  }
}

export default {
  mode: 'production',
  context: __dirname,
  entry: path.resolve(__dirname, 'src/index.mjs'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js'
  },
  experiments: {
    outputModule: true
  },
  plugins: [
    new HtmlWebPackPlugin({
      title: "Perspective Webpack Example",
      scriptLoading: "module", // ESM output requires type="module" script tags
      template: path.resolve(__dirname, 'src/index.html')
    }),
    new PerspectivePlugin(),
    new CopySciChartWasmPlugin(),
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [{ loader: "style-loader" }, { loader: "css-loader" }],
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.mjs'],
    fallback: {
      buffer: "buffer/",
    }
  }  
};