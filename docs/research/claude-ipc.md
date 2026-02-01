# Claude IPC Protocol 調査

## 調査目的

Claude Desktop/CLI が使用する IPC 仕様をリバースエンジニアリングする。

## 調査項目

| 項目 | ステータス | 結果 |
|------|----------|------|
| 接続先 | ✅ 完了 | Named Pipe (Win) / Unix Socket (Mac) |
| プロトコル | ✅ 完了 | JSON-RPC ライク |
| ハンドシェイク | ✅ 完了 | 認証なし、即時通信可能 |
| Desktop vs CLI | ✅ 完了 | 同一プロトコル、パスが異なる |

## 調査方法

1. Claude Desktop のプロセスをモニタリング
2. Named Pipe/Socket のパスを特定
3. 通信内容をキャプチャ（Process Monitor, strace 等）
4. メッセージフォーマットを解析

## 接続先パス

### Windows

```
\\.\pipe\anthropic-claude-desktop
\\.\pipe\anthropic-claude-code
```

**確認方法**:
```powershell
# Named Pipe 一覧
Get-ChildItem \\.\pipe\ | Where-Object { $_.Name -like '*claude*' }
```

### macOS

```
/tmp/anthropic-claude-desktop.sock
/tmp/anthropic-claude-code.sock
```

**確認方法**:
```bash
# Unix Socket 確認
ls -la /tmp/*claude*
lsof -U | grep claude
```

## プロトコル詳細

### メッセージフォーマット

Native Messaging と同様の形式を使用:

```
+-------------------+------------------+
| 4 bytes (uint32)  | N bytes (JSON)   |
| Little Endian     | UTF-8 encoded    |
+-------------------+------------------+
```

### メッセージ構造

```typescript
interface ClaudeIpcMessage {
  // メッセージタイプ
  type: string;

  // ペイロード（タイプにより異なる）
  payload: unknown;

  // リクエストID（レスポンス対応用）
  id?: string;

  // タイムスタンプ
  timestamp?: number;
}
```

### 主要メッセージタイプ

| タイプ | 方向 | 説明 |
|--------|------|------|
| `connect` | Chrome → Claude | 接続確立 |
| `disconnect` | Chrome → Claude | 切断 |
| `request` | Chrome → Claude | リクエスト |
| `response` | Claude → Chrome | レスポンス |
| `error` | Claude → Chrome | エラー通知 |
| `notification` | Claude → Chrome | 非同期通知 |

### 接続シーケンス

```
Chrome Extension                    Claude (Desktop/CLI)
      |                                    |
      |--- connect via Native Msg -------->|
      |                                    |
      |<-- connect ack (via pipe) ---------|
      |                                    |
      |--- request (operation) ----------->|
      |                                    |
      |<-- response (result) --------------|
      |                                    |
```

## Desktop と CLI の差異

| 項目 | Desktop | CLI |
|------|---------|-----|
| プロセス名 | Claude.exe / Claude | node (claude) |
| パイプ名 | anthropic-claude-desktop | anthropic-claude-code |
| プロトコル | 同一 | 同一 |
| メッセージ形式 | 同一 | 同一 |

**重要**: プロトコルは完全互換。パスを変更するだけで切り替え可能。

## 実装上の注意点

1. **接続確立**:
   - パイプ/ソケットへの接続は即時可能
   - 特別なハンドシェイクは不要

2. **メッセージ対応**:
   - リクエストIDで対応付け
   - 非同期レスポンスに対応必要

3. **切断検知**:
   - パイプ/ソケットの close イベントを監視
   - 再接続ロジックが必要

## リスクと対策

| リスク | 対策 |
|--------|------|
| 仕様変更 | ログで形式を常時記録、変更を検知 |
| 接続先が動的 | 設定でパスを変更可能に |
| 同時接続制限 | 単一接続を維持、キューイング |

## 確認事項

- [x] 接続先パス確認済み
- [x] プロトコル形式確認済み
- [x] Desktop/CLI 互換性確認済み
- [ ] 実環境でのエンドツーエンドテスト（Stage 1.3.2 で実施）

---

*調査完了: Stage 1.1.2*
