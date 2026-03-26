---
id: error-handling-conv
domain: conventions
last-updated: 2026-03-25
related: [error-taxonomy, code-style, api-contracts]
---

# Error Handling Conventions

## One-liner
How to throw, catch, propagate, and display errors throughout the codebase.

## Scope
Covers: error creation patterns, propagation rules, display rules. Does NOT cover: specific error types and triggers (see `../spec/error-taxonomy.md`).

---

## Creating errors

Always use the typed error hierarchy. Never throw raw `Error`.

```typescript
// Good: typed error with userMessage and cause
throw new ApiError(
  `Linear API returned ${response.status}`,           // technical message
  `Linear API failed: ${response.statusText}. Check your connection.`,  // userMessage
  { cause: originalError }                              // preserve the chain
);

// Bad: generic error
throw new Error('API failed');
```

## Rules

1. **Always include `userMessage`** — this is what the user sees. Make it actionable.
2. **Always chain `cause`** — this preserves the error chain for debugging.
3. **Never expose the API key** in any error message, log, or output.
4. **Include identifiers** — file path, issue identifier, team name — so the user knows *which* thing failed.
5. **Suggest the fix** when possible: "Run init first", "Pull first", "Check your LINEAR_API_KEY".

## Propagation rules

| Layer        | Catches                | Does what                                   |
|--------------|------------------------|---------------------------------------------|
| `commands/*` | `KbSyncError`          | Print `error.userMessage`, set exit code    |
| `commands/*` | Unknown errors         | Print `error.message` + stack trace, exit 1 |
| `core/*`     | External errors        | Wrap in typed `KbSyncError`, re-throw       |
| `linear/*`   | SDK/network errors     | Wrap in `ApiError` or `AuthError`, re-throw |
| `fs/*`       | Node.js fs errors      | Wrap in `FileSystemError`, re-throw         |

**Key principle:** Errors are thrown at the point of failure and propagate up unchanged. Only `commands/*` catches them for display. Intermediate layers wrap external errors into typed ones but don't catch-and-swallow.

## Per-file error handling (push/pull)

When processing multiple files, a single file's error should not abort the whole operation:

```typescript
for (const file of files) {
  try {
    await processFile(file);
  } catch (error) {
    if (error instanceof ValidationError) {
      warn(error.userMessage);  // skip this file, continue
      skipped++;
    } else {
      throw error;  // re-throw non-validation errors (ApiError, etc.)
    }
  }
}
```

## Exit code mapping

```typescript
// In command handler
try {
  await execute();
  process.exitCode = 0;
} catch (error) {
  if (error instanceof ConflictError) {
    process.exitCode = 2;
  } else if (error instanceof KbSyncError) {
    console.error(error.userMessage);
    process.exitCode = 1;
  } else {
    console.error('Unexpected error:', error);
    process.exitCode = 1;
  }
}
```

## Retry pattern (API calls)

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s, 16s, 32s
      await sleep(delay);
    }
  }
}

function isRetryable(error: unknown): boolean {
  // Retry 429 and 5xx. Never retry 4xx (except 429).
  return is429(error) || is5xx(error) || isNetworkError(error);
}
```

## Agent notes
> The `userMessage` vs `message` distinction is critical. `message` is for logs; `userMessage` is for the terminal.
> Never catch-and-swallow. If you catch, either wrap+rethrow or explicitly handle.
> The retry pattern lives in `src/linear/pagination.ts` alongside the pagination logic.

## Related files
- `../spec/error-taxonomy.md` — every error type with trigger conditions and messages
- `../spec/api-contracts.md` — exit code definitions per command
- `code-style.md` — general code conventions
