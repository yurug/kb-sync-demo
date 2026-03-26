#!/usr/bin/env bash
# traceability.sh — Verify that tests trace back to specifications
#
# This script answers: "Are the tests testing what the spec says, or just
# exercising code for coverage?"
#
# It produces a traceability matrix:
#   - Which spec properties (P1, NF1, T1, ...) have tests?
#   - Which tests reference a property? Which don't?
#   - What do the "orphan" tests (no property ref) actually assert?
#
# Usage: ./judge/traceability.sh <project-dir>
# Requires: the project has tests/ and optionally kb/

set +e  # Don't exit on errors — we handle them with logic

PROJECT_DIR="$(cd "${1:?Usage: traceability.sh <project-dir>}" && pwd)"
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
echo -e "${BOLD}━━━ Test-Specification Traceability Report ━━━${NC}"
echo -e "${DIM}Project: $PROJECT_DIR${NC}"
echo -e "${DIM}Date: $(date -Iseconds)${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# 1. Extract properties defined in the KB
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}═══ 1. Properties defined in KB ═══${NC}"
echo ""

declare -A PROP_DEFS

if [ -d "kb" ]; then
  # Match headings like ### P1: Name, ### NF3: Name, ### T7: Name
  while IFS= read -r line; do
    PROP_ID=$(echo "$line" | grep -oP '(P\d+|NF\d+|T\d+)' | head -1)
    PROP_NAME=$(echo "$line" | sed -E 's/^#+\s*(P[0-9]+|NF[0-9]+|T[0-9]+):?\s*//')
    if [ -n "$PROP_ID" ]; then
      PROP_DEFS["$PROP_ID"]="$PROP_NAME"
    fi
  done < <(grep -rhP '^\s*#{1,4}\s*(P\d+|NF\d+|T\d+)' kb/ 2>/dev/null || true)

  PROP_COUNT=${#PROP_DEFS[@]}
  if [ "$PROP_COUNT" -gt 0 ]; then
    echo -e "  Found ${GREEN}$PROP_COUNT${NC} properties in kb/:"
    for pid in $(echo "${!PROP_DEFS[@]}" | tr ' ' '\n' | sort -V); do
      echo -e "    ${BOLD}$pid${NC}: ${PROP_DEFS[$pid]}"
    done
  else
    echo -e "  ${YELLOW}No properties found in kb/ (no P1/NF1/T1 headings)${NC}"
  fi
else
  echo -e "  ${DIM}No kb/ directory — skipping KB analysis${NC}"
fi
echo ""

# ═══════════════════════════════════════════════════════════════
# 2. Extract property references from test names
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}═══ 2. Test-property mapping ═══${NC}"
echo ""

if [ ! -d "tests" ]; then
  echo -e "  ${RED}No tests/ directory${NC}"
  exit 0
fi

# Build map: property -> list of test descriptions
declare -A PROP_TESTS
declare -A PROP_FILES

# Also track tests with no property reference
ORPHAN_TESTS=()
TOTAL_TESTS=0
TRACED_TESTS=0

while IFS= read -r match; do
  FILE=$(echo "$match" | cut -d: -f1)
  LINE=$(echo "$match" | cut -d: -f2)
  # Extract the test description (inside quotes after it/test)
  DESC=$(echo "$match" | grep -oP "(?:it|test)\s*\(\s*['\"]\\K[^'\"]+")

  if [ -z "$DESC" ]; then
    continue
  fi

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  # Find property references in the test description
  PROPS=$(echo "$DESC" | grep -oP '(P\d+|NF\d+|T\d+)' || true)

  if [ -n "$PROPS" ]; then
    TRACED_TESTS=$((TRACED_TESTS + 1))
    for prop in $PROPS; do
      PROP_TESTS["$prop"]="${PROP_TESTS[$prop]:-}
    $DESC"
      PROP_FILES["$prop"]="${PROP_FILES[$prop]:-} $(basename "$FILE")"
    done
  else
    ORPHAN_TESTS+=("$(basename "$FILE"):$LINE: $DESC")
  fi
done < <(grep -rnP "^\s*(it|test)\s*\(" tests/ 2>/dev/null || true)

