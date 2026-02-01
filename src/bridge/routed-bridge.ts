/**
 * Routed Bridge
 *
 * Router 統合版の Bridge
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import { Target, NativeMessage, IpcMessage } from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { NativeHost } from '../host';
import { createConnector } from '../ipc';
import { ConfigManager, BridgeConfig } from '../config';
import { createDetector, DetectionResult } from '../detector';
import { Router, ConnectionManager } from '../router';
import { Logger } from '../logger';

/**
 * RoutedBridge オプション
 */
export interface RoutedBridgeOptions {
  /** 設定ファイルパス */
  configPath?: string;
  /** ログディレクトリ */
  logDir?: string;
}

/**
 * RoutedBridge ステータス
 */
export interface RoutedBridgeStatus {
  /** 実行中かどうか */
  running: boolean;
  /** 現在の接続先 */
  currentTarget: Target | null;
  /** 設定 */
  config: BridgeConfig;
  /** 検出結果 */
  detection: DetectionResult | null;
  /** 統計 */
  stats: {
    /** 転送したメッセージ数 */
    messagesForwarded: number;
    /** 最後のアクティビティ */
    lastActivity: Date | null;
    /** 稼働時間 (ms) */
    uptime: number;
  };
}

/**
 * RoutedBridge イベント
 */
export interface RoutedBridgeEvents {
  started: () => void;
  stopped: () => void;
  'target-changed': (target: Target) => void;
  error: (error: BridgeError) => void;
}

/**
 * デフォルトログディレクトリ
 */
function getDefaultLogDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'claude-bridge', 'logs');
  } else {
    return path.join(os.homedir(), 'Library', 'Application Support', 'claude-bridge', 'logs');
  }
}

/**
 * Routed Bridge
 *
 * Router を統合した完全な Bridge 実装
 */
export class RoutedBridge extends EventEmitter {
  private readonly host: NativeHost;
  private readonly configManager: ConfigManager;
  private readonly router: Router;
  private readonly connectionManager: ConnectionManager;
  private readonly logger: Logger;

  private running = false;
  private startedAt: Date | null = null;
  private messagesForwarded = 0;
  private lastActivity: Date | null = null;
  private lastDetection: DetectionResult | null = null;

  constructor(options: RoutedBridgeOptions = {}) {
    super();

    // コンポーネントを初期化
    this.host = new NativeHost();
    this.configManager = new ConfigManager({ configPath: options.configPath });

    const connector = createConnector();

    // ダミーの config で初期化（start 時に実際の config をロード）
    const dummyConfig: BridgeConfig = {
      target: 'auto',
      fallback: { enabled: true, order: ['cli', 'desktop'] },
      timeouts: { connection: 5000, healthCheck: 2000, reconnect: 1000 },
      detection: { interval: 5000, cacheTtl: 3000 },
    };

    const detector = createDetector(connector, dummyConfig);

    this.router = new Router(detector, this.configManager);
    this.connectionManager = new ConnectionManager(this.router, connector, dummyConfig);

    this.logger = new Logger({
      logDir: options.logDir || getDefaultLogDir(),
    });
  }

  /**
   * Bridge を開始
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new BridgeError(
        'Bridge is already running',
        ErrorCodes.UNKNOWN,
        true
      );
    }

    // ロガーを初期化
    await this.logger.init();

    // 設定をロード
    await this.configManager.load();

    // Native Host イベントハンドラを設定
    this.host.on('message', this.handleNativeMessage.bind(this));
    this.host.on('error', this.handleError.bind(this));
    this.host.on('close', this.handleClose.bind(this));

    // Router イベントハンドラを設定
    this.router.on('target-changed', this.handleTargetChanged.bind(this));
    this.router.on('resolution-failed', this.handleError.bind(this));
    this.router.on('detection-updated', this.handleDetectionUpdated.bind(this));

    // ConnectionManager イベントハンドラを設定
    this.connectionManager.on('error', this.handleError.bind(this));

    // 接続を確立
    await this.connectionManager.connect();

    // Native Host を開始
    await this.host.start();

    // 監視を開始
    this.router.startWatching();

    this.running = true;
    this.startedAt = new Date();

    this.logger.info('bridge_started', { target: this.connectionManager.getCurrentTarget() });
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

    // 監視を停止
    this.router.stopWatching();

    // 接続を閉じる
    await this.connectionManager.disconnect();

    // Native Host を停止
    await this.host.stop();

    // ロガーを閉じる
    await this.logger.close();

    this.logger.info('bridge_stopped');
    this.emit('stopped');
  }

  /**
   * ステータスを取得
   */
  getStatus(): RoutedBridgeStatus {
    const uptime = this.startedAt ? Date.now() - this.startedAt.getTime() : 0;

    return {
      running: this.running,
      currentTarget: this.connectionManager.getCurrentTarget(),
      config: this.configManager.getConfig(),
      detection: this.lastDetection,
      stats: {
        messagesForwarded: this.messagesForwarded,
        lastActivity: this.lastActivity,
        uptime,
      },
    };
  }

  /**
   * Chrome からのメッセージを処理
   */
  private async handleNativeMessage(message: NativeMessage): Promise<void> {
    const connection = this.connectionManager.getConnection();

    if (!connection || !connection.isConnected()) {
      this.logger.warn('no_connection', { messageType: message.type });
      return;
    }

    try {
      this.logger.logMessage('chrome-to-claude', message);

      // IPC メッセージとして転送
      const ipcMessage: IpcMessage = {
        type: message.type,
        payload: message.payload,
        id: message.id,
        timestamp: Date.now(),
      };

      await connection.send(ipcMessage);

      this.messagesForwarded++;
      this.lastActivity = new Date();
    } catch (error) {
      this.handleError(
        new BridgeError(
          `Failed to forward message: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCodes.SEND_FAILED,
          true
        )
      );
    }
  }

  /**
   * ターゲット変更を処理
   */
  private handleTargetChanged(target: Target, reason: string): void {
    this.logger.info('target_changed', { target, reason });
    this.emit('target-changed', target);
  }

  /**
   * 検出結果更新を処理
   */
  private handleDetectionUpdated(result: DetectionResult): void {
    this.lastDetection = result;
  }

  /**
   * エラーを処理
   */
  private handleError(error: BridgeError): void {
    this.logger.error('bridge_error', error);
    this.emit('error', error);
  }

  /**
   * Native Host 終了を処理
   */
  private handleClose(): void {
    this.stop();
  }
}

// EventEmitter の型付けを強化
export interface RoutedBridge {
  on<K extends keyof RoutedBridgeEvents>(event: K, listener: RoutedBridgeEvents[K]): this;
  emit<K extends keyof RoutedBridgeEvents>(
    event: K,
    ...args: Parameters<RoutedBridgeEvents[K]>
  ): boolean;
}
