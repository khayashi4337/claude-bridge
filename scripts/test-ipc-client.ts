#!/usr/bin/env ts-node
/**
 * IPC Client 検証スクリプト
 *
 * Stage 1.3.2: Claude 接続検証
 *
 * 使用方法:
 *   npx ts-node scripts/test-ipc-client.ts [target]
 *
 *   target: cli (default) or desktop
 */

import { createConnector } from '../src/ipc';
import { Target, IpcMessage } from '../src/types';

async function main() {
  const target: Target = (process.argv[2] as Target) || 'cli';

  console.log(`=== IPC Client Test ===`);
  console.log(`Target: ${target}`);
  console.log('');

  const connector = createConnector();

  try {
    console.log('Connecting...');
    const connection = await connector.connect({
      target,
      timeout: 5000,
    });

    console.log('✓ Connected successfully!');
    console.log(`  Target: ${connection.getTarget()}`);
    console.log(`  Connected: ${connection.isConnected()}`);

    // メッセージハンドラを設定
    connection.onMessage((msg: IpcMessage) => {
      console.log('Received:', JSON.stringify(msg, null, 2));
    });

    connection.onError((err) => {
      console.error('Error:', err.message, `[${err.code}]`);
    });

    connection.onClose(() => {
      console.log('Connection closed');
    });

    // テストメッセージ送信
    console.log('');
    console.log('Sending test message...');

    const testMessage: IpcMessage = {
      type: 'ping',
      payload: { timestamp: Date.now() },
      id: 'test-001',
    };

    await connection.send(testMessage);
    console.log('✓ Message sent:', JSON.stringify(testMessage));

    // 応答を待機
    console.log('');
    console.log('Waiting for response (5s)...');

    await new Promise<void>((resolve) => setTimeout(resolve, 5000));

    // 接続を閉じる
    console.log('');
    console.log('Closing connection...');
    await connection.close();
    console.log('✓ Connection closed');

  } catch (error) {
    console.error('');
    console.error('✗ Connection failed!');

    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
    }

    console.error('');
    console.error('Hints:');
    console.error(`  - Make sure Claude ${target === 'cli' ? 'Code CLI' : 'Desktop'} is running`);
    console.error(`  - Check the IPC path is correct`);

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
