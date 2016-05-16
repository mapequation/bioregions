/* eslint-disable camelcase */
import { expect } from 'chai'
import newick, { _parseNewick } from '../newick'
import treeUtils from '../../treeUtils'
import nhx from '../nhx'

describe('newick', () => {
    const newickTree = '((00,01)0,1,(20,21)2)root;';
    const jsonTree = {
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
    const metaNewick = '((00[&area_pp={1,0,1}]:.24,01[&area_pp={0,0,1}&foo=bar&a=10])0[&area_pp={.5,0,1}],1,(20,21)2)root;';
    const jsonMetaTree = {
        name: 'root',
        children: [
            {
                name: '0',
                area_pp: [.5,0,1],
                children: [
                    { name: '00', area_pp: [1, 0, 1], length: 0.24 },
                    { name: '01', area_pp: [0,0,1], foo: 'bar', a: '10' },
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
    
    
    const newickWithBranchLengths = '(A:1,B:2):0;';
    const treeWithBranchLengths = { length: 0, children: [
        { name: 'A', length: 1 },
        { name: 'B', length: 2 },
    ]};

    describe('_parseNewick', () => {
        it('should parse a newick formatted string to json', () => {
            return expect(_parseNewick(newickTree)).to.deep.eq(jsonTree);
        })

        it('should parse newick data with branch lengths', () => {
            return expect(_parseNewick(newickWithBranchLengths)).to.deep.eq(treeWithBranchLengths);
        })
    })

    describe('parse', () => {
        it('should parse a newick formatted string to json', () => {
            return expect(newick.parse(newickTree)).to.eventually.deep.eq(jsonTree);
        })
    })

    describe('write', () => {
        it('should write json tree to newick format', () => {
            expect(newick.write(jsonTree)).to.eq(newickTree);
        })
        
        it('should write branch lengths if exist', () => {
            expect(newick.write(treeWithBranchLengths)).to.eq(newickWithBranchLengths);
        })
        
        it('should write with custom names', () => {
            expect(newick.write({
                getName: (node) => `*${node.name || ''}`,
            }, treeWithBranchLengths)).to.eq('(*A:1,*B:2)*:0;');
        })
        
        it('should write with custom lengths', () => {
            expect(newick.write({
                getBranchLength: (node) => node.length * 2,
            }, treeWithBranchLengths)).to.eq('(A:2,B:4):0;');
        })
        
        it('should parse newick extended with data', () => {
            return expect(nhx.parse(metaNewick)).to.eventually.deep.eq(jsonMetaTree);
        })
    })
})
