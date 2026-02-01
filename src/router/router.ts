/**
 * Router
 *
 * 接続先ルーティングを管理
 */

import { EventEmitter } from 'events';
import { Target } from '../types';
import { BridgeError } from '../types';
import { ConfigManager, BridgeConfig } from '../config';
import { ProcessDetector, DetectionResult } from '../detector';
import { DecisionEngine, ResolutionResult } from './decision-engine';

/**
 * Router イベント
 */
export interface RouterEvents {
  'target-changed': (target: Target, reason: string) => void;
  'resolution-failed': (error: BridgeError) => void;
  'detection-updated': (result: DetectionResult) => void;
}

/**
 * Router
 *
 * 設定と検出結果に基づいて接続先を決定
 */
export class Router extends EventEmitter {
  private readonly engine: DecisionEngine;
  private currentTarget: Target | null = null;
  private lastResolution: ResolutionResult | null = null;
  private watching = false;
  private stopWatch: (() => void) | null = null;

  constructor(
    private readonly detector: ProcessDetector,
    private readonly configManager: ConfigManager
  ) {
    super();
    this.engine = new DecisionEngine();
  }

  /**
   * 接続先を解決
   */
  async resolve(): Promise<Target> {
    const config = this.configManager.getConfig();
    const detection = await this.detector.detectAll();

    const result = this.engine.decide(config, detection);

    // ターゲットが変わった場合
    if (this.currentTarget !== result.target) {
      const oldTarget = this.currentTarget;
      this.currentTarget = result.target;

      if (oldTarget !== null) {
        this.emit('target-changed', result.target, result.reason);
      }
    }

    this.lastResolution = result;
    return result.target;
  }

  /**
   * 現在のターゲットを取得
   */
  getCurrentTarget(): Target | null {
    return this.currentTarget;
  }

  /**
   * 最後の解決結果を取得
   */
  getLastResolution(): ResolutionResult | null {
    return this.lastResolution;
  }

  /**
   * 監視を開始
   */
  startWatching(): void {
    if (this.watching) {
      return;
    }

    this.watching = true;

    // 設定変更を監視
    this.configManager.on('changed', this.handleConfigChanged.bind(this));

    // プロセス検出を監視
    this.stopWatch = this.detector.watch(this.handleDetectionUpdated.bind(this));
  }

  /**
   * 監視を停止
   */
  stopWatching(): void {
    if (!this.watching) {
      return;
    }

    this.watching = false;

    // 設定変更の監視を停止
    this.configManager.removeListener('changed', this.handleConfigChanged.bind(this));

    // プロセス検出の監視を停止
    if (this.stopWatch) {
      this.stopWatch();
      this.stopWatch = null;
    }
  }

  /**
   * 設定変更を処理
   */
  private async handleConfigChanged(_config: BridgeConfig): Promise<void> {
    try {
      await this.resolve();
    } catch (error) {
      if (error instanceof BridgeError) {
        this.emit('resolution-failed', error);
      }
    }
  }

  /**
   * 検出結果の更新を処理
   */
  private async handleDetectionUpdated(result: DetectionResult): Promise<void> {
    this.emit('detection-updated', result);

    try {
      await this.resolve();
    } catch (error) {
      if (error instanceof BridgeError) {
        this.emit('resolution-failed', error);
      }
    }
  }
}

// EventEmitter の型付けを強化
export interface Router {
  on<K extends keyof RouterEvents>(event: K, listener: RouterEvents[K]): this;
  emit<K extends keyof RouterEvents>(
    event: K,
    ...args: Parameters<RouterEvents[K]>
  ): boolean;
}
