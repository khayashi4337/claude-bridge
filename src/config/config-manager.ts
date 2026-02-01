/**
 * Config Manager
 *
 * 設定ファイルの CRUD と変更監視
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BridgeConfig } from './schema';
import { DEFAULT_CONFIG, mergeConfig } from './defaults';
import { assertValidConfig } from './validator';
import { BridgeError, ErrorCodes } from '../types';

/**
 * ConfigManager オプション
 */
export interface ConfigManagerOptions {
  /** 設定ファイルパス */
  configPath?: string;
  /** ファイル監視を有効化 */
  watchFile?: boolean;
}

/**
 * ConfigManager イベント
 */
export interface ConfigManagerEvents {
  changed: (config: BridgeConfig) => void;
}

/**
 * OS ごとの設定ディレクトリ
 */
function getConfigDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'claude-bridge');
  } else {
    return path.join(os.homedir(), 'Library', 'Application Support', 'claude-bridge');
  }
}

/**
 * Config Manager
 */
export class ConfigManager extends EventEmitter {
  private readonly configPath: string;
  private readonly watchFile: boolean;
  private config: BridgeConfig = DEFAULT_CONFIG;
  private watcher: fs.FSWatcher | null = null;

  constructor(options: ConfigManagerOptions = {}) {
    super();
    this.configPath = options.configPath || path.join(getConfigDir(), 'config.json');
    this.watchFile = options.watchFile ?? false;
  }

  /**
   * 設定を読み込み
   */
  async load(): Promise<BridgeConfig> {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(data);
      assertValidConfig(parsed);
      this.config = mergeConfig(DEFAULT_CONFIG, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // ファイルが存在しない場合はデフォルト
        this.config = DEFAULT_CONFIG;
      } else if (error instanceof SyntaxError) {
        throw new BridgeError(
          'Invalid JSON in config file',
          ErrorCodes.CONFIG_INVALID,
          true,
          error
        );
      } else if (error instanceof BridgeError) {
        throw error;
      } else {
        throw new BridgeError(
          `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCodes.CONFIG_NOT_FOUND,
          true
        );
      }
    }

    if (this.watchFile) {
      this.startWatching();
    }

    return this.config;
  }

  /**
   * 設定を保存
   */
  async save(config: BridgeConfig): Promise<void> {
    assertValidConfig(config);
    this.config = config;

    // ディレクトリを作成
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });

    // ファイルに書き込み
    await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');

    this.emit('changed', this.config);
  }

  /**
   * 単一の設定値を取得
   */
  get<K extends keyof BridgeConfig>(key: K): BridgeConfig[K] {
    return this.config[key];
  }

  /**
   * 単一の設定値を変更
   */
  async set<K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]): Promise<void> {
    const newConfig = { ...this.config, [key]: value };
    await this.save(newConfig);
  }

  /**
   * ネストした設定値を取得
   */
  getNested(dotPath: string): unknown {
    const parts = dotPath.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * ネストした設定値を変更
   */
  async setNested(dotPath: string, value: unknown): Promise<void> {
    const parts = dotPath.split('.');
    const lastKey = parts.pop()!;

    // 深いコピーを作成
    const newConfig = JSON.parse(JSON.stringify(this.config)) as Record<string, unknown>;
    let current = newConfig;

    for (const part of parts) {
      if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[lastKey] = value;

    assertValidConfig(newConfig);
    await this.save(newConfig as BridgeConfig);
  }

  /**
   * 設定をリセット
   */
  async reset(): Promise<void> {
    await this.save(DEFAULT_CONFIG);
  }

  /**
   * 設定ファイルパスを取得
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): BridgeConfig {
    return this.config;
  }

  /**
   * ファイル監視を開始
   */
  private startWatching(): void {
    if (this.watcher) {
      return;
    }

    try {
      this.watcher = fs.watch(this.configPath, async (eventType) => {
        if (eventType === 'change') {
          try {
            await this.load();
          } catch {
            // 読み込みエラーは無視
          }
        }
      });
    } catch {
      // 監視開始エラーは無視
    }
  }

  /**
   * ファイル監視を停止
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

// EventEmitter の型付けを強化
export interface ConfigManager {
  on<K extends keyof ConfigManagerEvents>(
    event: K,
    listener: ConfigManagerEvents[K]
  ): this;
  emit<K extends keyof ConfigManagerEvents>(
    event: K,
    ...args: Parameters<ConfigManagerEvents[K]>
  ): boolean;
}
