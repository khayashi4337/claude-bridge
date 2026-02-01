/**
 * Native Messaging Host マニフェスト生成
 */

import * as path from 'path';

/**
 * マニフェスト構造
 */
export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: 'stdio';
  allowed_origins: string[];
}

/**
 * マニフェストオプション
 */
export interface ManifestOptions {
  /** ホスト名 */
  name?: string;
  /** 説明 */
  description?: string;
  /** 実行ファイルパス */
  executablePath: string;
  /** 許可する拡張 ID */
  extensionIds: string[];
}

/**
 * デフォルト値
 */
const DEFAULTS = {
  name: 'com.anthropic.claude_bridge',
  description: 'Claude Bridge - Native Messaging Host',
};

/**
 * マニフェストを生成
 */
export function generateManifest(options: ManifestOptions): NativeHostManifest {
  const { name = DEFAULTS.name, description = DEFAULTS.description, executablePath, extensionIds } = options;

  // 拡張 ID を origin 形式に変換
  const allowedOrigins = extensionIds.map((id) => `chrome-extension://${id}/`);

  return {
    name,
    description,
    path: path.resolve(executablePath),
    type: 'stdio',
    allowed_origins: allowedOrigins,
  };
}

/**
 * マニフェストを JSON 文字列に変換
 */
export function serializeManifest(manifest: NativeHostManifest): string {
  return JSON.stringify(manifest, null, 2);
}
