#!/usr/bin/env node
/**
 * Wrapper Host - 元の Native Host をラップしてルーティング機能を追加
 *
 * 処理フロー:
 * 1. 設定ファイルからターゲット（CLI/Desktop）を読み取り
 * 2. 対応する Native Host を子プロセスとして起動
 * 3. Chrome stdin/stdout を子プロセスにパイプ
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 設定
const CONFIG_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'claude-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LOG_FILE = path.join(CONFIG_DIR, 'wrapper-host.log');

// デフォルト設定
interface Config {
  target: 'cli' | 'desktop';
  cli: {
    command: string;
    args: string[];
  };
  desktop: {
    command: string;
    args: string[];
  };
}

const DEFAULT_CONFIG: Config = {
  target: 'cli',
  cli: {
    command: 'C:\\Users\\kh\\.claude\\chrome\\chrome-native-host.bat',
    args: [],
  },
  desktop: {
    command: '', // Desktop の Native Host パス（検出が必要）
    args: [],
  },
};

// ログディレクトリ作成
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch {}

function log(level: string, msg: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} ${msg} ${data ? JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

/**
 * 設定を読み込む
 */
function loadConfig(): Config {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    // 設定ファイルがない場合はデフォルトを保存
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    } catch {}
    return DEFAULT_CONFIG;
  }
}

/**
 * Claude Desktop の Native Host を検出
 */
function detectDesktopHost(): string | null {
  const possiblePaths = [
    path.join(process.env.LOCALAPPDATA || '', 'AnthropicClaude'),
  ];

  for (const basePath of possiblePaths) {
    try {
      const entries = fs.readdirSync(basePath);
      for (const entry of entries) {
        if (entry.startsWith('app-')) {
          const hostPath = path.join(basePath, entry, 'resources', 'chrome-native-host.exe');
          if (fs.existsSync(hostPath)) {
            return hostPath;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  log('INFO', 'Wrapper Host starting', { pid: process.pid });

  const config = loadConfig();
  log('INFO', 'Config loaded', { target: config.target });

  // Desktop ホストの自動検出
  if (!config.desktop.command) {
    const detectedPath = detectDesktopHost();
    if (detectedPath) {
      log('INFO', 'Detected Desktop host', { path: detectedPath });
      config.desktop.command = detectedPath;
    }
  }

  // ターゲット設定を取得
  const targetConfig = config.target === 'desktop' ? config.desktop : config.cli;

  if (!targetConfig.command) {
    log('ERROR', 'No command configured for target', { target: config.target });
    process.exit(1);
  }

  log('INFO', 'Starting target process', {
    target: config.target,
    command: targetConfig.command,
    args: targetConfig.args,
  });

  // 子プロセスとしてターゲットを起動
  let child: ChildProcess;

  // Windows の .bat ファイルは cmd.exe 経由で実行
  const isWindows = process.platform === 'win32';
  const isBatchFile = targetConfig.command.toLowerCase().endsWith('.bat');

  if (isWindows && isBatchFile) {
    child = spawn('cmd.exe', ['/c', targetConfig.command, ...targetConfig.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    child = spawn(targetConfig.command, targetConfig.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  log('INFO', 'Target process started', { pid: child.pid });

  // Chrome stdin -> 子プロセス stdin
  process.stdin.pipe(child.stdin!);

  // 子プロセス stdout -> Chrome stdout
  child.stdout!.pipe(process.stdout);

  // 子プロセス stderr -> ログ
  child.stderr!.on('data', (data) => {
    log('DEBUG', 'Target stderr', { data: data.toString() });
  });

  // 子プロセス終了
  child.on('exit', (code, signal) => {
    log('INFO', 'Target process exited', { code, signal });
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    log('ERROR', 'Target process error', { message: err.message });
    process.exit(1);
  });

  // シグナルハンドリング
  process.on('SIGINT', () => {
    log('INFO', 'SIGINT received');
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    log('INFO', 'SIGTERM received');
    child.kill('SIGTERM');
  });

  process.stdin.on('end', () => {
    log('INFO', 'stdin closed');
  });
}

main().catch((err) => {
  log('ERROR', 'Fatal error', { message: err.message });
  process.exit(1);
});
