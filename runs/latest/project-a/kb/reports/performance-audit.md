---
id: performance-audit
domain: reports
last-updated: 2026-03-25
related: [non-functional-props, linear-sdk, algorithms]
---

# Performance Audit Report

## One-liner
Review of API call efficiency, pagination, async patterns, memory usage, and I/O batching.

---

## Findings

### PERF-1: Status command fetches full issues instead of lightweight query [HIGH]

**Location:** `src/commands/status.ts:164`
**Description:** `detectRemoteChanges` calls `client.fetchIssues(teamIds)` which fetches full issue data + reference data. The status algorithm in the spec says to use a "lightweight API query: just IDs + updatedAt". This means: (1) unnecessary reference data fetch, (2) full issue resolution, (3) much higher API call count.
**Impact:** For 500 issues, status makes ~15+ API calls instead of ~10, and transfers much more data.
**Fix:** Use a dedicated lightweight query that fetches only `id` and `updatedAt` fields, skipping reference data resolution.
**Severity:** HIGH

### PERF-2: Reference data fetched sequentially, not in parallel [MEDIUM]

**Location:** `src/linear/ref-data.ts:28-84`
**Description:** Teams, users, states, labels, and projects are fetched sequentially. They are independent and could be fetched in parallel using `Promise.all()`.
**Impact:** 5 serial API call chains instead of 5 parallel ones. Adds ~500ms+ latency per pull.
**Fix:** Use `Promise.all()` to fetch all entity types concurrently.
**Severity:** MEDIUM

### PERF-3: Pull fetches reference data twice [HIGH]

**Location:** `src/commands/pull.ts:71`, `src/linear/client.ts:77`
**Description:** `executePull` calls `client.fetchReferenceData()` at line 71, then `client.fetchIssues()` at line 92. Inside `fetchIssues()`, `fetchReferenceData()` is called again (client.ts:77). This doubles the reference data API calls.
**Impact:** 10+ unnecessary API calls per pull operation.
**Fix:** Pass the already-fetched refData to fetchIssues, or restructure so fetchIssues accepts pre-fetched refData.
**Severity:** HIGH

### PERF-4: Pagination uses 100ms throttle [PASS]

**Description:** Inter-request throttle of 100ms prevents rate limiting. Exponential backoff on 429. Both per NF3 spec.
**Status:** PASS - correctly implemented.

### PERF-5: Scanner reads full file content for ID extraction [LOW]

**Location:** `src/fs/scanner.ts:35`
**Description:** `scanDirectory` reads each file fully to extract the `id` from frontmatter. For large files (T2: >100KB descriptions), this reads unnecessarily large amounts of data.
**Impact:** Negligible for typical workloads (<500 files), but could be slow with many large files.
**Fix:** Not critical. Could optimize by reading only first ~1KB per file.
**Severity:** LOW

### PERF-6: Pull command does not batch file writes [LOW]

**Description:** Files are written one at a time in a for loop. Node.js file I/O is async but serial here.
**Impact:** Minimal - file writes are fast and serial writes avoid file descriptor exhaustion.
**Status:** PASS - acceptable design.

---

## Summary

| ID     | Severity | Status   |
|--------|----------|----------|
| PERF-1 | HIGH     | TO FIX   |
| PERF-2 | MEDIUM   | TO FIX   |
| PERF-3 | HIGH     | TO FIX   |
| PERF-4 | PASS     | OK       |
| PERF-5 | LOW      | DEFERRED |
| PERF-6 | LOW      | OK       |
