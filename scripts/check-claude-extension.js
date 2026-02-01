#!/usr/bin/env node
/**
 * Chrome Extension Status Checker
 * 対象: Claude in Chrome (fcoeoabgfenejglbffodgkkbkcdhcgfn)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG = {
  extensionId: 'fcoeoabgfenejglbffodgkkbkcdhcgfn',
  extensionName: 'Claude in Chrome',
  profile: 'Profile 1'
};

function getPreferencesPath() {
  const homeDir = os.homedir();

  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', CONFIG.profile, 'Secure Preferences');
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', CONFIG.profile, 'Secure Preferences');
  } else {
    return path.join(homeDir, '.config', 'google-chrome', CONFIG.profile, 'Secure Preferences');
  }
}

function checkExtension() {
  const result = {
    extensionId: CONFIG.extensionId,
    extensionName: CONFIG.extensionName,
    profile: CONFIG.profile,
    status: 'unknown',
    version: null,
    checkedAt: new Date().toISOString(),
    error: null
  };

  const prefsPath = getPreferencesPath();

  // ファイル存在確認
  if (!fs.existsSync(prefsPath)) {
    result.status = 'error';
    result.error = `Preferences file not found: ${prefsPath}`;
    return result;
  }

  try {
    const content = fs.readFileSync(prefsPath, 'utf8');
    const prefs = JSON.parse(content);

    const extSettings = prefs?.extensions?.settings?.[CONFIG.extensionId];

    if (!extSettings) {
      result.status = 'not_installed';
      result.error = 'Extension not found in profile';
      return result;
    }

    // disable_reasons チェック
    const disableReasons = extSettings.disable_reasons;

    if (!disableReasons || disableReasons.length === 0) {
      result.status = 'enabled';
      result.version = extSettings.manifest?.version || null;
    } else {
      result.status = 'disabled';
      result.disableReasons = disableReasons;
    }

    return result;

  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    return result;
  }
}

// 実行
const result = checkExtension();

// 出力形式の判定
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json') || args.includes('-j');

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('==================================');
  console.log('Chrome Extension Status Checker');
  console.log('==================================');
  console.log(`Extension: ${result.extensionName}`);
  console.log(`ID: ${result.extensionId}`);
  console.log(`Profile: ${result.profile}`);
  console.log('----------------------------------');

  if (result.status === 'enabled') {
    console.log(`STATUS: ENABLED ✅`);
    console.log(`Version: ${result.version}`);
  } else if (result.status === 'disabled') {
    console.log(`STATUS: DISABLED ❌`);
    console.log(`拡張機能を有効化してください:`);
    console.log(`  chrome://extensions/?id=${result.extensionId}`);
  } else if (result.status === 'not_installed') {
    console.log(`STATUS: NOT INSTALLED`);
  } else {
    console.log(`STATUS: ERROR`);
    console.log(`Error: ${result.error}`);
  }
}

// 終了コード
const exitCodes = {
  enabled: 0,
  disabled: 1,
  not_installed: 2,
  error: 3,
  unknown: 3
};

// 終了処理
const code = exitCodes[result.status] ?? 3;
setTimeout(() => process.exit(code), 0);
