
/**
* Create worker from string (or url as fallback)
* Taken from https://github.com/webpack/worker-loader/blob/master/createInlineWorker.js
*/
export createInlineWorker = function(content, url) {
  var URL = window.URL || window.webkitURL;
	try {
		try {
			var blob;
			try { // BlobBuilder = Deprecated, but widely implemented
				var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
				blob = new BlobBuilder();
				blob.append(content);
				blob = blob.getBlob();
			} catch(e) { // The proposed API
				blob = new Blob([content]);
			}
			return new Worker(URL.createObjectURL(blob));
		} catch(e) {
			return new Worker('data:application/javascript,' + encodeURIComponent(content));
		}
	} catch(e) {
		return new Worker(url);
	}
}
