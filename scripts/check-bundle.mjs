/**
 * Build-time smoke test of the deployed serverless bundle.
 *
 * This exists because of a real outage. Every route that rendered markdown
 * returned 500 on Vercel while every route that didn't was fine. The cause was
 * a module-load failure: sanitize-html is CommonJS and calls require() at
 * module scope, and once the SSR bundler touched it that became
 * "ReferenceError: require is not defined". Nothing in `astro build`,
 * `astro check` or the Playwright suite caught it, because locally the module
 * resolved from the project's own node_modules and loaded fine.
 *
 * A static scan of import specifiers was tried first and produced constant
 * false positives (JSDoc comments, type-only @types packages, optional deps
 * that are never required at runtime). So instead of guessing, this copies the
 * built function OUT of the repo — where the project's node_modules is no
 * longer reachable, exactly like Vercel — and actually imports every emitted
 * server chunk. Anything that cannot initialise fails the build here rather
 * than in production.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const FUNCTIONS_DIR = '.vercel/output/functions';

if (!existsSync(FUNCTIONS_DIR)) {
  console.log('check:bundle — no .vercel/output/functions (non-Vercel build), skipping.');
  process.exit(0);
}

// The chunks read configuration through astro:env at module scope, so the
// same variables the build used have to be present here too.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const staging = mkdtempSync(join(tmpdir(), 'k1mnr-bundle-'));
let failed = false;

try {
  for (const fn of readdirSync(FUNCTIONS_DIR)) {
    if (!fn.endsWith('.func')) continue;

    const src = join(FUNCTIONS_DIR, fn);
    const dest = join(staging, fn);
    cpSync(src, dest, { recursive: true });

    const chunksDir = join(dest, 'dist/server/chunks');
    if (!existsSync(chunksDir)) continue;

    const broken = [];
    for (const file of readdirSync(chunksDir)) {
      if (!file.endsWith('.mjs')) continue;
      try {
        await import(pathToFileURL(resolve(chunksDir, file)).href);
      } catch (err) {
        // Only module-resolution / initialisation faults matter here. A chunk
        // throwing for want of a request context is expected and harmless.
        const msg = String(err?.message ?? err);
        if (
          msg.includes('Cannot find module') ||
          msg.includes('Cannot find package') ||
          msg.includes('require is not defined') ||
          err instanceof ReferenceError
        ) {
          broken.push(`${file}: ${msg.split('\n')[0]}`);
        }
      }
    }

    if (broken.length) {
      failed = true;
      console.error(`\ncheck:bundle FAILED — ${fn}: chunks cannot load outside the repo:\n`);
      for (const b of broken) console.error(`   ${b}`);
      console.error(
        '\nThese will throw at module load on Vercel, which surfaces as a 500\n' +
          'on every route importing them (and, tellingly, a 500 rather than a\n' +
          '401 on authenticated API routes).\n' +
          '\nUsual cause: a CommonJS dependency got bundled as ESM. Mark it\n' +
          'external, or replace it with an ESM-native equivalent.\n',
      );
    } else {
      console.log(`check:bundle passed — ${fn}: all server chunks load in isolation.`);
    }
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
