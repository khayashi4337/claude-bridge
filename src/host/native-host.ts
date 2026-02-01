/**
 * Native Messaging Host
 *
 * Chrome 拡張との stdin/stdout 通信を管理
 */

import { EventEmitter } from 'events';
import { NativeMessage, NativeHostOptions } from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { MessageParser } from './message-parser';

/**
 * NativeHost イベント
 */
export interface NativeHostEvents {
  message: (message: NativeMessage) => void;
  error: (error: BridgeError) => void;
  close: () => void;
}

/**
 * Native Messaging Host
 *
 * Chrome 拡張からのメッセージを受信し、応答を送信する
 */
export class NativeHost extends EventEmitter {
  private readonly parser: MessageParser;
  private readonly stdin: NodeJS.ReadStream;
  private readonly stdout: NodeJS.WriteStream;
  private buffer: Buffer = Buffer.alloc(0);
  private running = false;
  private writeQueue: Buffer[] = [];
  private isWriting = false;

  constructor(options: NativeHostOptions = {}) {
    super();
    this.parser = new MessageParser();
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
  }

  /**
   * Host を開始
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // stdin をバイナリモードに設定
    if (this.stdin === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // stdin イベントハンドラ
    this.stdin.on('data', this.handleData.bind(this));
    this.stdin.on('end', this.handleClose.bind(this));
    this.stdin.on('error', this.handleError.bind(this));

    // stdout エラーハンドラ
    this.stdout.on('error', this.handleError.bind(this));
  }

  /**
   * Host を停止
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // イベントハンドラを削除
    this.stdin.removeAllListeners();
    this.stdout.removeAllListeners();

    // バッファをクリア
    this.buffer = Buffer.alloc(0);
    this.writeQueue = [];

    this.emit('close');
  }

  /**
   * メッセージを送信
   */
  async send(message: NativeMessage): Promise<void> {
    if (!this.running) {
      throw new BridgeError(
        'Host is not running',
        ErrorCodes.STDOUT_ERROR,
        true
      );
    }

    const buffer = this.parser.encode(message);
    this.writeQueue.push(buffer);

    if (!this.isWriting) {
      await this.processWriteQueue();
    }
  }

  /**
   * 実行中かどうか
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * stdin からのデータを処理
   */
  private handleData(chunk: Buffer): void {
    // バッファに追加
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // メッセージをデコード
    try {
      const { messages, remaining } = this.parser.decodeAll(this.buffer);
      this.buffer = remaining;

      // 各メッセージをイベント発火
      for (const message of messages) {
        this.emit('message', message);
      }
    } catch (error) {
      if (error instanceof BridgeError) {
        this.emit('error', error);
      } else {
        this.emit(
          'error',
          new BridgeError(
            error instanceof Error ? error.message : 'Unknown parse error',
            ErrorCodes.PARSE_ERROR,
            false,
            error instanceof Error ? error : undefined
          )
        );
      }
    }
  }

  /**
   * stdin 終了を処理
   */
  private handleClose(): void {
    this.stop();
  }

  /**
   * エラーを処理
   */
  private handleError(error: Error): void {
    const bridgeError = new BridgeError(
      error.message,
      ErrorCodes.STDIN_ERROR,
      false,
      error
    );
    this.emit('error', bridgeError);
  }

  /**
   * 書き込みキューを処理
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    while (this.writeQueue.length > 0) {
      const buffer = this.writeQueue.shift()!;

      const canContinue = this.stdout.write(buffer);

      if (!canContinue) {
        // drain イベントを待機
        await new Promise<void>((resolve) => {
          this.stdout.once('drain', resolve);
        });
      }
    }

    this.isWriting = false;
  }
}

// EventEmitter の型付けを強化
export interface NativeHost {
  on<K extends keyof NativeHostEvents>(
    event: K,
    listener: NativeHostEvents[K]
  ): this;
  emit<K extends keyof NativeHostEvents>(
    event: K,
    ...args: Parameters<NativeHostEvents[K]>
  ): boolean;
}
