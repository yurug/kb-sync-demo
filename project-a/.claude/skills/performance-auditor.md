---
name: performance-auditor
description: Audit for performance issues — pagination, async patterns, memory usage, API efficiency.
user_invocable: true
---

# Performance Auditor

## What to do

1. Read `kb/properties/` files for performance-related properties (NF-entries).
2. Read all source files in `src/`.

### API Efficiency
- Is pagination implemented correctly? (not loading all items at once)
- Are API calls batched where possible?
- Are unnecessary API calls avoided? (e.g., skip unchanged items)

### Async Patterns
- Are async operations properly awaited?
- Are independent operations parallelized where safe?
- Are there potential race conditions?

### Memory
- Are large collections (1000+ items) handled with streaming/pagination, not loaded entirely?
- Are temporary objects cleaned up?

### I/O
- Are file operations batched or sequential?
- Is the config file written once at the end, not per-item?

## Output

Write to `kb/reports/performance-audit.md` with findings.
Then FIX critical performance issues.
