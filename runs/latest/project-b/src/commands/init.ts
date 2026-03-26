import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { KbSyncConfig, DEFAULT_KB_DIR } from '../types.js';
import { configExists, saveConfig } from '../config.js';

export interface InitOptions {
  apiKey?: string;
  teamId?: string;
  kbDir?: string;
  projectId?: string;
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  if (await configExists(cwd) && !options.force) {
    console.log(chalk.yellow('Config file already exists. Use --force to overwrite.'));
    return;
  }

  const apiKey = options.apiKey || process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('Error: Linear API key is required.'));
    console.error('Provide it via --api-key or set LINEAR_API_KEY environment variable.');
    process.exit(1);
  }

  if (!options.teamId) {
    console.error(chalk.red('Error: Team ID is required.'));
    console.error('Provide it via --team-id.');
    process.exit(1);
  }

  const config: KbSyncConfig = {
    linearApiKey: apiKey,
    teamId: options.teamId,
    kbDir: options.kbDir || DEFAULT_KB_DIR,
    ...(options.projectId && { projectId: options.projectId }),
  };

  await saveConfig(config, cwd);
  await mkdir(resolve(cwd, config.kbDir), { recursive: true });

  console.log(chalk.green('Initialized kb-sync configuration.'));
  console.log(`  Config: .kb-sync.json`);
  console.log(`  KB directory: ${config.kbDir}/`);
}
