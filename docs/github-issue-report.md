# GitHub Issue #20887 への追加報告

## 報告先

https://github.com/anthropics/claude-code/issues/20887

## ステータス

✅ **投稿完了** (2026-02-02)

---

## 投稿内容（英語）

```markdown
## Additional Finding: Named Pipe Name Collision (Root Cause)

I've been investigating this issue and discovered the **root cause** through binary analysis.

### Discovery

Both Claude Desktop and Claude Code use **identical Named Pipe names** on Windows:

```
\\.\pipe\claude-mcp-browser-bridge-{username}
```

This is extracted from Desktop's `chrome-native-host.exe` binary:

```
"claude-mcp-browser-bridge-"
"\\.\pipe\"
"Creating Windows named pipe: "
```

### Impact

This explains the `EADDRINUSE` errors reported in #21363:

1. **First app to start** creates and owns the Named Pipe
2. **Second app** fails with `EADDRINUSE` when trying to create the same pipe
3. Even if the Native Messaging Host manifest conflict is resolved, the Named Pipe conflict remains

### Current Conflict Points (Summary)

| Layer | Desktop | Code | Conflict |
|-------|---------|------|----------|
| Native Host Manifest | `com.anthropic.claude_browser_extension` | `com.anthropic.claude_code_browser_extension` | ⚠️ Extension uses Desktop's name |
| Named Pipe | `claude-mcp-browser-bridge-{user}` | `claude-mcp-browser-bridge-{user}` | ❌ **Identical** |

### Suggested Fix

1. **Use unique pipe names for each product:**
   - Desktop: `claude-desktop-browser-bridge-{username}`
   - Code: `claude-code-browser-bridge-{username}`

2. **Or implement a shared broker service** that both products can connect to as clients

### Environment

- Windows 11 (10.0.26200)
- Claude Desktop: 1.1.1520
- Claude Code: 2.x

### Diagnostic Tool

I've created a tool to discover Named Pipes: https://github.com/khayashi4337/claude-bridge/blob/main/scripts/discover-pipes.js
```

---

## 投稿前チェックリスト

- [ ] Issue #20887 の既存コメントを確認（重複がないか）
- [ ] 英語の文法チェック
- [ ] Claude Desktop のバージョン番号を確認
- [ ] Claude Code のバージョン番号を確認

## 補足情報

### バイナリ解析方法

```javascript
// chrome-native-host.exe から文字列を抽出
const buffer = fs.readFileSync(desktopHostPath);
// ASCII 文字列を抽出してフィルタ
```

### 再現手順

1. Claude Desktop と Claude Code の両方をインストール
2. Desktop を起動
3. Code CLI を起動
4. `\\.\pipe\claude-mcp-browser-bridge-{username}` の所有者を確認
5. 後から起動した方が接続に失敗

### 影響範囲

- Windows ユーザー全員
- macOS でも同様の可能性あり（Unix Socket で同名？要調査）
