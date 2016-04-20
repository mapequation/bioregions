#!/usr/bin/env node --max-old-space-size=4096
require('babel-register');
// require('../bin-babel/treeFilter');
var yargs = require('yargs');
var fs = require('fs');
var treeFilter = require('../cli-tools/treeFilter');

var argv = yargs
  .usage('Usage: $0 <command> [options]')
  .command('count <input_tree>', 'Count the number of nodes in the tree')
  .example('$0 count tree.nwk')
  .command('names <input_tree> <output_names>', 'Print the names of leaf nodes in the tree')
  .example('$0 names tree.nwk names.txt')
  .command('intersection <input_tree> <input_species> <name_column> <output_tree>', 'Prune the tree to species in <input_species>')
  .example('$0 intersection tree.nwk species.tsv name intersection.nwk')
  .help('h')
  .alias('h', 'help')
  .argv;


switch (argv._[0]) {
  case 'count':
    treeFilter.countNodes(argv.input_tree).then(function(count) {
      console.log("Done! count:", count);
    }).catch(onError);
    break;
  case 'names':
    treeFilter.printNames(argv.input_tree, argv.output_names).then(function() {
      console.log("Done!");
    }).catch(onError);
    break;
  case 'intersection':
    treeFilter.intersection(argv.input_tree, argv.input_species, argv.name_column, argv.output_tree).then(function() {
      console.log("Done!");
    }).catch(onError);
    break;
  default:
    console.log("Missing command");
}

function onError(err) {
  console.log("Error:", err);
}
