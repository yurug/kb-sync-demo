---
id: edge-cases
domain: properties
last-updated: 2026-03-25
related: [functional-props, non-functional-props, algorithms, data-model]
---

# Edge Cases

## One-liner
Boundary conditions and unusual inputs with their expected behavior — every one needs a dedicated test.

## Scope
Covers: edge cases for data, sync, files, API, and CLI. Does NOT cover: normal-path invariants (see `functional.md`).

---

### T1: Issue with no description

**Condition:** Linear issue has `description: null`.
**Expected:** File created with frontmatter only, empty body (closing `---` then blank line).
**Test:** Pull an issue with null description. Verify file has correct frontmatter and empty body. Push it back — no error, no mutation.

### T2: Issue with very long description (>100KB)

**Condition:** Issue description is over 100KB of markdown.
**Expected:** Write the full description to file, no truncation.
**Test:** Create a mock issue with 150KB description. Pull, verify file size. Push, verify full content sent.

### T3: Title with special characters

**Condition:** Title contains characters invalid in filenames: `/ \ : * ? " < > |` and unicode.
**Expected:** Slugified to safe hyphens. Identifier prefix ensures uniqueness.
**Test:** Title `"Fix: crash on /api/v2 endpoint (urgent!)"` → filename `ENG-123-fix-crash-on-api-v2-endpoint-urgent.md`.

### T4: Title collision after slugification

**Condition:** Two issues have titles that slugify identically (e.g., "Fix Bug" and "fix bug!").
**Expected:** Different identifiers (ENG-123 vs ENG-456) prevent collision. If same identifier (different teams), append short UUID hash.
**Test:** Create two issues with colliding slugs but different identifiers. Verify unique filenames.

### T5: Assignee display name collision

**Condition:** Two workspace users have the same display name.
**Expected:** On push, skip the issue with warning: "assignee matches multiple users."
**Test:** Mock two users with same name. Attempt push with that assignee. Verify skip + warning.

### T6: Invalid status name on push

**Condition:** User edits status to a non-existent workflow state (e.g., "Donee").
**Expected:** Skip the issue with warning listing valid status names.
**Test:** Push with invalid status. Verify skip, warning includes valid alternatives.

### T7: Frontmatter missing required `id` field

**Condition:** User creates a new markdown file manually (no `id` field).
**Expected:** On push, skip with warning: "missing required field 'id'."
**Test:** Create a file without `id`. Push. Verify skip + warning.

### T8: Empty workspace (no issues)

**Condition:** Linear workspace has zero issues.
**Expected:** Pull prints "No issues found in workspace 'X'. Nothing to sync." Creates empty kbDir. Exit 0.
**Test:** Mock empty issue list. Pull. Verify message and exit code.

### T9: First sync (no state file)

**Condition:** `.kb-sync-state.json` doesn't exist.
**Expected:** Pull performs full sync. Creates state file. All issues written fresh.
**Test:** Delete state file. Pull. Verify all issues fetched and state file created.

### T10: Corrupted state file

**Condition:** `.kb-sync-state.json` exists but contains invalid JSON.
**Expected:** Treat as first sync (full pull). Warn about corrupted state file. Recreate it.
**Test:** Write garbage to state file. Pull. Verify full sync + warning + new state file.

### T11: Malformed config file

**Condition:** `.kb-sync.json` has invalid JSON or missing required fields.
**Expected:** `ConfigError` with parse error details and file path. Exit 1.
**Test:** Write malformed JSON. Run any command. Verify ConfigError.

### T12: Expired or revoked API key

**Condition:** `LINEAR_API_KEY` is set but the key is invalid.
**Expected:** First API call returns 401. Print `AuthError` with clear message. Exit 1. No retry.
**Test:** Set invalid key. Run init. Verify AuthError.

### T13: Network failure during pagination

**Condition:** Fetching page 3 of 5 fails with network error.
**Expected:** Retry with exponential backoff. If all retries fail, report error. Do NOT delete any local files (incomplete fetch).
**Test:** Mock network failure on page 3. Verify retries. Verify no deletions.

### T14: Rate limit during bulk fetch

**Condition:** Linear returns 429 during issue fetch.
**Expected:** Wait with exponential backoff (2s, 4s, 8s...). Retry up to 5 times. Resume pagination from where it stopped.
**Test:** Mock 429 on third page. Verify backoff timing. Verify all issues eventually fetched.

### T15: Concurrent pull and push

**Condition:** User runs push while a pull is still running (different terminal).
**Expected:** Out of scope for v1. Not explicitly handled. File locking is not implemented. Document as a known limitation.

### T16: kbDir doesn't exist on first pull

**Condition:** `kbDir` specified in config doesn't exist yet.
**Expected:** Create the directory automatically. No error.
**Test:** Set kbDir to non-existent path. Pull. Verify directory created.

### T17: File renamed by user (ID still matches)

**Condition:** User renames `ENG-123-old.md` to `my-notes-on-login.md`. The `id` field in frontmatter still matches.
**Expected:** Pull finds the file by `id` field scan, updates it at its current path.
**Test:** Rename synced file. Pull. Verify content updated at new path. No duplicate created.

### T18: Priority out of range

**Condition:** User edits priority to 5 or -1.
**Expected:** Skip on push with warning: "priority must be 0-4."
**Test:** Push with priority 5. Verify skip + warning.

### T19: Unicode in team names and labels

**Condition:** Team named "Developpement" with label "amelioration".
**Expected:** Handled correctly. Filenames use slugified version. Frontmatter preserves original unicode.
**Test:** Mock team with unicode name. Pull. Verify correct directory and frontmatter.

### T20: Config file exists but init run again

**Condition:** `.kb-sync.json` already exists when user runs `init`.
**Expected:** `ConfigError`: "already exists. Delete it first to re-initialize."
**Test:** Create config. Run init. Verify error.

## Agent notes
> Every edge case here MUST have a dedicated test. If you add a test for an edge case, tag it `T<N>` in the test name.
> T13 and T14 (network/rate-limit during pagination) are the most complex to test — use mock sequences.
> T15 (concurrency) is explicitly out of scope — document but don't implement.

## Related files
- `functional.md` — invariants that edge cases stress-test
- `../spec/algorithms.md` — normal-path algorithms these cases deviate from
- `../conventions/testing-strategy.md` — how to structure edge case tests
