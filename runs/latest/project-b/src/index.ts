#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('kb-sync')
  .description('Bidirectional sync between a local markdown knowledge base and Linear')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize kb-sync configuration')
  .option('--api-key <key>', 'Linear API key')
  .option('--team-id <id>', 'Linear team ID')
  .option('--kb-dir <dir>', 'Knowledge base directory', 'kb')
  .option('--project-id <id>', 'Linear project ID (optional)')
  .option('--force', 'Overwrite existing config')
  .action(initCommand);

program
  .command('pull')
  .description('Fetch issues from Linear and write as local markdown files')
  .action(pullCommand);

program
  .command('push')
  .description('Push local markdown files to Linear as issues')
  .action(pushCommand);

program
  .command('status')
  .description('Show sync state between local and remote')
  .action(statusCommand);

program.parse();
