---
id: algorithms
domain: spec
last-updated: 2026-03-26
related: [data-model, api-contracts, linear-sdk, functional-props]
---

# Algorithms

## One-liner
Sync protocol, state machines, and pseudocode for all sync operations.

## Scope
Covers: pull, push, status algorithms, conflict detection, deletion detection. Does NOT cover: Linear API specifics (see `../external/linear-sdk.md`), error handling details (see `error-taxonomy.md`).

---

## Pull Algorithm

### Overview
Pull fetches issues from Linear and writes them as local markdown files. Linear is authoritative.

### Pseudocode

```
FUNCTION pull(config, stateFile, options):
  // Step 1: Check for local modifications
  localMods = detectLocalModifications(stateFile)
  IF localMods.length > 0 AND NOT options.force:
    WARN "Local modifications detected in {localMods.length} files. Use --force to overwrite."
    EXIT 1

  // Step 2: Determine sync mode
  isFirstSync = (config.lastSyncedAt == null)

  // Step 3: Bulk-fetch reference data (teams, users, labels, states, projects)
  refData = fetchReferenceData(linearClient)
  // If --team specified, filter to that team only
  teams = options.team ? refData.teams.filter(t => t.name == options.team) : refData.teams

  // Step 4: Fetch issues
  IF isFirstSync:
    issues = fetchAllIssues(teams, refData)      // full sync
  ELSE:
    issues = fetchUpdatedIssues(teams, refData, config.lastSyncedAt)  // incremental

  // Step 5: Write markdown files
  existingIndex = scanDirectory(config.kbDir)  // captured once before writing
  FOR EACH issue IN issues:
    filePath = buildFilePath(config.kbDir, issue.teamKey, issue.identifier, issue.title)
    existingPath = existingIndex.get(issue.id)  // match by ID, not path (P5)
    IF existingPath:
      extraFields = readExtraFrontmatter(existingPath)
      IF existingPath != filePath:
        // Title changed — rename file to match new title
        rename(existingPath, filePath)
    markdown = toMarkdown(issue, extraFields ?? {})  // preserve extra fields (P4)
    writeFile(filePath, markdown)
    updateState(stateFile, issue.id, issue.updatedAt, hash(markdown))

  // Step 6: Deletion detection (only when fetch was complete, P10)
  IF fetchWasComplete:
    allRemoteIds = fetchAllIssueIds(teams)
    // Uses existingIndex captured in Step 5 — files written during THIS pull
    // won't be subject to deletion detection (they are newly synced)
    FOR EACH (id, path) IN existingIndex:
      IF id NOT IN allRemoteIds:
        moveToTrash(path, ".kb-sync-trash/")
        removeFromState(stateFile, id)

  // Step 7: Update config
  config.lastSyncedAt = NOW()
  writeConfig(config)
```

### Key decisions
- **Match by ID, not filename**: If a file with the same `id` exists anywhere in kbDir, rename it to the new title-based path and update it there. This keeps filenames in sync with titles.
- **Preserve extra frontmatter**: User-added fields are merged, not replaced.
- **Soft delete**: Deleted issues go to `.kb-sync-trash/`, not hard-deleted.
- **Incremental + deletion check**: Incremental fetch gets updates, but a separate ID-list query detects deletions.

---

## Push Algorithm

### Pseudocode

