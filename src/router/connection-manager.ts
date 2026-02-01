/**
 * Connection Manager
 *
 * 動的接続切り替え管理
 */

import { EventEmitter } from 'events';
import { Target, IpcConnection, IpcConnector } from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { BridgeConfig } from '../config';
import { Router } from './router';

/**
 * ConnectionManager イベント
 */
export interface ConnectionManagerEvents {
  connected: (target: Target) => void;
  disconnected: (reason: string) => void;
  switched: (from: Target, to: Target, reason: string) => void;
  error: (error: BridgeError) => void;
}

/**
 * Connection Manager
 */
export class ConnectionManager extends EventEmitter {
  private connection: IpcConnection | null = null;
  private currentTarget: Target | null = null;
  private reconnecting = false;
  private maxRetries = 3;

  constructor(
    private readonly router: Router,
    private readonly connector: IpcConnector,
    private readonly config: BridgeConfig
  ) {
    super();
  }

  /**
   * 接続を確立
   */
  async connect(): Promise<IpcConnection> {
    const target = await this.router.resolve();
    return this.connectTo(target);
  }

  /**
   * 特定のターゲットに接続
   */
  private async connectTo(target: Target): Promise<IpcConnection> {
    // 既存の接続を閉じる
    if (this.connection) {
      await this.disconnect();
    }

    // 新しい接続を確立
    this.connection = await this.connector.connect({
      target,
      timeout: this.config.timeouts.connection,
    });

    this.currentTarget = target;

    // 切断検知
    this.connection.onClose(() => {
      this.handleDisconnection('Connection closed');
    });

    this.connection.onError((error) => {
      this.emit('error', error);
    });

    this.emit('connected', target);
    return this.connection;
  }

  /**
   * 現在の接続を取得
   */
  getConnection(): IpcConnection | null {
    return this.connection;
  }

  /**
   * 現在のターゲットを取得
   */
  getCurrentTarget(): Target | null {
    return this.currentTarget;
  }

  /**
   * 再接続
   */
  async reconnect(): Promise<IpcConnection> {
    const target = await this.router.resolve();

    if (this.currentTarget && this.currentTarget !== target) {
      this.emit('switched', this.currentTarget, target, 'reconnection');
    }

    return this.connectTo(target);
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.currentTarget = null;
  }

  /**
   * 接続中かどうか
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.isConnected();
  }

  /**
   * 切断を処理
   */
  private async handleDisconnection(reason: string): Promise<void> {
    this.emit('disconnected', reason);

    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    let retries = 0;

    while (retries < this.maxRetries) {
      const delay = this.config.timeouts.reconnect * (retries + 1);
      await this.delay(delay);

      try {
        await this.reconnect();
        this.reconnecting = false;
        return;
      } catch {
        retries++;
      }
    }

    this.reconnecting = false;

    this.emit(
      'error',
      new BridgeError(
        'Max reconnection retries exceeded',
        ErrorCodes.RECONNECT_FAILED,
        false
      )
    );
  }

  /**
   * 遅延
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// EventEmitter の型付けを強化
export interface ConnectionManager {
  on<K extends keyof ConnectionManagerEvents>(
    event: K,
    listener: ConnectionManagerEvents[K]
  ): this;
  emit<K extends keyof ConnectionManagerEvents>(
    event: K,
    ...args: Parameters<ConnectionManagerEvents[K]>
  ): boolean;
}
