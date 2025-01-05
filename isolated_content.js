(function() {
  'use strict';
  
  const API_URL = "wss://127.0.0.1:5588";
  const API_KEY = "abc123";

  // Listen for messages from the page
  window.addEventListener('message', async function(event) {
    if (event.data?.type !== 'claude-bridge-request') return;
    
    const { method, args, requestId } = event.data;
    
    try {
      let response;
      
      switch(method) {
        case 'listMcpServers':
          response = await new Promise((resolve, reject) => {
            const wc = new WebSocket(API_URL);

            wc.onopen = function() {
              wc.send(JSON.stringify({
                "list": true,
                "key": API_KEY
              }));
            }

            wc.addEventListener('message', function(event) {
              console.log('Message from server ', event.data);
              const data = JSON.parse(event.data);

              if (data.error) {
                reject(data.error);
              } else {
                resolve(data);
              }
              
              wc.close();
            });

            wc.onerror = function(error) {
              console.error('WebSocket error:', error);
              reject(error);
            };
          });
          break;

        case 'connectToMcpServer':
          console.log("connectToMcpServer", args);
          response = null;
          break;

        case 'registerBinding':
          console.log("registerBinding", args);
          response = null;
          break;

        case 'toggleDarkMode':
          console.log("toggleDarkMode", args);
          response = null;
          break;

        case 'unregisterBinding':
          console.log("unregisterBinding", args);
          response = null;
          break;

        default:
          throw new Error('Unknown method: ' + method);
      }

      window.postMessage({
        type: 'claude-bridge-response',
        requestId: requestId,
        response: response,
        error: null
      }, '*');
      
    } catch (error) {
      console.error('Error handling request:', error);
      window.postMessage({
        type: 'claude-bridge-response',
        requestId: requestId,
        response: null,
        error: error.message
      }, '*');
    }
  });
})();