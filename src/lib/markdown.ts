import { marked } from 'marked';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';
import { STORAGE_HOST } from './server/supabase';

/**
 * The single markdown renderer for the whole project.
 *
 * The /studio preview pane calls this through POST /api/studio/render rather
 * than running its own copy in the browser. That is deliberate: two renderers
 * drift, and a writer eventually sees a preview that doesn't match what ships.
 * One implementation means preview parity is structural, not maintained.
 *
 * Sanitizing is done with rehype-sanitize (hast-util-sanitize) rather than
 * sanitize-html. sanitize-html is CommonJS and calls require() at module
 * scope; under the SSR bundler that became
 * "ReferenceError: require is not defined", which took down every route that
 * rendered markdown in production — post pages, the RSS feed and this
 * endpoint — while routes that never touched markdown were unaffected. The
 * whole rehype chain is ESM, so that failure mode cannot recur.
 */

marked.setOptions({ gfm: true, breaks: false });

/**
 * Allowlist. Anything absent is removed. Deliberately narrow: this is a trade
 * publication, so no tables, no code blocks, no raw HTML, no style attributes.
 */
const SCHEMA: Schema = {
  tagNames: [
    'h2', 'h3', 'h4',
    'p', 'strong', 'em', 'a',
    'ul', 'ol', 'li',
    'blockquote', 'img', 'hr', 'br',
  ],
  attributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
  },
  protocols: {
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
  },
  // Drop the contents of dangerous elements too, rather than leaving their
  // text behind as stray prose.
  strip: ['script', 'style', 'iframe', 'object', 'embed'],
  clobber: [],
  ancestors: {},
  required: {},
};

const isExternal = (href: string) =>
  !(href.startsWith('/') || href.startsWith('#') || href.includes('k1mnr.com'));

/**
 * Runs BEFORE sanitizing, so anything added here is still subject to the
 * allowlist above and cannot be used to smuggle an attribute through.
 */
function rehypeHouseStyle() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      // The post title is the page's only <h1>. A writer typing "# Heading"
      // must not create a second one — an accessibility and an SEO defect.
      if (node.tagName === 'h1') node.tagName = 'h2';

      if (node.tagName === 'a') {
        const href = String(node.properties?.href ?? '');
        if (isExternal(href)) {
          node.properties = {
            ...node.properties,
            rel: ['noopener', 'nofollow', 'ugc'],
            target: '_blank',
          };
        }
      }

      if (node.tagName === 'img') {
        const src = String(node.properties?.src ?? '');
        let sameHost = false;
        try {
          sameHost = new URL(src).host === STORAGE_HOST;
        } catch {
          sameHost = false; // relative or malformed
        }
        // Inline images may only come from our own storage bucket. Anything
        // else is a tracking pixel or a hotlink waiting to break.
        if (!sameHost && parent && typeof index === 'number') {
          parent.children.splice(index, 1);
          return index;
        }
        node.properties = { ...node.properties, loading: 'lazy', decoding: 'async' };
      }
      return undefined;
    });
  };
}

const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeHouseStyle)
  .use(rehypeSanitize, SCHEMA)
  .use(rehypeStringify, { allowDangerousHtml: false });

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? '', { async: false }) as string;
  return String(processor.processSync(raw));
}

// Re-exported so existing import sites keep working; the implementations live
// in text.ts precisely so they carry no dependencies.
export { slugify, readingMinutes, toPlainText } from './text';
