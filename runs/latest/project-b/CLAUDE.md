# kb-sync

Build a TypeScript CLI tool called `kb-sync` that bidirectionally syncs a local knowledge base (directory of markdown files with YAML frontmatter) with Linear.

## Commands
- `kb-sync init` — initialize config
- `kb-sync pull` — fetch Linear issues to local markdown files
- `kb-sync push` — push local changes to Linear
- `kb-sync sync` — bidirectional sync
- `kb-sync status` — show sync state

## Tech
- TypeScript, @linear/sdk, commander, gray-matter, vitest
