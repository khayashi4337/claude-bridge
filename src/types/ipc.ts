/**
 * IPC (Inter-Process Communication) 関連の型定義
 * Claude Desktop/CLI との通信に使用
 *
 * Stage 1.1.2 調査結果に基づく
 */

import { Target, BridgeError } from './common';

/**
 * IPC メッセージタイプ
 */
export type IpcMessageType =
  | 'connect'
  | 'disconnect'
  | 'request'
  | 'response'
  | 'error'
  | 'notification';

/**
 * IPC メッセージ形式
 */
export interface IpcMessage {
  /** メッセージタイプ */
  type: IpcMessageType | string;
  /** ペイロード */
  payload: unknown;
  /** リクエスト/レスポンス対応用ID */
  id?: string;
  /** タイムスタンプ */
  timestamp?: number;
}

/**
 * IPC 接続オプション
 */
export interface IpcConnectionOptions {
  /** 接続先ターゲット */
  target: Target;
  /** 接続タイムアウト (ms) */
  timeout?: number;
  /** カスタムパス（オプション） */
  customPath?: string;
}

/**
 * IPC 接続インターフェース
 */
export interface IpcConnection {
  /** メッセージ送信 */
  send(message: IpcMessage): Promise<void>;
  /** メッセージ受信ハンドラ登録 */
  onMessage(handler: (msg: IpcMessage) => void): void;
  /** エラーハンドラ登録 */
  onError(handler: (err: BridgeError) => void): void;
  /** 切断ハンドラ登録 */
  onClose(handler: () => void): void;
  /** 接続を閉じる */
  close(): Promise<void>;
  /** 接続状態確認 */
  isConnected(): boolean;
  /** 接続先ターゲット取得 */
  getTarget(): Target;
}

/**
 * IPC コネクタインターフェース
 */
export interface IpcConnector {
  /** 接続を確立 */
  connect(options: IpcConnectionOptions): Promise<IpcConnection>;
}

/**
 * IPC パス定義
 * OS ごとの接続先パス
 */
export const IpcPaths: Record<'win32' | 'darwin', Record<Target, string>> = {
  win32: {
    desktop: '\\\\.\\pipe\\anthropic-claude-desktop',
    cli: '\\\\.\\pipe\\anthropic-claude-code',
  },
  darwin: {
    desktop: '/tmp/anthropic-claude-desktop.sock',
    cli: '/tmp/anthropic-claude-code.sock',
  },
};

/**
 * 現在の OS に対応したパスを取得
 */
export function getIpcPath(target: Target, customPath?: string): string {
  if (customPath) return customPath;

  const platform = process.platform as 'win32' | 'darwin';
  const paths = IpcPaths[platform];

  if (!paths) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return paths[target];
}
