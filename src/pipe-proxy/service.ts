#!/usr/bin/env node
/**
 * Claude Bridge Service
 *
 * バックグラウンドで動作し、Named Pipe を管理するサービス。
 * CLI セッションと Native Host の両方がこのサービスに接続する。
 *
 * 動作モード:
 * 1. CLI_FIRST: CLI セッションが起動時に接続、Native Host は Pipe 作成失敗時にフォールバック
 * 2. PROXY: サービスが Pipe を所有、両方がクライアントとして接続
 *
 * 現在の制約:
 * - Claude Code CLI のソースを変更できないため、CLI が Pipe を作成する動作は変えられない
 * - Native Host も同様に Pipe を作成しようとする
 *
 * このサービスは、CLI が起動していない状態で Native Host をテストするために使用
 */

import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// 設定
const CONFIG_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'claude-bridge');
const LOG_FILE = path.join(CONFIG_DIR, 'service.log');
const PIPE_NAME_TEMPLATE = '\\\\.\\pipe\\claude-mcp-browser-bridge-{username}';

try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch {}

function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  console.log(line.trim());
}

/**
 * メッセージパーサー（Native Messaging 形式）
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
 * Claude Bridge Service
 */
class ClaudeBridgeService {
  private server: net.Server | null = null;
  private connections: Map<number, { socket: net.Socket; type: 'cli' | 'native-host' | 'unknown'; parser: MessageParser }> = new Map();
  private connectionIdCounter = 0;
  private cliConnection: net.Socket | null = null;
  private nativeHostConnection: net.Socket | null = null;

  constructor(private readonly pipeName: string) {}

  async start(): Promise<void> {
    log('INFO', 'Starting Claude Bridge Service', { pipeName: this.pipeName });

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (err) => {
      log('ERROR', 'Server error', { message: err.message });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.pipeName, () => {
        log('INFO', 'Service listening on Named Pipe');
        resolve();
      });
      this.server!.on('error', reject);
    });

    log('INFO', 'Service started successfully');
  }

  private handleConnection(socket: net.Socket): void {
    const connId = ++this.connectionIdCounter;
    const parser = new MessageParser();

    log('INFO', 'New connection', { connId });

    this.connections.set(connId, { socket, type: 'unknown', parser });

    socket.on('data', (data) => {
      const conn = this.connections.get(connId);
      if (!conn) return;

      const messages = conn.parser.parse(data);
      for (const msg of messages) {
        this.handleMessage(connId, msg);
      }
    });

    socket.on('close', () => {
      log('INFO', 'Connection closed', { connId });
      const conn = this.connections.get(connId);
      if (conn) {
        if (conn.socket === this.cliConnection) {
          this.cliConnection = null;
          log('INFO', 'CLI disconnected');
        }
        if (conn.socket === this.nativeHostConnection) {
          this.nativeHostConnection = null;
          log('INFO', 'Native Host disconnected');
        }
      }
      this.connections.delete(connId);
    });

    socket.on('error', (err) => {
      log('ERROR', 'Connection error', { connId, message: err.message });
    });
  }

  private handleMessage(connId: number, message: Buffer): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    // メッセージをデコードして送信元を推測
    try {
      const length = message.readUInt32LE(0);
      const json = JSON.parse(message.slice(4, 4 + length).toString('utf8'));

      log('DEBUG', 'Message received', {
        connId,
        type: conn.type,
        method: json.method,
        size: message.length,
      });

      // メッセージを転送
      // Native Host -> CLI
      // CLI -> Native Host
      if (conn.type === 'unknown') {
        // 最初のメッセージで送信元を判断
        if (json.method && (json.method.startsWith('browser/') || json.method === 'initialize')) {
          // CLI からのリクエスト
          conn.type = 'cli';
          this.cliConnection = conn.socket;
          log('INFO', 'Identified as CLI connection', { connId });
        } else {
          // Native Host からのレスポンス
          conn.type = 'native-host';
          this.nativeHostConnection = conn.socket;
          log('INFO', 'Identified as Native Host connection', { connId });
        }
      }

      // メッセージ転送
      if (conn.type === 'cli' && this.nativeHostConnection) {
        this.nativeHostConnection.write(message);
        log('DEBUG', 'Forwarded CLI -> Native Host', { size: message.length });
      } else if (conn.type === 'native-host' && this.cliConnection) {
        this.cliConnection.write(message);
        log('DEBUG', 'Forwarded Native Host -> CLI', { size: message.length });
      } else {
        log('WARN', 'No target for message', { connId, type: conn.type });
      }

    } catch (err) {
      log('ERROR', 'Failed to parse message', { connId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  async stop(): Promise<void> {
    log('INFO', 'Stopping service');

    for (const [connId, conn] of this.connections) {
      conn.socket.destroy();
      this.connections.delete(connId);
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    log('INFO', 'Service stopped');
  }
}

// メイン
async function main(): Promise<void> {
  const username = os.userInfo().username;
  const pipeName = PIPE_NAME_TEMPLATE.replace('{username}', username);

  log('INFO', 'Claude Bridge Service starting', {
    username,
    pipeName,
    pid: process.pid,
  });

  const service = new ClaudeBridgeService(pipeName);

  process.on('SIGINT', async () => {
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await service.stop();
    process.exit(0);
  });

  try {
    await service.start();
    log('INFO', 'Service is running. Press Ctrl+C to stop.');
  } catch (err) {
    log('ERROR', 'Failed to start service', { message: err instanceof Error ? err.message : 'Unknown' });
    process.exit(1);
  }
}

main();
