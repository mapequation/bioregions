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
    const newickOutput = '((A:10,B:0):10,C:4,(D:3,E:2):5):19;';
    
    let tree = null;
    before(() => {
        return newick.parse(newickInput).then(d => {
            tree = d;
        })
    })

    describe('aggregateCount', () => {
        it('should aggregate counts on tree', () => {
            let result = newick.parse(newickInput)
                .then(tree => phyloUtils.aggregateCount(tree, getLeafCount))
                .then(_.partial(newick.write, {
                    getBranchLength: ({count}) => count
                }));
            return expect(result).to.eventually.eq(newickOutput);
        })
    })

})
