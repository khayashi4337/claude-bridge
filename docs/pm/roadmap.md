# Claude Bridge - ロードマップ

## プロジェクト概要

**名称**: Claude Bridge
**目的**: Chrome拡張「Claude in Chrome」と Claude製品（Desktop / Code CLI）の接続競合を解決する
**成果**: ユーザーが接続先を自由に選択できるプロキシシステム

---

## 背景と課題

### 現状の問題

| 問題 | 原因 | ユーザーへの影響 |
|------|------|------------------|
| 接続先競合 | Desktop と CLI が同じホスト名を使用 | 意図しない方に繋がる |
| 選択不可 | Anthropic実装に切替機能がない | CLI を使いたいのに Desktop に繋がる |
| 原因不明 | 通信内容が見えない | 「動かない」としか言えない |

### 解決アプローチ

Chrome拡張と Claude製品の間に Bridge を挟み、通信を制御する。

```
【現状】
Chrome Extension ──→ Anthropic Host ──→ Desktop or CLI (選べない)

【解決後】
Chrome Extension ──→ Claude Bridge ──→ Desktop (設定による)
                                   └──→ CLI     (設定による)
```

---

## ゴール定義

### 成功条件
1. Desktop と CLI の両方が起動している状態で
2. ユーザーが指定した方に接続される
3. 指定した方が停止していればフォールバックする

### 非ゴール（スコープ外）
- Chrome拡張自体の修正・改善
- Anthropic へのコントリビュート
- Linux 対応（Phase 2 時点では）
- GUI 設定画面
- 負荷分散・複数インスタンス対応

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Browser                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Claude in Chrome Extension               │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ Native Messaging
                               │ (stdin/stdout, 4byte長+JSON)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Claude Bridge                         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Native Host │  │   Router    │  │     IPC Client      │  │
