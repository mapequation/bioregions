import d3 from 'd3';

function parseDSV({data, dsvType, fieldsToParse}) {

  const {Name, Latitude, Longitude} = fieldsToParse; // Contains index of corresponding field
  let parser = dsvType == "tsv" ? d3.tsv : d3.csv;
  let numSkipped = 0;
  let count = 0;

  let features = parser.parseRows(data, (row, index) => {
    // Skip header
    if (index === 0)
      return null;
    ++count;
    const name = row[Name];
    const lat = +row[Latitude];
    const long = +row[Longitude];
    if (name && lat >= lat && long >= long) { // not undefined/NaN etc
      if (count % 1000 === 0) {
        postMessage({type: "progress", payload: { count, numSkipped, activity: "Parsing rows..." }});
      }
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
  console.log(`DSVWorker parsed ${features.length} valid features and skipped ${numSkipped} bad ones.`);

  postMessage({type: "progress", payload: { count, numSkipped, activity: "Transferring result..." }});
  postMessage({type: "result", payload: { features, numSkipped }});
}

onmessage = function(event) {
  const {type} = event.data;
  if (type === "parse")
    parseDSV(event.data);
  else
    postMessage({type: "error", message: "Unrecognised type on message to DSVWorker: " + type});
};
