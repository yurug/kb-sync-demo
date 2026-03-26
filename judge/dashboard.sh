#!/usr/bin/env bash
# dashboard.sh — Live-updating terminal dashboard for the experiment
# Usage: ./judge/dashboard.sh <project-a-dir> <project-b-dir>
# Refreshes every 5 seconds. Ctrl+C to stop.
set -euo pipefail

DIR_A="${1:?Usage: dashboard.sh <project-a-dir> <project-b-dir>}"
DIR_B="${2:?Usage: dashboard.sh <project-a-dir> <project-b-dir>}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

live_metric() {
  local dir="$1"
  local label="$2"

  local src_files=0
  local src_lines=0
  local test_files=0
  local commits=0
  local status="building..."

  if [ -d "$dir/src" ]; then
    src_files=$(find "$dir/src" -name "*.ts" 2>/dev/null | wc -l)
    src_lines=$(find "$dir/src" -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  fi
  if [ -d "$dir/tests" ]; then
    test_files=$(find "$dir/tests" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
  fi
  if [ -d "$dir/.git" ]; then
    commits=$(git -C "$dir" log --oneline 2>/dev/null | wc -l)
  fi

  # Check agent status
  if [ -f "$dir/.agent-running" ]; then
    status="${YELLOW}running${NC}"
  elif [ -f "$dir/.validation-score" ]; then
    local score=$(cat "$dir/.validation-score")
    status="${GREEN}done${NC} ($score)"
  elif [ "$src_files" -gt 0 ]; then
    status="${CYAN}finished${NC} (run finalize.sh to validate)"
  else
    status="${RED}no output${NC}"
  fi

  # KB metrics
  local kb_files=0
  local kb_lines=0
  if [ -d "$dir/kb" ]; then
    kb_files=$(find "$dir/kb" -name "*.md" 2>/dev/null | wc -l)
    kb_lines=$(find "$dir/kb" -name "*.md" -exec cat {} + 2>/dev/null | wc -l)
  fi

  # Last commit message (shows current phase)
  local last_commit=""
  if [ -d "$dir/.git" ]; then
    last_commit=$(git -C "$dir" log --oneline -1 2>/dev/null | cut -c9- || echo "")
  fi

  echo -e "  ${BOLD}$label${NC}"
  echo -e "    Status:     $status"
  echo -e "    KB:         $kb_files files, $kb_lines lines"
  echo -e "    Code:       $src_files source, $test_files test ($src_lines lines)"
  echo -e "    Commits:    $commits"
  if [ -n "$last_commit" ]; then
    echo -e "    Phase:      ${DIM}$last_commit${NC}"
  fi
  echo ""
}

while true; do
  clear
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║          LIVE EXPERIMENT: Harness (A) vs No Harness (B)     ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${DIM}$(date '+%H:%M:%S') — refreshing every 5s${NC}"
  echo ""

  live_metric "$DIR_A" "Project A (with harness)"
  live_metric "$DIR_B" "Project B (no harness)"

  echo -e "  ${DIM}Ctrl+C to stop dashboard${NC}"
  sleep 5
done
