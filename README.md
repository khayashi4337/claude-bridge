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
| 拡張機能ステータスチェッカー | ✅ 動作 |
| Native Host 診断ツール | 🚧 未実装 |
| Named Pipe 診断ツール | 🚧 未実装 |
| 統合診断ツール | 🚧 未実装 |
| Client Host（接続代理） | ⚠️ 実験的 |

## クイックスタート

### 拡張機能の状態確認

```bash
# Node.js 版
node scripts/check-claude-extension.js

# JSON 出力
node scripts/check-claude-extension.js --json

# Bash 版
./scripts/check-claude-extension.sh
```

**出力例:**
```
==================================
Chrome Extension Status Checker
==================================
Extension: Claude in Chrome
ID: fcoeoabgfenejglbffodgkkbkcdhcgfn
Profile: Profile 1
----------------------------------
STATUS: ENABLED ✅
Version: 1.0.41
```

## 既知の問題

### Native Host 競合（Issue #20887）

Claude Desktop と Claude Code が同じ Native Messaging Host 名を使用するため、両方がインストールされていると競合が発生します。

**症状:**
- Claude Code の MCP ブラウザツールが動作しない
- "Browser extension is not connected" エラー

**暫定的な回避策:**
1. Claude Desktop をアンインストール
2. または、Native Host マニフェストを手動で編集

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
