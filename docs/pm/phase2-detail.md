# Phase 2: Router 詳細計画

## 目次

1. [Phase 2 の位置づけ](#phase-2-の位置づけ)
2. [構造概要](#構造概要)
3. [全体見積もり](#全体見積もり)
4. [Phase 1 からの引き継ぎ](#phase-1-からの引き継ぎ)
5. [共通定義（Phase 2 追加）](#共通定義phase-2-追加)
6. [Stage 2.1: 設定システム](#stage-21-設定システム)
7. [Stage 2.2: プロセス検出](#stage-22-プロセス検出)
8. [Stage 2.3: ルーター実装](#stage-23-ルーター実装)
9. [Stage 2.4: Bridge 統合・検証](#stage-24-bridge-統合検証)
10. [依存関係図](#依存関係図)
11. [クリティカルパス](#クリティカルパス)
12. [リスクと対策](#リスクと対策)
13. [Phase 3 への引き継ぎ](#phase-3-への引き継ぎ)

---

## Phase 2 の位置づけ

**これが本プロジェクトの核心**

```
Phase 0: 基盤構築       → 開発環境
Phase 1: 「通る」を実現 → 通信基盤
Phase 2: 「選べる」を実現 → 本Phase ★
Phase 3: 「使える」を実現 → 配布・普及
```

---

## 構造概要

```
Phase 2: Router
│
├── Stage 2.1: 設定システム
│   ├── SubStage 2.1.1: 設定スキーマ定義
│   ├── SubStage 2.1.2: 設定ファイル管理
│   └── SubStage 2.1.3: 設定 CLI
│
├── Stage 2.2: プロセス検出 ★クリティカルパス
│   ├── SubStage 2.2.1: 検出抽象化レイヤー
│   ├── SubStage 2.2.2: Windows 実装
│   ├── SubStage 2.2.3: macOS 実装
│   └── SubStage 2.2.4: ヘルスチェック統合
│
├── Stage 2.3: ルーター実装 ★クリティカルパス
│   ├── SubStage 2.3.1: 決定エンジン
│   ├── SubStage 2.3.2: フォールバック処理
│   └── SubStage 2.3.3: 動的切り替え
│
└── Stage 2.4: Bridge 統合・検証
    ├── SubStage 2.4.1: RoutedBridge 実装
    ├── SubStage 2.4.2: Status CLI
    └── SubStage 2.4.3: E2E 検証
```

---

## 全体見積もり

| Stage | サイズ | 工数目安 | 優先度 | 備考 |
|-------|--------|----------|--------|------|
| 2.1 | S | 2-3日 | ★★☆ | 並行作業可、2.3 の前提 |
| 2.2 | M | 4-5日 | ★★★ | OS 固有実装が複雑 |
| 2.3 | M | 4-5日 | ★★★ | 核心ロジック |
| 2.4 | S | 2-3日 | ★★☆ | 統合・検証 |
| **合計** | - | **12-16日** | - | 約2-3週間 |

サイズ目安: XS=数時間, S=1-2日, M=3-5日, L=1週間+

---

## Phase 1 からの引き継ぎ

### 使用するコンポーネント

| コンポーネント | Phase 1 ファイル | Phase 2 での用途 |
|----------------|------------------|------------------|
| Target 型 | `src/types/common.ts` | 全コンポーネントで使用 |
| ErrorCodes | `src/types/common.ts` | R0xx エラーコードを追加 |
| IpcConnector | `src/ipc/connector.ts` | ProcessDetector で使用 |
| MessageBridge | `src/bridge/message-bridge.ts` | RoutedBridge のベース |
| Logger | `src/logger/logger.ts` | 全コンポーネントで使用 |

### ディレクトリ構造（Phase 2 追加分）

```
src/
├── types/           # Phase 1 から継続
│   └── common.ts    # ← R0xx エラーコード追加
├── config/          # NEW: 設定システム
│   ├── schema.ts
│   ├── defaults.ts
│   ├── validator.ts
│   └── config-manager.ts
├── detector/        # NEW: プロセス検出
│   ├── types.ts
│   ├── detector.ts
│   ├── windows.ts
│   ├── darwin.ts
│   └── health-checker.ts
├── router/          # NEW: ルーター
│   ├── router.ts
│   ├── decision-engine.ts
│   ├── fallback-handler.ts
│   └── connection-manager.ts
├── bridge/          # Phase 1 から継続
│   ├── message-bridge.ts
│   └── routed-bridge.ts  # NEW: Router 統合版
└── cli/             # NEW: CLI コマンド
    ├── index.ts         # CLI エントリーポイント
    └── commands/
        ├── config.ts
        └── status.ts
```

---

## 共通定義（Phase 2 追加）

### エラーコード追加

```typescript
// src/types/common.ts に追加
export const ErrorCodes = {
  // Phase 1 のコード（継続）
  // ...

  // Router (R0xx) - Phase 2 追加
  CONFIG_INVALID: 'R001',
  CONFIG_NOT_FOUND: 'R002',
  DETECTION_FAILED: 'R010',
  DETECTION_TIMEOUT: 'R011',
  NO_AVAILABLE_TARGET: 'R020',
  FALLBACK_EXHAUSTED: 'R021',
  RECONNECT_FAILED: 'R030',
} as const;
```

---

## Stage 2.1: 設定システム

### 目的
ユーザー設定を永続化し、Bridge の動作をカスタマイズ可能にする

### 前提
Phase 1 完了（共通型定義が使用可能）

---

### SubStage 2.1.1: 設定スキーマ定義

**サイズ**: XS（数時間）

**目的**: 設定の型定義とバリデーションルール

**成果物**:
```
src/config/
├── schema.ts            # 型定義
├── defaults.ts          # デフォルト値
├── validator.ts         # バリデーション
└── __tests__/
    └── validator.test.ts
```

**設定スキーマ**:
```typescript
// src/config/schema.ts
import { Target } from '../types';

export interface BridgeConfig {
  // === 基本設定 ===
  /** 接続先: auto=自動選択, desktop=Desktop優先, cli=CLI優先 */
  target: 'auto' | Target;

  // === フォールバック設定 ===
  fallback: {
    /** フォールバックを有効化 */
    enabled: boolean;
    /** auto 時の優先順序 */
    order: Target[];
  };

  // === タイムアウト設定（ms） ===
  timeouts: {
    /** IPC 接続タイムアウト */
    connection: number;
    /** ヘルスチェックタイムアウト */
    healthCheck: number;
    /** 再接続待機時間 */
    reconnect: number;
  };

  // === 検出設定 ===
  detection: {
    /** ポーリング間隔（ms） */
    interval: number;
    /** 検出結果キャッシュ有効期限（ms） */
    cacheTtl: number;
  };

  // === 上級者設定 ===
  advanced?: {
    /** カスタム IPC パス */
    paths?: Partial<Record<Target, string>>;
    /** デバッグモード */
    debug?: boolean;
  };
}
```

**デフォルト値**:
```typescript
// src/config/defaults.ts
export const DEFAULT_CONFIG: BridgeConfig = {
  target: 'auto',
  fallback: {
    enabled: true,
    order: ['cli', 'desktop'],
  },
  timeouts: {
    connection: 5000,
    healthCheck: 2000,
    reconnect: 1000,
  },
  detection: {
    interval: 5000,
    cacheTtl: 3000,
  },
};
```

**完了条件**:
- 全設定項目の型が定義されている
- Zod スキーマでバリデーション実装
- デフォルト値が設定されている
- テストがパス

---

### SubStage 2.1.2: 設定ファイル管理

**サイズ**: S（1日）

**目的**: 設定ファイルの CRUD と変更監視

**成果物**:
```
src/config/
├── config-manager.ts    # 設定管理本体
├── file-store.ts        # ファイル I/O
└── __tests__/
    └── config-manager.test.ts
```

**API 設計**:
```typescript
export class ConfigManager extends EventEmitter {
  constructor(options?: ConfigManagerOptions);

  load(): Promise<BridgeConfig>;
  save(config: BridgeConfig): Promise<void>;
  get<K extends keyof BridgeConfig>(key: K): BridgeConfig[K];
  set<K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]): Promise<void>;
  getNested(path: string): unknown;
  setNested(path: string, value: unknown): Promise<void>;
  reset(): Promise<void>;
  getConfigPath(): string;

  on(event: 'changed', handler: (config: BridgeConfig) => void): this;
}

interface ConfigManagerOptions {
  configPath?: string;
  watchFile?: boolean;
}
```

**設定ファイルパス**:
| OS | パス |
|----|------|
| Windows | `%APPDATA%\claude-bridge\config.json` |
| macOS | `~/Library/Application Support/claude-bridge/config.json` |

**完了条件**:
- 読み書きが動作する
- ネストしたキーをサポート
- ファイル変更監視が動作
- 不正な設定でバリデーションエラー

---

### SubStage 2.1.3: 設定 CLI

**サイズ**: S（1日）

**目的**: コマンドラインから設定を操作

**成果物**:
```
src/cli/commands/config.ts
```

**CLI 仕様**:
```bash
# 全設定表示
$ claude-bridge config list
target: auto
fallback.enabled: true
fallback.order: [cli, desktop]
timeouts.connection: 5000
...

# 単一設定取得
$ claude-bridge config get target
auto

# 設定変更
$ claude-bridge config set target cli
✓ target set to: cli

# ネストした設定
$ claude-bridge config set fallback.enabled false
✓ fallback.enabled set to: false

# 設定リセット
$ claude-bridge config reset
✓ Config reset to defaults

# 設定ファイルパス表示
$ claude-bridge config path
C:\Users\xxx\AppData\Roaming\claude-bridge\config.json
```

**完了条件**:
- list/get/set/reset/path が動作
- ドット記法でネストキーをサポート
- 不正な値でエラー表示

---

## Stage 2.2: プロセス検出

### 目的
Claude Desktop / CLI の起動状態と接続可能性を検出

### 前提
Phase 1 完了（IpcConnector が使用可能）

---

### SubStage 2.2.1: 検出抽象化レイヤー

**サイズ**: S（1日）

**目的**: OS 非依存のインターフェースと共通ロジック

**成果物**:
```
src/detector/
├── types.ts             # 型定義
├── detector.ts          # 抽象クラス
├── index.ts             # ファクトリ
└── __tests__/
    └── detector.test.ts
```

**型定義**:
```typescript
// src/detector/types.ts
import { Target } from '../types';

export interface ProcessInfo {
  target: Target;
  running: boolean;
  pid?: number;
  path?: string;
  startedAt?: Date;
}

export interface HealthStatus {
  target: Target;
  processRunning: boolean;
  ipcConnectable: boolean;
  responseTime?: number;  // ms
  lastChecked: Date;
  error?: string;
}

export interface DetectionResult {
  desktop: HealthStatus;
  cli: HealthStatus;
}
```

**API 設計**:
```typescript
export abstract class ProcessDetector {
  constructor(
    protected connector: IpcConnector,  // Phase 1 から
    protected config: BridgeConfig
  );

  abstract detectProcess(target: Target): Promise<ProcessInfo>;

  async detect(target: Target): Promise<HealthStatus>;
  async detectAll(): Promise<DetectionResult>;
  watch(callback: (result: DetectionResult) => void): () => void;
  clearCache(): void;
}

// ファクトリ
export function createDetector(
  connector: IpcConnector,
  config: BridgeConfig
): ProcessDetector {
  return process.platform === 'win32'
    ? new WindowsDetector(connector, config)
    : new DarwinDetector(connector, config);
}
```

**完了条件**:
- インターフェースが定義されている
- キャッシュ機構が実装されている
- ウォッチモードの基盤ができている

---

### SubStage 2.2.2: Windows 実装

**サイズ**: M（2日）

**目的**: Windows でのプロセス検出

**成果物**:
```
src/detector/
├── windows.ts
└── __tests__/
    └── windows.test.ts
```

**検出方法**:
```typescript
class WindowsDetector extends ProcessDetector {
  async detectProcess(target: Target): Promise<ProcessInfo> {
    // 方法1: tasklist コマンド（シンプル）
    const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf8' });

    // 方法2: PowerShell + WMI（より詳細）
    const ps = `
      Get-WmiObject Win32_Process |
      Where-Object { $_.Name -match 'claude' } |
      Select-Object ProcessId, Name, CommandLine |
      ConvertTo-Json
    `;
  }
}
```

**プロセス識別**:
| ターゲット | プロセス名 | 追加判定 |
|------------|------------|----------|
| Desktop | `Claude.exe` | - |
| CLI | `node.exe` | CommandLine に `claude` を含む |

**エラーハンドリング**:
| エラー | コード | 対応 |
|--------|--------|------|
| コマンド実行失敗 | R010 | エラーログ、running: false |
| パース失敗 | R010 | エラーログ、running: false |
| タイムアウト | R011 | キャッシュ値を返す or エラー |

**完了条件**:
- Desktop を正しく検出できる
- CLI を正しく検出できる
- 未起動時に正しく判定できる
- エラー時に適切に処理できる

---

### SubStage 2.2.3: macOS 実装

**サイズ**: M（2日）

**目的**: macOS でのプロセス検出

**成果物**:
```
src/detector/
├── darwin.ts
└── __tests__/
    └── darwin.test.ts
```

**検出方法**:
```typescript
class DarwinDetector extends ProcessDetector {
  async detectProcess(target: Target): Promise<ProcessInfo> {
    if (target === 'desktop') {
      const pid = execSync('pgrep -x "Claude"', { encoding: 'utf8' }).trim();
      if (pid) {
        const info = execSync(`ps -p ${pid} -o pid,comm,lstart`);
      }
    }

    if (target === 'cli') {
      const pid = execSync('pgrep -f "claude"', { encoding: 'utf8' }).trim();
    }
  }
}
```

**完了条件**:
- Desktop を正しく検出できる
- CLI を正しく検出できる
- 未起動時に正しく判定できる

---

### SubStage 2.2.4: ヘルスチェック統合

**サイズ**: S（1日）

**目的**: プロセス検出 + IPC 接続確認を統合

**成果物**:
```
src/detector/
├── health-checker.ts
└── __tests__/
    └── health-checker.test.ts

scripts/test-detector.ts
docs/verification/stage-2.2.md
```

**ヘルスチェックフロー**:
```
1. プロセス検出
   └─ running: false → 終了（接続不可）

2. IPC 接続試行（Phase 1 の IpcConnector 使用）
   └─ 失敗 → ipcConnectable: false

3. ping メッセージ送信（可能なら）
   └─ 応答時間を計測

4. 結果を返却
```

**検証スクリプト**:
```typescript
// scripts/test-detector.ts
import { createDetector } from '../src/detector';
import { createConnector } from '../src/ipc/connector';
import { DEFAULT_CONFIG } from '../src/config/defaults';

const connector = createConnector();
const detector = createDetector(connector, DEFAULT_CONFIG);

console.log('Detecting Claude processes...');
const result = await detector.detectAll();

console.log('\nDesktop:');
console.log(`  Process: ${result.desktop.processRunning ? '✓ running' : '✗ not running'}`);
console.log(`  IPC:     ${result.desktop.ipcConnectable ? '✓ connectable' : '✗ not connectable'}`);
if (result.desktop.responseTime) {
  console.log(`  Latency: ${result.desktop.responseTime}ms`);
}
// CLI も同様
```

**完了条件**:
- プロセス検出と IPC チェックが統合されている
- 検証スクリプトが動作する
- Windows/macOS で検証済み

---

## Stage 2.3: ルーター実装

### 目的
設定と検出結果に基づいて最適な接続先を決定

### 前提
Stage 2.1, 2.2 完了

---

### SubStage 2.3.1: 決定エンジン

**サイズ**: M（2日）

**目的**: ルーティングの核心ロジック

**成果物**:
```
src/router/
├── router.ts            # ルーター本体
├── decision-engine.ts   # 決定ロジック
└── __tests__/
    ├── router.test.ts
    └── decision-engine.test.ts
```

**API 設計**:
```typescript
export class Router extends EventEmitter {
  constructor(
    private detector: ProcessDetector,
    private config: ConfigManager
  );

  async resolve(): Promise<Target>;
  getCurrentTarget(): Target | null;
  startWatching(): void;
  stopWatching(): void;

  on(event: 'target-changed', handler: (target: Target, reason: string) => void): this;
  on(event: 'resolution-failed', handler: (error: BridgeError) => void): this;
}

export interface ResolutionResult {
  target: Target;
  reason: 'configured' | 'auto' | 'fallback';
  alternatives: Target[];
}
```

**決定ロジック**:
```typescript
class DecisionEngine {
  decide(config: BridgeConfig, detection: DetectionResult): ResolutionResult {
    const { target, fallback } = config;

    // 明示的なターゲット指定の場合
    if (target !== 'auto') {
      if (detection[target].ipcConnectable) {
        return { target, reason: 'configured', alternatives: [] };
      }
      if (fallback.enabled) {
        const alt = this.findAlternative(target, detection);
        if (alt) {
          return { target: alt, reason: 'fallback', alternatives: [] };
        }
      }
      throw new BridgeError('No available target', ErrorCodes.NO_AVAILABLE_TARGET, false);
    }

    // auto モード
    for (const t of fallback.order) {
      if (detection[t].ipcConnectable) {
        return {
          target: t,
          reason: 'auto',
          alternatives: fallback.order.filter(x => x !== t),
        };
      }
    }
    throw new BridgeError('No available target', ErrorCodes.NO_AVAILABLE_TARGET, false);
  }
}
```

**決定フローチャート**:
```
                    ┌─────────────┐
                    │ resolve()   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ target設定? │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
      target=desktop  target=cli      target=auto
           │               │               │
           ▼               ▼               ▼
      Desktop利用可?   CLI利用可?    order順に確認
           │               │               │
      ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
      │Yes│ No  │    │Yes│ No  │    │利用可  │
      └─┬─┴──┬──┘    └─┬─┴──┬──┘    └────┬───┘
        │    │         │    │            │
        ▼    ▼         ▼    ▼            ▼
    Desktop fallback? CLI fallback?   その target
```

**完了条件**:
- 全パターンの決定ロジックが実装されている
- テストで全パターンをカバー
- 決定理由がログに出力される

---

### SubStage 2.3.2: フォールバック処理

**サイズ**: S（1日）

**目的**: 優先接続先が利用不可の場合の代替接続

**成果物**:
```
src/router/
├── fallback-handler.ts
└── __tests__/
    └── fallback-handler.test.ts
```

**フォールバックトリガー**:
| トリガー | 説明 |
|----------|------|
| プロセス未起動 | 検出時点で running: false |
| 接続失敗 | IPC 接続タイムアウト |
| 接続断 | 通信中に切断を検知 |
| 応答なし | メッセージ送信後タイムアウト |

**フォールバック戦略**:
```typescript
interface FallbackStrategy {
  getNext(current: Target, detection: DetectionResult): Target | null;
  reset(): void;
}

class DefaultFallbackStrategy implements FallbackStrategy {
  getNext(current: Target, detection: DetectionResult): Target | null {
    const alternatives = this.config.fallback.order.filter(t => t !== current);
    for (const alt of alternatives) {
      if (detection[alt].ipcConnectable) {
        return alt;
      }
    }
    return null;
  }
}
```

**完了条件**:
- 全トリガーでフォールバックが発動
- フォールバック無効時は発動しない
- フォールバック発生がログ出力される

---

### SubStage 2.3.3: 動的切り替え

**サイズ**: M（2日）

**目的**: 実行中の接続先変更とホットリロード

**成果物**:
```
src/router/
├── connection-manager.ts
└── __tests__/
    └── connection-manager.test.ts
```

**動的切り替えシナリオ**:
1. **優先先が復帰**: CLI優先設定 → CLI停止でDesktopへ → CLI再起動でCLIへ戻る
2. **設定変更**: `config set target desktop` → 即座に切り替え
3. **接続断**: 通信中に切断 → フォールバック先へ切り替え

**API 設計**:
```typescript
export class ConnectionManager extends EventEmitter {
  constructor(
    private router: Router,
    private connector: IpcConnector  // Phase 1 から
  );

  async connect(): Promise<IpcConnection>;
  getConnection(): IpcConnection | null;
  async reconnect(): Promise<IpcConnection>;
  async disconnect(): Promise<void>;

  on(event: 'connected', handler: (target: Target) => void): this;
  on(event: 'disconnected', handler: (reason: string) => void): this;
  on(event: 'switched', handler: (from: Target, to: Target, reason: string) => void): this;
}
```

**再接続ロジック**:
```typescript
private async handleDisconnection(reason: string): Promise<void> {
  this.emit('disconnected', reason);

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    await this.delay(this.config.timeouts.reconnect * (retries + 1));

    try {
      const target = await this.router.resolve();
      const connection = await this.connector.connect({ target });
      this.currentConnection = connection;
      this.emit('connected', target);
      return;
    } catch (error) {
      retries++;
    }
  }

  this.emit('resolution-failed', new BridgeError(
    'Max retries exceeded',
    ErrorCodes.RECONNECT_FAILED,
    false
  ));
}
```

**完了条件**:
- 設定変更で即座に切り替え
- 切断検知で自動再接続
- 再接続失敗時のエラー処理

---

## Stage 2.4: Bridge 統合・検証

### 目的
Router を Phase 1 の Bridge に統合し、全体を検証

### 前提
Stage 2.1, 2.2, 2.3 完了

---

### SubStage 2.4.1: RoutedBridge 実装

**サイズ**: M（2日）

**目的**: Router 統合版の Bridge を実装

**成果物**:
```
src/bridge/
├── routed-bridge.ts
└── __tests__/
    └── routed-bridge.test.ts
```

**API 設計**:
```typescript
export class RoutedBridge extends EventEmitter {
  constructor(options: RoutedBridgeOptions);

  async start(): Promise<void>;
  async stop(): Promise<void>;
  getStatus(): RoutedBridgeStatus;

  on(event: 'started', handler: () => void): this;
  on(event: 'stopped', handler: () => void): this;
  on(event: 'target-changed', handler: (target: Target) => void): this;
  on(event: 'error', handler: (error: BridgeError) => void): this;
}

interface RoutedBridgeOptions {
  configPath?: string;
  logDir?: string;
}

interface RoutedBridgeStatus {
  running: boolean;
  currentTarget: Target | null;
  config: BridgeConfig;
  detection: DetectionResult;
  stats: {
    messagesForwarded: number;
    lastActivity: Date | null;
    uptime: number;
  };
}
```

**統合構造**:
```
RoutedBridge
├── NativeHost (Phase 1)
├── ConnectionManager (Stage 2.3)
│   ├── Router (Stage 2.3)
│   │   ├── ProcessDetector (Stage 2.2)
│   │   └── ConfigManager (Stage 2.1)
│   └── IpcConnector (Phase 1)
└── Logger (Phase 1)
```

**完了条件**:
- Phase 1 コンポーネントと統合されている
- Router に従って接続先を決定できる
- 動的切り替えが動作する

---

### SubStage 2.4.2: Status CLI

**サイズ**: S（1日）

**目的**: 現在の状態を分かりやすく表示

**成果物**:
```
src/cli/commands/status.ts
```

**CLI 仕様**:
```bash
$ claude-bridge status

╔════════════════════════════════════════════════╗
║           Claude Bridge Status                 ║
╠════════════════════════════════════════════════╣
║ Bridge:      installed ✓                       ║
║ Running:     yes                               ║
║ Target:      auto → cli                        ║
║ Uptime:      2h 15m                            ║
║ Messages:    1,234 forwarded                   ║
╠════════════════════════════════════════════════╣
║ Claude Desktop                                 ║
║   Process:   running ✓ (pid: 12345)           ║
║   IPC:       connectable ✓                     ║
║   Latency:   12ms                              ║
╠════════════════════════════════════════════════╣
║ Claude CLI                                     ║
║   Process:   running ✓ (pid: 67890)           ║
║   IPC:       connectable ✓  ← active          ║
║   Latency:   8ms                               ║
╚════════════════════════════════════════════════╝

# JSON 出力
$ claude-bridge status --json
{"bridge":{"installed":true,"running":true},...}
```

**完了条件**:
- 全状態が見やすく表示される
- 現在のアクティブ接続が分かる
- JSON 出力オプションが動作する

---

### SubStage 2.4.3: E2E 検証

**サイズ**: S（1日）

**目的**: Phase 2 全体の動作を実環境で検証

**成果物**:
```
docs/verification/phase-2-e2e.md
```

**検証シナリオ**:

| # | シナリオ | 手順 | 期待結果 |
|---|----------|------|----------|
| 1 | CLI 優先 | `config set target cli` → 操作 | CLI で処理 |
| 2 | Desktop 優先 | `config set target desktop` → 操作 | Desktop で処理 |
| 3 | フォールバック | CLI 優先 → CLI 終了 → 操作 | Desktop で処理 |
| 4 | 復帰 | CLI 再起動 → 操作 | CLI で処理（戻る） |
| 5 | auto モード | `config set target auto` → 操作 | order 順に選択 |
| 6 | 両方停止 | Desktop/CLI 両方終了 → 操作 | エラー表示 |
| 7 | 動的切替 | 通信中に CLI 終了 | Desktop へ切替 |
| 8 | 設定変更 | 通信中に `config set` | 即座に切替 |

**完了条件**:
- 全シナリオがパス
- 検証結果が docs に記録されている
- 発見した問題と対応が記録されている

---

## 依存関係図

```
                          Phase 1 完了
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    Stage 2.1           Stage 2.2            (IpcConnector)
   設定システム        プロセス検出              (Logger)
         │                     │
    ┌────┼────┐     ┌─────────┼─────────┐
    │    │    │     │         │         │
  2.1.1  │  2.1.3 2.2.1  ┌────┴────┐  2.2.4
    ↓    │         ↓     │         │    ↑
  2.1.2──┘       2.2.2  2.2.3      └────┘
                (Win)   (Mac)
         │         │         │
         │         └────┬────┘
         │              │
         └──────┬───────┘
                │
                ▼
          Stage 2.3
         ルーター実装
                │
         ┌──────┼──────┐
         │      │      │
       2.3.1  2.3.2  2.3.3
         │      │      │
         └──────┼──────┘
                │
                ▼
          Stage 2.4
         Bridge統合
                │
         ┌──────┼──────┐
         │      │      │
       2.4.1  2.4.2    │
         │      │      │
         └──────┼──────┘
                │
                ▼
             2.4.3
           E2E検証
```

---

## クリティカルパス

**Phase 全体**:
```
Phase 1 → 2.2.1 → 2.2.2/2.2.3 → 2.2.4 → 2.3.1 → 2.4.1 → 2.4.3
```

Stage 2.1 は並行作業可能だが、2.3.1 開始までに完了必要。

---

## リスクと対策

| リスク | 影響 | 発生確率 | 対策 |
|--------|------|----------|------|
| プロセス検出の信頼性 | 誤検出 | 中 | 複数方法を組み合わせ、テスト充実 |
| OS 間差異 | 実装工数増 | 中 | 抽象化レイヤーで吸収 |
| 動的切替の安定性 | メッセージ損失 | 低 | キューイング、再送処理 |
| 設定変更の即時反映 | 不整合 | 低 | 変更時のバリデーション強化 |

---

## Phase 3 への引き継ぎ

### Phase 3 で使用するコンポーネント

| コンポーネント | ファイル | Phase 3 での用途 |
|----------------|----------|------------------|
| RoutedBridge | `src/bridge/routed-bridge.ts` | CLI エントリーポイント |
| ConfigManager | `src/config/config-manager.ts` | install/uninstall |
| Status CLI | `src/cli/commands/status.ts` | ユーザー向け機能 |

### Phase 3 開始前の確認事項

- [ ] Phase 2 E2E 検証がパスしていること
- [ ] 全シナリオで安定動作すること
- [ ] ドキュメントが整備されていること

---

## 全体スケジュールサマリ

### Phase 1 + Phase 2 統合ビュー

| Phase | 工数 | 累計 | マイルストーン |
|-------|------|------|----------------|
| Phase 0 | 1日 | 1日 | 開発環境構築 |
| Phase 1 | 12-16日 | 13-17日 | 通信経路確立 |
| **Phase 2** | **12-16日** | **25-33日** | **ルーティング完成** |
| Phase 3 | 5-7日 | 30-40日 | 配布可能状態 |

### Phase 2 内部タイムライン

```
Week 1: Stage 2.1（設定）+ Stage 2.2.1-2.2.3（検出 並行）
Week 2: Stage 2.2.4（ヘルスチェック）+ Stage 2.3（ルーター）
Week 3: Stage 2.4（統合・検証）
```

---

## 次のアクション

1. **確認**: Phase 1 E2E 検証がパスしていること
2. **並行着手**: Stage 2.1（設定システム）と Stage 2.2.1（検出抽象化）
3. **リスク確認**: Claude IPC 仕様が Phase 1 で判明していること
