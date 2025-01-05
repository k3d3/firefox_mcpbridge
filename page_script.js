'use strict';

window.claudeAppBindings = {
  connectToMcpServer: async function(serverName) {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2);
      
      function handleResponse(event) {
        if (event.data?.type === 'claude-bridge-response' && event.data.requestId === requestId) {
          window.removeEventListener('message', handleResponse);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            
            // Create a MessageChannel for this connection
            const channel = new MessageChannel();
            
            // Set up message handler for port2
            // This comes from the page, and needs to be sent to content_bridge.
            channel.port2.onmessage = function(event) {
              window.postMessage({
                type: 'mcp-client-message',
                serverName: serverName,
                data: event.data
              }, '*');
            };
            
            // After successful connection, notify the page and pass port1
            window.postMessage({
              type: 'mcp-server-connected',
              serverName: serverName,
            }, '*', [channel.port1]);  // Transfer port1 ownership
            
            // Keep port2 for handling messages
            window.addEventListener('message', function(event) {
              if (event.data?.type === 'mcp-server-message' && event.data.serverName === serverName) {
                channel.port2.postMessage(event.data.data);
              }
            });

            resolve(undefined);  // Function returns undefined on success
          }
        }
      }

      window.addEventListener('message', handleResponse);
      window.postMessage({
        type: 'claude-bridge-request',
        method: 'connectToMcpServer',
        args: [serverName],
        requestId: requestId
      }, '*');
    });
  },

  listMcpServers: async function() {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2);
      
      function handleResponse(event) {
        if (event.data?.type === 'claude-bridge-response' && event.data.requestId === requestId) {
          window.removeEventListener('message', handleResponse);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.response);
          }
        }
      }

      window.addEventListener('message', handleResponse);
      window.postMessage({
        type: 'claude-bridge-request',
        method: 'listMcpServers',
        args: [],
        requestId: requestId
      }, '*');
    });
  }
};

// Auto-approve tools functionality
(function() {
  // Function to extract chat ID from URL
  function getChatId() {
    const match = window.location.pathname.match(/\/chat\/([^/]+)/);
    return match ? match[1] : null;
  }

  // Function to handle URL changes and update sessionStorage
  function handleUrlChange() {
    const chatId = getChatId();
    if (chatId) {
      const requestId = 'auto-approve-' + Date.now();
      
      function handleAutoApproveResponse(event) {
        if (event.data?.type === 'claude-bridge-response' && 
            event.data.requestId === requestId) {
          window.removeEventListener('message', handleAutoApproveResponse);
          if (!event.data.error && event.data.response) {
            const key = `SSS-alwaysAllowTools-${chatId}`;
            sessionStorage.setItem(key, JSON.stringify(event.data.response));
          }
        }
      }

      window.addEventListener('message', handleAutoApproveResponse);
      window.postMessage({
        type: 'claude-bridge-request',
        method: 'getAutoApproveToolsConfig',
        args: [],
        requestId: requestId
      }, '*');
    }
  }

  // Set up URL change detection
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleUrlChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial check
  handleUrlChange();
})();