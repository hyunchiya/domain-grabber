document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extractBtn');
  const stopBtn = document.getElementById('stopBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  const maxPagesInput = document.getElementById('maxPages');
  const pauseMsInput = document.getElementById('pauseMs');

  // Stats elements
  const statDomains = document.getElementById('statDomains');
  const statPages = document.getElementById('statPages');
  const statProgress = document.getElementById('statProgress');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressBarContainer = document.getElementById('progressBarContainer');

  // Load saved settings
  chrome.storage.local.get(['maxPages', 'pauseMs'], function(result) {
    if (result.maxPages) maxPagesInput.value = result.maxPages;
    if (result.pauseMs) pauseMsInput.value = result.pauseMs;
  });

  // Initialize stats
  resetStats();

  // Extract button click handler
  extractBtn.addEventListener('click', async function() {
    const maxPages = parseInt(maxPagesInput.value);
    const pauseMs = parseInt(pauseMsInput.value);
    
    // Validate inputs
    if (isNaN(maxPages) || maxPages < 1 || maxPages > 50000) {
      showStatus('Invalid max pages value', 'error', 'Please enter a value between 1 and 500');
      return;
    }
    
    if (isNaN(pauseMs) || pauseMs < 500 || pauseMs > 10000) {
      showStatus('Invalid delay value', 'error', 'Please enter a value between 500 and 5000ms');
      return;
    }
    
    // Save settings
    chrome.storage.local.set({ maxPages, pauseMs });
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if on Google search page
    if (!tab.url.includes('google.com/search')) {
      showStatus('Not on Google search page', 'error', 'Please navigate to Google search results first');
      return;
    }

    // Reset stats and UI
    resetStats();
    showStatus('Initializing extraction...', 'progress', 'Preparing to scan search results');
    extractBtn.disabled = true;
    stopBtn.disabled = false;
    resultsDiv.style.display = 'none';
    progressBarContainer.style.display = 'block';

    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'startExtraction',
      maxPages: maxPages,
      pauseMs: pauseMs
    }, function(response) {
      if (chrome.runtime.lastError) {
        showStatus('Failed to start', 'error', 'Please refresh the page and try again');
        extractBtn.disabled = false;
        stopBtn.disabled = true;
        progressBarContainer.style.display = 'none';
        return;
      }
      
      if (response && response.success) {
        showStatus('Extraction in progress...', 'progress', 'Scanning Google search results');
      } else {
        showStatus('Failed to start extraction', 'error', 'An unexpected error occurred');
        extractBtn.disabled = false;
        stopBtn.disabled = true;
        progressBarContainer.style.display = 'none';
      }
    });
  });

  // Stop button click handler
  stopBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'stopExtraction'
        });
      }
    });
    
    showStatus('Extraction stopped by user', 'error', 'Process was manually interrupted');
    extractBtn.disabled = false;
    stopBtn.disabled = true;
    progressBarContainer.style.display = 'none';
  });

  // Download button click handler
  downloadBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'downloadResults'
        });
        
        showStatus('Download started', 'success', 'Check your downloads folder');
      }
    });
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'extractionComplete') {
      const domains = request.domainCount || 0;
      showStatus(
        `Extraction completed successfully!`, 
        'success', 
        `Found ${domains} unique domain${domains !== 1 ? 's' : ''} from search results`
      );
      
      updateStats(domains, request.currentPage || 0, parseInt(maxPagesInput.value));
      
      extractBtn.disabled = false;
      stopBtn.disabled = true;
      resultsDiv.style.display = 'block';
      progressBarContainer.style.display = 'none';
      
    } else if (request.action === 'extractionProgress') {
      const currentPage = request.currentPage || 0;
      const maxPages = request.maxPages || 100;
      const domainCount = request.domainCount || 0;
      
      showStatus(
        'Extraction in progress...', 
        'progress', 
        `Processing page ${currentPage} of ${maxPages} • ${domainCount} domain${domainCount !== 1 ? 's' : ''} collected`
      );
      
      updateStats(domainCount, currentPage, maxPages);
      
    } else if (request.action === 'extractionError') {
      const domainCount = request.domainCount || 0;
      
      showStatus(
        'Extraction stopped with error', 
        'error', 
        request.message || 'An unexpected error occurred'
      );
      
      // Update stats with collected domains
      if (domainCount > 0) {
        updateStats(domainCount, request.currentPage || 0, parseInt(maxPagesInput.value));
        
        // Show download button if we have domains
        resultsDiv.style.display = 'block';
        
        // Add additional info message
        setTimeout(() => {
          showStatus(
            `Partially completed - ${domainCount} domains saved`, 
            'error', 
            'You can still download the collected domains. Error: ' + (request.message || 'Unknown error')
          );
        }, 100);
      }
      
      extractBtn.disabled = false;
      stopBtn.disabled = true;
      progressBarContainer.style.display = 'none';
    }
  });

  // Helper function to show status
  function showStatus(message, type, detail = '') {
    const iconMap = {
      progress: '⏳',
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };
    
    statusDiv.classList.add('show');
    statusDiv.className = `status-bar show ${type}`;
    
    const statusIcon = document.getElementById('statusIcon');
    const statusMessage = document.getElementById('statusMessage');
    const statusDetail = document.getElementById('statusDetail');
    
    if (statusIcon) statusIcon.textContent = iconMap[type] || iconMap.info;
    if (statusMessage) statusMessage.textContent = message;
    if (statusDetail) {
      statusDetail.textContent = detail;
      statusDetail.style.display = detail ? 'block' : 'none';
    }
  }

  // Helper function to update stats
  function updateStats(domains, pages, maxPages) {
    if (statDomains) {
      statDomains.textContent = formatNumber(domains);
    }
    
    if (statPages) {
      statPages.textContent = formatNumber(pages);
    }
    
    if (statProgress && progressBarFill) {
      const progress = maxPages > 0 ? Math.round((pages / maxPages) * 100) : 0;
      statProgress.textContent = progress + '%';
      progressBarFill.style.width = progress + '%';
    }
  }

  // Helper function to reset stats
  function resetStats() {
    if (statDomains) statDomains.textContent = '0';
    if (statPages) statPages.textContent = '0';
    if (statProgress) statProgress.textContent = '0%';
    if (progressBarFill) progressBarFill.style.width = '0%';
  }

  // Helper function to format numbers
  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Input validation
  maxPagesInput.addEventListener('input', function() {
    let value = parseInt(this.value);
    if (value < 1) this.value = 1;
    if (value > 500) this.value = 500;
  });

  pauseMsInput.addEventListener('input', function() {
    let value = parseInt(this.value);
    if (value < 500) this.value = 500;
    if (value > 5000) this.value = 5000;
  });

  // Save settings on blur
  maxPagesInput.addEventListener('blur', function() {
    chrome.storage.local.set({ maxPages: parseInt(this.value) });
  });

  pauseMsInput.addEventListener('blur', function() {
    chrome.storage.local.set({ pauseMs: parseInt(this.value) });
  });
});