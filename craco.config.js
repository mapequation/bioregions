const webpack = require('webpack');

module.exports = {
  webpack: {
    //   alias: { },
    //   plugins: {
    //     add: [ ],
    //     remove: [ ],
    //   },
    configure: (config, { env, paths }) => {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
      };
      config.resolve.extensions = [...config.resolve.extensions, '.ts', '.js'];
      config.plugins = [
        ...config.plugins,
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
        new webpack.ProvidePlugin({
          process: 'process/browser',
        }),
      ];
      config.devtool = 'source-map';

      return config;
    },
  },
};
