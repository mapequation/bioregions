
export default {
  readFile,
  dataURLtoData,
  base64toData,
  dataToBlobURL,
  contentToBase64URL,
  prettyStringifyJSON,
  basename
};

/**
* File in FileList, format in ['text', 'buffer']
* @return promise
*/
export function readFile(file, format, progressCallback) {
  let promise = new Promise( function(resolve, reject) {
    // FileReader not available in workers in Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1051150
    var usingAsyncReader = typeof FileReader === 'function';
    var reader;
    var result;

    console.log(`Trying to load ${file} as ${format}, using ${usingAsyncReader? "FileReader" : "FileReaderSync"}...`);

    if (usingAsyncReader) {
      reader = new FileReader();
      reader.onprogress = function(event) {
        if (typeof progressCallback === 'function')
          progressCallback(event);
      };

      reader.onerror = function(event) {
        console.log("Error reading file!:", event);
        reject(event);
      }

      reader.onloadend = (event) => {
        try {
          const {result, error} = event.target; // allocation size overflow in Firefox for ~300Mb files!

          console.log("[readFile] onloadend, error:", error);
          if (error) {
            reject(error);
          }
          else {
            resolve({name: file.name, data: result});
          }
        }
        catch(e) {
          console.log("Error retrieving loaded file content!:", e);
          if (e.message === "allocation size overflow")
            e.message += ". (This may happen in Firefox for big files, please try another browser if this is the case.)";
          reject(e);
        }
      };
    }
    else {
      reader = new FileReaderSync();
    }


    var successful = true;
    try {
      if (format == 'text')
        result = reader.readAsText(file);
      else
        result = reader.readAsArrayBuffer(file);
    }
    catch (e) {
      console.log("[readFile] Error loading file sync:", e);
      successful = false;
      reject(e);
    }
    finally {
      console.log("[readFile] finally, successful?:", successful);
      if (!usingAsyncReader && successful) {
        resolve({name: file.name, data: result});
      }
    }
  });
  return promise;
}



export function dataURLtoData(dataURL) {
  return Promise.resolve(dataURL.split(',')[1]).then(base64toData);
}

export function base64toData(content) {
  return new Promise(resolve => {
    let binary = atob(content);
    let array = [];
    for(let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }
    resolve(new Uint8Array(array));
  });
}

export function dataToBlobURL(type, data) {
  return Promise.resolve(data ? URL.createObjectURL(new Blob([data], { type })) : null);
}

export function contentToBase64URL(content, type) {
  return 'data:' + type + ';base64,' + window.btoa(content);
}

export function prettyStringifyJSON(data) {
  return new Promise(resolve => resolve(JSON.stringify(data, null, '\t')));
}

export function basename(filename) {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? filename : filename.substring(0, lastDot);
}
