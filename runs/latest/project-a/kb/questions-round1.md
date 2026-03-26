# Ambiguity Resolution — Round 1

These questions must be answered before any code is written.
Edit the "Default" answers inline if you disagree, then save.

---

## A. Features & Commands

**A1. What CLI commands does kb-sync provide?**
Default: `init`, `pull`, `push`, `status`. `init` creates config. `pull` fetches Linear issues to local markdown. `push` writes local changes back to Linear. `status` shows sync state (what changed locally vs remotely).

**A2. Does `pull` fetch ALL issues from ALL teams, or only a specific team?**
Default: ALL issues from ALL teams by default. The `--team <name>` flag optionally restricts to a single team. A fresh `init` followed by `pull` MUST produce markdown files if the workspace has issues.

**A3. Does `init` require team selection?**
Default: NO. `init` just creates the `.kb-sync.json` config file. All teams are synced by default — no interactive prompts.

**A4. Does `push` support `--dry-run`?**
Default: Yes. `push --dry-run` prints what would change in Linear without making any mutations. This is critical for safety and testing.

**A5. Should `pull` support `--dry-run` as well?**
Default: No — pull only writes local files, which is easily reversible via git. No dry-run needed.

**A6. Should there be a `diff` or `status` command showing what's out of sync?**
Default: Yes. `status` compares local files against their last-known Linear state and reports: new locally, modified locally, deleted locally, new on Linear, modified on Linear, deleted on Linear.

**A7. Does `pull` overwrite local changes or merge them?**
Default: `pull` overwrites local files with Linear state. If local modifications exist, `pull` warns and requires `--force` to proceed. This avoids silent data loss.

---

## B. Data Model & Mapping

**B8. Which Linear fields map to markdown frontmatter?**
Default: `id`, `identifier` (e.g. ENG-123), `title`, `status` (state name), `priority` (0-4), `assignee` (display name), `labels` (array of names), `project`, `team`, `createdAt`, `updatedAt`, `url`. The markdown body maps to the issue `description`.

**B9. How are Linear issues mapped to file paths?**
Default: `<kb-dir>/<team-key>/<identifier>-<slugified-title>.md`. Example: `kb/ENG/ENG-123-fix-login-bug.md`. Team key as subdirectory keeps things organized.

**B10. What happens to frontmatter fields the user adds manually (not from Linear)?**
Default: Extra frontmatter fields are preserved on `pull` (merged, not replaced). Only Linear-mapped fields are updated. This ensures no data loss for user annotations.

**B11. What is the canonical format of the markdown file?**
Default:
```markdown
---
id: "issue-uuid"
identifier: "ENG-123"
title: "Fix login bug"
status: "In Progress"
priority: 2
assignee: "Alice Smith"
labels: ["bug", "urgent"]
team: "Engineering"
project: "Q1 Sprint"
url: "https://linear.app/..."
---

Issue description body in markdown here.
```

**B12. How is `priority` represented — number (0-4) or label (Urgent/High/Medium/Low/None)?**
Default: Number (0=None, 1=Urgent, 2=High, 3=Medium, 4=Low) — matches Linear's API. The mapping to labels is documented but the frontmatter stores the number for roundtrip fidelity.

---

## C. Config Format & Schema

**C13. What config file format — JSON or YAML?**
Default: JSON. The file is `.kb-sync.json`. One format, no ambiguity.

**C14. What fields does `.kb-sync.json` contain?**
Default:
```json
{
  "version": 1,
  "kbDir": "./kb",
  "workspace": "my-workspace",
  "lastSyncedAt": "2025-01-01T00:00:00Z"
}
```
`version` for future schema migrations. `kbDir` is the local directory for markdown files. `workspace` is the Linear workspace slug (set during init from the API key). `lastSyncedAt` is updated after each successful sync.

**C15. Where does the Linear API key come from?**
Default: Environment variable `LINEAR_API_KEY`. Never stored in the config file. The tool checks for it at startup and gives a clear error if missing.

---

## D. Sync Semantics

**D16. What is the sync model — last-write-wins, or something smarter?**
Default: Timestamp-based last-write-wins. On `push`, if an issue's `updatedAt` on Linear is newer than `lastSyncedAt`, we flag a conflict rather than blindly overwriting. On `pull`, Linear is authoritative (local files are overwritten).

