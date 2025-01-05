(function() {
  'use strict';

  window.claudeAppBindings = {
    connectToMcpServer: async function(...args) {
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
          method: 'connectToMcpServer',
          args: args,
          requestId: requestId
        }, '*');
      });
    },
    listMcpServers: async function(...args) {
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
          args: args,
          requestId: requestId
        }, '*');
      });
    },
    registerBinding: async function(...args) {
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
          method: 'registerBinding',
          args: args,
          requestId: requestId
        }, '*');
      });
    },
    toggleDarkMode: async function(...args) {
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
          method: 'toggleDarkMode',
          args: args,
          requestId: requestId
        }, '*');
      });
    },
    unregisterBinding: async function(...args) {
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
          method: 'unregisterBinding',
          args: args,
          requestId: requestId
        }, '*');
      });
    }
  };
})();