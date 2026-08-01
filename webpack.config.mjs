import path from 'path'; // cjs: const path = require('path');
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

const require = createRequire(import.meta.url);
const PerspectivePlugin = require('@finos/perspective-webpack-plugin');

// Resolve all paths relative to this config file (not the current working
// directory) so the build works no matter where it is invoked from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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