**D17. How are conflicts detected and resolved?**
Default: During `push`, compare the local file's `updatedAt` (from frontmatter, set during last pull) against Linear's current `updatedAt`. If Linear is newer, report a conflict and skip that issue. The user must `pull` first to get the latest, then re-apply their changes. `push --force` overrides conflict detection.

**D18. How are deleted issues handled?**
Default: If an issue is archived/deleted on Linear, `pull` removes the local file and reports it. If a user deletes a local file, `push` does NOT delete the issue on Linear — it just skips it. Deleting Linear issues requires using Linear directly.

**D19. What about new local files — can you create issues via `push`?**
Default: No. `push` only updates existing issues. Creating new issues from local files is out of scope for v1 — too many required fields (team, state, etc.) make it error-prone.

**D20. What is the unit of sync — individual files or the whole directory?**
Default: Whole directory. `pull` syncs all issues; `push` syncs all modified files. No per-file sync commands.

---

## E. Linear API & Rate Limits

**E21. The target workspace has 19 teams and thousands of issues. Linear's rate limit is 1500 req/hour (~25/min). How should the client handle this?**
Default: Serialize bulk-fetch requests — do NOT use `Promise.all` for multiple paginated queries. Run them sequentially (one team at a time, one page at a time) to avoid bursting. Use at least 5 retries with exponential backoff: 2s, 4s, 8s, 16s, 32s. Add a small delay (100ms) between paginated pages for large workspaces. Log progress (`Fetching team 3/19...`) so the user knows it's working.

