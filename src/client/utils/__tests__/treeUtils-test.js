/* eslint-disable camelcase */
import { expect } from 'chai'
import newick from '../phylogeny/newick'
import treeUtils from '../treeUtils'
import { parseTree, printTree } from '../phylogeny'
import _ from 'lodash'

describe('treeUtils', () => {
  const newickTree = '((00,01)0,1,(20,21)2)root;';
  let tree = null;
  
  const newickInput = '((A,B),C,(D,E));';
  const speciesCounts = {
    A: 10,
    C: 4,
    D: 3,
    E: 2,
  };
  const getLeafCount = ({name}) => speciesCounts[name];
  
  before(() => {
      return parseTree(newickTree).then(data => {
          tree = data;
      })
  });
  
  describe('visitTreeDepthFirst', () => {
    it('should visit in pre-order', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('root,0,00,01,1,2,20,21');
    })
    
    it('should visit in post-order', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('00,01,0,1,20,21,2,root');
    })
    
    it('should exit early', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '1';
      })
      expect(names.join(',')).to.eq('root,0,00,01,1');
    })
    
    it('should exit earlier', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('root,0,00');
    })
    
    it('should exit early post', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
          return node.name === '1';
      })
      expect(names.join(',')).to.eq('00,01,0,1');
    })
    
    it('should exit earlier post', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('00');
    })
    
    it('should include all but one node', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst({
        include: (node) => node.name !== '0'
      }, tree, node => {
        names.push(node.name);
      });
      expect(names.join(',')).to.eq('root,00,01,1,2,20,21');
    })
    
    it('should include only non-leaf nodes', () => {
      const names = [];
      treeUtils.visitTreeDepthFirst({
        include: (node) => node.children
      }, tree, node => {
        names.push(node.name);
      });
      expect(names.join(',')).to.eq('root,0,2');
    })
    
    it('should provide depth for nodes', () => {
      const namesAndDepth = [];
      treeUtils.visitTreeDepthFirst(tree, ({name}, depth) => {
        namesAndDepth.push({name, depth});
      });
      expect(namesAndDepth).to.deep.eq([
        { name: 'root', depth: 0 },
        { name: '0', depth: 1 },
        { name: '00', depth: 2 },
        { name: '01', depth: 2 },
        { name: '1', depth: 1 },
        { name: '2', depth: 1 },
        { name: '20', depth: 2 },
        { name: '21', depth: 2 },
      ]);
    })
  })
  
  describe('mapDepthFirst', () => {
    it('should map depth first', () => {
      const names = treeUtils.mapDepthFirst(tree, node => node.name);
      expect(names.join(',')).to.eq('root,0,00,01,1,2,20,21');
    })
  })
  
  
  describe('visitTreeBreadthFirst', () => {
    it('should visit in breath first order', () => {
      const names = [];
      treeUtils.visitTreeBreadthFirst(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('root,0,1,2,00,01,20,21');
    })
    
    it('should exit early', () => {
      const names = [];
      treeUtils.visitTreeBreadthFirst(tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('root,0,1,2,00');
    })
    
    it('should include only specified nodes', () => {
      const names = [];
      treeUtils.visitTreeBreadthFirst({
        include: (node) => node.name !== '2'
      }, tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('root,0,1,00,01');
    })
  })
  
  describe('visitLeafNodes', () => {
    it('should visit leaf nodes in correct order', () => {
      const names = [];
      treeUtils.visitLeafNodes(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('00,01,1,20,21');
    })
  })
  
  describe('visitAncestors', () => {
    it('should visit ancestors above leaf nodes to root', () => {
      const ancestors = _.fromPairs(treeUtils.mapDepthFirst(tree, ({name}) => [name, []]));
      treeUtils.visitTreeDepthFirst(tree, node => {
        treeUtils.visitAncestors(node, ancestor => {
            ancestors[node.name].push(ancestor.name);
        });
      })
      expect(ancestors).to.deep.eq({
        root: [],
        '0': ['root'],
        '00': ['0', 'root'],
        '01': ['0', 'root'],
        '1': ['root'],
        '2': ['root'],
        '20': ['2', 'root'],
        '21': ['2', 'root'],
      });
    })
    
    it('should visit ancestors including start node', () => {
      const ancestors = _.fromPairs(treeUtils.mapDepthFirst(tree, ({name}) => [name, []]));
      treeUtils.visitTreeDepthFirst(tree, node => {
        treeUtils.visitAncestors({ includeStartNode: true }, node, ancestor => {
            ancestors[node.name].push(ancestor.name);
        });
      })
      expect(ancestors).to.deep.eq({
        root: ['root'],
        '0': ['0', 'root'],
        '00': ['00', '0', 'root'],
        '01': ['01', '0', 'root'],
        '1': ['1', 'root'],
        '2': ['2', 'root'],
        '20': ['20', '2', 'root'],
        '21': ['21', '2', 'root'],
      });
    })
  })
  
  describe('collapse', () => {
    it('should collapse tree from root', () => {
      const res = parseTree(newickTree)
        .then(treeUtils.collapse)
        .then(printTree);
      return expect(res).to.eventually.eq('root;');
    })
    
    it('should collapse tree one level deep', () => {
      const res = parseTree(newickTree)
        .then(tree => {
            tree.children.forEach(treeUtils.collapse);
            return tree;
        })
        .then(printTree);
      return expect(res).to.eventually.eq('(0,1,2)root;');
    })
  })

    describe('aggregateCount', () => {
        it('should aggregate counts on tree', () => {
            const result = newick.parse(newickInput)
                .then(tree => treeUtils.aggregateCount(tree, getLeafCount))
                .then(_.partial(newick.write, {
                    getBranchLength: ({count}) => count
                }));
            return expect(result).to.eventually.eq('((A:10,B:0):10,C:4,(D:3,E:2):5):19;');
        })
    })

    describe('clone', () => {
        it('should clone the tree', () => {
            const result = newick.parse(newickInput)
                .then(tree => treeUtils.clone(tree))
                .then(newick.write);
            return expect(result).to.eventually.eq('((A,B),C,(D,E));');
        })
    })
    
    describe('prune', () => {
        it('should clone the tree if all nodes included', () => {
            const result = newick.parse(newickInput)
                .then(tree => treeUtils.prune(tree, (node) => true))
                .then(newick.write);
            return expect(result).to.eventually.eq('((A,B),C,(D,E));');
        })
        
        it('should not include empty child array if no children included', () => {
            const result = newick.parse('((00,01)0,1,(20,21)2);')
                .then(tree => treeUtils.prune(tree, ({name}) => name !== '00' && name !== '01'))
                .then(newick.write);
            return expect(result).to.eventually.eq('(0,1,(20,21)2);');
        })
        
        it('should prune zero-count branches', () => {
            const result = newick.parse(newickInput)
                .then(tree => treeUtils.aggregateCount(tree, getLeafCount))
                .then(tree => treeUtils.prune(tree, ({count}) => count > 0))
                .then(newick.write);
            return expect(result).to.eventually.eq('((A),C,(D,E));');
        })
    })

})

