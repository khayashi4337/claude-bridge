# Phase 1: Core Bridge 詳細計画

## 目次

1. [Phase 1 の位置づけ](#phase-1-の位置づけ)
2. [構造概要](#構造概要)
3. [全体見積もり](#全体見積もり)
4. [共通定義](#共通定義)
5. [Stage 1.1: プロトコル調査](#stage-11-プロトコル調査)
6. [Stage 1.2: Native Messaging Host 実装](#stage-12-native-messaging-host-実装)
7. [Stage 1.3: IPC Client 実装](#stage-13-ipc-client-実装)
8. [Stage 1.4: 運用基盤・統合](#stage-14-運用基盤統合)
9. [依存関係図](#依存関係図)
10. [クリティカルパス](#クリティカルパス)
11. [リスクと対策](#リスクと対策)
12. [Phase 2 への引き継ぎ](#phase-2-への引き継ぎ)

---

## Phase 1 の位置づけ

```
Phase 0: 基盤構築       → 開発環境
Phase 1: 「通る」を実現 → 本Phase ★
Phase 2: 「選べる」を実現 → 本命機能
Phase 3: 「使える」を実現 → 配布・普及
```

---

## 構造概要

```
Phase 1: Core Bridge
│
├── Stage 1.1: プロトコル調査 ★クリティカルパス
│   ├── SubStage 1.1.1: Native Messaging Protocol 調査
│   ├── SubStage 1.1.2: Claude IPC Protocol 調査
│   └── SubStage 1.1.3: 共通型定義・インターフェース設計
│
├── Stage 1.2: Native Messaging Host 実装 ★クリティカルパス
│   ├── SubStage 1.2.1: メッセージパーサー
│   ├── SubStage 1.2.2: Host プロセス
│   └── SubStage 1.2.3: スタンドアロン検証
│
├── Stage 1.3: IPC Client 実装
│   ├── SubStage 1.3.1: 接続マネージャー
│   ├── SubStage 1.3.2: Claude 接続検証
│   └── SubStage 1.3.3: メッセージブリッジ
│
└── Stage 1.4: 運用基盤・統合
    ├── SubStage 1.4.1: ロギングシステム ← 早期着手推奨
    ├── SubStage 1.4.2: インストーラー
    └── SubStage 1.4.3: E2E 検証
```

---

## 全体見積もり

| Stage | サイズ | 工数目安 | 優先度 | 備考 |
|-------|--------|----------|--------|------|
| 1.1 | S | 2-3日 | ★★★ | 他全ての前提、最優先 |
| 1.2 | M | 4-5日 | ★★★ | クリティカルパス |
| 1.3 | M | 4-5日 | ★★☆ | 1.2 と部分並行可 |
| 1.4 | S | 2-3日 | ★★☆ | 1.4.1 は早期着手可 |
| **合計** | - | **12-16日** | - | 約2-3週間 |

サイズ目安: XS=数時間, S=1-2日, M=3-5日, L=1週間+

---

## 共通定義

### ディレクトリ構造

```
claude-bridge/
├── src/
│   ├── types/           # 共通型定義（Phase 1 で作成、Phase 2 で拡張）
│   │   ├── common.ts    # Target, エラー型など
│   │   ├── native.ts    # Native Messaging 関連
│   │   ├── ipc.ts       # IPC 関連
│   │   └── index.ts
│   ├── host/            # Native Messaging Host
│   ├── ipc/             # IPC Client
│   ├── bridge/          # Bridge 本体
│   ├── logger/          # ロギング
│   └── installer/       # インストーラー
├── scripts/             # 開発・検証用スクリプト
├── docs/
│   ├── research/        # 調査結果
│   └── verification/    # 検証結果
└── logs/                # ログ出力先（実行時生成）
```

### ログディレクトリ

| OS | パス |
|----|------|
| Windows | `%APPDATA%\claude-bridge\logs\` |
| macOS | `~/Library/Application Support/claude-bridge/logs/` |
| 開発時 | `./logs/`（プロジェクトルート） |

### 共通型（Stage 1.1.3 で定義）

```typescript
// src/types/common.ts
export type Target = 'desktop' | 'cli';
export type MessageDirection = 'chrome-to-claude' | 'claude-to-chrome';

// 全 Phase 共通のエラー基底クラス
export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

// エラーコード体系（Phase 1/2 共通）
export const ErrorCodes = {
  // 共通 (C0xx)
  UNKNOWN: 'C001',
  INVALID_CONFIG: 'C002',

  // Native Messaging (N0xx)
  PARSE_ERROR: 'N001',
  SIZE_EXCEEDED: 'N002',
  STDIN_ERROR: 'N003',
  STDOUT_ERROR: 'N004',

  // IPC (I0xx)
  CONNECTION_FAILED: 'I001',
  CONNECTION_LOST: 'I002',
  SEND_FAILED: 'I003',
  TIMEOUT: 'I004',

  // Router (R0xx) - Phase 2 で追加
  // ...
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

---

## Stage 1.1: プロトコル調査

### 目的
実装に必要な仕様を調査し、設計の基盤を作る

### なぜ先にやるか
- 仕様が不明なまま実装すると手戻りが発生する
- Claude IPC は非公開仕様のためリバースエンジニアリングが必要
- ここで得た知見が Stage 1.2, 1.3 の設計を決定する

---

### SubStage 1.1.1: Native Messaging Protocol 調査

**サイズ**: XS（数時間）

**目的**: Chrome Native Messaging の公式仕様を把握

**成果物**:
```
docs/research/native-messaging.md
```

**調査項目**:
| 項目 | 調査内容 |
|------|----------|
| フォーマット | 4byte 長（Little Endian）+ JSON |
| 制限 | メッセージサイズ上限（1MB） |
| マニフェスト | allowed_origins, path, type |
| プロセス | 起動/終了のライフサイクル |

**完了条件**:
- 公式ドキュメントを読破し、仕様書にまとめ済み
- 不明点がリストアップ済み

---

### SubStage 1.1.2: Claude IPC Protocol 調査

**サイズ**: S（1日）

**目的**: Claude Desktop/CLI が使用する IPC 仕様をリバースエンジニアリング

**成果物**:
```
docs/research/claude-ipc.md
```

**調査方法**:
1. Claude Desktop のプロセスをモニタリング
2. Named Pipe/Socket のパスを特定
3. 通信内容をキャプチャ（Process Monitor, strace 等）
4. メッセージフォーマットを解析

**調査項目**:
| 項目 | 対象 |
|------|------|
| 接続先 | パイプ名/ソケットパス |
| プロトコル | JSON? バイナリ? |
| ハンドシェイク | 認証の有無、初期化シーケンス |
| Desktop vs CLI | 差異の有無 |

**リスクと対策**:
| リスク | 対策 |
|--------|------|
| 仕様が複雑/暗号化 | 既存 Chrome 拡張コードを解析 |
| 接続先が動的 | 複数パターンを調査、設定で対応 |

**完了条件**:
- 接続先パスが判明している
- メッセージフォーマットが判明している
- Desktop/CLI の差異が整理済み

---

### SubStage 1.1.3: 共通型定義・インターフェース設計

**サイズ**: S（1日）

**目的**: 調査結果を TypeScript 型として定義し、Phase 1/2 共通の基盤を作る

**成果物**:
```
src/types/
├── common.ts        # 共通型（Target, BridgeError 等）
├── native.ts        # Native Messaging 関連
├── ipc.ts           # Claude IPC 関連
└── index.ts         # re-export
```

**型定義**:
```typescript
// src/types/native.ts
export interface NativeMessage {
  type: string;
  payload: unknown;
  id?: string;  // リクエスト/レスポンス対応用
}

// src/types/ipc.ts
export interface IpcMessage {
  // 調査結果に基づく（1.1.2 で確定）
}

export interface IpcConnectionOptions {
  target: Target;
  timeout?: number;
}
```

**完了条件**:
- 共通型（Target, BridgeError, ErrorCodes）が定義済み
- 調査結果が型に反映されている
- Stage 1.2, 1.3, および Phase 2 で使用可能な状態

---

## Stage 1.2: Native Messaging Host 実装

### 目的
Chrome 拡張からのメッセージを正しく受信・応答する

### 前提
Stage 1.1 完了

---

### SubStage 1.2.1: メッセージパーサー

**サイズ**: S（1日）

**目的**: Native Messaging Protocol のバイナリ形式を処理

**成果物**:
```
src/host/
├── message-parser.ts
└── __tests__/
    └── message-parser.test.ts
```

**API 設計**:
```typescript
export class MessageParser {
  /** バイナリバッファからメッセージをデコード */
  decode(buffer: Buffer): { message: NativeMessage; remaining: Buffer } | null;

  /** メッセージをバイナリフォーマットにエンコード */
  encode(message: NativeMessage): Buffer;
}
```

**エラーハンドリング**:
| エラー | コード | 対応 |
|--------|--------|------|
| 不完全なデータ | - | null を返し、追加データを待つ |
| 不正な JSON | N001 | ParseError を throw |
| サイズ超過（1MB） | N002 | SizeExceededError を throw |

**テストケース**:
- 正常なメッセージのデコード/エンコード
- 分割されたデータの処理（チャンク）
- 複数メッセージの連続処理
- 不正データのエラーハンドリング
- 境界値テスト（0byte, 1MB）

**完了条件**:
- 全テストがパス
- エッジケースが網羅されている

---

### SubStage 1.2.2: Host プロセス

**サイズ**: M（2-3日）

**目的**: stdin/stdout を使った Chrome との通信を実現

**成果物**:
```
src/host/
├── native-host.ts       # メインクラス
├── stdin-reader.ts      # stdin ストリーム処理
├── stdout-writer.ts     # stdout 書き込み
└── __tests__/
    ├── native-host.test.ts
    └── integration.test.ts
```

**API 設計**:
```typescript
export class NativeHost extends EventEmitter {
  constructor(options?: NativeHostOptions);

  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: NativeMessage): Promise<void>;

  // Events
  on(event: 'message', handler: (msg: NativeMessage) => void): this;
  on(event: 'error', handler: (err: BridgeError) => void): this;
  on(event: 'close', handler: () => void): this;
}

interface NativeHostOptions {
  stdin?: NodeJS.ReadStream;   // テスト用 DI
  stdout?: NodeJS.WriteStream; // テスト用 DI
  logger?: Logger;             // オプショナル
}
```

**実装上の注意点**:
| 課題 | 対策 |
|------|------|
| stdin のバッファリング | raw mode 設定、チャンク蓄積 |
| stdout の同期書き込み | 書き込みキュー、drain イベント待機 |
| プロセス終了 | SIGTERM/SIGINT ハンドリング、graceful shutdown |

**完了条件**:
- stdin から連続してメッセージを受信できる
- stdout へ正しい形式で書き込める
- graceful shutdown できる

---

### SubStage 1.2.3: スタンドアロン検証

**サイズ**: XS（数時間）

**目的**: Chrome 接続前に Host 単体の動作を確認

**成果物**:
```
scripts/test-native-host.ts
docs/verification/stage-1.2.md
```

**検証スクリプト**:
```typescript
import { NativeHost } from '../src/host/native-host';

const host = new NativeHost();
host.on('message', async (msg) => {
  console.log('Received:', msg);
  await host.send({ type: 'echo', payload: msg });
});
await host.start();
```

**検証手順**:
1. `npx ts-node scripts/test-native-host.ts` で起動
2. テストデータを stdin に流す（バイナリ形式）
3. stdout のエコーバックを確認

**完了条件**:
- エコーバックが動作する
- 検証結果が docs に記録されている

---

## Stage 1.3: IPC Client 実装

### 目的
Claude 製品（Desktop / CLI）への接続とメッセージ転送

### 前提
Stage 1.1 完了（Stage 1.2 と部分的に並行可能）

### 注意
SubStage 1.3.3 は Stage 1.2 完了後に着手

---

### SubStage 1.3.1: 接続マネージャー

**サイズ**: M（2-3日）

**目的**: Named Pipe / Unix Socket への接続を管理

**成果物**:
```
src/ipc/
├── connector.ts         # ファクトリ・インターフェース
├── pipe-client.ts       # Windows Named Pipe
├── socket-client.ts     # Unix Socket
└── __tests__/
    └── connector.test.ts
```

**API 設計**:
```typescript
export interface IpcConnection {
  send(message: IpcMessage): Promise<void>;
  onMessage(handler: (msg: IpcMessage) => void): void;
  onError(handler: (err: BridgeError) => void): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
  isConnected(): boolean;
}

export interface IpcConnector {
  connect(options: IpcConnectionOptions): Promise<IpcConnection>;
}

// ファクトリ
export function createConnector(): IpcConnector {
  return process.platform === 'win32'
    ? new PipeConnector()
    : new SocketConnector();
}
```

**接続先パス（Stage 1.1.2 で確定）**:
```typescript
// 仮の値
const DEFAULT_PATHS = {
  win32: {
    desktop: '\\\\.\\pipe\\anthropic-claude-desktop',
    cli: '\\\\.\\pipe\\anthropic-claude-code',
  },
  darwin: {
    desktop: '/tmp/anthropic-claude-desktop.sock',
    cli: '/tmp/anthropic-claude-code.sock',
  },
};
```

**エラーハンドリング**:
| エラー | コード | 対応 |
|--------|--------|------|
| 接続失敗 | I001 | ConnectionError（接続先情報付き） |
| 切断検知 | I002 | close イベント発火 |
| 送信失敗 | I003 | SendError |
| タイムアウト | I004 | TimeoutError |

**完了条件**:
- Windows Named Pipe に接続できる
- macOS Unix Socket に接続できる
- 接続状態の監視ができる

---

### SubStage 1.3.2: Claude 接続検証

**サイズ**: S（1日）

**目的**: 実際の Claude 製品と通信できることを確認

**成果物**:
```
scripts/test-ipc-client.ts
docs/verification/stage-1.3.md
```

**検証スクリプト**:
```typescript
import { createConnector } from '../src/ipc/connector';

const connector = createConnector();
const connection = await connector.connect({ target: 'cli' });

connection.onMessage((msg) => {
  console.log('Claude response:', msg);
});

// テストメッセージ送信（形式は 1.1.2 で確定）
await connection.send({ /* ... */ });
```

**検証手順**:
1. Claude CLI を起動
2. `npx ts-node scripts/test-ipc-client.ts` を実行
3. 接続確立を確認
4. メッセージ送受信を確認

**完了条件**:
- Claude CLI と通信できる
- Claude Desktop と通信できる（可能なら）
- 検証結果が docs に記録されている

---

### SubStage 1.3.3: メッセージブリッジ

**サイズ**: M（2-3日）

**目的**: Native Host と IPC Client を橋渡しし、完全なブリッジを実現

**前提**: SubStage 1.2.2, 1.3.1 完了

**成果物**:
```
src/bridge/
├── message-bridge.ts    # ブリッジ本体
├── request-tracker.ts   # リクエスト/レスポンス追跡
└── __tests__/
    └── message-bridge.test.ts
```

**API 設計**:
```typescript
export class MessageBridge {
  constructor(options: MessageBridgeOptions);

  start(target: Target): Promise<void>;
  stop(): Promise<void>;
  getStatus(): BridgeStatus;
}

interface MessageBridgeOptions {
  host: NativeHost;
  connector: IpcConnector;
  logger?: Logger;  // オプショナル（1.4.1 で実装）
}

interface BridgeStatus {
  running: boolean;
  target: Target | null;
  messagesForwarded: number;
  lastActivity: Date | null;
}
```

**処理フロー**:
```
Chrome → NativeHost.onMessage
           ↓
      RequestTracker.track(request)
           ↓
      IpcConnection.send(request)
           ↓
      IpcConnection.onMessage(response)
           ↓
      RequestTracker.resolve(response)
           ↓
      NativeHost.send(response)
           ↓
         Chrome
```

**完了条件**:
- Chrome → Claude 方向の転送ができる
- Claude → Chrome 方向の転送ができる
- リクエスト/レスポンスの対応付けができる
- エラー時に適切に処理できる

---

## Stage 1.4: 運用基盤・統合

### 目的
開発・運用を支援する機能と最終検証

### 前提
Stage 1.2, 1.3 完了（1.4.1 は早期着手推奨）

---

### SubStage 1.4.1: ロギングシステム

**サイズ**: S（1日）

**目的**: 通信内容を記録し、デバッグと解析を支援

**早期着手推奨**: Stage 1.1 完了後に着手可能。他の SubStage でオプショナルに使用。

**成果物**:
```
src/logger/
├── logger.ts            # ロガー本体
├── jsonl-writer.ts      # JSONL 出力
└── __tests__/
    └── logger.test.ts
```

**API 設計**:
```typescript
export class Logger {
  constructor(options: LoggerOptions);

  debug(event: string, data?: unknown): void;
  info(event: string, data?: unknown): void;
  warn(event: string, data?: unknown): void;
  error(event: string, error: BridgeError, data?: unknown): void;

  logMessage(direction: MessageDirection, message: unknown): void;
}

interface LoggerOptions {
  logDir: string;
  maxFileSize?: number;  // default: 10MB
  maxFiles?: number;     // default: 5
  level?: 'debug' | 'info' | 'warn' | 'error';
}
```

**ログフォーマット（JSONL）**:
```json
{"ts":"2025-01-15T10:30:00.123Z","level":"info","event":"message_forwarded","data":{"direction":"chrome-to-claude","size":1024}}
{"ts":"2025-01-15T10:30:00.456Z","level":"error","event":"connection_failed","error":{"code":"I001","message":"..."}}
```

**完了条件**:
- JSONL 形式で出力できる
- ファイルローテーションできる
- 非同期でパフォーマンスに影響しない

---

### SubStage 1.4.2: インストーラー

**サイズ**: S（1日）

**目的**: Native Messaging Host としてシステムに登録

**成果物**:
```
src/installer/
├── manifest.ts          # マニフェスト生成
├── windows-installer.ts # Windows レジストリ
├── darwin-installer.ts  # macOS ファイル配置
└── index.ts             # ファクトリ

scripts/
├── install-host.ts
└── uninstall-host.ts
```

**マニフェスト構造**:
```json
{
  "name": "com.anthropic.claude_bridge",
  "description": "Claude Bridge - Native Messaging Host",
  "path": "/path/to/claude-bridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID/"
  ]
}
```

**登録先**:
| OS | 場所 |
|----|------|
| Windows | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.anthropic.claude_bridge` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_bridge.json` |

**完了条件**:
- `npm run install:host` でインストールできる
- `npm run uninstall:host` でアンインストールできる
- Windows / macOS 両対応

---

### SubStage 1.4.3: E2E 検証

**サイズ**: S（1日）

**目的**: Phase 1 全体の動作を実環境で検証

**前提**: 全 SubStage 完了

**成果物**:
```
docs/verification/phase-1-e2e.md
```

**検証シナリオ**:

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | `npm run install:host` | 成功メッセージ |
| 2 | Chrome 再起動 | エラーなし |
| 3 | Claude CLI 起動 | IPC 待機状態 |
| 4 | Chrome 拡張で操作 | Bridge 経由で CLI に到達 |
| 5 | CLI で処理実行 | 結果が Chrome に返る |
| 6 | `cat logs/bridge.jsonl` | メッセージが記録されている |
| 7 | CLI 終了 → 再操作 | エラーが適切に表示される |

**完了条件**:
- 全シナリオがパス
- 検証結果が docs に記録されている
- 発見した問題と対応が記録されている

---

## 依存関係図

```
                    Stage 1.1: プロトコル調査
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
      1.1.1 ─────────→ 1.1.2 ─────────→ 1.1.3
                                                   │
              ┌────────────────────────────────────┤
              │                                    │
              ▼                                    ▼
    Stage 1.2: Native Host              Stage 1.3: IPC Client
              │                                    │
    ┌─────────┼─────────┐              ┌──────────┼──────────┐
    │         │         │              │          │          │
  1.2.1 ──→ 1.2.2 ──→ 1.2.3         1.3.1 ────→ 1.3.2      │
              │                          │                   │
              └──────────────────────────┘                   │
                            │                                │
                            ▼                                │
                         1.3.3 ←─────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
  1.4.1                   1.4.2                     │
 (早期着手可)                │                       │
    │                       │                       │
    └───────────────────────┼───────────────────────┘
                            │
                            ▼
                         1.4.3 E2E検証
```

---

## クリティカルパス

```
1.1.1 → 1.1.2 → 1.1.3 → 1.2.1 → 1.2.2 → 1.3.3 → 1.4.3
```

このパス上のタスクが遅延すると、Phase 1 全体が遅延する。

---

## リスクと対策

| リスク | 影響 | 発生確率 | 対策 |
|--------|------|----------|------|
| Claude IPC 仕様が複雑 | 調査遅延 | 中 | Chrome 拡張コード解析、コミュニティ情報収集 |
| stdin バッファリング問題 | Host 不安定 | 低 | raw mode、十分なテスト |
| OS 間差異 | 実装工数増 | 中 | 抽象化レイヤーで吸収 |
| 拡張 ID 変更 | 動作不可 | 低 | 設定で ID を変更可能に |

---

## Phase 2 への引き継ぎ

### Phase 2 で使用するコンポーネント

| コンポーネント | ファイル | Phase 2 での用途 |
|----------------|----------|------------------|
| 共通型定義 | `src/types/` | Target, ErrorCodes の拡張 |
| IpcConnector | `src/ipc/connector.ts` | ProcessDetector で使用 |
| MessageBridge | `src/bridge/message-bridge.ts` | RoutedBridge のベース |
| Logger | `src/logger/logger.ts` | 全コンポーネントで使用 |

### Phase 2 開始前の確認事項

- [ ] Phase 1 E2E 検証がパスしていること
- [ ] Claude IPC のプロトコル仕様が文書化されていること
- [ ] 共通型定義が Phase 2 要件を満たすこと

---

## 全体スケジュールサマリ

### Phase 1 + Phase 2 統合ビュー

| Phase | 工数 | 累計 | マイルストーン |
|-------|------|------|----------------|
| Phase 0 | 1日 | 1日 | 開発環境構築 |
| **Phase 1** | **12-16日** | **13-17日** | **通信経路確立** |
| Phase 2 | 12-16日 | 25-33日 | ルーティング完成 |
| Phase 3 | 5-7日 | 30-40日 | 配布可能状態 |

### Phase 1 内部タイムライン

```
Week 1: Stage 1.1（調査）+ Stage 1.4.1（Logger 早期着手）
Week 2: Stage 1.2（Native Host）+ Stage 1.3.1（IPC 並行）
Week 3: Stage 1.3（IPC 残り）+ Stage 1.4（統合・検証）
```

---

## 次のアクション

1. **即時**: SubStage 1.1.1 着手（Native Messaging 調査）
2. **並行**: SubStage 1.4.1 早期着手（Logger は他で使用）
3. **確認**: Phase 0 完了確認（開発環境）
