/**
 * Install CLI コマンド
 *
 * Claude Bridge を Native Messaging Host としてインストール
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { createInstaller, generateManifest } from '../../installer';

/**
 * デフォルト拡張 ID（Claude in Chrome）
 */
const DEFAULT_EXTENSION_IDS = [
  'mcbljkjpefekbpfpiondclejkdjfcpam', // Claude in Chrome (推定)
];

/**
 * 実行ファイルのパスを取得
 */
function getExecutablePath(): string {
  // npm グローバルインストール時のパスを検出
  const npmGlobalPath = process.env.npm_config_prefix;
  if (npmGlobalPath) {
    const globalBin = path.join(npmGlobalPath, 'node_modules', 'claude-bridge', 'dist', 'index.js');
    if (fs.existsSync(globalBin)) {
      return globalBin;
    }
  }

  // ローカル開発時のパス
  const localPath = path.resolve(__dirname, '..', '..', '..', 'dist', 'index.js');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // フォールバック: 現在のディレクトリ基準
  return path.resolve(process.cwd(), 'dist', 'index.js');
}

/**
 * スピナー風の進捗表示
 */
function showProgress(message: string, status: 'pending' | 'done' | 'error'): void {
  const statusText = {
    pending: '...',
    done: 'done',
    error: 'error',
  };

  const padding = 30 - message.length;
  const spaces = ' '.repeat(Math.max(0, padding));

  if (status === 'pending') {
    process.stdout.write(`  ${message}${spaces}${statusText[status]}`);
  } else {
    process.stdout.write(`\r  ${message}${spaces}${statusText[status]}\n`);
  }
}

/**
 * Install コマンドを作成
 */
export function createInstallCommand(): Command {
  const install = new Command('install');
  install.description('Install Claude Bridge as a Native Messaging Host');

  install
    .option('--extension-id <id>', 'Chrome extension ID to allow', DEFAULT_EXTENSION_IDS[0])
    .option('--force', 'Force reinstall even if already installed')
    .action(async (options: { extensionId: string; force?: boolean }) => {
      console.log('Installing Claude Bridge...');
      console.log('');

      try {
        const installer = createInstaller();
        const hostName = 'com.anthropic.claude_bridge';

        // 既存のインストールを確認
        const isInstalled = await installer.isInstalled(hostName);
        if (isInstalled && !options.force) {
          console.log('Claude Bridge is already installed.');
          console.log('Use --force to reinstall.');
          return;
        }

        // 実行ファイルのパスを取得
        const executablePath = getExecutablePath();

        // マニフェストを生成
        showProgress('Creating manifest', 'pending');
        const manifest = generateManifest({
          executablePath,
          extensionIds: [options.extensionId],
        });
        showProgress('Creating manifest', 'done');

        // インストール
        showProgress('Registering host', 'pending');
        await installer.install(manifest);
        showProgress('Registering host', 'done');

        console.log('');
        console.log('Installation complete. Please restart Chrome.');
        console.log('');
        console.log('Configuration:');
        console.log(`  Executable: ${executablePath}`);
        console.log(`  Extension ID: ${options.extensionId}`);
        console.log(`  Manifest: ${installer.getManifestPath(hostName)}`);

      } catch (error) {
        console.log('');
        console.error('Installation failed!');
        console.error(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  return install;
}
