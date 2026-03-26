---
id: ambiguity-audit-iter3
domain: reports
last-updated: 2026-03-25
related: [kb-index, functional-props, error-taxonomy, api-contracts, algorithms, arch-overview]
---

# Ambiguity Audit Report -- Iteration 3

**Date:** 2026-03-25
**Auditor:** Ambiguity auditor agent (iteration 3)
**Scope:** Full structural + content re-audit of all 30 KB files
**Previous audit:** Iteration 2 found 1 critical, 3 high, 9 medium, 5 low. The 1 critical (S5) was fixed.

---

## Iteration 2 -- Resolved Findings

| ID | Description | Status |
|----|-------------|--------|
| S5 | `external/` missing commander documentation | RESOLVED -- `commander.md` created with ESM import, registration, error handling, and request cost model |

---

## Structural Findings

### S4: `kb/architecture/` has no INDEX.md routing table (CRITICAL)

**Upgraded from MEDIUM.** The `architecture/` directory contains `overview.md` plus a `decisions/` subdirectory (with its own INDEX.md and 2 ADRs). An agent entering `architecture/` has no routing table to decide between `overview.md` and `decisions/`. Per the CLAUDE.md rule: "Every directory with more than one file gets an INDEX.md." The subdirectory counts as a navigable entry.

**Fix:** Create `kb/architecture/INDEX.md` with a routing table pointing to `overview.md` and `decisions/`.

---

### S6: GLOSSARY.md missing "Scope" section (LOW)

**Still open from iteration 1.** The KB content template requires a Scope section. GLOSSARY.md omits it.

**Fix:** Add a Scope section.

---

## Content Findings

### C1: "Team not found" error type contradiction (HIGH)

**Still open from iteration 2.** Two files disagree:
- `spec/api-contracts.md` line 78: "Team not found" maps to `ValidationError`.
- `spec/error-taxonomy.md` line 66: "Team 'Enginering' not found..." is listed under the `ApiError` section.

An implementer will make inconsistent error type choices depending on which file they read first.

**Fix:** Unify to `ValidationError` (team name is user input). Move the entry from ApiError to ValidationError in `error-taxonomy.md`.

---

### C12: `fetchWasComplete` undefined in pull algorithm (HIGH)

**Still open from iteration 2.** `spec/algorithms.md` line 59: `IF isFirstSync OR fetchWasComplete:` -- The variable `fetchWasComplete` is never defined, computed, or explained. This is critical to P10 (deletion safety): agents must know HOW to determine whether a fetch was complete.

**Fix:** Add definition after step 4: `fetchWasComplete = true if all pagination pages returned successfully with no errors. Set to false if any page fetch fails after retries.`

---

### C13: Relation ID extraction from Linear SDK unspecified (HIGH)

**Still open from iteration 2.** The bulk-fetch-then-join pattern requires extracting `teamId`, `assigneeId`, `stateId`, `projectId`, and label IDs from SDK issue objects WITHOUT triggering lazy-loads. The only guidance (`external/linear-sdk.md` lines 67-76) suggests `const node = issue as any` (violates no-`any` rule) or vaguely says "use field selection or GraphQL client directly."

An implementer has no clear, type-safe path for extracting relation IDs.

**Fix:** Document the concrete approach: which Linear SDK properties or GraphQL fields to use for each relation ID, with a typed code example. If `as any` is truly needed, document a typed wrapper function that isolates the cast.

---

### C2: Push algorithm uses `NOW()` for updatedAt after push (MEDIUM)

**Still open from iteration 2.** `spec/algorithms.md` line 127: After push, the state records `NOW()` as `updatedAt`. Linear's server sets a different timestamp. Clock skew causes false conflict positives/negatives on next sync.

**Fix:** Specify that after `updateIssue`, use the `updatedAt` returned by Linear's mutation response, not local time.

---

### C3: Push precondition contradicts error table (MEDIUM)

**Still open from iteration 2.** `spec/api-contracts.md` line 87: precondition says "at least one modified file." Line 105: error table says "No modified files" -> info message, exit 0. Precondition implies error; table says no-op.

**Fix:** Remove "at least one modified file" from preconditions.

---

