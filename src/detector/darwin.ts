/**
 * macOS Process Detector
 */

import { execSync } from 'child_process';
import { Target } from '../types';
import { ProcessInfo } from './types';
import { ProcessDetector } from './detector';

/**
 * プロセス名マッピング
 */
const PROCESS_PATTERNS: Record<Target, string> = {
  desktop: 'Claude',
  cli: 'claude',
};

/**
 * macOS Process Detector
 */
export class DarwinDetector extends ProcessDetector {
  /**
   * プロセスを検出
   */
  async detectProcess(target: Target): Promise<ProcessInfo> {
    const pattern = PROCESS_PATTERNS[target];

    try {
      if (target === 'desktop') {
        // pgrep で正確なプロセス名を検索
        const output = execSync(`pgrep -x "${pattern}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });

        const pid = parseInt(output.trim().split('\n')[0], 10);
        if (!isNaN(pid)) {
          return {
            target,
            running: true,
            pid,
          };
        }
      } else {
        // CLI は pgrep -f でコマンドライン全体を検索
        const output = execSync(`pgrep -f "${pattern}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });

        const pids = output.trim().split('\n').filter(Boolean);

        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (isNaN(pid)) continue;

          // 自分自身のプロセスを除外
          if (pid === process.pid) continue;

          // ps でコマンドを確認
          try {
            const psOutput = execSync(`ps -p ${pid} -o command=`, {
              encoding: 'utf8',
              timeout: 5000,
            });

            // Claude CLI のプロセスかどうかを確認
            if (psOutput.includes('node') && psOutput.includes('claude')) {
              return {
                target,
                running: true,
                pid,
              };
            }
          } catch {
            // ps が失敗した場合は次へ
          }
        }
      }

      return { target, running: false };
    } catch {
      return { target, running: false };
    }
  }
}
