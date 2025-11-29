chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'downloadFile') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: false
    });
  }
});

chrome.runtime.onInstalled.addListener(function() {
  console.log('Google Domain Extractor installed');
});

chrome.runtime.onSuspend.addListener(function() {
});