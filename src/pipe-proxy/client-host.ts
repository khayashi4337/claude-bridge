#!/usr/bin/env node
/**
 * Client Host - CLI の Named Pipe にクライアントとして接続する Native Host
 *
 * 従来の Native Host は Pipe を作成しようとするが、これは CLI も同様のため競合する。
 * このホストは CLI が作成した Pipe にクライアントとして接続することで競合を回避する。
 *
 * 処理フロー:
 * 1. Chrome Extension が stdin/stdout で Native Messaging
 * 2. 本ホストは CLI の Named Pipe にクライアントとして接続
 * 3. Chrome ↔ Pipe ↔ CLI でメッセージをリレー
 */

import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// 設定
const CONFIG_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'claude-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LOG_FILE = path.join(CONFIG_DIR, 'client-host.log');

interface Config {
  target: 'cli' | 'desktop';
  pipes: {
    cli: string;
    desktop: string;
  };
}

const DEFAULT_USERNAME = os.userInfo().username;
const DEFAULT_CONFIG: Config = {
  target: 'cli',
  pipes: {
    cli: `\\\\.\\pipe\\claude-mcp-browser-bridge-${DEFAULT_USERNAME}`,
    desktop: '', // Desktop の Pipe 名（要調査）
  },
};

// ログディレクトリ作成
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch {}

function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

/**
 * 設定を読み込む
 */
function loadConfig(): Config {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    // デフォルト設定を保存
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    } catch {}
    return DEFAULT_CONFIG;
  }
}

/**
 * Native Messaging メッセージパーサー
 */
class MessageParser {
  private buffer = Buffer.alloc(0);

  parse(data: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const messages: Buffer[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + length) break;

      messages.push(this.buffer.slice(0, 4 + length));
      this.buffer = this.buffer.slice(4 + length);
    }

    return messages;
  }
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  log('INFO', 'Client Host starting', { pid: process.pid });

  const config = loadConfig();
  log('INFO', 'Config loaded', { target: config.target });

  // ターゲットの Pipe 名を取得
  const pipeName = config.target === 'desktop' ? config.pipes.desktop : config.pipes.cli;

  if (!pipeName) {
    log('ERROR', 'No pipe configured for target', { target: config.target });
    process.exit(1);
  }

  log('INFO', 'Connecting to CLI pipe', { pipeName });

  // CLI の Named Pipe に接続（クライアントとして）
  const pipeSocket = net.connect(pipeName);
  const chromeParser = new MessageParser();
  const pipeParser = new MessageParser();

  pipeSocket.on('connect', () => {
    log('INFO', 'Connected to CLI pipe');

    // Chrome stdin -> CLI Pipe
    process.stdin.on('data', (data) => {
      const messages = chromeParser.parse(data);
      for (const msg of messages) {
        log('DEBUG', 'Chrome -> CLI', { size: msg.length });
        pipeSocket.write(msg);
      }
    });

    // CLI Pipe -> Chrome stdout
    pipeSocket.on('data', (data) => {
      const messages = pipeParser.parse(data);
      for (const msg of messages) {
        log('DEBUG', 'CLI -> Chrome', { size: msg.length });
        process.stdout.write(msg);
      }
    });
  });

  pipeSocket.on('error', (err) => {
    log('ERROR', 'Pipe connection error', { message: err.message });

    // CLI が起動していない場合のエラーメッセージ
    if (err.message.includes('ENOENT') || err.message.includes('ECONNREFUSED')) {
      const errorResponse = JSON.stringify({
        error: {
          code: -32000,
          message: 'Claude CLI is not running. Please start Claude Code first.',
        },
      });
      const buf = Buffer.alloc(4 + errorResponse.length);
      buf.writeUInt32LE(errorResponse.length, 0);
      buf.write(errorResponse, 4);
      process.stdout.write(buf);
    }

    process.exit(1);
  });

  pipeSocket.on('close', () => {
    log('INFO', 'Pipe closed');
    process.exit(0);
  });

  process.stdin.on('end', () => {
    log('INFO', 'stdin closed');
    pipeSocket.end();
  });

  // シグナルハンドリング
  process.on('SIGINT', () => {
    log('INFO', 'SIGINT received');
    pipeSocket.end();
  });

  process.on('SIGTERM', () => {
    log('INFO', 'SIGTERM received');
    pipeSocket.end();
  });
}

main().catch((err) => {
  log('ERROR', 'Fatal error', { message: err instanceof Error ? err.message : 'Unknown' });
  process.exit(1);
});
