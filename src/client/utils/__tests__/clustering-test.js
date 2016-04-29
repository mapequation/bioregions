import { expect } from 'chai'
import { aggregateSmallClusters } from '../clustering'

describe('clustering', () => {
    
    describe('aggregateSmallClusters', () => {
        it('should aggregate small clusters', () => {
            const result = aggregateSmallClusters(0.7, 10, [
                { clusterId: 0, count: 7 },
                { clusterId: 4, count: 2 },
                { clusterId: 2, count: 1 },
            ]);
            expect(result).to.deep.eq([
                { clusterId: 0, count: 7 },
                { clusterId: 'rest', count: 3, rest: [
                    { clusterId: 4, count: 2 },
                    { clusterId: 2, count: 1 },
                ] },
            ]);
        })
        
        it('should work without providing total count', () => {
            const result = aggregateSmallClusters(0.7, [
                { clusterId: 0, count: 1 },
                { clusterId: 4, count: 1 },
                { clusterId: 2, count: 1 },
            ]);
            expect(result).to.deep.eq([
                { clusterId: 0, count: 1 },
                { clusterId: 4, count: 1 },
                { clusterId: 2, count: 1 },
            ]);
        })
    })
    
})