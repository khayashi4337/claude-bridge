# Claude Bridge

Chrome拡張「Claude in Chrome」と Claude製品（Desktop / Code CLI）の接続競合を解決するプロキシシステム。

## 背景

Claude Desktop と Claude Code CLI が同時に起動していると、Chrome拡張がどちらに接続するか制御できません。Claude Bridge はこの問題を解決し、ユーザーが接続先を自由に選択できるようにします。

## インストール

```bash
# npm でインストール
npm install -g claude-bridge

# インストール
claude-bridge install
```

または npx で直接実行:

```bash
npx claude-bridge install
```

インストール後、Chrome を再起動してください。

## 使い方

### 状態確認

```bash
claude-bridge status
```

出力例:
```
╔══════════════════════════════════════════════════╗
║ Claude Bridge Status                              ║
╠══════════════════════════════════════════════════╣
║ Bridge:      installed ✓                          ║
║ Running:     yes                                  ║
║ Target:      auto → cli                           ║
╠══════════════════════════════════════════════════╣
║ Claude Desktop                                    ║
║   Process:   running ✓                            ║
║   IPC:       connectable ✓                        ║
╠══════════════════════════════════════════════════╣
║ Claude CLI                                        ║
║   Process:   running ✓                            ║
║   IPC:       connectable ✓  ← active              ║
╚══════════════════════════════════════════════════╝
```

### 接続先の設定

```bash
# CLI を優先
claude-bridge config set target cli

# Desktop を優先
claude-bridge config set target desktop

# 自動選択（デフォルト）
claude-bridge config set target auto
```

### 設定の確認

```bash
# 全設定を表示
claude-bridge config list

# 特定の設定を取得
claude-bridge config get target

# 設定をリセット
claude-bridge config reset
```

### アンインストール

```bash
claude-bridge uninstall
```

## 設定オプション

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `target` | 接続先 (`auto`, `cli`, `desktop`) | `auto` |
| `fallback.enabled` | フォールバックを有効化 | `true` |
| `fallback.order` | 優先順序 | `["cli", "desktop"]` |
| `timeouts.connection` | 接続タイムアウト (ms) | `5000` |
| `timeouts.healthCheck` | ヘルスチェックタイムアウト (ms) | `2000` |
| `detection.interval` | 検出ポーリング間隔 (ms) | `5000` |

## 動作原理

```
Chrome Extension ──→ Claude Bridge ──→ Desktop (設定による)
                                   └──→ CLI     (設定による)
```

Claude Bridge は Native Messaging Host として動作し、Chrome拡張からのメッセージを受信して、設定に基づいて適切な Claude 製品に転送します。

## 対応環境

- **OS**: Windows, macOS
- **Node.js**: 18.0.0 以上
- **Chrome**: 最新版推奨

## トラブルシューティング

### Bridge がインストールされない

```bash
# 強制再インストール
claude-bridge install --force
```

### 接続できない

1. Claude Desktop または CLI が起動しているか確認
2. `claude-bridge status` で状態を確認
3. Chrome を再起動

### 設定ファイルの場所

- **Windows**: `%APPDATA%\claude-bridge\config.json`
- **macOS**: `~/Library/Application Support/claude-bridge/config.json`

### ログの確認

- **Windows**: `%APPDATA%\claude-bridge\logs\`
- **macOS**: `~/Library/Application Support/claude-bridge/logs/`

## 開発

```bash
# クローン
git clone https://github.com/your-repo/claude-bridge.git
cd claude-bridge

# 依存関係インストール
npm install

# ビルド
npm run build:all

# テスト
npm test

# 型チェック
npm run typecheck
```

## ライセンス

MIT
