#!/usr/bin/env bash
# analyze-run.sh — Post-run analysis: timeline, quality evolution, diff summary
# Usage: ./judge/analyze-run.sh <project-dir>
# Produces a readable report of what was built, in what order, and at what quality.
set -euo pipefail

PROJECT_DIR="${1:?Usage: analyze-run.sh <project-dir>}"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${BOLD}━━━ Build Timeline: $(basename "$PROJECT_DIR") ━━━${NC}"
echo ""

# ─── Git timeline ───
echo -e "${YELLOW}── Commit History ──${NC}"
echo ""

COMMIT_NUM=0
git log --reverse --format="%h|%s|%ai" 2>/dev/null | while IFS='|' read -r hash msg date; do
  COMMIT_NUM=$((COMMIT_NUM + 1))
  # Count files changed in this commit
  FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r "$hash" 2>/dev/null | wc -l)
  SRC_FILES=$(git diff-tree --no-commit-id --name-only -r "$hash" 2>/dev/null | grep -c "^src/" || true)
  TEST_FILES=$(git diff-tree --no-commit-id --name-only -r "$hash" 2>/dev/null | grep -c "^tests/" || true)
  LINES_ADDED=$(git diff-tree --no-commit-id --numstat -r "$hash" 2>/dev/null | awk '{s+=$1} END {print s+0}')

  echo -e "  ${CYAN}#${COMMIT_NUM}${NC} ${DIM}${date%% *} ${date#* }${NC}"
  echo -e "  ${BOLD}${msg}${NC}"
  echo -e "  ${DIM}${FILES_CHANGED} files changed | +${LINES_ADDED} lines | ${SRC_FILES} src, ${TEST_FILES} test${NC}"
  echo ""
done

# ─── Final state snapshot ───
echo -e "${YELLOW}── Final State ──${NC}"
echo ""

if [ -d "src" ]; then
  SRC_COUNT=$(find src/ -name "*.ts" 2>/dev/null | wc -l)
  SRC_LINES=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  echo -e "  Source:     ${BOLD}${SRC_COUNT}${NC} files, ${BOLD}${SRC_LINES}${NC} lines"
fi

if [ -d "tests" ]; then
  TEST_COUNT=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
  TEST_LINES=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" -exec cat {} + 2>/dev/null | wc -l)
  echo -e "  Tests:      ${BOLD}${TEST_COUNT}${NC} files, ${BOLD}${TEST_LINES}${NC} lines"
fi

TOTAL_COMMITS=$(git log --oneline 2>/dev/null | wc -l)
echo -e "  Commits:    ${BOLD}${TOTAL_COMMITS}${NC}"

# ─── Module structure ───
echo ""
echo -e "${YELLOW}── Module Structure ──${NC}"
echo ""

if [ -d "src" ]; then
  for dir in src/*/; do
    if [ -d "$dir" ]; then
      local_count=$(find "$dir" -name "*.ts" 2>/dev/null | wc -l)
      echo -e "  ${CYAN}$(basename "$dir")/${NC}  ($local_count files)"
      find "$dir" -name "*.ts" 2>/dev/null | while read -r f; do
        local_lines=$(wc -l < "$f")
        # Check for module comment
        has_comment="  "
        head -3 "$f" | grep -q "^//" && has_comment="${GREEN}✓${NC}"
        echo -e "    $has_comment $(basename "$f") ${DIM}(${local_lines} lines)${NC}"
      done
    fi
  done
  # Root-level src files
  for f in src/*.ts; do
    if [ -f "$f" ]; then
      local_lines=$(wc -l < "$f")
      has_comment="  "
      head -3 "$f" | grep -q "^//" && has_comment="${GREEN}✓${NC}"
      echo -e "  ${CYAN}$(basename "$f")${NC}  $has_comment ${DIM}(${local_lines} lines)${NC}"
    fi
  done
fi

# ─── Quality indicators ───
echo ""
echo -e "${YELLOW}── Quality Indicators ──${NC}"
echo ""

# Comments
if [ -d "src" ]; then
  COMMENT_LINES=$(grep -rc "^\s*//" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  CODE_LINES=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  if [ "$CODE_LINES" -gt 0 ]; then
    COMMENT_RATIO=$((COMMENT_LINES * 100 / CODE_LINES))
  else
    COMMENT_RATIO=0
  fi
  if [ "$COMMENT_RATIO" -ge 10 ]; then
    echo -e "  Comments:       ${GREEN}${COMMENT_RATIO}%${NC} (target: >=10%)"
  else
    echo -e "  Comments:       ${RED}${COMMENT_RATIO}%${NC} (target: >=10%)"
  fi
fi

# JSDoc
JSDOC_COUNT=$(grep -rc "^\s*/\*\*" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo -e "  JSDoc blocks:   ${BOLD}${JSDOC_COUNT}${NC}"

# Contracts (assertions, invariants, preconditions)
CONTRACT_COUNT=$(grep -rc "assert\|invariant\|precondition\|@throws\|@param.*must\|@returns" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo -e "  Contracts:      ${BOLD}${CONTRACT_COUNT}${NC}"

# Error handling
ERROR_CLASSES=$(grep -rc "extends.*Error\|KbSyncError" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo -e "  Error classes:  ${BOLD}${ERROR_CLASSES}${NC}"

# DI pattern usage
DI_PARAMS=$(grep -rc "client:\|logger:\|config:\|writer:\|reader:" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo -e "  DI parameters:  ${BOLD}${DI_PARAMS}${NC}"

# Test property coverage
echo ""
echo -e "${YELLOW}── Property Coverage ──${NC}"
echo ""

for prop in P1 P2 P3 P4 P5 P6 P7 P8 P9 P10; do
  if grep -rq "$prop" tests/ 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $prop — tested"
  else
    echo -e "  ${RED}✗${NC} $prop — not tested"
  fi
done

# ─── Files listing (what the agent produced) ───
echo ""
echo -e "${YELLOW}── All Source Files ──${NC}"
echo ""

find src/ -name "*.ts" 2>/dev/null | sort | while read -r f; do
  lines=$(wc -l < "$f")
  # First line of module comment
  purpose=$(head -5 "$f" | grep "^//" | head -1 | sed 's|^// *||' || echo "(no comment)")
  echo -e "  ${DIM}${lines}L${NC}  $f"
  echo -e "       ${DIM}${purpose}${NC}"
done

echo ""
echo -e "${YELLOW}── All Test Files ──${NC}"
echo ""

find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | sort | while read -r f; do
  lines=$(wc -l < "$f")
  test_count=$(grep -c "it(\|test(" "$f" 2>/dev/null || echo 0)
  echo -e "  ${DIM}${lines}L${NC}  $f  ${DIM}(${test_count} tests)${NC}"
done

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
