---
id: config-and-formats
domain: spec
last-updated: 2026-03-25
related: [data-model, api-contracts, prd]
---

# Config and Formats

## One-liner
Schemas and examples for every file format the tool reads or writes.

## Scope
Covers: `.kb-sync.json`, `.kb-sync-state.json`, markdown issue files, `.kb-sync-trash/`. Does NOT cover: entities in memory (see `data-model.md`).

---

## `.kb-sync.json` — User config

**Created by:** `kb-sync init`
**Committed to git:** Yes (user-facing config)

```json
{
  "version": 1,
  "kbDir": "./kb",
  "workspace": "my-company",
  "lastSyncedAt": "2026-03-25T10:30:00.000Z"
}
```

| Field          | Type      | Required | Default    | Notes                                    |
|----------------|-----------|----------|------------|------------------------------------------|
| `version`      | `number`  | Yes      | `1`        | Schema version. Only `1` supported in v1 |
| `kbDir`        | `string`  | Yes      | `"./kb"`   | Relative path from project root          |
| `workspace`    | `string`  | Yes      | (from API) | Linear workspace URL slug                |
| `lastSyncedAt` | `string?` | No       | `null`     | ISO 8601. null before first sync         |

**Validation rules:**
- `version` must be `1`.
- `kbDir` must be a valid relative path (no `..` escaping).
- `workspace` must be a non-empty string.
- If any field is missing or wrong type, throw `ConfigError` with specific details.

---

## `.kb-sync-state.json` — Internal state

**Created by:** first `pull`
**Committed to git:** No (added to `.gitignore` during `init`)

```json
{
  "issues": {
    "abc-123-uuid": {
      "updatedAt": "2026-03-25T10:00:00.000Z",
      "contentHash": "a1b2c3d4e5f6..."
    },
    "def-456-uuid": {
      "updatedAt": "2026-03-24T15:00:00.000Z",
      "contentHash": "f6e5d4c3b2a1..."
    }
  }
}
```

| Field                        | Type     | Notes                                    |
|------------------------------|----------|------------------------------------------|
| `issues`                     | `object` | Keyed by Linear issue UUID               |
| `issues[id].updatedAt`       | `string` | ISO 8601 from Linear at last sync        |
| `issues[id].contentHash`     | `string` | SHA-256 hex of file contents at last sync |

---

## Markdown issue file format

**Created by:** `pull`
**Path pattern:** `<kbDir>/<teamKey>/<identifier>-<slug>.md`

### Example: `kb/ENG/ENG-123-fix-login-bug.md`

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

Issue description body in markdown here.

Supports **all markdown** features including:
- Lists
- Code blocks
- Links
```

### Frontmatter field order
Fields MUST be written in this order: `id`, `identifier`, `title`, `status`, `priority`, `assignee`, `labels`, `team`, `project`, `url`, `createdAt`, `updatedAt`.

### Extra frontmatter fields
Users may add custom fields (e.g., `notes: "my annotation"`). These are:
- **Preserved on pull**: merged with updated Linear fields, never deleted.
- **Ignored on push**: only the standard fields listed above are read.
- **Placed after standard fields** in the output.

### Empty description
If a Linear issue has no description, the file has frontmatter only with an empty body (just the closing `---` followed by a blank line).

---

## `.kb-sync-trash/` — Soft-delete directory

**Created by:** `pull` when issues are deleted/archived on Linear.
**Cleanup:** Auto-cleaned after 30 days or on next successful full pull.

Files are moved here instead of being hard-deleted. Filename is preserved. This acts as a safety net against false deletions from incomplete fetches.

---

## `.gitignore` additions (during init)

```
.kb-sync-state.json
.kb-sync-trash/
```

## Agent notes
> The state file is the source of truth for modification detection. If it's deleted, the next pull does a full re-sync.
> Frontmatter field order is cosmetic but important for consistency and test stability.
> The `gray-matter` library handles frontmatter parsing/serialization. It preserves extra fields by default.

## Related files
- `data-model.md` — entity definitions that these formats serialize
- `api-contracts.md` — which commands read/write these files
- `../external/linear-sdk.md` — where the raw data comes from
