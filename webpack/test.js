var webpack = require('webpack');
// var ExtractTextPlugin = require('extract-text-webpack-plugin');
var path = require('path');

var devFlagPlugin = new webpack.DefinePlugin({
  __DEV__: JSON.stringify(JSON.parse(process.env.DEBUG || 'false'))
});

const config = {
//   entry: [
//     'webpack-dev-server/client?http://localhost:3003',
//     // 'webpack/hot/only-dev-server',
//     'webpack/hot/dev-server',
//     './js/index.js'
//   ],
  entry: {
    client: [path.resolve(__dirname, '../src/client/index.js')]
  },
//   output: {
//     path: path.join(__dirname, '../static'),
//     publicPath: '/static/',
//     filename: 'bundle.js',
//     hot: true
//   },
  output: {
    path: path.resolve(__dirname, '../static'),
    publicPath: '/static/',
    filename: 'bundle.js',
  },
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin(),
    // new webpack.HotModuleReplacementPlugin(),
    // new webpack.NoErrorsPlugin(),
    // devFlagPlugin,
    // new ExtractTextPlugin('app.css')
  ],
  // devtool: 'cheap-module-eval-source-map',
  devtool: "source-map", // or "inline-source-map"
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel'], exclude: /node_modules/ },
      { test: /\.css$/, loaders: ["style", "css", ""] },
      { test: /\.scss$/, loaders: ["style", "css", "sass"] },
      // { test: /\.scss$/, loaders: ["style", "css?sourceMap", "sass?sourceMap"] }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.json'],
    root: path.resolve(__dirname, '../src/client'),
  }
//   entry: {
//     client: [path.resolve(__dirname, '../client/index.js')]
//   },
//   module: {
//     loaders: [
//       {
//         test: /\.js$/,
//         exclude: /node_modules/,
//         loaders: ['babel']
//       }, {
//         test: /\.css$/,
//         loader: extractCSS.extract('css')
//       }, {
//         test: /\.(eot|woff|woff2|ttf|svg|png|jpg)$/,
//         loader: 'url-loader?limit=30000&name=[name]-[hash].[ext]'
//       }, {
//         test: /\.json$/,
//         loader: 'json-loader'
//       }
//     ],
//     preLoaders: [{
//       test: /\.js$/,
//       exclude: /node_modules/,
//       loader: 'eslint-loader'
//     }]
//   },
//   output: {
//     path: path.resolve(__dirname, '../public'),
//     filename: '[name].js'
//   },
//   plugins: [
//     extractCSS,
//     new webpack.optimize.OccurenceOrderPlugin(),
//     new webpack.ProvidePlugin({
//       fetch: 'imports?this=>global!exports?global.fetch!whatwg-fetch'
//     }),
//     new SassLintPlugin({
//       configFile: path.resolve(__dirname, '../.sass-lint.yml'),
//       glob: 'client/**/*.scss'
//     })
//   ],
//   resolve: {
//     root: path.resolve(__dirname, '../client'),
//     extensions: ['', '.js']
//   }
}

config.devtool = 'cheap-module-source-map'

// config.module.loaders.push({
//   test: /\.scss$/,
//   loaders: [
//     'css/locals?modules&importLoaders=1' +
//       '&localIdentName=[path][local]__[hash:base64:5]',
//     'sass'
//   ]
// })

config.target = 'node'

module.exports = config
