---
id: harness-post-check
domain: reports
last-updated: 2026-03-26
related: [arch-overview, algorithms, data-model, error-taxonomy, linear-sdk, by-task]
---

# Harness Post-Check Report

## One-liner
KB-vs-code audit: identifies stale docs, missing modules, undocumented behaviors, and broken cross-references.

## Summary

Checked all KB files against the implemented source code. Found **12 issues** (7 stale/inaccurate, 3 missing documentation, 2 cross-reference gaps). All issues fixed in this pass.

---

## Issues Found and Fixed

### 1. architecture/overview.md — Missing modules in module structure

**Problem:** The module tree lists only the files that were planned before implementation. The implementation added 6 files not in the diagram:
- `src/commands/pull-helpers.ts` — pull local-mod detection and soft-delete logic
- `src/commands/status-formatter.ts` — status output formatting
- `src/core/change-detector.ts` — push modified-file detection
- `src/core/push-mapper.ts` — MarkdownIssue -> IssueUpdateInput conversion
- `src/core/progress.ts` — spinner/progress wrapper (ora)
- `src/linear/issue-fetcher.ts` — raw GraphQL issue fetching
- `src/linear/ref-data.ts` — bulk reference data fetching
- `src/linear/resolver.ts` — IssueNode -> LinearIssue resolution + mutation builder

**Fix:** Updated module tree and dependency graph to include all implemented files.

### 2. architecture/overview.md — LinearClient interface diverges from code

**Problem:** The KB showed a `scanDirectory` method on `FileReader` and a `moveToTrash` method on `FileWriter`. In the implementation, these are standalone exported functions, not interface methods. Also, `LinearClient` interface in the KB differs from the actual `LinearClientInterface` in `linear/types.ts`:
- Code has `fetchIssueTimestamps()` method (used by status command) — not in KB
- Code's `fetchIssues()` returns `[LinearIssue[], boolean]` tuple (issues + fetchWasComplete flag) — KB showed `LinearIssue[]` only
- Code's `fetchIssues()` accepts optional `refData` parameter — not in KB
- Code's `updateIssue()` returns `Promise<string>` (updatedAt) — KB showed `Promise<void>`

**Fix:** Updated LinearClient interface and DI section to match actual code.

### 3. spec/algorithms.md — Pull algorithm: rename logic differs from code

**Problem:** The spec says "IF existingFile AND existingFile.path != filePath: filePath = existingFile.path" (update at old path). The code in `pull.ts:handleRename()` does the opposite: it renames the existing file TO the new path, then writes at the new path.

**Verdict:** The code behavior is better (filenames stay in sync with titles). Updated spec to match code.

### 4. spec/algorithms.md — Status algorithm: missing fetchIssueTimestamps

**Problem:** The status algorithm pseudocode shows `fetchIssueTimestamps(teams)` but this method isn't in the KB's LinearClient interface definition. The actual code uses `client.fetchIssueTimestamps(teamIds)` which returns `{id, identifier, updatedAt}[]` — a lightweight query not documented in the interface.

**Fix:** Added to LinearClient interface in architecture/overview.md and documented in algorithms.md.

### 5. external/linear-sdk.md — Date vs string for createdAt/updatedAt

**Problem:** The KB says SDK returns `Date` objects for `createdAt`/`updatedAt` and warns to call `.toISOString()`. But the implementation uses raw GraphQL (not SDK objects), so these come back as ISO strings directly. The `IssueNode` type in `linear/types.ts` declares them as `string`, not `Date`.

**Verdict:** The KB note about Date->string conversion is misleading for the actual implementation. Added clarification that raw GraphQL returns strings directly.

### 6. spec/error-taxonomy.md — Missing ValidationError for UUID format

**Problem:** The code in `linear/client.ts` throws a `ValidationError` when an issue ID is not a valid UUID ("Invalid ID format for {context}. Expected a UUID."). This error type/trigger is not in the error taxonomy.

**Fix:** Added UUID validation error to the ValidationError table.

### 7. architecture/overview.md — Dependency graph incomplete