│  │             │→ │             │→ │                     │  │
│  │ メッセージ   │  │ 接続先決定   │  │ Desktop/CLI へ接続  │  │
│  │ 受信/応答   │  │ 設定参照     │  │ メッセージ転送      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          │                                  │
│                   ┌──────┴──────┐                           │
│                   ▼             ▼                           │
│              [config.json]  [Logger]                        │
│                              ↓                              │
│                         logs/*.jsonl                        │
└─────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │ IPC                             │ IPC
              │ (Named Pipe / Unix Socket)      │
              ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────────┐
│   Claude Desktop     │          │      Claude Code CLI     │
└──────────────────────┘          └──────────────────────────┘
```

---

## 技術スタック

| 項目 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript | 型安全性、Claude Code と同ランタイム |
| ランタイム | Node.js | Native Messaging Host として動作可能 |
| ビルド | esbuild | 高速、設定シンプル |
| CLI | commander | 軽量、npm 標準的 |

---

## Phase サマリー

| Phase | 名前 | 目的 | 前提 |
|-------|------|------|------|
| **0** | Setup | 開発基盤構築 | なし |
| **1** | Core Bridge | 通信経路確立 | Phase 0 |
| **2** | Router | 接続先制御 **← 本命** | Phase 1 |
| **3** | Distribution | 配布・普及 | Phase 2 |

```
Phase 0 ───→ Phase 1 ───→ Phase 2 ───→ Phase 3
  基盤         通信          本命         配布
             (土台)       (目的達成)     (普及)
```

---

## Phase 0: Setup（基盤構築）

### 目的
開発環境を整備し、実装を開始できる状態にする

### なぜ必要か
- TypeScript で実装するためビルド環境が必須
- 全 Phase の土台

### スコープ

| IN | OUT |
|----|-----|
| package.json | 機能実装 |
| tsconfig.json | テスト環境 |
| ビルドスクリプト | CI/CD |
| ディレクトリ構造 | ドキュメント整備 |

### 成果物

| ファイル | 内容 |
|----------|------|
| package.json | 依存関係定義 |
| tsconfig.json | TypeScript 設定 |
| src/index.ts | エントリーポイント |

### 完了条件

```bash
npm install   # 成功
npm run build # dist/index.js 生成
```

---

## Phase 1: Core Bridge（コアブリッジ）

### 目的
Chrome拡張からのメッセージを受信し、Claude製品へ転送する経路を確立する

### なぜ必要か
- Bridge が通信を中継できなければ、ルーティング制御もできない
- ログ機能で実際のメッセージ形式を把握できる
- この Phase で「通る」ことを確認してから次へ進む

### スコープ

| IN | OUT |
|----|-----|
| Native Messaging Host | ルーティング |
| 単一接続先への転送 | 複数接続先切替 |
| JSONL ログ出力 | Web UI 可視化 |
| 開発用インストール | npm 公開 |

### 成果物

| ファイル | 責務 |
|----------|------|
| src/host/native-host.ts | Chrome との stdin/stdout 通信 |
| src/host/message-parser.ts | 4byte長プレフィックス + JSON |
| src/ipc/connector.ts | Claude製品への IPC 接続 |
| src/logger.ts | JSONL ログ出力 |
| scripts/install-host.ts | マニフェスト生成・登録 |

### 完了条件

```bash
# 1. インストール
npm run install:host

# 2. Claude CLI 起動状態で Chrome拡張を操作

# 3. 検証
cat logs/bridge.jsonl
# → メッセージが記録されている
# → Chrome拡張が正常動作
```

---

## Phase 2: Router（ルーティング）

### 目的
ユーザー設定に基づいて Desktop / CLI を切り替える

### なぜ必要か
- **これが本プロジェクトの核心**
- 「両方動いているとき、どちらに繋ぐか」を制御
- フォールバックで可用性も向上

### スコープ

| IN | OUT |
|----|-----|
| 設定ファイル（JSON） | GUI 設定画面 |
| プロセス検出（Win/Mac） | Linux 対応 |
| 優先順位振り分け | 負荷分散 |
| フォールバック | 複数インスタンス |

### 成果物

| ファイル | 責務 |
|----------|------|
| src/router/config.ts | 設定ファイル管理 |
| src/router/router.ts | 振り分けロジック |
| src/detector/index.ts | プロセス検出 I/F |
| src/detector/windows.ts | Windows 実装 |
| src/detector/darwin.ts | macOS 実装 |

### 完了条件

```bash
# 1. Desktop + CLI 両方起動

# 2. CLI 優先設定
npx claude-bridge config set target cli

# 3. 操作 → CLI で処理される

# 4. CLI 終了 → 再操作 → Desktop にフォールバック
```

---

## Phase 3: Distribution（配布）

### 目的
他の開発者が簡単にインストール・利用できるようにする

### なぜ必要か
- 手動設定はエラーが起きやすい
- `npx` 一発で完了が理想
- GitHub Issue で困っている人に提供

### スコープ

| IN | OUT |
|----|-----|
| CLI コマンド | GUI アプリ |
| npm 公開 | Homebrew 等 |
| 基本ドキュメント | 多言語 |
| install/uninstall | 自動更新 |

### 成果物

| ファイル | 責務 |
|----------|------|
| src/cli/index.ts | エントリーポイント |
| src/cli/commands/install.ts | インストール |
| src/cli/commands/uninstall.ts | アンインストール |
| src/cli/commands/config.ts | 設定変更 |
| src/cli/commands/status.ts | 状態表示 |
| docs/README.md | 使用方法 |

### CLI 仕様

```bash
# インストール
$ npx claude-bridge install
Installing Claude Bridge...
  Creating manifest...     done
  Registering host...      done
Installation complete. Please restart Chrome.

# 状態確認
$ npx claude-bridge status
Claude Bridge: installed
Claude Desktop: running
Claude Code CLI: not running
Current target: auto (→ desktop)

# 設定
$ npx claude-bridge config set target cli
Target set to: cli

# アンインストール
$ npx claude-bridge uninstall
Uninstalling Claude Bridge...
  Removing manifest...     done
  Unregistering host...    done
Uninstallation complete.
```

### 完了条件

```bash
# 新環境で
npx claude-bridge install
# Chrome 再起動
# Claude in Chrome が動作する
```

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Anthropic がプロトコル変更 | Bridge が動かなくなる | ログで形式把握、追従しやすい設計 |
| Chrome拡張の ID 変更 | マニフェスト不一致 | ID を設定ファイルで変更可能に |
| OS 間の差異 | 特定 OS で動かない | Detector を OS 別に分離 |
