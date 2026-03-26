---
id: gray-matter-lib
domain: external
last-updated: 2026-03-25
related: [data-model, config-and-formats]
---

# gray-matter — Frontmatter Parsing Library

## One-liner
Runtime behavior of gray-matter for parsing and serializing YAML frontmatter in markdown files.

## Scope
Covers: parsing behavior, serialization quirks, edge cases. Does NOT cover: how we use frontmatter (see `../spec/data-model.md`).

---

## Basic usage

```typescript
import matter from 'gray-matter';

// Parse
const { data, content } = matter(fileContents);
// data: object with frontmatter fields
// content: string with markdown body (no frontmatter delimiters)

// Serialize
const output = matter.stringify(content, data);
// Returns: ---\nfield: value\n---\ncontent
```

## Key behaviors

1. **Extra fields preserved:** `matter.stringify(content, data)` writes all fields in `data`, including ones not in the original. User-added fields survive round-trips.

2. **Field order:** gray-matter does NOT guarantee field order. To maintain canonical order, construct the `data` object with fields in the desired order before calling `stringify`.

3. **Array serialization:** YAML arrays in frontmatter:
   ```yaml
   labels: ["bug", "urgent"]    # inline style
   labels:                       # block style
     - bug
     - urgent
   ```
   gray-matter parses both. On output, it uses the style js-yaml chooses (typically block for >1 item).

4. **Number vs string:** `priority: 2` is parsed as number `2`. `priority: "2"` is parsed as string `"2"`. Be explicit about types — don't quote numbers.

5. **Null handling:** `assignee:` (no value) is parsed as `null`. `assignee: ""` is parsed as empty string. Use `null` for absent values.

6. **Date handling:** gray-matter (via js-yaml) auto-parses ISO date strings as Date objects. To keep them as strings, pass `engines: { yaml: { ...options } }` or convert back after parse.

## Gotchas

- **Date auto-parsing:** `createdAt: "2026-03-25T10:00:00.000Z"` may be parsed as a Date object, not a string. Always convert back to ISO string after parsing if needed.
- **Trailing newline:** `matter.stringify()` adds a trailing newline. Consistent, but be aware for hash computation.
- **Empty content:** If the file is frontmatter-only, `content` is `""` (empty string).

## Agent notes
> The date auto-parsing gotcha is critical for P1 (roundtrip fidelity). Always normalize dates after parsing.
> gray-matter is CommonJS but works with ESM via default import.

## Related files
- `../spec/data-model.md` — the frontmatter fields we parse
- `../spec/config-and-formats.md` — file format examples
