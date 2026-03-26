// Module: progress -- Spinner-based progress feedback for long operations
//
// This module wraps the `ora` spinner library to provide consistent progress
// feedback for operations that take more than 2 seconds. Users always know
// what the tool is doing — a silent CLI feels like a hang.
// It implements: NF6 (progress feedback for operations > 2s).
// Key design decisions: thin wrapper over ora, supports both interactive
// and non-interactive terminals (graceful fallback).

import ora from 'ora';
import type { Ora } from 'ora';

/**
 * Progress reporter that shows a terminal spinner with status messages.
 * Wraps ora for consistent progress feedback across all commands.
 *
 * @invariant NF6 — any operation > 2s shows a progress indicator
 * @example
 * const progress = createProgress('Fetching issues...');
 * progress.update('Fetched 50 of 200...');
 * progress.succeed('Fetched 200 issues.');
 */
export interface ProgressReporter {
  /** Update the spinner text to show current status. */
  update(text: string): void;
  /** Stop the spinner with a success message. */
  succeed(text: string): void;
  /** Stop the spinner with a failure message. */
  fail(text: string): void;
  /** Stop the spinner without any message. */
  stop(): void;
}

/**
 * Create a terminal spinner with the given initial message.
 * The spinner starts immediately and persists until stopped.
 *
 * @param text - Initial spinner message (e.g., "Fetching issues...")
 * @returns ProgressReporter for updating and stopping the spinner
 * @invariant NF6 — provides visual feedback for long operations
 */
export function createProgress(text: string): ProgressReporter {
  const spinner: Ora = ora({ text, spinner: 'dots' }).start();

  return {
    update(newText: string): void {
      spinner.text = newText;
    },
    succeed(msg: string): void {
      spinner.succeed(msg);
    },
    fail(msg: string): void {
      spinner.fail(msg);
    },
    stop(): void {
      spinner.stop();
    },
  };
}

/**
 * Create a no-op progress reporter for non-interactive or test contexts.
 * All methods are stubs — no terminal output.
 *
 * @returns Silent ProgressReporter
 */
export function createSilentProgress(): ProgressReporter {
  return {
    update(): void { /* no-op */ },
    succeed(): void { /* no-op */ },
    fail(): void { /* no-op */ },
    stop(): void { /* no-op */ },
  };
}
