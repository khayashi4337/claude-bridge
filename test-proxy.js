const net = require('net');
const os = require('os');

const username = os.userInfo().username;
const proxyPipeName = `\\\\.\\pipe\\claude-bridge-proxy-test-${username}`;
const targetPipeName = `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`;

console.log('Starting Named Pipe Proxy Test...');
console.log('Proxy pipe:', proxyPipeName);
console.log('Target pipe:', targetPipeName);

const server = net.createServer((clientSocket) => {
  console.log('Client connected to proxy');

  // Connect to target
  const targetSocket = net.connect(targetPipeName);

  targetSocket.on('connect', () => {
    console.log('Connected to target CLI pipe');

    // Relay data
    clientSocket.on('data', (data) => {
      console.log('Client -> Target:', data.length, 'bytes');
      targetSocket.write(data);
    });

    targetSocket.on('data', (data) => {
      console.log('Target -> Client:', data.length, 'bytes');
      clientSocket.write(data);
    });
  });

  targetSocket.on('error', (err) => {
    console.log('Target error:', err.message);
    clientSocket.destroy();
  });

  clientSocket.on('error', (err) => {
    console.log('Client error:', err.message);
    targetSocket.destroy();
  });

  clientSocket.on('close', () => {
    console.log('Client disconnected');
    targetSocket.destroy();
  });

  targetSocket.on('close', () => {
    console.log('Target disconnected');
    clientSocket.destroy();
  });
});

server.on('error', (err) => {
  console.log('Server error:', err.message);
  process.exit(1);
});

server.listen(proxyPipeName, () => {
  console.log('Proxy listening!');
  console.log('Test with: node test-proxy-client.js');
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
