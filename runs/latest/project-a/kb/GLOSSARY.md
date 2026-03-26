---
id: glossary
domain: meta
last-updated: 2026-03-25
related: [kb-index]
---

# Glossary

## One-liner
Canonical definitions for every domain term used across the KB.

## Terms

- **kb-sync**: The CLI tool this project implements. Syncs markdown files with Linear issues.

- **Knowledge base (KB)**: The local directory of markdown files, one per Linear issue. Default path: `./kb`.

- **Linear**: Project management tool (linear.app). The remote source of truth for issues.

- **Frontmatter**: YAML metadata block at the top of a markdown file, delimited by `---`. Parsed by `gray-matter`. Contains issue fields like `id`, `title`, `status`.

- **Issue**: A Linear work item. Mapped 1:1 to a local markdown file.

- **Identifier**: Linear's human-readable issue key, e.g., `ENG-123`. Composed of team key + sequence number. Used in filenames.

- **Team key**: The short prefix for a Linear team (e.g., `ENG`, `DES`). Used as subdirectory name and identifier prefix.

- **Workspace**: A Linear organization. One API key = one workspace. Stored as `workspace` slug in config.

- **Sync**: The process of reconciling local markdown files with Linear issue state. Can be `pull` (Linear → local) or `push` (local → Linear).

- **Pull**: Fetch issues from Linear and write/update local markdown files. Linear is authoritative.

- **Push**: Read local markdown files and update corresponding Linear issues. Local is authoritative (for pushable fields).

- **Conflict**: When both local and remote have changed since last sync. Detected by comparing `updatedAt` timestamps. Blocks push unless `--force`.

- **Last-write-wins**: The sync strategy. On push, if Linear's `updatedAt` > stored `updatedAt`, a conflict is raised. On pull, Linear always wins.

- **Incremental sync**: Fetching only issues updated since `lastSyncedAt` rather than all issues. Used after the first full sync.

- **Full sync**: Fetching all issues from Linear. Happens on first pull or when state file is deleted.

- **State file**: `.kb-sync-state.json` — gitignored file mapping issue ID → `{ updatedAt, contentHash }`. Tracks per-file sync state.

- **Content hash**: SHA-256 hash of a markdown file's contents at last sync. Used to detect local modifications.

- **Config file**: `.kb-sync.json` — user-facing configuration. Contains `version`, `kbDir`, `workspace`, `lastSyncedAt`.

- **Bulk-fetch-then-join**: Pattern for minimizing API calls. Fetch all teams, users, labels, states, projects in separate bulk queries, then resolve references locally by ID instead of lazy-loading per issue.

- **Lazy-loading**: Linear SDK behavior where accessing relation fields (`.team`, `.assignee`, `.labels()`) triggers hidden API calls. Must be avoided — use bulk-fetch-then-join instead.

- **Rate limit**: Linear allows ~1500 requests/hour. The client must serialize requests and use exponential backoff on 429s.

- **Cursor-based pagination**: Linear's pagination model (Relay-style). Uses `pageInfo.hasNextPage` and `pageInfo.endCursor` to iterate.

- **Slugify**: Convert a string to a filesystem-safe format: lowercase, non-alphanumeric → hyphens, collapse consecutive hyphens, trim to 80 chars.

- **Pushable fields**: Fields that `push` writes back to Linear: `title`, `status`, `priority`, `assignee`, `labels`, `project`, and markdown body (description).

- **Read-only fields**: Frontmatter fields ignored on push: `id`, `identifier`, `url`, `createdAt`, `updatedAt`, `team`.

- **Trash directory**: `.kb-sync-trash/` — soft-delete destination for files removed during pull. Auto-cleaned after 30 days or next successful full pull.

- **Dry run**: `push --dry-run` — print what would change without making mutations. Pull has no dry-run (local writes are reversible via git).

- **DI (Dependency Injection)**: Architecture pattern used throughout. Pass interfaces as parameters, not concrete implementations. Enables testability.

## Agent notes
> This glossary is referenced from nearly every KB file. If you add a new domain term in any file, add it here too.

## Related files
- `kb/INDEX.md` — master entry point
- `kb/spec/data-model.md` — detailed field definitions
- `kb/external/linear-sdk.md` — Linear-specific terminology in context
