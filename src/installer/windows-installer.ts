/**
 * Windows Native Messaging Host インストーラー
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NativeHostManifest, serializeManifest } from './manifest';

/**
 * レジストリパス
 */
const REGISTRY_BASE = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts';

/**
 * Windows インストーラー
 */
export class WindowsInstaller {
  private readonly manifestDir: string;

  constructor(manifestDir?: string) {
    this.manifestDir =
      manifestDir ||
      path.join(process.env.APPDATA || '', 'claude-bridge');
  }

  /**
   * インストール
   */
  async install(manifest: NativeHostManifest): Promise<void> {
    // マニフェストディレクトリを作成
    await fs.promises.mkdir(this.manifestDir, { recursive: true });

    // ランチャーバッチファイルを作成（Windows では .js を直接実行できない）
    const launcherPath = path.join(this.manifestDir, `${manifest.name}.bat`);
    const launcherContent = `@echo off\r\nnode "${manifest.path}" %*\r\n`;
    await fs.promises.writeFile(launcherPath, launcherContent, 'utf8');

    // マニフェストのパスをバッチファイルに変更
    const manifestWithLauncher: NativeHostManifest = {
      ...manifest,
      path: launcherPath,
    };

    // マニフェストファイルを書き込み
    const manifestPath = path.join(this.manifestDir, `${manifest.name}.json`);
    await fs.promises.writeFile(manifestPath, serializeManifest(manifestWithLauncher), 'utf8');

    // レジストリに登録
    const regPath = `${REGISTRY_BASE}\\${manifest.name}`;
    const command = `reg add "${regPath}" /ve /t REG_SZ /d "${manifestPath}" /f`;

    try {
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      throw new Error(
        `Failed to register in registry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * アンインストール
   */
  async uninstall(hostName: string): Promise<void> {
    // レジストリから削除
    const regPath = `${REGISTRY_BASE}\\${hostName}`;

    try {
      execSync(`reg delete "${regPath}" /f`, { stdio: 'pipe' });
    } catch {
      // レジストリエントリが存在しない場合は無視
    }

    // マニフェストファイルを削除
    const manifestPath = path.join(this.manifestDir, `${hostName}.json`);
    try {
      await fs.promises.unlink(manifestPath);
    } catch {
      // ファイルが存在しない場合は無視
    }

    // ランチャーバッチファイルを削除
    const launcherPath = path.join(this.manifestDir, `${hostName}.bat`);
    try {
      await fs.promises.unlink(launcherPath);
    } catch {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * インストール状態を確認
   */
  async isInstalled(hostName: string): Promise<boolean> {
    const regPath = `${REGISTRY_BASE}\\${hostName}`;

    try {
      execSync(`reg query "${regPath}"`, { stdio: 'pipe' });
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
