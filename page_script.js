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