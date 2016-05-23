/* eslint-disable camelcase */
import { expect } from 'chai'
import { parseNexus, parseNexus2 } from '../nexus'
import treeUtils from '../../treeUtils'

describe('nexus', () => {
    const newickString = '((00,01)0,1,(20,21)2)root;';
    const demoNexusString = `
    #NEXUS

Begin taxa;
	Dimensions ntax=5;
	Taxlabels
		'Tachydromus sexlineatus KU311512'
		'Brachymeles samarensis KU310851'
		'Brachymeles samarensis KU311226'
		'Brachymeles samarensis KU311227'
		;
End;
    
BEGIN TREES;
	TRANSLATE
		Tl468527 'Tachydromus sexlineatus KU311512',
		Tl468507 'Brachymeles samarensis KU310851',
		Tl468443 'Brachymeles samarensis KU311226',
		Tl468468 'Brachymeles samarensis KU311227'		;
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
       
    

    describe('parseNexus', () => {
        it('should parse a simple nexus string', () => {
            const nex = parseNexus(demoNexusString);
            expect(nex.status).to.eq(0);
            expect(nex.error).to.eq(undefined);
            expect(nex.treesblock).to.be.an('object');
            expect(nex.treesblock.trees).to.have.length.above(0);
            const tree = nex.treesblock.trees[0];
            expect(tree).to.include.keys('newick');
            expect(tree.newick).to.eq(newickString);
        })
        
        it('should parse a BayArea formatted nexus string')
        
        // it('should parse a BayArea formatted nexus string', () => {
        //     const nex = parseNexus(bayAreaNewickString);
        //     expect(nex.status).to.eq(0);
        //     expect(nex.error).to.eq(undefined);
        //     expect(nex.treesblock).to.be.an('object');
        //     expect(nex.treesblock.trees).to.have.length.above(0);
        //     const tree = nex.treesblock.trees[0];
        //     expect(tree).to.eq(newickTree);
        // })

    })
	
	 describe('parseNexus2', () => {
        it('should parse a simple nexus string', () => {
            const nex = parseNexus2(demoNexusString);
            expect(nex.status).to.eq(0);
            expect(nex.error).to.eq(undefined);
            expect(nex.treesblock).to.be.an('object');
            expect(nex.treesblock.trees).to.have.length.above(0);
            const tree = nex.treesblock.trees[0];
            expect(tree).to.include.keys('newick');
            expect(tree.newick).to.eq(newickString);
        })
	 })
})
