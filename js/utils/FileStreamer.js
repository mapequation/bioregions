// Copy https://github.com/mholt/PapaParse/blob/553f5d7e396dd39f155007e9889ff6ba2e3b321a/papaparse.js
function FileStreamer(config)
{
  config = config || {};
  if (!config.chunkSize)
  config.chunkSize = Papa.LocalChunkSize;

  var start = 0;
  var aggregate = "";
  var partialLine = "";
  var reader, nextChunk, slice;
  var handle = new ParserHandle(copy(config));

  // FileReader is better than FileReaderSync (even in worker) - see http://stackoverflow.com/q/24708649/1048862
  // But Firefox is a pill, too - see issue #76: https://github.com/mholt/PapaParse/issues/76
  var usingAsyncReader = typeof FileReader === 'function';
  
  this.stream = function(file)
  {
    var slice = file.slice || file.webkitSlice || file.mozSlice;

    if (usingAsyncReader)
    {
      reader = new FileReader();		// Preferred method of reading files, even in workers
      reader.onload = chunkLoaded;
      reader.onerror = chunkError;
    }
    else
    reader = new FileReaderSync();	// Hack for running in a web worker in Firefox

    nextChunk();	// Starts streaming

    function nextChunk()
    {
      if (start < file.size)
      readChunk();
    }

    function readChunk()
    {
      var end = Math.min(start + config.chunkSize, file.size);
      var txt = reader.readAsText(slice.call(file, start, end), config.encoding);
      if (!usingAsyncReader)
      chunkLoaded({ target: { result: txt } });	// mimic the async signature
    }

    function chunkLoaded(event)
    {
      // Very important to increment start each time before handling results
      start += config.chunkSize;

      // Rejoin the line we likely just split in two by chunking the file
      aggregate += partialLine + event.target.result;
      partialLine = "";

      var finishedWithEntireFile = start >= file.size;

      if (!finishedWithEntireFile)
      {
        var lastLineEnd = aggregate.lastIndexOf("\n");

        if (lastLineEnd < 0)
        lastLineEnd = aggregate.lastIndexOf("\r");

        if (lastLineEnd > -1)
        {
          partialLine = aggregate.substring(lastLineEnd + 1);	// skip the line ending character
          aggregate = aggregate.substring(0, lastLineEnd);
        }
        else
        {
          // For chunk sizes smaller than a line (a line could not fit in a single chunk)
          // we simply build our aggregate by reading in the next chunk, until we find a newline
          nextChunk();
          return;
        }
      }

      var results = handle.parse(aggregate);
      aggregate = "";

      if (IS_WORKER)
      {
        global.postMessage({
          results: results,
          workerId: Papa.WORKER_ID,
          finished: finishedWithEntireFile
        });
      }
      else if (isFunction(config.chunk))
      {
        config.chunk(results, file);
        results = undefined;
      }

      if (finishedWithEntireFile && isFunction(config.complete))
      config.complete(undefined, file);
      else if (results && results.meta.aborted && isFunction(config.complete))	// TODO: Abort needs reworking like pause/resume need it (if streaming, no results object is returned, so it has no meta to say aborted: true...)
      config.complete(results, file);
      else if (!finishedWithEntireFile)
      nextChunk();
    }

    function chunkError()
    {
      if (isFunction(config.error))
      config.error(reader.error, file);
      else if (IS_WORKER && config.error)
      {
        global.postMessage({
          workerId: Papa.WORKER_ID,
          error: reader.error,
          file: file,
          finished: false
        });
      }
    }
  };
}
