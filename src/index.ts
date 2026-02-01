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

// Native Messaging Host として実行された場合にブリッジを起動
import { RoutedBridge } from './bridge';

// 簡易ロガー（stderr 出力）
const log = {
  info: (msg: string, data?: unknown) => {
    if (process.env.DEBUG) {
      console.error(`[INFO] ${msg}`, data ? JSON.stringify(data) : '');
    }
  },
  error: (msg: string, data?: unknown) => {
    console.error(`[ERROR] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

async function main(): Promise<void> {
  try {
    // ブリッジを作成
    const bridge = new RoutedBridge();

    // エラーハンドリング
    bridge.on('error', (error) => {
      log.error('Bridge error', { message: error.message, code: error.code });
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
