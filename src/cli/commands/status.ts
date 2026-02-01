/**
 * Status CLI コマンド
 */

import { Command } from 'commander';
import { ConfigManager } from '../../config';
import { createConnector } from '../../ipc';
import { createDetector } from '../../detector';

/**
 * Status コマンドを作成
 */
export function createStatusCommand(): Command {
  const status = new Command('status');
  status.description('Show Claude Bridge status');

  status
    .option('--json', 'Output in JSON format')
    .action(async (options: { json?: boolean }) => {
      const configManager = new ConfigManager();
      await configManager.load();
      const config = configManager.getConfig();

      const connector = createConnector();
      const detector = createDetector(connector, config);

      const detection = await detector.detectAll();

      if (options.json) {
        // JSON 出力
        console.log(JSON.stringify({
          bridge: {
            installed: true,
            running: false,
          },
          config: {
            target: config.target,
            fallbackEnabled: config.fallback.enabled,
            fallbackOrder: config.fallback.order,
          },
          desktop: {
            processRunning: detection.desktop.processRunning,
            ipcConnectable: detection.desktop.ipcConnectable,
            responseTime: detection.desktop.responseTime,
            error: detection.desktop.error,
          },
          cli: {
            processRunning: detection.cli.processRunning,
            ipcConnectable: detection.cli.ipcConnectable,
            responseTime: detection.cli.responseTime,
            error: detection.cli.error,
          },
        }, null, 2));
        return;
      }

      // 人間が読める形式
      const box = (title: string, content: string[]) => {
        const width = 50;
        const line = '═'.repeat(width);
        console.log(`╔${line}╗`);
        console.log(`║ ${title.padEnd(width - 1)}║`);
        console.log(`╠${line}╣`);
        content.forEach((c) => {
          console.log(`║ ${c.padEnd(width - 1)}║`);
        });
        console.log(`╚${line}╝`);
      };

      // 現在のターゲットを決定
      let currentTarget = config.target as string;
      if (config.target === 'auto') {
        for (const t of config.fallback.order) {
          if (detection[t].ipcConnectable) {
            currentTarget = `auto → ${t}`;
            break;
          }
        }
      }

      box('Claude Bridge Status', [
        `Bridge:      installed ✓`,
        `Running:     no`,
        `Target:      ${currentTarget}`,
      ]);

      console.log('');

      // Desktop
      const desktopStatus: string[] = [];
      desktopStatus.push(
        `  Process:   ${detection.desktop.processRunning ? 'running ✓' : 'not running ✗'}`
      );
      if (detection.desktop.processRunning) {
        desktopStatus.push(
          `  IPC:       ${detection.desktop.ipcConnectable ? 'connectable ✓' : 'not connectable ✗'}`
        );
        if (detection.desktop.responseTime !== undefined) {
          desktopStatus.push(`  Latency:   ${detection.desktop.responseTime}ms`);
        }
      }

      box('Claude Desktop', desktopStatus);

      console.log('');

      // CLI
      const cliStatus: string[] = [];
      cliStatus.push(
        `  Process:   ${detection.cli.processRunning ? 'running ✓' : 'not running ✗'}`
      );
      if (detection.cli.processRunning) {
        const active = config.target === 'cli' ||
          (config.target === 'auto' && config.fallback.order[0] === 'cli' && detection.cli.ipcConnectable);
        cliStatus.push(
          `  IPC:       ${detection.cli.ipcConnectable ? 'connectable ✓' : 'not connectable ✗'}${active ? '  ← active' : ''}`
        );
        if (detection.cli.responseTime !== undefined) {
          cliStatus.push(`  Latency:   ${detection.cli.responseTime}ms`);
        }
      }

      box('Claude CLI', cliStatus);
    });

  return status;
}
