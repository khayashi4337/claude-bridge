# Claude Bridge

> ⚠️ **WIP (Work In Progress)** - このプロジェクトは開発中です。本番環境での使用は推奨しません。

Chrome拡張「Claude in Chrome」と Claude製品（Desktop / Code CLI）の接続問題を調査・診断するためのツール群です。

## 背景

Claude Desktop と Claude Code CLI の両方がインストールされている環境で、Chrome拡張がどちらに接続するか制御できない問題があります（[GitHub Issue #20887](https://github.com/anthropics/claude-code/issues/20887)）。

このリポジトリは、問題の調査と診断ツールの提供を目的としています。

## 現在の状態

| 機能 | 状態 |
|------|------|
| 問題の調査・分析 | ✅ 完了 |
| 対話型メニュー | ✅ 動作 |
| 拡張機能ステータスチェッカー | ✅ 動作 |
| 統合診断ツール | ✅ 動作 |
| Named Pipe 診断ツール | ✅ 動作 |
| 接続先切り替え | ✅ 動作 |
| Client Host（接続代理） | ⚠️ 実験的 |

## クイックスタート

### 対話型メニュー（推奨）

```bash
node scripts/menu.js
```

メニューから全てのツールにアクセスできます:

```
╔════════════════════════════════════════════════════════════╗
║           Claude Bridge - コントロールパネル            ║
╠════════════════════════════════════════════════════════════╣
║  現在の接続先: Claude Code                              ║
╠════════════════════════════════════════════════════════════╣
║ 診断ツール                                                ║
║  [1] 拡張機能の状態を確認                                 ║
║  [2] 統合診断を実行                                       ║
║  [3] Named Pipe を探索                                    ║
║  [3d] Named Pipe 差分比較 (推奨)                          ║
╠════════════════════════════════════════════════════════════╣
║ 接続先の切り替え                                          ║
║  [4] Claude Code に切り替え                               ║
║  [5] Claude Desktop に切り替え（元に戻す）                ║
╠════════════════════════════════════════════════════════════╣
║ プロセス管理                                              ║
║  [6] Chrome を再起動                                      ║
║  [7] Claude Desktop を起動                                ║
║  [8] Claude Desktop を終了                                ║
╚════════════════════════════════════════════════════════════╝
```

### 個別ツールの使い方

#### 拡張機能の状態確認

```bash
node scripts/check-claude-extension.js
node scripts/check-claude-extension.js --json  # JSON出力
```

#### 統合診断

```bash
node scripts/diagnose-all.js
```

Native Host の登録場所、Named Pipe の状態、プロセス情報を一括診断します。

#### Named Pipe 差分比較

```bash
node scripts/discover-pipes.js --diff
```

Desktop/Code がどの Pipe を作成するか特定するための差分比較ツール。
プロセス起動/終了を自動で行い、Before/After の差分を表示します。

#### Named Pipe 監視

```bash
node scripts/discover-pipes.js --watch
```

リアルタイムで Pipe の追加/削除を監視します。

## 既知の問題

### Native Host 競合（Issue #20887）

Claude Desktop と Claude Code が同じ Native Messaging Host 名を使用するため、両方がインストールされていると競合が発生します。

**症状:**
- Claude Code の MCP ブラウザツールが動作しない
- "Browser extension is not connected" エラー

**原因:**
Desktop と Code が同じ Named Pipe 名 (`claude-mcp-browser-bridge-{username}`) を使用するため競合が発生。

**回避策:**

1. **メニューツールで切り替え（推奨）**
   ```bash
   node scripts/menu.js
   # [4] Claude Code に切り替え
   # [5] Claude Desktop に切り替え
   ```

2. Claude Desktop をアンインストール

3. Native Host マニフェストを手動で編集

詳細は [docs/investigation-notes.md](docs/investigation-notes.md) を参照してください。

## ドキュメント

- [調査メモ](docs/investigation-notes.md) - 技術的な調査結果
- [問題の棚卸し](docs/problem-inventory.md) - 解決すべき問題の整理
- [Native Messaging Protocol](docs/research/native-messaging.md) - プロトコル仕様

## 開発

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# テスト
npm test

# 型チェック
npm run typecheck
```

## 関連リンク

- [GitHub Issue #20887](https://github.com/anthropics/claude-code/issues/20887) - Desktop/Code 競合問題
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) - 公式ドキュメント

## ライセンス

MIT

---

**注意:** このプロジェクトは Anthropic の公式プロジェクトではありません。個人による調査・実験プロジェクトです。
