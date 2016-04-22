import { expect } from 'chai'
// import sinon from 'sinon'
import fsTreeUtils from '../fsTreeUtils'
import fsUtils from '../fsUtils'
import fs from 'fs-promise'

describe('cli-utils', () => {
  const speciesSample = `name,geo
A,0
A,1
B,1
D,1
D,2
D,3`;
  const treeSample = '((A,B),C,(D,E));';
  
  describe('treeUtils', () => {       
    
    before(() => {
      console.log('Creating temporary files...');
        return Promise.all([
          fs.writeFile('tmptree', treeSample),
          fs.writeFile('tmpspecies', speciesSample),
        ]);
    });
    
    after(() => {
      console.log('Removing temporary files...');
      return Promise.all([
          fs.unlink('tmptree'),
          fs.unlink('tmpspecies'),        
      ]);
    })
    
    describe('countNodes', () => {
      it('should count nodes and leaf nodes', () => {
        const res = fsTreeUtils.countNodes('tmptree');
        return expect(res).to.eventually.deep.eq({
          numNodes: 9,
          numLeafNodes: 5,
        });
      })
    })
  })
})