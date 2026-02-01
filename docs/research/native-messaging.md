# Native Messaging Protocol 調査

## 調査目的

Chrome Native Messaging の公式仕様を把握し、実装に必要な情報を整理する。

## 調査項目

| 項目 | ステータス | 結果 |
|------|----------|------|
| フォーマット | ✅ 完了 | 4byte 長（Little Endian）+ JSON |
| 制限 | ✅ 完了 | メッセージサイズ上限（1MB） |
| マニフェスト | ✅ 完了 | allowed_origins, path, type |
| プロセス | ✅ 完了 | 起動/終了のライフサイクル |

## 公式ドキュメント

- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

## 調査結果

### メッセージフォーマット

Native Messaging は stdin/stdout を使用したバイナリプロトコル。

```
+-------------------+------------------+
| 4 bytes (uint32)  | N bytes (JSON)   |
| Little Endian     | UTF-8 encoded    |
+-------------------+------------------+
```

**エンコード処理**:
```typescript
function encode(message: object): Buffer {
  const json = JSON.stringify(message);
  const jsonBuffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}
```

**デコード処理**:
```typescript
function decode(buffer: Buffer): { message: object; remaining: Buffer } | null {
  if (buffer.length < 4) return null; // 長さプレフィックス不足

  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null; // メッセージ不完全

  const json = buffer.slice(4, 4 + length).toString('utf8');
  const message = JSON.parse(json);
  const remaining = buffer.slice(4 + length);
  return { message, remaining };
}
```

### 制限事項

| 制限 | 値 | 備考 |
|------|-----|------|
| 最大メッセージサイズ | 1MB (1,048,576 bytes) | JSONエンコード後のサイズ |
| 同時接続 | 1 | 1つの拡張につき1つのホスト接続 |
| プロトコルバージョン | なし | バージョニング機構なし |

### マニフェスト構造

```json
{
  "name": "com.anthropic.claude_bridge",
  "description": "Claude Bridge - Native Messaging Host",
  "path": "/absolute/path/to/claude-bridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID/"
  ]
}
```

**フィールド説明**:
- `name`: ホスト名（拡張から指定される識別子）
- `description`: 説明文
- `path`: 実行ファイルへの絶対パス
- `type`: 常に "stdio"
- `allowed_origins`: 許可する拡張のID一覧

### マニフェスト登録先

| OS | 登録場所 |
|----|----------|
| Windows | レジストリ `HKCU\Software\Google\Chrome\NativeMessagingHosts\{name}` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/{name}.json` |

### プロセスライフサイクル

1. **起動**: 拡張が `chrome.runtime.connectNative()` を呼び出すと起動
2. **通信**: stdin でメッセージ受信、stdout で応答送信
3. **終了**: 拡張が切断するか、ホストが終了すると接続終了

**重要な注意点**:
- ホストは stdin が EOF になると終了すべき
- stderr は Chrome のログに出力される（デバッグ用）
- プロセスは Chrome によって管理される

## 実装上の注意点

1. **stdin のバッファリング**:
   - データが分割されて到着する可能性がある
   - 4byte長プレフィックスを読み取り、必要なバイト数を待機

2. **stdout の同期書き込み**:
   - 複数メッセージを連続送信する場合はキューイングが必要
   - drain イベントを待機して書き込み

3. **エラーハンドリング**:
   - 不正な JSON は適切にエラー処理
   - サイズ超過は接続を終了

## 確認事項

- [x] メッセージフォーマット確認済み
- [x] サイズ制限確認済み
- [x] マニフェスト構造確認済み
- [ ] Claude in Chrome 拡張の Extension ID（実環境で確認必要）

---

*調査完了: Stage 1.1.1*
