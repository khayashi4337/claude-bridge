/**
 * Windows Process Detector
 */

import { execSync } from 'child_process';
import { Target } from '../types';
import { ProcessInfo } from './types';
import { ProcessDetector } from './detector';

/**
 * プロセス名マッピング
 */
const PROCESS_NAMES: Record<Target, string> = {
  desktop: 'Claude.exe',
  cli: 'node.exe',
};

/**
 * CLI 識別用のコマンドライン文字列
 */
const CLI_IDENTIFIER = 'claude';

/**
 * Windows Process Detector
 */
export class WindowsDetector extends ProcessDetector {
  /**
   * プロセスを検出
   */
  async detectProcess(target: Target): Promise<ProcessInfo> {
    const processName = PROCESS_NAMES[target];

    try {
      // tasklist でプロセス一覧を取得
      const output = execSync(
        `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`,
        { encoding: 'utf8', timeout: 5000 }
      );

      const lines = output.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        // CSV をパース
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (!match) continue;

        const [, name, pidStr] = match;
        const pid = parseInt(pidStr, 10);

        // Desktop はプロセス名で判定
        if (target === 'desktop' && name === processName) {
          return {
            target,
            running: true,
            pid,
          };
        }

        // CLI は node.exe + コマンドラインで判定
        if (target === 'cli' && name === processName) {
          // WMIC でコマンドラインを確認
          try {
            const cmdLine = execSync(
              `wmic process where processid=${pid} get commandline /FORMAT:VALUE`,
              { encoding: 'utf8', timeout: 5000 }
            );

            if (cmdLine.toLowerCase().includes(CLI_IDENTIFIER)) {
              return {
                target,
                running: true,
                pid,
              };
            }
          } catch {
            // WMIC が失敗した場合は無視
          }
        }
      }

      return { target, running: false };
    } catch {
      return { target, running: false };
    }
  }
}
