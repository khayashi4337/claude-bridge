/**
 * Process Detector 抽象クラス
 */

import { Target } from '../types';
import { BridgeConfig } from '../config';
import { ProcessConnector } from '../process';
import { ProcessInfo, HealthStatus, DetectionResult, CacheEntry } from './types';

/**
 * Process Detector 抽象クラス
 *
 * OS 非依存のインターフェースと共通ロジック
 */
export abstract class ProcessDetector {
  protected cache = new Map<Target, CacheEntry>();
  private watchInterval: NodeJS.Timeout | null = null;

  constructor(
    protected readonly connector: ProcessConnector,
    protected readonly config: BridgeConfig
  ) {}

  /**
   * プロセスを検出（OS 固有実装）
   */
  abstract detectProcess(target: Target): Promise<ProcessInfo>;

  /**
   * ヘルス状態を検出
   */
  async detect(target: Target): Promise<HealthStatus> {
    // キャッシュを確認
    const cached = this.cache.get(target);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status;
    }

    // プロセス検出
    const processInfo = await this.detectProcess(target);

    // Native Host の存在確認
    const hostExists = this.connector.exists(target);

    const status: HealthStatus = {
      target,
      processRunning: processInfo.running,
      ipcConnectable: hostExists,  // Native Host が存在すれば接続可能
      lastChecked: new Date(),
    };

    if (!hostExists) {
      const hostPath = this.connector.getPath(target);
      status.error = hostPath
        ? `Native host not found: ${hostPath}`
        : `No native host configured for ${target}`;
    }

    // キャッシュを更新
    this.cache.set(target, {
      status,
      expiresAt: Date.now() + this.config.detection.cacheTtl,
    });

    return status;
  }

  /**
   * すべてのターゲットを検出
   */
  async detectAll(): Promise<DetectionResult> {
    const [desktop, cli] = await Promise.all([
      this.detect('desktop'),
      this.detect('cli'),
    ]);

    return { desktop, cli };
  }

  /**
   * 監視を開始
   */
  watch(callback: (result: DetectionResult) => void): () => void {
    // 初回実行
    this.detectAll().then(callback).catch(() => {});

    // 定期実行
    this.watchInterval = setInterval(async () => {
      try {
        const result = await this.detectAll();
        callback(result);
      } catch {
        // エラーは無視
      }
    }, this.config.detection.interval);

    // クリーンアップ関数を返す
    return () => this.stopWatching();
  }

  /**
   * 監視を停止
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
  }
}
