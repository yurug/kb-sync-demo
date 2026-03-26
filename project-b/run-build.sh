#!/usr/bin/env bash
# run-build.sh — Single-prompt build (no harness)
set -euo pipefail

CLAUDE="claude --dangerously-skip-permissions"
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PROMPT="Build a TypeScript CLI tool called kb-sync that bidirectionally syncs a local knowledge base (directory of markdown files with YAML frontmatter) with Linear.

Commands: init, pull, push, status.
Tech: TypeScript, @linear/sdk, commander, gray-matter, vitest for tests.

Requirements:
- init creates a .kb-sync.json config file
- pull fetches issues from Linear and writes them as markdown files with YAML frontmatter
- push reads local markdown files and creates/updates Linear issues
- status shows what's changed locally vs remotely
- Error messages should be helpful to the user
- Write tests to verify the implementation works
- Include at least one test that hits the real Linear API (LINEAR_API_KEY env var) to verify the integration actually works (read-only: never create/update/delete)
- src/index.ts is the entry point"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Project B: Single Prompt, No Harness         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}$(date '+%H:%M:%S') — Starting...${NC}"
echo ""

echo -e "${CYAN}┌─ Prompt ──────────────────────────────────────────────${NC}"
echo "$PROMPT" | fold -s -w 60 | while IFS= read -r line; do
  echo -e "${CYAN}│${NC} ${DIM}$line${NC}"
done
echo -e "${CYAN}└───────────────────────────────────────────────────────${NC}"
echo ""

PROGRESS_LOG=".progress.log"

# Append logging instruction
FULL_PROMPT="$PROMPT

IMPORTANT: As you work, append short progress lines to the file $PROGRESS_LOG (one line per action):
- When you read a file: echo '📖 Reading <filename>' >> $PROGRESS_LOG
- When you write a file: echo '✏️  Writing <filename>' >> $PROGRESS_LOG
- When you run a command: echo '▶ Running <command>' >> $PROGRESS_LOG
- When you finish: echo '✅ Done' >> $PROGRESS_LOG
Keep lines short (< 80 chars). This log is displayed live to the audience."

touch "$PROGRESS_LOG"
tail -f "$PROGRESS_LOG" &
TAIL_PID=$!

$CLAUDE -p "$FULL_PROMPT" < /dev/null 2>&1

sleep 0.5
kill $TAIL_PID 2>/dev/null
wait $TAIL_PID 2>/dev/null

echo ""
echo -e "${DIM}$(date '+%H:%M:%S') — Finished${NC}"

# Commit whatever was produced
git add -A 2>/dev/null
git commit -m "Build complete" --quiet 2>/dev/null || true
