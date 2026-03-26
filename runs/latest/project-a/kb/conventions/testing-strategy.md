---
id: testing-strategy
domain: conventions
last-updated: 2026-03-25
related: [functional-props, edge-cases, adr-001, linear-sdk]
---

# Testing Strategy

## One-liner
Test levels, mocking rules, coverage targets, and how to write tests that trace back to the spec.

## Scope
Covers: test structure, mocking approach, integration test rules, coverage targets. Does NOT cover: specific properties to test (see `../properties/`).

---

## Test levels

### Unit tests
- **One test file per source file:** `src/core/mapper.ts` → `tests/core/mapper.test.ts`
- **Test individual functions** in isolation with DI-injected mocks.
- **Mock all external dependencies** (Linear API, filesystem).
- **Fast:** < 1s per file, no network, no disk I/O.

### Integration tests
- **Test module interactions:** sync engine + mapper + fs working together.
- **At least one test with the REAL Linear API** (not mocked).
- **READ-ONLY:** Integration tests NEVER create, update, or delete anything in Linear. Only read operations.
- **Requires `LINEAR_API_KEY`** from environment.
- **Tagged:** `describe.skipIf(!process.env.LINEAR_API_KEY)` for graceful skip.

### End-to-end tests
- **Test complete CLI commands** with realistic scenarios.
- **Use temp directories** for file I/O.
- **Mock Linear API** (e2e tests exercise the CLI pipeline, not the API).

### Property-based tests
- **For critical invariants**, use randomized inputs.
- **P1 roundtrip:** Generate random valid issues, pull → push → verify no mutations.
- **Use `vitest` with custom generators** (no external property testing lib needed for v1).

### Edge case tests
- **Every edge case in `../properties/edge-cases.md`** gets a dedicated test.
- **Test name prefix:** `T<N>:` matching the edge case ID.

### Error path tests
- **Every error type** in `../spec/error-taxonomy.md` gets a test verifying the `userMessage`.

---

## Test naming convention

```typescript
describe('P2: No data loss', () => {
  it('P2: pull with local mods (no --force) aborts with warning', async () => { ... });
  it('P2: deleted files go to .kb-sync-trash/, not hard-deleted', async () => { ... });
});

describe('T3: Title with special characters', () => {
  it('T3: slugifies special chars to hyphens', () => { ... });
});
```

**Pattern:** `"<Property/EdgeCase ID>: <what it tests>"`

---

## Mocking approach (DI-based, not vi.mock)

Per ADR-001, use dependency injection for mocking:

```typescript
// Create a mock that implements the interface
const mockClient: LinearClient = {
  fetchReferenceData: vi.fn().mockResolvedValue(refData),
  fetchIssues: vi.fn().mockResolvedValue(issues),
  fetchAllIssueIds: vi.fn().mockResolvedValue(ids),
  fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T10:00:00Z'),
  updateIssue: vi.fn().mockResolvedValue(undefined),
  getViewer: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  getOrganization: vi.fn().mockResolvedValue({ name: 'Test Org', urlKey: 'test' }),
};

// Pass the mock to the function under test
const result = await pull(config, stateFile, { force: false }, mockClient);
```

**Rules:**
- Mocks MUST implement the full interface (TypeScript enforces this).
- Never use `vi.mock()` to mock modules. Always inject dependencies.
- Mock return values should be realistic (real-looking data shapes).

---

## Integration test rules

```typescript
describe.skipIf(!process.env.LINEAR_API_KEY)('Integration: Real Linear API', () => {
  it('can connect and fetch viewer info', async () => {
    const client = new LinearClientImpl(process.env.LINEAR_API_KEY!);
    const viewer = await client.getViewer();
    expect(viewer.id).toBeDefined();
    expect(viewer.name).toBeDefined();
  });

  it('can fetch teams', async () => {
    const client = new LinearClientImpl(process.env.LINEAR_API_KEY!);
    const refData = await client.fetchReferenceData();
    expect(refData.teams.size).toBeGreaterThan(0);
  });
});
```

**CRITICAL:** Integration tests are READ-ONLY. NEVER call `updateIssue` or any mutation.

---

## Coverage targets

| Metric                    | Target  |
|---------------------------|---------|
| Line coverage             | >= 80%  |
| Tests per source file     | >= 3 avg|
| Properties covered        | 100%    |
| Edge cases covered        | 100%    |
| Error types covered       | 100%    |

---

## Test matrix (to be created in reports/)

After implementation, create `../reports/test-matrix.md` mapping:
- Each property (P1-P10) → test file(s) and test name(s)
- Each edge case (T1-T20) → test file and test name
- Each error type → test file and test name

## Agent notes
> The DI-based mocking approach means you never fight with module resolution or hoisting.
> Integration tests should be the LAST tests written — get unit tests green first.
> When a test fails, check the property it's testing to understand the expected behavior.

## Related files
- `../properties/functional.md` — P1-P10 invariants to test
- `../properties/edge-cases.md` — T1-T20 boundary conditions to test
- `../spec/error-taxonomy.md` — error types to test
- `../architecture/decisions/adr-001-dependency-injection.md` — why we mock this way
