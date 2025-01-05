'use strict';

const API_URL = "wss://127.0.0.1:5588";
const API_KEY = "abc123";

// Store active connections with their associated tab IDs
const activeConnections = new Map();

function createDebuggedWebSocket(url) {
  console.log('Creating WebSocket connection to:', url);
  const ws = new WebSocket(url);
  
  ws.onclose = (event) => {
    console.log('WebSocket closed:', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      timestamp: new Date().toISOString()
    });
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', {
      error,
      readyState: ws.readyState,
      timestamp: new Date().toISOString()
    });
  };

  return ws;
}

// Listen for messages from content scripts
const browser = globalThis.browser || globalThis.chrome;
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);  // Added logging
  if (!message?.type) return;

  if (message.type === 'claude-bridge-request') {
    const { method, args, requestId } = message;
    console.log('Handling request:', method, args, requestId);
    
    switch(method) {
      case 'listMcpServers': {
        const ws = createDebuggedWebSocket(API_URL);
        ws.onopen = function() {
          const payload = {
            "list": true,
            "key": API_KEY
          };
          console.log('Sending list payload:', payload);
          ws.send(JSON.stringify(payload));
        };

        ws.onmessage = function(event) {
          console.log('List response from server:', event.data);
          try {
            const data = JSON.parse(event.data);
            if (data.error) {
              sendResponse({ error: data.error });
            } else {
              sendResponse({ response: data });
            }
          } catch (err) {
            console.warn('Ignoring non-JSON message from server:', event.data);
            sendResponse({ error: 'Invalid server response' });
          }
          ws.close();
        };
        break;
      }

      case 'connectToMcpServer': {
        const serverName = args[0];
        console.log('Connecting to MCP server:', serverName);
        
        // Check if we already have a connection for this server and tab
        const connectionKey = `${serverName}-${sender.tab.id}`;
        if (activeConnections.has(connectionKey)) {
          console.log('Using existing connection for:', connectionKey);
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
            console.log('Socket opened, sending connect payload:', payload);
            ws.send(JSON.stringify(payload));
          };

          ws.onmessage = function(event) {
            console.log('Message from server:', serverName, event.data);
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
                  console.log('Message from server:', serverName, event.data);
                  try {
                    const data = JSON.parse(event.data);
                    // Send message to specific tab
                    browser.tabs.sendMessage(sender.tab.id, {
                      type: 'mcp-server-message',
                      serverName: serverName,
                      data: data
                    }).catch(err => {
                      console.error('Error sending tab message:', err);
                    });
                  } catch (err) {
                    console.warn('Ignoring non-JSON message from server:', event.data);
                  }
                };
                
                // Set up cleanup on connection close
                const origOnClose = ws.onclose;
                ws.onclose = function(event) {
                  console.log('Connection closed for:', connectionKey, {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                  });
                  activeConnections.delete(connectionKey);
                  origOnClose?.(event);
                };
                
                sendResponse({ response: true });
              }
            } catch (err) {
              console.warn('Ignoring non-JSON initial message from server:', event.data);
              // For initial connection message, we still want to proceed
              // Store the active connection with tab ID
              activeConnections.set(connectionKey, {
                socket: ws,
                lastUsed: Date.now(),
                tabId: sender.tab.id
              });
              
              // Set up ongoing message handling
              ws.onmessage = function(event) {
                console.log('Message from server:', serverName, event.data);
                try {
                  const data = JSON.parse(event.data);
                  // Send message to specific tab
                  browser.tabs.sendMessage(sender.tab.id, {
                    type: 'mcp-server-message',
                    serverName: serverName,
                    data: data
                  }).catch(err => {
                    console.error('Error sending tab message:', err);
                  });
                } catch (err) {
                  console.warn('Ignoring non-JSON message from server:', event.data);
                }
              };
              
              sendResponse({ response: true });
            }
          };

          ws.onerror = function(error) {
            console.error('Connection error:', error);
            sendResponse({ error: 'WebSocket connection failed' });
            activeConnections.delete(connectionKey);
          };
        } catch (error) {
          console.error('Error creating WebSocket:', error);
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
  else if (message.type === 'mcp-client-message') {  // Changed from 'mcp-message' to 'mcp-client-message'
    console.log('Handling mcp-client-message:', message);  // Added logging
    const { serverName, message: msg } = message;
    const connectionKey = `${serverName}-${sender.tab.id}`;
    const connection = activeConnections.get(connectionKey);
    
    if (connection) {
      try {
        connection.lastUsed = Date.now();
        const payload = msg || message.data;  // Handle both msg and data fields
        console.log('Sending message to server:', serverName, payload);
        connection.socket.send(JSON.stringify(payload));
      } catch (error) {
        console.error('Error sending message to server:', error);
        connection.socket.close();
        activeConnections.delete(connectionKey);
      }
    } else {
      console.warn('No active connection found for server:', connectionKey);
    }
  }
});

// Optional: Cleanup inactive connections periodically
setInterval(() => {
  const now = Date.now();
  for (const [connectionKey, conn] of activeConnections.entries()) {
    if (now - conn.lastUsed > 30 * 60 * 1000) { // 30 minutes
      console.log('Cleaning up inactive connection:', connectionKey);
      conn.socket.close();
      activeConnections.delete(connectionKey);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes