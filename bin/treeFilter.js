#!/usr/bin/env node --max-old-space-size=4096
require('babel-register');
// require('../bin-babel/treeFilter');
var yargs = require('yargs');
var fs = require('fs');
var treeFilter = require('../cli-tools/treeFilter');
var moment = require('moment');

var argv = yargs
  .usage('Usage: $0 <command> [options]')
  .command('count <input_tree>', 'Count the number of nodes in the tree')
  .example('$0 count tree.nwk')
  .command('names <input_tree> <output_names>', 'Print the names of leaf nodes in the tree')
  .example('$0 names tree.nwk names.txt')
  .command('count-intersection <input_tree> <input_species> <name_column>', 'Count the number of nodes that co-occur in <input_tree> and <input_species>')
  .example('$0 count-intersection tree.nwk species.tsv name')
  .command('print-intersection <input_tree> <input_species> <name_column> <output_tree>', 'Prune <input_tree> to species in <input_species> and write to <output_tree>')
  .example('$0 print-intersection tree.nwk species.tsv name intersection.nwk')
  .help('h')
  .alias('h', 'help')
  .argv;
  
var startDate = new Date();

function onEnd(res) {
  var diff = moment().diff(startDate);
  console.log(`Ended in ${moment.duration(diff).humanize()}`);
  if (res)
    console.log(`Result: ${res}`);
}

function onError(err) {
  console.log("Error:", err);
}

switch (argv._[0]) {
  case 'count':
    treeFilter.countNodes(argv.input_tree).then(onEnd).catch(onError);
    break;
  case 'names':
    treeFilter.printNames(argv.input_tree, argv.output_names).then(onEnd).catch(onError);
    break;
  case 'count-intersection':
    treeFilter.countIntersection(argv.input_tree, argv.input_species, argv.name_column)
      .then(onEnd).catch(onError);
    break;
  case 'print-intersection':
    treeFilter.printIntersection(argv.input_tree, argv.input_species, argv.name_column, argv.output_tree)
      .then(onEnd).catch(onError);
    break;
  default:
    console.log('Missing command. Run with -h for help.');
}
