---
id: error-taxonomy
domain: spec
last-updated: 2026-03-26
related: [api-contracts, error-handling-conv, algorithms]
---

# Error Taxonomy

## One-liner
Every error type in the system: when it fires, what it says, and how it's handled.

## Scope
Covers: the full error hierarchy, trigger conditions, user messages. Does NOT cover: how to propagate errors in code (see `../conventions/error-handling.md`).

---

## Error hierarchy

```
KbSyncError (base)
├── ConfigError      — config file missing, malformed, or invalid
├── AuthError        — API key missing or invalid
├── ApiError         — Linear API failures (network, rate limit, server error)
├── FileSystemError  — local file read/write failures
├── ConflictError    — sync conflict detected
└── ValidationError  — invalid frontmatter, unknown status/assignee/label
```

All errors extend `KbSyncError`, which has:
- `message`: technical detail (for logs/developers)
- `userMessage`: human-readable string (displayed to the user)
- `cause`: the original error (if wrapping)

---

## Error types

### ConfigError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| `.kb-sync.json` not found        | `No .kb-sync.json found. Run 'kb-sync init' first.`                     |
| `.kb-sync.json` parse failure    | `Failed to parse .kb-sync.json: Unexpected token at position 42`         |
| Missing required field           | `.kb-sync.json is invalid: missing required field 'workspace'`           |
| Invalid version                  | `.kb-sync.json has unsupported version 2 (expected 1)`                   |
| Config already exists (on init)  | `.kb-sync.json already exists. Delete it first to re-initialize.`        |

### AuthError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| `LINEAR_API_KEY` not set         | `LINEAR_API_KEY environment variable is not set. Export it and try again.`|
| API key invalid (401)            | `Linear API key is invalid or expired. Check your LINEAR_API_KEY.`       |

**Note:** Auth errors are NEVER retried. A 401 means the key is wrong, not a transient failure.

### ApiError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| Network timeout                  | `Linear API request timed out after 30s. Check your network connection.` |
| Rate limited (429)               | `Linear API rate limit hit. Retrying in {N}s... (attempt {M}/5)`         |
| Server error (500+)              | `Linear API returned 500: Internal Server Error. Retrying...`            |
| All retries exhausted            | `Linear API failed after 5 retries. Last error: {actual error message}`  |
| Team not found                   | `Team 'Enginering' not found. Available teams: Engineering, Design, ...` |

**Retry policy:** 5 retries with exponential backoff (2s, 4s, 8s, 16s, 32s). Only for 429 and 5xx errors. Never retry 4xx (except 429).

### FileSystemError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| Cannot read file                 | `Failed to read kb/ENG/ENG-123-fix-login.md: EACCES permission denied`   |
| Cannot write file                | `Failed to write kb/ENG/ENG-123-fix-login.md: ENOSPC no space left`      |
| Cannot create directory          | `Failed to create directory kb/ENG: EACCES permission denied`            |

### ConflictError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| Push conflict                    | `Conflict: ENG-123 was modified on Linear since last sync (Linear: 2h ago, local: 5h ago). Pull first or use --force.` |
| Local modification on pull       | `{N} files modified locally since last sync. Use --force to overwrite.`  |

### ValidationError

| Trigger                          | userMessage example                                                      |
|----------------------------------|--------------------------------------------------------------------------|
| Missing `id` in frontmatter      | `Skipping kb/ENG/ENG-123.md: missing required field 'id'`               |
| Unknown status name              | `Skipping ENG-123: unknown status 'Donee' (valid: Todo, In Progress, Done, Cancelled)` |
| Ambiguous assignee               | `Skipping ENG-123: assignee 'John' matches multiple users (John Doe, John Smith)` |
| Unknown label                    | `Skipping ENG-123: unknown label 'urgnt' (did you mean 'urgent'?)`       |
| Invalid priority                 | `Skipping ENG-123: priority must be 0-4, got 5`                         |
| Invalid UUID format              | `Invalid ID format for issueId. Expected a UUID.`                        |

---

## Error message rules

1. **Always include the actual cause** — never wrap with a generic message.
2. **Include the file path or identifier** — so the user knows which issue/file.
3. **Suggest the fix** — "Run init first", "Pull first", "Use --force".
4. **Never expose the API key** — not in messages, not in logs.
5. **Include valid alternatives** when a value doesn't match — show the list of valid options.

## Agent notes
> Every error type must have a dedicated test verifying the `userMessage` is correct.
> The `cause` chain must be preserved — use `new ConfigError("...", { cause: originalError })`.
> ValidationErrors on push cause per-file skip, not command abort. The command continues with remaining files.

## Related files
- `../conventions/error-handling.md` — how to throw, catch, and propagate these errors
- `api-contracts.md` — which errors map to which exit codes
- `algorithms.md` — where in the flow each error occurs
