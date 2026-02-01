#!/usr/bin/env node
/**
 * Claude Bridge Proxy セットアップスクリプト
 *
 * Chrome拡張の接続先を Proxy に向けるためのセットアップを行う
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// =============================================================================
// 設定
// =============================================================================

const MANIFEST_NAME = 'com.anthropic.claude_browser_extension';
const EXTENSION_ID = 'fcoeoabgfenejglbffodgkkbkcdhcgfn';

// パス設定
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROXY_JS = path.join(PROJECT_ROOT, 'dist', 'pipe-proxy', 'client-host.js');
const PROXY_BAT = path.join(PROJECT_ROOT, 'dist', 'claude-bridge-proxy.bat');
const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'claude-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backup');

// 元のマニフェストパス
const ORIGINAL_MANIFEST_PATH = path.join(
  process.env.APPDATA,
  'Claude',
  'ChromeNativeHost',
  `${MANIFEST_NAME}.json`
);

// =============================================================================
// ユーティリティ
// =============================================================================

function log(level, msg) {
  const icons = { info: 'ℹ️', ok: '✅', warn: '⚠️', error: '❌' };
  console.log(`${icons[level] || ''} ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// =============================================================================
// コマンド: status
// =============================================================================

function cmdStatus() {
  console.log('\n=== Claude Bridge Proxy Status ===\n');

  // マニフェスト確認
  if (!fs.existsSync(ORIGINAL_MANIFEST_PATH)) {
    log('error', `マニフェストが見つかりません: ${ORIGINAL_MANIFEST_PATH}`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(ORIGINAL_MANIFEST_PATH, 'utf8'));
  console.log(`マニフェスト: ${ORIGINAL_MANIFEST_PATH}`);
  console.log(`現在の path: ${manifest.path}`);
  console.log('');

  // Proxy かどうか判定
  if (manifest.path.includes('claude-bridge')) {
    log('ok', 'Proxy が有効です');

    // 設定確認
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log(`ターゲット: ${config.target}`);
    }
  } else {
    log('info', 'Proxy は無効です（元のホストを使用中）');
  }

  // バックアップ確認
  const backupFile = path.join(BACKUP_DIR, `${MANIFEST_NAME}.json.bak`);
  if (fs.existsSync(backupFile)) {
    log('ok', `バックアップあり: ${backupFile}`);
  }
}

// =============================================================================
// コマンド: install
// =============================================================================

function cmdInstall() {
  console.log('\n=== Claude Bridge Proxy Install ===\n');

  // 1. ディレクトリ作成
  ensureDir(CONFIG_DIR);
  ensureDir(BACKUP_DIR);
  ensureDir(path.dirname(PROXY_BAT));

  // 2. Proxy バッチファイル作成
  const batContent = `@echo off
node "${PROXY_JS}" %*
`;
  fs.writeFileSync(PROXY_BAT, batContent);
  log('ok', `Proxy バッチファイル作成: ${PROXY_BAT}`);

  // 3. 元のマニフェストをバックアップ
  if (!fs.existsSync(ORIGINAL_MANIFEST_PATH)) {
    log('error', `元のマニフェストが見つかりません: ${ORIGINAL_MANIFEST_PATH}`);
    log('info', 'Claude Desktop がインストールされていることを確認してください');
    process.exit(1);
  }

  const backupFile = path.join(BACKUP_DIR, `${MANIFEST_NAME}.json.bak`);
  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(ORIGINAL_MANIFEST_PATH, backupFile);
    log('ok', `バックアップ作成: ${backupFile}`);
  } else {
    log('info', `バックアップ済み: ${backupFile}`);
  }

  // 4. マニフェストを書き換え
  const manifest = JSON.parse(fs.readFileSync(ORIGINAL_MANIFEST_PATH, 'utf8'));
  const originalPath = manifest.path;
  manifest.path = PROXY_BAT;

  fs.writeFileSync(ORIGINAL_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  log('ok', `マニフェスト更新: path を Proxy に変更`);
  console.log(`   元: ${originalPath}`);
  console.log(`   新: ${PROXY_BAT}`);

  // 5. デフォルト設定作成
  const defaultConfig = {
    target: 'cli',
    pipes: {
      cli: `\\\\.\\pipe\\claude-mcp-browser-bridge-${os.userInfo().username}`,
      desktop: ''
    },
    originalHostPath: originalPath
  };

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    log('ok', `設定ファイル作成: ${CONFIG_FILE}`);
  }

  console.log('\n✅ インストール完了');
  console.log('\n⚠️  Chrome を再起動してください');
  console.log('\n設定を変更するには:');
  console.log(`   ${CONFIG_FILE}`);
  console.log('   target: "cli" または "desktop"');
}

// =============================================================================
// コマンド: uninstall
// =============================================================================

function cmdUninstall() {
  console.log('\n=== Claude Bridge Proxy Uninstall ===\n');

  const backupFile = path.join(BACKUP_DIR, `${MANIFEST_NAME}.json.bak`);

  if (!fs.existsSync(backupFile)) {
    log('error', 'バックアップが見つかりません');
    log('info', 'Claude Desktop を再インストールするか、手動でマニフェストを復元してください');
    process.exit(1);
  }

  // バックアップから復元
  fs.copyFileSync(backupFile, ORIGINAL_MANIFEST_PATH);
  log('ok', 'マニフェストを復元しました');

  console.log('\n✅ アンインストール完了');
  console.log('\n⚠️  Chrome を再起動してください');
}

// =============================================================================
// コマンド: set-target
// =============================================================================

function cmdSetTarget(target) {
  if (!['cli', 'desktop'].includes(target)) {
    log('error', 'target は "cli" または "desktop" を指定してください');
    process.exit(1);
  }

  ensureDir(CONFIG_DIR);

  let config = {};
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }

  config.target = target;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  log('ok', `ターゲットを "${target}" に設定しました`);

  if (target === 'desktop') {
    log('warn', 'Desktop モードは実験的です（Named Pipe 名が不明）');
  }
}

// =============================================================================
// メイン
// =============================================================================

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
    cmdStatus();
    break;
  case 'install':
    cmdInstall();
    break;
  case 'uninstall':
    cmdUninstall();
    break;
  case 'set-target':
    cmdSetTarget(args[1]);
    break;
  default:
    console.log(`
Claude Bridge Proxy Setup

Usage:
  node setup-proxy.js <command>

Commands:
  status       現在の状態を表示
  install      Proxy をインストール（マニフェストを書き換え）
  uninstall    Proxy をアンインストール（元に戻す）
  set-target   接続先を設定 (cli|desktop)

Examples:
  node setup-proxy.js status
  node setup-proxy.js install
  node setup-proxy.js set-target cli
  node setup-proxy.js uninstall
`);
}