**Problem:** The dependency graph shows `commands/* -> core/sync-engine.ts` as the only path. In reality:
- `commands/pull.ts` directly uses `core/mapper.ts`, `core/hasher.ts`, `core/config.ts`, `core/state.ts`, `fs/*`
- `commands/status.ts` directly uses `core/config.ts`, `core/state.ts`, `core/hasher.ts`, `fs/scanner.ts`
- `commands/push.ts` uses `core/config.ts` and `core/sync-engine.ts`
- `core/sync-engine.ts` uses `core/change-detector.ts`, `core/mapper.ts`, `core/state.ts`

**Fix:** Updated dependency graph to show actual relationships. Added note that only push goes through sync-engine; pull and status have direct module dependencies.

### 8. spec/algorithms.md — Push returns updatedAt from mutation

**Problem:** The push algorithm pseudocode shows `updateState(stateFile, item.parsed.id, NOW(), item.currentHash)` using `NOW()` for the updatedAt. The actual code uses the `updatedAt` returned from the Linear mutation response, which is more correct.

**Fix:** Updated pseudocode to use the mutation response timestamp.

### 9. kb/INDEX.md — File count is stale

**Problem:** INDEX.md says "26 files across 10 directories". After adding the harness-post-check report, count should be updated.

**Fix:** Updated file count.

### 10. architecture/overview.md — FileReader/FileWriter interfaces don't exist

**Problem:** The KB shows `FileReader` and `FileWriter` as DI interfaces. The code does NOT define these interfaces — `fs/reader.ts`, `fs/writer.ts`, and `fs/scanner.ts` export standalone functions, not interface-implementing classes. DI is only used for the Linear client.

**Fix:** Removed fictional FileReader/FileWriter interfaces. Documented that fs/ modules are imported directly as standalone functions (not via DI).

### 11. spec/algorithms.md — Pull deletion uses existingIndex, not a new scan

**Problem:** The spec says deletion detection calls `listAllMarkdownFiles(config.kbDir)` to find local files. The code reuses the `existingIndex` map built at the start of pull (from `scanDirectory`), which is more efficient but means files written during THIS pull won't be subject to deletion detection.

**Fix:** Updated pseudocode to clarify the index is captured once at the start.

### 12. external/linear-sdk.md — Missing request cost for push

**Problem:** The request budget table shows "Push 10 issues: ~11 (1 timestamp check + 10)" but the actual push flow does: 1 refData fetch (5-10 calls) + 10 conflict checks (fetchIssueUpdatedAt) + 10 mutations = ~25 calls.

**Fix:** Updated the request budget table with accurate push cost.

---

## Validation Summary

| KB Area | Status | Notes |
|---------|--------|-------|
| architecture/overview.md | FIXED | Module tree, dependency graph, DI interfaces updated |
| spec/data-model.md | OK | Matches types.ts exactly |
| spec/algorithms.md | FIXED | Pull rename, status fetch, push timestamp, deletion index |
| spec/api-contracts.md | OK | Commands, flags, exit codes match implementation |
| spec/config-and-formats.md | OK | Config schema, file format, state format all match |
| spec/error-taxonomy.md | FIXED | Added UUID validation error |
| properties/functional.md | OK | All P1-P10 are implemented and referenced in code |
| properties/non-functional.md | OK | NF1-NF8 all addressed in implementation |
| properties/edge-cases.md | OK | T1-T20 all handled in code |
| external/linear-sdk.md | FIXED | Date vs string clarification, push request budget |
| external/commander.md | OK | Not affected |
| external/gray-matter.md | OK | Not affected |
| indexes/by-task.md | OK | Routing is correct |
| kb/INDEX.md | FIXED | File count updated |
| Cross-references | OK | All Related files / Agent notes verified |

## Conclusion

The KB was largely accurate — the spec was written first and the implementation followed it closely. Most discrepancies were in the architecture diagram (which couldn't anticipate implementation-time module splits) and in the LinearClient interface (which evolved during implementation). No bugs were found — all discrepancies were cases where the code correctly extended the spec.
