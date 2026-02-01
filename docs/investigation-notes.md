# Claude Bridge 調査メモ

## 調査日: 2026-02-01

## 目的
Chrome拡張「Claude in Chrome」と Claude製品（Desktop / Code CLI）の接続先を制御するプロキシシステムの開発

## 発見した実際のアーキテクチャ

### Claude Code CLI のブラウザ連携

```
Chrome Extension (fcoeoabgfenejglbffodgkkbkcdhcgfn)
    │
    ▼ Native Messaging (stdin/stdout)
chrome-native-host.bat
    │
    ▼ Creates Named Pipe
\\.\pipe\claude-mcp-browser-bridge-{username}
    ▲
    │ Connects
Claude Code CLI (listening)
```

### Claude Desktop のブラウザ連携

```
Chrome Extension (dihbgbndebgnbjfmelmegjepbnkhlgni 等)
    │
    ▼ Native Messaging (stdin/stdout)
chrome-native-host.exe
    │
    ▼ (内部実装は不明)
Claude Desktop
```

## 問題点

### 1. Named Pipe の存在
- Native Host は単なるリレーではなく、Named Pipe を作成してCLIと通信
- Bridge で Native Host を置き換えると、この仕組みが壊れる

### 2. 拡張が特定のホスト名を要求
- Chrome 拡張は `com.anthropic.claude_code_browser_extension` という固定名でホストを探す
- 別名で登録した Bridge には接続しない

### 3. 複数プロファイル問題
- 拡張が Profile 1 にインストール、Default には未インストール
- Native Host 登録は HKCU レベル（全プロファイル共通）

## 試行した方法

### 方法1: IPC (Named Pipe) 経由の接続
- **想定**: Native Host が Named Pipe で待ち受け、Bridge が接続
- **結果**: ❌ 実際は Native Host が Pipe を作成する側だった

### 方法2: Native Host の置き換え
- **想定**: Bridge を Native Host として登録し、メッセージを転送
- **結果**: ❌ Named Pipe の仕組みが壊れ、CLI との通信不可

### 方法3: Process Spawn 方式
- **想定**: Bridge が Native Host プロセスを起動して stdin/stdout で通信
- **結果**: △ プロセス起動は成功するが、Named Pipe の問題は解決せず

## 技術的制約

1. **Chrome Native Messaging の制約**
   - ホスト名は拡張のマニフェストで固定
   - 1つのホスト名に対して1つの実行ファイルのみ

2. **Claude Code CLI の制約**
   - Named Pipe `claude-mcp-browser-bridge-{username}` でリッスン
   - Native Host がこの Pipe に接続してくることを期待

3. **同時接続の制約**
   - Desktop と CLI が同時に起動している場合の切り替えは、
     現状のアーキテクチャでは困難

## 要調査項目

- [ ] Chrome 拡張で複数の Native Host を切り替える方法
- [ ] Named Pipe を中継するプロキシの実装可能性
- [x] Claude 公式の接続切り替え機能の有無 → **現時点でなし（既知のバグ）**
- [x] 他の類似プロジェクトの調査 → **GitHub Issues で多数報告あり**

## Webリサーチ結果（2026-02-01）

### 発見: これは既知のバグ

GitHub Issues で多数の報告が確認された：
- Issue #20546, #20341, #20887, #21363

### GitHub Issue #20887 の内容
**タイトル**: Claude code should work with Claude Desktop together

**問題**:
- Claude Desktop と Claude Code の両方がインストールされていると競合が発生
- 両方が同じ Native Host 名 `com.anthropic.claude_code_browser_extension` を使用
- どちらか一方しか動作しない

**現在のステータス**: Open（未解決）

### GitHub Issue #21363 の内容
**タイトル**: Claude.ai extension error with Claude Code on Windows

**問題**:
- Windows 固有の問題として報告
- Claude Code の Named Pipe 作成で `EADDRINUSE` エラー
- `\\.\pipe\claude-mcp-browser-bridge-{username}` が既に使用中

**原因**:
- Claude Desktop と Claude Code が同じ Pipe 名を使おうとする
- Windows では Pipe 名の衝突がより深刻な問題を引き起こす

### 公式対応状況

- Anthropic から公式な修正はまだリリースされていない
- Issue はオープン状態のまま
- コミュニティでの回避策のみ

### 既知の回避策

1. **マニフェストファイルの手動編集**
   - `%APPDATA%\Claude Code\ChromeNativeHost\*.json` を編集
   - `path` を目的の Native Host に変更
   - Chrome 再起動が必要

2. **一方のアプリをアンインストール**
   - Claude Desktop か Claude Code のどちらかを削除
   - 根本的解決ではないが、競合は回避できる

