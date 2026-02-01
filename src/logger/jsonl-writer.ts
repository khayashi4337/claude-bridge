/**
 * JSONL Writer
 *
 * JSONL 形式でログを出力
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * JSONL Writer オプション
 */
export interface JsonlWriterOptions {
  /** ログディレクトリ */
  logDir: string;
  /** ファイル名プレフィックス */
  filePrefix?: string;
  /** 最大ファイルサイズ (bytes) */
  maxFileSize?: number;
  /** 最大ファイル数 */
  maxFiles?: number;
}

/**
 * JSONL Writer
 *
 * 非同期でログをファイルに出力
 */
export class JsonlWriter {
  private readonly logDir: string;
  private readonly filePrefix: string;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;

  private currentFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private currentSize = 0;

  constructor(options: JsonlWriterOptions) {
    this.logDir = options.logDir;
    this.filePrefix = options.filePrefix || 'bridge';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
  }

  /**
   * ログディレクトリを初期化
   */
  async init(): Promise<void> {
    await fs.promises.mkdir(this.logDir, { recursive: true });
    await this.rotateIfNeeded();
  }

  /**
   * ログエントリを書き込み
   */
  async write(entry: Record<string, unknown>): Promise<void> {
    await this.ensureStream();

    const line = JSON.stringify(entry) + '\n';
    const buffer = Buffer.from(line, 'utf8');

    await this.writeToStream(buffer);
    this.currentSize += buffer.length;

    if (this.currentSize >= this.maxFileSize) {
      await this.rotate();
    }
  }

  /**
   * ストリームを閉じる
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>((resolve, reject) => {
        this.writeStream!.end((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.writeStream = null;
    }
  }

  /**
   * 書き込みストリームを確保
   */
  private async ensureStream(): Promise<void> {
    if (this.writeStream) {
      return;
    }

    this.currentFile = this.generateFileName();
    const filePath = path.join(this.logDir, this.currentFile);

    this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
    this.currentSize = 0;

    // 既存ファイルのサイズを取得
    try {
      const stats = await fs.promises.stat(filePath);
      this.currentSize = stats.size;
    } catch {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * ストリームに書き込み
   */
  private async writeToStream(buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const canContinue = this.writeStream!.write(buffer, (err) => {
        if (err) reject(err);
        else resolve();
      });

      if (!canContinue) {
        this.writeStream!.once('drain', resolve);
      }
    });
  }

  /**
   * ファイルをローテート
   */
  private async rotate(): Promise<void> {
    await this.close();
    await this.rotateIfNeeded();
    await this.ensureStream();
  }

  /**
   * 必要に応じて古いファイルを削除
   */
  private async rotateIfNeeded(): Promise<void> {
    const files = await this.getLogFiles();

    // 古いファイルを削除
    while (files.length >= this.maxFiles) {
      const oldest = files.shift()!;
      const filePath = path.join(this.logDir, oldest);
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  /**
   * ログファイル一覧を取得（古い順）
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.logDir);
      const logFiles = files.filter(
        (f) => f.startsWith(this.filePrefix) && f.endsWith('.jsonl')
      );
      return logFiles.sort();
    } catch {
      return [];
    }
  }

  /**
   * ファイル名を生成
   */
  private generateFileName(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    return `${this.filePrefix}-${date}-${time}.jsonl`;
  }
}
