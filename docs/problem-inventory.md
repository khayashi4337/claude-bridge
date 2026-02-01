# 問題の棚卸し

## 解決すべき核心問題

### Primary Problem
**Claude Desktop と Claude Code が同時にインストールされている環境で、Chrome拡張「Claude in Chrome」がどちらに接続するか制御できない**

### 技術的原因

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension                              │
│              (fcoeoabgfenejglbffodgkkbkcdhcgfn)                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ Native Messaging
                      │ (com.anthropic.claude_browser_extension)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Native Messaging Host 競合                         │
├─────────────────────┬───────────────────────────────────────────┤
│   Claude Desktop    │            Claude Code                    │
│   (先にマニフェスト │            (後から上書き？)               │
│    を登録した方が   │                                           │
│    接続を受ける)    │                                           │
└─────────────────────┴───────────────────────────────────────────┘
```

## 問題の分解

| # | 問題 | 深刻度 | 状態 |
|---|------|--------|------|
| 1 | 両アプリが同じ Host 名を使用 | Critical | 未解決（Anthropic側の問題） |
| 2 | 拡張機能が無効になることがある | Medium | ✅ 検出ツール作成済み |
| 3 | 接続先を動的に切り替えられない | High | 調査中 |
| 4 | Named Pipe の競合（Windows） | High | 部分的に理解 |

---

## 現状認識のためのツール

### 既存ツール

| ツール | 目的 | 場所 |
|--------|------|------|
| `check-claude-extension.js` | 拡張機能の有効/無効を検出 | `scripts/` |
| `check-claude-extension.sh` | 同上（Bash版） | `scripts/` |

### 必要だが未作成のツール

| ツール | 目的 | 優先度 |
|--------|------|--------|
| `check-native-host.js` | どの Native Host が登録されているか確認 | High |
| `check-named-pipe.js` | Named Pipe の状態を確認（Windows） | High |
| `check-claude-processes.js` | Claude関連プロセスの一覧 | Medium |
| `diagnose-all.js` | 上記を統合した診断レポート生成 | High |

---

## スコープを小さくするための戦略

### Option A: 診断ツールのみに特化（推奨）

**スコープ**: 問題の検出と報告に徹する

```
診断ツール → 問題を発見 → ユーザーに手動修正方法を提示
```

**利点**:
- 実装が比較的シンプル
- Anthropic の実装に依存しない
- 安全（破壊的変更なし）

**成果物**:
- 診断 CLI ツール
- 手動修正手順のドキュメント

### Option B: Client Host による接続代理

**スコープ**: Native Host を置き換えて接続を制御

```
Chrome → Client Host → Named Pipe → CLI
```

**課題**:
- Named Pipe の作成タイミング問題
- CLI セッションが起動していない場合の対応
- Desktop 対応の複雑さ

**状態**: 部分的に実装済み、完全動作には至っていない

### Option C: Anthropic の修正を待つ

**スコープ**: 調査結果のみを成果として公開

**利点**:
- 最小の労力
- 安全

**成果物**:
- 調査ドキュメント
- GitHub Issue へのフィードバック

---

## 推奨アクション

### 短期（今すぐ）

1. **診断ツールの整備**
   - [ ] `diagnose-all.js` の作成
   - [ ] Native Host 登録状況の確認ツール
   - [ ] Named Pipe 状態確認ツール

2. **READMEの作成（WIP明記）**
   - [ ] プロジェクトの目的
   - [ ] 現在の状態（WIP）
   - [ ] 既知の問題
   - [ ] 診断ツールの使い方

### 中期（Anthropic の対応待ち）

3. **調査結果の公開**
   - GitHub Issue へのフィードバック
   - 発見した技術的詳細の共有

### 長期（Anthropic が対応しない場合）

4. **Client Host の完成**
   - Named Pipe 問題の解決
   - Desktop 対応

---

## 診断ツールが揃えば何が分かるか

```
diagnose-all を実行すると:

1. Chrome 拡張の状態
   - 有効/無効
   - バージョン
   - インストール先プロファイル

2. Native Host の状態
   - 登録されているホスト一覧
   - 各ホストの実行パス
   - 競合の有無

3. Named Pipe の状態（Windows）
   - 存在するパイプ
   - 接続状況
   - 所有プロセス

4. Claude プロセスの状態
   - Desktop 起動中？
   - Code CLI 起動中？
   - Native Host プロセス

5. 診断結果
   - 問題の特定
   - 推奨アクション
```

これにより:
- **ユーザーが自分の環境の問題を特定できる**
- **手動修正の具体的手順を提示できる**
- **GitHub Issue への報告が正確になる**
