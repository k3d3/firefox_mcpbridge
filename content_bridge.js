'use strict';

const browser = globalThis.browser || globalThis.chrome;

// Listen for messages from the page script and forward them to background
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // Handle initial requests
  if (event.data?.type === 'claude-bridge-request') {
    browser.runtime.sendMessage(event.data).then(response => {
      window.postMessage({
        type: 'claude-bridge-response',
        requestId: event.data.requestId,
        response: response?.response,
        error: response?.error
      }, '*');
    }).catch(error => {
      window.postMessage({
        type: 'claude-bridge-response',
        requestId: event.data.requestId,
        response: null,
        error: error.message
      }, '*');
    });
  }
  // Handle ongoing messages for active connections
  else if (event.data?.type === 'mcp-client-message') {
    browser.runtime.sendMessage({
      type: 'mcp-client-message',
      serverName: event.data.serverName,
      message: event.data.data
    });
  }
});

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'mcp-server-message') {
    window.postMessage({
      type: 'mcp-server-message',
      serverName: message.serverName,
      data: message.data
    }, '*');
  }
});