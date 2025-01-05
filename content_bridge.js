'use strict';

const browser = globalThis.browser || globalThis.chrome;

// Listen for messages from the page script and forward them to background
window.addEventListener('message', (event) => {
  console.log("received message, top-level");
  if (event.source !== window) return;
  console.log("received message, top-level, source is window");
  
  // Handle initial requests
  if (event.data?.type === 'claude-bridge-request') {
    console.log("claude-bridge-request", event);
    browser.runtime.sendMessage(event.data).then(response => {
      console.log('Sending claude-bridge-response:', response);
      window.postMessage({
        type: 'claude-bridge-response',
        requestId: event.data.requestId,
        response: response?.response,
        error: response?.error
      }, '*');
    }).catch(error => {
      console.log("Sending claude-bridge-response with error:", error);
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
    console.log('mcp-client-message, forwarding message to background:', event.data);
    browser.runtime.sendMessage({
      type: 'mcp-client-message',
      serverName: event.data.serverName,
      message: event.data.data
    });
  }
});

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
  console.log('Received message:', message);
  if (message?.type === 'mcp-server-message') {
    console.log('mcp-server-message, forwarding message to page:', message);
    window.postMessage({
      type: 'mcp-server-message',
      serverName: message.serverName,
      data: message.data
    }, '*');
  }
});