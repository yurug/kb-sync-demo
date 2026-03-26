import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { createLinearClient, fetchIssues } from '../linear-client.js';
import { writeIssueFile } from '../markdown.js';

export async function pullCommand(): Promise<void> {
  const config = await loadConfig();
  const client = createLinearClient(config.linearApiKey);
  const kbDir = resolve(process.cwd(), config.kbDir);

  const spinner = ora('Fetching issues from Linear...').start();

  try {
    const issues = await fetchIssues(client, config.teamId, config.projectId);
    spinner.text = `Writing ${issues.length} issues to ${config.kbDir}/...`;

    for (const issue of issues) {
      await writeIssueFile(kbDir, issue);
    }

    spinner.succeed(chalk.green(`Pulled ${issues.length} issues to ${config.kbDir}/`));
  } catch (error) {
    spinner.fail(chalk.red('Failed to pull issues'));
    if (error instanceof Error) {
      console.error(chalk.red(`  ${error.message}`));
    }
    process.exit(1);
  }
}
