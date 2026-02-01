/**
 * プロセス検出型定義
 */

import { Target } from '../types';

/**
 * プロセス情報
 */
export interface ProcessInfo {
  /** ターゲット */
  target: Target;
  /** 実行中かどうか */
  running: boolean;
  /** プロセスID */
  pid?: number;
  /** 実行ファイルパス */
  path?: string;
  /** 起動時刻 */
  startedAt?: Date;
}

/**
 * ヘルス状態
 */
export interface HealthStatus {
  /** ターゲット */
  target: Target;
  /** プロセスが実行中か */
  processRunning: boolean;
  /** IPC 接続可能か */
  ipcConnectable: boolean;
  /** 応答時間 (ms) */
  responseTime?: number;
  /** 最終チェック時刻 */
  lastChecked: Date;
  /** エラーメッセージ */
  error?: string;
}

/**
 * 検出結果
 */
export interface DetectionResult {
  /** Desktop の状態 */
  desktop: HealthStatus;
  /** CLI の状態 */
  cli: HealthStatus;
}

/**
 * 検出キャッシュエントリ
 */
export interface CacheEntry {
  /** ヘルス状態 */
  status: HealthStatus;
  /** 有効期限 */
  expiresAt: number;
}
