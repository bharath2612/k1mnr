import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { STORAGE_HOST } from './server/supabase';

/**
 * The single markdown renderer for the whole project.
 *
 * The /studio preview pane calls this through POST /api/studio/render rather
 * than running its own copy in the browser. That is deliberate: two renderers
 * drift, and a writer eventually sees a preview that doesn't match what ships.
 * One implementation means preview parity is structural, not maintained.
 */

marked.setOptions({
  gfm: true,
  breaks: false,
});

const ALLOWED_TAGS = [
  'h2', 'h3', 'h4',
  'p', 'strong', 'em', 'a',
  'ul', 'ol', 'li',
  'blockquote', 'img', 'hr', 'br',
];

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? '', { async: false }) as string;

  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      // The post title is the page's only <h1>. A writer typing "# Heading"
      // must not create a second one — that is both an accessibility defect
      // and an SEO one, so demote rather than trust writer discipline.
      h1: 'h2',

      a: (_tagName, attribs) => {
        const href = attribs.href ?? '';
        const isInternal =
          href.startsWith('/') || href.startsWith('#') || href.includes('k1mnr.com');
        return {
          tagName: 'a',
          attribs: isInternal
            ? { ...attribs, href }
            : { ...attribs, href, rel: 'noopener nofollow ugc', target: '_blank' },
        };
      },

      img: (_tagName, attribs) => ({
        tagName: 'img',
        attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
      }),
    },
    // Inline images may only come from our own storage bucket. Anything else
    // is a tracking pixel or a broken hotlink waiting to happen.
    exclusiveFilter: (frame) => {
      if (frame.tag !== 'img') return false;
      const src = frame.attribs.src ?? '';
      try {
        return new URL(src).host !== STORAGE_HOST;
      } catch {
        return true; // relative or malformed src — drop it
      }
    },
  });
}

/** Reading time at 220 wpm, the conventional figure for trade publications. */
export function readingMinutes(md: string): number {
  const words = (md ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

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
