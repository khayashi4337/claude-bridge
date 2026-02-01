const net = require('net');
const os = require('os');
const username = os.userInfo().username;
const pipeName = `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`;
console.log('Checking pipe:', pipeName);
const socket = net.connect(pipeName);
socket.on('connect', () => {
  console.log('Pipe exists and accepting connections!');
  socket.end();
  process.exit(0);
});
socket.on('error', (err) => {
  console.log('Error:', err.code, '-', err.message);
  process.exit(1);
});
