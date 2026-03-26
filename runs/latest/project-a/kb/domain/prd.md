---
id: prd
domain: domain
last-updated: 2026-03-25
related: [glossary, data-model, api-contracts, config-and-formats]
---

# Product Requirements Document

## One-liner
kb-sync is a CLI tool that bidirectionally syncs a local markdown knowledge base with Linear issues.

## Scope
Covers: user stories, commands, expected behavior, non-functional expectations, and scope boundaries.
Does NOT cover: technical implementation details (see `../spec/`), architecture (see `../architecture/`).

## Problem statement
Teams using Linear need a way to work with issues as local files — for offline access, git-based workflows, bulk editing, and integration with other tools. There is no existing tool that provides bidirectional markdown-to-Linear sync with conflict detection.

## User stories

**US1**: As a developer, I want to run `kb-sync init` so that I can set up syncing with my Linear workspace.
**US2**: As a developer, I want to run `kb-sync pull` so that all my Linear issues appear as local markdown files I can read and edit.
**US3**: As a developer, I want to run `kb-sync push` so that my local edits to issue fields and descriptions are reflected in Linear.
**US4**: As a developer, I want to run `kb-sync status` so that I can see what's changed locally and remotely before syncing.
**US5**: As a developer, I want conflicts detected automatically so that I don't accidentally overwrite someone else's changes.
**US6**: As a developer, I want to filter pulls by team (`--team ENG`) so that I can work with a subset of issues.

## Commands

### `kb-sync init`
Sets up the project for syncing.

**Input:** `LINEAR_API_KEY` environment variable.
**Behavior:**
1. Validates the API key by fetching viewer/organization info.
2. Creates `.kb-sync.json` with workspace slug, default `kbDir: "./kb"`, version 1.
3. Prints success message with workspace name.

**Example:**
```
$ export LINEAR_API_KEY=lin_api_xxx
$ kb-sync init
Initialized kb-sync for workspace "my-company". Config written to .kb-sync.json
```

### `kb-sync pull [--team <name>] [--force]`
Fetches Linear issues and writes them as local markdown files.

**Input:** Valid config file, `LINEAR_API_KEY`.
**Behavior:**
1. Reads config and state file.
2. If local modifications exist and `--force` not set, warn and abort.
3. Fetch issues from Linear (incremental if not first sync, full otherwise).
4. Write/update markdown files in `<kbDir>/<team-key>/<identifier>-<slug>.md`.
5. Detect deletions (if full fetch succeeded): move orphaned local files to `.kb-sync-trash/`.
6. Update state file and `lastSyncedAt`.

**Example:**
```
$ kb-sync pull
Fetching teams... (19 teams)
Fetching issues... (1,247 issues across 19 teams)
Writing files... (1,247 files)
Pull complete. 1,247 files written, 3 deleted, 0 conflicts.

$ kb-sync pull --team Engineering
Fetching issues for team Engineering... (342 issues)
Writing files... (342 files)
Pull complete. 342 files written.
```

### `kb-sync push [--dry-run] [--force] [file...]`
Pushes local modifications back to Linear.

**Input:** Valid config file, `LINEAR_API_KEY`, locally modified markdown files.
**Behavior:**
1. Reads config and state file.
2. Identifies modified files (content hash differs from state).
3. For each modified file:
   a. Parse frontmatter, validate pushable fields.
   b. Check for conflict (Linear `updatedAt` > stored `updatedAt`). If conflict and no `--force`, skip with warning.
   c. Update the Linear issue with changed fields.
4. If `--dry-run`, print what would change without mutating.
5. Update state file.

**Example:**
```
$ kb-sync push --dry-run
Would update ENG-123: title changed, status "In Progress" → "Done"
Would update ENG-456: description changed (142 chars added)
2 issues would be updated. Use `kb-sync push` to apply.

$ kb-sync push
Updated ENG-123: title, status
Updated ENG-456: description
Push complete. 2 issues updated, 0 conflicts, 0 skipped.
```

### `kb-sync status`
Shows what's changed locally and on Linear since last sync.

**Input:** Valid config file, `LINEAR_API_KEY`.
**Behavior:**
1. Compare local files against state file (detect local changes).
2. Fetch issue timestamps from Linear (detect remote changes).
3. Print categorized summary.

**Example:**
```
$ kb-sync status
Local changes:
  modified: kb/ENG/ENG-123-fix-login-bug.md
  modified: kb/ENG/ENG-456-add-search.md

Remote changes (Linear):
  modified: ENG-789 (updated 2h ago)
  new: ENG-800 (created 1h ago)

1 conflict: ENG-123 modified both locally and on Linear.
```

## Non-functional expectations

- **Performance**: Pull 500 issues in under 5 minutes. Push 10 issues in under 30 seconds.
- **Reliability**: Never silently lose data. Conflicts must be detected and reported.
- **Usability**: Clear error messages with actual cause. Progress feedback for long operations.
- **Security**: API key never in config files, logs, or error messages.
- **Compatibility**: Node.js 20+, Linux/macOS/Windows.

## Out of scope (v1)

- Creating new Linear issues from local files (too many required fields).
- Deleting Linear issues from CLI (use Linear directly).
- Real-time sync / webhooks.
- Multiple workspace support.
- Custom field mapping or plugin system.
- Issue filtering by status, label, or project.
- `--since <date>` manual override.
- JSON output mode (`--json`).

## Agent notes
> This is the "are we building the right product?" document. For "are we building it right?", see `../spec/`.
> The command behaviors here are authoritative — if code contradicts this PRD, the code is wrong.
> Cross-reference exit codes in `../spec/api-contracts.md`.

## Related files
- `../spec/api-contracts.md` — detailed inputs/outputs/error codes per command
- `../spec/config-and-formats.md` — config and file format schemas
- `../spec/data-model.md` — entity field definitions
- `../GLOSSARY.md` — term definitions
