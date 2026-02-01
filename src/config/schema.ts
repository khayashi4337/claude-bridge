/**
 * 設定スキーマ定義
 */

import { Target } from '../types';

/**
 * Bridge 設定
 */
export interface BridgeConfig {
  /** 接続先: auto=自動選択, desktop=Desktop優先, cli=CLI優先 */
  target: 'auto' | Target;

  /** フォールバック設定 */
  fallback: {
    /** フォールバックを有効化 */
    enabled: boolean;
    /** auto 時の優先順序 */
    order: Target[];
  };

  /** タイムアウト設定（ms） */
  timeouts: {
    /** IPC 接続タイムアウト */
    connection: number;
    /** ヘルスチェックタイムアウト */
    healthCheck: number;
    /** 再接続待機時間 */
    reconnect: number;
  };

  /** 検出設定 */
  detection: {
    /** ポーリング間隔（ms） */
    interval: number;
    /** 検出結果キャッシュ有効期限（ms） */
    cacheTtl: number;
  };

  /** 上級者設定 */
  advanced?: {
    /** カスタム IPC パス */
    paths?: Partial<Record<Target, string>>;
    /** デバッグモード */
    debug?: boolean;
  };
}

/**
 * 設定の部分型
 */
export type PartialBridgeConfig = Partial<{
  target: BridgeConfig['target'];
  fallback: Partial<BridgeConfig['fallback']>;
  timeouts: Partial<BridgeConfig['timeouts']>;
  detection: Partial<BridgeConfig['detection']>;
  advanced: BridgeConfig['advanced'];
}>;
