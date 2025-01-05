'use strict';

const API_URL = "wss://127.0.0.1:5588";
const API_KEY = "abc123";

// Store active connections with their associated tab IDs
const activeConnections = new Map();

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

// Listen for messages from content scripts
const browser = globalThis.browser || globalThis.chrome;
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === 'claude-bridge-request') {
    const { method, args } = message;
    
    switch(method) {
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
            if (data.error) {
              sendResponse({ error: data.error });
            } else {
              sendResponse({ response: data });
            }
          } catch (err) {
            console.warn('Invalid server response:', event.data);
            sendResponse({ error: 'Invalid server response' });
          }
          ws.close();
        };
        break;
      }

      case 'connectToMcpServer': {
        const serverName = args[0];
        
        // Check if we already have a connection for this server and tab
        const connectionKey = `${serverName}-${sender.tab.id}`;
        if (activeConnections.has(connectionKey)) {
          sendResponse({ response: true });
          return true;
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
                sendResponse({ error: data.error });
              } else {
                // Store the active connection with tab ID
                activeConnections.set(connectionKey, {
                  socket: ws,
                  lastUsed: Date.now(),
                  tabId: sender.tab.id
                });
                
                // Set up ongoing message handling
                ws.onmessage = function(event) {
                  try {
                    const data = JSON.parse(event.data);
                    // Send message to specific tab
                    browser.tabs.sendMessage(sender.tab.id, {
                      type: 'mcp-server-message',
                      serverName: serverName,
                      data: data
                    }).catch(err => {
                      console.error('Error sending message to tab:', err);
                    });
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
                  activeConnections.delete(connectionKey);
                  origOnClose?.(event);
                };
                
                sendResponse({ response: true });
              }
            } catch (err) {
              // For initial connection message, we still want to proceed
              activeConnections.set(connectionKey, {
                socket: ws,
                lastUsed: Date.now(),
                tabId: sender.tab.id
              });
              
              // Set up ongoing message handling
              ws.onmessage = function(event) {
                try {
                  const data = JSON.parse(event.data);
                  browser.tabs.sendMessage(sender.tab.id, {
                    type: 'mcp-server-message',
                    serverName: serverName,
                    data: data
                  }).catch(err => {
                    console.error('Error sending message to tab:', err);
                  });
                } catch (err) {
                  console.warn('Invalid server message:', event.data);
                }
              };
              
              sendResponse({ response: true });
            }
          };

          ws.onerror = function(error) {
            console.error('WebSocket connection failed:', error);
            sendResponse({ error: 'WebSocket connection failed' });
            activeConnections.delete(connectionKey);
          };
        } catch (error) {
          console.error('Failed to create WebSocket:', error);
          sendResponse({ error: error.message });
        }
        break;
      }

      default:
        sendResponse({ error: 'Unknown method: ' + method });
    }
    
    return true;  // Required for async response
  }
  
  // Handle ongoing messages for active connections
  else if (message.type === 'mcp-client-message') {
    const { serverName, message: msg } = message;
    const connectionKey = `${serverName}-${sender.tab.id}`;
    const connection = activeConnections.get(connectionKey);
    
    if (connection) {
      try {
        connection.lastUsed = Date.now();
        const payload = msg || message.data;
        connection.socket.send(JSON.stringify(payload));
      } catch (error) {
        console.error('Failed to send message to server:', error);
        connection.socket.close();
        activeConnections.delete(connectionKey);
      }
    } else {
      console.warn('No active connection found for server:', connectionKey);
    }
  }
});

// Cleanup inactive connections periodically
setInterval(() => {
  const now = Date.now();
  for (const [connectionKey, conn] of activeConnections.entries()) {
    if (now - conn.lastUsed > 30 * 60 * 1000) { // 30 minutes
      conn.socket.close();
      activeConnections.delete(connectionKey);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes