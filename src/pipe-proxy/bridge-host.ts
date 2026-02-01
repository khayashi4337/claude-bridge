#!/usr/bin/env node
/**
 * Bridge Host - Chrome Native Host replacement with proxy support
 *
 * このホストは以下を行います:
 * 1. Chrome Native Messaging (stdin/stdout) を処理
 * 2. Named Pipe を作成して CLI セッションからの接続を待機
 * 3. ターゲット (CLI/Desktop) への接続をルーティング
 */

import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

// 設定
const CONFIG = {
  logDir: path.join(process.env.APPDATA || process.env.HOME || '.', 'claude-bridge'),
  pipeNameTemplate: '\\\\.\\pipe\\claude-mcp-browser-bridge-{username}',
  targets: {
    cli: {
      // Claude Code CLI の Native Host
      command: process.env.CLAUDE_CLI_NODE || 'node',
      args: (cliPath: string) => [cliPath, '--chrome-native-host'],
    },
    desktop: {
      // Claude Desktop の Native Host (存在する場合)
      command: '',
      args: () => [] as string[],
    },
  },
};

// ログファイル設定
const LOG_FILE = path.join(CONFIG.logDir, 'bridge-host.log');
try {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
} catch {}

function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  // デバッグ時は stderr にも出力
  if (process.env.DEBUG) {
    process.stderr.write(line);
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
 * メッセージをエンコード
 */
function encodeMessage(obj: unknown): Buffer {
  const json = JSON.stringify(obj);
  const jsonBuffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

/**
 * メッセージをデコード
 */
function decodeMessage(buffer: Buffer): unknown | null {
  if (buffer.length < 4) return null;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;
  return JSON.parse(buffer.slice(4, 4 + length).toString('utf8'));
}

/**
 * ターゲット設定を読み込む
 */
function loadTargetConfig(): 'cli' | 'desktop' {
  const configFile = path.join(CONFIG.logDir, 'target.json');
  try {
    const content = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(content);
    return config.target || 'cli';
  } catch {
    return 'cli'; // デフォルトは CLI
  }
}

/**
 * Bridge Host メインクラス
 */
class BridgeHost {
  private pipeServer: net.Server | null = null;
  private cliConnection: net.Socket | null = null;
  private chromeParser = new MessageParser();
  private cliParser = new MessageParser();
  private targetProcess: ChildProcess | null = null;

  constructor(private readonly username: string) {}

  /**
   * ホストを起動
   */
  async start(): Promise<void> {
    log('INFO', 'Bridge Host starting', {
      username: this.username,
      pid: process.pid,
    });

    // Named Pipe サーバーを作成（CLI セッションからの接続を待機）
    const pipeName = CONFIG.pipeNameTemplate.replace('{username}', this.username);
    log('INFO', 'Creating Named Pipe', { pipeName });

    this.pipeServer = net.createServer((socket) => {
      this.handleCliConnection(socket);
    });

    this.pipeServer.on('error', (err) => {
      log('ERROR', 'Pipe server error', { message: err.message });
    });

    // Pipe サーバーを起動
    await new Promise<void>((resolve, reject) => {
      this.pipeServer!.listen(pipeName, () => {
        log('INFO', 'Named Pipe server listening');
        resolve();
      });
      this.pipeServer!.on('error', reject);
    });

    // Chrome stdin からのメッセージを処理
    process.stdin.on('data', (data) => {
      this.handleChromeMessage(data);
    });

    process.stdin.on('end', () => {
      log('INFO', 'Chrome stdin closed');
      this.shutdown();
    });

    // シグナルハンドリング
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    log('INFO', 'Bridge Host ready');
  }

  /**
   * CLI セッションからの接続を処理
   */
  private handleCliConnection(socket: net.Socket): void {
    log('INFO', 'CLI session connected');

    if (this.cliConnection) {
      log('WARN', 'Previous CLI connection exists, closing');
      this.cliConnection.destroy();
    }

    this.cliConnection = socket;

    socket.on('data', (data) => {
      // CLI からのメッセージを Chrome に転送
      const messages = this.cliParser.parse(data);
      for (const msg of messages) {
        log('DEBUG', 'CLI -> Chrome', { size: msg.length });
        process.stdout.write(msg);
      }
    });

    socket.on('close', () => {
      log('INFO', 'CLI session disconnected');
      this.cliConnection = null;
    });

    socket.on('error', (err) => {
      log('ERROR', 'CLI connection error', { message: err.message });
    });
  }

  /**
   * Chrome からのメッセージを処理
   */
  private handleChromeMessage(data: Buffer): void {
    const messages = this.chromeParser.parse(data);

    for (const msg of messages) {
      log('DEBUG', 'Chrome -> CLI', { size: msg.length });

      // CLI セッションに転送
      if (this.cliConnection) {
        this.cliConnection.write(msg);
      } else {
        log('WARN', 'No CLI connection, message dropped');

        // エラーレスポンスを Chrome に送信
        const decoded = decodeMessage(msg);
        if (decoded && typeof decoded === 'object' && 'id' in decoded) {
          const errorResponse = encodeMessage({
            id: (decoded as { id: unknown }).id,
            error: 'No CLI session connected',
          });
          process.stdout.write(errorResponse);
        }
      }
    }
  }

  /**
   * シャットダウン
   */
  private shutdown(): void {
    log('INFO', 'Shutting down');

    if (this.cliConnection) {
      this.cliConnection.destroy();
      this.cliConnection = null;
    }

    if (this.pipeServer) {
      this.pipeServer.close();
      this.pipeServer = null;
    }

    if (this.targetProcess) {
      this.targetProcess.kill();
      this.targetProcess = null;
    }

    process.exit(0);
  }
}

// メイン
async function main(): Promise<void> {
  const username = os.userInfo().username;
  const host = new BridgeHost(username);

  try {
    await host.start();
  } catch (err) {
    log('ERROR', 'Failed to start', { message: err instanceof Error ? err.message : 'Unknown' });
    process.exit(1);
  }
}

main();
