#!/usr/bin/env ts-node
/**
 * Native Messaging Host アンインストールスクリプト
 */

import { createInstaller } from '../src/installer';

const HOST_NAME = 'com.anthropic.claude_bridge';

async function main() {
  console.log('=== Claude Bridge Uninstaller ===');
  console.log('');

  // インストーラーを作成
  const installer = createInstaller();

  // インストール状態を確認
  const isInstalled = await installer.isInstalled(HOST_NAME);
  if (!isInstalled) {
    console.log('Claude Bridge is not installed.');
    return;
  }

  // アンインストール
  console.log('Uninstalling...');
  await installer.uninstall(HOST_NAME);

  console.log('');
  console.log('✓ Uninstallation complete!');
  console.log('');
  console.log('Please restart Chrome to apply changes.');
}

main().catch((err) => {
  console.error('');
  console.error('✗ Uninstallation failed!');
  console.error(`  Error: ${err.message}`);
  process.exit(1);
});
