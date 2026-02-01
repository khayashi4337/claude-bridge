#!/usr/bin/env node
/**
 * Claude Bridge 統合診断ツール
 * 環境の状態を包括的に診断し、問題を特定する
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CONFIG = {
  extensionId: 'fcoeoabgfenejglbffodgkkbkcdhcgfn',
  extensionName: 'Claude in Chrome',
  profile: 'Profile 1',
  nativeHostNames: [
    'com.anthropic.claude_browser_extension',
    'com.anthropic.claude_code_browser_extension'
  ],
  pipeName: `claude-mcp-browser-bridge-${os.userInfo().username}`
};

// =============================================================================
// ユーティリティ
// =============================================================================

function printSection(title) {
  console.log('');
  console.log('='.repeat(60));
  console.log(` ${title}`);
  console.log('='.repeat(60));
}

function printStatus(label, status, detail = '') {
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : status === 'error' ? '❌' : 'ℹ️';
  console.log(`${icon} ${label}${detail ? ': ' + detail : ''}`);
}

// =============================================================================
// 1. Chrome 拡張機能の診断
// =============================================================================

function diagnoseExtension() {
  printSection('1. Chrome 拡張機能');

  const homeDir = os.homedir();
  let prefsPath;

  if (process.platform === 'win32') {
    prefsPath = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', CONFIG.profile, 'Secure Preferences');
  } else if (process.platform === 'darwin') {
    prefsPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', CONFIG.profile, 'Secure Preferences');
  } else {
    prefsPath = path.join(homeDir, '.config', 'google-chrome', CONFIG.profile, 'Secure Preferences');
  }

  console.log(`Profile: ${CONFIG.profile}`);
  console.log(`Preferences: ${prefsPath}`);
  console.log('');

  if (!fs.existsSync(prefsPath)) {
    printStatus('Preferences ファイル', 'error', '見つかりません');
    return { status: 'error', reason: 'preferences_not_found' };
  }

  try {
    const content = fs.readFileSync(prefsPath, 'utf8');
    const prefs = JSON.parse(content);
    const extSettings = prefs?.extensions?.settings?.[CONFIG.extensionId];

    if (!extSettings) {
      printStatus('拡張機能', 'error', '未インストール');
      return { status: 'not_installed' };
    }

    const disableReasons = extSettings.disable_reasons;
    const version = extSettings.manifest?.version;

    if (!disableReasons || disableReasons.length === 0) {
      printStatus('拡張機能', 'ok', `有効 (v${version})`);
      return { status: 'enabled', version };
    } else {
      printStatus('拡張機能', 'error', `無効 (disable_reasons: ${JSON.stringify(disableReasons)})`);
      console.log(`   → 有効化: chrome://extensions/?id=${CONFIG.extensionId}`);
      return { status: 'disabled', disableReasons };
    }
  } catch (err) {
    printStatus('Preferences 解析', 'error', err.message);
    return { status: 'error', reason: err.message };
  }
}

// =============================================================================
// 2. Native Host の診断
// =============================================================================

function diagnoseNativeHosts() {
  printSection('2. Native Messaging Hosts');

  const results = [];

  for (const hostName of CONFIG.nativeHostNames) {
    // ホスト名を分かりやすく表示
    const displayName = hostName === 'com.anthropic.claude_browser_extension'
      ? 'Desktop用'
      : 'Code用';

    console.log(`\n┌─ ${hostName} (${displayName})`);
    console.log('│');

    let manifestPath;
    let registryKey;

    if (process.platform === 'win32') {
      // Windows: レジストリから取得
      registryKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
      console.log(`│  📋 レジストリキー:`);
      console.log(`│     ${registryKey}`);

      try {
        const output = execSync(`reg query "${registryKey}" /ve 2>nul`, { encoding: 'utf8' });
        const match = output.match(/REG_SZ\s+(.+)/);
        if (match) {
          manifestPath = match[1].trim();
          console.log(`│     └→ ✅ 登録済み`);
        }
      } catch {
        console.log(`│     └→ ❌ 未登録`);
        console.log('└─');
        results.push({ name: hostName, status: 'not_registered' });
        continue;
      }
    } else if (process.platform === 'darwin') {
      manifestPath = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${hostName}.json`);
    } else {
      manifestPath = path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', `${hostName}.json`);
    }

    if (!manifestPath || !fs.existsSync(manifestPath)) {
      console.log(`│  📄 マニフェスト: ❌ 見つかりません`);
      console.log('└─');
      results.push({ name: hostName, status: 'not_found' });
      continue;
    }

    console.log(`│`);
    console.log(`│  📄 マニフェストファイル:`);
    console.log(`│     ${manifestPath}`);

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      console.log(`│`);
      console.log(`│  🔧 実行ファイル (path):`);
      console.log(`│     ${manifest.path}`);

      // 実行ファイルの存在確認
      if (fs.existsSync(manifest.path)) {
        console.log(`│     └→ ✅ 存在`);
      } else {
        console.log(`│     └→ ❌ 見つかりません`);
      }

      // 接続先の判定
      console.log(`│`);
      let targetType;
      if (manifest.path.includes('.claude')) {
        targetType = 'Claude Code';
        console.log(`│  🎯 接続先: Claude Code`);
      } else if (manifest.path.includes('AnthropicClaude')) {
        targetType = 'Claude Desktop';
        console.log(`│  🎯 接続先: Claude Desktop`);
      } else {
        targetType = '不明';
        console.log(`│  🎯 接続先: 不明`);
      }

      console.log(`│`);
      console.log(`│  📋 type: ${manifest.type}`);
      console.log(`│  📋 allowed_origins: ${manifest.allowed_origins?.length || 0} 件`);
      console.log('└─');

      results.push({
        name: hostName,
        status: 'registered',
        manifest,
        manifestPath,
        registryKey,
        targetType,
        executableExists: fs.existsSync(manifest.path)
      });
    } catch (err) {
      console.log(`│  ❌ マニフェスト解析エラー: ${err.message}`);
      console.log('└─');
      results.push({ name: hostName, status: 'error', reason: err.message });
    }
  }

  return results;
}

// =============================================================================
// 3. Named Pipe の診断（Windows のみ）
// =============================================================================

function diagnoseNamedPipe() {
  printSection('3. Named Pipe (Windows)');

  if (process.platform !== 'win32') {
    printStatus('プラットフォーム', 'info', 'Windows以外のためスキップ');
    return { status: 'skipped', reason: 'not_windows' };
  }

  console.log('┌─ Named Pipe 情報');
  console.log('│');
  console.log('│  📌 期待される Pipe 名:');
  console.log(`│     claude-mcp-browser-bridge-${os.userInfo().username}`);
  console.log('│');
  console.log('│  💡 説明:');
  console.log('│     Desktop と Code は同じ Pipe 名を使用するため競合が発生します');
  console.log('│     (GitHub Issue #20887 参照)');
  console.log('│');

  // Named Pipe の存在確認（PowerShell使用）
  try {
    const output = execSync(
      `powershell -Command "[System.IO.Directory]::GetFiles('\\\\.\\pipe\\') | Where-Object { $_ -like '*claude*' }"`,
      { encoding: 'utf8', timeout: 5000 }
    );

    const pipes = output.trim().split('\n').filter(p => p.trim());

    console.log('│  🔍 検出された Claude 関連 Pipe:');
    if (pipes.length > 0) {
      pipes.forEach(p => {
        const pipeName = p.trim().replace('\\\\.\\pipe\\', '');
        console.log(`│     ✅ ${pipeName}`);
      });
      console.log('│');

      // Pipe の所有者を推測
      const bridgePipe = pipes.find(p => p.includes('claude-mcp-browser-bridge'));
      if (bridgePipe) {
        console.log('│  🎯 Browser Bridge Pipe の状態:');
        console.log('│     アクティブ（CLIまたはDesktopが起動中）');
      }
      console.log('└─');

      return { status: 'found', pipes };
    } else {
      console.log('│     (なし)');
      console.log('│');
      console.log('│  ⚠️  Pipe が見つかりません');
      console.log('│     → Claude Code CLI または Desktop を起動してください');
      console.log('└─');
      return { status: 'not_found' };
    }
  } catch (err) {
    console.log('│  ⚠️  検索エラー/タイムアウト');
    console.log('└─');
    return { status: 'error', reason: err.message };
  }
}

// =============================================================================
// 4. Claude プロセスの診断
// =============================================================================

function diagnoseProcesses() {
  printSection('4. Claude プロセス');

  const processes = {
    desktop: false,
    codeNativeHost: false,
    desktopNativeHost: false
  };

  try {
    let output;
    if (process.platform === 'win32') {
      output = execSync('tasklist /FI "IMAGENAME eq claude*" /FO CSV 2>nul', { encoding: 'utf8' });
    } else {
      output = execSync('ps aux | grep -i claude | grep -v grep', { encoding: 'utf8' });
    }

    const lines = output.trim().split('\n').filter(l => l.trim());

    if (lines.length <= 1) {
      printStatus('Claude プロセス', 'info', '検出されませんでした');
    } else {
      console.log('検出されたプロセス:');
      lines.slice(1).forEach(line => {
        console.log(`   ${line}`);
        if (line.toLowerCase().includes('claude.exe')) processes.desktop = true;
        if (line.toLowerCase().includes('chrome-native-host')) {
          if (line.includes('.claude')) {
            processes.codeNativeHost = true;
          } else {
            processes.desktopNativeHost = true;
          }
        }
      });
    }
  } catch {
    printStatus('プロセス検索', 'info', 'Claude プロセスなし');
  }

  // Node.js プロセスも確認（Claude Code CLI）
  try {
    let output;
    if (process.platform === 'win32') {
      output = execSync('wmic process where "name=\'node.exe\'" get commandline /format:csv 2>nul', { encoding: 'utf8' });
    } else {
      output = execSync('ps aux | grep node | grep claude', { encoding: 'utf8' });
    }

    if (output.toLowerCase().includes('claude')) {
      printStatus('Claude Code CLI', 'ok', '起動中の可能性');
    }
  } catch {
    // ignore
  }

  return processes;
}

// =============================================================================
// 5. 診断サマリー
// =============================================================================

function printSummary(results) {
  printSection('診断サマリー');

  const issues = [];

  // 拡張機能のチェック
  if (results.extension.status === 'disabled') {
    issues.push({
      severity: 'error',
      message: '拡張機能が無効です',
      action: `chrome://extensions/?id=${CONFIG.extensionId} で有効化してください`
    });
  } else if (results.extension.status === 'not_installed') {
    issues.push({
      severity: 'error',
      message: '拡張機能がインストールされていません',
      action: 'Chrome Web Store から「Claude in Chrome」をインストールしてください'
    });
  }

  // Native Host のチェック
  const registeredHosts = results.nativeHosts.filter(h => h.status === 'registered');
  if (registeredHosts.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Native Host が登録されていません',
      action: 'Claude Code または Claude Desktop をインストールしてください'
    });
  } else if (registeredHosts.length > 1) {
    // 競合の詳細を表示
    const hostDetails = registeredHosts.map(h =>
      `     - ${h.name} → ${h.targetType || '不明'}`
    ).join('\n');
    issues.push({
      severity: 'warn',
      message: `複数の Native Host が登録されています（競合の可能性）\n${hostDetails}`,
      action: 'scripts/menu.js で接続先を切り替えるか、docs/investigation-notes.md を参照'
    });
  }

  // Named Pipe のチェック
  if (results.namedPipe.status === 'not_found') {
    issues.push({
      severity: 'info',
      message: 'Named Pipe が見つかりません',
      action: 'Claude Code CLI を起動してください'
    });
  }

  // 結果の表示
  if (issues.length === 0) {
    printStatus('診断結果', 'ok', '問題は検出されませんでした');
  } else {
    console.log(`検出された問題: ${issues.length} 件\n`);
    issues.forEach((issue, i) => {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`${i + 1}. ${icon} ${issue.message}`);
      console.log(`   → ${issue.action}`);
      console.log('');
    });
  }

  return issues;
}

// =============================================================================
// メイン
// =============================================================================

function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Claude Bridge 統合診断ツール                     ║');
  console.log('║                                                            ║');
  console.log('║  ⚠️  WIP - このツールは開発中です                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n実行日時: ${new Date().toISOString()}`);
  console.log(`プラットフォーム: ${process.platform} (${os.release()})`);

  const results = {
    extension: diagnoseExtension(),
    nativeHosts: diagnoseNativeHosts(),
    namedPipe: diagnoseNamedPipe(),
    processes: diagnoseProcesses()
  };

  const issues = printSummary(results);

  // JSON 出力オプション
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON Output ---');
    console.log(JSON.stringify({ ...results, issues }, null, 2));
  }

  // 終了コード
  const hasErrors = issues.some(i => i.severity === 'error');
  process.exitCode = hasErrors ? 1 : 0;
}

main();
