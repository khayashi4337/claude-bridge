/**
 * Client Host のテスト
 * Chrome Native Messaging をシミュレートして CLI と通信
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('=== Client Host Test ===');

// Client Host を起動
const host = spawn('node', [path.join(__dirname, 'dist', 'client-host.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

console.log('Client Host started with PID:', host.pid);

// エンコード
function encodeMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.alloc(4 + json.length);
  buf.writeUInt32LE(json.length, 0);
  buf.write(json, 4);
  return buf;
}

// レスポンス処理
let responseBuffer = Buffer.alloc(0);
host.stdout.on('data', (data) => {
  responseBuffer = Buffer.concat([responseBuffer, data]);

  while (responseBuffer.length >= 4) {
    const len = responseBuffer.readUInt32LE(0);
    if (responseBuffer.length < 4 + len) break;

    const json = responseBuffer.slice(4, 4 + len).toString('utf8');
    console.log('Response:', json);
    responseBuffer = responseBuffer.slice(4 + len);
  }
});

host.stderr.on('data', (data) => {
  console.log('Stderr:', data.toString().trim());
});

host.on('error', (err) => {
  console.log('Error:', err.message);
});

host.on('exit', (code, signal) => {
  console.log('Host exited:', { code, signal });
  process.exit(code || 0);
});

// テストメッセージを送信
setTimeout(() => {
  console.log('');
  console.log('Sending test message (browser/list_tabs)...');

  // MCP browser/list_tabs リクエスト
  const msg = encodeMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'browser/list_tabs',
    params: {},
  });

  host.stdin.write(msg);
  console.log('Sent', msg.length, 'bytes');
}, 1000);

// タイムアウト
setTimeout(() => {
  console.log('');
  console.log('Test timeout, closing...');
  host.stdin.end();
}, 5000);
