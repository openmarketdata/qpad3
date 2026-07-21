import path from 'path'; // cjs: const path = require('path');
import fs from 'fs';
import { createRequire } from 'module';
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

const require = createRequire(import.meta.url);
const PerspectivePlugin = require('@finos/perspective-webpack-plugin');

// Copy SciChart's 2D WebAssembly runtime next to the bundle so it is served
// from the app's own origin (SciChartSurface.useWasmLocal()). Implemented
// inline with Node's fs to avoid an extra build dependency (copy-webpack-plugin
// v14 needs Node >= 20.9, breaking builds on older Node).
const SCICHART_WASM_FILES = [
  'node_modules/scichart/_wasm/scichart2d.wasm',
  'node_modules/scichart/_wasm/scichart2d-nosimd.wasm',
  'node_modules/scichart/_wasm/scichart2d.js',
];

class CopySciChartWasmPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopySciChartWasmPlugin', () => {
      const out = compiler.options.output.path;
      fs.mkdirSync(out, { recursive: true });
      for (const f of SCICHART_WASM_FILES) {
        fs.copyFileSync(path.resolve(f), path.join(out, path.basename(f)));
      }
    });
  }
}

export default {
  mode: 'production',
  entry: './src/index.mjs',
  output: {
    path: path.resolve('./dist'), // cjs: path.resolve(__dirname, 'dist'),
    filename: 'index.js'
  },
  experiments: {
    outputModule: true
  },
  plugins: [
    new HtmlWebPackPlugin({
      title: "Perspective Webpack Example",
      scriptLoading: "module", // ESM output requires type="module" script tags
      template: './src/index.html'
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