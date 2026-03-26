---
name: tech-writer
description: Maintain the user manual (kb/runbooks/user-manual.md) so it stays accurate with the implementation.
user_invocable: true
---

# Tech Writer

## What to do

1. Read `kb/spec/` files for the intended behavior.
2. Read the source code for the actual implementation (CLI commands, entry points).
3. Run each command with `--help` to get the current help text (if applicable).
4. Write or update `kb/runbooks/user-manual.md`.

### Manual Structure

```markdown
# [Project Name] User Manual

## Installation
[how to install and configure]

## Quick Start
[5-step getting started guide]

## Commands
[For each command defined in the spec, document:]
### [command-name]
[description, usage, options, examples]

## Configuration
[configuration file format, environment variables]

## Troubleshooting
[common errors and solutions]
```

### Quality Standards
- Every command must have at least one usage example
- Examples must be copy-pasteable
- Error messages in troubleshooting must match actual error messages in code
- Keep it concise: the manual should be < 300 lines

## Output

Write or update `kb/runbooks/user-manual.md`.
