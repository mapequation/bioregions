
var io = {};
export {io as default};

/**
* File in FileList, format in ['text', 'buffer']
* @return promise
*/
io.readFile = function(file, format, progressCallback) {
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


      reader.onloadend = (event) => {
        const {result, error} = event.target;

        if (error) {
          reject(error);
        }
        else {
          resolve({name: file.name, data: result});
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
      successful = false;
      reject(e);
    }
    finally {
      if (!usingAsyncReader && successful) {
        resolve({name: file.name, data: result});
      }
    }
  });
  return promise;
}
