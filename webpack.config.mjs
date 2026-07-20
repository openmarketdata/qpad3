import path from 'path'; // cjs: const path = require('path');
import { createRequire } from 'module';
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

const require = createRequire(import.meta.url);
const PerspectivePlugin = require('@finos/perspective-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

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
    // Copy SciChart's 2D WebAssembly runtime next to the bundle so it is
    // served from the app's own origin (SciChartSurface.useWasmLocal()).
    new CopyPlugin({
      patterns: [
        { from: 'node_modules/scichart/_wasm/scichart2d.wasm', to: '' },
        { from: 'node_modules/scichart/_wasm/scichart2d-nosimd.wasm', to: '' },
        { from: 'node_modules/scichart/_wasm/scichart2d.js', to: '' },
      ],
    }),
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