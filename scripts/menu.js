#!/usr/bin/env node
/**
 * Claude Bridge - 対話的メニュー
 * ツール群を簡単に使えるようにするインターフェース
 */

const readline = require('readline');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// パス設定
const SCRIPTS_DIR = __dirname;
const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'claude-bridge');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backup');
const DESKTOP_MANIFEST = path.join(process.env.APPDATA, 'Claude', 'ChromeNativeHost', 'com.anthropic.claude_browser_extension.json');
const CODE_NATIVE_HOST = path.join(os.homedir(), '.claude', 'chrome', 'chrome-native-host.bat');
const DESKTOP_NATIVE_HOST_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AnthropicClaude');

// Desktop のバージョンを動的に検出
function getDesktopNativeHost() {
  try {
    const apps = fs.readdirSync(DESKTOP_NATIVE_HOST_DIR).filter(d => d.startsWith('app-')).sort().reverse();
    if (apps.length > 0) {
      return path.join(DESKTOP_NATIVE_HOST_DIR, apps[0], 'resources', 'chrome-native-host.exe');
    }
  } catch {}
  return null;
}

function getDesktopExe() {
  try {
    const apps = fs.readdirSync(DESKTOP_NATIVE_HOST_DIR).filter(d => d.startsWith('app-')).sort().reverse();
    if (apps.length > 0) {
      return path.join(DESKTOP_NATIVE_HOST_DIR, apps[0], 'claude.exe');
    }
  } catch {}
  return null;
}

// 色定義
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function color(c, text) {
  return `${colors[c]}${text}${colors.reset}`;
}

// ユーティリティ
function runScript(name) {
  try {
    const output = execSync(`node "${path.join(SCRIPTS_DIR, name)}"`, {
      encoding: 'utf8',
      timeout: 30000
    });
    console.log(output);
  } catch (err) {
    console.log(err.stdout || err.message);
  }
}

function getCurrentTarget() {
  try {
    const manifest = JSON.parse(fs.readFileSync(DESKTOP_MANIFEST, 'utf8'));
    if (manifest.path.includes('.claude')) {
      return 'code';
    } else if (manifest.path.includes('AnthropicClaude')) {
      return 'desktop';
    }
    return 'unknown';
  } catch {
    return 'error';
  }
}

function setTarget(target) {
  try {
    const manifest = JSON.parse(fs.readFileSync(DESKTOP_MANIFEST, 'utf8'));
    if (target === 'code') {
      manifest.path = CODE_NATIVE_HOST;
    } else {
      const desktopHost = getDesktopNativeHost();
      if (!desktopHost) {
        console.log(color('red', 'エラー: Claude Desktop が見つかりません'));
        return false;
      }
      manifest.path = desktopHost;
    }
    fs.writeFileSync(DESKTOP_MANIFEST, JSON.stringify(manifest, null, 2));
    return true;
  } catch (err) {
    console.log(color('red', `エラー: ${err.message}`));
    return false;
  }
}

