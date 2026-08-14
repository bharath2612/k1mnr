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
    // We allow no `style` attribute anywhere, so style parsing is dead code —
    // and it is the only reason sanitize-html reaches for postcss at runtime.
    parseStyleAttributes: false,
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

// Re-exported so existing import sites keep working; the implementations live
// in text.ts precisely so they carry no dependencies.
export { slugify, readingMinutes, toPlainText } from './text';
