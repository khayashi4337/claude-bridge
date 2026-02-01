#!/usr/bin/env ts-node
/**
 * Process Detector 検証スクリプト
 *
 * Stage 2.2.4: ヘルスチェック統合
 */

import { createDetector } from '../src/detector';
import { createConnector } from '../src/ipc';
import { DEFAULT_CONFIG } from '../src/config';

async function main() {
  console.log('=== Process Detector Test ===');
  console.log(`Platform: ${process.platform}`);
  console.log('');

  const connector = createConnector();
  const detector = createDetector(connector, DEFAULT_CONFIG);

  console.log('Detecting Claude processes...');
  console.log('');

  const result = await detector.detectAll();

  // Desktop
  console.log('Desktop:');
  console.log(`  Process: ${result.desktop.processRunning ? '✓ running' : '✗ not running'}`);
  if (result.desktop.processRunning) {
    console.log(`  IPC:     ${result.desktop.ipcConnectable ? '✓ connectable' : '✗ not connectable'}`);
    if (result.desktop.responseTime !== undefined) {
      console.log(`  Latency: ${result.desktop.responseTime}ms`);
    }
    if (result.desktop.error) {
      console.log(`  Error:   ${result.desktop.error}`);
    }
  }

  console.log('');

  // CLI
  console.log('CLI:');
  console.log(`  Process: ${result.cli.processRunning ? '✓ running' : '✗ not running'}`);
  if (result.cli.processRunning) {
    console.log(`  IPC:     ${result.cli.ipcConnectable ? '✓ connectable' : '✗ not connectable'}`);
    if (result.cli.responseTime !== undefined) {
      console.log(`  Latency: ${result.cli.responseTime}ms`);
    }
    if (result.cli.error) {
      console.log(`  Error:   ${result.cli.error}`);
    }
  }

  console.log('');
  console.log('Detection complete.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
