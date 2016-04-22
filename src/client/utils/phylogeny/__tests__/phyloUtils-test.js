/* eslint-disable camelcase */
import { expect } from 'chai'
import newick from '../newick'
import phyloUtils from '../phyloUtils'
import _ from 'lodash'

describe('phyloUtils', () => {
    const newickInput = '((A,B),C,(D,E));';
    const species = {
        'A': 10,
        'C': 4,
        'D': 3,
        'E': 2,
    };
    const getLeafCount = ({name}) => species[name];
    const newickCountOutput = '((A:10,B:0):10,C:4,(D:3,E:2):5):19;';

    describe('aggregateCount', () => {
        it('should aggregate counts on tree', () => {
            const result = newick.parse(newickInput)
                .then(tree => phyloUtils.aggregateCount(tree, getLeafCount))
                .then(_.partial(newick.write, {
                    getBranchLength: ({count}) => count
                }));
            return expect(result).to.eventually.eq(newickCountOutput);
        })
    })

    describe('prune', () => {
        it('should clone the tree if all included', () => {
            const result = newick.parse(newickInput)
                .then(tree => phyloUtils.prune(tree, (node) => true))
                .then(newick.write);
            return expect(result).to.eventually.eq('((A,B),C,(D,E));');
        })
        
        it('should not include empty child array if no children included', () => {
            const result = newick.parse('((00,01)0,1,(20,21)2);')
                .then(tree => phyloUtils.prune(tree, ({name}) => name !== '00' && name !== '01'))
                .then(newick.write);
            return expect(result).to.eventually.eq('(0,1,(20,21)2);');
        })
        
        it('should prune zero-count branches', () => {
            const result = newick.parse(newickInput)
                .then(tree => phyloUtils.aggregateCount(tree, getLeafCount))
                .then(tree => phyloUtils.prune(tree, ({count}) => count > 0))
                .then(newick.write);
            return expect(result).to.eventually.eq('((A),C,(D,E));');
        })
    })

})
