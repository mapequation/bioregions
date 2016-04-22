import '../../__tests__/testHelper'
import { expect } from 'chai'
import fs from 'fs-promise'
import fsSpeciesGeoUtils from '../fsSpeciesGeoUtils'

describe('cli-utils', () => {
  const speciesSample = `name,geo
A,0
A,1
B,1
D,1
D,2
D,3`;
  
  describe('fsSpeciesGeoUtils', () => {
    
    before(() => {
        return Promise.all([
          fs.writeFile('tmpspecies', speciesSample),
        ]);
    });
    
    after(() => {
      return Promise.all([
          fs.unlink('tmpspecies'),        
      ]);
    })
    
    describe('getSpeciesCounts', () => {
      it('should get species counts from sample file', () => {
        const res = fsSpeciesGeoUtils.getSpeciesCounts('tmpspecies', 'name');
        return expect(res).to.eventually.deep.eq({
          speciesCounts: {
            a: 2,
            b: 1,
            d: 3,
          },
          totalCount: 6,
          uniqueCount: 3,
        });
      })
      
      it('should get species counts from sample file without normalized names', () => {
        const res = fsSpeciesGeoUtils.getSpeciesCounts('tmpspecies', 'name', false);
        return expect(res).to.eventually.deep.eq({
          speciesCounts: {
            A: 2,
            B: 1,
            D: 3,
          },
          totalCount: 6,
          uniqueCount: 3,
        });
      })
    })
  })
})