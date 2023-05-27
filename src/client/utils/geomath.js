import * as d3 from 'd3';
// Distances in km of one degree lat/long
const longDegreeAtEquator = 111.321;
const longDegreeAtPole = 0;
const latDegreeAtEquator = 110.567;
const latDegreeAtPole = 111.699;

// WGS84 spheroid, https://gis.stackexchange.com/questions/75528/understanding-terms-in-length-of-degree-formula
const m1 = 111132.95255; // latitude calculation term 1
const m2 = -559.84957; // latitude calculation term 2
const m3 = 1.17514; // latitude calculation term 3
const m4 = -0.00230; // latitude calculation term 4
const p1 = 111412.87733; // longitude calculation term 1
const p2 = -93.50412; // longitude calculation term 2
const p3 = 0.11774; // longitude calculation term 3
// const p4 = -0.000165;

const longDistancePerAbsoluteDegree = d3.scaleLinear()
.domain([0, 90]).range([longDegreeAtEquator, longDegreeAtPole]);

const latDistancePerAbsoluteDegree = d3.scaleLinear()
  .domain([0, 90]).range([latDegreeAtEquator, latDegreeAtPole]);

const longDistancePerDegree = (lat) => longDistancePerAbsoluteDegree(Math.abs(lat));

const latDistancePerDegree = (lat) => latDistancePerAbsoluteDegree(Math.abs(lat));

const getValidLonLat = (bbox) => [
  Math.max(-180, bbox[0]),
  Math.max(-90, bbox[1]),
  Math.min(180, bbox[2]),
  Math.min(90, bbox[3]),
];

/**
 * Linearised area approximation
 * @param {Array} bbox 
 */
function areaLinear(bbox) {
  const [lon1, lat1, lon2, lat2] = getValidLonLat(bbox);
  // const topDistancePerDegree = longDistancePerDegree(lat2);
  // const bottomDistanceDegree = longDistancePerDegree(lat1);
  // const lonLengthPerDegree = (topDistancePerDegree + bottomDistanceDegree) / 2;
  const lonLengthPerDegree = longDistancePerDegree((lat2 + lat1) / 2);
  const latLengthPerDegree = latDistancePerDegree((lat2 + lat1) / 2);

  const deltaLon = lon2 - lon1;
  const deltaLat = lat2 - lat1;
  const width = deltaLon * lonLengthPerDegree;
  const height = deltaLat * latLengthPerDegree;
  // console.log(`LINEAR Area from (${lon1},${lat1}) to (${lon2},${lat2}) of size ${deltaLon}*${deltaLat}˚ times ${lonLengthPerDegree}*${latLengthPerDegree}km^2/˚ -> ${width}*${height} =`, width * height);
  return width * height;
}

function areaSpherical(bbox) {
  const [lon1, lat1, lon2, lat2] = getValidLonLat(bbox);
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const R = 6378;
  const a = (Math.PI / 180) * R * R * Math.abs(Math.sin(lat1Rad) - Math.sin(lat2Rad)) * Math.abs(lon1 - lon2);
  return a;
}

/**
 * Calculate area based on length per degree on WGS84 spheroid
 * @param {Array} bbox [lon1, lat1, lon2, lat2]
 */
function areaSpheroid(bbox) {
  const [lon1, lat1, lon2, lat2] = getValidLonLat(bbox);

  const lat = (lat1 + lat2) / 2;
  const rLat = lat * Math.PI / 180;

  // Calculate the length of a degree of latitude and longitude in meters
  const latLengthPerDegree = m1 + (m2 * Math.cos(2 * rLat)) + (m3 * Math.cos(4 * rLat)) + (m4 * Math.cos(6 * rLat));
  const lonLengthPerDegree = (p1 * Math.cos(rLat)) + (p2 * Math.cos(3 * rLat)) + (p3 * Math.cos(5 * rLat));

  const deltaLon = lon2 - lon1;
  const deltaLat = lat2 - lat1;
  const width = deltaLon * lonLengthPerDegree / 1000;
  const height = deltaLat * latLengthPerDegree / 1000;
  // console.log(`SPHEROID Area from (${lon1},${lat1}) to (${lon2},${lat2}) of size ${deltaLon}*${deltaLat}˚ times ${lonLengthPerDegree}*${latLengthPerDegree}km^2/˚ -> ${width}*${height} =`, width * height);
  return width * height;
}

/**
 * Calculate approximate earth surface area in square km of a bounding box in longitude and latitude
 * @param {Array} bbox [lon1, lat1, lon2, lat2]
 */
export function area(bbox) {
  return areaSpheroid(bbox);
}

// function compare(bbox) {
//   console.log(bbox, '->', areaLinear(bbox), 'vs', areaSpherical(bbox), 'vs', areaSpheroid(bbox));
// }
// console.log('*'.repeat(200));
// compare([-122.1178620, 37.3565410, -122.0446720, 37.4698870]);
// compare([0, 0, 1, 1]);
// compare([0, 45, 1, 46]);
// compare([0, 75, 1, 76]);
// compare([0, 89, 1, 90]);
