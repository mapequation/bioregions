var webpack = require('webpack');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var path = require('path');

var devFlagPlugin = new webpack.DefinePlugin({
  __DEV__: JSON.stringify(JSON.parse(process.env.DEBUG || 'false')),
  'process.env': {
    'NODE_ENV': JSON.stringify(process.env.NODE_ENV)
  },
  PUBLIC: JSON.stringify('/bioregions.minute')
});

module.exports = {
  entry: [
    './src/client/index.js'
  ],
  output: {
    path: path.join(__dirname, '../static'),
    publicPath: '/bioregions.minute/static/',
    filename: 'bundle.js',
  },
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.NoErrorsPlugin(),
    devFlagPlugin,
    new ExtractTextPlugin('app.css')
  ],
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel'], exclude: /node_modules/ },
      // { test: /\.css$/, loader: ExtractTextPlugin.extract('css-loader?module!cssnext-loader') }
      { test: /\.css$/, loader: ExtractTextPlugin.extract('style-loader', 'css-loader!cssnext-loader') },
      // { test: /\.css$/, loaders: ["style", "css", ""] },
      // { test: /\.scss$/, loaders: ["style", "css", "sass"] },
    ]
  },
  resolve: {
    extensions: ['', '.js', '.json']
  }
};
