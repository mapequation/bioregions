
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
