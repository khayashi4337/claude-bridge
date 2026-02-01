/**
 * Wrapper Host のテスト
 * Chrome Native Messaging 形式でメッセージを送信してレスポンスを確認
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting wrapper host test...');

// Wrapper Host を起動
const wrapper = spawn('node', [path.join(__dirname, 'dist', 'wrapper-host.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

console.log('Wrapper host started with PID:', wrapper.pid);

// Native Messaging 形式でメッセージをエンコード
function encodeMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.alloc(4 + json.length);
  buf.writeUInt32LE(json.length, 0);
  buf.write(json, 4);
  return buf;
}

// レスポンスをデコード
let responseBuffer = Buffer.alloc(0);
wrapper.stdout.on('data', (data) => {
  responseBuffer = Buffer.concat([responseBuffer, data]);

  while (responseBuffer.length >= 4) {
    const length = responseBuffer.readUInt32LE(0);
    if (responseBuffer.length < 4 + length) break;

    const json = responseBuffer.slice(4, 4 + length).toString('utf8');
    console.log('Response:', json);
    responseBuffer = responseBuffer.slice(4 + length);
  }
});

wrapper.stderr.on('data', (data) => {
  console.log('Stderr:', data.toString());
});

wrapper.on('error', (err) => {
  console.log('Error:', err.message);
});

wrapper.on('exit', (code, signal) => {
  console.log('Wrapper exited:', { code, signal });
  process.exit(code || 0);
});

// テストメッセージを送信
setTimeout(() => {
  console.log('Sending test message...');

  // MCP browser bridge のテストメッセージ
  const testMsg = encodeMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
  });

  wrapper.stdin.write(testMsg);
  console.log('Sent', testMsg.length, 'bytes');
}, 1000);

// タイムアウト
setTimeout(() => {
  console.log('Test timeout, closing...');
  wrapper.stdin.end();
}, 5000);
