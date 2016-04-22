import '../../__tests__/testHelper'
import { expect } from 'chai'
import fs from 'fs-promise'
import fsTreeUtils from '../fsTreeUtils'
import { printTree } from '../../client/utils/phylogeny'

describe('cli-utils', () => {
  const speciesSample = `name,geo
Sp A,0
Sp A,1
Sp B,1
Sp D,1
Sp D,2
Sp D,3`;
  const treeSample = '((Sp_a,Sp_b),Sp_c,(Sp_d,Sp_e));';

  describe('fsTreeUtils', () => {

    before(() => {
        return Promise.all([
          fs.writeFile('tmptree', treeSample),
          fs.writeFile('tmpspecies', speciesSample),
        ]);
    });

    after(() => {
      return Promise.all([
          fs.unlink('tmptree'),
          fs.unlink('tmpspecies'),
          fs.unlink('tmpresult').catch(() => {}), // Avoid Error: ENOENT: no such file...
      ]);
    })

    describe('countNodes', () => {
      it('should count nodes and leaf nodes', () => {
        const res = fsTreeUtils.countNodes('tmptree');
        return expect(res).to.eventually.deep.eq({
          numTreeNodes: 8,
          numTreeSpecies: 5,
        });
      })
    })

    describe('countIntersection', () => {
      it('should count intersection between species tree and species geo records', () => {
        const res = fsTreeUtils.countIntersection('tmptree', 'tmpspecies', 'name');
        return expect(res).to.eventually.deep.eq({
          numTreeSpecies: 5,
          numGeoSpecies: 3,
          numCommonSpecies: 3,
        });
      })
    })

    describe('normalizeNames', () => {
      it('should normalize names', () => {
        const res = fsTreeUtils.normalizeNames('tmptree','tmpresult')
          .then(fsTreeUtils.readTree)
          .then(printTree)
        return expect(res).to.eventually.eq('((Sp a,Sp b),Sp c,(Sp d,Sp e));');
      })
    })
  })
})