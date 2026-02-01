/**
 * Fallback Handler
 *
 * フォールバック処理
 */

import { Target } from '../types';
import { BridgeConfig } from '../config';
import { DetectionResult } from '../detector';

/**
 * フォールバックトリガー
 */
export type FallbackTrigger =
  | 'process_not_running'
  | 'connection_failed'
  | 'connection_lost'
  | 'response_timeout';

/**
 * Fallback Handler
 */
export class FallbackHandler {
  constructor(private readonly config: BridgeConfig) {}

  /**
   * 次のターゲットを取得
   */
  getNext(current: Target, detection: DetectionResult): Target | null {
    if (!this.config.fallback.enabled) {
      return null;
    }

    const alternatives = this.config.fallback.order.filter((t) => t !== current);

    for (const alt of alternatives) {
      if (detection[alt].ipcConnectable) {
        return alt;
      }
    }

    return null;
  }

  /**
   * フォールバックが可能かチェック
   */
  canFallback(current: Target, detection: DetectionResult): boolean {
    return this.getNext(current, detection) !== null;
  }

  /**
   * フォールバックトリガーを判定
   */
  getTrigger(current: Target, detection: DetectionResult): FallbackTrigger | null {
    const status = detection[current];

    if (!status.processRunning) {
      return 'process_not_running';
    }

    if (!status.ipcConnectable) {
      if (status.error?.includes('timeout')) {
        return 'response_timeout';
      }
      return 'connection_failed';
    }

    return null;
  }
}
