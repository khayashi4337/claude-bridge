/**
 * Native Messaging Protocol 関連の型定義
 * Chrome拡張との通信に使用
 */

/**
 * Native Messaging メッセージ形式
 */
export interface NativeMessage {
  /** メッセージタイプ */
  type: string;
  /** ペイロード */
  payload: unknown;
  /** リクエスト/レスポンス対応用ID */
  id?: string;
}

/**
 * Native Messaging Host オプション
 */
export interface NativeHostOptions {
  /** stdin ストリーム (テスト用DI) */
  stdin?: NodeJS.ReadStream;
  /** stdout ストリーム (テスト用DI) */
  stdout?: NodeJS.WriteStream;
}

/**
 * Native Messaging Protocol 定数
 */
export const NativeMessagingConstants = {
  /** メッセージサイズ上限 (1MB) */
  MAX_MESSAGE_SIZE: 1024 * 1024,
  /** 長さプレフィックスのバイト数 */
  LENGTH_PREFIX_SIZE: 4,
} as const;
