/* eslint-disable camelcase */
import { expect } from 'chai'
import newick from '../newick'

describe('newick', () => {
    const newick1 = '((00,01)0,1,(20,21)2)root;';
    const tree1 = {
        name: 'root',
        children: [
            {
                name: '0',
                children: [
                    { name: '00' },
                    { name: '01' },
                ]
            },
            {
                name: '1',
            },
            {
                name: '2',
                children: [
                    { name: '20' },
                    { name: '21' },
                ]
            },
        ]
    };
    function setParents(node) {
        (node.children || []).forEach(child => {
            child.parent = node;
            setParents(child);
        });
    }
    setParents(tree1);
    
    const newickWithBranchLengths = '(A:1,B:2):3;';
    const treeWithBranchLengths = { length: 3, name: '', children: [
        { name: 'A', length: 1 },
        { name: 'B', length: 2 },
    ]};
    setParents(treeWithBranchLengths);

    describe('parse', () => {
        it('should parse a newick formatted string to json', () => {
            return expect(newick.parse(newick1)).to.eventually.deep.eq(tree1);
        })

        it('should parse newick data with branch lengths', () => {
            return expect(newick.parse(newickWithBranchLengths)).to.eventually.deep.eq(treeWithBranchLengths);
        })
    })

    describe('write', () => {
        it('should write json tree to newick format', () => {
            expect(newick.write(tree1)).to.eq(newick1);
        })
        
        it('should write branch lengths if exist', () => {
            expect(newick.write(treeWithBranchLengths)).to.eq(newickWithBranchLengths);
        })
        
        it('should write with custom names', () => {
            expect(newick.write({
                getName: (node) => `*${node.name}`,
            }, treeWithBranchLengths)).to.eq('(*A:1,*B:2)*:3;');
        })
        
        it('should write with custom lengths', () => {
            expect(newick.write({
                getBranchLength: (node) => node.length * 2,
            }, treeWithBranchLengths)).to.eq('(A:2,B:4):6;');
        })
    })
})
