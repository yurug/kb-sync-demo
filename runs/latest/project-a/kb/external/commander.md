---
id: commander-lib
domain: external
last-updated: 2026-03-25
related: [arch-overview, api-contracts, code-style]
---

# Commander (commander) — CLI Framework

## One-liner
Runtime behavior of commander v12+ for building the kb-sync CLI: command registration, option parsing, and error handling.

## Scope
Covers: ESM import, command/option registration, error handling hooks, version requirements. Does NOT cover: CLI command logic (see `../spec/api-contracts.md`), entry point wiring (see `../architecture/overview.md`).

---

## Version requirements

**Required:** commander v12+ (ESM-native). Earlier versions are CommonJS and will cause `ERR_REQUIRE_ESM` in an ESM project.

**Install:** `npm install commander@^12`

---

## ESM import

```typescript
import { Command } from 'commander';
```

Commander v12 ships as ESM. The `Command` class is the named export. No default export.

---

## Command registration pattern

```typescript
const program = new Command();
program
  .name('kb-sync')
  .description('Bidirectional sync between markdown KB and Linear')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize kb-sync for a Linear workspace')
  .action(async () => { /* handler */ });

program
  .command('pull')
  .description('Fetch Linear issues as local markdown files')
  .option('--team <name>', 'Restrict to a single team')
  .option('--force', 'Overwrite local modifications', false)
  .action(async (options) => { /* handler */ });

program
  .command('push')
  .description('Push local changes to Linear')
  .option('--dry-run', 'Show changes without applying', false)
  .option('--force', 'Push even if conflicts detected', false)
  .argument('[files...]', 'Specific files to push')
  .action(async (files, options) => { /* handler */ });

program
  .command('status')
  .description('Show local and remote changes')
  .action(async () => { /* handler */ });

await program.parseAsync(process.argv);
```

**Key details:**
- Use `parseAsync` (not `parse`) because action handlers are async.
- Options with `--flag` (boolean) default to `false`. Options with `--flag <value>` require an argument.
- `argument('[files...]', ...)` captures variadic positional arguments as `string[]`.
- The variadic argument comes BEFORE options in the action callback signature.

---

## Error handling

Commander catches synchronous errors in actions but does NOT catch rejected promises by default. For async actions, wrap the handler:

```typescript
.action(async (options) => {
  try {
    await handler(options);
  } catch (error) {
    // Handle KbSyncError hierarchy here
    process.exitCode = 1;
  }
});
```

Alternatively, listen for unhandled rejections at the top level:

```typescript
process.on('unhandledRejection', (error) => {
  console.error('Unexpected error:', error);
  process.exitCode = 1;
});
```

---

## Exit code control

Commander does NOT set `process.exitCode`. The application must set it explicitly in error handlers. See `../spec/api-contracts.md` for exit code definitions (0 = success, 1 = error, 2 = conflicts).

Do NOT call `process.exit()` directly — it prevents cleanup and output flushing. Set `process.exitCode` instead.

---

## Request cost model

Commander is a local-only library. **Zero API calls, zero network I/O.** No rate limits, no pagination, no lazy-loading concerns.

## Gotchas

- **`parse` vs `parseAsync`:** Using `parse` with async action handlers silently drops promise rejections. Always use `parseAsync`.
- **Unknown options:** Commander throws on unknown options by default. This is the desired behavior (catches typos).
- **Help auto-generation:** Commander auto-generates `--help` for all commands. No custom help needed.

## Agent notes
> Commander is straightforward compared to the Linear SDK. The main risk is using `parse` instead of `parseAsync` (causes silent failures).
> The entry point (`src/index.ts`) is where commander is set up — see `../architecture/overview.md`.

## Related files
- `../architecture/overview.md` — entry point structure
- `../spec/api-contracts.md` — command contracts and exit codes
- `../conventions/error-handling.md` — how errors propagate to commander actions
