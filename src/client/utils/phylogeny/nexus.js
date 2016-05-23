import { _parseNewick } from './newick';
import treeUtils from '../treeUtils';

export function _parseNexus(str) {
	// Extract only trees block!
	const blocks = str.split(/^begin\s+/mi);
	const testTreesBlock = new RegExp('^trees', 'i');
	const treesBlock = blocks.filter(block => testTreesBlock.test(block));
	if (treesBlock.length === 0) {
		throw new Error("Couldn't find trees block");
	}
	
	const treesStr = treesBlock[0];
	
	const translateBlock = treesStr.match(/^\s*translate\s+([^;]+;)/im);
	
	const translate = {};
	let numTranslations = 0;
	if (translateBlock.length === 2) {
		const translateStr = translateBlock[1];
		// console.log(`!!! translate: ${translateStr}`);
		const entries = translateStr.split(/\s*,[\r\n]/);
		const reEntry = new RegExp('^\s*(\S+)\s(.+)', 'g')
		const reName = new RegExp('^\'?(.*)\'?;?$');
		entries.forEach(entry => {
			// const match = entry.match(reEntry);
			let words = entry.split(/\s/).filter(s => s !== '' && s !== ';');
			if (words.length >= 2) {
				const nameSource = words.shift();
				let nameTarget = words.join(' ');
				let start = nameTarget.charAt(0) === '\'' ? 1 : 0;
				let end = nameTarget.charAt(nameTarget.length - 1) === ';' ? nameTarget.length - 1 : nameTarget.length;
				if (nameTarget.charAt(end - 1) === '\'') {
					end -= 1;
				}
				const name = nameTarget.substring(start, end);
				translate[nameSource] = name;
				// console.log(` ${nameSource} -> ${name}`);
				++numTranslations;
				
				// let nameMatch = nameTarget.match(reName);
				// console.log(` ${nameTarget} -> match: ${nameMatch}`)
				// if (nameMatch.length >= 2) {
				// 	const name = nameMatch[1];
				// 	translate[nameSource] = name;
				// 	console.log(` ${nameSource} -> ${name}`);
				// 	++numTranslations;
				// }
			}
		});
		console.log(`Got translation for ${numTranslations} entries.`);
	}
	
	const newick = treesStr.match(/^\s*tree\s+[^=]+=[^(]*(.+)/im);
	
	if (newick.length < 2) {
		throw new Error("Couldn't extract 'tree [name] = [newick string]' from NEXUS file.")
	}
	
	const tree = _parseNewick(newick[1]);
	
	
	if (numTranslations > 0) {
		let numTranslated = 0;
		treeUtils.visitTreeDepthFirst(tree, node => {
			const translatedName = translate[node.name];
			// console.log(`${node.name} => ${translatedName}`)
			if (translatedName) {
				++numTranslated;
				node.name = translatedName;
			}
		});
		console.log(`${numTranslated}/${numTranslations} translations matched in tree`)
	}
	
	return tree;
}

export function parseNexus(s) {
  return new Promise((resolve) => {
    const tree = _parseNexus(s);
    resolve(tree);
  });
}

export function writeNexus(tree) {
	return 'Not implemented';
}

export default {
  parse: parseNexus,
  write: writeNexus,
};
