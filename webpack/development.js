var webpack = require('webpack');
// var ExtractTextPlugin = require('extract-text-webpack-plugin');
var path = require('path');

var devFlagPlugin = new webpack.DefinePlugin({
  __DEV__: JSON.stringify(JSON.parse(process.env.DEBUG || 'false')),
  'process.env': {
    'NODE_ENV': JSON.stringify(process.env.NODE_ENV)
  }
});

module.exports = {
  entry: [
    'webpack-dev-server/client?http://localhost:3003',
    // 'webpack/hot/only-dev-server',
    'webpack/hot/dev-server',
    './src/client/index.js'
  ],
  output: {
    path: path.join(__dirname, '../static'),
    publicPath: '/static/',
    filename: 'bundle.js',
    hot: true
  },
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoErrorsPlugin(),
    devFlagPlugin,
    // new ExtractTextPlugin('app.css')
  ],
  // devtool: 'cheap-module-eval-source-map',
  devtool: "source-map", // or "inline-source-map"
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel'], exclude: /node_modules/ },
      { test: /\.css$/, loaders: ["style", "css", ""] },
      // { test: /\.scss$/, loaders: ["style", "css?sourceMap", "sass?sourceMap"] }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.json']
  }
};
