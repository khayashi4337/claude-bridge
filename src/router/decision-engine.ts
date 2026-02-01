/**
 * Decision Engine
 *
 * ルーティングの核心ロジック
 */

import { Target } from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { BridgeConfig } from '../config';
import { DetectionResult } from '../detector';

/**
 * 決定結果
 */
export interface ResolutionResult {
  /** 選択されたターゲット */
  target: Target;
  /** 決定理由 */
  reason: 'configured' | 'auto' | 'fallback';
  /** 代替ターゲット */
  alternatives: Target[];
}

/**
 * Decision Engine
 *
 * 設定と検出結果に基づいて最適な接続先を決定
 */
export class DecisionEngine {
  /**
   * 接続先を決定
   */
  decide(config: BridgeConfig, detection: DetectionResult): ResolutionResult {
    const { target, fallback } = config;

    // 明示的なターゲット指定の場合
    if (target !== 'auto') {
      return this.decideExplicit(target, fallback, detection);
    }

    // auto モード
    return this.decideAuto(fallback, detection);
  }

  /**
   * 明示的なターゲット指定時の決定
   */
  private decideExplicit(
    target: Target,
    fallback: BridgeConfig['fallback'],
    detection: DetectionResult
  ): ResolutionResult {
    // 指定されたターゲットが利用可能か
    if (detection[target].ipcConnectable) {
      return {
        target,
        reason: 'configured',
        alternatives: [],
      };
    }

    // フォールバックが有効な場合
    if (fallback.enabled) {
      const alt = this.findAlternative(target, fallback.order, detection);
      if (alt) {
        return {
          target: alt,
          reason: 'fallback',
          alternatives: [],
        };
      }
    }

    // 利用可能なターゲットがない
    throw new BridgeError(
      `Target "${target}" is not available and no fallback available`,
      ErrorCodes.NO_AVAILABLE_TARGET,
      true
    );
  }

  /**
   * auto モードでの決定
   */
  private decideAuto(
    fallback: BridgeConfig['fallback'],
    detection: DetectionResult
  ): ResolutionResult {
    // order 順に利用可能なターゲットを探す
    for (const t of fallback.order) {
      if (detection[t].ipcConnectable) {
        return {
          target: t,
          reason: 'auto',
          alternatives: fallback.order.filter((x) => x !== t),
        };
      }
    }

    // 利用可能なターゲットがない
    throw new BridgeError(
      'No available target found',
      ErrorCodes.NO_AVAILABLE_TARGET,
      true
    );
  }

  /**
   * 代替ターゲットを探す
   */
  private findAlternative(
    current: Target,
    order: Target[],
    detection: DetectionResult
  ): Target | null {
    const alternatives = order.filter((t) => t !== current);

    for (const alt of alternatives) {
      if (detection[alt].ipcConnectable) {
        return alt;
      }
    }

    return null;
  }

  /**
   * ターゲットが利用可能かチェック
   */
  isAvailable(target: Target, detection: DetectionResult): boolean {
    return detection[target].ipcConnectable;
  }

  /**
   * 利用可能なターゲット一覧を取得
   */
  getAvailableTargets(detection: DetectionResult): Target[] {
    const targets: Target[] = [];

    if (detection.desktop.ipcConnectable) {
      targets.push('desktop');
    }
    if (detection.cli.ipcConnectable) {
      targets.push('cli');
    }

    return targets;
  }
}
