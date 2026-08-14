/**
 * Build-time guard: assert no server-only secret leaked into the client bundle.
 *
 * astro:env already fails the build if a `secret` variable is read from client
 * context, but it cannot catch a server module transitively imported by a
 * component's client-side <script>. This greps the actual build output, which
 * is the only thing that really ships.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['dist/client', 'dist/static', 'dist'];
const NEEDLES = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'STUDIO_PASSCODE', 'STUDIO_SECRET'];
// Server bundles legitimately contain these; only client-delivered assets matter.
const SERVER_DIRS = ['dist/server', 'dist/_worker.js', '.vercel'];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SERVER_DIRS.some((s) => p.startsWith(s))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|css|html|json|map)$/.test(p)) out.push(p);
  }
  return out;
}

const root = ROOTS.find((r) => { try { return statSync(r).isDirectory(); } catch { return false; } });
if (!root) {
  console.error('check:secrets — no dist/ found; run `astro build` first.');
  process.exit(1);
}

const hits = [];
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (src.includes(needle)) hits.push(`${file}: contains "${needle}"`);
  }
}

if (hits.length) {
  console.error('\n check:secrets FAILED — server secrets found in client output:\n');
  for (const h of hits) console.error('   ' + h);
  console.error('\nA server-only module is reachable from a client script. Fix the import chain.\n');
  process.exit(1);
}
console.log(` check:secrets passed — scanned ${root}, no server secrets in client output.`);
