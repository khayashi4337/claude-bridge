/**
 * Message Bridge
 *
 * Native Host と IPC Client を橋渡し
 */

import { EventEmitter } from 'events';
import { Target, NativeMessage, IpcMessage, IpcConnection, IpcConnector } from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { NativeHost } from '../host';
import { RequestTracker } from './request-tracker';

/**
 * Bridge ステータス
 */
export interface BridgeStatus {
  /** 実行中かどうか */
  running: boolean;
  /** 現在の接続先 */
  target: Target | null;
  /** 転送したメッセージ数 */
  messagesForwarded: number;
  /** 最後のアクティビティ */
  lastActivity: Date | null;
}

/**
 * Bridge オプション
 */
export interface MessageBridgeOptions {
  /** Native Host */
  host: NativeHost;
  /** IPC Connector */
  connector: IpcConnector;
}

/**
 * Bridge イベント
 */
export interface MessageBridgeEvents {
  started: () => void;
  stopped: () => void;
  message: (direction: 'chrome-to-claude' | 'claude-to-chrome', message: unknown) => void;
  error: (error: BridgeError) => void;
}

/**
 * Message Bridge
 *
 * Chrome 拡張と Claude 製品間のメッセージを転送
 */
export class MessageBridge extends EventEmitter {
  private readonly host: NativeHost;
  private readonly connector: IpcConnector;
  private readonly tracker: RequestTracker;

  private connection: IpcConnection | null = null;
  private running = false;
  private target: Target | null = null;
  private messagesForwarded = 0;
  private lastActivity: Date | null = null;

  constructor(options: MessageBridgeOptions) {
    super();
    this.host = options.host;
    this.connector = options.connector;
    this.tracker = new RequestTracker();
  }

  /**
   * Bridge を開始
   */
  async start(target: Target): Promise<void> {
    if (this.running) {
      throw new BridgeError(
        'Bridge is already running',
        ErrorCodes.UNKNOWN,
        true
      );
    }

    this.target = target;

    // IPC 接続を確立
    try {
      this.connection = await this.connector.connect({ target });
    } catch (error) {
      throw new BridgeError(
        `Failed to connect to ${target}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCodes.CONNECTION_FAILED,
        true,
        error instanceof Error ? error : undefined
      );
    }

    // IPC イベントハンドラを設定
    this.connection.onMessage(this.handleIpcMessage.bind(this));
    this.connection.onError(this.handleError.bind(this));
    this.connection.onClose(this.handleDisconnection.bind(this));

    // Native Host イベントハンドラを設定
    this.host.on('message', this.handleNativeMessage.bind(this));
    this.host.on('error', this.handleError.bind(this));
    this.host.on('close', this.handleClose.bind(this));

    // Native Host を開始
    await this.host.start();

    this.running = true;
    this.emit('started');
  }

  /**
   * Bridge を停止
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // すべての追跡中リクエストをキャンセル
    this.tracker.cancelAll(new Error('Bridge stopped'));

    // 接続を閉じる
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    // Native Host を停止
    await this.host.stop();

    this.target = null;
    this.emit('stopped');
  }

  /**
   * ステータスを取得
   */
  getStatus(): BridgeStatus {
    return {
      running: this.running,
      target: this.target,
      messagesForwarded: this.messagesForwarded,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Chrome からのメッセージを処理
   */
  private async handleNativeMessage(message: NativeMessage): Promise<void> {
    if (!this.connection || !this.connection.isConnected()) {
      this.emit(
        'error',
        new BridgeError(
          'No active connection',
          ErrorCodes.CONNECTION_LOST,
          true
        )
      );
      return;
    }

    try {
      this.emit('message', 'chrome-to-claude', message);

      // IPC メッセージとして転送
      const ipcMessage: IpcMessage = {
        type: message.type,
        payload: message.payload,
        id: message.id,
        timestamp: Date.now(),
      };

      await this.connection.send(ipcMessage);

      this.messagesForwarded++;
      this.lastActivity = new Date();
    } catch (error) {
      this.emit(
        'error',
        new BridgeError(
          `Failed to forward message: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCodes.SEND_FAILED,
          true,
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Claude からのメッセージを処理
   */
  private async handleIpcMessage(message: IpcMessage): Promise<void> {
    this.emit('message', 'claude-to-chrome', message);

    // 追跡中のリクエストへのレスポンスかチェック
    if (message.id && this.tracker.has(message.id)) {
      this.tracker.resolve({
        type: message.type,
        payload: message.payload,
        id: message.id,
      });
    }

    // Native Host 経由で Chrome に転送
    const nativeMessage: NativeMessage = {
      type: message.type,
      payload: message.payload,
      id: message.id,
    };

    try {
      await this.host.send(nativeMessage);
      this.messagesForwarded++;
      this.lastActivity = new Date();
    } catch (error) {
      this.emit(
        'error',
        new BridgeError(
          `Failed to send to Chrome: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCodes.STDOUT_ERROR,
          true,
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * エラーを処理
   */
  private handleError(error: BridgeError): void {
    this.emit('error', error);
  }

  /**
   * IPC 切断を処理
   */
  private handleDisconnection(): void {
    this.emit(
      'error',
      new BridgeError(
        'Connection to Claude lost',
        ErrorCodes.CONNECTION_LOST,
        true
      )
    );

    // すべての追跡中リクエストをキャンセル
    this.tracker.cancelAll(new Error('Connection lost'));

    this.connection = null;
  }

  /**
   * Native Host 終了を処理
   */
  private handleClose(): void {
    this.stop();
  }
}

// EventEmitter の型付けを強化
export interface MessageBridge {
  on<K extends keyof MessageBridgeEvents>(
    event: K,
    listener: MessageBridgeEvents[K]
  ): this;
  emit<K extends keyof MessageBridgeEvents>(
    event: K,
    ...args: Parameters<MessageBridgeEvents[K]>
  ): boolean;
}
