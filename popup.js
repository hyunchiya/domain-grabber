document.addEventListener('DOMContentLoaded', async function() {
  const extractBtn = document.getElementById('extractBtn');
  const stopBtn = document.getElementById('stopBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  const statDomains = document.getElementById('statDomains');
  const statPages = document.getElementById('statPages');
  const statProgress = document.getElementById('statProgress');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const statusMessage = document.getElementById('statusMessage');
  const resultsDiv = document.getElementById('results');
  const maxPagesInput = document.getElementById('maxPages');
  const pauseMsInput = document.getElementById('pauseMs');

  const STATE_KEY = "hyunchiya_grabber_state";
  const DATA_KEY = "grabbed_domains_google_fetch";

  const savedState = await getStorage(STATE_KEY);
  if (savedState) {
    if (savedState.maxPages) maxPagesInput.value = savedState.maxPages;
    if (savedState.pauseMs) pauseMsInput.value = savedState.pauseMs;
  }

  await updateUI();

  setInterval(updateUI, 1000);

  maxPagesInput.addEventListener('change', function() {
    let value = parseInt(this.value);
    if (value < 1) this.value = 1;
  });

  pauseMsInput.addEventListener('change', function() {
    let value = parseInt(this.value);
    if (value < 500) this.value = 500;
  });

  extractBtn.addEventListener('click', async function() {
    const maxPages = parseInt(maxPagesInput.value);
    const pauseMs = parseInt(pauseMsInput.value);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes('google.com/search')) {
      alert("PLEASE OPEN GOOGLE SEARCH RESULT PAGE FIRST!");
      return;
    }

    await setStorage(DATA_KEY, []);
    await setStorage(STATE_KEY, {
      isExtracting: true,
      maxPages: maxPages,
      pauseMs: pauseMs,
      currentPage: 0,
      domainsCount: 0
    });

    chrome.tabs.reload(tab.id);
    window.close();
  });

  stopBtn.addEventListener('click', async function() {
    const state = await getStorage(STATE_KEY);
    // Simpan config terakhir tapi matikan status extracting
    await setStorage(STATE_KEY, { ...state, isExtracting: false });
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'stopExtraction' });
    
    await updateUI();
  });

  downloadBtn.addEventListener('click', async function() {
    const domains = await getStorage(DATA_KEY) || [];
    if (domains.length === 0) {
      alert("No data to download");
      return;
    }

    const blob = new Blob([domains.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    chrome.downloads.download({
      url: url,
      filename: `Google_Grab_${timestamp}.txt`,
      saveAs: false
    });
  });

  async function updateUI() {
    const state = await getStorage(STATE_KEY) || {};
    const domains = await getStorage(DATA_KEY) || [];
    const isRunning = state.isExtracting;

    statDomains.textContent = domains.length;
    statPages.textContent = state.currentPage || 0;
    
    const max = state.maxPages || 100;
    const current = state.currentPage || 0;
    
    let percent = 0;
    if (max > 0) {
      percent = (current / max) * 100;
      if (percent > 0 && percent < 1) {
        percent = percent.toFixed(1); 
      } else {
        percent = Math.round(percent);
      }
    }
    
    statProgress.textContent = percent + "%";
    progressBarFill.style.width = percent + "%";

    if (isRunning) {
      extractBtn.disabled = true;
      stopBtn.disabled = false;
      
      maxPagesInput.disabled = true;
      pauseMsInput.disabled = true;
      
      if (state.maxPages) maxPagesInput.value = state.maxPages;
      if (state.pauseMs) pauseMsInput.value = state.pauseMs;

      progressBarContainer.style.display = 'block';
      statusMessage.textContent = "PROCESS RUNNING...";
      statusMessage.style.color = "#25be6a";
    } else {
      extractBtn.disabled = false;
      stopBtn.disabled = true;
      
      // Buka kunci input
      maxPagesInput.disabled = false;
      pauseMsInput.disabled = false;

      statusMessage.textContent = "READY / STOPPED";
      statusMessage.style.color = "#f2f4f8";
      
      if (domains.length > 0) {
        resultsDiv.style.display = 'block';
      }
    }
  }

  function getStorage(key) {
    return new Promise(resolve => chrome.storage.local.get([key], r => resolve(r[key])));
  }

  function setStorage(key, val) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: val }, resolve));
  }
});