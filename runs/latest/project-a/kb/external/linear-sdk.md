---
id: linear-sdk
domain: external
last-updated: 2026-03-26
related: [adr-002, algorithms, non-functional-props]
---

# Linear SDK (@linear/sdk) — Runtime Behavior

## One-liner
Actual runtime behavior of the Linear SDK: lazy-loading traps, pagination, rate limits, and the request budget model.

## Scope
Covers: SDK runtime behavior, API call cost model, pagination mechanics, rate limiting, batching. Does NOT cover: the product's use of Linear (see `../spec/algorithms.md`), architecture decisions (see `../architecture/decisions/adr-002-bulk-fetch-then-join.md`).

## Key concepts
- **Lazy-loading** — accessing relation fields triggers hidden API calls — see `GLOSSARY.md#lazy-loading`
- **Bulk-fetch-then-join** — our mitigation pattern — see `GLOSSARY.md#bulk-fetch-then-join`

---

## Lazy-loading (CRITICAL)

The Linear SDK returns objects with relation fields that look like regular properties but are actually async getters that trigger separate API calls.

**Dangerous fields on an Issue object:**
| Field access          | API calls triggered | Notes                          |
|-----------------------|--------------------|--------------------------------|
| `issue.team`          | 1                  | Fetches the team object        |
| `issue.assignee`      | 1                  | Fetches the user object        |
| `issue.state`         | 1                  | Fetches the workflow state     |
| `issue.project`       | 1                  | Fetches the project object     |
| `issue.labels()`      | 1                  | Fetches all labels for issue   |
| `issue.parent`        | 1                  | Fetches parent issue           |
| `issue.children()`    | 1                  | Fetches child issues           |

**Cost model:** Fetching N issues with all 5 common relations = 1 (list) + 5N (lazy loads) = **5N + 1 calls**.
- 100 issues: 501 calls
- 500 issues: 2,501 calls (EXCEEDS rate limit!)

**Mitigation:** NEVER access these fields. Use bulk-fetch-then-join (ADR-002).

---

## Safe scalar fields (no extra API calls)

These fields are included in the initial query response and are safe to access:

| Field              | Type       | Notes                               |
|--------------------|------------|--------------------------------------|
| `issue.id`         | `string`   | UUID                                 |
| `issue.identifier` | `string`   | e.g., "ENG-123"                     |
| `issue.title`      | `string`   |                                      |
| `issue.description`| `string?`  | Markdown content                     |
| `issue.priority`   | `number`   | 0-4                                  |
| `issue.url`        | `string`   | Full Linear URL                      |
| `issue.createdAt`  | `Date`     | JavaScript Date object (SDK)         |
| `issue.updatedAt`  | `Date`     | JavaScript Date object (SDK)         |

**Note on SDK objects:** `createdAt` and `updatedAt` are Date objects when accessed via the SDK's lazy-loading objects. Convert to ISO string: `issue.createdAt.toISOString()`.

**Note on raw GraphQL (our approach):** When using `client.rawRequest()` with GraphQL queries, `createdAt` and `updatedAt` come back as ISO 8601 strings directly — no Date conversion needed. Our `IssueNode` type declares them as `string`.

---

## Accessing relation IDs without lazy-loading

The SDK exposes the raw GraphQL node data. To get relation IDs without triggering lazy loads:

```typescript
// Access the underlying node data
const node = issue as any;  // or use _data if available
// Team ID, assignee ID, state ID are on the raw node
```

**Alternative:** Use the SDK's `issues()` method with field selection to request only what's needed, or use the GraphQL client directly for fine-grained control.

**Recommended approach:** Use `linearClient.issues({ filter: {...} })` for the issue list, but fetch reference entities separately via `linearClient.teams()`, `linearClient.users()`, `linearClient.workflowStates()`, `linearClient.issueLabels()`, `linearClient.projects()`.

---

## Pagination

**Model:** Cursor-based (Relay-style).
**Default page size:** 50 (configurable, max 250).
**Pattern:**

```typescript
let hasMore = true;
let cursor: string | undefined;
while (hasMore) {
  const result = await linearClient.issues({
    first: 50,
    after: cursor,
    filter: { team: { id: { in: teamIds } } },
    // Optional: updatedAt filter for incremental sync
  });
  for (const issue of result.nodes) {
    // Process issue (scalar fields only!)
  }
  hasMore = result.pageInfo.hasNextPage;
  cursor = result.pageInfo.endCursor;
}
```

**Key details:**
- `result.nodes` contains the issue objects.
- `result.pageInfo.hasNextPage` and `result.pageInfo.endCursor` control iteration.
- Always check `hasNextPage` — don't assume page count.

---

## Rate limiting

| Limit                  | Value                  |
|------------------------|------------------------|
| Requests per hour      | 1,500                  |
| Requests per minute    | ~25                    |
| Rate limit header      | `X-RateLimit-Remaining`|
| Rate limit response    | HTTP 429               |

**Backoff strategy:**
1. On 429: wait 2s, retry.
2. On second 429: wait 4s.
3. Exponential: 2s, 4s, 8s, 16s, 32s (5 retries max).
4. After 5 failures: throw `ApiError` with last error message.

**Throttling:** Add 100ms delay between paginated requests to avoid burst patterns.

---

## Bulk reference data fetching

| Entity type       | SDK method                    | Returns                     |
|-------------------|-------------------------------|-----------------------------|
| Teams             | `linearClient.teams()`        | `{ nodes: Team[] }`        |
| Users             | `linearClient.users()`        | `{ nodes: User[] }`        |
| Workflow states   | `linearClient.workflowStates()` | `{ nodes: WorkflowState[] }` |
| Labels            | `linearClient.issueLabels()`  | `{ nodes: IssueLabel[] }`  |
| Projects          | `linearClient.projects()`     | `{ nodes: Project[] }`     |

**Note:** These may also require pagination for large workspaces. Always paginate.

Each entity has `.id` and `.name` fields. Build `Map<id, name>` for each.

---

## Request budget summary

| Operation              | API calls (500 issues)  | Notes                    |
|------------------------|------------------------|--------------------------|
| Fetch reference data   | 5-10 (with pagination) | One-time per sync        |
| Fetch all issues       | 10                     | 500/50 = 10 pages        |
| Fetch issue timestamps | 10                     | For status command        |
| Update one issue       | 1                      | Per modified issue        |
| **Full pull total**    | **~20**                | Well under 1,500 limit   |
| **Push 10 issues**     | **~25**                | 5-10 ref data + 10 conflict checks + 10 mutations |

## Agent notes
> This is the most critical external dependency doc. Lazy-loading is the #1 cause of rate limit violations.
> ALWAYS verify that your code does NOT access .team, .assignee, .state, .project, .labels() on issue objects.
> The `Date` → `string` conversion (`.toISOString()`) is easy to forget — it causes type mismatches in frontmatter.
> If you see `ERR_REQUIRE_ESM`, the @linear/sdk version may be wrong — check it's v29+.

## Related files
- `../architecture/decisions/adr-002-bulk-fetch-then-join.md` — why we use this pattern
- `../spec/algorithms.md` — how the fetch results are used
- `../properties/non-functional.md` — NF3 rate limit compliance
- `../spec/data-model.md` — the resolved data structure after join
