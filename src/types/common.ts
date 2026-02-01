/**
 * 共通型定義
 * Phase 1/2 で共通して使用する基本型
 */

/** 接続先ターゲット */
export type Target = 'desktop' | 'cli';

/** メッセージの方向 */
export type MessageDirection = 'chrome-to-claude' | 'claude-to-chrome';

/**
 * エラーコード体系
 * - C0xx: 共通エラー
 * - N0xx: Native Messaging エラー (Phase 1)
 * - I0xx: IPC エラー (Phase 1)
 * - R0xx: Router エラー (Phase 2)
 */
export const ErrorCodes = {
  // 共通 (C0xx)
  UNKNOWN: 'C001',
  INVALID_CONFIG: 'C002',

  // Native Messaging (N0xx)
  PARSE_ERROR: 'N001',
  SIZE_EXCEEDED: 'N002',
  STDIN_ERROR: 'N003',
  STDOUT_ERROR: 'N004',

  // IPC (I0xx)
  CONNECTION_FAILED: 'I001',
  CONNECTION_LOST: 'I002',
  SEND_FAILED: 'I003',
  TIMEOUT: 'I004',

  // Router (R0xx) - Phase 2 で使用
  CONFIG_INVALID: 'R001',
  CONFIG_NOT_FOUND: 'R002',
  DETECTION_FAILED: 'R010',
  DETECTION_TIMEOUT: 'R011',
  NO_AVAILABLE_TARGET: 'R020',
  FALLBACK_EXHAUSTED: 'R021',
  RECONNECT_FAILED: 'R030',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Bridge エラー基底クラス
 */
export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}
