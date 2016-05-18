/* eslint-disable camelcase */
import { expect } from 'chai'
import * as statistics from '../statistics'
import _ from 'lodash'

describe('statistics', () => {
    const items = [
        { clusterId: 2, count: 5},
        { clusterId: 1, count: 3},
        { clusterId: 3, count: 2},
        { clusterId: 0, count: 1},
        { clusterId: 4, count: 1},
    ];
    const totCount = _.sumBy(items, ({count}) => count);

    describe('aggregateFromRight', () => {
        it('should aggregate from right', () => {
            const res = statistics.aggregateFromRight(
                item => item.count < 3,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 2, count: 5},
                { clusterId: 1, count: 3},
                { clusterId: 'rest', rest: [
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should return same if no rest', () => {
            const res = statistics.aggregateFromRight(
                item => item.count < 1,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
            return expect(res).to.eq(items);
        })
        
        it('should return all in rest', () => {
            const res = statistics.aggregateFromRight(
                item => item.count < 10,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 'rest', rest: [
                    { clusterId: 2, count: 5},
                    { clusterId: 1, count: 3},
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
    })

    describe('limitRest', () => {
        it('should limit array with a rest', () => {
            const res = statistics.limitRest(
                item => item.count > 2,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 2, count: 5},
                { clusterId: 1, count: 3},
                { clusterId: 'rest', rest: [
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should return same if no rest', () => {
            const res = statistics.limitRest(
                item => true,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
            return expect(res).to.eq(items);
        })
        
        it('should return all in rest', () => {
            const res = statistics.limitRest(
                item => item.count > 10,
                restItems => { return { clusterId: 'rest', rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 'rest', rest: [
                    { clusterId: 2, count: 5},
                    { clusterId: 1, count: 3},
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should not create a rest item for a single item', () => {
            const res = statistics.limitRest(
                item => item !== 4,
                restItems => `${restItems.length} rest items`,
                [0,1,2,3,4]
            );
            return expect(res).to.deep.eq([0,1,2,3,4]);
        })
    })

    describe('reduceLimitRest', () => {
        it('should limit array with a rest sum', () => {
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                sum => sum < 10,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 2, count: 5},
                { clusterId: 1, count: 3},
                { clusterId: 'rest', count: 4, rest: [
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should limit array with a rest sum including limit', () => {
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                sum => sum <= 10,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 2, count: 5},
                { clusterId: 1, count: 3},
                { clusterId: 3, count: 2},
                { clusterId: 'rest', count: 2, rest: [
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should return all in rest with sum', () => {
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                sum => false,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 'rest', count: totCount, rest: [
                    { clusterId: 2, count: 5},
                    { clusterId: 1, count: 3},
                    { clusterId: 3, count: 2},
                    { clusterId: 0, count: 1},
                    { clusterId: 4, count: 1},
                ]},
            ]);
        })
        
        it('should return no rest for fraction limit threshold on one item', () => {
            const items = [{ clusterId: 2, count: 5}];
            const totCount = _.sumBy(items, ({count}) => count);
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                (sum, {count}) => count / totCount > 0.1,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 2, count: 5},
            ]);
        })
        
        it('should return all in rest if individual threshold too high', () => {
            const items = [
                { clusterId: 1, count: 2},
                { clusterId: 2, count: 2},
                { clusterId: 3, count: 2},
                { clusterId: 4, count: 2},
                { clusterId: 5, count: 2},
            ];
            const totCount = _.sumBy(items, ({count}) => count);
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                (sum, {count}) => count / totCount > 0.25,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 'rest', count: totCount, rest: [
                    { clusterId: 1, count: 2},
                    { clusterId: 2, count: 2},
                    { clusterId: 3, count: 2},
                    { clusterId: 4, count: 2},
                    { clusterId: 5, count: 2},
                ]},
            ]);
        })
        
        it('should fix above by adding total threshold', () => {
            const items = [
                { clusterId: 1, count: 2},
                { clusterId: 2, count: 2},
                { clusterId: 3, count: 2},
                { clusterId: 4, count: 2},
                { clusterId: 5, count: 2},
            ];
            const totCount = _.sumBy(items, ({count}) => count);
            const res = statistics.reduceLimitRest(
                0,
                (sum, {count}) => sum + count,
                (sum, {count}) => count / totCount > 0.25 || sum / totCount < 0.25,
                (sum, restItems) => { return { clusterId: 'rest', count: totCount - sum, rest: restItems }; },
                items
            );
            return expect(res).to.deep.eq([
                { clusterId: 1, count: 2},
                { clusterId: 'rest', count: totCount - 2, rest: [
                    { clusterId: 2, count: 2},
                    { clusterId: 3, count: 2},
                    { clusterId: 4, count: 2},
                    { clusterId: 5, count: 2},
                ]},
            ]);
        })
        
        it('should not create a rest item for a single item', () => {
            const res = statistics.reduceLimitRest(
                0,
                (sum, n) => sum + n,
                (sum, n) => n > 0,
                (sum, restItems) => `${restItems.length} reduced rest items`,
                [3,2,1,0]
            );
            return expect(res).to.deep.eq([3,2,1,0]);
        })
    })
    
    describe('forEachLimited', () => {
        let limitedItems = [];
        before(() => {
            limitedItems = statistics.limitRest(
                item => item.count > 2,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
        })
        
        it('should loop over all items in a limited array', () => {
            const res = [];
            statistics.forEachLimited('rest', limitedItems, (item) => {
                res.push(item);
            })
            expect(res).to.deep.eq(items);
        })
        
        it('should loop over all items in an unlimited array', () => {
            const res = [];
            statistics.forEachLimited('rest', items, (item) => {
                res.push(item);
            })
            expect(res).to.deep.eq(items);
        })
    })
    
    describe('mapLimited', () => {
        let limitedItems = [];
        before(() => {
            limitedItems = statistics.limitRest(
                item => item.count > 2,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
        })
        
        it('should map all items in a limited array', () => {
            const res = statistics.mapLimited('rest', limitedItems, item => item.clusterId);
            expect(res).to.deep.eq(items.map(item => item.clusterId));
        })
        
        it('should map all items in an unlimited array', () => {
            const res = statistics.mapLimited('rest', items, item => item.clusterId);
            expect(res).to.deep.eq(items.map(item => item.clusterId));
        })
    })
    
    describe('unrollRest', () => {
        let limitedItems = [];
        before(() => {
            limitedItems = statistics.limitRest(
                item => item.count > 2,
                restItems => { return { clusterId: 'rest', rest: restItems } },
                items
            );
        })
        
        it('should unroll a limited array', () => {
            const res = statistics.unrollRest('rest', limitedItems);
            expect(res).to.deep.eq(items);
        })
        
        it('should return the same items if no rest', () => {
            const res = statistics.unrollRest('rest', items);
            expect(res).to.eq(items);
        })
    })

})
