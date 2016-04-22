/* eslint-disable camelcase */
import { expect } from 'chai'
// import sinon from 'sinon'
import { visitTreeDepthFirst, visitTreeBreadthFirst, visitLeafNodes,
    mapDepthFirst, filterDepthFirst, collapse } from '../treeUtils'
import { parseTree, printTree } from '../phylogeny'


describe('treeUtils', () => {
  const newickTree = '((00,01)0,1,(20,21)2)root;';
  let tree = null;
  
  before(() => {
      return parseTree(newickTree).then(data => {
          tree = data;
      })
  });
  
  describe('visitTreeDepthFirst', () => {
    it('should visit in pre-order', () => {
      const names = [];
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('root,0,00,01,1,2,20,21');
    })
    
    it('should visit in post-order', () => {
      const names = [];
      visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('00,01,0,1,20,21,2,root');
    })
    
    it('should exit early', () => {
      const names = [];
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '1';
      })
      expect(names.join(',')).to.eq('root,0,00,01,1');
    })
    
    it('should exit earlier', () => {
      const names = [];
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('root,0,00');
    })
    
    it('should exit early post', () => {
      const names = [];
      visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
          return node.name === '1';
      })
      expect(names.join(',')).to.eq('00,01,0,1');
    })
    
    it('should exit earlier post', () => {
      const names = [];
      visitTreeDepthFirst({ postOrder: true }, tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('00');
    })
    
    it('should include all but one node', () => {
      const names = [];
      visitTreeDepthFirst({
        include: (node) => node.name !== '0'
      }, tree, node => {
        names.push(node.name);
      });
      expect(names.join(',')).to.eq('root,00,01,1,2,20,21');
    })
    
    it('should include only non-leaf nodes', () => {
      const names = [];
      visitTreeDepthFirst({
        include: (node) => node.children
      }, tree, node => {
        names.push(node.name);
      });
      expect(names.join(',')).to.eq('root,0,2');
    })
  })
  
  describe('mapDepthFirst', () => {
    it('should map depth first', () => {
      const names = mapDepthFirst(tree, node => node.name);
      expect(names.join(',')).to.eq('root,0,00,01,1,2,20,21');
    })
  })
  
  
  describe('visitTreeBreadthFirst', () => {
    it('should visit in breath first order', () => {
      const names = [];
      visitTreeBreadthFirst(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('root,0,1,2,00,01,20,21');
    })
    
    it('should exit early', () => {
      const names = [];
      visitTreeBreadthFirst(tree, node => {
          names.push(node.name);
          return node.name === '00';
      })
      expect(names.join(',')).to.eq('root,0,1,2,00');
    })
    
    it('should include only specified nodes', () => {
      const names = [];
      visitTreeBreadthFirst({
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
      visitLeafNodes(tree, node => {
          names.push(node.name);
      })
      expect(names.join(',')).to.eq('00,01,1,20,21');
    })
  })
  
  describe('collapse', () => {
    it('should collapse tree from root', () => {
      const res = parseTree(newickTree)
        .then(collapse)
        .then(printTree);
      return expect(res).to.eventually.eq('root;');
    })
    
    it('should collapse tree one level deep', () => {
      const res = parseTree(newickTree)
        .then(tree => {
            tree.children.forEach(collapse);
            return tree;
        })
        .then(printTree);
      return expect(res).to.eventually.eq('(0,1,2)root;');
    })
  })
})
