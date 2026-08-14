/**
 * Dependency-free string helpers.
 *
 * Deliberately separate from markdown.ts: saving a post needs a slug and a
 * reading time, but has no business pulling in the HTML sanitizer and its
 * transitive dependency tree. Keeping them apart means a failure in the
 * rendering stack cannot take the editor's save path down with it.
 */

/** Title -> URL slug. The studio pre-fills with this; the writer may override. */
export function slugify(title: string): string {
  return (title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');
}

/** Reading time at 220 wpm, the conventional figure for trade publications. */
export function readingMinutes(md: string): number {
  const words = (md ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

/** Plain-text fallback for meta descriptions when no excerpt was written. */
export function toPlainText(md: string, limit = 300): string {
  const text = (md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
