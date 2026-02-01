#!/usr/bin/env ts-node
/**
 * Native Messaging Host スタンドアロン検証スクリプト
 *
 * Stage 1.2.3: スタンドアロン検証
 *
 * 使用方法:
 *   npx ts-node scripts/test-native-host.ts
 *
 * テストデータを stdin に流すと、エコーバックされます。
 */

import { NativeHost } from '../src/host';
import { NativeMessage } from '../src/types';

async function main() {
  console.error('=== Native Host Test ===');
  console.error('Starting Native Messaging Host...');

  const host = new NativeHost();

  host.on('message', async (msg: NativeMessage) => {
    console.error('Received:', JSON.stringify(msg));

    // エコーバック
    const response: NativeMessage = {
      type: 'echo',
      payload: msg,
      id: msg.id,
    };

    console.error('Sending:', JSON.stringify(response));
    await host.send(response);
  });

  host.on('error', (err) => {
    console.error('Error:', err.message, `[${err.code}]`);
  });

  host.on('close', () => {
    console.error('Host closed');
    process.exit(0);
  });

  await host.start();
  console.error('Host started. Waiting for messages...');
  console.error('(Send messages via stdin in Native Messaging format)');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