echo -e "  Total tests: ${BOLD}$TOTAL_TESTS${NC}"
echo -e "  Traced to properties: ${GREEN}$TRACED_TESTS${NC} ($(( TOTAL_TESTS > 0 ? TRACED_TESTS * 100 / TOTAL_TESTS : 0 ))%)"
echo -e "  Orphan (no property ref): ${YELLOW}$((TOTAL_TESTS - TRACED_TESTS))${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# 3. Coverage matrix: which properties are tested?
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}═══ 3. Property coverage matrix ═══${NC}"
echo ""

COVERED=0
UNCOVERED=0

if [ "${#PROP_DEFS[@]}" -gt 0 ]; then
  for pid in $(echo "${!PROP_DEFS[@]}" | tr ' ' '\n' | sort -V); do
    TEST_COUNT=$(echo "${PROP_TESTS[$pid]:-}" | grep -c '\S' || true)
    FILES=$(echo "${PROP_FILES[$pid]:-}" | tr ' ' '\n' | sort -u | grep '\S' | tr '\n' ' ')
    if [ "$TEST_COUNT" -gt 0 ]; then
      COVERED=$((COVERED + 1))
      echo -e "  ${GREEN}✓${NC} ${BOLD}$pid${NC} — $TEST_COUNT test(s) in: ${DIM}$FILES${NC}"
    else
      UNCOVERED=$((UNCOVERED + 1))
      echo -e "  ${RED}✗${NC} ${BOLD}$pid${NC} — ${RED}NO TESTS${NC} — ${PROP_DEFS[$pid]}"
    fi
  done
  echo ""
  echo -e "  Covered: ${GREEN}$COVERED${NC} / ${#PROP_DEFS[@]}  Uncovered: ${RED}$UNCOVERED${NC}"
else
  # No KB — check what properties tests reference anyway
  echo -e "  ${DIM}(No KB to cross-reference — showing properties referenced in tests)${NC}"
  for pid in $(echo "${!PROP_TESTS[@]}" | tr ' ' '\n' | sort -V); do
    TEST_COUNT=$(echo "${PROP_TESTS[$pid]}" | grep -c '\S' || true)
    echo -e "  ${GREEN}✓${NC} ${BOLD}$pid${NC} — $TEST_COUNT test(s)"
  done
fi
echo ""

# ═══════════════════════════════════════════════════════════════
# 4. Orphan tests — what do they assert?
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}═══ 4. Orphan tests (no property reference) ═══${NC}"
echo ""

