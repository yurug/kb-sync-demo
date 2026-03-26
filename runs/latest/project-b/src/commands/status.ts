import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { createLinearClient, fetchIssues } from '../linear-client.js';
import { readIssueFiles } from '../markdown.js';
import { SyncStatus } from '../types.js';

export async function statusCommand(): Promise<void> {
  const config = await loadConfig();
  const client = createLinearClient(config.linearApiKey);
  const kbDir = resolve(process.cwd(), config.kbDir);

  const spinner = ora('Comparing local and remote state...').start();

  try {
    const [localIssues, remoteIssues] = await Promise.all([
      readIssueFiles(kbDir),
      fetchIssues(client, config.teamId, config.projectId),
    ]);

    const localById = new Map(
      localIssues.filter(i => i.frontmatter.id).map(i => [i.frontmatter.id, i])
    );
    const remoteById = new Map(remoteIssues.map(i => [i.id, i]));

    const status: SyncStatus = {
      localOnly: localIssues.filter(i => !i.frontmatter.id),
      remoteOnly: remoteIssues.filter(i => !localById.has(i.id)),
      modified: [],
      unchanged: [],
    };

    for (const local of localIssues) {
      if (!local.frontmatter.id) continue;
      const remote = remoteById.get(local.frontmatter.id);
      if (!remote) continue;

      if (local.frontmatter.updatedAt !== remote.updatedAt) {
        status.modified.push({ local, remote });
      } else {
        status.unchanged.push(local);
      }
    }

    spinner.stop();
    printStatus(status);
  } catch (error) {
    spinner.fail(chalk.red('Failed to check status'));
    if (error instanceof Error) {
      console.error(chalk.red(`  ${error.message}`));
    }
    process.exit(1);
  }
}

function printStatus(status: SyncStatus): void {
  console.log(chalk.bold('\nSync Status\n'));

  if (status.localOnly.length > 0) {
    console.log(chalk.cyan(`  New locally (${status.localOnly.length}):`));
    for (const issue of status.localOnly) {
      console.log(`    + ${issue.frontmatter.title}`);
    }
  }

  if (status.remoteOnly.length > 0) {
    console.log(chalk.yellow(`  New on Linear (${status.remoteOnly.length}):`));
    for (const issue of status.remoteOnly) {
      console.log(`    + ${issue.title}`);
    }
  }

  if (status.modified.length > 0) {
    console.log(chalk.magenta(`  Modified (${status.modified.length}):`));
    for (const { local } of status.modified) {
      console.log(`    ~ ${local.frontmatter.title}`);
    }
  }

  if (status.unchanged.length > 0) {
    console.log(chalk.dim(`  Unchanged (${status.unchanged.length})`));
  }

  const total =
    status.localOnly.length +
    status.remoteOnly.length +
    status.modified.length +
    status.unchanged.length;

  if (total === 0) {
    console.log(chalk.dim('  No issues found locally or remotely.'));
  }

  console.log();
}
