// Task tags: free-form labels a task carries so it can join a stream. One
// normal form everywhere (the dialog, the MCP tools, the mapper and the DB
// CHECK all agree), so "#Диплом", "диплом " and "ДИПЛОМ" are the same tag.
// Pure: no I/O.

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;

/**
 * One tag in normal form, or null if nothing is left: leading `#` dropped,
 * trimmed, lowercased, inner whitespace runs turned into a single hyphen,
 * commas removed (the dialog splits on them), clipped to MAX_TAG_LENGTH.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .replace(/,/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, MAX_TAG_LENGTH);
  return tag.length > 0 ? tag : null;
}

/** A tag list in normal form: each tag normalized, duplicates and empties dropped, first MAX_TAGS kept, order preserved. */
export function normalizeTags(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag !== null && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Every tag in use across `tasks`, most used first, then alphabetical. */
export function collectTags(tasks: readonly { tags: readonly string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const tag of task.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
