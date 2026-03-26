#!/usr/bin/env bash
# run-build.sh — Interactive harness-driven build for Project B
#
# Flow:
# 1. Ambiguity resolution: Claude asks questions → emacs → repeat until clear
# 2. KB creation: Claude writes spec, properties, architecture from answers
# 3. Project planning: Claude creates an implementation plan
# 4. Incremental implementation: execute plan step by step with Ralph Loops
# 5. Quality audits and fixes
# 6. Final validation
set +e  # Don't exit on errors — we handle them explicitly

# --auto flag: skip emacs, accept Claude's default answers as-is
AUTO_MODE=false
if [ "${1:-}" = "--auto" ]; then
  AUTO_MODE=true
fi

CLAUDE="claude --dangerously-skip-permissions"
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Helper functions ─────────────────────────────────────────────

show_prompt() {
  local prompt="$1"
  echo -e "${CYAN}┌─ Prompt ──────────────────────────────────────────────${NC}"
  echo "$prompt" | while IFS= read -r line; do
    echo -e "${CYAN}│${NC} ${DIM}$line${NC}"
  done
  echo -e "${CYAN}└───────────────────────────────────────────────────────${NC}"
  echo ""
}

PROGRESS_LOG=".progress.log"

run_claude() {
  local prompt="$1"
  show_prompt "$prompt"

  # Append a logging instruction to the prompt so Claude reports progress
  local full_prompt="$prompt

IMPORTANT: As you work, append short progress lines to the file $PROGRESS_LOG (one line per action):
- When you read a file: echo '📖 Reading <filename>' >> $PROGRESS_LOG
- When you write a file: echo '✏️  Writing <filename>' >> $PROGRESS_LOG
- When you run a command: echo '▶ Running <command>' >> $PROGRESS_LOG
- When you find an issue: echo '⚠ Found: <short description>' >> $PROGRESS_LOG
- When you fix something: echo '✓ Fixed: <short description>' >> $PROGRESS_LOG
- When you finish: echo '✅ Done' >> $PROGRESS_LOG
Keep lines short (< 80 chars). This log is displayed live to the audience."

  # Start tail -f in background to show progress live
  touch "$PROGRESS_LOG"
  tail -f "$PROGRESS_LOG" &
  local TAIL_PID=$!

  $CLAUDE -p "$full_prompt" < /dev/null 2>&1

  # Stop the tail
  sleep 0.5
  kill $TAIL_PID 2>/dev/null
  wait $TAIL_PID 2>/dev/null
  echo "" > "$PROGRESS_LOG"
}

show_skill() {
  local skill="$1"
  local description="$2"
  echo -e "${YELLOW}▶ Skill: ${BOLD}$skill${NC}"
  echo -e "  ${DIM}$description${NC}"
  echo ""
}

show_ralph_loop() {
  local iteration="$1"
  local max="$2"
  echo -e "${CYAN}⟳ Ralph Loop — iteration $iteration / $max${NC}"
}

kb_summary() {
  echo ""
  echo -e "${CYAN}── KB State ──${NC}"
  if [ -d "kb" ]; then
    local total=$(find kb/ -name "*.md" 2>/dev/null | wc -l)
    if [ "$total" -gt 0 ]; then
      find kb/ -name "*.md" 2>/dev/null | sort | while read -r f; do
        local lines=$(wc -l < "$f")
        local firstline=$(head -1 "$f" | sed 's/^#* *//')
        echo -e "  ${GREEN}●${NC} $f ${DIM}(${lines}L) — $firstline${NC}"
      done
      echo -e "  ${BOLD}$total files${NC} in kb/"
    else
      echo -e "  ${DIM}(empty)${NC}"
    fi
  else
    echo -e "  ${DIM}(empty)${NC}"
  fi
  echo ""
}

kb_diff() {
  # Show what changed in kb/ since last commit
  local changes=$(git diff --name-only HEAD -- kb/ 2>/dev/null)
  local new=$(git ls-files --others --exclude-standard -- kb/ 2>/dev/null)
  if [ -n "$changes" ] || [ -n "$new" ]; then
    echo -e "${CYAN}── KB Changes ──${NC}"
    echo "$new" | while IFS= read -r f; do
      [ -n "$f" ] && echo -e "  ${GREEN}+ NEW${NC}  $f"
    done
    echo "$changes" | while IFS= read -r f; do
      [ -n "$f" ] && echo -e "  ${YELLOW}~ MOD${NC}  $f"
    done
    echo ""
  fi
}

