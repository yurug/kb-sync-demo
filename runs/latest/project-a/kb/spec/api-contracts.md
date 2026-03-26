---
id: api-contracts
domain: spec
last-updated: 2026-03-25
related: [prd, algorithms, error-taxonomy, config-and-formats]
---

# API Contracts

## One-liner
Inputs, outputs, error codes, and exit codes for every CLI command.

## Scope
Covers: every CLI command's contract. Does NOT cover: algorithm details (see `algorithms.md`), config schema (see `config-and-formats.md`).

---

## Global preconditions

| Condition                    | Error if violated                                         |
|------------------------------|-----------------------------------------------------------|
| `LINEAR_API_KEY` env var set | `AuthError`: "LINEAR_API_KEY not set. Export it first."   |
| Node.js >= 20               | Handled by `engines` in package.json                      |

## Exit codes

| Code | Meaning              | When                                          |
|------|----------------------|-----------------------------------------------|
| `0`  | Success              | Command completed without errors               |
| `1`  | General error        | Config error, auth error, API error, etc.      |
| `2`  | Conflicts detected   | `push` found conflicts (some issues skipped)   |

---

## Command: `init`

**Syntax:** `kb-sync init`
**Preconditions:** `LINEAR_API_KEY` set.
**Postconditions:** `.kb-sync.json` created with valid workspace info.

| Input           | Source            | Required | Default |
|-----------------|-------------------|----------|---------|
| `LINEAR_API_KEY`| Environment       | Yes      | —       |

| Output on success                                             | Exit code |
|---------------------------------------------------------------|-----------|
| `Initialized kb-sync for workspace "<name>". Config written.` | `0`       |

| Error condition               | Error type   | Exit code |
|-------------------------------|-------------|-----------|
| API key not set               | `AuthError` | `1`       |
| API key invalid (401)         | `AuthError` | `1`       |
| `.kb-sync.json` already exists| `ConfigError`| `1`      |
| Network failure               | `ApiError`  | `1`       |

---

## Command: `pull`

**Syntax:** `kb-sync pull [--team <name>] [--force]`
**Preconditions:** `.kb-sync.json` exists, `LINEAR_API_KEY` set.
**Postconditions:** Local files reflect Linear state. State file updated.

| Flag       | Type   | Default | Effect                                    |
|------------|--------|---------|-------------------------------------------|
| `--team`   | string | (all)   | Restrict to issues from named team        |
| `--force`  | bool   | false   | Overwrite local modifications without warning |

| Output on success                                                | Exit code |
|------------------------------------------------------------------|-----------|
| `Pull complete. {N} written, {M} deleted, {C} conflicts.`       | `0`       |

| Error condition               | Error type       | Exit code |
|-------------------------------|-----------------|-----------|
| No config file                | `ConfigError`   | `1`       |
| Malformed config              | `ConfigError`   | `1`       |
| API key invalid               | `AuthError`     | `1`       |
| Team not found                | `ValidationError`| `1`      |
| Local mods without --force    | (warning, abort)| `1`       |
| Network/API failure           | `ApiError`      | `1`       |

---

## Command: `push`

**Syntax:** `kb-sync push [--dry-run] [--force] [file...]`
**Preconditions:** `.kb-sync.json` exists, `LINEAR_API_KEY` set, at least one modified file.
**Postconditions:** Linear issues updated for non-conflicting modified files. State file updated.

| Flag       | Type   | Default | Effect                                     |
|------------|--------|---------|--------------------------------------------|
| `--dry-run`| bool   | false   | Print changes without mutating Linear      |
| `--force`  | bool   | false   | Push even if conflicts detected            |
| `[file...]`| paths  | (all)   | Push specific files instead of all modified |

| Output on success                                                     | Exit code |
|-----------------------------------------------------------------------|-----------|
| `Push complete. {N} updated, {C} conflicts, {S} skipped.`            | `0` or `2`|

Exit code `2` if any conflicts were detected (even if other issues pushed successfully).

| Error condition                | Error type        | Exit code |
|--------------------------------|-------------------|-----------|
| No config file                 | `ConfigError`     | `1`       |
| No modified files              | (info message)    | `0`       |
| Invalid frontmatter in file    | `ValidationError` | (skip)    |
| Unknown status/assignee/label  | `ValidationError` | (skip)    |
| Conflict detected              | `ConflictError`   | `2`       |
| API failure on update          | `ApiError`        | `1`       |

---

## Command: `status`

**Syntax:** `kb-sync status`
**Preconditions:** `.kb-sync.json` exists, `LINEAR_API_KEY` set.
**Postconditions:** None (read-only).

| Output on success                                                 | Exit code |
|-------------------------------------------------------------------|-----------|
| Categorized summary of local/remote changes and conflicts          | `0`       |

| Error condition               | Error type   | Exit code |
|-------------------------------|-------------|-----------|
| No config file                | `ConfigError`| `1`       |
| API key invalid               | `AuthError` | `1`       |
| Network failure               | `ApiError`  | `1`       |

## Agent notes
> Exit code `2` is specifically for conflicts on push — it lets scripts distinguish "conflicts found" from "hard error."
> Per-file validation errors (bad frontmatter, unknown status) cause that file to be skipped, not the whole command to fail.
> The `--force` flag only overrides conflict detection. It does NOT skip field validation.

## Related files
- `../domain/prd.md` — user-facing command documentation
- `algorithms.md` — the implementation behind each contract
- `error-taxonomy.md` — detailed error type definitions
- `config-and-formats.md` — config and file format details
