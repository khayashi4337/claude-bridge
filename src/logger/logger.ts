/**
 * Logger
 *
 * 通信内容を記録し、デバッグと解析を支援
 */

import { MessageDirection } from '../types';
import { BridgeError } from '../types';
import { JsonlWriter } from './jsonl-writer';

/**
 * ログレベル
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * ログエントリ
 */
export interface LogEntry extends Record<string, unknown> {
  /** タイムスタンプ */
  ts: string;
  /** ログレベル */
  level: LogLevel;
  /** イベント名 */
  event: string;
  /** 追加データ */
  data?: unknown;
  /** エラー情報 */
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Logger オプション
 */
export interface LoggerOptions {
  /** ログディレクトリ */
  logDir: string;
  /** 最大ファイルサイズ (bytes) */
  maxFileSize?: number;
  /** 最大ファイル数 */
  maxFiles?: number;
  /** ログレベル */
  level?: LogLevel;
}

/**
 * ログレベルの優先度
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger
 *
 * 通信内容を JSONL 形式で記録
 */
export class Logger {
  private readonly writer: JsonlWriter;
  private readonly level: LogLevel;
  private initialized = false;

  constructor(options: LoggerOptions) {
    this.writer = new JsonlWriter({
      logDir: options.logDir,
      filePrefix: 'bridge',
      maxFileSize: options.maxFileSize,
      maxFiles: options.maxFiles,
    });
    this.level = options.level || 'info';
  }

  /**
   * ロガーを初期化
   */
  async init(): Promise<void> {
    await this.writer.init();
    this.initialized = true;
  }

  /**
   * ロガーを閉じる
   */
  async close(): Promise<void> {
    await this.writer.close();
    this.initialized = false;
  }

  /**
   * debug レベルログ
   */
  debug(event: string, data?: unknown): void {
    this.log('debug', event, data);
  }

  /**
   * info レベルログ
   */
  info(event: string, data?: unknown): void {
    this.log('info', event, data);
  }

  /**
   * warn レベルログ
   */
  warn(event: string, data?: unknown): void {
    this.log('warn', event, data);
  }

  /**
   * error レベルログ
   */
  error(event: string, error: BridgeError, data?: unknown): void {
    this.log('error', event, data, error);
  }

  /**
   * メッセージをログ
   */
  logMessage(direction: MessageDirection, message: unknown): void {
    this.log('info', 'message', {
      direction,
      message,
      size: JSON.stringify(message).length,
    });
  }

  /**
   * ログを出力
   */
  private log(
    level: LogLevel,
    event: string,
    data?: unknown,
    error?: BridgeError
  ): void {
    // レベルフィルタ
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      event,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
      };
    }

    // 非同期で書き込み（エラーは無視）
    if (this.initialized) {
      this.writer.write(entry).catch(() => {});
    }

    // コンソールにも出力（デバッグ用）
    if (process.env.DEBUG) {
      console.error(`[${level.toUpperCase()}] ${event}`, data || '', error || '');
    }
  }
}
