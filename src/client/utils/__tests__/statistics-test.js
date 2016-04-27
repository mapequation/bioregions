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
        
        it('should limit array with a rest sum break even', () => {
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
                sum => sum <= 0,
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
    })

})
