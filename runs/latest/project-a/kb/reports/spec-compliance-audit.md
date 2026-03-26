---
id: spec-compliance-audit
domain: reports
last-updated: 2026-03-25
related: [algorithms, api-contracts, data-model, functional-props]
---

# Spec Compliance Audit Report

## One-liner
Feature-by-feature verification of implementation against the specification.

---

## Data Model Compliance

### SPEC-1: LinearIssue fields match data-model.md [PASS]
All 14 fields defined in the spec are present in `src/types.ts:64-79`.

### SPEC-2: MarkdownIssue fields match data-model.md [PASS]
All 13 fields plus `extraFields` are present in `src/types.ts:92-108`.

### SPEC-3: SyncState structure matches spec [PASS]
`issues: Record<string, SyncStateEntry>` with `updatedAt` and `contentHash` per entry.

### SPEC-4: Config fields match config-and-formats.md [PASS]
`version`, `kbDir`, `workspace`, `lastSyncedAt` all present and validated.

---

## Algorithm Compliance

### SPEC-5: Pull algorithm matches spec pseudocode [PASS with issues]

- Step 1 (local mod detection): Implemented correctly.
- Step 2 (sync mode): Implemented correctly.
- Step 3 (reference data + team filter): Implemented correctly.
- Step 4 (fetch issues): Implemented correctly.
- Step 5 (write files): Implemented correctly, with ID-based matching and extra field preservation.
- Step 6 (deletion detection): **Issue** - deletion detection does not clean up state entries for deleted files. The spec says `removeFromState(stateFile, file.id)` but `detectAndTrashDeleted` doesn't update state.
- Step 7 (update config): Implemented correctly.

**SPEC-5a: Deletion detection does not clean state entries [HIGH]**
**Location:** `src/commands/pull-helpers.ts:59-90`, `src/commands/pull.ts:145-152`
**Description:** When files are moved to trash, their entries remain in the state file. This means they'll show up as "deleted locally" in status, and over time the state file accumulates stale entries.
**Fix:** Return deleted issue IDs from `detectAndTrashDeleted`, remove them from state in pull.ts.

### SPEC-6: Push algorithm matches spec pseudocode [PASS]
All 5 steps implemented correctly. Conflict detection, validation, per-file error handling all present.

### SPEC-7: Status algorithm matches spec pseudocode [PASS with issues]
Local change detection is correct. Remote change detection uses full fetch instead of lightweight query (see PERF-1).

### SPEC-8: Init algorithm matches spec pseudocode [PASS]
Validates API key, fetches org, creates config, updates .gitignore.

---

## Error Taxonomy Compliance

### SPEC-9: All 6 error types implemented [PASS]
KbSyncError, ConfigError, AuthError, ApiError, FileSystemError, ConflictError, ValidationError - all present in `src/errors.ts`.

### SPEC-10: Error messages match spec examples [PASS]
Checked all error types - messages match the patterns in error-taxonomy.md.

---

## Property Compliance

### SPEC-11: P1 (roundtrip fidelity) [PASS with issue]
Mapping is correct but YAML serialization has a quoting bug (SEC-6) that breaks roundtrip for values containing double quotes.

### SPEC-12: P2 (no silent data loss) [PASS]
Local mod detection, --force gating, soft delete to trash all implemented.

### SPEC-13: P3 (config as source of truth) [PASS]
All commands read config from disk. No hidden state.

### SPEC-14: P4 (extra frontmatter preservation) [PASS]
Extra fields extracted in reader, preserved in pull, serialized in writer.

### SPEC-15: P5 (ID-based matching) [PASS]
Scanner builds id->path index. Pull and push both use this.

### SPEC-16: P6 (conflict detection) [PASS]
Push checks remote updatedAt vs stored updatedAt.

### SPEC-17: P7 (pushable vs read-only fields) [PASS]
push-mapper.ts only includes title, description, stateId, priority, assigneeId, labelIds, projectId.

### SPEC-18: P8 (field validation before push) [PASS]
Status, assignee (with T5 collision), labels, project, priority all validated.

### SPEC-19: P9 (incremental sync) [PASS]
Uses `since` parameter with `lastSyncedAt` for incremental fetches.

### SPEC-20: P10 (deletion safety) [PASS]
Gated on `fetchWasComplete` flag from paginator.

---

## Product Behavior Requirements

### SPEC-21: Config format is JSON (.kb-sync.json) [PASS]

### SPEC-22: Init is simple (no team selection) [PASS]

### SPEC-23: Pull fetches ALL issues from ALL teams [PASS]

### SPEC-24: Error messages include real cause [PASS]

### SPEC-25: Build produces executable [PASS]
package.json has `"build": "tsc && chmod +x dist/index.js"`.

### SPEC-26: Shebang in index.ts [PASS]
`#!/usr/bin/env node` is line 1.

---

## Summary

| ID      | Severity | Status      |
|---------|----------|-------------|
| SPEC-5a | HIGH     | TO FIX      |
| SPEC-11 | HIGH     | TO FIX (via SEC-6) |
| All others | -    | PASS        |
