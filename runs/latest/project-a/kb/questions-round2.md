# Ambiguity Resolution — Round 2

Follow-up questions arising from Round 1 answers.
Edit the "Default" answers inline if you disagree, then save.

---

## M. Per-File Sync State

**M1. How do we track per-file state for conflict detection and local modification detection?**
D17 says conflict detection compares frontmatter `updatedAt` against Linear's current `updatedAt`. A7 says `pull` warns if local modifications exist. But the config only has a global `lastSyncedAt`. Where is the per-file "last known state" stored?
Default: Use a `.kb-sync-state.json` file (gitignored) that maps issue ID to `{ updatedAt, contentHash }`. `contentHash` is a SHA-256 of the file content at last sync. Local modification = current file hash differs from stored hash. Conflict = Linear's `updatedAt` > stored `updatedAt`. This keeps `.kb-sync.json` clean and gives us accurate per-file tracking.

**M2. Should `.kb-sync-state.json` be gitignored?**
Default: Yes. It's machine-local state, like a lockfile. Add it to `.gitignore` during `init`. The config (`.kb-sync.json`) is user-facing and can be committed; the state file is internal bookkeeping.

---

## N. Frontmatter Field Clarifications

**N3. B8 lists `createdAt` and `updatedAt` as frontmatter fields, but B11's example omits them. Are they included in frontmatter?**
Default: Yes, both are included. They were accidentally omitted from the B11 example. The canonical frontmatter includes all fields from B8, in this order: `id`, `identifier`, `title`, `status`, `priority`, `assignee`, `labels`, `team`, `project`, `url`, `createdAt`, `updatedAt`.

**N4. Which frontmatter fields are read-only (never pushed back to Linear)?**
On push, some fields are read-only on Linear's side (`id`, `identifier`, `url`, `createdAt`, `updatedAt`, `team`). Which fields can the user edit locally and have pushed back?
Default: Pushable fields are: `title`, `status`, `priority`, `assignee`, `labels`, `project`, and the markdown body (description). All other frontmatter fields are read-only and ignored on push. If a user edits a read-only field locally, `push` silently ignores it (next `pull` will restore the correct value).

**N5. Status is stored as a name string (e.g., "In Progress"). What if the user types a status name that doesn't exist in Linear?**
Default: On `push`, validate the status name against the team's workflow states. If invalid, skip the issue with a warning: "Skipping ENG-123: unknown status 'Donee' (valid: Todo, In Progress, Done)". Same for assignee, labels, and project — validate against known entities.

**N6. Assignee is stored as a display name. What if two users share the same display name?**
Default: Unlikely but possible. On push, if the display name matches exactly one user, use it. If it matches zero or multiple, skip with a warning. In the state file, store the user ID alongside the name for reliable reverse mapping.

---

## O. Pull Behavior Details

**O7. On incremental pull (not the first sync), should we fetch only issues updated since `lastSyncedAt`, or always fetch all?**
Default: Incremental — fetch issues with `updatedAt > lastSyncedAt`. This is dramatically faster for large workspaces. But it cannot detect deletions (a deleted issue won't appear in results). So: incremental pull for updates, plus a separate "list all issue IDs" query to detect deletions. If an ID exists locally but not on Linear, the issue was deleted/archived.

**O8. How do we safely detect deletions without risking data loss from pagination errors?**
D18 says pull removes local files for deleted/archived issues. But if a paginated fetch fails partway, missing issues could be false "deletions." How do we guard against this?
Default: Only remove a local file if we successfully fetched the complete list of issue IDs (all pages, no errors). If any pagination request fails, skip deletion detection entirely for that pull and warn the user. Additionally, before deleting, move files to a `.kb-sync-trash/` directory (auto-cleaned after 30 days or next successful full pull) rather than hard-deleting.

---

## P. Push Behavior Details

**P9. When pushing, do we push ALL locally modified files, or only files the user explicitly specifies?**
A4 says `push` syncs all modified files. Is there a way to push individual files?
Default: `push` pushes all modified files by default. Support `push <file1> <file2>` to push specific files. This is analogous to `git add` — batch by default, selective when needed.

**P10. What exactly constitutes a "modification" for push purposes?**
Default: A file is modified if its content hash differs from the hash stored in `.kb-sync-state.json`. New files (no matching ID in state) are skipped (per D19, no issue creation in v1). Deleted local files are skipped (per D18).

---

## Q. Status Command Details

**Q11. What data does `status` need to be accurate?**
A6 says status shows new/modified/deleted locally and on Linear. The "locally" part can use `.kb-sync-state.json`. But the "on Linear" part requires fetching current state from the API. Does `status` make API calls?
Default: Yes. `status` makes read-only API calls to compare. It fetches issue `updatedAt` timestamps from Linear (lightweight query — just IDs and timestamps, not full content) and compares against the state file. This means `status` requires a network connection and a valid API key.

---

## R. CLI UX Edge Cases

**R12. What happens if the user runs `pull` or `push` without running `init` first?**
Default: Print a clear error: "No .kb-sync.json found. Run `kb-sync init` first." Exit code 1.

**R13. What happens if `LINEAR_API_KEY` is set but invalid (expired, revoked)?**
Default: The first API call will fail with a 401. Catch it and print: "Linear API key is invalid or expired. Check your LINEAR_API_KEY environment variable." Exit code 1. Don't retry auth failures.

**R14. What exit codes should the CLI use?**
Default: 0 = success, 1 = general error, 2 = conflict detected (push found conflicts). This lets scripts check `$?` for automation.

---

## S. Scope Confirmation

**S15. Is the `--since <date>` flag (mentioned in K45) in scope for v1?**
Default: No. Incremental sync is automatic based on `lastSyncedAt`. A manual `--since` override is not needed for v1. If the user wants a full re-sync, they can delete `.kb-sync-state.json` and run `pull` again.

**S16. Should `pull --force` re-fetch everything (full sync) or just override the local modification warning?**
Default: It only overrides the local modification warning. To force a full re-sync, delete `.kb-sync-state.json`. Keep the semantics of `--force` narrow and predictable.
