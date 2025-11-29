(function() {
  let isExtracting = false;
  let extractionController = null;

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'startExtraction') {
      startExtraction(request.maxPages, request.pauseMs);
      sendResponse({ success: true });
    } else if (request.action === 'stopExtraction') {
      stopExtraction();
      sendResponse({ success: true });
    } else if (request.action === 'downloadResults') {
      downloadResults();
      sendResponse({ success: true });
    }
    return true;
  });

  async function startExtraction(MAX_PAGES = 100, PAUSE_MS = 1200) {
    if (isExtracting) {
      console.warn('[!] Extraction is already running');
      return;
    }

    isExtracting = true;
    extractionController = new AbortController();
    const signal = extractionController.signal;

    const STORAGE_KEY = "grabbed_domains_google_fetch";
    const domains = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

    let nextURL = new URL(window.location.href);
    let pages = 0;

    const pushHost = (u) => {
      try {
        const host = new URL(u, location.origin).hostname;
        if (
          host &&
          !host.includes("google.") &&
          !host.includes("gstatic.com") &&
          !host.includes("googleusercontent.com")
        ) {
          domains.add(host);
          return true;
        }
      } catch (_) {}
      return false;
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
      while (isExtracting && !signal.aborted) {
        console.log("[*] Fetching:", nextURL.toString());
        
        chrome.runtime.sendMessage({
          action: 'extractionProgress',
          currentPage: pages + 1,
          maxPages: MAX_PAGES,
          domainCount: domains.size
        });

        const res = await fetch(nextURL.toString(), { 
          credentials: "same-origin",
          signal: signal
        });
        
        if (!res.ok) {
          // Save data before throwing error
          const list = [...domains].sort();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          
          throw new Error(`HTTP ${res.status}`);
        }
        
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        let foundDomains = 0;
        doc.querySelectorAll('a[jsname="UWckNb"], a[jsname="ACyKwe"], div#search a[href^="http"]').forEach(a => {
          const href = a.getAttribute("href") || "";
          if (!href) return;
          if (href.includes("webcache.googleusercontent.com")) return;
          if (pushHost(href)) foundDomains++;
        });

        console.log(`[*] Found ${foundDomains} new domains on page ${pages + 1}`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...domains]));

        const nextA = doc.querySelector('a[aria-label="Next page"], a#pnnext');
        if (!nextA) {
          console.log("[*] No more pages.");
          break;
        }

        const href = nextA.getAttribute("href");
        if (!href) break;

        nextURL = new URL(href, location.origin); 
        pages++;
        
        if (pages >= MAX_PAGES) {
          console.warn("[!] Reached MAX_PAGES.");
          break;
        }

        await sleep(PAUSE_MS);
      }

      if (isExtracting) {
        const list = [...domains].sort();
        console.log(`[*] Done. Total domains: ${list.length}`);
        console.log(list.join("\n"));

        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        
        chrome.runtime.sendMessage({
          action: 'extractionComplete',
          domainCount: list.length,
          currentPage: pages
        });
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        // Save whatever we have collected so far
        const list = [...domains].sort();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        
        console.error('[!] Extraction error:', error);
        
        chrome.runtime.sendMessage({
          action: 'extractionError',
          message: error.message,
          domainCount: list.length,
          currentPage: pages
        });
      }
    } finally {
      isExtracting = false;
      extractionController = null;
    }
  }

  function stopExtraction() {
    if (isExtracting && extractionController) {
      extractionController.abort();
      isExtracting = false;
      console.log('[!] Extraction stopped by user');
      
      // Save current data
      const STORAGE_KEY = "grabbed_domains_google_fetch";
      const domains = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      
      chrome.runtime.sendMessage({
        action: 'extractionError',
        message: 'Stopped by user',
        domainCount: domains.length
      });
    }
  }

  function downloadResults() {
    const STORAGE_KEY = "grabbed_domains_google_fetch";
    const domains = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    
    if (domains.length === 0) {
      alert('No domains found to export.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const blob = new Blob([domains.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    
    chrome.runtime.sendMessage({
      action: 'downloadFile',
      url: url,
      filename: `google_domains_${timestamp}.txt`
    });

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    console.log(`[*] Downloaded ${domains.length} domains`);
  }
})();