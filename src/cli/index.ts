#!/usr/bin/env node
/**
 * Claude Bridge CLI エントリーポイント
 */

import { Command } from 'commander';
import { createInstallCommand } from './commands/install';
import { createUninstallCommand } from './commands/uninstall';
import { createConfigCommand } from './commands/config';
import { createStatusCommand } from './commands/status';

const program = new Command();

program
  .name('claude-bridge')
  .description('Chrome拡張とClaude製品の接続を制御するプロキシシステム')
  .version('0.1.0');

// Install/Uninstall commands
program.addCommand(createInstallCommand());
program.addCommand(createUninstallCommand());

// Config command
program.addCommand(createConfigCommand());

// Status command
program.addCommand(createStatusCommand());

program.parse();
