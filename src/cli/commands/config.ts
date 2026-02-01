/**
 * Config CLI コマンド
 */

import { Command } from 'commander';
import { ConfigManager } from '../../config';

/**
 * Config コマンドを作成
 */
export function createConfigCommand(): Command {
  const config = new Command('config');
  config.description('Manage Claude Bridge configuration');

  // config list
  config
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      const manager = new ConfigManager();
      await manager.load();

      const cfg = manager.getConfig();
      console.log('Current configuration:');
      console.log('');
      console.log(`target: ${cfg.target}`);
      console.log(`fallback.enabled: ${cfg.fallback.enabled}`);
      console.log(`fallback.order: [${cfg.fallback.order.join(', ')}]`);
      console.log(`timeouts.connection: ${cfg.timeouts.connection}`);
      console.log(`timeouts.healthCheck: ${cfg.timeouts.healthCheck}`);
      console.log(`timeouts.reconnect: ${cfg.timeouts.reconnect}`);
      console.log(`detection.interval: ${cfg.detection.interval}`);
      console.log(`detection.cacheTtl: ${cfg.detection.cacheTtl}`);

      if (cfg.advanced) {
        if (cfg.advanced.debug !== undefined) {
          console.log(`advanced.debug: ${cfg.advanced.debug}`);
        }
        if (cfg.advanced.paths) {
          Object.entries(cfg.advanced.paths).forEach(([k, v]) => {
            console.log(`advanced.paths.${k}: ${v}`);
          });
        }
      }
    });

  // config get <key>
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      const manager = new ConfigManager();
      await manager.load();

      const value = manager.getNested(key);
      if (value === undefined) {
        console.error(`Key not found: ${key}`);
        process.exit(1);
      }

      if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(value);
      }
    });

  // config set <key> <value>
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      const manager = new ConfigManager();
      await manager.load();

      // 値をパース
      let parsedValue: unknown = value;

      // 真偽値
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      // 数値
      else if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = Number(value);
      // 配列
      else if (value.startsWith('[')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }
      }

      try {
        await manager.setNested(key, parsedValue);
        console.log(`✓ ${key} set to: ${JSON.stringify(parsedValue)}`);
      } catch (error) {
        console.error(`✗ Failed to set ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // config reset
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      const manager = new ConfigManager();
      await manager.reset();
      console.log('✓ Config reset to defaults');
    });

  // config path
  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      const manager = new ConfigManager();
      console.log(manager.getConfigPath());
    });

  return config;
}
