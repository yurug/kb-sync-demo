import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { createLinearClient, createIssue, updateIssue } from '../linear-client.js';
import { readIssueFiles } from '../markdown.js';

export async function pushCommand(): Promise<void> {
  const config = await loadConfig();
  const client = createLinearClient(config.linearApiKey);
  const kbDir = resolve(process.cwd(), config.kbDir);

  const spinner = ora('Reading local issues...').start();

  try {
    const localIssues = await readIssueFiles(kbDir);

    if (localIssues.length === 0) {
      spinner.info('No local issues found.');
      return;
    }

    let created = 0;
    let updated = 0;

    for (const local of localIssues) {
      const { frontmatter, content } = local;

      if (frontmatter.id) {
        spinner.text = `Updating: ${frontmatter.title}`;
        await updateIssue(client, frontmatter.id, {
          title: frontmatter.title,
          description: content,
          priority: frontmatter.priority,
        });
        updated++;
      } else {
        spinner.text = `Creating: ${frontmatter.title}`;
        await createIssue(
          client,
          config.teamId,
          frontmatter.title,
          content,
          frontmatter.priority,
        );
        created++;
      }
    }

    spinner.succeed(
      chalk.green(`Push complete: ${created} created, ${updated} updated`)
    );
  } catch (error) {
    spinner.fail(chalk.red('Failed to push issues'));
    if (error instanceof Error) {
      console.error(chalk.red(`  ${error.message}`));
    }
    process.exit(1);
  }
}
