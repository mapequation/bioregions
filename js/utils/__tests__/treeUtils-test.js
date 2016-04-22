/* eslint-disable camelcase */
import { expect } from 'chai'
// import sinon from 'sinon'
import { visitTreeDepthFirst, visitTreeBreadthFirst, visitLeafNodes,
    mapDepthFirst, filterDepthFirst } from '../treeUtils'
import { parseTree } from '../phylogeny'


describe('tree', () => {
  let tree = '((00,01)0,1,(20,21)2)root;';
  
  before(() => {
      return parseTree(tree).then(data => {
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
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
      }, false)
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
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '1';
      }, false)
      expect(names.join(',')).to.eq('00,01,0,1');
    })
    
    it('should exit earlier post', () => {
      const names = [];
      visitTreeDepthFirst(tree, node => {
          names.push(node.name);
          return node.name === '00';
      }, false)
      expect(names.join(',')).to.eq('00');
    })
  })
  
  describe('mapDepthFirst', () => {
    it('should map depth first', () => {
      const names = mapDepthFirst(tree, node => node.name);
      expect(names.join(',')).to.eq('root,0,00,01,1,2,20,21');
    })
  })
  
  describe('filterDepthFirst', () => {
    it('should map depth first with one omitted node', () => {
      const names = filterDepthFirst(tree, node => node.name !== '0' && node.name);
      expect(names.join(',')).to.eq('root,00,01,1,2,20,21');
    })
    
    it('should map depth first with only non-leaf nodes', () => {
      const names = filterDepthFirst(tree, node => node.children && node.name);
      expect(names.join(',')).to.eq('root,0,2');
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
})
