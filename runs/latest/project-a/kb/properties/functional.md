---
id: functional-props
domain: properties
last-updated: 2026-03-25
related: [non-functional-props, edge-cases, algorithms, data-model]
---

# Functional Properties

## One-liner
Invariants that must hold at all times — violations are bugs.

## Scope
Covers: correctness invariants for data, sync, and CLI behavior. Does NOT cover: performance/security (see `non-functional.md`), boundary conditions (see `edge-cases.md`).

---

### P1: Frontmatter-Linear roundtrip fidelity

**Statement:** For any Linear issue, `pull` → `push` (with no local edits) produces zero mutations on Linear. The local file is a faithful representation of the Linear issue.

**Violation example:** Pull writes `priority: "2"` (string) instead of `priority: 2` (number). Push then sends a string to Linear, causing a type error or silent data corruption.

**Why:** Roundtrip fidelity is the foundation of bidirectional sync. Without it, every pull-push cycle introduces drift.

**Test strategy:** Property-based test: generate random valid issues, pull → push → verify no API calls made.

---

### P2: No silent data loss

**Statement:** The tool never deletes or overwrites data without either (a) the user's explicit consent (`--force`) or (b) a clear warning message.

**Violation example:** `pull` silently overwrites a locally modified file without warning or `--force`.

**Why:** Users trust kb-sync with their data. Silent loss erodes trust and can't be undone.

**Test strategy:**
- Test that `pull` with local mods (no `--force`) aborts with warning.
- Test that deletion only happens after complete fetch (no partial-fetch false deletions).
- Test that deleted files go to `.kb-sync-trash/`, not hard-deleted.

---

### P3: Config is the single source of truth for project settings

**Statement:** All sync behavior is determined by `.kb-sync.json` (config) and `.kb-sync-state.json` (state). No hidden state elsewhere.

**Violation example:** The tool caches the workspace slug in memory across runs, ignoring a config file change.

**Why:** Reproducibility — given the same config and state files, the tool behaves identically.

**Test strategy:** Test that changing config values (kbDir, workspace) is immediately reflected in the next command.

---

### P4: Extra frontmatter preservation

**Statement:** User-added frontmatter fields not defined by kb-sync are preserved on pull and ignored on push.

**Violation example:** A user adds `notes: "remember to check auth"` to a file. After `pull`, the field is gone.

**Why:** Users annotate issues with custom metadata. Losing these annotations breaks their workflow.

**Test strategy:** Add custom fields to a file, run pull, verify they persist. Run push, verify they're not sent to Linear.

---

### P5: ID-based matching, not filename-based

**Statement:** Files are matched to Linear issues by the `id` frontmatter field, not by filename. Renaming a file does not break the sync relationship.

**Violation example:** User renames `ENG-123-old-title.md` to `ENG-123-new-title.md`. Push creates a duplicate or fails to find the issue.

**Why:** Filenames change when titles change (during pull) or when users reorganize. The UUID is the stable key.

**Test strategy:** Rename a synced file, verify push still updates the correct issue. Verify pull updates the file at its current location.

---

### P6: Conflict detection correctness

**Statement:** A conflict is detected if and only if both the local file and the Linear issue have been modified since the last sync. False positives and false negatives are both bugs.

**Violation example:** Push silently overwrites a Linear issue that was modified 1 minute ago by another team member.

**Why:** Conflicts represent real concurrent edits. Missing them causes data loss (P2 violation). False positives block legitimate pushes.

**Test strategy:**
- Local-only change: no conflict.
- Remote-only change: no conflict (pull handles it).
- Both changed: conflict detected on push.
- Neither changed: no conflict.

---

### P7: Pushable vs read-only field separation

**Statement:** Push only sends pushable fields (`title`, `status`, `priority`, `assignee`, `labels`, `project`, description). Read-only fields (`id`, `identifier`, `url`, `createdAt`, `updatedAt`, `team`) are never sent to Linear.

**Violation example:** User edits the `identifier` field locally. Push tries to change the identifier on Linear, causing an API error.

**Why:** Some fields are immutable on Linear. Attempting to change them either errors or causes silent corruption.

**Test strategy:** Edit read-only fields locally, push, verify no API mutation for those fields. Next pull restores correct values.

---

### P8: Field validation before push

**Statement:** Before pushing, validate all pushable fields against the workspace's actual values (workflow states, users, labels, projects). Invalid values cause per-issue skip with a helpful warning.

**Violation example:** User types `status: "Donee"` (typo). Push sends it to Linear, which either rejects it or creates a broken state.

**Why:** The CLI is the last line of defense before mutations hit Linear. Catching errors here prevents polluting the workspace.

**Test strategy:** Push with invalid status, invalid assignee, unknown label. Verify each produces a skip + warning listing valid alternatives.

---

### P9: Incremental sync correctness

**Statement:** After incremental pull (only fetching updates since `lastSyncedAt`), the local KB is in the same state as if a full pull had been performed.

**Violation example:** An issue updated 1 second before `lastSyncedAt` is missed by incremental pull, leaving a stale local file.

**Why:** Incremental sync is an optimization. It must not compromise correctness.

**Test strategy:** Full pull, modify some issues on Linear, incremental pull. Compare result against a second full pull — should be identical.

---

### P10: Deletion safety

**Statement:** Local files are only deleted (moved to trash) during pull if (a) the issue is confirmed deleted/archived on Linear AND (b) the complete list of issue IDs was successfully fetched (all pages, no errors).

**Violation example:** A paginated fetch fails on page 3 of 5. Issues from pages 4-5 are "missing" and their local files are deleted.

**Why:** False deletions from partial fetches violate P2 (no data loss). This is the highest-risk operation in the tool.

**Test strategy:** Simulate partial fetch failure. Verify no files are deleted and a warning is printed.

## Agent notes
> Properties P1-P10 should be referenced in JSDoc as `@invariant P<N>`.
> Each property must be covered by at least 2 tests (happy path + edge case).
> P2 and P10 are the highest-priority properties — they prevent data loss.

## Related files
- `non-functional.md` — performance, security, reliability requirements
- `edge-cases.md` — boundary conditions with expected behavior
- `../spec/algorithms.md` — the algorithms that must satisfy these properties
- `../conventions/testing-strategy.md` — how to write tests for properties
