#!/usr/bin/env node
/**
 * Claude Bridge Setup CLI
 *
 * Native Messaging Host のマニフェストを管理するコマンドラインツール
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// パス設定
const APPDATA = process.env.APPDATA || '';
const MANIFEST_DIR = path.join(APPDATA, 'Claude Code', 'ChromeNativeHost');
const MANIFEST_NAME = 'com.anthropic.claude_code_browser_extension.json';
const MANIFEST_PATH = path.join(MANIFEST_DIR, MANIFEST_NAME);
const BACKUP_PATH = path.join(MANIFEST_DIR, `${MANIFEST_NAME}.original`);

const BRIDGE_DIR = path.join(APPDATA, 'claude-bridge');
// dist/setup.js から実行される場合のパス
const BRIDGE_HOST_PATH = path.resolve(__dirname, 'claude-bridge-client-host.bat');

interface Manifest {
  name: string;
  description: string;
  path: string;
  type: string;
  allowed_origins: string[];
}

function log(msg: string): void {
  console.log(msg);
}

function readManifest(): Manifest | null {
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function writeManifest(manifest: Manifest): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

function backup(): boolean {
  try {
    if (!fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(MANIFEST_PATH, BACKUP_PATH);
      log(`✓ Backed up original manifest to: ${BACKUP_PATH}`);
    } else {
      log(`ℹ Backup already exists: ${BACKUP_PATH}`);
    }
    return true;
  } catch (err) {
    log(`✗ Failed to backup: ${err instanceof Error ? err.message : 'Unknown'}`);
    return false;
  }
}

function install(): void {
  log('=== Claude Bridge Setup ===');
  log('');

  // マニフェストを確認
  const manifest = readManifest();
  if (!manifest) {
    log(`✗ Manifest not found at: ${MANIFEST_PATH}`);
    log('  Make sure Claude Code is installed.');
    process.exit(1);
  }

  log(`Current manifest path: ${manifest.path}`);

  // Bridge Host が存在するか確認
  if (!fs.existsSync(BRIDGE_HOST_PATH)) {
    log(`✗ Bridge Host not found at: ${BRIDGE_HOST_PATH}`);
    log('  Run "npm run build" first.');
    process.exit(1);
  }

  // バックアップ
  if (!backup()) {
    process.exit(1);
  }

  // マニフェストを更新
  const newManifest: Manifest = {
    ...manifest,
    path: BRIDGE_HOST_PATH,
    description: 'Claude Bridge - Native Host Proxy',
  };

  writeManifest(newManifest);
  log(`✓ Updated manifest to use Bridge Host`);
  log(`  New path: ${newManifest.path}`);
  log('');
  log('Setup complete! Restart Chrome for changes to take effect.');
}

function uninstall(): void {
  log('=== Claude Bridge Uninstall ===');
  log('');

  if (!fs.existsSync(BACKUP_PATH)) {
    log('✗ No backup found. Cannot restore original.');
    process.exit(1);
  }

  try {
    fs.copyFileSync(BACKUP_PATH, MANIFEST_PATH);
    log(`✓ Restored original manifest from: ${BACKUP_PATH}`);
    log('');
    log('Uninstall complete! Restart Chrome for changes to take effect.');
  } catch (err) {
    log(`✗ Failed to restore: ${err instanceof Error ? err.message : 'Unknown'}`);
    process.exit(1);
  }
}

function status(): void {
  log('=== Claude Bridge Status ===');
  log('');

  const manifest = readManifest();
  if (!manifest) {
    log(`✗ Manifest not found at: ${MANIFEST_PATH}`);
    return;
  }

  log(`Manifest: ${MANIFEST_PATH}`);
  log(`  Name: ${manifest.name}`);
  log(`  Path: ${manifest.path}`);
  log(`  Description: ${manifest.description}`);
  log('');

  const isBridge = manifest.path.includes('claude-bridge');
  if (isBridge) {
    log('Status: Claude Bridge is ACTIVE');
  } else {
    log('Status: Original Native Host is active');
  }

  if (fs.existsSync(BACKUP_PATH)) {
    log(`Backup: ${BACKUP_PATH} (exists)`);
  } else {
    log('Backup: Not found');
  }
}

function showConfig(): void {
  log('=== Bridge Configuration ===');
  log('');

  const configPath = path.join(BRIDGE_DIR, 'config.json');
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    log(`Config file: ${configPath}`);
    log(JSON.stringify(config, null, 2));
  } catch {
    log(`Config file not found at: ${configPath}`);
    log('Default configuration will be used.');
  }
}

function setTarget(target: 'cli' | 'desktop'): void {
  log(`=== Setting target to: ${target} ===`);
  log('');

  fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  const configPath = path.join(BRIDGE_DIR, 'config.json');

  let config: { target: string; pipes: { cli: string; desktop: string } };

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(content);
  } catch {
    const username = os.userInfo().username;
    config = {
      target: 'cli',
      pipes: {
        cli: `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`,
        desktop: '',
      },
    };
  }

  config.target = target;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  log(`✓ Target set to: ${target}`);
  log(`Config saved to: ${configPath}`);
}

// メイン
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'install':
    install();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'status':
    status();
    break;
  case 'config':
    showConfig();
    break;
  case 'set-target':
    const target = args[1];
    if (target !== 'cli' && target !== 'desktop') {
      log('Usage: setup set-target <cli|desktop>');
      process.exit(1);
    }
    setTarget(target);
    break;
  default:
    log('Claude Bridge Setup');
    log('');
    log('Usage:');
    log('  setup install    - Install Claude Bridge as Native Host');
    log('  setup uninstall  - Restore original Native Host');
    log('  setup status     - Show current status');
    log('  setup config     - Show Bridge configuration');
    log('  setup set-target <cli|desktop> - Set routing target');
    process.exit(1);
}
