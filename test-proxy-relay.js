/**
 * Proxy Relay Test
 *
 * プロキシが CLI の Pipe に正しくリレーできるかテスト:
 * 1. プロキシは別の Pipe 名で待機
 * 2. クライアントがプロキシに接続
 * 3. プロキシが CLI の Pipe に接続してリレー
 */

const net = require('net');
const os = require('os');

const username = os.userInfo().username;
const PROXY_PIPE = `\\\\.\\pipe\\claude-bridge-test-${username}`;
const CLI_PIPE = `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`;

console.log('=== Proxy Relay Test ===');
console.log('Proxy pipe:', PROXY_PIPE);
console.log('CLI pipe:', CLI_PIPE);

// 1. プロキシサーバーを起動
const proxyServer = net.createServer((clientSocket) => {
  console.log('[Proxy] Client connected');

  // CLI に接続
  const cliSocket = net.connect(CLI_PIPE);

  cliSocket.on('connect', () => {
    console.log('[Proxy] Connected to CLI pipe');

    // 双方向リレー
    clientSocket.on('data', (data) => {
      console.log('[Proxy] Client -> CLI:', data.length, 'bytes');
      cliSocket.write(data);
    });

    cliSocket.on('data', (data) => {
      console.log('[Proxy] CLI -> Client:', data.length, 'bytes');
      clientSocket.write(data);
    });
  });

  cliSocket.on('error', (err) => {
    console.log('[Proxy] CLI connection error:', err.message);
    clientSocket.destroy();
  });

  cliSocket.on('close', () => {
    console.log('[Proxy] CLI disconnected');
    clientSocket.destroy();
  });

  clientSocket.on('close', () => {
    console.log('[Proxy] Client disconnected');
    cliSocket.destroy();
  });

  clientSocket.on('error', (err) => {
    console.log('[Proxy] Client error:', err.message);
  });
});

proxyServer.on('error', (err) => {
  console.log('[Proxy] Server error:', err.message);
  process.exit(1);
});

proxyServer.listen(PROXY_PIPE, () => {
  console.log('[Proxy] Listening on proxy pipe');
  console.log('[Proxy] Waiting for client...');

  // 2. テストクライアントを起動（プロキシ経由で CLI と通信）
  setTimeout(() => {
    console.log('');
    console.log('=== Starting test client ===');

    const client = net.connect(PROXY_PIPE);

    client.on('connect', () => {
      console.log('[Client] Connected to proxy');

      // MCP initialize メッセージを送信
      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });

      const buf = Buffer.alloc(4 + msg.length);
      buf.writeUInt32LE(msg.length, 0);
      buf.write(msg, 4);

      console.log('[Client] Sending initialize request...');
      client.write(buf);
    });

    let responseBuffer = Buffer.alloc(0);
    client.on('data', (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);

      while (responseBuffer.length >= 4) {
        const len = responseBuffer.readUInt32LE(0);
        if (responseBuffer.length < 4 + len) break;

        const json = responseBuffer.slice(4, 4 + len).toString('utf8');
        console.log('[Client] Response:', json);
        responseBuffer = responseBuffer.slice(4 + len);
      }
    });

    client.on('error', (err) => {
      console.log('[Client] Error:', err.message);
    });

    client.on('close', () => {
      console.log('[Client] Disconnected');
      cleanup();
    });

    // 5秒後にクリーンアップ
    setTimeout(() => {
      console.log('[Client] Timeout, closing...');
      client.end();
    }, 5000);

  }, 500);
});

function cleanup() {
  console.log('Cleaning up...');
  proxyServer.close(() => {
    console.log('Done');
    process.exit(0);
  });
}

// Ctrl+C でクリーンアップ
process.on('SIGINT', cleanup);
