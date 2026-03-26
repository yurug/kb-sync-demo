---
id: user-manual
domain: runbooks
last-updated: 2026-03-26
related: [prd, api-contracts, config-and-formats, error-taxonomy]
---

# kb-sync User Manual

## One-liner
Complete guide to installing, configuring, and using kb-sync for bidirectional markdown-to-Linear sync.

## Scope
Covers: installation, configuration, all CLI commands, file formats, troubleshooting.
Does NOT cover: internal architecture (see `../architecture/overview.md`), contribution guide.

---

## Installation

### Prerequisites
- Node.js 20 or later
- A Linear account with an API key

### Install from source

```bash
git clone <repo-url> && cd kb-sync
npm install && npm run build
npm link  # makes 'kb-sync' available globally
```

### Get your Linear API key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Create a new personal API key
3. Export it in your shell:

```bash
export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Add it to your shell profile (`~/.zshrc`, `~/.bashrc`) to persist across sessions.

> **Security:** Never commit your API key to git or put it in config files.

---

## Quick Start

```bash
# 1. Export your API key
export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 2. Initialize kb-sync in your project
kb-sync init

# 3. Pull all issues from Linear
kb-sync pull

# 4. Edit an issue locally
$EDITOR kb/ENG/ENG-123-fix-login-bug.md

# 5. Push your changes back to Linear
kb-sync push
```

That's it. Your local markdown files are now synced with Linear.

---

## Commands

### `kb-sync init`

Initialize kb-sync in the current directory. Validates your API key and creates a config file.

**Usage:**
```
kb-sync init
```

Validates your API key, creates `.kb-sync.json`, and updates `.gitignore`.

**Example:**
```bash
$ export LINEAR_API_KEY=lin_api_xxx
$ kb-sync init
Initialized kb-sync for workspace "my-company". Config written to .kb-sync.json
```

**Exit codes:** `0` success, `1` error (key invalid, config already exists)

---

### `kb-sync pull [--team <name>] [--force]`

Fetch issues from Linear and write them as local markdown files.

**Usage:**
```
kb-sync pull
kb-sync pull --team Engineering
kb-sync pull --force
```

**Options:**

| Flag              | Description                                      |
|-------------------|--------------------------------------------------|
| `--team <name>`   | Only fetch issues from the named team             |
| `--force`         | Overwrite local modifications without warning     |

Fetches issues from Linear, writes markdown files to `<kbDir>/<team>/<id>-<slug>.md`, moves deleted issues to `.kb-sync-trash/`, and updates the state file.

**Examples:**
```bash
# Pull all issues from all teams
$ kb-sync pull
Pull complete. 1,247 files written, 3 deleted, 0 conflicts.

# Pull only one team
$ kb-sync pull --team Engineering
Pull complete. 342 files written.

# Overwrite local edits
$ kb-sync pull --force
Pull complete. 342 files written.
```

**Exit codes:** `0` success, `1` error

---

### `kb-sync push [--dry-run] [--force] [file...]`

Push local changes back to Linear.

**Usage:**
```
kb-sync push
kb-sync push --dry-run
kb-sync push --force
kb-sync push kb/ENG/ENG-123-fix-login-bug.md
```

**Options:**

| Flag           | Description                                        |
|----------------|----------------------------------------------------|
| `--dry-run`    | Show what would change without updating Linear      |
| `--force`      | Push even if conflicts are detected                 |
| `[file...]`    | Push only specific files (default: all modified)    |

Detects changed files, checks for conflicts, and updates Linear issues. Pushable fields: `title`, `status`, `priority`, `assignee`, `labels`, `project`, and description body. Files with validation errors are skipped (not aborted).

**Examples:**
```bash
# Preview changes
$ kb-sync push --dry-run
Would update ENG-123: title changed, status "In Progress" → "Done"
Would update ENG-456: description changed (142 chars added)
2 issues would be updated. Use `kb-sync push` to apply.

# Push all changes
$ kb-sync push
Push complete. 2 updated, 0 conflicts, 0 skipped.

# Push a single file
$ kb-sync push kb/ENG/ENG-123-fix-login-bug.md
Push complete. 1 updated, 0 conflicts, 0 skipped.
```

**Exit codes:** `0` success, `1` error, `2` conflicts detected

---

### `kb-sync status`

Show local and remote changes since the last sync. Read-only — changes nothing.

**Usage:**
```
kb-sync status
```

**Example:**
```bash
$ kb-sync status
Local changes:
  modified: kb/ENG/ENG-123-fix-login-bug.md
  modified: kb/ENG/ENG-456-add-search.md

Remote changes (Linear):
  modified: ENG-789 (updated 2h ago)
  new: ENG-800 (created 1h ago)

1 conflict: ENG-123 modified both locally and on Linear.
```

**Exit codes:** `0` success, `1` error

---

## Configuration

### `.kb-sync.json`

Created by `kb-sync init`. Commit this file to git.

```json
{
  "version": 1,
  "kbDir": "./kb",
  "workspace": "my-company",
  "lastSyncedAt": "2026-03-25T10:30:00.000Z"
}
```

| Field          | Type     | Default    | Description                           |
|----------------|----------|------------|---------------------------------------|
| `version`      | number   | `1`        | Config schema version                 |
| `kbDir`        | string   | `"./kb"`   | Directory for markdown files          |
| `workspace`    | string   | (from API) | Linear workspace slug                 |
| `lastSyncedAt` | string?  | `null`     | ISO 8601 timestamp of last sync       |

### Environment variables

| Variable          | Required | Description                          |
|-------------------|----------|--------------------------------------|
| `LINEAR_API_KEY`  | Yes      | Linear personal API key              |

### Markdown file format

Each issue is stored as a markdown file with YAML frontmatter:

```markdown
---
id: "abc-123-uuid"
identifier: "ENG-123"
title: "Fix login bug"
status: "In Progress"
priority: 2
assignee: "Alice Smith"
labels: ["bug", "urgent"]
team: "Engineering"
project: "Q1 Sprint"
url: "https://linear.app/my-company/issue/ENG-123"
createdAt: "2026-03-20T09:00:00.000Z"
updatedAt: "2026-03-25T10:00:00.000Z"
---

Issue description in markdown here.
```

Files are stored at: `<kbDir>/<team-key>/<identifier>-<slug>.md`

You can add custom frontmatter fields (e.g., `notes: "my annotation"`) — they are preserved on pull and ignored on push.

---

## Troubleshooting

| Error message | Solution |
|---|---|
| `LINEAR_API_KEY environment variable is not set` | `export LINEAR_API_KEY=lin_api_xxx` |
| `No .kb-sync.json found` | Run `kb-sync init` first |
| `Linear API key is invalid or expired` | Generate a new key at Linear Settings > API |
| `Team 'Enginering' not found` | Check spelling; the error lists available teams |
| `N files modified locally since last sync` | Push first (`kb-sync push`) or use `--force` |
| `Conflict: ENG-123 modified on Linear since last sync` | Pull first or use `kb-sync push --force` |
| `Linear API rate limit hit` | Automatic retry (5x with backoff); wait and retry if exhausted |
| Build fails | `npm run build` or use `npx tsx src/index.ts <command>` |

---

## Related files
- `../domain/prd.md` — product requirements
- `../spec/api-contracts.md` — detailed command contracts
- `../spec/config-and-formats.md` — config and file format schemas
- `../spec/error-taxonomy.md` — full error reference
