---
id: adr-002
domain: architecture
last-updated: 2026-03-25
related: [arch-overview, adr-001, linear-sdk, non-functional-props]
---

# ADR-002: Bulk-Fetch-Then-Join for Linear API

**Status:** Accepted

## Context

The Linear SDK uses lazy-loading for relation fields. Accessing `issue.assignee`, `issue.team`, `issue.labels()`, `issue.state`, or `issue.project` triggers a separate API call per access. For N issues with 5 relations each, this means 1 + 5N API calls — for 500 issues, that's 2,501 calls, exceeding the rate limit (1,500/hour) on a single pull.

Options considered:
1. **Lazy-loading** — access relations directly. Simple code, but 5N+1 API calls.
2. **GraphQL includes** — use custom GraphQL queries to eagerly include relations. Efficient, but bypasses the SDK's typed API.
3. **Bulk-fetch-then-join** — fetch all reference entities (teams, users, labels, states, projects) in separate bulk queries, then resolve relations locally by ID.

## Decision

Use **bulk-fetch-then-join** (option 3).

1. Before fetching issues, make 5 bulk queries:
   - All teams → `Map<teamId, Team>`
   - All users → `Map<userId, User>`
   - All labels → `Map<labelId, Label>`
   - All workflow states → `Map<stateId, State>`
   - All projects → `Map<projectId, Project>`
2. Fetch issues with pagination (50/page). Only access scalar fields (`id`, `title`, `priority`, `description`, `url`, `createdAt`, `updatedAt`) and relation IDs (not relation objects).
3. For each issue, resolve `teamId → team.name`, `assigneeId → user.name`, etc. using the maps built in step 1.

## Consequences

**Positive:**
- API calls: 5 (reference data) + ceil(N/50) (issue pages) ≈ 15 calls for 500 issues. Well under rate limit.
- No lazy-loading surprises. Every API call is explicit and counted.
- Reference data can be cached and reused for validation during push.

**Negative:**
- More memory — all reference entities loaded upfront.
- Slightly more complex mapping code (ID resolution).
- If a reference entity is deleted between fetch and join, the ID resolves to null — must handle gracefully.

## What this means for implementers

- **Never access `.team`, `.assignee`, `.labels()`, `.state`, `.project` on issue objects.** These trigger lazy loads. Use the ID fields (`_team.id` on the raw node, or the issue's direct `teamId` / `assigneeId` / `stateId` properties if exposed) and resolve from the reference maps.
- The `LinearClient.fetchReferenceData()` method returns all 5 maps. Call it once per sync operation.
- When a reference ID has no match (deleted user, archived project), use `null` / `"Unknown"` — don't throw.
- The reference maps are also used during push for field validation (P8).

## API call budget

| Operation          | Calls                        | For 500 issues |
|--------------------|------------------------------|----------------|
| Reference data     | 5 (one per entity type)      | 5              |
| Issue pages        | ceil(N/50)                   | 10             |
| **Total pull**     |                              | **~15**        |
| Per-issue push     | 1 per modified issue         | 10 (typical)   |
| **Total push**     |                              | **~11**        |

## Related files
- `../../external/linear-sdk.md` — detailed SDK behavior documentation
- `../overview.md` — where the client module lives
- `../../properties/non-functional.md` — NF3 rate limit compliance
