/** Dribbble allows at most 20 tags per shot. */
export const DRIBBBLE_MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

/**
 * Normalises a single tag to Dribbble's style: lowercase words separated by
 * spaces ("web design", not "web-design"). Hyphens joining two words become
 * spaces, while short prefixes such as "e-commerce" or "3-d" keep theirs.
 * Returns '' if unusable.
 */
export function normalizeTag(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/_+/g, ' ')
    .replace(/(\p{L}{2,})-(?=\p{L}{2,})/gu, '$1 ')
    .replace(/[^\p{L}\p{N}\s\-+.&/]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** Normalises, de-duplicates and caps a tag list while preserving order. */
export function normalizeTags(tags: readonly string[], limit: number = DRIBBBLE_MAX_TAGS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= limit) break;
  }
  return result;
}

/** Splits free-form user input ("ui, ux  dashboard") into tags. */
export function parseTagInput(input: string): string[] {
  return input.split(/[,\n]+/).flatMap((part) => (part.includes('#') ? part.split(/\s+/) : [part]));
}
