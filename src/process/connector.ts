/**
 * Process Connector
 *
 * Claude Desktop/CLI の Native Host をプロセスとして起動し、
 * stdin/stdout で通信する
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  Target,
  IpcMessage,
  IpcConnection,
  IpcConnectionOptions,
  IpcConnector,
} from '../types';
import { BridgeError, ErrorCodes } from '../types';
import { MessageParser } from '../host/message-parser';

/**
 * Native Host 実行ファイルパス設定
 */
export interface NativeHostConfig {
  desktop: string | null;
  cli: string | null;
}

/**
 * デフォルトの Native Host パスを検出
 */
export function detectNativeHostConfig(): NativeHostConfig {
  const platform = process.platform;
  const homedir = process.env.HOME || process.env.USERPROFILE || '';

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';

    // Claude Desktop: 最新バージョンのディレクトリを探す
    let desktopPath: string | null = null;
    if (localAppData) {
      const claudeDir = path.join(localAppData, 'AnthropicClaude');
      try {
        const dirs = fs.readdirSync(claudeDir)
          .filter(d => d.startsWith('app-'))
          .sort()
          .reverse();
        if (dirs.length > 0) {
          desktopPath = path.join(claudeDir, dirs[0], 'resources', 'chrome-native-host.exe');
        }
      } catch {
        // ディレクトリが存在しない場合
      }
    }

    return {
      desktop: desktopPath,
      cli: homedir ? path.join(homedir, '.claude', 'chrome', 'chrome-native-host.bat') : null,
    };
  } else if (platform === 'darwin') {
    return {
      desktop: path.join(homedir, 'Library', 'Application Support', 'Claude', 'ChromeNativeHost', 'chrome-native-host'),
      cli: path.join(homedir, '.claude', 'chrome', 'chrome-native-host'),
    };
  }

  return { desktop: null, cli: null };
}

/**
 * Process 接続の実装
 */
class ProcessConnection extends EventEmitter implements IpcConnection {
  private readonly parser: MessageParser;
  private process: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private connected = false;

  constructor(private readonly target: Target) {
    super();
    this.parser = new MessageParser();
    // デフォルトのエラーハンドラで unhandled error を防止
    this.on('error', () => {});
  }

  /**
   * プロセスを起動して接続
   */
  async connect(executablePath: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (this.process) {
            this.process.kill();
          }
          reject(
            new BridgeError(
              `Process start timeout: ${executablePath}`,
              ErrorCodes.TIMEOUT,
              true
            )
          );
        }
      }, timeout);

      // プロセスを起動
      // Windows の .bat ファイルは cmd.exe 経由で実行
      const isWindows = process.platform === 'win32';
      const isBatchFile = executablePath.toLowerCase().endsWith('.bat');

      if (isWindows && isBatchFile) {
        this.process = spawn('cmd.exe', ['/c', executablePath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } else {
        this.process = spawn(executablePath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      }

      // stdout からデータを受信
      this.process.stdout?.on('data', this.handleData.bind(this));

      // stderr はログ用
      this.process.stderr?.on('data', (data: Buffer) => {
        // デバッグ用に stderr を出力
        if (process.env.DEBUG) {
          console.error(`[${this.target}] stderr:`, data.toString());
        }
      });

      // プロセス終了時
      this.process.on('close', (code) => {
        this.connected = false;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new BridgeError(
              `Process exited with code ${code}`,
              ErrorCodes.CONNECTION_FAILED,
              true
            )
          );
        } else {
          this.emit('close');
        }
      });

      // エラー時
      this.process.on('error', (error: Error) => {
        clearTimeout(timer);
        this.connected = false;

        const bridgeError = new BridgeError(
          `Process error: ${error.message}`,
          ErrorCodes.CONNECTION_FAILED,
          true,
          error
        );

        if (!settled) {
          settled = true;
          reject(bridgeError);
        } else {
          this.emit('error', bridgeError);
        }
      });

      // プロセスが起動したら接続完了とみなす
      // (spawn は同期的に成功するので、少し待ってから resolve)
      setImmediate(() => {
        if (!settled && this.process && !this.process.killed) {
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          resolve();
        }
      });
    });
  }

  /**
   * メッセージ送信
   */
  async send(message: IpcMessage): Promise<void> {
    if (!this.connected || !this.process || !this.process.stdin) {
      throw new BridgeError(
        'Not connected',
        ErrorCodes.SEND_FAILED,
        true
      );
    }

    const buffer = this.parser.encode(message);

    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(buffer, (error) => {
        if (error) {
          reject(
            new BridgeError(
              `Send failed: ${error.message}`,
              ErrorCodes.SEND_FAILED,
              true,
              error
            )
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * メッセージ受信ハンドラ登録
   */
  onMessage(handler: (msg: IpcMessage) => void): void {
    this.on('message', handler);
  }

  /**
   * エラーハンドラ登録
   */
  onError(handler: (err: BridgeError) => void): void {
    this.on('error', handler);
  }

  /**
   * 切断ハンドラ登録
   */
  onClose(handler: () => void): void {
    this.on('close', handler);
  }

  /**
   * 接続を閉じる
   */
  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  /**
   * 接続状態確認
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 接続先ターゲット取得
   */
  getTarget(): Target {
    return this.target;
  }

  /**
   * データ受信処理
   */
  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      const { messages, remaining } = this.parser.decodeAll(this.buffer);
      this.buffer = remaining;

      for (const message of messages) {
        this.emit('message', message as IpcMessage);
      }
    } catch (error) {
      if (error instanceof BridgeError) {
        this.emit('error', error);
      } else {
        this.emit(
          'error',
          new BridgeError(
            error instanceof Error ? error.message : 'Unknown error',
            ErrorCodes.PARSE_ERROR,
            false
          )
        );
      }
    }
  }
}

/**
 * Process Connector 実装
 */
export class ProcessConnector implements IpcConnector {
  private static readonly DEFAULT_TIMEOUT = 5000;
  private readonly config: NativeHostConfig;

  constructor(config?: Partial<NativeHostConfig>) {
    const detected = detectNativeHostConfig();
    this.config = {
      desktop: config?.desktop ?? detected.desktop,
      cli: config?.cli ?? detected.cli,
    };
  }

  /**
   * Native Host パスを取得
   */
  getPath(target: Target): string | null {
    return this.config[target];
  }

  /**
   * Native Host が存在するか確認
   */
  exists(target: Target): boolean {
    const hostPath = this.config[target];
    if (!hostPath) return false;

    try {
      fs.accessSync(hostPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 接続を確立
   */
  async connect(options: IpcConnectionOptions): Promise<IpcConnection> {
    const { target, timeout = ProcessConnector.DEFAULT_TIMEOUT, customPath } = options;

    const executablePath = customPath || this.config[target];

    if (!executablePath) {
      throw new BridgeError(
        `No native host path configured for ${target}`,
        ErrorCodes.CONNECTION_FAILED,
        false
      );
    }

    // 実行ファイルの存在確認
    try {
      fs.accessSync(executablePath, fs.constants.X_OK);
    } catch {
      throw new BridgeError(
        `Native host not found: ${executablePath}`,
        ErrorCodes.CONNECTION_FAILED,
        false
      );
    }

    const connection = new ProcessConnection(target);
    await connection.connect(executablePath, timeout);

    return connection;
  }
}

/**
 * ProcessConnector を作成
 */
export function createProcessConnector(config?: Partial<NativeHostConfig>): ProcessConnector {
  return new ProcessConnector(config);
}