if [ ${#ORPHAN_TESTS[@]} -eq 0 ]; then
  echo -e "  ${GREEN}None — all tests reference a property${NC}"
else
  echo -e "  ${YELLOW}${#ORPHAN_TESTS[@]} tests have no property reference.${NC}"
  echo -e "  ${DIM}These may be legitimate (utility tests) or coverage gaming.${NC}"
  echo -e "  ${DIM}Review them manually — look for meaningful assertions.${NC}"
  echo ""
  for orphan in "${ORPHAN_TESTS[@]}"; do
    echo -e "    ${DIM}$orphan${NC}"
  done
fi
echo ""

# ═══════════════════════════════════════════════════════════════
# 5. Assertion quality — weak assertion patterns
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}═══ 5. Assertion quality ═══${NC}"
echo ""

# Count assertions by type
TOTAL_EXPECTS=$(grep -rc "expect(" tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
WEAK_EXPECTS=$(grep -rcP "expect\(.+\)\.(toBeDefined|toBeTruthy|toBeFalsy|not\.toThrow)\b" tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
TYPEOF_EXPECTS=$(grep -rcP "typeof .+ === " tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
NOASSERT_TESTS=$(grep -rlP "^\s*(it|test)\s*\(" tests/ 2>/dev/null | while read f; do
  # Find tests with no expect() call
  python3 -c "
import re, sys
content = open('$f').read()
tests = re.findall(r'(it|test)\s*\([^)]+,\s*(async\s*)?\(\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}', content)
for t in tests:
    body = t[2]
    if 'expect(' not in body and 'assert' not in body.lower():
        # Find the test name
        m = re.search(r\"(it|test)\s*\(['\\\"]([^'\\\"]+)\", content)
        if m: print(f'$f: {m.group(2)}')
" 2>/dev/null
done | wc -l)

echo -e "  Total expect() calls:        ${BOLD}$TOTAL_EXPECTS${NC}"
echo -e "  Weak assertions:             ${YELLOW}$WEAK_EXPECTS${NC} (toBeDefined/toBeTruthy/toBeFalsy/not.toThrow)"
echo -e "  typeof checks:               ${DIM}$TYPEOF_EXPECTS${NC}"
if [ "$TOTAL_EXPECTS" -gt 0 ]; then
  WEAK_PCT=$((WEAK_EXPECTS * 100 / TOTAL_EXPECTS))
  echo -e "  Weak assertion ratio:        ${BOLD}${WEAK_PCT}%${NC}"
fi
echo ""

# List files with highest ratio of weak assertions
echo -e "  ${DIM}Files with weak assertions:${NC}"
grep -rlP "expect\(.+\)\.(toBeDefined|toBeTruthy|toBeFalsy)\b" tests/ 2>/dev/null | while read f; do
  TOTAL_IN_FILE=$(grep -c "expect(" "$f" 2>/dev/null || echo 0)
  WEAK_IN_FILE=$(grep -cP "expect\(.+\)\.(toBeDefined|toBeTruthy|toBeFalsy)\b" "$f" 2>/dev/null || echo 0)
  if [ "$TOTAL_IN_FILE" -gt 0 ]; then
    PCT=$((WEAK_IN_FILE * 100 / TOTAL_IN_FILE))
    if [ "$PCT" -ge 30 ]; then
      echo -e "    ${RED}$(basename "$f")${NC}: $WEAK_IN_FILE/$TOTAL_IN_FILE weak (${PCT}%)"
    else
      echo -e "    ${DIM}$(basename "$f")${NC}: $WEAK_IN_FILE/$TOTAL_IN_FILE weak (${PCT}%)"
    fi
  fi
done
echo ""

# ═══════════════════════════════════════════════════════════════
# 6. Verdict
# ═══════════════════════════════════════════════════════════════

echo -e "${BOLD}━━━ Verdict ━━━${NC}"
echo ""

TRACE_PCT=$(( TOTAL_TESTS > 0 ? TRACED_TESTS * 100 / TOTAL_TESTS : 0 ))
WEAK_PCT=$(( TOTAL_EXPECTS > 0 ? WEAK_EXPECTS * 100 / TOTAL_EXPECTS : 0 ))

GAMING=false

if [ "$TRACE_PCT" -lt 50 ]; then
  echo -e "  ${RED}✗${NC} Low traceability: only ${TRACE_PCT}% of tests reference a spec property"
  GAMING=true
fi

if [ "$WEAK_PCT" -gt 20 ]; then
  echo -e "  ${RED}✗${NC} High weak-assertion ratio: ${WEAK_PCT}% of assertions are toBeDefined/toBeTruthy"
  GAMING=true
fi

if [ "$UNCOVERED" -gt 0 ] && [ "${#PROP_DEFS[@]}" -gt 0 ]; then
  UNCOV_PCT=$((UNCOVERED * 100 / ${#PROP_DEFS[@]}))
  if [ "$UNCOV_PCT" -gt 20 ]; then
    echo -e "  ${RED}✗${NC} ${UNCOV_PCT}% of spec properties have no tests"
    GAMING=true
  fi
fi

if [ "$GAMING" = false ]; then
  echo -e "  ${GREEN}✓${NC} Tests appear to be specification-driven, not coverage-driven"
  echo -e "    Traceability: ${TRACE_PCT}% | Weak assertions: ${WEAK_PCT}% | Properties covered: ${COVERED}/${#PROP_DEFS[@]}"
else
  echo -e ""
  echo -e "  ${YELLOW}Review the orphan tests and weak assertions above.${NC}"
  echo -e "  ${YELLOW}Tests may be inflating coverage without verifying behavior.${NC}"
fi

echo ""
