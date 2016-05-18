/* eslint-disable camelcase */
import { expect } from 'chai'
import geoTreeUtils, {
    _aggregateClusters,
    _sortAndLimitClusters,
    _denseAreaProbsToSparseClusters,
} from '../geoTreeUtils'
import treeUtils from '../../treeUtils'
import newick from '../newick'
import { reduceLimitRest } from '../../statistics'
import _ from 'lodash'

describe('geoTreeUtils', () => {
    
    let newick1, clustersPerSpecies, clustersPerSpeciesLimited,
        testTreeWithClusters, testTreeWithResetClusters, newickWithAreaProbs, treeWithAreaProbs;
    
    before(() => {
        newick1 = '((00,01)0,1,(20,21)2)root;';
        clustersPerSpecies = {
            '00': { totCount: 5, clusters: [
                {clusterId: 1, count: 3},
                {clusterId: 0, count: 2},
            ]},
            '01': { totCount: 2, clusters: [
                {clusterId: 1, count: 2},
            ]},
            '1': { totCount: 6, clusters: [
                {clusterId: 2, count: 4},
                {clusterId: 1, count: 2},
            ]},
            '20': { totCount: 12, clusters: [
                {clusterId: 2, count: 3},
                {clusterId: 3, count: 3},
                {clusterId: 0, count: 2},
                {clusterId: 1, count: 2},
                {clusterId: 4, count: 1},
                {clusterId: 5, count: 1},
            ]},
            '21': { totCount: 4, clusters: [
                {clusterId: 2, count: 2},
                {clusterId: 3, count: 2},
            ]},
        };
    
        testTreeWithClusters = {
            name: 'root',
            clusters: { totCount: 29, clusters: [
                { clusterId: 1, count: 9},
                { clusterId: 2, count: 9},
                { clusterId: 3, count: 5},
                { clusterId: 0, count: 4},
                { clusterId: 4, count: 1},
                { clusterId: 5, count: 1},
            ] },
            children: [
                {
                    name: '0',
                    clusters: { totCount: 7, clusters: [
                        { clusterId: 1, count: 5},
                        { clusterId: 0, count: 2},
                    ] },
                    children: [
                        {
                            name: '00',
                            clusters: { totCount: 5, clusters: [
                                { clusterId: 1, count: 3},
                                { clusterId: 0, count: 2},
                            ] },
                        },
                        {
                            name: '01',
                            clusters: { totCount: 2, clusters: [
                                { clusterId: 1, count: 2},
                            ] },
                        },
                    ]
                },
                {
                    name: '1',
                    clusters: { totCount: 6, clusters: [
                        { clusterId: 2, count: 4},
                        { clusterId: 1, count: 2},
                    ] },
                },
                {
                    name: '2',
                    clusters: { totCount: 16, clusters: [
                        { clusterId: 2, count: 5},
                        { clusterId: 3, count: 5},
                        { clusterId: 0, count: 2},
                        { clusterId: 1, count: 2},
                        { clusterId: 4, count: 1},
                        { clusterId: 5, count: 1},
                    ] },
                    children: [
                        {
                            name: '20',
                            clusters: { totCount: 12, clusters: [
                                { clusterId: 2, count: 3},
                                { clusterId: 3, count: 3},
                                { clusterId: 0, count: 2},
                                { clusterId: 1, count: 2},
                                { clusterId: 4, count: 1},
                                { clusterId: 5, count: 1},
                            ] },
                        },
                        {
                            name: '21',
                            clusters: { totCount: 4, clusters: [
                                { clusterId: 2, count: 2},
                                { clusterId: 3, count: 2},
                            ] },
                        },
                    ]
                },
            ]
        };
        
        treeUtils.setParents(testTreeWithClusters);
    
        testTreeWithResetClusters = {
            name: 'root',
            clusters: { totCount: 0, clusters: [] },
            children: [
                {
                    name: '0',
                    clusters: { totCount: 0, clusters: [] },
                    children: [
                        {
                            name: '00',
                            clusters: { totCount: 0, clusters: [] },
                        },
                        {
                            name: '01',
                            clusters: { totCount: 0, clusters: [] },
                        },
                    ]
                },
                {
                    name: '1',
                    clusters: { totCount: 0, clusters: [] },
                },
                {
                    name: '2',
                    clusters: { totCount: 0, clusters: [] },
                    children: [
                        {
                            name: '20',
                            clusters: { totCount: 0, clusters: [] },
                        },
                        {
                            name: '21',
                            clusters: { totCount: 0, clusters: [] },
                        },
                    ]
                },
            ]
        };
        
        treeUtils.setParents(testTreeWithResetClusters);
        
        clustersPerSpeciesLimited = _(clustersPerSpecies)
            .map((originalClusters, nodeName) => {
                const clusters = _.cloneDeep(originalClusters);
                const { totCount } = clusters;
                clusters.clusters = reduceLimitRest(
                    0,
                    (sum, {count}) => sum + count,
                    (sum, {count}) => count / totCount > 0.1 || sum / totCount < 0.1,
                    (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                    clusters.clusters);
                return [nodeName, clusters];
            })
            .fromPairs()
            .value();
        expect(clustersPerSpeciesLimited).to.deep.equal({
            '00': { totCount: 5, clusters: [
                {clusterId: 1, count: 3},
                {clusterId: 0, count: 2},
            ]},
            '01': { totCount: 2, clusters: [
                {clusterId: 1, count: 2},
            ]},
            '1': { totCount: 6, clusters: [
                {clusterId: 2, count: 4},
                {clusterId: 1, count: 2},
            ]},
            '20': { totCount: 12, clusters: [
                {clusterId: 2, count: 3},
                {clusterId: 3, count: 3},
                {clusterId: 0, count: 2},
                {clusterId: 1, count: 2},
                {clusterId: 'rest', count: 2, rest: [
                    {clusterId: 4, count: 1},
                    {clusterId: 5, count: 1},
                ]},
            ]},
            '21': { totCount: 4, clusters: [
                {clusterId: 2, count: 2},
                {clusterId: 3, count: 2},
            ]},
        });
        
        newickWithAreaProbs = '((00[&area_pp={1,0,1}],01[&area_pp={0,0,1}])0[&area_pp={.5,0,1}],1[&area_pp={0,1,0.1}],(20[&area_pp={0,0,1}],21[&area_pp={0,0,1}])2[&area_pp={0,0,1}])root[&area_pp={1,.8,1}];';
        
        treeWithAreaProbs = {
            name: 'root',
            clusters: { totCount: 2.8, clusters: [
                { clusterId: 0, count: 1},
                { clusterId: 2, count: 1},
                { clusterId: 1, count: 0.8},
            ] },
            children: [
                {
                    name: '0',
                    clusters: { totCount: 1.5, clusters: [
                        { clusterId: 2, count: 1},
                        { clusterId: 0, count: 0.5},
                    ] },
                    children: [
                        {
                            name: '00',
                            clusters: { totCount: 2, clusters: [
                                { clusterId: 0, count: 1},
                                { clusterId: 2, count: 1},
                            ] },
                        },
                        {
                            name: '01',
                            clusters: { totCount: 1, clusters: [
                                { clusterId: 2, count: 1},
                            ] },
                        },
                    ]
                },
                {
                    name: '1',
                    clusters: { totCount: 1.1, clusters: [
                        { clusterId: 1, count: 1},
                        { clusterId: 2, count: 0.1},
                    ] },
                },
                {
                    name: '2',
                    clusters: { totCount: 1, clusters: [
                        { clusterId: 2, count: 1},
                    ] },
                    children: [
                        {
                            name: '20',
                            clusters: { totCount: 1, clusters: [
                                { clusterId: 2, count: 1},
                            ] },
                        },
                        {
                            name: '21',
                            clusters: { totCount: 1, clusters: [
                                { clusterId: 2, count: 1},
                            ] },
                        },
                    ]
                },
            ]
        };
    })

    describe('_aggregateClusters', () => {
        it('should aggregate clusters from leaf nodes to root', () => {
            const result = newick.parse(newick1)
                .then(tree => _aggregateClusters(tree, clustersPerSpecies))
                .then(tree => {
                    treeUtils.visitTreeDepthFirst(tree, node => {
                        node.clusters.clusters = _(Array.from(node.clusters.clusters))
                            .map(([clusterId, count]) => { return {clusterId, count} })
                            .reverse()
                            .sortBy(({count}) => count)
                            .reverse()
                            .value();
                    })
                   return tree;
                });
            return expect(result).to.eventually.deep.eq(testTreeWithClusters);
        })
        
        it('should aggregate clusters with rest limit', () => {
            const result = newick.parse(newick1)
                .then(tree => _aggregateClusters(tree, clustersPerSpeciesLimited))
                .then(tree => {
                    treeUtils.visitTreeDepthFirst(tree, node => {
                        node.clusters.clusters = _(Array.from(node.clusters.clusters))
                            .map(([clusterId, count]) => { return {clusterId, count} })
                            .reverse()
                            .sortBy(({count}) => count)
                            .reverse()
                            .value();
                    })
                   return tree; 
                });
            return expect(result).to.eventually.deep.eq(testTreeWithClusters);
        })
    })

    describe('_sortAndLimitClusters', () => {
        it('should sort and limit clusters with a rest element for fraction limit', () => {
            const clusterMap = new Map([[0,100], [1,11], [2,22], [3,33]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.8);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [
                    { clusterId: 0, count: 100 },
                    { clusterId: 'rest', count: 66, rest: [
                        { clusterId: 3, count: 33 },
                        { clusterId: 2, count: 22 },
                        { clusterId: 1, count: 11 },
                    ]},
                ],
            });
        })
        
        it('should keep at least one item even if below fraction threshold', () => {
            const clusterMap = new Map([[0,10], [1,11], [2,12], [3,13]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.3);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [
                    { clusterId: 3, count: 13 },
                    { clusterId: 'rest', count: 33, rest: [
                        { clusterId: 2, count: 12 },
                        { clusterId: 1, count: 11 },
                        { clusterId: 0, count: 10 },
                    ]},
                ],
            });
        })
        
        it('should keep at least one item even if exactly on fraction threshold', () => {
            const clusterMap = new Map([[16,2], [5,7], [0,1]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.7);
            return expect(result).to.deep.eq({
                totCount,
                clusters: [
                    { clusterId: 5, count: 7 },
                    { clusterId: 'rest', count: 3, rest: [
                        { clusterId: 16, count: 2 },
                        { clusterId: 0, count: 1 },
                    ]},
                ],
            });
        })
        
        it('should have no rest element for zero threshold', () => {
            const clusterMap = new Map([[0,100], [1,11], [2,22], [3,33]]);
            const totCount = _.sumBy(Array.from(clusterMap), v => v[1]);
            const clusters = {totCount, clusters: clusterMap};
            const result = _sortAndLimitClusters(clusters, 0.0);
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
    
    describe('aggregateClusters', () => {
        it('should aggregate clusters sorted and grouped on limit', () => {
            // // TODO: Should clone testTreeWithClusters first!
            // treeUtils.visitTreeDepthFirst(testTreeWithClusters, (node) => {
            //     const {clusters} = node.clusters;
            //     const clusterMap = new Map(_(clusters).toPairs().map(([id,count]) => [+id,count]).value());
            //     node.clusters.clusters = clusterMap;
            //     node.clusters = _sortAndLimitClusters(node.clusters, 0.9);
            // });
            const result = newick.parse(newick1)
                .then(tree => geoTreeUtils.aggregateClusters(tree, clustersPerSpeciesLimited, 0.01));
            return expect(result).to.eventually.deep.eq(testTreeWithClusters);
        })
    })
    
    describe('_denseAreaProbsToSparseClusters', () => {
        it('should extract sparse clusters structure', () => {
            const clusters = _denseAreaProbsToSparseClusters([0, 1, 0.3], 0.1);
            expect(clusters).to.deep.eq({
                totCount: 1.3,
                clusters: [{clusterId: 1, count: 1}, {clusterId: 2, count: 0.3}],
            });
        })
    })
    
    describe('reconstructAncestralAreas', () => {
        it('should transform dense area probabilities to sparse limited clusters', () => {
            
            const result = newick.parse(newickWithAreaProbs)
                .then(tree => geoTreeUtils.reconstructAncestralAreas(tree, 0.01));
            return expect(result).to.eventually.deep.eq(treeWithAreaProbs);
        })
    })
    
    describe('resetClusters', () => {
        it('should reset aggregate clusters', () => {
            const result = newick.parse(newick1)
                .then(tree => geoTreeUtils.aggregateClusters(tree, clustersPerSpeciesLimited, 0.01))
                .then(tree => geoTreeUtils.resetClusters(tree));
            return expect(result).to.eventually.deep.eq(testTreeWithResetClusters);
        })
    })
    
    describe('aggregateSpeciesCount', () => {
        it('should aggregate species count', () => {
            const species = { a: 5, b: 2, d: 3 };
            const result = newick.parse('(((a,b),c),(d));')
                .then(tree => geoTreeUtils.aggregateSpeciesCount(tree, species))
                .then(_.partial(newick.write, {
                    getBranchLength: ({speciesCount}) => speciesCount
                }));
            return expect(result).to.eventually.eq('(((a:1,b:1):2,c:0):2,(d:1):1):3;');
        })
        it('should aggregate species occurrence count', () => {
            const species = { a: 5, b: 2, d: 3 };
            const result = newick.parse('(((a,b),c),(d));')
                .then(tree => geoTreeUtils.aggregateSpeciesCount(tree, species))
                .then(_.partial(newick.write, {
                    getBranchLength: ({occurrenceCount}) => occurrenceCount
                }));
            return expect(result).to.eventually.eq('(((a:5,b:2):7,c:0):7,(d:3):3):10;');
        })
    })
})