3. **別プロファイルで使い分け**
   - Chrome Profile 1 に Claude Code 用の設定
   - Default Profile に Claude Desktop 用の設定
   - ただし Registry は HKCU レベルなので限界あり

### 結論

**Bridge アプローチの限界**:
- Native Host の置き換えでは Named Pipe の仕組みが壊れる
- CLI は特定の Named Pipe に接続することを期待している
- この仕組みを外部から制御するのは困難

**可能性のある代替アプローチ**:
1. Named Pipe をプロキシするサービスを常駐させる
2. Claude CLI / Desktop のソースコード変更を待つ
3. Chrome 拡張側で接続先を切り替えるUIを追加（拡張の改造が必要）

---

## Named Pipe プロキシの実装（2026-02-01）

### 発見した詳細なアーキテクチャ

```
Chrome Extension
    │
    ▼ Native Messaging (stdin/stdout)
claude-code --chrome-native-host
    │
    ├─▶ stdin/stdout: Chrome との通信
    │
    └─▶ Creates Named Pipe: \\.\pipe\claude-mcp-browser-bridge-{user}
           ▲
           │ Connects
    Interactive CLI Session (client)
```

**重要な発見**:
- Native Host (`claude-code --chrome-native-host`) が Named Pipe を **作成** する
- Interactive CLI セッションが Named Pipe に **接続** する（クライアント）
- 両者が同時に Pipe を作成しようとすると EADDRINUSE エラー

### 競合の原因

現在の Claude Code CLI には以下の問題がある:
1. Interactive CLI セッションも Named Pipe を作成する
2. Native Host も同じ名前の Named Pipe を作成しようとする
3. 同じ名前の Pipe は一つしか存在できない → 競合

### 実装したコンポーネント

#### 1. Named Pipe Proxy (`src/pipe-proxy/proxy.ts`)
- 別の Pipe 名で待ち受け
- CLI の Pipe に転送

#### 2. Wrapper Host (`src/pipe-proxy/wrapper-host.ts`)
- 元の Native Host をラップ
- 設定に基づいて CLI/Desktop を切り替え

#### 3. Bridge Service (`src/pipe-proxy/service.ts`)
- バックグラウンドサービスとして動作
- Named Pipe を所有し、CLI と Native Host の両方を接続

### テスト手順（CLI セッションが起動していない状態で）

```bash
# 1. サービスを起動
node dist/service.js

# 2. 別ターミナルで Native Host をテスト
# (Chrome 拡張から呼ばれた状況をシミュレート)
node test-wrapper.js
```

### 制約

- **現在の制限**: Interactive CLI セッションが起動中は、Service は同じ Pipe 名を使用できない
- **解決策**: CLI セッション起動前に Service を開始する必要がある
- **根本的問題**: Claude Code のソースを変更できないため、CLI の Pipe 作成動作を変更できない

---

## 成功したアプローチ: Client Host（2026-02-01）

### 発見

元の Native Host が Pipe を **作成** しようとするのに対し、CLI セッションは Pipe を **リッスン** している。
つまり CLI がサーバー、Native Host がクライアントになるべき構造。

### 解決策: Client Host

Native Host を置き換えて、CLI の Pipe にクライアントとして接続する方式:

```
Chrome Extension
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

### 動作確認済み

1. Client Host が CLI の Pipe にクライアントとして接続
2. Chrome からのメッセージを CLI にリレー
3. CLI からのレスポンスを Chrome にリレー

### インストール方法

```bash
# インストール
node dist/setup.js install

# 状態確認
node dist/setup.js status

# アンインストール（元に戻す）
node dist/setup.js uninstall
```

### ファイル構成

- `dist/client-host.js` - Client Host 本体
- `dist/claude-bridge-client-host.bat` - Windows ランチャー
- `dist/setup.js` - セットアップ CLI
- `%APPDATA%/claude-bridge/config.json` - 設定ファイル

### 今後の課題

- [ ] Desktop 対応（Desktop の Named Pipe を調査）
- [ ] ターゲット切り替え UI
- [ ] 自動起動サービス化

## 参考情報

### Native Host マニフェスト場所
- Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\{name}`
- マニフェスト: `%APPDATA%\Claude Code\ChromeNativeHost\*.json`

### 関連ファイル
- Claude Code Native Host: `~/.claude/chrome/chrome-native-host.bat`
- Claude Desktop Native Host: `%LOCALAPPDATA%\AnthropicClaude\app-*\resources\chrome-native-host.exe`

### Extension IDs
- Claude Code / Claude in Chrome: `fcoeoabgfenejglbffodgkkbkcdhcgfn`
- Claude Desktop: `dihbgbndebgnbjfmelmegjepbnkhlgni`, `dngcpimnedloihjnnfngkgjoidhnaolf`
