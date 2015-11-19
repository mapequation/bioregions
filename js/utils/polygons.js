import turfPolygon from "turf-polygon"
import turfFeaturecollection from "turf-featurecollection"

/**
* bbox has the format [xLow, yLow, xHigh, yHigh]
*/
export function bboxIntersect(a, b) {
  return !(b[0] > a[2]
    || b[2] < a[0]
    || b[3] < a[1]
    || b[1] > a[3]);

  // return (abs(a.x - b.x) * 2 < (a.width + b.width)) &&
  //        (abs(a.y - b.y) * 2 < (a.height + b.height));
}

export function clusteredBinsToCollectionOfMultiPolygons(bins) {
  let clusterFeatureMap = new Map();
  bins.forEach(bin => {
    const {clusterId, x1, x2, y1, y2, count, speciesCount} = bin;
    let clusterFeature = clusterFeatureMap.get(clusterId);
    if (!clusterFeature) {
      // Create a feature with MultiPolygon geometry for each cluster
      clusterFeature = {
        type: "Feature",
        geometry: {
          type: "MultiPolygon",
          coordinates: [] // Array of Polygon coordinate arrays
        },
        properties: {
          clusterId,
          recordsCount: count,
          speciesCount
        }
      };
      clusterFeatureMap.set(clusterId, clusterFeature);
    }
    clusterFeature.geometry.coordinates.push([[
      [x1, y1],
      [x1, y2],
      [x2, y2],
      [x2, y1],
      [x1, y1],
    ]]);
  });

  const clusterFeatureCollection = {
    type: "FeatureCollection",
    features: Array.from(clusterFeatureMap.values())
  };

  return clusterFeatureCollection;
}

export function clusteredBinsToCollectionOfPolygons(bins) {
  let features = bins.map(bin => {
    const {clusterId, x1, x2, y1, y2, count, speciesCount} = bin;
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [x1, y1],
          [x1, y2],
          [x2, y2],
          [x2, y1],
          [x1, y1],
        ]]
      },
      properties: {
        clusterId,
        recordsCount: count,
        speciesCount
      }
    }
  });

  return {
    type: "FeatureCollection",
    features
  };
}
