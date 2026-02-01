#!/usr/bin/env node
/**
 * Named Pipe 探索ツール
 *
 * Claude Desktop / Code が使用している Named Pipe を発見する
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// ユーティリティ
// =============================================================================

function printSection(title) {
  console.log('');
  console.log('='.repeat(60));
  console.log(` ${title}`);
  console.log('='.repeat(60));
}

// =============================================================================
// 1. 全 Named Pipe の列挙
// =============================================================================

function listAllPipes() {
  printSection('1. Claude 関連 Named Pipes');

  try {
    // PowerShell で Named Pipe を列挙
    const output = execSync(
      `powershell -Command "[System.IO.Directory]::GetFiles('\\\\.\\pipe\\')" `,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const allPipes = output.trim().split('\n').filter(p => p.trim());

    // Claude 関連をフィルタ
    const claudePipes = allPipes.filter(p =>
      p.toLowerCase().includes('claude') ||
      p.toLowerCase().includes('anthropic')
    );

    if (claudePipes.length > 0) {
      console.log(`\n検出された Claude 関連 Pipe (${claudePipes.length} 件):\n`);
      claudePipes.forEach(p => {
        console.log(`  ${p.trim()}`);
      });
    } else {
      console.log('\nClaude 関連の Pipe は見つかりませんでした');
    }

    // 参考: 似た名前のパイプも表示
    const similarPipes = allPipes.filter(p =>
      p.toLowerCase().includes('mcp') ||
      p.toLowerCase().includes('browser') ||
      p.toLowerCase().includes('extension') ||
      p.toLowerCase().includes('native')
    );

    if (similarPipes.length > 0) {
      console.log(`\n関連しそうな Pipe (${similarPipes.length} 件):\n`);
      similarPipes.slice(0, 20).forEach(p => {
        console.log(`  ${p.trim()}`);
      });
      if (similarPipes.length > 20) {
        console.log(`  ... 他 ${similarPipes.length - 20} 件`);
      }
    }

    return { claudePipes, similarPipes, allPipes };
  } catch (err) {
    console.log(`エラー: ${err.message}`);
    return { claudePipes: [], similarPipes: [], allPipes: [] };
  }
}

// =============================================================================
// 2. Claude プロセスの詳細
// =============================================================================

function analyzeClaudeProcesses() {
  printSection('2. Claude プロセス詳細');

  try {
    // wmic でコマンドライン引数を取得
    const output = execSync(
      `wmic process where "name like '%claude%' or commandline like '%claude%'" get processid,name,commandline /format:csv 2>nul`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = output.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));

    if (lines.length > 1) {
      console.log('\n検出されたプロセス:\n');
      lines.slice(1).forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const [node, cmdline, name, pid] = parts;
          console.log(`PID: ${pid}`);
          console.log(`Name: ${name}`);
          console.log(`CommandLine: ${cmdline?.substring(0, 100)}...`);
          console.log('');
        }
      });
    } else {
      console.log('\nClaude プロセスは見つかりませんでした');
    }
  } catch (err) {
    console.log(`エラー: ${err.message}`);
  }
}

// =============================================================================
// 3. Desktop Native Host の調査
// =============================================================================

function analyzeDesktopNativeHost() {
  printSection('3. Desktop Native Host 調査');

  const desktopHostPath = 'C:\\Users\\kh\\AppData\\Local\\AnthropicClaude\\app-1.1.1520\\resources\\chrome-native-host.exe';

  if (!fs.existsSync(desktopHostPath)) {
    console.log(`\nNative Host が見つかりません: ${desktopHostPath}`);

    // 別バージョンを探す
    const baseDir = 'C:\\Users\\kh\\AppData\\Local\\AnthropicClaude';
    try {
      const apps = fs.readdirSync(baseDir).filter(d => d.startsWith('app-'));
      if (apps.length > 0) {
        console.log(`\n見つかったバージョン:`);
        apps.forEach(a => console.log(`  ${a}`));
      }
    } catch {}
    return;
  }

  console.log(`\nNative Host: ${desktopHostPath}`);
  console.log('');

  // ファイル情報
  const stats = fs.statSync(desktopHostPath);
  console.log(`サイズ: ${stats.size} bytes`);
  console.log(`更新日: ${stats.mtime.toISOString()}`);

  // strings コマンドで文字列を抽出（PowerShell で代替）
  console.log('\n文字列解析中...\n');

  try {
    // バイナリから文字列を抽出
    const buffer = fs.readFileSync(desktopHostPath);
    const strings = [];
    let current = '';

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte >= 32 && byte < 127) {
        current += String.fromCharCode(byte);
      } else {
        if (current.length >= 6) {
          strings.push(current);
        }
        current = '';
      }
    }

    // Pipe 関連の文字列をフィルタ
    const pipeStrings = strings.filter(s =>
      s.toLowerCase().includes('pipe') ||
      s.toLowerCase().includes('claude') ||
      s.toLowerCase().includes('bridge') ||
      s.toLowerCase().includes('mcp')
    );

    if (pipeStrings.length > 0) {
      console.log('Pipe 関連の文字列:');
      const unique = [...new Set(pipeStrings)];
      unique.slice(0, 30).forEach(s => {
        console.log(`  "${s}"`);
      });
    }

  } catch (err) {
    console.log(`解析エラー: ${err.message}`);
  }
}

// =============================================================================
// 4. Desktop 起動時の Pipe 変化を監視
// =============================================================================

function suggestMonitoring() {
  printSection('4. Pipe 監視方法');

  console.log(`
Desktop が使用する Pipe を特定するための手順:

1. Claude Desktop を完全に終了
   - タスクマネージャーで claude.exe を終了

2. 現在の Pipe を記録
   > node scripts/discover-pipes.js > before.txt

3. Claude Desktop を起動
   - Chrome 拡張経由でも直接起動でも可

4. 新しく出現した Pipe を確認
   > node scripts/discover-pipes.js > after.txt
   > diff before.txt after.txt  (または Compare-Object)

5. 差分が Desktop の Pipe

あるいは、リアルタイム監視:
   > node scripts/discover-pipes.js --watch
`);
}

// =============================================================================
// 5. リアルタイム監視モード
// =============================================================================

async function watchMode() {
  printSection('Pipe 監視モード (Ctrl+C で終了)');

  let previousPipes = new Set();

  const check = () => {
    try {
      const output = execSync(
        `powershell -Command "[System.IO.Directory]::GetFiles('\\\\.\\pipe\\')" `,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      const currentPipes = new Set(
        output.trim().split('\n')
          .filter(p => p.trim())
          .filter(p =>
            p.toLowerCase().includes('claude') ||
            p.toLowerCase().includes('anthropic') ||
            p.toLowerCase().includes('mcp')
          )
      );

      // 新しく追加された Pipe
      for (const pipe of currentPipes) {
        if (!previousPipes.has(pipe)) {
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] + ${pipe.trim()}`);
        }
      }

      // 削除された Pipe
      for (const pipe of previousPipes) {
        if (!currentPipes.has(pipe)) {
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] - ${pipe.trim()}`);
        }
      }

      previousPipes = currentPipes;
    } catch {}
  };

  // 初回
  check();
  console.log('\n監視中... (1秒ごとにチェック)\n');

  // 1秒ごとにチェック
  setInterval(check, 1000);
}

// =============================================================================
// メイン
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--watch') || args.includes('-w')) {
    await watchMode();
    return;
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Named Pipe 探索ツール                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n実行日時: ${new Date().toISOString()}`);

  listAllPipes();
  analyzeClaudeProcesses();
  analyzeDesktopNativeHost();
  suggestMonitoring();
}

main().catch(console.error);
