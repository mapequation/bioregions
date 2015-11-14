import d3 from 'd3';

function parseDSV({data, dsvType, fieldsToParse}) {

  const {Name, Latitude, Longitude} = fieldsToParse; // Contains index of corresponding field
  let parser = dsvType == "tsv" ? d3.tsv : d3.csv;
  let numSkipped = 0;

  let features = parser.parseRows(data, (row, index) => {
    // Skip header
    if (index === 0)
      return null;
    const name = row[Name];
    const lat = +row[Latitude];
    const long = +row[Longitude];
    if (name >= name && lat >= lat && long >= long) { // not undefined/NaN etc
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [long, lat]
        },
        properties: {
          name
        }
      };
    }
    ++numSkipped;
    return null;
  });

  // 135719 valid features, 3364 skipped
  console.log(`DSVWorker parsed ${features.length} valid features and skipped ${numSkipped} bad ones.`);
  postMessage({type: "result", payload: { features, numSkipped }});
}

onmessage = function(event) {
  const {type} = event.data;
  if (type === "parse")
    parseDSV(event.data);
  else
    postMessage({type: "error", message: "Unrecognised type on message to DSVWorker: " + type});
};
