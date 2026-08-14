/**
 * Phase 1 acceptance gate.
 *
 * Screenshots the LIVE site (https://k1mnr.com, still served by GitHub Pages
 * from the original index.html) against the locally built Astro port, at four
 * breakpoints, and reports the pixel delta.
 *
 * Both sides get identical treatment — animations disabled, all `.reveal`
 * elements forced into their settled `.in` state, lazy images forced to load —
 * so the comparison measures the port, not animation timing.
 *
 * The nav is expected to differ: it gained the "Industry Insights" tab. That
 * region is masked out by default so the rest of the page can be judged on its
 * own; pass --no-mask to see the whole page including the nav.
 *
 * Usage:
 *   npm run build && npm run preview &     # local on :4321
 *   node scripts/visual-diff.mjs
 *
 * Output: tmp/visual-diff/<width>-{live,local,diff}.png
 */
import { chromium } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const LIVE = process.env.LIVE_URL ?? 'https://k1mnr.com';
const LOCAL = process.env.LOCAL_URL ?? 'http://localhost:4321';
const WIDTHS = [390, 820, 1080, 1440];
const OUT = 'tmp/visual-diff';
const MASK_NAV = !process.argv.includes('--no-mask');
// Anti-aliasing and font rasterisation differ microscopically between loads.
const THRESHOLD = 0.1;
const FAIL_PCT = 0.1;

mkdirSync(OUT, { recursive: true });

/** Freeze the page into a deterministic, fully-settled state. */
async function settle(page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;
              animation-duration:0s!important;transition-duration:0s!important}
              html{scroll-behavior:auto!important}
              .wa-float{visibility:hidden!important}
              /* Astro injects its dev toolbar when diffing against the dev
                 server (the Vercel adapter supports no preview command once
                 SSR routes exist). It is not part of the page. */
              astro-dev-toolbar,#dev-bar,astro-dev-overlay{display:none!important}`,
  });
  // Force every scroll-reveal element into its final state.
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    document.querySelectorAll('.h-anim').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  });
  // Walk the page so lazy images decode, then return to the top.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })),
    ),
  );
  await page.waitForTimeout(400);
}

async function shoot(browser, url, width) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(600); // let webfonts swap in
  await settle(page);
  const navBox = MASK_NAV ? await page.locator('#nav').boundingBox() : null;
  const buf = await page.screenshot({ fullPage: true });
  await page.close();
  return { buf, navBox };
}

/** Paint the nav strip black on both sides so the intentional change is ignored. */
function maskRegion(png, box) {
  if (!box) return;
  const top = Math.max(0, Math.floor(box.y));
  const bottom = Math.min(png.height, Math.ceil(box.y + box.height) + 4);
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
      png.data[i + 3] = 255;
    }
  }
}

const browser = await chromium.launch();
let failed = false;
const summary = [];

for (const width of WIDTHS) {
  const [live, local] = await Promise.all([
    shoot(browser, LIVE, width),
    shoot(browser, LOCAL, width),
  ]);

  const a = PNG.sync.read(live.buf);
  const b = PNG.sync.read(local.buf);

  writeFileSync(`${OUT}/${width}-live.png`, live.buf);
  writeFileSync(`${OUT}/${width}-local.png`, local.buf);

  if (a.width !== b.width) {
    summary.push(`  ${width}px  WIDTH MISMATCH  ${a.width} vs ${b.width}`);
    failed = true;
    continue;
  }

  const navBox = live.navBox ?? local.navBox;
  maskRegion(a, navBox);
  maskRegion(b, navBox);

  // The footer legitimately grew by one <li> ("Industry Insights"), so the
  // local page is taller. Everything above the footer must still align
  // pixel-for-pixel — compare the common top region and report the delta
  // separately rather than treating a known additive change as a failure.
  const note = a.height === b.height ? '' : `  [Δheight ${b.height - a.height}px, compared top ${Math.min(a.height, b.height)}px]`;
  const h = Math.min(a.height, b.height);
  const crop = (png) => {
    if (png.height === h) return png;
    const out = new PNG({ width: png.width, height: h });
    png.data.copy(out.data, 0, 0, png.width * h * 4);
    return out;
  };
  const ac = crop(a);
  const bc = crop(b);

  const diff = new PNG({ width: ac.width, height: h });
  const changed = pixelmatch(ac.data, bc.data, diff.data, ac.width, h, {
    threshold: THRESHOLD,
  });
  writeFileSync(`${OUT}/${width}-diff.png`, PNG.sync.write(diff));

  const pct = (changed / (ac.width * h)) * 100;
  const ok = pct <= FAIL_PCT;
  if (!ok) failed = true;
  summary.push(
    `  ${width}px  ${ok ? 'PASS' : 'FAIL'}  ${pct.toFixed(4)}% (${changed} px)  ${ac.width}x${h}${note}`,
  );
}

await browser.close();

console.log(`\nVisual diff — live ${LIVE} vs local ${LOCAL}`);
console.log(`nav masked: ${MASK_NAV}   fail threshold: ${FAIL_PCT}%\n`);
console.log(summary.join('\n'));
console.log(`\nImages: ${OUT}/\n`);
process.exit(failed ? 1 : 0);
