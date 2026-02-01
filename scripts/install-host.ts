#!/usr/bin/env ts-node
/**
 * Native Messaging Host インストールスクリプト
 */

import * as path from 'path';
import { createInstaller, generateManifest } from '../src/installer';

// デフォルト拡張 ID（Claude in Chrome）
// 実際の ID は実環境で確認が必要
const DEFAULT_EXTENSION_IDS = [
  'mcbljkjpefekbpfpiondclejkdjfcpam', // Claude in Chrome (推定)
];

async function main() {
  console.log('=== Claude Bridge Installer ===');
  console.log('');

  // 実行ファイルのパスを取得
  const executablePath = path.resolve(__dirname, '..', 'dist', 'index.js');

  console.log('Configuration:');
  console.log(`  Executable: ${executablePath}`);
  console.log(`  Extension IDs: ${DEFAULT_EXTENSION_IDS.join(', ')}`);
  console.log('');

  // マニフェストを生成
  const manifest = generateManifest({
    executablePath,
    extensionIds: DEFAULT_EXTENSION_IDS,
  });

  console.log('Generated manifest:');
  console.log(JSON.stringify(manifest, null, 2));
  console.log('');

  // インストーラーを作成
  const installer = createInstaller();

  // 既存のインストールを確認
  const isInstalled = await installer.isInstalled(manifest.name);
  if (isInstalled) {
    console.log('Existing installation found. Updating...');
  }

  // インストール
  console.log('Installing...');
  await installer.install(manifest);

  console.log('');
  console.log('✓ Installation complete!');
  console.log(`  Manifest: ${installer.getManifestPath(manifest.name)}`);
  console.log('');
  console.log('Please restart Chrome to apply changes.');
}

main().catch((err) => {
  console.error('');
  console.error('✗ Installation failed!');
  console.error(`  Error: ${err.message}`);
  process.exit(1);
});
