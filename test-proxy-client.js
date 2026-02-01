const net = require('net');
const os = require('os');

const username = os.userInfo().username;
const pipeName = `\\\\.\\pipe\\claude-bridge-proxy-test-${username}`;

console.log('Testing connection to:', pipeName);

const socket = net.connect(pipeName);

socket.on('connect', () => {
  console.log('SUCCESS: Connected to proxy!');

  // Send a test message in Native Messaging format
  const msg = JSON.stringify({ type: 'test', data: 'hello from test client' });
  const buf = Buffer.alloc(4 + msg.length);
  buf.writeUInt32LE(msg.length, 0);
  buf.write(msg, 4);
  socket.write(buf);
  console.log('Sent test message:', msg);

  setTimeout(() => {
    socket.end();
  }, 3000);
});

socket.on('data', (data) => {
  console.log('Received:', data.length, 'bytes');
  // Try to decode the message
  if (data.length >= 4) {
    const len = data.readUInt32LE(0);
    if (data.length >= 4 + len) {
      const json = data.slice(4, 4 + len).toString('utf8');
      console.log('Decoded message:', json);
    }
  }
});

socket.on('error', (err) => {
  console.log('Error:', err.message);
});

socket.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});

setTimeout(() => {
  console.log('Timeout, closing');
  socket.end();
}, 5000);
