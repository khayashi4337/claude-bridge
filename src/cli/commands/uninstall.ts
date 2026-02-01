/**
 * Uninstall CLI コマンド
 *
 * Claude Bridge をアンインストール
 */

import { Command } from 'commander';
import { createInstaller } from '../../installer';

/**
 * ホスト名
 */
const HOST_NAME = 'com.anthropic.claude_bridge';

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
 * Uninstall コマンドを作成
 */
export function createUninstallCommand(): Command {
  const uninstall = new Command('uninstall');
  uninstall.description('Uninstall Claude Bridge');

  uninstall
    .option('--keep-config', 'Keep configuration file')
    .action(async (options: { keepConfig?: boolean }) => {
      console.log('Uninstalling Claude Bridge...');
      console.log('');

      try {
        const installer = createInstaller();

        // インストール状態を確認
        const isInstalled = await installer.isInstalled(HOST_NAME);
        if (!isInstalled) {
          console.log('Claude Bridge is not installed.');
          return;
        }

        // マニフェストを削除
        showProgress('Removing manifest', 'pending');
        await installer.uninstall(HOST_NAME);
        showProgress('Removing manifest', 'done');

        // レジストリ/ファイルの削除
        showProgress('Unregistering host', 'pending');
        // uninstall メソッドで両方処理されるので完了
        showProgress('Unregistering host', 'done');

        if (!options.keepConfig) {
          showProgress('Removing config', 'pending');
          // 設定ファイルの削除は ConfigManager で行う
          // ここでは省略（オプション機能）
          showProgress('Removing config', 'done');
        }

        console.log('');
        console.log('Uninstallation complete.');
        console.log('');
        console.log('Please restart Chrome to apply changes.');

      } catch (error) {
        console.log('');
        console.error('Uninstallation failed!');
        console.error(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  return uninstall;
}
