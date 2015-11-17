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

export function getBioregions(bins) {
  let clusters = new Map();
  bins.forEach(bin => {
    const {clusterId, x1, x2, y1, y2, count, speciesCount} = bin;
    let polygons = clusters.get(clusterId);
    if (!polygons) {
      polygons = [];
      clusters.set(clusterId, polygons);
    }
    polygons.push(turfPolygon([[
      [x1, y1],
      [x1, y2],
      [x2, y2],
      [x2, y1],
      [x1, y1],
    ]], {clusterId, recordsCount: count, speciesCount}));
  });

  let clusterFeatures = [];
  // let mapIter = clusters[Symbol.iterator]();
  // console.log("First [clusterId, polygons]:", mapIter.next().value);
  for (let [clusterId, polygons] of clusters) {
    // Map polygon coordinates to a geoJSON Polygon feature
    // let feature = polygons.map(turfPolygon);
    // console.log("clusterId:", clusterId, "polygons:", polygons);
    // let features = polygons.map(polygon => turfPolygon([polygon], { clusterId }));
    // console.log(" -> features:", features);
    // if (features.length > 1) {
    //   console.log(" => MERGE...");
    //   let collection = turfFeaturecollection(features);
    //   console.log("  turfFeaturecollection(features):", collection);
    //   let mergedPolygon = turfMerge(collection);
    //   console.log("  => Merged polygon:", mergedPolygon);
    //   // console.log("Merged polygon - union:", turfUnion());
    //   clusterFeatures.push(mergedPolygon);
    // }
    polygons.forEach(polygon => {
      clusterFeatures.push(polygon);
    });
  }
  // console.log("=========== ALL MERGE DONE! ==========");
  console.log("Warning: Skip merge now due to jsts TopologyError: side location conflict");
  console.log("Check npm:2d-polygon-boolean instead");
  let clusterFeatureCollection = turfFeaturecollection(clusterFeatures);
  console.log("clusterFeatureCollection:", clusterFeatureCollection);
  return clusterFeatureCollection;
}