```
FUNCTION push(config, stateFile, options, targetFiles?):
  // Step 1: Identify modified files
  IF targetFiles:
    files = targetFiles
  ELSE:
    files = listAllMarkdownFiles(config.kbDir)

  modified = []
  FOR EACH file IN files:
    parsed = parseMarkdown(file)
    IF NOT parsed.id:
      WARN "Skipping {file}: missing required field 'id'"
      CONTINUE
    IF NOT stateFile.has(parsed.id):
      WARN "Skipping {file}: unknown issue (not from a previous pull)"
      CONTINUE
    currentHash = hash(fileContents)
    IF currentHash != stateFile[parsed.id].contentHash:
      modified.push({ file, parsed, currentHash })

  // Step 2: Conflict detection
  FOR EACH item IN modified:
    linearUpdatedAt = fetchIssueUpdatedAt(item.parsed.id)
    storedUpdatedAt = stateFile[item.parsed.id].updatedAt
    IF linearUpdatedAt > storedUpdatedAt AND NOT options.force:
      item.conflict = true
      WARN "Conflict: {item.parsed.identifier} modified on Linear since last sync. Pull first or use --force."

  // Step 3: Validate pushable fields
  FOR EACH item IN modified WHERE NOT item.conflict:
    validateStatus(item.parsed.status, item.parsed.team)   // must match workflow state
    validateAssignee(item.parsed.assignee)                  // must match exactly one user
    validateLabels(item.parsed.labels)                      // each must exist
    validateProject(item.parsed.project)                    // must exist if set
    // Invalid fields: skip the issue with warning

  // Step 4: Push or dry-run
  FOR EACH item IN modified WHERE NOT item.conflict AND item.valid:
    IF options.dryRun:
      PRINT "Would update {item.parsed.identifier}: {describedChanges}"
    ELSE:
      newUpdatedAt = updateLinearIssue(item.parsed.id, item.pushableFields)
      updateState(stateFile, item.parsed.id, newUpdatedAt, item.currentHash)

  // Step 5: Report
  PRINT "{pushed} updated, {conflicts} conflicts, {skipped} skipped"
```

### Key decisions
- **No issue creation**: Files without a matching ID in state are skipped (v1 scope).
- **Conflict = skip, not fail**: Conflicting issues are skipped individually; other issues still push.
- **Field validation**: Invalid status/assignee/labels cause per-issue skip, not command failure.

---

## Status Algorithm

### Pseudocode

```
FUNCTION status(config, stateFile):
  // Local changes
  localNew = [], localModified = [], localDeleted = []
  FOR EACH file IN listAllMarkdownFiles(config.kbDir):
    parsed = parseMarkdown(file)
    IF NOT stateFile.has(parsed.id):
      localNew.push(file)
    ELSE IF hash(fileContents) != stateFile[parsed.id].contentHash:
      localModified.push(file)
  FOR EACH id IN stateFile.keys():
    IF NOT findFileByIssueId(config.kbDir, id):
      localDeleted.push(id)

  // Remote changes (lightweight API query: just id + identifier + updatedAt)
  remoteNew = [], remoteModified = []
  remoteIssues = client.fetchIssueTimestamps(teams)  // PERF-1: no full resolution
  FOR EACH issue IN remoteIssues:
    IF NOT stateFile.has(issue.id):
      remoteNew.push(issue)
    ELSE IF issue.updatedAt > stateFile[issue.id].updatedAt:
      remoteModified.push(issue)

  // Conflicts
  conflicts = localModified.filter(f => remoteModified.has(f.id))

  PRINT categorized summary
```

---

## Conflict Detection State Machine

```
States: SYNCED, LOCAL_MODIFIED, REMOTE_MODIFIED, CONFLICT

Transitions:
  SYNCED → LOCAL_MODIFIED:   local hash changed
  SYNCED → REMOTE_MODIFIED:  linear updatedAt > stored updatedAt
  SYNCED → CONFLICT:         both changed (detected during push or status)
  LOCAL_MODIFIED → SYNCED:   after successful push
  REMOTE_MODIFIED → SYNCED:  after successful pull
  CONFLICT → SYNCED:         after pull --force, then push
```

---

## Init Algorithm

```
FUNCTION init(apiKey):
  viewer = linearClient.viewer()           // validates API key
  org = linearClient.organization()        // gets workspace slug
  config = { version: 1, kbDir: "./kb", workspace: org.urlKey, lastSyncedAt: null }
  writeFile(".kb-sync.json", JSON.stringify(config, null, 2))
  PRINT "Initialized kb-sync for workspace '{org.name}'"
```

## Agent notes
> The pull algorithm's "match by ID, not filename" behavior is critical — test it thoroughly.
> Deletion detection MUST be gated on complete fetch success. A partial fetch that triggers false deletions would violate P2 (no data loss).
> The bulk-fetch-then-join pattern (Step 3 of pull) is detailed in `../external/linear-sdk.md`.

## Related files
- `data-model.md` — entity definitions used in these algorithms
- `../external/linear-sdk.md` — API call patterns, pagination, rate limiting
- `../properties/functional.md` — invariants these algorithms must satisfy
- `error-taxonomy.md` — error types thrown by these algorithms
