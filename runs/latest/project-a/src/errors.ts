// Module: errors -- Typed error hierarchy for kb-sync
//
// This module defines the error hierarchy used throughout the codebase.
// Every error has a `userMessage` (displayed to the user) and preserves
// the `cause` chain for debugging. Commands catch KbSyncError at the top
// level and print userMessage; unexpected errors print the stack trace.
// It implements: error-taxonomy.md, error-handling.md conventions.
// Key design decisions: single hierarchy, userMessage for UX, cause chaining.

// ---------------------------------------------------------------------------
// Base error class
// ---------------------------------------------------------------------------

/**
 * Base error for all kb-sync errors. Provides a `userMessage` field
 * for human-readable terminal output, separate from the technical `message`.
 *
 * @example
 * throw new KbSyncError(
 *   'Detailed technical info for logs',
 *   'Short actionable message for the user'
 * );
 */
export class KbSyncError extends Error {
  /** Human-readable message displayed to the user in the terminal. */
  readonly userMessage: string;

  /**
   * @param message - Technical detail for logs and debugging
   * @param userMessage - Human-readable string displayed to the user
   * @param options - Standard Error options, including `cause` for chaining
   */
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KbSyncError';
    this.userMessage = userMessage;
  }
}

// ---------------------------------------------------------------------------
// Specific error types
// ---------------------------------------------------------------------------

/**
 * Config file missing, malformed, or has invalid field values.
 * Thrown when .kb-sync.json cannot be read or validated.
 *
 * @throws When config file is missing, unparseable, or has wrong schema version
 */
export class ConfigError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'ConfigError';
  }
}

/**
 * API key missing or invalid. Never retried — a 401 means the key is wrong.
 *
 * @throws When LINEAR_API_KEY is not set or returns 401 from Linear
 */
export class AuthError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'AuthError';
  }
}

/**
 * Linear API failures: network errors, rate limits (429), server errors (5xx).
 * May be retried with exponential backoff (see linear/pagination.ts).
 *
 * @throws After all retry attempts are exhausted
 */
export class ApiError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'ApiError';
  }
}

/**
 * Local filesystem read/write failures.
 *
 * @throws When file operations fail (EACCES, ENOSPC, etc.)
 */
export class FileSystemError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'FileSystemError';
  }
}

/**
 * Sync conflict detected — both local and remote modified since last sync.
 * Used during push to signal per-issue conflicts.
 *
 * @throws When Linear's updatedAt > stored updatedAt for a locally modified file
 */
export class ConflictError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'ConflictError';
  }
}

/**
 * Invalid frontmatter, unknown status/assignee/label, out-of-range priority.
 * On push, these cause per-file skip (not command abort).
 *
 * @throws When frontmatter fields fail validation against workspace data
 */
export class ValidationError extends KbSyncError {
  constructor(message: string, userMessage: string, options?: ErrorOptions) {
    super(message, userMessage, options);
    this.name = 'ValidationError';
  }
}
