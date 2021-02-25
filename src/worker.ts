import Papa from 'papaparse';

function loadFile(url: string, papaArgs = {}) {
  Papa.parse(url, {
    download: true,
    dynamicTyping: true,
    header: true,
    chunkSize: 100,
    //worker: true,
    ...papaArgs
  });
}

function preview(url: string, papaArgs = {}) {
  loadFile(url, {
    preview: 10,
    ...papaArgs,
  })
}

function loadSample() {
  // preview('https://www.mapequation.org/bioregions/data/mammals_neotropics.csv', {
  preview('/data/mammals_neotropics.csv', {
    complete() {
      console.log('Complete!');
    },
    chunk(lines: string[]) {
      console.log('chunk:', lines);
    },
  })
}

addEventListener('message', event => {
  console.log('message:', event.data, "date3");
  // postMessage(["date", "now2"], "origin");

  const { data } = event;
  const { type } = data;
  if (type == 'load_sample') {
    loadSample();
  }
});