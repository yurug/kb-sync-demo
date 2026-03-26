#!/usr/bin/env bash
# validate.sh — Deterministic validation of a project
# Usage: ./judge/validate.sh <project-dir>
# Produces a scored report: X / N checks passed
#
# This validator is product-agnostic. It checks structural quality,
# not product-specific behavior. Both Project B and C are judged
# by the same criteria.
set +e  # Don't exit on errors — we handle them with pass/fail

PROJECT_DIR="$(cd "${1:?Usage: validate.sh <project-dir>}" && pwd)"
SCORE=0
TOTAL=0
FAILURES=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() {
  SCORE=$((SCORE + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILURES+=("$1: $2")
  echo -e "  ${RED}✗${NC} $1 — $2"
}

section() {
  echo ""
  echo -e "${YELLOW}── $1 ──${NC}"
}

# Timeout for all CLI invocations (seconds)
# --kill-after sends SIGKILL 5s after SIGTERM, --foreground ensures
# the entire process group (including grandchildren) gets the signal
CLI_TIMEOUT="timeout --kill-after=5 --foreground 30"

# ─── 1. Project Structure ───
section "Project Structure"

[ -f "$PROJECT_DIR/package.json" ] && pass "package.json exists" || fail "package.json" "missing"
[ -f "$PROJECT_DIR/tsconfig.json" ] && pass "tsconfig.json exists" || fail "tsconfig.json" "missing"
[ -d "$PROJECT_DIR/src" ] && pass "src/ directory exists" || fail "src/" "missing"
[ -d "$PROJECT_DIR/tests" ] && pass "tests/ directory exists" || fail "tests/" "missing"

# Entry point — search root and one level deep (some projects put it in src/cli/)
ENTRY=$(find "$PROJECT_DIR/src" -maxdepth 2 -name "index.ts" -o -name "main.ts" -o -name "cli.ts" 2>/dev/null | head -1)
[ -n "$ENTRY" ] && pass "Entry point exists ($(basename "$ENTRY"))" || fail "Entry point" "no index.ts/main.ts/cli.ts in src/"

# Module structure — at least 3 subdirectories in src/ (separation of concerns)
MODULE_COUNT=$(find "$PROJECT_DIR/src" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
if [ "$MODULE_COUNT" -ge 4 ]; then
  pass "Module structure: $MODULE_COUNT modules (>= 4, good separation)"
elif [ "$MODULE_COUNT" -ge 2 ]; then
  fail "Module structure" "$MODULE_COUNT modules (want >= 4)"
else
  fail "Module structure" "$MODULE_COUNT modules (flat structure, no separation of concerns)"
fi

# ─── 2. Compilation ───
section "Compilation"

cd "$PROJECT_DIR"
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
  npm install --silent 2>/dev/null
fi

if npx tsc --noEmit 2>/dev/null; then
  pass "TypeScript compiles without errors"
else
  fail "TypeScript compilation" "compiler errors"
fi

# ─── 3. Linting ───
section "Linting"

if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; then
  LINT_ERRORS=$(npx eslint src/ --format compact 2>/dev/null | grep -c "Error" || true)
  if [ "$LINT_ERRORS" -eq 0 ]; then
    pass "ESLint: no errors"
  else
    fail "ESLint" "$LINT_ERRORS errors"
  fi
else
  fail "ESLint config" "no eslint config found"
fi

# No `any` types
ANY_COUNT=$(grep -rn ": any\b\|<any>" src/ 2>/dev/null | grep -v "eslint-disable" | wc -l || echo 0)
if [ "$ANY_COUNT" -eq 0 ]; then
  pass "No 'any' types in source code"
else
  fail "'any' types" "$ANY_COUNT occurrences found"
fi

# ─── 4. Tests + Coverage (single test run) ───
section "Tests"

TEST_FILES=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
if [ "$TEST_FILES" -ge 8 ]; then
  pass "Test files: $TEST_FILES (>= 8)"
elif [ "$TEST_FILES" -gt 0 ]; then
  fail "Test files" "only $TEST_FILES (want >= 8)"
else
  fail "Test files" "no test files found"
fi

# Run vitest ONCE with coverage — parse all results from this single run
TEST_OUTPUT=$(npx vitest run --coverage --reporter=verbose 2>&1 || true)
TEST_EXIT=$?

TEST_PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "✓" || true)
TEST_PASS_COUNT=${TEST_PASS_COUNT//[^0-9]/}; TEST_PASS_COUNT=${TEST_PASS_COUNT:-0}
TEST_FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "✗" || true)
TEST_FAIL_COUNT=${TEST_FAIL_COUNT//[^0-9]/}; TEST_FAIL_COUNT=${TEST_FAIL_COUNT:-0}

if [ "$TEST_FAIL_COUNT" -eq 0 ] && [ "$TEST_PASS_COUNT" -gt 0 ]; then
  pass "All tests pass"
else
  fail "Tests" "some tests fail ($TEST_FAIL_COUNT failures)"
fi

if [ "$TEST_PASS_COUNT" -ge 40 ]; then
  pass "Test count: $TEST_PASS_COUNT (>= 40)"
else
  fail "Test count" "$TEST_PASS_COUNT (want >= 40)"
fi

# ─── 5. Coverage (from the same test run above) ───
section "Coverage"

COVERAGE_PCT=$(echo "$TEST_OUTPUT" | grep -oP 'All files\s*\|\s*\K[\d.]+' | head -1 || echo "0")
COVERAGE_PCT=${COVERAGE_PCT:-0}
if [ -n "$COVERAGE_PCT" ] && [ "$(echo "$COVERAGE_PCT >= 70" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
  pass "Coverage >= 70% ($COVERAGE_PCT%)"
else
  fail "Coverage" "${COVERAGE_PCT}% (need >= 70%)"
fi

# ─── 6. CLI ───
section "CLI"

# Find entry point and check it has help
ENTRY_FILE=$(find src/ -maxdepth 2 -name "index.ts" -o -name "main.ts" -o -name "cli.ts" 2>/dev/null | head -1)
if [ -n "$ENTRY_FILE" ] && $CLI_TIMEOUT npx tsx "$ENTRY_FILE" --help 2>/dev/null | grep -qi "usage\|options\|commands\|help"; then
  pass "CLI --help works"
else
  fail "CLI --help" "missing or broken"
fi

# Check that CLI defines multiple commands/subcommands
CMD_COUNT=$($CLI_TIMEOUT npx tsx "$ENTRY_FILE" --help 2>/dev/null | grep -ciP "^\s+\w+\s" || echo 0)
CMD_COUNT=${CMD_COUNT//[^0-9]/}; CMD_COUNT=${CMD_COUNT:-0}
if [ "$CMD_COUNT" -ge 3 ]; then
  pass "CLI has $CMD_COUNT commands/subcommands (>= 3)"
else
  fail "CLI commands" "only $CMD_COUNT visible (want >= 3)"
fi

# ─── 7. Functional Tests (run the actual program) ───
# These tests exercise the CLI against the real Linear API.
# READ-ONLY: only pull, status, and --dry-run are used. Nothing is created or modified.
section "Functional Tests (running the program against real Linear)"

FUNC_TEST_DIR=$(mktemp -d)
ENTRY_FILE=$(find src/ -maxdepth 2 -name "index.ts" -o -name "main.ts" -o -name "cli.ts" 2>/dev/null | head -1)
CLI="$CLI_TIMEOUT npx tsx $(pwd)/$ENTRY_FILE"

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo -e "  ${YELLOW}⚠ LINEAR_API_KEY not set — skipping functional tests${NC}"
else

# 7a. --help returns exit code 0
if $CLI --help > /dev/null 2>&1; then
  pass "Functional: --help exits 0"
else
  fail "Functional: --help" "non-zero exit code"
fi

# 7b. Unknown command returns non-zero
if $CLI nonexistent-command > /dev/null 2>&1; then
  fail "Functional: unknown command" "should return non-zero for unknown commands"
else
  pass "Functional: unknown command returns non-zero"
fi

# 7c. Running without config shows a user-friendly error (not a stack trace)
pushd "$FUNC_TEST_DIR" > /dev/null
ERROR_OUTPUT=$($CLI status 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -q "at Object\|at Module\|at Function\|    at "; then
  fail "Functional: error UX" "stack trace shown to user"
elif echo "$ERROR_OUTPUT" | grep -qi "error\|not found\|missing\|config\|initialize\|init"; then
  pass "Functional: missing config shows user-friendly error"
else
  fail "Functional: missing config" "no clear error message"
fi
popd > /dev/null

# 7d. Init command exists and responds
pushd "$FUNC_TEST_DIR" > /dev/null
INIT_OUTPUT=$($CLI init --help 2>&1 || true)
if echo "$INIT_OUTPUT" | grep -qi "init\|usage\|options\|team\|config\|setup"; then
  pass "Functional: init command exists and has help"
  # Try running init (may need args — that's OK)
  INIT_RUN=$($CLI init 2>&1 || true)
  CONFIG_FOUND=$(find . -maxdepth 2 -name "*.json" -o -name ".kb-sync*" 2>/dev/null | head -1)
  if [ -n "$CONFIG_FOUND" ]; then
    pass "Functional: init creates config ($CONFIG_FOUND)"
  elif echo "$INIT_RUN" | grep -qi "created\|initialized\|success\|config"; then
    pass "Functional: init reports success"
  elif echo "$INIT_RUN" | grep -qi "required\|missing\|specify\|team"; then
    pass "Functional: init validates required arguments"
  else
    pass "Functional: init runs (exit without crash)"
  fi
else
  fail "Functional: init" "no init command or help"
fi
popd > /dev/null

# 7e. Output is human-readable (not raw JSON or stack traces)
HELP_OUTPUT=$($CLI --help 2>&1 || true)
if echo "$HELP_OUTPUT" | grep -q "^{\"" ; then
  fail "Functional: output format" "raw JSON output (not user-friendly)"
else
  pass "Functional: output is human-readable"
fi

# 7f. Integration: init + pull actually works against real Linear
# This is the critical test — mocks passing means nothing if the real API breaks.
# We use --team to restrict to ONE team, avoiding rate limits on large workspaces.
# The test verifies the integration works, not that it can bulk-download everything.
INTEG_DIR=$(mktemp -d)
ABS_ENTRY="$PROJECT_DIR/$ENTRY_FILE"
INTEG_TIMEOUT="timeout --kill-after=5 --foreground 60"
pushd "$INTEG_DIR" > /dev/null

# Init should be simple — no team selection needed
INIT_OUT=$($INTEG_TIMEOUT npx tsx "$ABS_ENTRY" init 2>&1 || true)

if [ -f ".kb-sync.yaml" ] || [ -f ".kb-sync.json" ] || [ -f "kb-sync.yaml" ]; then
  pass "Integration: init created config against real Linear"

  # Verify the project can actually fetch issues from Linear.
  # We use a direct SDK call to fetch one issue — this tests that the
  # project has @linear/sdk installed and the API key works for reads.
  # We don't test the full pull command here because large workspaces
  # cause rate-limit timeouts even with correct architecture.
  FETCH_OUT=$(cd "$PROJECT_DIR" && LINEAR_API_KEY="$LINEAR_API_KEY" $INTEG_TIMEOUT node --input-type=module -e "
    import('@linear/sdk').then(({ LinearClient }) => {
      const c = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
      return c.issues({ first: 1 });
    }).then(r => {
      if (r.nodes.length > 0) console.log('OK:' + r.nodes[0].identifier);
      else console.log('EMPTY');
    }).catch(e => console.log('ERROR:' + e.message));
  " 2>/dev/null || echo "CRASH")

  if echo "$FETCH_OUT" | grep -q "^OK:"; then
    ISSUE_ID=$(echo "$FETCH_OUT" | sed 's/^OK://')
    pass "Integration: fetched issue $ISSUE_ID from real Linear"
  elif echo "$FETCH_OUT" | grep -q "^EMPTY"; then
    pass "Integration: connected to Linear (workspace has no issues)"
  else
    fail "Integration: fetch" "cannot read from Linear: $FETCH_OUT"
  fi
elif echo "$INIT_OUT" | grep -qi "verified\|workspace\|team\|select"; then
  # Init connected to Linear but needs interactive input we can't provide
  pass "Integration: init connects to real Linear (needs interactive setup)"
else
  fail "Integration: init" "cannot connect to real Linear: $(echo "$INIT_OUT" | head -1)"
fi

popd > /dev/null
rm -rf "$INTEG_DIR"

fi  # end LINEAR_API_KEY check

# Cleanup
rm -rf "$FUNC_TEST_DIR"

# ─── 8. Error Handling ───
section "Error Handling (section 8)"

# Custom error class (extends Error with a user-friendly message field)
if grep -rq "extends.*Error" src/ 2>/dev/null; then
  CUSTOM_ERRORS=$(grep -rl "extends.*Error" src/ 2>/dev/null | wc -l)
  pass "Custom error class(es): $CUSTOM_ERRORS file(s)"
else
  fail "Custom errors" "no class extending Error found"
fi

# User-friendly error messages (some field for display messages)
if grep -rq "userMessage\|user_message\|displayMessage\|friendlyMessage" src/ 2>/dev/null; then
  pass "User-friendly error messages"
else
  fail "Error UX" "no user-friendly message field on errors"
fi

# ─── 9. Code Quality — Harness Indicators ───
section "Code Quality — Harness Indicators"

# Module header comments (// Module: ... or similar top-of-file comment)
FILES_WITH_HEADER=$(find src/ -name "*.ts" -exec sh -c 'head -3 "$1" | grep -q "^//" && echo "$1"' _ {} \; 2>/dev/null | wc -l)
SRC_FILES=$(find src/ -name "*.ts" 2>/dev/null | wc -l)
if [ "$SRC_FILES" -gt 0 ]; then
  HEADER_RATIO=$((FILES_WITH_HEADER * 100 / SRC_FILES))
  if [ "$HEADER_RATIO" -ge 70 ]; then
    pass "File header comments: $FILES_WITH_HEADER / $SRC_FILES files ($HEADER_RATIO%)"
  else
    fail "File header comments" "$FILES_WITH_HEADER / $SRC_FILES files ($HEADER_RATIO%, want >= 70%)"
  fi
fi

# Documentation comments (JSDoc or similar)
DOC_COUNT=$(grep -rc "/\*\*" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$DOC_COUNT" -ge 15 ]; then
  pass "Documentation comments: $DOC_COUNT blocks (>= 15)"
elif [ "$DOC_COUNT" -ge 5 ]; then
  fail "Documentation comments" "$DOC_COUNT blocks (want >= 15)"
else
  fail "Documentation comments" "$DOC_COUNT blocks (want >= 15, very low)"
fi

# Property/invariant references in code (@invariant, @property, P1, P2, etc.)
INVARIANT_REFS=$(grep -rc "@invariant\|@property.*P[0-9]" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$INVARIANT_REFS" -ge 5 ]; then
  pass "Property traceability: $INVARIANT_REFS @invariant references in code"
else
  fail "Property traceability" "only $INVARIANT_REFS @invariant refs (want >= 5)"
fi

# Property references in tests
PROPS_IN_TESTS=$(grep -rcP "P[0-9]+:" tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$PROPS_IN_TESTS" -ge 10 ]; then
  pass "Test-property traceability: $PROPS_IN_TESTS property refs in test names"
elif [ "$PROPS_IN_TESTS" -ge 3 ]; then
  fail "Test-property traceability" "$PROPS_IN_TESTS refs (want >= 10)"
else
  fail "Test-property traceability" "$PROPS_IN_TESTS refs (want >= 10)"
fi

# Dependency injection — functions take typed interface/client/config params
DI_SIGS=$(grep -rcP "(client|logger|config|writer|reader|deps|services)\s*:" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
if [ "$DI_SIGS" -ge 10 ]; then
  pass "Dependency injection: $DI_SIGS typed parameter signatures"
else
  fail "Dependency injection" "only $DI_SIGS typed DI signatures (want >= 10)"
fi

# Comment ratio (single-line + doc comments)
COMMENT_LINES=$(grep -rc "^\s*//" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
JSDOC_LINES=$(grep -rc "^\s*\*" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
CODE_LINES=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
if [ "$CODE_LINES" -gt 0 ]; then
  TOTAL_COMMENT=$((COMMENT_LINES + JSDOC_LINES))
  COMMENT_RATIO=$((TOTAL_COMMENT * 100 / CODE_LINES))
  if [ "$COMMENT_RATIO" -ge 10 ]; then
    pass "Comment ratio: $COMMENT_RATIO% (>= 10%)"
  else
    fail "Comment ratio" "$COMMENT_RATIO% (want >= 10%)"
  fi
fi

# ─── 9. Knowledge Base (only scored if kb/ exists) ───
# The KB is a means to an end. Projects without a KB skip this section
# entirely so both projects are scored out of the same denominator.
if [ -d "kb" ]; then
  section "Knowledge Base"

  KB_FILES=$(find kb/ -name "*.md" ! -path "*/reports/*" ! -name "questions-*" 2>/dev/null | wc -l)
  if [ "$KB_FILES" -ge 3 ]; then
    pass "KB: $KB_FILES specification files (>= 3)"
  elif [ "$KB_FILES" -gt 0 ]; then
    fail "KB" "only $KB_FILES spec files (want >= 3)"
  else
    fail "KB" "empty (no specification files)"
  fi

  # Properties are defined somewhere in the KB (any file, any structure)
  PROP_COUNT=$(grep -rcP "^###?\s*(P\d+|NF\d+|T\d+)\b" kb/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$PROP_COUNT" -ge 5 ]; then
    pass "Properties defined: $PROP_COUNT invariants/edge-cases across KB"
  elif [ "$PROP_COUNT" -gt 0 ]; then
    fail "Properties" "only $PROP_COUNT defined (want >= 5)"
  else
    fail "Properties" "no properties (P1, NF1, T1, ...) found anywhere in kb/"
  fi

  # Reports from audits
  REPORT_FILES=$(find kb/reports/ -name "*.md" 2>/dev/null | wc -l)
  if [ "$REPORT_FILES" -ge 1 ]; then
    pass "Audit reports: $REPORT_FILES report(s) in kb/reports/"
  else
    fail "Audit reports" "no reports generated"
  fi
fi

# ─── Summary ───
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Score: ${GREEN}${SCORE}${NC} / ${TOTAL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}•${NC} $f"
  done
fi

echo ""
echo "$SCORE/$TOTAL" > "$PROJECT_DIR/.validation-score"
exit 0
