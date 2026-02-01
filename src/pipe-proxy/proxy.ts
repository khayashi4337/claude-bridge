/**
 * Named Pipe Proxy
 * Chrome Native Host と Claude CLI の間でメッセージを中継するプロキシ
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import * as os from 'os';

export interface ProxyOptions {
  /** プロキシが作成する Pipe 名（Native Host が接続する先） */
  proxyPipeName?: string;
  /** 転送先の Pipe 名（CLI が作成した Pipe） */
  targetPipeName?: string;
  /** ユーザー名（Pipe 名に使用） */
  username?: string;
}

export interface ProxyEvents {
  'listening': () => void;
  'connection': (clientId: number) => void;
  'connected-to-target': (clientId: number) => void;
  'data-from-client': (clientId: number, data: Buffer) => void;
  'data-from-target': (clientId: number, data: Buffer) => void;
  'client-disconnected': (clientId: number) => void;
  'target-disconnected': (clientId: number) => void;
  'error': (error: Error) => void;
}

export class NamedPipeProxy extends EventEmitter {
  private server: net.Server | null = null;
  private connections: Map<number, { client: net.Socket; target: net.Socket | null }> = new Map();
  private connectionIdCounter = 0;
  private readonly proxyPipeName: string;
  private readonly targetPipeName: string;

  constructor(options: ProxyOptions = {}) {
    super();

    const username = options.username || os.userInfo().username;
    this.proxyPipeName = options.proxyPipeName ||
      `\\\\.\\pipe\\claude-bridge-proxy-${username}`;
    this.targetPipeName = options.targetPipeName ||
      `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`;
  }

  /**
   * プロキシを開始
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Proxy already running'));
        return;
      }

      this.server = net.createServer((clientSocket) => {
        this.handleClientConnection(clientSocket);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.proxyPipeName, () => {
        this.emit('listening');
        resolve();
      });
    });
  }

  /**
   * クライアント（Native Host）からの接続を処理
   */
  private handleClientConnection(clientSocket: net.Socket): void {
    const clientId = ++this.connectionIdCounter;

    this.connections.set(clientId, { client: clientSocket, target: null });
    this.emit('connection', clientId);

    // ターゲット（CLI の Pipe）に接続
    const targetSocket = net.connect(this.targetPipeName);

    targetSocket.on('connect', () => {
      const conn = this.connections.get(clientId);
      if (conn) {
        conn.target = targetSocket;
      }
      this.emit('connected-to-target', clientId);

      // 双方向のデータ中継を開始
      this.setupRelay(clientId, clientSocket, targetSocket);
    });

    targetSocket.on('error', (err) => {
      this.emit('error', new Error(`Target connection error for client ${clientId}: ${err.message}`));
      clientSocket.destroy();
      this.connections.delete(clientId);
    });

    clientSocket.on('error', (err) => {
      this.emit('error', new Error(`Client ${clientId} error: ${err.message}`));
      targetSocket.destroy();
      this.connections.delete(clientId);
    });
  }

  /**
   * クライアントとターゲット間のデータ中継を設定
   */
  private setupRelay(clientId: number, clientSocket: net.Socket, targetSocket: net.Socket): void {
    // クライアント → ターゲット
    clientSocket.on('data', (data) => {
      this.emit('data-from-client', clientId, data);
      targetSocket.write(data);
    });

    // ターゲット → クライアント
    targetSocket.on('data', (data) => {
      this.emit('data-from-target', clientId, data);
      clientSocket.write(data);
    });

    // クライアント切断
    clientSocket.on('close', () => {
      this.emit('client-disconnected', clientId);
      targetSocket.destroy();
      this.connections.delete(clientId);
    });

    // ターゲット切断
    targetSocket.on('close', () => {
      this.emit('target-disconnected', clientId);
      clientSocket.destroy();
      this.connections.delete(clientId);
    });
  }

  /**
   * プロキシを停止
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // すべての接続を閉じる
      for (const [clientId, conn] of this.connections) {
        conn.client.destroy();
        conn.target?.destroy();
        this.connections.delete(clientId);
      }

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 現在のプロキシ Pipe 名を取得
   */
  getProxyPipeName(): string {
    return this.proxyPipeName;
  }

  /**
   * 現在のターゲット Pipe 名を取得
   */
  getTargetPipeName(): string {
    return this.targetPipeName;
  }

  /**
   * アクティブな接続数を取得
   */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }
}
