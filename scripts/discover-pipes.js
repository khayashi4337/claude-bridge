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

  const baseDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AnthropicClaude');

  // バージョンを動的に検出
  let desktopHostPath = null;
  try {
    const apps = fs.readdirSync(baseDir).filter(d => d.startsWith('app-')).sort().reverse();
    if (apps.length > 0) {
      desktopHostPath = path.join(baseDir, apps[0], 'resources', 'chrome-native-host.exe');
    }
  } catch {}

  if (!desktopHostPath || !fs.existsSync(desktopHostPath)) {
    console.log(`\nNative Host が見つかりません`);
    console.log(`検索場所: ${baseDir}`);
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
// 4. Pipe 差分比較モード
// =============================================================================

function getCurrentPipes() {
  try {
    const output = execSync(
      `powershell -Command "[System.IO.Directory]::GetFiles('\\\\.\\pipe\\')" `,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return new Set(output.trim().split('\n').filter(p => p.trim()));
  } catch {
    return new Set();
  }
}

async function diffMode() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  const confirm = async (prompt) => {
    const answer = await question(`${prompt} (Y/n): `);
    return answer.trim().toLowerCase() !== 'n';
  };

  const isProcessRunning = (processName) => {
    try {
      const output = execSync(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV 2>nul`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return output.includes(processName);
    } catch {
      return false;
    }
  };

  const getDesktopExe = () => {
    const baseDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AnthropicClaude');
    try {
      const apps = fs.readdirSync(baseDir).filter(d => d.startsWith('app-')).sort().reverse();
      if (apps.length > 0) {
        return path.join(baseDir, apps[0], 'claude.exe');
      }
    } catch {}
    return null;
  };

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Named Pipe 差分比較モード                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('プロセス起動前後の Named Pipe の差分を検出します。');
  console.log('');

  // 調査対象の選択
  console.log('調査対象を選択してください:');
  console.log('  [1] Claude Desktop の Pipe を調べる');
  console.log('  [2] 手動モード（自分でプロセスを操作）');
  console.log('');

  const mode = (await question('選択 (1/2): ')).trim();

  if (mode === '1') {
    // Desktop 自動モード
    console.log('');

    // プロセス状態を確認
    const desktopRunning = isProcessRunning('claude.exe');

    if (desktopRunning) {
      console.log('📊 状態: Claude Desktop は起動中です');
      console.log('');

      // Step 1: Desktop を終了
      if (await confirm('終了して Before スナップショットを取得しますか？')) {
        console.log('');
        console.log('⏳ Claude Desktop を終了しています...');
        try {
          execSync('taskkill /F /IM claude.exe 2>nul', { encoding: 'utf8', stdio: 'pipe' });
          console.log('✅ 終了しました');
        } catch {
          console.log('⚠️  終了に失敗しました');
        }
        // 少し待つ
        await new Promise(r => setTimeout(r, 1500));
      }
    } else {
      console.log('📊 状態: Claude Desktop は停止中です');
      console.log('   → Before スナップショットを取得します');
    }

    // Before スナップショット
    console.log('');
    console.log('📸 Before スナップショット取得...');
    const beforePipes = getCurrentPipes();
    const beforeClaude = [...beforePipes].filter(p =>
      p.toLowerCase().includes('claude') ||
      p.toLowerCase().includes('mcp') ||
      p.toLowerCase().includes('anthropic')
    );

    console.log('   現在の Claude 関連 Pipe:');
    if (beforeClaude.length > 0) {
      beforeClaude.forEach(p => console.log(`     📌 ${p.replace('\\\\.\\pipe\\', '')}`));
    } else {
      console.log('     (なし)');
    }

    // Step 2: Desktop を起動
    console.log('');

    // 再度プロセス状態を確認
    const stillRunning = isProcessRunning('claude.exe');

    if (stillRunning) {
      console.log('⚠️  Claude Desktop がまだ起動中です');
      console.log('   差分を正確に取得できない可能性があります');
      console.log('');
      await question('Enter で続行...');
    } else if (await confirm('Claude Desktop を起動しますか？')) {
      console.log('');
      const desktopExe = getDesktopExe();
      if (!desktopExe || !fs.existsSync(desktopExe)) {
        console.log('❌ Claude Desktop が見つかりません');
      } else {
        console.log('⏳ Claude Desktop を起動しています...');
        spawn(desktopExe, [], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        console.log('⏳ Pipe 作成を待機中 (3秒)...');
        await new Promise(r => setTimeout(r, 3000));

        // 起動確認
        if (isProcessRunning('claude.exe')) {
          console.log('✅ 起動しました');
        } else {
          console.log('⚠️  起動を確認できませんでした');
        }
      }
    }

    // After スナップショット
    console.log('');
    console.log('📸 After スナップショット取得...');
    const afterPipes = getCurrentPipes();
    const afterClaude = [...afterPipes].filter(p =>
      p.toLowerCase().includes('claude') ||
      p.toLowerCase().includes('mcp') ||
      p.toLowerCase().includes('anthropic')
    );

    console.log('   現在の Claude 関連 Pipe:');
    if (afterClaude.length > 0) {
      afterClaude.forEach(p => console.log(`     📌 ${p.replace('\\\\.\\pipe\\', '')}`));
    } else {
      console.log('     (なし)');
    }

    // 差分表示へ
    showDiff(beforePipes, afterPipes, beforeClaude, afterClaude);
    rl.close();
    return;
  }

  // 手動モード
  console.log('');
  console.log('手動モード: プロセスを自分で操作してください');
  console.log('');
  await question('対象プロセスを終了したら Enter...');

  console.log('');
  console.log('📸 Before スナップショット取得...');
  const beforePipes = getCurrentPipes();
  const beforeClaude = [...beforePipes].filter(p =>
    p.toLowerCase().includes('claude') ||
    p.toLowerCase().includes('mcp') ||
    p.toLowerCase().includes('anthropic')
  );

  console.log('   現在の Claude 関連 Pipe:');
  if (beforeClaude.length > 0) {
    beforeClaude.forEach(p => console.log(`     📌 ${p.replace('\\\\.\\pipe\\', '')}`));
  } else {
    console.log('     (なし)');
  }

  console.log('');
  await question('対象プロセスを起動したら Enter...');

  console.log('');
  console.log('📸 After スナップショット取得...');
  const afterPipes = getCurrentPipes();
  const afterClaude = [...afterPipes].filter(p =>
    p.toLowerCase().includes('claude') ||
    p.toLowerCase().includes('mcp') ||
    p.toLowerCase().includes('anthropic')
  );

  console.log('   現在の Claude 関連 Pipe:');
  if (afterClaude.length > 0) {
    afterClaude.forEach(p => console.log(`     📌 ${p.replace('\\\\.\\pipe\\', '')}`));
  } else {
    console.log('     (なし)');
  }

  showDiff(beforePipes, afterPipes, beforeClaude, afterClaude);
  rl.close();
}

function showDiff(beforePipes, afterPipes, beforeClaude, afterClaude) {

  // 差分表示
  console.log('');
  console.log('╔═════════════════════════════════════════════════════════════╗');
  console.log('║ 結果                                                        ║');
  console.log('╚═════════════════════════════════════════════════════════════╝');

  // 追加された Pipe
  const added = [...afterPipes].filter(p => !beforePipes.has(p));
  const addedClaude = added.filter(p =>
    p.toLowerCase().includes('claude') ||
    p.toLowerCase().includes('mcp') ||
    p.toLowerCase().includes('anthropic')
  );

  // 削除された Pipe
  const removed = [...beforePipes].filter(p => !afterPipes.has(p));
  const removedClaude = removed.filter(p =>
    p.toLowerCase().includes('claude') ||
    p.toLowerCase().includes('mcp') ||
    p.toLowerCase().includes('anthropic')
  );

  console.log('');

  if (addedClaude.length > 0) {
    console.log('✅ 追加された Pipe（起動したプロセスが作成）:');
    console.log('');
    addedClaude.forEach(p => {
      const name = p.replace('\\\\.\\pipe\\', '');
      console.log(`   📌 ${name}`);
    });
    console.log('');

    // 競合の警告
    if (addedClaude.some(p => p.includes('claude-mcp-browser-bridge'))) {
      console.log('   ⚠️  browser-bridge Pipe が検出されました');
      console.log('      Desktop と Code は同じ名前を使用するため競合します');
      console.log('      (GitHub Issue #20887)');
      console.log('');
    }
  }

  if (removedClaude.length > 0) {
    console.log('❌ 削除された Pipe:');
    console.log('');
    removedClaude.forEach(p => {
      const name = p.replace('\\\\.\\pipe\\', '');
      console.log(`   📌 ${name}`);
    });
    console.log('');
  }

  if (addedClaude.length === 0 && removedClaude.length === 0) {
    // 変化なしの場合、詳細な診断を表示
    const bridgePipeExists = [...afterPipes].some(p => p.includes('claude-mcp-browser-bridge'));

    if (bridgePipeExists) {
      console.log('⚠️  Claude 関連の変化なし（Pipe は存在）');
      console.log('');
      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│ 💡 診断結果                                                 │');
      console.log('└─────────────────────────────────────────────────────────────┘');
      console.log('');
      console.log('Desktop を終了しても browser-bridge Pipe が残っています。');
      console.log('これは Claude Code が同じ Pipe を保持していることを示します。');
      console.log('');
      console.log('📌 根本原因:');
      console.log('   Desktop と Code は同じ Pipe 名を使用するため、');
      console.log('   両方を同時に使用すると競合が発生します。');
      console.log('   (GitHub Issue #20887)');
      console.log('');
      console.log('🔧 対処方法:');
      console.log('   1. Desktop と Code を同時に使わない');
      console.log('   2. scripts/menu.js で接続先を切り替える');
      console.log('   3. Anthropic による修正を待つ');
      console.log('');
    } else {
      console.log('(Claude 関連の変化なし)');
      console.log('');
      console.log('💡 考えられる原因:');
      console.log('   - プロセスが正しく起動/終了していない');
      console.log('   - Pipe がまだ作成されていない');
      console.log('');
    }
  }
}

function suggestMonitoring() {
  printSection('4. Pipe 監視方法');

  console.log(`
利用可能なモード:

1. 差分比較モード (推奨)
   > node scripts/discover-pipes.js --diff

   対話形式で Before/After の差分を自動計算します。
   どのプロセスが Pipe を作成しているか特定できます。

2. リアルタイム監視モード
   > node scripts/discover-pipes.js --watch

   1秒ごとに Pipe の追加/削除を監視します。
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

  // ヘルプ
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Named Pipe 探索ツール

使い方:
  node discover-pipes.js           通常モード（一覧表示）
  node discover-pipes.js --diff    差分比較モード（推奨）
  node discover-pipes.js --watch   リアルタイム監視モード

オプション:
  --diff, -d     Before/After の差分を比較
  --watch, -w    Pipe の追加/削除をリアルタイム監視
  --help, -h     このヘルプを表示
`);
    return;
  }

  // 差分モード
  if (args.includes('--diff') || args.includes('-d')) {
    await diffMode();
    return;
  }

  // 監視モード
  if (args.includes('--watch') || args.includes('-w')) {
    await watchMode();
    return;
  }

  // 通常モード
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
