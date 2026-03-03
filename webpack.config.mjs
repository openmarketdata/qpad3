import path from 'path'; // cjs: const path = require('path');
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

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
      scriptLoading: "blocking", // Load scripts in blocking mode
      template: './src/index.html'
    }),
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        exclude: /node_modules/,
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