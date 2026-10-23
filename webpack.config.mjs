import path from 'path'; // cjs: const path = require('path');
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import HtmlWebPackPlugin from 'html-webpack-plugin'; // Plugin to generate HTML

const require = createRequire(import.meta.url);
const PerspectivePlugin = require('@finos/perspective-webpack-plugin');

// Resolve all paths relative to this config file (not the current working
// directory) so the build works no matter where it is invoked from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `npm run build:compact` (webpack --env compact) emits a single
// self-contained dist-compact/index.html: the JS bundle is inlined as a
// <script type="module"> and the Perspective .wasm files become data: URLs.
class CompactHtmlPlugin {
  apply(compiler) {
    // PerspectivePlugin registers `.wasm` as asset/resource; switch it to
    // asset/inline so the runtime's `new URL(wasm, base)` + fetch() still work.
    for (const rule of compiler.options.module.rules) {
      if (String(rule.test) === String(/\.wasm$/)) rule.type = 'asset/inline';
    }

    compiler.hooks.compilation.tap('CompactHtmlPlugin', (compilation) => {
      HtmlWebPackPlugin.getHooks(compilation).alterAssetTagGroups.tap(
        'CompactHtmlPlugin',
        (data) => {
          const inline = (tag) => {
            if (tag.tagName !== 'script' || !tag.attributes.src) return tag;
            const name = tag.attributes.src.split('?')[0];
            const source = compilation.assets[name].source().toString();
            compilation.deleteAsset(name);
            const { src, ...attributes } = tag.attributes;
            return {
              tagName: 'script',
              voidTag: false,
              meta: tag.meta,
              attributes,
              innerHTML: source.replace(/<\/script/gi, '<\\/script'),
            };
          };
          data.headTags = data.headTags.map(inline);
          data.bodyTags = data.bodyTags.map(inline);
          return data;
        }
      );
    });
  }
}

export default (env = {}) => {
  const compact = !!env.compact;
  return {
    mode: 'production',
    context: __dirname,
    entry: path.resolve(__dirname, 'src/index.mjs'),
    output: {
      path: path.resolve(__dirname, compact ? 'dist-compact' : 'dist'),
      filename: 'index.js',
      clean: compact,
    },
    experiments: {
      outputModule: true
    },
    optimization: compact ? { minimizer: [(compiler) => {
      // keep terser defaults but don't emit index.js.LICENSE.txt
      const TerserPlugin = require('terser-webpack-plugin');
      new TerserPlugin({ extractComments: false }).apply(compiler);
    }] } : undefined,
    plugins: [
      new HtmlWebPackPlugin({
        title: "Perspective Webpack Example",
        scriptLoading: "module", // ESM output requires type="module" script tags
        template: path.resolve(__dirname, 'src/index.html')
      }),
      new PerspectivePlugin(),
      ...(compact ? [new CompactHtmlPlugin()] : []),
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
};
