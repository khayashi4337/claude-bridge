# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Bridge** - Chrome 拡張「Claude in Chrome」と Claude 製品（Desktop / Code CLI）の接続を制御するプロキシシステム

### 主な目的

1. Claude Desktop と Claude Code の Native Messaging Host 競合問題の解決
2. 接続先の動的切り替え機能
3. トラブルシューティングツールの提供

## Quick Start

### 拡張機能の状態確認

セッション開始時に Chrome 拡張が有効か確認:

```bash
# 通常出力
node scripts/check-claude-extension.js

# JSON 出力
node scripts/check-claude-extension.js --json

# 無効な場合
# chrome://extensions/?id=fcoeoabgfenejglbffodgkkbkcdhcgfn で有効化
```

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test
```

## Architecture

```
Chrome Extension (fcoeoabgfenejglbffodgkkbkcdhcgfn)
    │
    ▼ Native Messaging (stdin/stdout)
Client Host (claude-bridge-client-host.bat)
    │
    ▼ Named Pipe (client connection)
CLI's Pipe (\\.\pipe\claude-mcp-browser-bridge-{user})
    │
    ▼
Claude Code CLI (listening)
```

## Key Files

| ファイル | 説明 |
|----------|------|
| `scripts/check-claude-extension.js` | 拡張機能ステータスチェッカー |
| `src/client-host/` | Client Host 実装 |
| `src/pipe-proxy/` | Named Pipe プロキシ |
| `docs/investigation-notes.md` | 調査メモ・技術詳細 |

## Known Issues

### GitHub Issue #20887

Claude Desktop と Claude Code の両方がインストールされていると、
Chrome 拡張が Desktop に接続してしまい、Code の MCP ツールが動作しない。

**回避策**: Desktop のマニフェストを編集して Code のホストを指すように変更

詳細: `docs/investigation-notes.md`

## Chrome Profile

- 拡張機能は **Profile 1** にインストール
- Preferences: `%LOCALAPPDATA%\Google\Chrome\User Data\Profile 1\Secure Preferences`

## Extension ID

- Claude in Chrome: `fcoeoabgfenejglbffodgkkbkcdhcgfn`

## 関連リンク

- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [GitHub Issue #20887](https://github.com/anthropics/claude-code/issues/20887)
