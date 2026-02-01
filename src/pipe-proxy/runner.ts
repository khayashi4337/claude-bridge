#!/usr/bin/env node
/**
 * Named Pipe Proxy Runner
 * プロキシを起動して動作を確認するためのスクリプト
 */

import { NamedPipeProxy } from './proxy';
import * as os from 'os';

// ログ出力
function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${level}] ${timestamp} ${msg}${dataStr}`);
}

async function main(): Promise<void> {
  const username = os.userInfo().username;

  log('INFO', 'Starting Named Pipe Proxy...', {
    username,
    proxyPipe: `\\\\.\\pipe\\claude-bridge-proxy-${username}`,
    targetPipe: `\\\\.\\pipe\\claude-mcp-browser-bridge-${username}`,
  });

  const proxy = new NamedPipeProxy({ username });

  // イベントリスナー設定
  proxy.on('listening', () => {
    log('INFO', `Proxy listening on: ${proxy.getProxyPipeName()}`);
    log('INFO', `Will relay to: ${proxy.getTargetPipeName()}`);
    log('INFO', 'Waiting for connections...');
  });

  proxy.on('connection', (clientId) => {
    log('INFO', `Client connected`, { clientId });
  });

  proxy.on('connected-to-target', (clientId) => {
    log('INFO', `Connected to target CLI pipe`, { clientId });
  });

  proxy.on('data-from-client', (clientId, data) => {
    log('DEBUG', `Data from client`, {
      clientId,
      size: data.length,
      preview: data.slice(0, 100).toString('hex'),
    });
  });

  proxy.on('data-from-target', (clientId, data) => {
    log('DEBUG', `Data from target`, {
      clientId,
      size: data.length,
      preview: data.slice(0, 100).toString('hex'),
    });
  });

  proxy.on('client-disconnected', (clientId) => {
    log('INFO', `Client disconnected`, { clientId });
  });

  proxy.on('target-disconnected', (clientId) => {
    log('INFO', `Target disconnected`, { clientId });
  });

  proxy.on('error', (error) => {
    log('ERROR', `Proxy error: ${error.message}`);
  });

  // シグナルハンドリング
  process.on('SIGINT', async () => {
    log('INFO', 'Shutting down...');
    await proxy.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down...');
    await proxy.stop();
    process.exit(0);
  });

  // プロキシ起動
  try {
    await proxy.start();
  } catch (error) {
    log('ERROR', `Failed to start proxy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
