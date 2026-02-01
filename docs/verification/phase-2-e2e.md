# Phase 2 E2E 検証結果

## 検証対象

Phase 2 全体の動作を実環境で検証

## 検証シナリオ

| # | シナリオ | 手順 | 期待結果 | 結果 |
|---|----------|------|----------|------|
| 1 | CLI 優先 | `config set target cli` → 操作 | CLI で処理 | - |
| 2 | Desktop 優先 | `config set target desktop` → 操作 | Desktop で処理 | - |
| 3 | フォールバック | CLI 優先 → CLI 終了 → 操作 | Desktop で処理 | - |
| 4 | 復帰 | CLI 再起動 → 操作 | CLI で処理（戻る） | - |
| 5 | auto モード | `config set target auto` → 操作 | order 順に選択 | - |
| 6 | 両方停止 | Desktop/CLI 両方終了 → 操作 | エラー表示 | - |
| 7 | 動的切替 | 通信中に CLI 終了 | Desktop へ切替 | - |
| 8 | 設定変更 | 通信中に `config set` | 即座に切替 | - |

## 検証環境

- **OS**: Windows / macOS
- **Node.js**: >= 18.0.0
- **Chrome**: 最新版
- **Claude CLI**: 最新版
- **Claude Desktop**: 最新版

## 事前準備

```bash
# ビルド
npm run build:all

# インストール
npm run install:host
```

## 検証手順

### 1. CLI 優先設定

```bash
# 設定変更
npx ts-node src/cli/index.ts config set target cli

# 確認
npx ts-node src/cli/index.ts config get target
# → cli

# ステータス確認
npx ts-node src/cli/index.ts status
```

### 2. Desktop 優先設定

```bash
npx ts-node src/cli/index.ts config set target desktop
npx ts-node src/cli/index.ts status
```

### 3. フォールバック確認

1. CLI 優先設定
2. CLI を終了
3. Chrome 拡張で操作
4. Desktop で処理されることを確認

### 4. auto モード確認

```bash
npx ts-node src/cli/index.ts config set target auto
npx ts-node src/cli/index.ts status
```

## コンポーネントテスト結果

### Stage 2.1: 設定システム
- [x] BridgeConfig スキーマ定義
- [x] バリデーション実装
- [x] ConfigManager 実装
- [x] Config CLI 実装

### Stage 2.2: プロセス検出
- [x] ProcessDetector 抽象クラス
- [x] Windows 実装
- [x] macOS 実装
- [x] ヘルスチェック統合

### Stage 2.3: ルーター
- [x] DecisionEngine 実装
- [x] Router 実装
- [x] FallbackHandler 実装
- [x] ConnectionManager 実装

### Stage 2.4: Bridge 統合
- [x] RoutedBridge 実装
- [x] Status CLI 実装
- [x] E2E 検証ドキュメント

## 完了条件

- [ ] 全シナリオがパス
- [x] 検証結果が docs に記録されている
- [ ] 発見した問題と対応が記録されている

---

*E2E 検証: Phase 2*
