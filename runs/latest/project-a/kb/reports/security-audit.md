---
id: security-audit
domain: reports
last-updated: 2026-03-25
related: [non-functional-props, error-taxonomy, linear-sdk]
---

# Security Audit Report

## One-liner
Security review of credential handling, input validation, data exposure, and injection risks.

---

## Findings

### SEC-1: GraphQL injection via string interpolation [CRITICAL]

**Location:** `src/linear/client.ts:90`, `src/linear/client.ts:104`
**Description:** `issueId` is interpolated directly into GraphQL query strings via template literals: `"${issueId}"`. If an attacker can control the `issueId` value (e.g., via a crafted frontmatter `id` field), they could inject arbitrary GraphQL.
**Risk:** An attacker who can write a markdown file with a malicious `id` field could execute arbitrary GraphQL mutations.
**Fix:** Validate that `issueId` is a valid UUID before interpolation. UUIDs are `[a-f0-9-]{36}`.
**Severity:** CRITICAL

### SEC-2: GraphQL injection via mutation field values [HIGH]

**Location:** `src/linear/resolver.ts:55-91`
**Description:** `buildMutationFields` interpolates `stateId`, `assigneeId`, `labelIds`, and `projectId` directly into GraphQL strings. These values come from reverse-lookup of user-provided names against reference data, so they are internally-controlled UUIDs. However, `title` and `description` are passed through `JSON.stringify()`, which is safe.
**Risk:** Low in practice because IDs come from the refData maps (not directly from user input). But defense-in-depth requires validation.
**Fix:** Add UUID validation for all ID fields before interpolation.
**Severity:** HIGH (defense-in-depth)

### SEC-3: Unexpected error handler exposes full error object [MEDIUM]

**Location:** `src/index.ts:57`
**Description:** `console.error('Unexpected error:', error)` prints the full error object, which could include stack traces, internal paths, or environment details. Per NF5, stack traces should never be shown to users.
**Risk:** Information disclosure of internal implementation details.
**Fix:** Print only `error.message` and suggest filing a bug report.
**Severity:** MEDIUM

### SEC-4: API key handling is correct [PASS]

**Description:** The API key is read from `process.env['LINEAR_API_KEY']`, stored only in memory, never written to config/state files, and never included in error messages. All AuthError messages reference "your LINEAR_API_KEY" without the actual value.
**Status:** PASS - NF4 compliant.

### SEC-5: Path traversal protection in config [PASS]

**Location:** `src/core/config.ts:96-101`
**Description:** `kbDir` is validated to not contain `..`, preventing path traversal attacks.
**Status:** PASS.

### SEC-6: YAML frontmatter injection via field values [LOW]

**Location:** `src/fs/writer.ts:119`
**Description:** String values are always double-quoted in serialization (`"${String(value)}"`), but values containing `"` characters are not escaped. A field value like `my "title"` would produce `title: "my "title""` which is invalid YAML.
**Risk:** Malformed YAML output that gray-matter may re-parse incorrectly, leading to data corruption.
**Fix:** Escape double quotes and backslashes in string values.
**Severity:** HIGH (data corruption risk, P1 roundtrip fidelity violation)

---

## Summary

| ID    | Severity | Status   |
|-------|----------|----------|
| SEC-1 | CRITICAL | TO FIX   |
| SEC-2 | HIGH     | TO FIX   |
| SEC-3 | MEDIUM   | TO FIX   |
| SEC-4 | PASS     | OK       |
| SEC-5 | PASS     | OK       |
| SEC-6 | HIGH     | TO FIX   |
