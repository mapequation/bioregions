/* eslint-disable camelcase */
import { expect } from 'chai'
import nexus, { _parseNexus } from '../nexus'
import newick from '../newick'
import treeUtils from '../../treeUtils'

describe('nexus', () => {
    const newickString = '((00,01)0,1,(20,21)2)root;';
    const demoNexusString = `
    #NEXUS

Begin taxa;
	Dimensions ntax=5;
	Taxlabels
		'Sp A'
		'Sp B'
		'Sp C'
		'Sp D'
		'Sp E'
		;
End;
    
BEGIN TREES;
	TRANSLATE
		00 'Sp A',
		01 'Sp B',
		1 Sp C,
		20 'Sp D',
		21 'Sp E'		;
	TREE 'ML' = ${newickString}
END;
    `;
    
    const bayAreaNewickString = `
    #NEXUS

Begin phylowood;
	drawtype pie
	modeltype biogeography
	areatype discrete
	maptype clean
	pieslicestyle even
	piefillstyle outwards
	timestart -217.885
	markerradius 300
	minareaval 0.1
End;

Begin bayarea-fig;
	mapheight	100
	mapwidth	150
	canvasheight	2000
	canvaswidth	1000
	minareaval	0.15
	areacolors black
	areatypes 1 1 1
	areanames Default
End;

Begin taxa;
	Dimensions ntax=5;
	Taxlabels
		sp1
		sp2
		sp3
		sp4
        sp5
		;
End;

Begin geo;
	Dimensions ngeo=3;
	Coords
		0	-2.94545	-63.0909,
		1	16.25	-89.5,
		2	-30.8889	-59.5556,
		;
End;

Begin trees;
	Translate
		root	proot,
		0	p0,
		1	sp3,
        2   p2
        00  sp1
		01	sp2
        20  sp4
		21	sp5
		;
tree TREE1 = ${newickString};
End;
    `;
    
	
	describe('_parseNexus', () => {
        it('should parse a simple nexus string with translations', () => {
            const tree = _parseNexus(demoNexusString);
			expect(tree).to.be.ok;
			expect(newick.write(tree)).to.eq('((Sp A,Sp B)0,Sp C,(Sp D,Sp E)2)root;')
        })
	})

	describe('parseNexus', () => {
        it('should parse a simple nexus string and eventually return a tree', () => {
            const result = nexus.parse(demoNexusString)
				.then(newick.write);
			return expect(result).to.eventually.eq('((Sp A,Sp B)0,Sp C,(Sp D,Sp E)2)root;')
        })
	})
})
