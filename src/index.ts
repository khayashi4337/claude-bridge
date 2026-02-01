/**
 * Claude Bridge - エントリーポイント
 * Chrome拡張とClaude製品の接続を制御するプロキシシステム
 */

// Types
export * from './types';

// Host (Native Messaging)
export * from './host';

// IPC (Claude connection) - deprecated, use process instead
export * from './ipc';

// Process (Native Host spawning)
export * from './process';

// Bridge
export * from './bridge';

// Logger
export * from './logger';

// Installer
export * from './installer';

// Config (Phase 2)
export * from './config';

// Detector (Phase 2)
export * from './detector';

// Router (Phase 2)
export * from './router';

// Pipe Proxy (Named Pipe relay)
export * from './pipe-proxy';

// Native Messaging Host として実行された場合にブリッジを起動
import { RoutedBridge } from './bridge';

import * as fs from 'fs';
import * as pathModule from 'path';

// ログファイルパス
const LOG_FILE = pathModule.join(
  process.env.APPDATA || process.env.HOME || '.',
  'claude-bridge',
  'bridge.log'
);

// ログディレクトリを作成
try {
  fs.mkdirSync(pathModule.dirname(LOG_FILE), { recursive: true });
} catch {}

// 簡易ロガー（ファイルと stderr に出力）
const log = {
  write: (level: string, msg: string, data?: unknown) => {
    const line = `[${level}] ${new Date().toISOString()} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
    try {
      fs.appendFileSync(LOG_FILE, line);
    } catch {}
    console.error(line.trim());
  },
  debug: (msg: string, data?: unknown) => {
    log.write('DEBUG', msg, data);
  },
  info: (msg: string, data?: unknown) => {
    log.write('INFO', msg, data);
  },
  error: (msg: string, data?: unknown) => {
    log.write('ERROR', msg, data);
  },
};

async function main(): Promise<void> {
  log.info('Claude Bridge starting...', { pid: process.pid });

  try {
    // ブリッジを作成
    log.debug('Creating RoutedBridge...');
    const bridge = new RoutedBridge();

    // エラーハンドリング
    bridge.on('error', (error) => {
      log.error('Bridge error', { message: error.message, code: error.code });
    });

    bridge.on('started', () => {
      log.info('Bridge started successfully');
    });

    bridge.on('target-changed', (target) => {
      log.info('Target changed', { target });
    });

    // プロセス終了時のクリーンアップ
    process.on('SIGINT', async () => {
      await bridge.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await bridge.stop();
      process.exit(0);
    });

    await bridge.start();
    log.info('Claude Bridge started');

  } catch (error) {
    log.error('Failed to start bridge', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// モジュールとして import された場合は起動しない
// 直接実行された場合のみ main() を呼び出す
if (require.main === module) {
  main();
}
