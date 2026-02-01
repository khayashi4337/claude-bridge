#!/usr/bin/env node
/**
 * Native Host for Chrome Extension
 * Chrome Native Messaging protocol を処理し、Named Pipe Proxy に接続
 */

import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// ログファイル
const LOG_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'claude-bridge');
const LOG_FILE = path.join(LOG_DIR, 'native-host.log');

// ログディレクトリ作成
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {}

function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

/**
 * Chrome Native Messaging: stdin からメッセージを読み取る
 * 4バイト Little Endian 長さ + JSON
 */
class NativeMessageReader {
  private buffer = Buffer.alloc(0);
  private onMessage: (msg: Buffer) => void;

  constructor(onMessage: (msg: Buffer) => void) {
    this.onMessage = onMessage;
  }

  feed(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.process();
  }

  private process(): void {
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);

      if (this.buffer.length < 4 + length) {
        break; // 完全なメッセージがまだない
      }

      const message = this.buffer.slice(0, 4 + length);
      this.buffer = this.buffer.slice(4 + length);
      this.onMessage(message);
    }
  }
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  log('INFO', 'Native Host starting', { pid: process.pid });

  const username = os.userInfo().username;

  // 接続先の Pipe 名（プロキシまたは直接 CLI）
  // 環境変数で設定可能
  const pipeName = process.env.CLAUDE_BRIDGE_PIPE ||
    `\\\\.\\pipe\\claude-bridge-proxy-${username}`;

  log('INFO', 'Connecting to pipe', { pipeName });

  // Named Pipe に接続
  const pipeSocket = net.connect(pipeName);

  pipeSocket.on('connect', () => {
    log('INFO', 'Connected to proxy pipe');
  });

  pipeSocket.on('error', (err) => {
    log('ERROR', 'Pipe connection error', { message: err.message });

    // プロキシに接続できない場合、直接 CLI の Pipe に接続を試みる
    const fallbackPipe = `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`;
    if (pipeName !== fallbackPipe) {
      log('INFO', 'Trying fallback to CLI pipe', { fallbackPipe });
      connectToPipe(fallbackPipe);
    } else {
      process.exit(1);
    }
  });

  // stdin -> Pipe (Chrome からのメッセージをプロキシへ)
  const reader = new NativeMessageReader((message) => {
    log('DEBUG', 'Chrome -> Pipe', { size: message.length });
    pipeSocket.write(message);
  });

  process.stdin.on('data', (data) => {
    reader.feed(data);
  });

  process.stdin.on('end', () => {
    log('INFO', 'stdin closed');
    pipeSocket.end();
  });

  // Pipe -> stdout (プロキシからのメッセージを Chrome へ)
  pipeSocket.on('data', (data) => {
    log('DEBUG', 'Pipe -> Chrome', { size: data.length });
    process.stdout.write(data);
  });

  pipeSocket.on('close', () => {
    log('INFO', 'Pipe closed');
    process.exit(0);
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

/**
 * 指定された Pipe に接続する（フォールバック用）
 */
function connectToPipe(pipeName: string): void {
  log('INFO', 'Connecting to fallback pipe', { pipeName });

  const pipeSocket = net.connect(pipeName);

  pipeSocket.on('connect', () => {
    log('INFO', 'Connected to fallback pipe');
  });

  pipeSocket.on('error', (err) => {
    log('ERROR', 'Fallback pipe error', { message: err.message });
    process.exit(1);
  });

  const reader = new NativeMessageReader((message) => {
    log('DEBUG', 'Chrome -> Pipe (fallback)', { size: message.length });
    pipeSocket.write(message);
  });

  process.stdin.on('data', (data) => {
    reader.feed(data);
  });

  process.stdin.on('end', () => {
    log('INFO', 'stdin closed (fallback)');
    pipeSocket.end();
  });

  pipeSocket.on('data', (data) => {
    log('DEBUG', 'Pipe -> Chrome (fallback)', { size: data.length });
    process.stdout.write(data);
  });

  pipeSocket.on('close', () => {
    log('INFO', 'Pipe closed (fallback)');
    process.exit(0);
  });
}

main().catch((err) => {
  log('ERROR', 'Fatal error', { message: err.message });
  process.exit(1);
});