### C4: Init algorithm missing .gitignore update (MEDIUM)

**Still open from iteration 2.** `spec/config-and-formats.md` lines 129-134 specify `.gitignore` additions during init. The init algorithm in `spec/algorithms.md` lines 194-200 omits this step.

**Fix:** Add `.gitignore` update step to init algorithm pseudocode.

---

### C5: T19 unicode edge case uses ASCII examples (MEDIUM)

**Still open from iteration 2.** `properties/edge-cases.md` T19: "Developpement" and "amelioration" are ASCII text, not actual unicode. The edge case is supposed to test unicode handling.

**Fix:** Update to "Developpement" and "amelioration" with real diacritics (e.g., "Equipe Developpement", "amelioration").

---

### C6: Linear SDK version only in Agent notes (MEDIUM)

**Still open from iteration 2.** `external/linear-sdk.md`: The `@linear/sdk` v29+ requirement is buried in Agent notes (line 161), not in the main text.

**Fix:** Add a "Version requirements" section to the main body, similar to `commander.md`.

---

### C7: gray-matter version requirement missing (MEDIUM)

**Still open from iteration 2.** `external/gray-matter.md` never specifies which version is required.

**Fix:** Add version requirement (gray-matter v4+).

---

### C8: --force flag description incomplete (MEDIUM)

**Still open from iteration 2.** `spec/api-contracts.md` push flag table says "--force: Push even if conflicts detected." The important clarification that `--force` does NOT skip field validation is only in Agent notes (line 132), not in the flag description.

**Fix:** Update flag description to "Push even if conflicts detected (does not skip field validation)."

---

### C14: Pull rename algorithm creates divergent filenames (MEDIUM)

**Still open from iteration 2.** `spec/algorithms.md` lines 51-53: When a title changes on Linear, the algorithm keeps the file at its old path. Over time, filenames diverge from titles. The algorithm never specifies when/if filenames should be updated to match new titles.

**Fix:** Clarify: either (a) always rename to match current title, or (b) never rename (ID-based matching handles it), and document which choice was made and why.

---

### C16: Init algorithm method names don't match interface (MEDIUM)

**New finding.** `spec/algorithms.md` init pseudocode (lines 195-196) uses `linearClient.viewer()` and `linearClient.organization()`, but the `LinearClient` interface in `architecture/overview.md` (lines 83-84) defines `getViewer()` and `getOrganization()`. An agent implementing from the algorithm will write code that doesn't match the interface.

**Fix:** Update the init algorithm pseudocode to use `linearClient.getViewer()` and `linearClient.getOrganization()`.

---

### C9: linear-sdk.md uses `as any` in code example (LOW)

**Still open from iteration 2.** Contradicts "No any types" rule. Implementers may copy-paste.

**Fix:** Provide typed alternative or add explicit warning.

---

### C10: File count in INDEX.md is inaccurate (LOW)

**Still open from iteration 2.** INDEX.md says "26 files across 10 directories" but the actual count is 30 files across 11 directories (including reports/ and the newly created files).

**Fix:** Update to correct count or use "~30 files" with a note to check dynamically.

---

### C11: Impossible uniqueness edge case in data-model.md (LOW)

**Still open from iteration 2.** `data-model.md` line 117: "If two different teams have the same identifier number" -- Linear identifiers include the team key prefix, making cross-team number collision impossible for filename uniqueness. The hash fallback instruction creates confusion.

**Fix:** Remove the impossible scenario or clarify it cannot happen.

---

### C15: Trash cleanup trigger unspecified in algorithms (LOW)

**Still open from iteration 2.** GLOSSARY and `config-and-formats.md` say trash is "auto-cleaned after 30 days or next successful full pull." No algorithm pseudocode implements this cleanup step.

**Fix:** Add trash cleanup step to the pull algorithm (after step 7, before return).

---

## Summary by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1     | S4 |
| HIGH     | 3     | C1, C12, C13 |
| MEDIUM   | 9     | C2, C3, C4, C5, C6, C7, C8, C14, C16 |
| LOW      | 5     | S6, C9, C10, C11, C15 |

---

SUMMARY: 1 critical, 3 high, 9 medium, 5 low
