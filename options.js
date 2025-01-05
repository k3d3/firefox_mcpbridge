// Default values
const DEFAULT_API_URL = "wss://127.0.0.1:5588";
const DEFAULT_API_KEY = "abc123";

// Function to generate unique request IDs
function generateRequestId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Promise wrapper for bridge requests
function sendBridgeRequest(method, args = []) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    console.log(`Sending bridge request: ${method}`, { requestId, args });
    
    function handleResponse(event) {
      if (event.data?.type === 'claude-bridge-response' && event.data.requestId === requestId) {
        console.log(`Received bridge response for ${method}:`, event.data);
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
      method,
      args,
      requestId
    }, '*');
  });
}

// Promise wrapper for MCP server messages
function sendServerRequest(serverName, message) {
  return new Promise((resolve, reject) => {
    const msgId = message.id || generateRequestId();
    message.id = msgId;
    console.log(`Sending server request to ${serverName}:`, message);
    
    function handleResponse(event) {
      if (event.data?.type === 'mcp-server-message' && 
          event.data.serverName === serverName &&
          event.data.data?.id === msgId) {
        console.log(`Received server response from ${serverName}:`, event.data);
        window.removeEventListener('message', handleResponse);
        
        const response = event.data.data;
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      }
    }
    
    window.addEventListener('message', handleResponse);
    
    window.postMessage({
      type: 'mcp-client-message',
      serverName,
      data: message
    }, '*');
  });
}

// Function to initialize an MCP server
async function initializeServer(serverName) {
  console.log(`Initializing server: ${serverName}`);
  
  const initRequest = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      clientInfo: {
        name: "claude-bridge-options",
        version: "1.0.0"
      },
      capabilities: {},
      protocolVersion: "0.6"
    }
  };
  
  await sendServerRequest(serverName, initRequest);
  console.log(`Server initialized: ${serverName}`);
  
  // Send initialized notification
  window.postMessage({
    type: 'mcp-client-message',
    serverName,
    data: {
      jsonrpc: "2.0",
      method: "initialized"
    }
  }, '*');
}

// Function to get tools from a server
async function getServerTools(serverName) {
  console.log(`Getting tools for server: ${serverName}`);
  
  const toolsRequest = {
    jsonrpc: "2.0",
    method: "tools/list"
  };
  
  const response = await sendServerRequest(serverName, toolsRequest);
  console.log(`Got tools for ${serverName}:`, response);
  return response.tools || [];
}

// Main function to get all tools from all servers
async function getAllServerTools() {
  try {
    console.log('Starting tool discovery...');
    
    // Get list of servers
    const servers = await sendBridgeRequest('listMcpServers');
    console.log('Got server list:', servers);
    
    if (!Array.isArray(servers)) {
      throw new Error('Invalid server list response');
    }
    
    if (servers.length === 0) {
      throw new Error('No servers found');
    }
    
    const allTools = [];
    
    // Connect to each server and get its tools
    for (const serverName of servers) {
      try {
        console.log(`Processing server: ${serverName}`);
        
        // Connect to server
        await sendBridgeRequest('connectToMcpServer', [serverName]);
        console.log(`Connected to server: ${serverName}`);
        
        // Initialize server
        await initializeServer(serverName);
        
        // Get tools
        const tools = await getServerTools(serverName);
        
        // Add server name to each tool
        tools.forEach(tool => {
          allTools.push({
            serverName,
            ...tool
          });
        });
        
      } catch (error) {
        console.error(`Error getting tools from server ${serverName}:`, error);
        // Continue with other servers
      }
    }
    
    console.log('All tools discovered:', allTools);
    return allTools;
    
  } catch (error) {
    console.error('Error getting server tools:', error);
    throw error;
  }
}

// Save options to browser.storage
function saveOptions(e) {
  e.preventDefault();
  const status = document.getElementById('status');
  
  const autoApproveTools = document.getElementById('autoApproveTools').value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  browser.storage.local.set({
    apiUrl: document.getElementById('apiUrl').value || DEFAULT_API_URL,
    apiKey: document.getElementById('apiKey').value || DEFAULT_API_KEY,
    autoApproveTools: autoApproveTools
  }).then(() => {
    status.textContent = 'Settings saved successfully!';
    status.className = 'success';
    status.style.visibility = 'visible';
    setTimeout(() => {
      status.style.visibility = 'hidden';
    }, 3000);
  }).catch((error) => {
    status.textContent = 'Error saving settings: ' + error;
    status.className = 'error';
    status.style.visibility = 'visible';
  });
}

// Restore options from browser.storage
function restoreOptions() {
  browser.storage.local.get({
    apiUrl: DEFAULT_API_URL,
    apiKey: DEFAULT_API_KEY,
    autoApproveTools: []
  }).then((items) => {
    document.getElementById('apiUrl').value = items.apiUrl;
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('autoApproveTools').value = items.autoApproveTools.join('\n');
  }).catch((error) => {
    console.error('Error loading settings:', error);
  });
}

// Handle getting available tools
async function handleGetTools() {
  const status = document.getElementById('status');
  const toolList = document.getElementById('toolList');
  
  try {
    status.textContent = 'Getting tools...';
    status.className = '';
    status.style.visibility = 'visible';
    toolList.style.display = 'none';
    
    console.log('Getting tools...');
    const tools = await getAllServerTools();
    console.log('Got tools:', tools);
    
    if (tools.length === 0) {
      status.textContent = 'No tools found';
      status.className = 'error';
      return;
    }
    
    // Group tools by server
    const toolsByServer = tools.reduce((acc, tool) => {
      if (!acc[tool.serverName]) {
        acc[tool.serverName] = [];
      }
      acc[tool.serverName].push(tool.name);
      return acc;
    }, {});
    
    // Display tools
    toolList.innerHTML = '';
    for (const [server, serverTools] of Object.entries(toolsByServer)) {
      const serverHeader = document.createElement('h3');
      serverHeader.textContent = server;
      toolList.appendChild(serverHeader);
      
      serverTools.forEach(toolName => {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-item';
        toolDiv.textContent = toolName;
        
        // Add click handler
        toolDiv.addEventListener('click', () => {
          const autoApproveBox = document.getElementById('autoApproveTools');
          const fullToolName = `${server}-${toolName}`;
          
          // Get current content and add new tool name
          const currentTools = autoApproveBox.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          
          // Only add if not already present
          if (!currentTools.includes(fullToolName)) {
            currentTools.push(fullToolName);
            autoApproveBox.value = currentTools.join('\n');
            
            // Trigger save
            const saveEvent = new Event('submit');
            saveOptions(saveEvent);
          }
        });
        
        toolList.appendChild(toolDiv);
      });
    }
    
    toolList.style.display = 'block';
    status.style.visibility = 'hidden';
    
  } catch (error) {
    console.error('Error in handleGetTools:', error);
    status.textContent = 'Error getting tools: ' + error;
    status.className = 'error';
    status.style.visibility = 'visible';
  }
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('getTools').addEventListener('click', handleGetTools);