// Module: status-formatter -- Output formatting for the status command
//
// This module handles the console output formatting for the status command.
// Extracted from status.ts to keep files under 200 lines.
// Key design decisions: chalk for colors, truncation after 10 items to
// avoid overwhelming the terminal.

import chalk from 'chalk';

/**
 * A categorized group of changes with a label and color.
 */
export interface SectionEntry {
  /** Display label for this category (e.g., "Modified") */
  label: string;
  /** Items in this category (file paths or identifiers) */
  items: string[];
  /** Chalk color function for this category */
  color: (text: string) => string;
}

/**
 * Print a categorized section of changes to the console.
 * Shows up to 10 items per category, summarizing the rest.
 *
 * @param title - Section heading (e.g., "Local changes")
 * @param entries - Array of categorized change groups
 * @returns void — outputs directly to console
 */
export function printSection(title: string, entries: SectionEntry[]): void {
  console.log(`\n${chalk.bold(title)}:`);
  let anyChanges = false;

  for (const { label, items, color } of entries) {
    if (items.length > 0) {
      anyChanges = true;
      console.log(`  ${color(`${label} (${items.length})`)}:`);
      // Show first 10 items to avoid flooding the terminal
      const shown = items.slice(0, 10);
      for (const item of shown) {
        console.log(`    ${item}`);
      }
      // Summarize remaining items if there are more than 10
      if (items.length > 10) {
        console.log(chalk.dim(`    ... and ${items.length - 10} more`));
      }
    }
  }

  if (!anyChanges) {
    console.log(chalk.dim('  No changes.'));
  }
}
