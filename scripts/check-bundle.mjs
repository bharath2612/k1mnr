/**
 * Build-time guard against the failure that took the blog down in production.
 *
 * Vercel bundles each serverless function with only the files its tracer could
 * discover. Tracing missed three of sanitize-html's transitive CommonJS
 * dependencies, so every route that rendered markdown died at runtime with
 * FUNCTION_INVOCATION_FAILED while routes that didn't render markdown were
 * completely fine — which is what made it look like a save bug rather than a
 * bundling bug.
 *
 * The fix bundles that dependency closure into the server output. This script
 * verifies the result: every runtime require()/import of a bare package
 * specifier left in the server chunks must actually be present in the
 * function's traced node_modules. If it isn't, the build fails here instead of
 * at 3am in production.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isBuiltin } from 'node:module';

const FUNCTIONS_DIR = '.vercel/output/functions';

if (!existsSync(FUNCTIONS_DIR)) {
  console.log('check:bundle — no .vercel/output/functions (non-Vercel build), skipping.');
  process.exit(0);
}

/** Bare specifiers in `require("x")` and `from "x"` / `import("x")`. */
function bareSpecifiers(src) {
  const found = new Set();
  const patterns = [
    /require\(\s*["']([^"'.][^"']*)["']\s*\)/g,
    /\bfrom\s*["']([^"'.][^"']*)["']/g,
    /\bimport\(\s*["']([^"'.][^"']*)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return found;
}

/** "@scope/pkg/sub" -> "@scope/pkg";  "pkg/sub" -> "pkg" */
function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Minified bundles contain plenty of text that superficially looks like an
 * import, so anything that is not a syntactically valid npm package name is
 * discarded rather than reported.
 */
const VALID_PACKAGE = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.mjs') || p.endsWith('.js')) out.push(p);
  }
  return out;
}

let failed = false;

for (const fn of readdirSync(FUNCTIONS_DIR)) {
  if (!fn.endsWith('.func')) continue;
  const root = join(FUNCTIONS_DIR, fn);
  const nodeModules = join(root, 'node_modules');

  const missing = new Set();
  for (const file of walk(root)) {
    for (const spec of bareSpecifiers(readFileSync(file, 'utf8'))) {
      if (isBuiltin(spec) || spec.startsWith('node:')) continue;
      const pkg = packageName(spec);
      if (!VALID_PACKAGE.test(pkg)) continue;
      if (!existsSync(join(nodeModules, pkg))) missing.add(pkg);
    }
  }

  // The emitted chunks are only half the story. The original outage was caused
  // by a package that WAS traced (sanitize-html) whose own dependencies were
  // NOT — the failing require lived inside node_modules, where the scan above
  // never looks. So also assert the traced tree is internally closed.
  if (existsSync(nodeModules)) {
    const pkgDirs = [];
    for (const entry of readdirSync(nodeModules)) {
      if (entry.startsWith('@')) {
        for (const sub of readdirSync(join(nodeModules, entry))) {
          pkgDirs.push(join(nodeModules, entry, sub));
        }
      } else {
        pkgDirs.push(join(nodeModules, entry));
      }
    }

    for (const dir of pkgDirs) {
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      let deps;
      try {
        deps = Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {});
      } catch {
        continue;
      }
      for (const dep of deps) {
        if (isBuiltin(dep)) continue;
        // Either hoisted at the function root, or nested beside its dependent.
        if (existsSync(join(nodeModules, dep)) || existsSync(join(dir, 'node_modules', dep))) {
          continue;
        }
        missing.add(`${dep}  (required by ${dir.slice(nodeModules.length + 1)})`);
      }
    }
  }

  if (missing.size) {
    failed = true;
    console.error(`\ncheck:bundle FAILED — ${fn} references packages absent from its bundle:\n`);
    for (const p of [...missing].sort()) console.error(`   ${p}`);
    console.error(
      '\nThese would throw at runtime on Vercel. Add them (and their own\n' +
        'dependencies) to vite.ssr.noExternal in astro.config.mjs so they are\n' +
        'bundled rather than resolved from node_modules.\n',
    );
  } else {
    console.log(`check:bundle passed — ${fn}: every external specifier is present.`);
  }
}

process.exit(failed ? 1 : 0);
