(function () {
  const STATE_KEY = "hyunchiya_grabber_state";
  const DATA_KEY = "grabbed_domains_google_fetch";

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }

  async function init() {
    const state = await getStorage(STATE_KEY);
    
    if (!state || !state.isExtracting) return;

    showOverlay(state.domainsCount || 0, state.currentPage || 1);

    try {
      const newDomains = scrapeDomains();
      
      const currentDomains = await getStorage(DATA_KEY) || [];
      const domainSet = new Set([...currentDomains, ...newDomains]);
      const sortedList = [...domainSet].sort();
      
      await setStorage(DATA_KEY, sortedList);

      let currentPage = state.currentPage || 0;
      currentPage++;

      await setStorage(STATE_KEY, {
        ...state,
        currentPage: currentPage,
        domainsCount: sortedList.length
      });

      chrome.runtime.sendMessage({ action: "updateUI" });

      if (currentPage >= state.maxPages) {
        finishExtraction("Max pages reached");
        return;
      }

      const nextBtn = document.querySelector('a[aria-label="Next page"], a#pnnext');
      if (!nextBtn) {
        finishExtraction("No more pages (End of results)");
        return;
      }

      const delay = state.pauseMs || 2000;
      const randomDelay = Math.floor(delay + (Math.random() * (delay * 0.3)));
      
      setTimeout(() => {
        window.location.href = nextBtn.href;
      }, randomDelay);

    } catch (e) {
      
    }
  }

  function scrapeDomains() {
    const domains = new Set();
    
    const pushHost = (u) => {
      try {
        const urlObj = new URL(u);
        const host = urlObj.hostname;
        
        const googleDomains = ["google.com", "google.co.id", "google.co.uk", "google.ca", "google.jp", "google.de", "google.fr", "google.it", "google.es", "google.br", "google.ru", "google.cn", "gstatic.com", "googleusercontent.com", "youtube.com", "blogger.com", "wordpress.com"];
        const isGoogle = googleDomains.some(d => host === d || host.endsWith("." + d));

        if (host && !isGoogle) {
          domains.add(host);
        }
      } catch (_) {}
    };

    const selectors = '#search .g a[href^="http"], #rso a[href^="http"], div#search a[href^="http"]';
    document.querySelectorAll(selectors).forEach(a => {
      const href = a.getAttribute("href");
      if (href && !href.includes("webcache.googleusercontent.com")) {
        pushHost(href);
      }
    });

    return [...domains];
  }

  async function finishExtraction(reason) {
    const state = await getStorage(STATE_KEY);
    await setStorage(STATE_KEY, { ...state, isExtracting: false });
    alert(`[HyunChiya Grabber] Finished!\nReason: ${reason}`);
    removeOverlay();
  }

  function getStorage(key) {
    return new Promise(resolve => {
      chrome.storage.local.get([key], (result) => resolve(result[key]));
    });
  }

  function setStorage(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'stopExtraction') {
      finishExtraction("Stopped by user");
      sendResponse({success: true});
    }
  });

  function showOverlay(count, page) {
    const id = "hyunchiya-overlay";
    let div = document.getElementById(id);
    
    const styles = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #161616;
      color: #f2f4f8;
      padding: 12px 16px;
      border: 1px solid #333;
      border-left: 3px solid #25be6a;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      border-radius: 6px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 140px;
      line-height: 1.4;
      transition: all 0.3s ease;
    `;

    if (!div) {
      div = document.createElement("div");
      div.id = id;
      div.style.cssText = styles;
      document.body.appendChild(div);
    }

    div.innerHTML = `
      <div style="font-weight:600; color:#25be6a; font-size:11px; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">
        ● GRABBING ACTIVE
      </div>
      <div style="display:flex; justify-content:space-between; color:#9298a7; font-size:12px;">
        <span>Page:</span> <span style="color:#ffffff; font-weight:600">${page}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:#9298a7; font-size:12px;">
        <span>Domains:</span> <span style="color:#ffffff; font-weight:600">${count}</span>
      </div>
    `;
  }

  function removeOverlay() {
    const el = document.getElementById("hyunchiya-overlay");
    if (el) el.remove();
  }
})();