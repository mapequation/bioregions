const ThreadsPlugin = require("threads-plugin");

module.exports = {
  babel: {
    presets: [],
    plugins: [],
  },
  typescript: {
    enableTypeChecking: true /* (default value)  */,
  },
  webpack: {
    alias: {},
    plugins: {
      add: [new ThreadsPlugin()] /* An array of plugins */,
      remove: [] /* An array of plugin constructor's names (i.e. "StyleLintPlugin", "ESLintWebpackPlugin" ) */,
    },
  },
};
