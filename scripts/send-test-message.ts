#!/usr/bin/env ts-node
/**
 * テストメッセージ送信スクリプト
 *
 * Native Messaging 形式でメッセージを stdout に出力
 */

import { MessageParser } from '../src/host';
import { NativeMessage } from '../src/types';

const parser = new MessageParser();

// テストメッセージを作成
const testMessages: NativeMessage[] = [
  { type: 'hello', payload: { greeting: 'Hello, Bridge!' } },
  { type: 'test', payload: { data: [1, 2, 3] }, id: 'req-001' },
  { type: 'unicode', payload: '日本語テスト 🎉', id: 'req-002' },
];

// 各メッセージをエンコードして出力
for (const msg of testMessages) {
  const buffer = parser.encode(msg);
  process.stdout.write(buffer);
}
