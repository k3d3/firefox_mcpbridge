'use strict';

const browser = globalThis.browser || globalThis.chrome;

// Default values that will be overridden by storage
let API_URL = "wss://127.0.0.1:5588";
let API_KEY = "abc123";
let AUTO_APPROVE_TOOLS = [];

// Store active connections
const activeConnections = new Map();

// Load settings from storage
browser.storage.local.get({
  apiUrl: API_URL,
  apiKey: API_KEY,
  autoApproveTools: AUTO_APPROVE_TOOLS
}).then((items) => {
  API_URL = items.apiUrl;
  API_KEY = items.apiKey;
  AUTO_APPROVE_TOOLS = items.autoApproveTools;
}).catch((error) => {
  console.error('Error loading settings:', error);
});

// Listen for changes to settings
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.apiUrl) {
      API_URL = changes.apiUrl.newValue;
    }
    if (changes.apiKey) {
      API_KEY = changes.apiKey.newValue;
    }
    if (changes.autoApproveTools) {
      AUTO_APPROVE_TOOLS = changes.autoApproveTools.newValue;
    }
  }
});

function getAutoApproveToolsConfig() {
  const config = {};
  
  AUTO_APPROVE_TOOLS.forEach(tool => {
    config[tool] = {
      allowed: true,
      lastUpdated: 1
    };
  });
  
  return config;
}

function createDebuggedWebSocket(url) {
  const ws = new WebSocket(url);
  
  ws.onclose = (event) => {
    if (!event.wasClean) {
      console.error('WebSocket closed unexpectedly:', {
        code: event.code,
        reason: event.reason
      });
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return ws;
}

// Handle requests from the page script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // Handle initial requests
  if (event.data?.type === 'claude-bridge-request') {
    const { method, args, requestId } = event.data;
    
    switch(method) {
      case 'getAutoApproveToolsConfig': {
        window.postMessage({
          type: 'claude-bridge-response',
          requestId: requestId,
          response: getAutoApproveToolsConfig(),
          error: null
        }, '*');
        break;
      }

      case 'listMcpServers': {
        const ws = createDebuggedWebSocket(API_URL);
        ws.onopen = function() {
          const payload = {
            "list": true,
            "key": API_KEY
          };
          ws.send(JSON.stringify(payload));
        };

        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            window.postMessage({
              type: 'claude-bridge-response',
              requestId: requestId,
              response: data.error ? null : data,
              error: data.error
            }, '*');
          } catch (err) {
            console.warn('Invalid server response:', event.data);
            window.postMessage({
              type: 'claude-bridge-response',
              requestId: requestId,
              response: null,
              error: 'Invalid server response'
            }, '*');
          }
          ws.close();
        };
        break;
      }

      case 'connectToMcpServer': {
        const serverName = args[0];
        
        // Check if we already have a connection for this server
        if (activeConnections.has(serverName)) {
          window.postMessage({
            type: 'claude-bridge-response',
            requestId: requestId,
            response: true,
            error: null
          }, '*');
          return;
        }
        
        try {
          const ws = createDebuggedWebSocket(API_URL);
          
          ws.onopen = function() {
            const payload = {
              "connect": serverName,
              "key": API_KEY
            };
            ws.send(JSON.stringify(payload));
          };

          ws.onmessage = function(event) {
            try {
              const data = JSON.parse(event.data);
              
              if (data.error) {
                ws.close();
                window.postMessage({
                  type: 'claude-bridge-response',
                  requestId: requestId,
                  response: null,
                  error: data.error
                }, '*');
              } else {
                // Store the active connection
                activeConnections.set(serverName, {
                  socket: ws,
                  lastUsed: Date.now()
                });
                
                // Set up ongoing message handling
                ws.onmessage = function(event) {
                  try {
                    const data = JSON.parse(event.data);
                    window.postMessage({
                      type: 'mcp-server-message',
                      serverName: serverName,
                      data: data
                    }, '*');
                  } catch (err) {
                    console.warn('Invalid server message:', event.data);
                  }
                };
                
                // Set up cleanup on connection close
                const origOnClose = ws.onclose;
                ws.onclose = function(event) {
                  if (!event.wasClean) {
                    console.error('Connection closed unexpectedly:', {
                      code: event.code,
                      reason: event.reason
                    });
                  }
                  activeConnections.delete(serverName);
                  origOnClose?.(event);
                };
                
                window.postMessage({
                  type: 'claude-bridge-response',
                  requestId: requestId,
                  response: true,
                  error: null
                }, '*');
              }
            } catch (err) {
              // For initial connection message, we still want to proceed
              activeConnections.set(serverName, {
                socket: ws,
                lastUsed: Date.now()
              });
              
              // Set up ongoing message handling
              ws.onmessage = function(event) {
                try {
                  const data = JSON.parse(event.data);
                  window.postMessage({
                    type: 'mcp-server-message',
                    serverName: serverName,
                    data: data
                  }, '*');
                } catch (err) {
                  console.warn('Invalid server message:', event.data);
                }
              };
              
              window.postMessage({
                type: 'claude-bridge-response',
                requestId: requestId,
                response: true,
                error: null
              }, '*');
            }
          };

          ws.onerror = function(error) {
            console.error('WebSocket connection failed:', error);
            window.postMessage({
              type: 'claude-bridge-response',
              requestId: requestId,
              response: null,
              error: 'WebSocket connection failed'
            }, '*');
            activeConnections.delete(serverName);
          };
        } catch (error) {
          console.error('Failed to create WebSocket:', error);
          window.postMessage({
            type: 'claude-bridge-response',
            requestId: requestId,
            response: null,
            error: error.message
          }, '*');
        }
        break;
      }

      default:
        window.postMessage({
          type: 'claude-bridge-response',
          requestId: requestId,
          response: null,
          error: 'Unknown method: ' + method
        }, '*');
    }
  }
  
  // Handle ongoing messages for active connections
  else if (event.data?.type === 'mcp-client-message') {
    const { serverName, data } = event.data;
    const connection = activeConnections.get(serverName);
    
    if (connection) {
      try {
        connection.lastUsed = Date.now();
        connection.socket.send(JSON.stringify(data));
      } catch (error) {
        console.error('Failed to send message to server:', error);
        connection.socket.close();
        activeConnections.delete(serverName);
      }
    } else {
      console.warn('No active connection found for server:', serverName);
    }
  }
});