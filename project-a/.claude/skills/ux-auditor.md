---
name: ux-auditor
description: Audit CLI user experience — help text, error messages, output formatting, progress indicators, and exit codes.
user_invocable: true
---

# UX Auditor

## What to do

1. Read `kb/spec/` files for command definitions and UX requirements.
2. Read all source files that handle CLI interaction, output formatting, and logging.
3. If possible, run each command with `--help` and test error cases.

### Help Text
- Does every command have a `--help` that explains usage, options, and examples?
- Is the help text consistent across commands?
- Are option names intuitive?

### Error Messages
- Are all error messages user-friendly (no stack traces, no raw API errors)?
- Do they suggest what the user can do to fix the problem?
- Do they include the relevant context (which file, which entity)?

### Output Formatting
- Is output colored appropriately (green=success, yellow=warning, red=error)?
- Is output deterministic and sorted?
- Is there a `--json` or `--quiet` option for scripting?

### Progress Indicators
- Do long operations show a spinner or progress bar?
- Is there feedback for each item processed?

### Exit Codes
- 0 for success, non-zero for errors (as specified in the spec)
- Are exit codes consistent?

### Dry Run
- Does any destructive command support `--dry-run`?
- Does dry-run clearly label output as simulated?
- Does it show exactly what would change?

## Output

Write to `kb/reports/ux-audit.md`:

```markdown
# UX Audit
Date: [timestamp]
Overall Score: [X]% ([N/M] criteria passed)

| Criterion | Score | Details |
|-----------|-------|---------|
| Help text | PASS/PARTIAL/FAIL | ... |
...

## Findings
[detailed findings]
```