validate() {
  # Validates against the quality standards defined in CLAUDE.md.
  # This is the harness's own rubric — not an external judge.
  echo ""
  echo -e "${CYAN}── Validation (CLAUDE.md quality standards) ──${NC}"

  # ── Compilation ──
  if npx tsc --noEmit 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} TypeScript compiles"
  else
    echo -e "  ${RED}✗${NC} TypeScript compilation failed"
  fi

  # ── Tests ──
  local test_output=$(npx vitest run 2>&1 || true)
  local pass=$(echo "$test_output" | grep -c "✓" || true)
  pass=${pass//[^0-9]/}; pass=${pass:-0}
  local fail=$(echo "$test_output" | grep -c "✗" || true)
  fail=${fail//[^0-9]/}; fail=${fail:-0}
  if [ "$fail" -eq 0 ] && [ "$pass" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} Tests: $pass passed"
  elif [ "$pass" -gt 0 ]; then
    echo -e "  ${RED}✗${NC} Tests: $pass passed, $fail failed"
  else
    echo -e "  ${DIM}-${NC} No tests yet"
  fi

  # ── Code stats ──
  local src_files=$(find src/ -name "*.ts" 2>/dev/null | wc -l)
  local src_lines=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  local test_files=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
  echo -e "  ${DIM}Code: $src_files files, $src_lines lines | Tests: $test_files files, $pass cases${NC}"

  # ── CLAUDE.md quality standards (harness-native checks) ──

  # Architecture: >= 4 src subdirectories (CLAUDE.md: "At least 4 subdirectories")
  local module_count=$(find src/ -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  if [ "$module_count" -ge 4 ]; then
    echo -e "  ${GREEN}✓${NC} Module structure: $module_count modules"
  else
    echo -e "  ${RED}✗${NC} Module structure: $module_count modules (CLAUDE.md requires >= 4)"
  fi

  # No 'any' types (CLAUDE.md: "No any types")
  local any_count=$(grep -rn ": any\b\|<any>" src/ 2>/dev/null | grep -v "eslint-disable" | wc -l || echo 0)
  if [ "$any_count" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} No 'any' types"
  else
    echo -e "  ${RED}✗${NC} Found $any_count 'any' types in src/ (CLAUDE.md forbids any)"
  fi

  # Custom error hierarchy with userMessage (CLAUDE.md: "custom error hierarchy with user-facing messages")
  if grep -rq "userMessage\|user_message\|displayMessage" src/ 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Error hierarchy with user-facing messages"
  else
    echo -e "  ${RED}✗${NC} No userMessage field on errors (CLAUDE.md requires typed error hierarchy)"
  fi

  # Literate programming: file headers (CLAUDE.md: "Every file starts with a block comment")
  local files_with_header=$(find src/ -name "*.ts" -exec sh -c 'head -3 "$1" | grep -q "^//" && echo "$1"' _ {} \; 2>/dev/null | wc -l)
  if [ "$src_files" -gt 0 ]; then
    local header_pct=$((files_with_header * 100 / src_files))
    if [ "$header_pct" -ge 70 ]; then
      echo -e "  ${GREEN}✓${NC} File headers: $files_with_header/$src_files files ($header_pct%)"
    else
      echo -e "  ${RED}✗${NC} File headers: $files_with_header/$src_files files ($header_pct%, CLAUDE.md requires headers on every file)"
    fi
  fi

  # Comment ratio (CLAUDE.md: ">= 20%")
  if [ "$src_lines" -gt 0 ]; then
    local comment_lines=$(grep -rc "^\s*//" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
    local jsdoc_lines=$(grep -rc "^\s*\*" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
    local total_comment=$((comment_lines + jsdoc_lines))
    local comment_ratio=$((total_comment * 100 / src_lines))
    if [ "$comment_ratio" -ge 20 ]; then
      echo -e "  ${GREEN}✓${NC} Comment ratio: $comment_ratio% (target >= 20%)"
    else
      echo -e "  ${RED}✗${NC} Comment ratio: $comment_ratio% (CLAUDE.md target >= 20%)"
    fi
  fi

  # @invariant references (CLAUDE.md: "Reference properties from kb/properties/ in JSDoc")
  local invariant_refs=$(grep -rc "@invariant" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$invariant_refs" -ge 5 ]; then
    echo -e "  ${GREEN}✓${NC} @invariant refs: $invariant_refs in source"
  else
    echo -e "  ${RED}✗${NC} @invariant refs: $invariant_refs (CLAUDE.md requires @invariant P<N> on public functions)"
  fi

  # Property refs in tests (CLAUDE.md: "Every test name starts with property reference")
  local props_in_tests=$(grep -rcP "P[0-9]+:|NF[0-9]+:|T[0-9]+:" tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$props_in_tests" -ge 10 ]; then
    echo -e "  ${GREEN}✓${NC} Property refs in tests: $props_in_tests"
  else
    echo -e "  ${RED}✗${NC} Property refs in tests: $props_in_tests (CLAUDE.md requires property IDs in test names)"
  fi

  # DI signatures (CLAUDE.md: "Dependency injection: pass dependencies as parameters")
  local di_sigs=$(grep -rcP "(client|logger|config|writer|reader|deps|services)\s*:" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$di_sigs" -ge 10 ]; then
    echo -e "  ${GREEN}✓${NC} DI signatures: $di_sigs typed parameters"
  else
    echo -e "  ${RED}✗${NC} DI signatures: $di_sigs (CLAUDE.md requires DI everywhere)"
  fi

  echo ""
}

step_header() {
  local num="$1"
  local name="$2"
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Step $num: $name${NC}"
  echo -e "${DIM}  $(date '+%H:%M:%S')${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

commit() {
  local msg="$1"
  git add -A 2>/dev/null
  git commit -m "$msg" --quiet 2>/dev/null || true
  echo -e "${DIM}  ✓ Committed: $msg${NC}"
}

# ══════════════════════════════════════════════════════════════════
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Project B: Spec-Driven Agentic Development             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  CLAUDE.md:  ${GREEN}✓${NC} methodology + quality standards"
echo -e "  Skills:     ${GREEN}✓${NC} $(ls .claude/skills/*.md 2>/dev/null | wc -l) skills loaded"
echo -e "  KB:         ${YELLOW}empty${NC} — will be built from your answers"
echo ""

mkdir -p kb/indexes kb/domain kb/spec kb/properties kb/architecture/decisions kb/external kb/conventions kb/runbooks kb/reports

# ══════════════════════════════════════════════════════════════════
# PHASE 1: Ambiguity Resolution (interactive with emacs)
# ══════════════════════════════════════════════════════════════════

step_header 1 "Ambiguity Resolution"

show_skill "product-manager" "Generate questions to eliminate all blind spots before coding"

echo -e "Claude will generate questions. You answer in emacs."
echo -e "Repeat until there are no more blind spots."
echo ""

ROUND=1
while true; do
  QUESTION_FILE="kb/questions-round${ROUND}.md"

  if [ "$ROUND" -eq 1 ]; then
    QPROMPT="You are building a TypeScript CLI tool called kb-sync that bidirectionally syncs a local knowledge base (directory of markdown files with YAML frontmatter) with Linear.

Read CLAUDE.md to understand the quality standards and approach.
Read .claude/skills/ to understand the available skills.

Before writing ANY code, you need to resolve all ambiguities. Generate a comprehensive list of questions grouped by topic. For each question, propose a default answer based on your best judgement and industry best practices.

Format each entry as:
**N. [Question]**
Default: [Your proposed answer]

Cover: features, data model, sync semantics, conflict resolution, error handling, UX, security, testing strategy, architecture decisions, edge cases.

IMPORTANT — these topics MUST be covered in your questions (they caused bugs in previous runs):
- Does pull fetch ALL issues from ALL teams, or only one team? (Answer: ALL teams by default, --team restricts)
- Does init require team selection? (Answer: NO, just creates config, all teams synced by default)
- What config file format: JSON or YAML? (Answer: JSON, .kb-sync.json)
- Should error messages show the actual cause or a generic wrapper? (Answer: actual cause)
- How to verify the CLI works against the REAL Linear API, not just mocks?
- The target Linear workspace has 19 teams and thousands of issues. The Linear API rate limit is 1500 requests/hour (~25/min). How should the client handle this? (Answer: serialize bulk-fetch requests — do NOT use Promise.all for multiple paginated queries; run them sequentially to avoid bursting. Use at least 5 retries with longer backoff: 2s, 4s, 8s, 16s, 32s. Add a small delay between paginated pages if the workspace is large.)

Write to $QUESTION_FILE. The user will review your proposed answers in emacs, editing any they disagree with."
  else
    PREV_FILE="kb/questions-round$((ROUND - 1)).md"
    QPROMPT="Read CLAUDE.md and all files in kb/.
Read the reviewed questions and answers in $PREV_FILE.

Based on the answers (the user may have edited your defaults), do you have follow-up questions or new ambiguities?

If YES: write them to $QUESTION_FILE in the same format (question + proposed default answer).
If NO: write a single line to $QUESTION_FILE: 'NO_MORE_QUESTIONS — all ambiguities resolved.'

Be thorough. It is better to ask one more round than to guess during implementation."
  fi

  echo -e "${CYAN}⟳ Ambiguity round $ROUND${NC}"
  run_claude "$QPROMPT"

  # Check if Claude says no more questions
  if grep -q "NO_MORE_QUESTIONS" "$QUESTION_FILE" 2>/dev/null; then
    echo ""
    echo -e "${GREEN}✓ All ambiguities resolved after $((ROUND - 1)) round(s).${NC}"
    break
  fi

  if [ "$AUTO_MODE" = true ]; then
    echo ""
    echo -e "${YELLOW}[auto] Accepting Claude's default answers for round $ROUND${NC}"
    # In auto mode, limit to 2 rounds (propose + one follow-up)
    if [ "$ROUND" -ge 2 ]; then
      echo -e "${YELLOW}[auto] Max rounds reached — proceeding to KB creation${NC}"
      commit "Ambiguity resolution: round $ROUND (auto)"
      break
    fi
  else
    echo ""
    echo -e "${YELLOW}Questions with proposed answers ready:${NC} $QUESTION_FILE"
    echo -e "${BOLD}Opening emacs — review defaults, edit what you disagree with, save and exit.${NC}"
    echo -e "${DIM}(Save: C-x C-s | Exit: C-x C-c)${NC}"
    echo ""

    # emacs needs direct terminal access — redirect to /dev/tty
    emacs -nw "$QUESTION_FILE" < /dev/tty > /dev/tty 2>&1 || true
  fi

  kb_diff
  commit "Ambiguity resolution: round $ROUND"
  ROUND=$((ROUND + 1))
done

commit "Ambiguity resolution complete"
kb_summary

# ══════════════════════════════════════════════════════════════════
# PHASE 2: KB Creation
# ══════════════════════════════════════════════════════════════════

step_header 2 "Knowledge Base Creation"

show_skill "architect" "Build spec, properties, and architecture from your answers"

KB_PROMPT="Read CLAUDE.md carefully — especially 'Phase 2: Knowledge Base Creation' (the required KB
structure) and 'KB Document Quality Standards' (the file template). Read all answered question
files in kb/questions-*.md.

You are building an AGENT-OPTIMIZED knowledge base. Key principle: agents need precise context
cheaply (few tokens, few hops). Every file must be self-sufficient. Indexes are routing tables.
Many small files beat few large ones.

Create the following directory structure and files:

STEP 1 — SCAFFOLDING (create directories first):
  mkdir -p kb/indexes kb/domain kb/spec kb/properties kb/architecture/decisions kb/external kb/conventions kb/runbooks kb/reports

STEP 2 — MASTER INDEX (kb/INDEX.md):
  - 2-sentence project summary
  - 'How to use this KB' section: what to read first, then navigate by task
  - Quick-load bundles table: for each goal (implement sync, audit security, add command,
    debug API issues), list the exact files to load in order
  - File count

STEP 3 — GLOSSARY (kb/GLOSSARY.md):
  - Every domain term: frontmatter, sync label, three-way diff, snapshot, etc.
  - Canonical names for concepts used across multiple files

STEP 4 — TASK INDEX (kb/indexes/by-task.md):
  - For each task type (implement, audit, debug, test), list files to load in order
  - Include 'Key questions this answers' per task bundle

STEP 5 — PRODUCT REQUIREMENTS (kb/domain/prd.md):
  - User stories, commands with examples, non-functional expectations, out of scope

STEP 6 — SPEC (split into focused files in kb/spec/):
  - kb/spec/INDEX.md — routing table for spec files
  - kb/spec/data-model.md — entities, fields, types, constraints, defaults
  - kb/spec/algorithms.md — sync protocol, state machines, pseudocode
  - kb/spec/api-contracts.md — inputs, outputs, error codes per interface
  - kb/spec/config-and-formats.md — config schema, file formats with examples
  - kb/spec/error-taxonomy.md — every error type, when it occurs, user message

STEP 7 — PROPERTIES (split into kb/properties/):
  - kb/properties/INDEX.md
  - kb/properties/functional.md — P1, P2, ...: invariants with ID, name, statement, violation example, WHY, test strategy
  - kb/properties/non-functional.md — NF1, NF2, ...: measurable criteria
  - kb/properties/edge-cases.md — T1, T2, ...: boundary conditions, expected behavior

STEP 8 — ARCHITECTURE:
  - kb/architecture/overview.md — module structure, DI pattern, dependency graph, error hierarchy
  - kb/architecture/decisions/INDEX.md — list of ADRs
  - At least 2 ADRs for the most significant design choices (e.g., three-way diff vs timestamp,
    DI interfaces vs classes). Format: Context → Decision → Consequences → What this means for implementers

STEP 9 — EXTERNAL DEPENDENCY RESEARCH (MANDATORY, kb/external/):
  - kb/external/INDEX.md — routing table for external systems
  - One file per third-party SDK/API (e.g., kb/external/linear-sdk.md)
  - Document ACTUAL RUNTIME BEHAVIOR, not just the public API:
    * Lazy-loading: do relation fields (.assignee, .labels(), .state) trigger separate API calls?
      If yes: fetching N issues with 5 lazy relations = 1 + 5N calls. This must be explicit.
    * Pagination: page size, cursor-based vs offset, how to get all results
    * Rate limiting: requests/minute, what triggers 429s, backoff expectations
    * Batching: can multiple entities be fetched in one call?
    * REQUEST BUDGET: for a workspace with 500 issues, how many API calls does a full pull
      require? If >100, the architecture MUST use bulk-fetch-then-join (fetch all users/labels/states
      once, resolve locally) instead of per-entity lazy loading.

STEP 10 — CONVENTIONS (kb/conventions/):
  - kb/conventions/code-style.md — naming, file structure, patterns to follow/avoid
  - kb/conventions/error-handling.md — how errors are typed, propagated, surfaced to user
  - kb/conventions/testing-strategy.md — test levels, mocking rules, coverage targets

STEP 11 — RUNBOOKS (kb/runbooks/):
  - kb/runbooks/audit-checklist.md — structured checklist for quality audits

Every content file MUST use the template from CLAUDE.md (frontmatter with id/domain/related,
One-liner, Scope, Agent notes, Related files sections).
Cross-reference between files using relative paths.
The PRD answers 'are we building the right product?' The spec answers 'are we building the product right?'"
run_claude "$KB_PROMPT"

kb_diff
kb_summary
commit "KB created from ambiguity resolution answers"

# ══════════════════════════════════════════════════════════════════
# PHASE 2b: KB Audit
# ══════════════════════════════════════════════════════════════════

echo -e "${YELLOW}── KB Audit Ralph Loop ──${NC}"
show_skill "ambiguity-auditor" "Check KB for gaps, fix critical findings (max 3 iterations)"

KB_AUDIT_MAX=3
KB_AUDIT_ITER=0
while true; do
  KB_AUDIT_ITER=$((KB_AUDIT_ITER + 1))
  show_ralph_loop "$KB_AUDIT_ITER" "$KB_AUDIT_MAX"

  AUDIT_KB_PROMPT="Read all files in kb/. You are the ambiguity auditor.

STRUCTURAL CHECK (verify KB is agent-navigable):
- Does kb/INDEX.md exist with quick-load bundles table?
- Does kb/indexes/by-task.md cover implement/audit/debug/test with file lists?
- Does kb/GLOSSARY.md define all domain terms?
- Does every content file have: frontmatter (id, domain, related), One-liner, Scope, Agent notes, Related files?
- Are all cross-references valid (no broken links)?
- Does every directory with >1 file have an INDEX.md routing table?
- Does kb/external/ have a file per third-party SDK with request cost model?
Missing structural elements are CRITICAL findings.

CONTENT CHECK (for each file):
Identify: gaps (something not specified), unknowns (uncertainties),
contradictions (conflicting statements), vague language ('should', 'might', 'etc.').
Rate each finding: CRITICAL / HIGH / MEDIUM / LOW.
Write to kb/reports/ambiguity-audit.md.

IMPORTANT: At the END of the report, write a single summary line in this exact format:
SUMMARY: X critical, Y high, Z medium, W low
Then fix every CRITICAL finding in the relevant kb/ file."
  run_claude "$AUDIT_KB_PROMPT"

  echo -e "${CYAN}── Audit Results ──${NC}"
  if [ -f "kb/reports/ambiguity-audit.md" ]; then
    head -20 kb/reports/ambiguity-audit.md
    echo -e "${DIM}  ...${NC}"
  fi

  # ── Feedback: parse the SUMMARY line for critical count ──
  CRITICAL_COUNT=0
  if [ -f "kb/reports/ambiguity-audit.md" ]; then
    SUMMARY_LINE=$(grep -i "^SUMMARY:" kb/reports/ambiguity-audit.md 2>/dev/null | tail -1)
    if [ -n "$SUMMARY_LINE" ]; then
      CRITICAL_COUNT=$(echo "$SUMMARY_LINE" | grep -oP '\d+(?=\s*critical)' || echo 0)
      CRITICAL_COUNT=${CRITICAL_COUNT//[^0-9]/}; CRITICAL_COUNT=${CRITICAL_COUNT:-0}
    fi
  fi

  kb_diff
  commit "KB audit: iteration $KB_AUDIT_ITER ($CRITICAL_COUNT critical findings)"

  if [ "$CRITICAL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}  ✓ KB audit converged — no critical findings${NC}"
    break
  elif [ "$KB_AUDIT_ITER" -ge "$KB_AUDIT_MAX" ]; then
    echo -e "${YELLOW}  ⚠ KB audit reached max iterations ($KB_AUDIT_MAX) — proceeding with $CRITICAL_COUNT remaining criticals${NC}"
    break
  else
    echo -e "${YELLOW}  ⟳ $CRITICAL_COUNT critical findings — iterating...${NC}"
  fi
done

# ══════════════════════════════════════════════════════════════════
# PHASE 2c: Harness Validation (before implementation starts)
# ══════════════════════════════════════════════════════════════════

echo -e "${YELLOW}── Harness Validation ──${NC}"
show_skill "harness-validator" "Is the harness ready for implementation? KB complete? Skills coherent?"

HARNESS_PRE_PROMPT="Read CLAUDE.md, all files in kb/, and all skills in .claude/skills/.

Validate that the harness is ready for implementation:
- Does kb/INDEX.md exist and provide correct routing to all KB files?
- Does kb/indexes/by-task.md cover implement/audit/debug/test task types?
- Do the kb/spec/ files cover all features with enough detail to implement without questions?
- Do the kb/properties/ files cover all invariants needed for correctness?
- Does kb/architecture/overview.md define a clear module structure?
- Does kb/domain/prd.md exist and align with kb/spec/?
- Does kb/external/ have a file for every third-party SDK, with request cost model?
- Are all cross-references (Related files, Agent notes) valid — no broken links?
- Are the skills coherent? Do they reference the right KB files?
- Is the feedback loop defined? (what gets tested, how)

Write to kb/reports/harness-validation.md.
Fix any issues in the KB (add missing content, fix cross-references, resolve gaps).
Do NOT proceed to implementation if the harness has critical gaps."
run_claude "$HARNESS_PRE_PROMPT"

echo -e "${CYAN}── Harness Readiness ──${NC}"
if [ -f "kb/reports/harness-validation.md" ]; then
  head -15 kb/reports/harness-validation.md
  echo -e "${DIM}  ...${NC}"
fi
kb_diff
commit "Harness validation: pre-implementation check"

# ══════════════════════════════════════════════════════════════════
# PHASE 3: Project Planning
# ══════════════════════════════════════════════════════════════════

step_header 3 "Project Planning"

show_skill "project-manager" "Create an incremental implementation plan"

PLAN_PROMPT="Read CLAUDE.md and all files in kb/.

Create kb/plan.md — a step-by-step implementation plan.

CRITICAL CONSTRAINT — VERTICAL SLICE FIRST:
Step 1 MUST produce a minimal but RUNNING CLI. This means:
- src/index.ts with shebang, commander setup, and at least init + pull commands registered
- Minimal types, config loader, error base class
- A real (even if simplified) Linear client that can fetch issues
- File writer that produces markdown files
- After step 1: 'npx tsx src/index.ts --help' MUST show commands, and
  'npx tsx src/index.ts init && npx tsx src/index.ts pull' MUST produce files
  when run against a real Linear workspace.
DO NOT spend step 1 on foundations only (types, errors, config) without commands.
A project that compiles but has no commands is a FAILURE.

Subsequent steps add depth: push command, sync state, conflict detection, edge cases,
error handling, quality.

Plan rules:
- 3-4 implementation steps maximum (not counting quality audit)
- Each step names the module(s), relevant properties, and acceptance criteria
- Step 1 acceptance MUST include: 'npx tsx src/index.ts --help shows >= 3 commands'
- Include a quality audit + final validation step at the end
- Each step should produce observable progress (new command, new behavior)"
run_claude "$PLAN_PROMPT"

echo -e "${CYAN}── Implementation Plan ──${NC}"
cat kb/plan.md 2>/dev/null | head -40
echo -e "${DIM}  ...${NC}"
echo ""

kb_summary
commit "Implementation plan created"

# ══════════════════════════════════════════════════════════════════
# PHASES 4-5: Development Cycle (with back edges)
#
# Outer loop: implement → test → audit → quality check
# If quality check finds significant issues, go back to implementation.
# Max 2 outer cycles to prevent infinite loops.
# ══════════════════════════════════════════════════════════════════

DEV_CYCLE=0
DEV_CYCLE_MAX=2

while true; do
  DEV_CYCLE=$((DEV_CYCLE + 1))
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   Development Cycle $DEV_CYCLE / $DEV_CYCLE_MAX                                     ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""

# ── PHASE 4: Implementation ──

if [ "$DEV_CYCLE" -eq 1 ]; then
  step_header 4 "Implementation (Ralph Loop)"

  # Read the plan and extract step count
  PLAN_STEPS=$(grep -cP "^#+\s*(Step|Phase)\s*\d" kb/plan.md 2>/dev/null || echo 6)
  PLAN_STEPS=${PLAN_STEPS//[^0-9]/}
  PLAN_STEPS=${PLAN_STEPS:-6}
  echo -e "Plan has ${BOLD}$PLAN_STEPS steps${NC}."
  echo ""
else
  step_header 4 "Reimplementation (fixing audit findings)"

  # In cycle 2+, we don't follow the plan step by step.
  # Instead, read all audit reports and fix the issues they flagged.
  echo -e "${CYAN}Back edge: reading audit reports to determine what needs fixing...${NC}"

  REFIX_PROMPT="Read CLAUDE.md and all files in kb/ (especially all reports in kb/reports/).
Read all source files in src/ and tests/.

The previous development cycle produced code that has issues flagged by auditors.
Read ALL audit reports in kb/reports/ to understand what needs to be fixed.

Fix every issue found by the auditors:
- Spec compliance gaps: implement missing features, fix divergences from spec
- Security issues: fix credential handling, input validation, data exposure
- Performance issues: fix pagination, async patterns, API efficiency
- UX issues: fix help text, error messages, exit codes
- Code quality issues: add missing comments, fix function length, add contracts
- Test gaps: write missing tests at all levels

Follow CLAUDE.md quality standards. Run tests after fixing. Iterate until green."
  run_claude "$REFIX_PROMPT"

  validate
  commit "Reimplementation: fixes from audit reports (cycle $DEV_CYCLE)"
  PLAN_STEPS=0  # skip the step-by-step loop
fi

for i in $(seq 1 "$PLAN_STEPS"); do
  echo -e "${YELLOW}┌── Implementation step $i / $PLAN_STEPS ──────────────────────${NC}"
  show_skill "implementor" "Ralph Loop: implement → validate → fix → repeat until green"

  ITER=0
  IMPL_MAX=3
  FEEDBACK_FILE=".ralph-feedback.md"
  echo "" > "$FEEDBACK_FILE"

  while true; do
    ITER=$((ITER + 1))
    show_ralph_loop "$ITER" "$IMPL_MAX"

    if [ "$ITER" -eq 1 ]; then
      IMPL_PROMPT="Read CLAUDE.md (ALL quality standards). Read kb/INDEX.md, then follow the
'implement' bundle in kb/indexes/by-task.md to load the relevant files for this step.
Also read kb/plan.md and the relevant kb/properties/ and kb/external/ files.

You are executing step $i of the implementation plan in kb/plan.md.

CRITICAL: if this is step 1, the CLI MUST work by the end of this step.
'npx tsx src/index.ts --help' must show at least 3 commands (init, pull, status).
Do NOT spend all your time on foundation types/errors without registering commands.
A running CLI skeleton with basic commands is more valuable than perfect types with no commands.

LITERATE PROGRAMMING — code must read like a technical document:
- File header: what the module does, why it exists, which spec features it implements
- Every public function: JSDoc with @param (meaning not just type), @returns, @throws, @invariant P<N>, @example
- Every conditional: WHY this branch exists
- Every algorithm step: WHAT it accomplishes
- Every implicit assumption: documented
- Comment ratio target: >= 20%

COMPREHENSIVE TESTING — write tests at multiple levels:
- Unit tests for every function (mocked deps)
- Integration tests for module interactions
- Edge case tests from kb/properties/edge-cases.md
- Error path tests for every custom error type
- Property tests: name with 'P<N>: description', group in describe('P<N>: ...')
- At least 3 tests per source file

ARCHITECTURE — CRITICAL:
- Entry point MUST be src/index.ts with #!/usr/bin/env node as FIRST LINE
- Code MUST be organized in src/ subdirectories (e.g., src/cli/, src/core/, src/linear/, src/fs/)
  At least 4 subdirectories. Do NOT put all files flat in src/.
- Dependency injection, custom error hierarchy with userMessage, no 'any' types
- Functions < 30 lines, files < 200 lines

MODULE SYSTEM — BUILD-CRITICAL (getting this wrong = project does not build):
- This is an ESM project (package.json has type: module, tsconfig has module: nodenext)
- ALL relative imports MUST use .js extension: import { foo } from './bar.js' (even for .ts files)
- Do NOT use .ts extensions in imports. Do NOT omit extensions. Both will cause runtime errors.
- After EVERY file you write, mentally verify: does every import end with .js?
- chalk v5, ora v8, commander v12 are already in package.json — use them directly, do not downgrade

VALIDATION — run these commands after implementing each step:
1. npx tsc --noEmit  (MUST pass — fix ALL errors before proceeding)
2. npx vitest run  (all tests must pass)
3. npx tsx src/index.ts --help  (MUST print help with commands — if this fails, the build is broken)

If step $i depends on previous steps, read the existing code in src/ first."
    else
      # Feed the ACTUAL errors back to Claude
      IMPL_PROMPT="Read CLAUDE.md and all files in kb/.
Read the existing code in src/ and tests/.
Read the file $FEEDBACK_FILE — it contains the EXACT errors from the previous iteration.

Fix every error listed in $FEEDBACK_FILE:
- Compilation errors: fix the TypeScript issues at the exact file:line indicated
- Test failures: read the failing test, understand what it expects, fix the code or the test
- Do NOT rewrite from scratch. Fix the specific issues."
    fi

    run_claude "$IMPL_PROMPT"

    # ── Feedback: capture ACTUAL errors to file ──
    echo -e "${CYAN}── Feedback ──${NC}"
    echo "# Ralph Loop Feedback — Step $i, Iteration $ITER" > "$FEEDBACK_FILE"
    echo "" >> "$FEEDBACK_FILE"

    # Compile
    COMPILE_OUTPUT=$(timeout 30 npx tsc --noEmit 2>&1 || true)
    COMPILE_OK=true
    if echo "$COMPILE_OUTPUT" | grep -q "error TS"; then
      COMPILE_OK=false
      echo -e "  ${RED}✗${NC} Compilation errors"
      echo "## Compilation Errors" >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "$COMPILE_OUTPUT" | grep "error TS" | head -30 >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
    else
      echo -e "  ${GREEN}✓${NC} Compiles"
    fi

    # Shebang check: src/index.ts MUST start with #!/usr/bin/env node
    if [ -f "src/index.ts" ]; then
      FIRST_LINE=$(head -1 src/index.ts)
      if [ "$FIRST_LINE" != "#!/usr/bin/env node" ]; then
        COMPILE_OK=false
        echo -e "  ${RED}✗${NC} Missing shebang: src/index.ts must start with #!/usr/bin/env node"
        echo "## Missing Shebang" >> "$FEEDBACK_FILE"
        echo "src/index.ts first line is: \`$FIRST_LINE\`" >> "$FEEDBACK_FILE"
        echo "It MUST be: \`#!/usr/bin/env node\`" >> "$FEEDBACK_FILE"
        echo "" >> "$FEEDBACK_FILE"
      fi
    fi

    # ESM import check: relative imports MUST use .js extension
    BAD_IMPORTS=$(grep -rn "from '\.\./\|from '\.\/" src/ 2>/dev/null | grep -v "\.js'" | grep -v "\.json'" || true)
    if [ -n "$BAD_IMPORTS" ]; then
      BAD_COUNT=$(echo "$BAD_IMPORTS" | wc -l)
      COMPILE_OK=false
      echo -e "  ${RED}✗${NC} ESM imports: $BAD_COUNT relative imports missing .js extension"
      echo "## ESM Import Errors" >> "$FEEDBACK_FILE"
      echo "This is an ESM project (type: module). All relative imports MUST end with .js:" >> "$FEEDBACK_FILE"
      echo "  WRONG: import { foo } from './bar'" >> "$FEEDBACK_FILE"
      echo "  RIGHT: import { foo } from './bar.js'" >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
      echo "Files with bad imports:" >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "$BAD_IMPORTS" | head -20 >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
    fi

    # Tests
    TEST_OUTPUT=$(timeout 60 npx vitest run --reporter=verbose 2>&1 || true)
    TEST_PASS=$(echo "$TEST_OUTPUT" | grep -c "✓" || true)
    TEST_PASS=${TEST_PASS//[^0-9]/}; TEST_PASS=${TEST_PASS:-0}
    TEST_FAIL=$(echo "$TEST_OUTPUT" | grep -c "✗" || true)
    TEST_FAIL=${TEST_FAIL//[^0-9]/}; TEST_FAIL=${TEST_FAIL:-0}

    if [ "$TEST_PASS" -gt 0 ] && [ "$TEST_FAIL" -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} Tests: $TEST_PASS passed, 0 failed"
    elif [ "$TEST_PASS" -gt 0 ]; then
      echo -e "  ${RED}✗${NC} Tests: $TEST_PASS passed, $TEST_FAIL failed"
      echo "## Test Failures" >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "$TEST_OUTPUT" | grep -A 5 "✗\|FAIL\|AssertionError\|Error:" | head -50 >> "$FEEDBACK_FILE"
      echo '```' >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
    else
      echo -e "  ${DIM}-${NC} No tests yet"
      echo "## No Tests" >> "$FEEDBACK_FILE"
      echo "No test files found. Write tests for every source file." >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
    fi

    # ── CLI smoke test: the program must actually run, not just compile ──
    CLI_OK=true
    ENTRY_FILE=$(find src/ -maxdepth 2 -name "index.ts" -o -name "main.ts" -o -name "cli.ts" 2>/dev/null | head -1)
    if [ -n "$ENTRY_FILE" ]; then
      CLI_HELP=$(timeout 15 npx tsx "$ENTRY_FILE" --help 2>&1 || true)
      CLI_EXIT=$?

      if echo "$CLI_HELP" | grep -qi "usage\|options\|commands\|help"; then
        echo -e "  ${GREEN}✓${NC} CLI --help works"

        # Check that subcommands exist (init, pull, push, status, etc.)
        CMD_COUNT=$(echo "$CLI_HELP" | grep -ciP "^\s+\w+\s" || echo 0)
        CMD_COUNT=${CMD_COUNT//[^0-9]/}; CMD_COUNT=${CMD_COUNT:-0}
        if [ "$CMD_COUNT" -lt 3 ]; then
          CLI_OK=false
          echo -e "  ${RED}✗${NC} CLI shows only $CMD_COUNT commands (want >= 3)"
          echo "## CLI: Not Enough Commands" >> "$FEEDBACK_FILE"
          echo "Running \`npx tsx $ENTRY_FILE --help\` shows only $CMD_COUNT commands." >> "$FEEDBACK_FILE"
          echo "The CLI must register at least: init, pull, push, status." >> "$FEEDBACK_FILE"
          echo "Help output:" >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "$CLI_HELP" >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        fi

        # Check unknown command returns non-zero
        timeout 10 npx tsx "$ENTRY_FILE" nonexistent-command > /dev/null 2>&1
        if [ $? -eq 0 ]; then
          CLI_OK=false
          echo -e "  ${RED}✗${NC} CLI exits 0 on unknown command (should be non-zero)"
          echo "## CLI: Unknown Command Exits 0" >> "$FEEDBACK_FILE"
          echo "Running \`npx tsx $ENTRY_FILE nonexistent-command\` exits 0." >> "$FEEDBACK_FILE"
          echo "Commander should reject unknown commands with a non-zero exit code." >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        fi

        # Running without config must show user-friendly error, not stack trace
        SMOKE_DIR=$(mktemp -d)
        pushd "$SMOKE_DIR" > /dev/null
        NOCFG_OUT=$(timeout 15 npx tsx "$(dirs -l +1)/$ENTRY_FILE" status 2>&1 || true)
        popd > /dev/null
        rm -rf "$SMOKE_DIR"
        if echo "$NOCFG_OUT" | grep -q "at Object\|at Module\|at Function\|    at "; then
          CLI_OK=false
          echo -e "  ${RED}✗${NC} CLI shows stack trace to user (no config case)"
          echo "## CLI: Stack Trace Shown to User" >> "$FEEDBACK_FILE"
          echo "Running \`status\` without a config file shows a raw stack trace." >> "$FEEDBACK_FILE"
          echo "The CLI must catch errors and show a user-friendly message instead." >> "$FEEDBACK_FILE"
          echo "Output:" >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "$NOCFG_OUT" | head -15 >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        elif ! echo "$NOCFG_OUT" | grep -qi "error\|not found\|missing\|config\|initialize\|init"; then
          CLI_OK=false
          echo -e "  ${RED}✗${NC} CLI missing-config message unclear"
          echo "## CLI: Missing Config Message Unclear" >> "$FEEDBACK_FILE"
          echo "Running \`status\` without a config file does not mention 'config', 'init', 'missing', or 'error'." >> "$FEEDBACK_FILE"
          echo "Output:" >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "$NOCFG_OUT" | head -10 >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        else
          echo -e "  ${GREEN}✓${NC} CLI missing-config error is user-friendly"
        fi

        # Init must create a config file
        INIT_DIR=$(mktemp -d)
        pushd "$INIT_DIR" > /dev/null
        INIT_OUT=$(timeout 15 npx tsx "$(dirs -l +1)/$ENTRY_FILE" init 2>&1 || true)
        INIT_CFG=$(find . -maxdepth 2 -name "*.json" -o -name ".kb-sync*" 2>/dev/null | head -1)
        popd > /dev/null
        rm -rf "$INIT_DIR"
        if [ -z "$INIT_CFG" ]; then
          CLI_OK=false
          echo -e "  ${RED}✗${NC} CLI init does not create config file"
          echo "## CLI: Init Does Not Create Config" >> "$FEEDBACK_FILE"
          echo "Running \`init\` in a clean directory does not produce a .kb-sync.json file." >> "$FEEDBACK_FILE"
          echo "The init command must create a JSON config file (.kb-sync.json)." >> "$FEEDBACK_FILE"
          echo "Output:" >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "$INIT_OUT" | head -10 >> "$FEEDBACK_FILE"
          echo '```' >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        else
          echo -e "  ${GREEN}✓${NC} CLI init creates config ($INIT_CFG)"
        fi

        # Integration: init + pull against real Linear (if API key available)
        # Use --team to restrict to one team, avoiding rate limits on large workspaces.
        if [ -n "${LINEAR_API_KEY:-}" ]; then
          INTEG_DIR=$(mktemp -d)
          pushd "$INTEG_DIR" > /dev/null
          ABS_ENTRY="$(dirs -l +1)/$ENTRY_FILE"
          timeout 20 npx tsx "$ABS_ENTRY" init > /dev/null 2>&1 || true
          if [ -f ".kb-sync.json" ] || [ -f ".kb-sync.yaml" ]; then
            # Discover a team key with issues via minimal SDK calls
            TEAM_KEY=$(LINEAR_API_KEY="$LINEAR_API_KEY" timeout 20 node -e "
              const { LinearClient } = require('@linear/sdk');
              const c = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
              c.teams({ first: 5 }).then(async r => {
                for (const t of r.nodes) {
                  const issues = await c.issues({ filter: { team: { id: { eq: t.id } } }, first: 1 });
                  if (issues.nodes.length > 0) { console.log(t.key); return; }
                }
              }).catch(() => {});
            " 2>/dev/null || true)
            if [ -n "$TEAM_KEY" ]; then
              PULL_OUT=$(timeout 120 npx tsx "$ABS_ENTRY" pull --team "$TEAM_KEY" 2>&1 || true)
            else
              PULL_OUT=$(timeout 120 npx tsx "$ABS_ENTRY" pull 2>&1 || true)
            fi
            PULLED_FILES=$(find . -name "*.md" 2>/dev/null | wc -l)
            if [ "$PULLED_FILES" -gt 0 ]; then
              echo -e "  ${GREEN}✓${NC} Integration: init + pull fetched $PULLED_FILES files from real Linear"
            else
              CLI_OK=false
              echo -e "  ${RED}✗${NC} Integration: pull fetched 0 files"
              echo "## Integration: Pull Fetched 0 Files" >> "$FEEDBACK_FILE"
              echo "After \`init\`, running \`pull\` against real Linear produced 0 markdown files." >> "$FEEDBACK_FILE"
              echo "The workspace has issues — pull must fetch ALL issues from ALL teams by default." >> "$FEEDBACK_FILE"
              echo "Check for: rate limiting, label filtering, team restriction, sync markers, or API errors." >> "$FEEDBACK_FILE"
              echo "Pull output:" >> "$FEEDBACK_FILE"
              echo '```' >> "$FEEDBACK_FILE"
              echo "$PULL_OUT" | head -20 >> "$FEEDBACK_FILE"
              echo '```' >> "$FEEDBACK_FILE"
              echo "" >> "$FEEDBACK_FILE"
            fi
          else
            CLI_OK=false
            echo -e "  ${RED}✗${NC} Integration: init did not create config against real Linear"
            echo "## Integration: Init Failed Against Real Linear" >> "$FEEDBACK_FILE"
            echo "Running \`init\` with a real LINEAR_API_KEY did not create a config file." >> "$FEEDBACK_FILE"
            echo "" >> "$FEEDBACK_FILE"
          fi
          popd > /dev/null
          rm -rf "$INTEG_DIR"
        fi
      else
        CLI_OK=false
        echo -e "  ${RED}✗${NC} CLI --help broken or missing"
        echo "## CLI Broken" >> "$FEEDBACK_FILE"
        echo "Running \`npx tsx $ENTRY_FILE --help\` does not produce recognizable help output." >> "$FEEDBACK_FILE"
        echo "Exit code: $CLI_EXIT" >> "$FEEDBACK_FILE"
        echo "Output:" >> "$FEEDBACK_FILE"
        echo '```' >> "$FEEDBACK_FILE"
        echo "$CLI_HELP" | head -20 >> "$FEEDBACK_FILE"
        echo '```' >> "$FEEDBACK_FILE"
        echo "The CLI entry point must use commander to register commands (init, pull, push, status)" >> "$FEEDBACK_FILE"
        echo "and \`npx tsx src/index.ts --help\` must show usage information." >> "$FEEDBACK_FILE"
        echo "" >> "$FEEDBACK_FILE"
      fi
    fi

    # ── Green? Stop. Max iterations? Stop. Otherwise iterate. ──
    if [ "$COMPILE_OK" = true ] && [ "$TEST_FAIL" -eq 0 ] && [ "$TEST_PASS" -gt 0 ] && [ "$CLI_OK" = true ]; then
      echo -e "${GREEN}  ✓ Ralph Loop converged on iteration $ITER${NC}"
      rm -f "$FEEDBACK_FILE"
      break
    elif [ "$ITER" -ge "$IMPL_MAX" ]; then
      echo -e "${YELLOW}  ⚠ Ralph Loop reached max iterations ($IMPL_MAX) — proceeding${NC}"
      rm -f "$FEEDBACK_FILE"
      break
    else
      echo -e "${YELLOW}  ⟳ Not green — feeding errors back to Claude...${NC}"
      echo -e "${DIM}  Feedback written to $FEEDBACK_FILE${NC}"
    fi
  done

  kb_summary
  commit "Implement step $i of plan (Ralph Loop: $ITER iteration(s))"
  echo -e "${YELLOW}└──────────────────────────────────────────────────────${NC}"
  echo ""
done

# ══════════════════════════════════════════════════════════════════
# PHASE 4b: Standalone Tester (fill test gaps)
# ══════════════════════════════════════════════════════════════════

echo -e "${YELLOW}── Test Gap Analysis ──${NC}"
show_skill "tester" "Find gaps between implementation and spec, write missing tests"

TESTER_PROMPT="Read kb/INDEX.md, then follow the 'test' bundle in kb/indexes/by-task.md.
Read all files in kb/properties/, kb/spec/, kb/domain/prd.md, and all files in src/ and tests/.

For each feature in the spec: is it tested? For each property in kb/properties/: is it tested?
For each edge case in kb/properties/edge-cases.md: is it tested?

Write a gap analysis to kb/reports/test-gap-analysis.md.
Then WRITE all missing tests:
- Unit tests for untested functions
- Integration tests for untested module interactions
- End-to-end tests for untested CLI commands (full workflow: init → pull → modify → push)
- Property-based tests for critical invariants (randomized inputs)
- Edge case tests for every T-entry
- Error path tests for every custom error type

Name every test with property ref. Target: at least 3 tests per source file."
run_claude "$TESTER_PROMPT"

validate
commit "Tester: gap analysis and missing tests"

# ══════════════════════════════════════════════════════════════════
# PHASE 4c: Specialized Audits (security, performance, UX, spec compliance)
# ══════════════════════════════════════════════════════════════════

step_header "4c" "Specialized Audits (batched)"

show_skill "security + performance + UX + spec-compliance" "All specialized audits in one pass"
AUDIT_BATCH_PROMPT="Read CLAUDE.md. Read kb/INDEX.md, then follow the 'audit' bundle in kb/indexes/by-task.md.
Read all files in kb/spec/, kb/properties/, kb/external/, kb/domain/prd.md, and all files in src/ and tests/.

Perform ALL of the following audits and fix every issue found:

1. SECURITY: credential handling (API keys from env, never hardcoded, never logged),
   input validation, data exposure (no secrets in errors), injection risks.
   Write findings to kb/reports/security-audit.md.

2. PERFORMANCE: pagination, API call efficiency, async patterns, memory usage,
   I/O batching. Write findings to kb/reports/performance-audit.md.

3. UX: help text, error messages (user-friendly, no stack traces), colored output,
   progress indicators, exit codes, dry-run labeling.
   Write findings to kb/reports/ux-audit.md.

4. SPEC COMPLIANCE: for each feature in the spec, is it implemented correctly?
   For each error type, data model field — does the code match?
   Write findings to kb/reports/spec-compliance-audit.md.

FIX every critical and high finding from all four audits.
Run tests after fixing to ensure nothing broke."
run_claude "$AUDIT_BATCH_PROMPT"
commit "Specialized audits (security, performance, UX, spec compliance) and fixes"

# ══════════════════════════════════════════════════════════════════
# PHASE 5: Quality Ralph Loop (audit → fix → validate → repeat)
# ══════════════════════════════════════════════════════════════════

step_header 5 "Quality Ralph Loop"

QUALITY_ITER=0
QUALITY_MAX=3
QUALITY_FEEDBACK=".quality-feedback.md"
echo "" > "$QUALITY_FEEDBACK"

while true; do
  QUALITY_ITER=$((QUALITY_ITER + 1))
  show_ralph_loop "$QUALITY_ITER" "$QUALITY_MAX"

  # ── Build the quality prompt with previous feedback ──
  if [ "$QUALITY_ITER" -eq 1 ]; then
    QUALITY_PROMPT="Read CLAUDE.md and all files in kb/ and src/ and tests/.

Perform a comprehensive quality audit and fix ALL issues:

1. Check every source file against CLAUDE.md quality standards:
   - Module header comment? Documentation comments with @invariant? Comment ratio >= 15%?
   - No function > 30 lines? No 'any' types? DI everywhere?

2. Check test coverage against kb/properties/:
   - Every property has at least one test?
   - Edge cases tested? Test names include property references?
   - Every source file has a corresponding test file?

3. Check architecture against kb/architecture/overview.md:
   - Module structure matches? Boundaries clean?

Write findings to kb/reports/quality-audit.md.
Then FIX every issue. Add missing comments, tests, contracts."
  else
    QUALITY_PROMPT="Read CLAUDE.md and all files in kb/ and src/ and tests/.
Read $QUALITY_FEEDBACK — it contains the EXACT errors from the previous quality iteration.

Fix every error listed in the feedback file:
- Compilation errors: fix at the exact file:line indicated
- Test failures: understand what the test expects, fix code or test
- Quality standard violations: address each failed check specifically (module structure,
  'any' types, comment ratio, @invariant refs, property refs in tests, userMessage, DI)

Then re-check quality standards and fix any remaining issues.
Write updated findings to kb/reports/quality-audit.md."
  fi

  # ── Audit: code + test quality ──
  show_skill "code-quality-auditor + test-quality-auditor" "Audit and fix code quality, test coverage"
  run_claude "$QUALITY_PROMPT"

  echo -e "${CYAN}── Audit Results ──${NC}"
  if [ -f "kb/reports/quality-audit.md" ]; then
    head -15 kb/reports/quality-audit.md
    echo -e "${DIM}  ...${NC}"
  fi

  # ── Deterministic feedback: capture ALL errors to file ──
  echo -e "${CYAN}── Deterministic Feedback ──${NC}"
  echo "# Quality Feedback — Iteration $QUALITY_ITER" > "$QUALITY_FEEDBACK"
  echo "" >> "$QUALITY_FEEDBACK"

  # Compile
  COMPILE_OUTPUT=$(timeout 30 npx tsc --noEmit 2>&1 || true)
  COMPILE_OK=true
  if echo "$COMPILE_OUTPUT" | grep -q "error TS"; then
    COMPILE_OK=false
    echo -e "  ${RED}✗${NC} Compilation errors"
    echo "## Compilation Errors" >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    echo "$COMPILE_OUTPUT" | grep "error TS" | head -30 >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} Compiles"
  fi

  # Tests
  TEST_OUTPUT=$(timeout 60 npx vitest run --reporter=verbose 2>&1 || true)
  TEST_PASS=$(echo "$TEST_OUTPUT" | grep -c "✓" || true)
  TEST_PASS=${TEST_PASS//[^0-9]/}; TEST_PASS=${TEST_PASS:-0}
  TEST_FAIL=$(echo "$TEST_OUTPUT" | grep -c "✗" || true)
  TEST_FAIL=${TEST_FAIL//[^0-9]/}; TEST_FAIL=${TEST_FAIL:-0}

  if [ "$TEST_PASS" -gt 0 ] && [ "$TEST_FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Tests: $TEST_PASS passed, 0 failed"
  elif [ "$TEST_PASS" -gt 0 ]; then
    echo -e "  ${RED}✗${NC} Tests: $TEST_PASS passed, $TEST_FAIL failed"
    echo "## Test Failures" >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    echo "$TEST_OUTPUT" | grep -A 5 "✗\|FAIL\|AssertionError\|Error:" | head -50 >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${DIM}-${NC} No tests"
    echo "## No Tests Found" >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  fi

  # ── CLAUDE.md quality standards (deterministic checks) ──
  QUALITY_OK=true

  # Module structure
  MOD_COUNT=$(find src/ -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  if [ "$MOD_COUNT" -lt 4 ]; then
    QUALITY_OK=false
    echo -e "  ${RED}✗${NC} Module structure: $MOD_COUNT dirs (CLAUDE.md requires >= 4)"
    echo "## Module Structure" >> "$QUALITY_FEEDBACK"
    echo "src/ has only $MOD_COUNT subdirectories. CLAUDE.md requires at least 4 (e.g., cli/, core/, linear/, fs/)." >> "$QUALITY_FEEDBACK"
    echo "Current dirs: $(ls -d src/*/ 2>/dev/null | tr '\n' ' ')" >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} Module structure: $MOD_COUNT modules"
  fi

  # No 'any' types
  ANY_COUNT=$(grep -rn ": any\b\|<any>" src/ 2>/dev/null | grep -v "eslint-disable" | wc -l || echo 0)
  if [ "$ANY_COUNT" -gt 0 ]; then
    QUALITY_OK=false
    echo -e "  ${RED}✗${NC} Found $ANY_COUNT 'any' types"
    echo "## Forbidden 'any' Types" >> "$QUALITY_FEEDBACK"
    echo "CLAUDE.md forbids \`any\`. Use \`unknown\` and narrow with type guards. Occurrences:" >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    grep -rn ": any\b\|<any>" src/ 2>/dev/null | grep -v "eslint-disable" | head -15 >> "$QUALITY_FEEDBACK"
    echo '```' >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} No 'any' types"
  fi

  # Error hierarchy with userMessage
  if ! grep -rq "userMessage\|user_message\|displayMessage" src/ 2>/dev/null; then
    QUALITY_OK=false
    echo -e "  ${RED}✗${NC} No userMessage on errors"
    echo "## Missing userMessage on Error Classes" >> "$QUALITY_FEEDBACK"
    echo "CLAUDE.md requires a custom error hierarchy with a \`userMessage\` field for user-facing messages." >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} Error hierarchy with userMessage"
  fi

  # Comment ratio >= 20%
  SRC_LINES=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  if [ "$SRC_LINES" -gt 0 ]; then
    CMT_LINES=$(grep -rc "^\s*//" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
    DOC_LINES=$(grep -rc "^\s*\*" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
    CMT_TOTAL=$((CMT_LINES + DOC_LINES))
    CMT_RATIO=$((CMT_TOTAL * 100 / SRC_LINES))
    if [ "$CMT_RATIO" -lt 15 ]; then
      QUALITY_OK=false
      echo -e "  ${RED}✗${NC} Comment ratio: $CMT_RATIO% (CLAUDE.md target >= 20%)"
      echo "## Low Comment Ratio ($CMT_RATIO%)" >> "$QUALITY_FEEDBACK"
      echo "CLAUDE.md requires >= 20% comment ratio. Add module headers, JSDoc with @invariant, and WHY comments." >> "$QUALITY_FEEDBACK"
      echo "" >> "$QUALITY_FEEDBACK"
    else
      echo -e "  ${GREEN}✓${NC} Comment ratio: $CMT_RATIO%"
    fi
  fi

  # @invariant references in source
  INV_REFS=$(grep -rc "@invariant" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$INV_REFS" -lt 5 ]; then
    QUALITY_OK=false
    echo -e "  ${RED}✗${NC} @invariant refs: $INV_REFS (need >= 5)"
    echo "## Missing @invariant References" >> "$QUALITY_FEEDBACK"
    echo "Only $INV_REFS @invariant tags found. CLAUDE.md requires @invariant P<N> on every public function that enforces a property." >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} @invariant refs: $INV_REFS"
  fi

  # Property refs in test names
  PROP_TESTS=$(grep -rcP "P[0-9]+:|NF[0-9]+:|T[0-9]+:" tests/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [ "$PROP_TESTS" -lt 10 ]; then
    QUALITY_OK=false
    echo -e "  ${RED}✗${NC} Property refs in tests: $PROP_TESTS (need >= 10)"
    echo "## Missing Property References in Tests" >> "$QUALITY_FEEDBACK"
    echo "Only $PROP_TESTS property references in test names. CLAUDE.md requires every test name to start with the property it verifies (e.g., 'P4: roundtrip preserves fields')." >> "$QUALITY_FEEDBACK"
    echo "" >> "$QUALITY_FEEDBACK"
  else
    echo -e "  ${GREEN}✓${NC} Property refs in tests: $PROP_TESTS"
  fi

  kb_diff
  commit "Quality Ralph Loop: iteration $QUALITY_ITER"

  # ── All green? Stop. Max iterations? Stop. Otherwise iterate. ──
  if [ "$COMPILE_OK" = true ] && [ "$TEST_FAIL" -eq 0 ] && [ "$TEST_PASS" -gt 0 ] && [ "$QUALITY_OK" = true ]; then
    echo -e "${GREEN}  ✓ Quality Ralph Loop converged on iteration $QUALITY_ITER${NC}"
    rm -f "$QUALITY_FEEDBACK"
    break
  elif [ "$QUALITY_ITER" -ge "$QUALITY_MAX" ]; then
    echo -e "${YELLOW}  ⚠ Quality loop reached max iterations ($QUALITY_MAX) — proceeding${NC}"
    rm -f "$QUALITY_FEEDBACK"
    break
  else
    echo -e "${YELLOW}  ⟳ Not fully green — feeding errors back to Claude...${NC}"
    echo -e "${DIM}  Feedback written to $QUALITY_FEEDBACK${NC}"
  fi
done

  # ── Back-edge decision: do we need another development cycle? ──
  # Check if the quality loop converged AND tests pass
  FINAL_COMPILE=$(timeout 30 npx tsc --noEmit 2>&1 || true)
  FINAL_TEST=$(timeout 60 npx vitest run 2>&1 || true)
  FINAL_PASS=$(echo "$FINAL_TEST" | grep -c "✓" || true)
  FINAL_PASS=${FINAL_PASS//[^0-9]/}; FINAL_PASS=${FINAL_PASS:-0}
  FINAL_FAIL=$(echo "$FINAL_TEST" | grep -c "✗" || true)
  FINAL_FAIL=${FINAL_FAIL//[^0-9]/}; FINAL_FAIL=${FINAL_FAIL:-0}
  FINAL_COMPILE_OK=true
  echo "$FINAL_COMPILE" | grep -q "error TS" && FINAL_COMPILE_OK=false

  if [ "$FINAL_COMPILE_OK" = true ] && [ "$FINAL_FAIL" -eq 0 ] && [ "$FINAL_PASS" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Development cycle $DEV_CYCLE complete — all green${NC}"
    break
  elif [ "$DEV_CYCLE" -ge "$DEV_CYCLE_MAX" ]; then
    echo -e "${YELLOW}  ⚠ Max development cycles ($DEV_CYCLE_MAX) reached — proceeding to finalization${NC}"
    break
  else
    echo ""
    echo -e "${RED}  ⟳ Issues remain after audits — starting development cycle $((DEV_CYCLE + 1))${NC}"
    echo -e "${DIM}  Back edge: audits → reimplementation${NC}"
    echo ""
  fi

done  # end outer development cycle

# ══════════════════════════════════════════════════════════════════
# PHASE 5b: Tech Writer + KB Sync Check
# ══════════════════════════════════════════════════════════════════

echo -e "${YELLOW}── Documentation ──${NC}"
show_skill "tech-writer" "Write/update user manual from the implementation"

TECHWRITER_PROMPT="Read kb/domain/prd.md, kb/spec/INDEX.md, and the CLI source code.

Write kb/runbooks/user-manual.md — a user manual:
- Installation and configuration
- Quick start (5-step getting started)
- Every command: description, usage, options, at least one example
- Configuration file format and environment variables
- Troubleshooting: common errors and solutions
- Keep it under 300 lines. Examples must be copy-pasteable."
run_claude "$TECHWRITER_PROMPT"
commit "Tech writer: user manual"

echo -e "${YELLOW}── Post-Implementation Harness Check ──${NC}"
show_skill "harness-validator" "Does the KB still match reality after implementation?"

HARNESS_PROMPT="Read CLAUDE.md, all files in kb/, all skills in .claude/skills/, src/, and tests/.

The implementation is done. Check that the KB still reflects reality:
- Does kb/architecture/overview.md match the actual module structure?
- Do kb/spec/ files cover all implemented features?
- Do kb/properties/ files cover all invariants the code actually enforces?
- Does kb/external/ accurately reflect how the code uses third-party SDKs?
- Are there implemented behaviors not documented in the spec? (→ extend the spec)
- Are there new error types not in kb/spec/error-taxonomy.md? (→ add them)
- Are all KB cross-references still valid? (Related files, Agent notes, INDEX.md routing)
- Does kb/indexes/by-task.md still route to the right files?

IMPORTANT: the KB is the source of truth. If the code contradicts the spec, flag it as
a bug. But if the code extends the spec (new capabilities discovered during implementation),
update the KB to document them.

Write to kb/reports/harness-post-check.md.
Fix KB issues (update stale docs, add missing cross-references, extend spec where code adds value)."
run_claude "$HARNESS_PROMPT"
commit "Harness self-validation"

# ══════════════════════════════════════════════════════════════════
# PHASE 6: Final Validation
# ══════════════════════════════════════════════════════════════════

step_header 6 "Final Validation"

echo -e "${CYAN}Running final checks...${NC}"
echo ""

validate

kb_summary

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Build Complete                                          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "${DIM}  $(date '+%H:%M:%S')${NC}"
echo ""
echo -e "  KB files:    $(find kb/ -name '*.md' 2>/dev/null | wc -l)"
echo -e "  Source:      $(find src/ -name '*.ts' 2>/dev/null | wc -l) files"
echo -e "  Tests:       $(find tests/ -name '*.test.ts' -o -name '*.spec.ts' 2>/dev/null | wc -l) files"
echo -e "  Commits:     $(git log --oneline 2>/dev/null | wc -l)"
echo ""