**E22. How does pagination work for fetching issues?**
Default: Linear SDK uses cursor-based pagination (Relay-style). Fetch 50 issues per page (Linear's default). Follow `pageInfo.hasNextPage` / `pageInfo.endCursor` until exhausted. Eagerly fetch needed fields in the query — do NOT rely on lazy-loaded relation fields (each lazy access = 1 extra API call).

**E23. Which Linear SDK fields trigger lazy-loading (hidden API calls)?**
Default: Relation fields like `issue.team`, `issue.assignee`, `issue.labels()`, `issue.project`, `issue.state` all trigger separate API calls if accessed on the object. Instead, use GraphQL-level includes or fetch related data in bulk separately, then join locally.

**E24. Should we use the Linear SDK's high-level methods or raw GraphQL?**
Default: Use the SDK's `linearClient.issues()` with pagination, but fetch related entities (teams, users, labels, states, projects) in separate bulk queries upfront, then join by ID locally. This is the "bulk-fetch-then-join" pattern and minimizes API calls from N*M to N+M.

---

## F. Error Handling

**F25. Should error messages show the actual cause or a generic wrapper?**
Default: ALWAYS show the actual cause. Never wrap with a generic message. "Cannot reach Linear API" is useless — show "Linear API returned 401: Invalid API key" or "getTeam returned undefined for team ID abc-123". Chain the original error.

**F26. What is the error hierarchy?**
Default: Base `KbSyncError` with `userMessage` (human-readable) and `cause` (original error). Subtypes: `ConfigError` (missing/invalid config), `AuthError` (invalid API key), `ApiError` (Linear API failures), `FileSystemError` (read/write failures), `ConflictError` (sync conflicts), `ValidationError` (invalid frontmatter).

**F27. How should network errors (timeouts, transient failures) be handled?**
Default: Retry with exponential backoff (5 retries: 2s, 4s, 8s, 16s, 32s). After all retries exhausted, fail with the last error's actual message. Never silently swallow network errors.

---

## G. UX & Output

**G28. What output format — plain text, colored, or JSON?**
Default: Colored terminal output using chalk for interactive use. Respect `NO_COLOR` env var. No `--json` flag for v1, but structure the code so it's easy to add later.

**G29. Should pull/push show progress (spinner, progress bar)?**
Default: Yes. Use `ora` spinner with status messages: "Fetching teams... (3/19)", "Writing files... (45/1200)". For large workspaces, this is essential feedback.

**G30. What happens when there are no issues to sync?**
Default: Print a clear message: "No issues found in workspace 'my-workspace'. Nothing to sync." Don't treat it as an error.

---

## H. Security

**H31. Should the API key be validated during `init`?**
Default: Yes. `init` makes a lightweight API call (e.g., fetch the viewer/organization) to verify the key is valid and stores the workspace slug in the config.

**H32. Are there any secrets that could accidentally be written to files?**
Default: The API key must never appear in config files, logs, or error messages. Issue content from Linear might contain sensitive data — that's the user's responsibility, but we should warn during init.

---

## I. Testing Strategy

**I33. How do we verify the CLI works against the REAL Linear API, not just mocks?**
Default: Integration tests use a real `LINEAR_API_KEY` from the environment. They are READ-ONLY: list teams, fetch issues, verify data shape. They NEVER create, update, or delete anything. Unit tests use typed mocks. Both layers are required.

**I34. What is the minimum test coverage target?**
Default: 80% line coverage. At least 3 tests per source file on average. Every property from kb/properties/ covered by at least 2 tests.

**I35. Should integration tests run in CI or only locally?**
Default: Both. CI has the `LINEAR_API_KEY` as a secret. Integration tests are tagged and can be skipped with `--exclude integration` for fast local iteration.

---

## J. Architecture

**J36. What is the module structure?**
Default:
```
src/
  index.ts          — CLI entry point (commander setup)
  commands/         — one file per command (init, pull, push, status)
  core/
    sync-engine.ts  — orchestrates sync operations
    mapper.ts       — Linear issue <-> markdown conversion
    config.ts       — config file read/write/validate
  linear/
    client.ts       — Linear SDK wrapper with rate limiting & pagination
    types.ts        — Linear-related type definitions
  fs/
    reader.ts       — read markdown files from disk
    writer.ts       — write markdown files to disk
  errors.ts         — error hierarchy
  types.ts          — shared type definitions
```

**J37. Should the Linear client be a class or a set of functions with dependency injection?**
Default: An interface `LinearClient` with a concrete implementation. The interface is passed to the sync engine and commands, enabling unit tests to inject mocks that implement the same interface.

**J38. How is state tracked between syncs?**
Default: The `lastSyncedAt` field in `.kb-sync.json` records when the last successful sync completed. On pull, we fetch issues updated since that timestamp (or all issues if first sync). On push, we compare against it.

---

## K. Edge Cases

**K39. What if a Linear issue has no description?**
Default: Create the markdown file with frontmatter only and an empty body. Don't skip the issue.

**K40. What if a Linear issue title contains characters invalid in filenames?**
Default: Slugify the title: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim to 80 chars. The identifier prefix (ENG-123) ensures uniqueness even if slugs collide.

**K41. What if the same issue appears in pull results but the local file was renamed?**
Default: Match by the `id` field in frontmatter, not by filename. If a file with the same `id` exists anywhere in the kb directory, update it in place. Otherwise, create a new file (old renamed file becomes orphaned — `status` should warn about this).

**K42. What if the kb directory doesn't exist when pull runs?**
Default: Create it automatically. No error.

**K43. What if `.kb-sync.json` exists but is malformed?**
Default: Report a `ConfigError` with the parse error details and the file path. Don't try to fix it.

**K44. What if a markdown file has invalid/incomplete frontmatter?**
Default: On `push`, skip the file and warn: "Skipping <file>: missing required field 'id'". Never crash on a single bad file.

**K45. What if the Linear workspace has 5000+ issues?**
Default: Handle it gracefully through sequential pagination (see E21). Pull may take several minutes — show progress. Consider a `--since <date>` flag for incremental pulls after the first full sync.

**K46. What if two issues have the same slugified title?**
Default: The identifier prefix (ENG-123 vs ENG-456) makes the filename unique. If somehow still colliding (different teams, same identifier number), append a short hash of the ID.

**K47. What about issues with very long descriptions (>100KB)?**
Default: Write them as-is. Markdown files can be large. No truncation.

---

## L. Scope Boundaries

**L48. Is this v1 only, or should we design for future features?**
Default: Build for v1 only. No plugin system, no custom field mapping, no webhooks, no real-time sync. Keep the architecture clean enough that these could be added, but don't build abstractions for them now.

**L49. Do we support multiple workspaces?**
Default: No. One `.kb-sync.json` = one workspace. One API key = one workspace.

**L50. Do we support filtering issues by status, label, or project?**
Default: Not in v1. Pull fetches everything (optionally filtered by `--team`). Filtering can be added later as CLI flags.
