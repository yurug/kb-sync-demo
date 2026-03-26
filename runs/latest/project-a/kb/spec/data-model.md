---
id: data-model
domain: spec
last-updated: 2026-03-25
related: [algorithms, config-and-formats, glossary, linear-sdk]
---

# Data Model

## One-liner
All entities, their fields, types, constraints, and defaults — the single source of truth for data shapes.

## Scope
Covers: all data structures flowing through the system. Does NOT cover: sync algorithms (see `algorithms.md`), file format examples (see `config-and-formats.md`).

## Key concepts
- **Issue** — the core entity, mapped 1:1 between Linear and a local markdown file
- **Frontmatter** — YAML metadata in the markdown file header — see `GLOSSARY.md#frontmatter`
- **State file** — per-file sync tracking — see `GLOSSARY.md#state-file`

---

## Entity: LinearIssue (fetched from API)

Represents an issue as received from the Linear API after bulk-fetch-then-join resolution.

| Field         | Type       | Source                  | Notes                                    |
|---------------|------------|-------------------------|------------------------------------------|
| `id`          | `string`   | `issue.id`              | UUID, globally unique                    |
| `identifier`  | `string`   | `issue.identifier`      | e.g., `ENG-123`                          |
| `title`       | `string`   | `issue.title`           | Required, non-empty                      |
| `description` | `string?`  | `issue.description`     | Markdown. null if no description         |
| `priority`    | `number`   | `issue.priority`        | 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low |
| `statusName`  | `string`   | resolved from `stateId` | e.g., "In Progress"                      |
| `assigneeName`| `string?`  | resolved from `assigneeId` | Display name. null if unassigned      |
| `labelNames`  | `string[]` | resolved from label IDs | Sorted alphabetically                   |
| `teamKey`     | `string`   | resolved from `teamId`  | e.g., "ENG"                              |
| `teamName`    | `string`   | resolved from `teamId`  | e.g., "Engineering"                      |
| `projectName` | `string?`  | resolved from `projectId` | null if not in a project               |
| `url`         | `string`   | `issue.url`             | Full Linear URL                          |
| `createdAt`   | `string`   | `issue.createdAt`       | ISO 8601                                 |
| `updatedAt`   | `string`   | `issue.updatedAt`       | ISO 8601                                 |

**Constraints:**
- `id` is immutable and globally unique across the workspace.
- `identifier` is unique within the workspace and immutable.
- `priority` is always 0–4 inclusive.
- All "resolved from" fields use the bulk-fetch-then-join pattern (see `../external/linear-sdk.md`).

---

## Entity: MarkdownIssue (local file)

Represents an issue as parsed from a local markdown file.

| Field         | Type       | Frontmatter key | Pushable? | Notes                             |
|---------------|------------|-----------------|-----------|-----------------------------------|
| `id`          | `string`   | `id`            | No        | Used to match with Linear issue   |
| `identifier`  | `string`   | `identifier`    | No        | Read-only, for display/filenames  |
| `title`       | `string`   | `title`         | **Yes**   |                                   |
| `status`      | `string`   | `status`        | **Yes**   | Must match a valid workflow state |
| `priority`    | `number`   | `priority`      | **Yes**   | 0–4                               |
| `assignee`    | `string?`  | `assignee`      | **Yes**   | Display name                      |
| `labels`      | `string[]` | `labels`        | **Yes**   | Array of label names              |
| `team`        | `string`   | `team`          | No        | Team display name                 |
| `project`     | `string?`  | `project`       | **Yes**   | Project name                      |
| `url`         | `string`   | `url`           | No        | Linear URL                        |
| `createdAt`   | `string`   | `createdAt`     | No        | ISO 8601                          |
| `updatedAt`   | `string`   | `updatedAt`     | No        | ISO 8601                          |
| `body`        | `string`   | (markdown body) | **Yes**   | Everything below frontmatter      |

**Extra frontmatter fields:** Any fields not listed above are preserved on pull (merged, not replaced). They are ignored on push.

**Frontmatter field order:** `id`, `identifier`, `title`, `status`, `priority`, `assignee`, `labels`, `team`, `project`, `url`, `createdAt`, `updatedAt`.

---

## Entity: SyncState (per-file tracking)

Stored in `.kb-sync-state.json`, keyed by issue `id`.

| Field         | Type     | Notes                                         |
|---------------|----------|-----------------------------------------------|
| `updatedAt`   | `string` | ISO 8601 — Linear's `updatedAt` at last sync  |
| `contentHash` | `string` | SHA-256 hex of file contents at last sync      |

**Local modification detection:** `currentHash !== state[id].contentHash`
**Conflict detection:** `linear.updatedAt > state[id].updatedAt`

---

## Entity: Config

Stored in `.kb-sync.json`.

| Field          | Type     | Default        | Notes                              |
|----------------|----------|----------------|------------------------------------|
| `version`      | `number` | `1`            | Schema version for future migration|
| `kbDir`        | `string` | `"./kb"`       | Relative path to KB directory      |
| `workspace`    | `string` | (from API)     | Linear workspace slug              |
| `lastSyncedAt` | `string?`| `null`         | ISO 8601, null before first sync   |

---

## File path mapping

**Pattern:** `<kbDir>/<teamKey>/<identifier>-<slugifiedTitle>.md`
**Example:** `kb/ENG/ENG-123-fix-login-bug.md`

**Slugification rules:**
1. Lowercase the title
2. Replace non-alphanumeric characters with hyphens
3. Collapse consecutive hyphens
4. Trim to 80 characters
5. Remove trailing hyphens

**Uniqueness:** The identifier prefix guarantees uniqueness. If two different teams have the same identifier number (extremely rare), append a short hash of the UUID.

## Agent notes
> When implementing the mapper, the field order in frontmatter output matters — maintain the canonical order listed above.
> The `pushable` column is critical: on push, only read pushable fields. Silently ignore read-only fields.
> When resolving names from IDs (bulk-fetch-then-join), handle the case where an ID has no match (e.g., deleted user). Use `null` / `"Unknown"`.

## Related files
- `algorithms.md` — how these entities flow through sync
- `config-and-formats.md` — serialized formats with examples
- `../external/linear-sdk.md` — how to fetch LinearIssue fields efficiently
- `../GLOSSARY.md` — term definitions
