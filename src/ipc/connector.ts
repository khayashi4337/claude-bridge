/**
 * IPC Connector
 *
 * Claude Desktop/CLI への接続を管理
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import {
  Target,
  IpcMessage,
  IpcConnection,
  IpcConnectionOptions,
  IpcConnector,
  getIpcPath,
} from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { MessageParser } from '../host/message-parser';

/**
 * IPC 接続の実装
 */
class IpcConnectionImpl extends EventEmitter implements IpcConnection {
  private readonly parser: MessageParser;
  private socket: net.Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private connected = false;

  constructor(private readonly target: Target) {
    super();
    this.parser = new MessageParser();
  }

  /**
   * 接続を確立
   */
  async connect(path: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(
          new BridgeError(
            `Connection timeout to ${path}`,
            ErrorCodes.TIMEOUT,
            true
          )
        );
      }, timeout);

      this.socket = net.createConnection(path);

      this.socket.on('connect', () => {
        clearTimeout(timer);
        this.connected = true;
        resolve();
      });

      this.socket.on('data', this.handleData.bind(this));

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('close');
      });

      this.socket.on('error', (error: Error) => {
        clearTimeout(timer);
        this.connected = false;

        const bridgeError = new BridgeError(
          `Connection failed to ${path}: ${error.message}`,
          ErrorCodes.CONNECTION_FAILED,
          true,
          error
        );

        if (!this.socket?.connecting) {
          this.emit('error', bridgeError);
        } else {
          reject(bridgeError);
        }
      });
    });
  }

  /**
   * メッセージ送信
   */
  async send(message: IpcMessage): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new BridgeError(
        'Not connected',
        ErrorCodes.SEND_FAILED,
        true
      );
    }

    const buffer = this.parser.encode(message);

    return new Promise((resolve, reject) => {
      this.socket!.write(buffer, (error) => {
        if (error) {
          reject(
            new BridgeError(
              `Send failed: ${error.message}`,
              ErrorCodes.SEND_FAILED,
              true,
              error
            )
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * メッセージ受信ハンドラ登録
   */
  onMessage(handler: (msg: IpcMessage) => void): void {
    this.on('message', handler);
  }

  /**
   * エラーハンドラ登録
   */
  onError(handler: (err: BridgeError) => void): void {
    this.on('error', handler);
  }

  /**
   * 切断ハンドラ登録
   */
  onClose(handler: () => void): void {
    this.on('close', handler);
  }

  /**
   * 接続を閉じる
   */
  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * 接続状態確認
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 接続先ターゲット取得
   */
  getTarget(): Target {
    return this.target;
  }

  /**
   * データ受信処理
   */
  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      const { messages, remaining } = this.parser.decodeAll(this.buffer);
      this.buffer = remaining;

      for (const message of messages) {
        this.emit('message', message as IpcMessage);
      }
    } catch (error) {
      if (error instanceof BridgeError) {
        this.emit('error', error);
      } else {
        this.emit(
          'error',
          new BridgeError(
            error instanceof Error ? error.message : 'Unknown error',
            ErrorCodes.PARSE_ERROR,
            false
          )
        );
      }
    }
  }
}

/**
 * IPC Connector 実装
 */
export class IpcConnectorImpl implements IpcConnector {
  private static readonly DEFAULT_TIMEOUT = 5000;

  /**
   * 接続を確立
   */
  async connect(options: IpcConnectionOptions): Promise<IpcConnection> {
    const { target, timeout = IpcConnectorImpl.DEFAULT_TIMEOUT, customPath } = options;

    const path = getIpcPath(target, customPath);
    const connection = new IpcConnectionImpl(target);

    await connection.connect(path, timeout);

    return connection;
  }
}

/**
 * IpcConnector を作成
 */
export function createConnector(): IpcConnector {
  return new IpcConnectorImpl();
}
