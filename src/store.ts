class Store {
  result: number;
  
  constructor() {
    console.log('Creating worker...', import.meta.url);
    // const worker = new Worker('./worker.js', { type: 'module' });
    const worker = new Worker(new URL("./worker.js", import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      console.log('from worker: ' + event.data);
    };
    worker.postMessage({ type: 'load_sample' });
    this.result = 10;
  }
}

const store = new Store();


export default store;