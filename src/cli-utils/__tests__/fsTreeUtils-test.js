import '../../__tests__/testHelper'
import { expect } from 'chai'
import fs from 'fs-promise'
import fsTreeUtils from '../fsTreeUtils'

describe('cli-utils', () => {
  const speciesSample = `name,geo
A,0
A,1
B,1
D,1
D,2
D,3`;
  const treeSample = '((A,B),C,(D,E));';
  
  describe('fsTreeUtils', () => {
    
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
          numNodes: 8,
          numLeafNodes: 5,
        });
      })
    })
  })
})