// メニュー表示
function showMenu() {
  const target = getCurrentTarget();
  const targetDisplay = target === 'code'
    ? color('green', 'Claude Code')
    : target === 'desktop'
    ? color('blue', 'Claude Desktop')
    : color('yellow', '不明');

  console.clear();
  console.log(color('cyan', '╔════════════════════════════════════════════════════════════╗'));
  console.log(color('cyan', '║') + color('bright', '           Claude Bridge - コントロールパネル            ') + color('cyan', '║'));
  console.log(color('cyan', '╠════════════════════════════════════════════════════════════╣'));
  console.log(color('cyan', '║') + `  現在の接続先: ${targetDisplay}                              ` + color('cyan', '║'));
  console.log(color('cyan', '╠════════════════════════════════════════════════════════════╣'));
  console.log(color('cyan', '║') + color('bright', ' 診断ツール                                                ') + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [1] 拡張機能の状態を確認                                 ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [2] 統合診断を実行                                       ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [3] Named Pipe を探索                                    ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [3d] Named Pipe 差分比較 (推奨)                          ' + color('cyan', '║'));
  console.log(color('cyan', '╠════════════════════════════════════════════════════════════╣'));
  console.log(color('cyan', '║') + color('bright', ' 接続先の切り替え                                          ') + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [4] Claude Code に切り替え                               ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [5] Claude Desktop に切り替え（元に戻す）                ' + color('cyan', '║'));
  console.log(color('cyan', '╠════════════════════════════════════════════════════════════╣'));
  console.log(color('cyan', '║') + color('bright', ' プロセス管理                                              ') + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [6] Chrome を再起動                                      ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [7] Claude Desktop を起動                                ' + color('cyan', '║'));
  console.log(color('cyan', '║') + '  [8] Claude Desktop を終了                                ' + color('cyan', '║'));
  console.log(color('cyan', '╠════════════════════════════════════════════════════════════╣'));
  console.log(color('cyan', '║') + '  [q] 終了                                                 ' + color('cyan', '║'));
  console.log(color('cyan', '╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

// アクション実行
async function executeAction(choice) {
  console.log('');

  switch (choice) {
    case '1':
      console.log(color('bright', '--- 拡張機能の状態 ---\n'));
      runScript('check-claude-extension.js');
      break;

    case '2':
      console.log(color('bright', '--- 統合診断 ---\n'));
      runScript('diagnose-all.js');
      break;

    case '3':
      console.log(color('bright', '--- Named Pipe 探索 ---\n'));
      runScript('discover-pipes.js');
      break;

    case '4':
      console.log(color('bright', '--- Claude Code に切り替え ---\n'));
      if (setTarget('code')) {
        console.log(color('green', '✅ 切り替え完了'));
        console.log(color('yellow', '⚠️  Chrome を再起動してください（メニュー[6]）'));
      }
      break;

    case '5':
      console.log(color('bright', '--- Claude Desktop に切り替え ---\n'));
      if (setTarget('desktop')) {
        console.log(color('green', '✅ 切り替え完了（元に戻しました）'));
        console.log(color('yellow', '⚠️  Chrome を再起動してください（メニュー[6]）'));
      }
      break;

    case '6':
      console.log(color('bright', '--- Chrome 再起動 ---\n'));
      try {
        execSync('taskkill /F /IM chrome.exe', { encoding: 'utf8', stdio: 'pipe' });
        console.log('Chrome を終了しました');
      } catch {}
      setTimeout(() => {
        spawn('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ['--profile-directory=Profile 1'],
          { detached: true, stdio: 'ignore' }
        ).unref();
        console.log(color('green', '✅ Chrome を起動しました'));
      }, 2000);
      break;

    case '7':
      console.log(color('bright', '--- Claude Desktop 起動 ---\n'));
      const desktopExe = getDesktopExe();
      if (desktopExe && fs.existsSync(desktopExe)) {
        spawn(desktopExe, [], { detached: true, stdio: 'ignore' }).unref();
        console.log(color('green', '✅ Claude Desktop を起動しました'));
      } else {
        console.log(color('red', '❌ Claude Desktop が見つかりません'));
      }
      break;

    case '8':
      console.log(color('bright', '--- Claude Desktop 終了 ---\n'));
      try {
        execSync('taskkill /F /IM claude.exe', { encoding: 'utf8', stdio: 'pipe' });
        console.log(color('green', '✅ Claude Desktop を終了しました'));
      } catch {
        console.log(color('yellow', 'Claude Desktop は起動していません'));
      }
      break;

    case 'q':
    case 'Q':
      console.log('終了します');
      process.exit(0);

    default:
      console.log(color('red', '無効な選択です'));
  }

  console.log('\n' + color('cyan', 'Enterキーでメニューに戻ります...'));
}

// メイン
async function main() {
  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    showMenu();
    rl.question('選択してください: ', async (answer) => {
      const choice = answer.trim();

      // 対話的サブプロセスの場合は readline を閉じて実行
      if (choice === '3d' || choice === '3D') {
        rl.close();
        console.log('');
        console.log(color('bright', '--- Named Pipe 差分比較 ---\n'));

        const diffProc = spawn('node', [path.join(SCRIPTS_DIR, 'discover-pipes.js'), '--diff'], {
          stdio: 'inherit'
        });

        await new Promise(resolve => diffProc.on('close', resolve));

        console.log('\n' + color('cyan', 'Enterキーでメニューに戻ります...'));

        // readline を再作成
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('', () => prompt());
      } else {
        await executeAction(choice);
        rl.question('', () => prompt());
      }
    });
  };

  prompt();
}

main();
