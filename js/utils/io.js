
var io = {};
export {io as default};

/**
* File in FileList, format in ['text', 'buffer']
* @return promise
*/
io.readFile = function(file, format) {
  let promise = new Promise( function(resolve, reject) {
    let reader = new FileReader();
    reader.onload = function(progressEvent) {
        resolve({name: file.name, data: reader.result});
    };

    try {
      if (format == 'text')
        reader.readAsText(file);
      else
        reader.readAsArrayBuffer(file);
    }
    catch (e) {
      reject(e);
    }
  });
  return promise;
}
