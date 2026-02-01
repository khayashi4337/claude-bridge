/**
 * macOS Native Messaging Host インストーラー
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NativeHostManifest, serializeManifest } from './manifest';

/**
 * macOS マニフェストディレクトリ
 */
const MANIFEST_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts'
);

/**
 * macOS インストーラー
 */
export class DarwinInstaller {
  private readonly manifestDir: string;

  constructor(manifestDir?: string) {
    this.manifestDir = manifestDir || MANIFEST_DIR;
  }

  /**
   * インストール
   */
  async install(manifest: NativeHostManifest): Promise<void> {
    // マニフェストディレクトリを作成
    await fs.promises.mkdir(this.manifestDir, { recursive: true });

    // マニフェストファイルを書き込み
    const manifestPath = this.getManifestPath(manifest.name);
    await fs.promises.writeFile(manifestPath, serializeManifest(manifest), 'utf8');

    // 実行権限を確認
    try {
      await fs.promises.access(manifest.path, fs.constants.X_OK);
    } catch {
      throw new Error(
        `Executable not found or not executable: ${manifest.path}`
      );
    }
  }

  /**
   * アンインストール
   */
  async uninstall(hostName: string): Promise<void> {
    const manifestPath = this.getManifestPath(hostName);

    try {
      await fs.promises.unlink(manifestPath);
    } catch {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * インストール状態を確認
   */
  async isInstalled(hostName: string): Promise<boolean> {
    const manifestPath = this.getManifestPath(hostName);

    try {
      await fs.promises.access(manifestPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * マニフェストパスを取得
   */
  getManifestPath(hostName: string): string {
    return path.join(this.manifestDir, `${hostName}.json`);
  }
}
