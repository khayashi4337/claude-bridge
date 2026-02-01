/**
 * Claude Bridge - エントリーポイント
 * Chrome拡張とClaude製品の接続を制御するプロキシシステム
 */

// Types
export * from './types';

// Host (Native Messaging)
export * from './host';

// IPC (Claude connection)
export * from './ipc';

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

console.log('Claude Bridge initialized');
