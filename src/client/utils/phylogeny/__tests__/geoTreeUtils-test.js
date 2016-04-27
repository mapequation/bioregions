/* eslint-disable camelcase */
import { expect } from 'chai'
import geoTreeUtils, { _aggregateClusters, _sortAndLimitClusters } from '../geoTreeUtils'
import treeUtils from '../../treeUtils'
import newick from '../newick'
import _ from 'lodash'

describe('geoTreeUtils', () => {
    const newick1 = '((00,01)0,1,(20,21)2)root;';
    const clustersPerSpecies = {
        '00': { count: 5, clusters: [
            {clusterId: 0, count: 2},
            {clusterId: 1, count: 3},
            ]},
        '01': { count: 2, clusters: [
            {clusterId: 1, count: 2},
            ]},
        '1': { count: 6, clusters: [
            {clusterId: 1, count: 2},
            {clusterId: 2, count: 4},
            ]},
        '20': { count: 10, clusters: [
            {clusterId: 0, count: 2},
            {clusterId: 1, count: 2},
            {clusterId: 2, count: 3},
            {clusterId: 3, count: 3},
            ]},
        '21': { count: 4, clusters: [
            {clusterId: 2, count: 2},
            {clusterId: 3, count: 2},
            ]},
    };
    
    const testTreeWithClusterMap = {
        name: 'root',
        clusters: { count: 27, clusters: { 0: 4, 1: 9, 2: 9, 3: 5} },
        children: [
            {
                name: '0',
                clusters: { count: 7, clusters: { 0: 2, 1: 5 } },
                children: [
                    {
                        name: '00',
                        clusters: { count: 5, clusters: { 0: 2, 1: 3 } },
                    },
                    {
                        name: '01',
                        clusters: { count: 2, clusters: { 1: 2 } },
                    },
                ]
            },
            {
                name: '1',
                clusters: { count: 6, clusters: { 1: 2, 2: 4 } },
            },
            {
                name: '2',
                clusters: { count: 14, clusters: { 0: 2, 1: 2, 2: 5, 3: 5} },
                children: [
                    {
                        name: '20',
                        clusters: { count: 10, clusters: { 0: 2, 1: 2, 2: 3, 3: 3 } },
                    },
                    {
                        name: '21',
                        clusters: { count: 4, clusters: { 2: 2, 3: 2 } },
                    },
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
    
    setParents(testTreeWithClusterMap);
    

    describe('_aggregateClusters', () => {
        it('should aggregate clusters from leaf nodes to root', () => {
            const result = newick.parse(newick1)
                .then(tree => _aggregateClusters(tree, clustersPerSpecies))
                .then(tree => {
                    treeUtils.visitTreeDepthFirst(tree, node => {
                        node.clusters.clusters = _.fromPairs(Array.from(node.clusters.clusters));
                    })
                   return tree; 
                });
            return expect(result).to.eventually.deep.eq(testTreeWithClusterMap);
        })
    })

    describe('_sortAndLimitClusters', () => {
        it('should sort and limit clusters with a rest element for fraction limit', () => {
            const clusterMap = new Map([[0,100], [1,11], [2,22], [3,33]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {count: totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.9);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [
                    { clusterId: 0, count: 100 },
                    { clusterId: 3, count: 33 },
                    { clusterId: 'rest', count: 33 },
                ],
                rest: [{ clusterId: 2, count: 22 }, { clusterId: 1, count: 11 }],
            });
        })
        
        it('should only have a rest element if low enough fraction', () => {
            const clusterMap = new Map([[0,100], [1,11], [2,22], [3,33]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {count: totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.1);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [{ clusterId: 'rest', count: totCount }],
                rest: [
                    { clusterId: 0, count: 100 },
                    { clusterId: 3, count: 33 },
                    { clusterId: 2, count: 22 },
                    { clusterId: 1, count: 11 },
                ],
            });
        })
        
        it('should have no rest element for fraction 1.0', () => {
            const clusterMap = new Map([[0,100], [1,11], [2,22], [3,33]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {count: totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 1.0);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [
                    { clusterId: 0, count: 100 },
                    { clusterId: 3, count: 33 },
                    { clusterId: 2, count: 22 },
                    { clusterId: 1, count: 11 },
                ],
            });
        })
    })
    
    describe('aggregateSortAndLimitClusters', () => {
        it('should aggregate clusters sorted and grouped on limit', () => {
            // TODO: Should clone testTreeWithClusterMap first!
            treeUtils.visitTreeDepthFirst(testTreeWithClusterMap, (node) => {
                const {clusters} = node.clusters;
                const clusterMap = new Map(_(clusters).toPairs().map(([id,count]) => [+id,count]).value());
                node.clusters.clusters = clusterMap;
                node.clusters = _sortAndLimitClusters(node.clusters, 0.9);
            });
            const result = newick.parse(newick1)
                .then(tree => geoTreeUtils.aggregateSortAndLimitClusters(tree, clustersPerSpecies, 0.9));
            return expect(result).to.eventually.deep.eq(testTreeWithClusterMap);
        })
    })
})
