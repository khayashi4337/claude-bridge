/**
 * Installer モジュール
 */

import { NativeHostManifest } from './manifest';
import { WindowsInstaller } from './windows-installer';
import { DarwinInstaller } from './darwin-installer';

export * from './manifest';
export * from './windows-installer';
export * from './darwin-installer';

/**
 * インストーラーインターフェース
 */
export interface Installer {
  install(manifest: NativeHostManifest): Promise<void>;
  uninstall(hostName: string): Promise<void>;
  isInstalled(hostName: string): Promise<boolean>;
  getManifestPath(hostName: string): string;
}

/**
 * 現在の OS に対応したインストーラーを作成
 */
export function createInstaller(): Installer {
  if (process.platform === 'win32') {
    return new WindowsInstaller();
  } else if (process.platform === 'darwin') {
    return new DarwinInstaller();
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
