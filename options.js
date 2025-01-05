// Default values
const DEFAULT_API_URL = "wss://127.0.0.1:5588";
const DEFAULT_API_KEY = "abc123";

// Save options to browser.storage
function saveOptions(e) {
  e.preventDefault();
  const status = document.getElementById('status');
  
  browser.storage.local.set({
    apiUrl: document.getElementById('apiUrl').value || DEFAULT_API_URL,
    apiKey: document.getElementById('apiKey').value || DEFAULT_API_KEY
  }).then(() => {
    status.textContent = 'Settings saved successfully!';
    status.className = 'success';
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }).catch((error) => {
    status.textContent = 'Error saving settings: ' + error;
    status.className = 'error';
    status.style.display = 'block';
  });
}

// Restore options from browser.storage
function restoreOptions() {
  browser.storage.local.get({
    apiUrl: DEFAULT_API_URL,
    apiKey: DEFAULT_API_KEY
  }).then((items) => {
    document.getElementById('apiUrl').value = items.apiUrl;
    document.getElementById('apiKey').value = items.apiKey;
  }).catch((error) => {
    console.error('Error loading settings:', error);
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);