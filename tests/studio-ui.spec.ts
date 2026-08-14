import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSCODE = (() => {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const m = env.match(/^STUDIO_PASSCODE="?(.*?)"?$/m);
  if (!m) throw new Error('STUDIO_PASSCODE not found in .env');
  return m[1];
})();

// These tests create and delete posts in a shared database, so they must not
// run concurrently with each other or compare global counts across tests.
test.describe.configure({ mode: 'serial' });

async function signIn(page: Page) {
  await page.goto('/studio');
  await page.fill('#passcode', PASSCODE);
  await page.click('#gateSubmit');
  // #listView carries class="view on" in the initial HTML, so waiting on that
  // alone resolves before the session even exists. Wait for the shell to be
  // shown and for the list request to have actually populated the summary.
  await expect(page.locator('#app')).toHaveClass(/on/);
  await expect(page.locator('#listSummary')).not.toHaveText('Loading…');
}

test('signing in lands on the card list, not the editor', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('#listView')).toBeVisible();
  await expect(page.locator('#editorView')).not.toBeVisible();
  await expect(page.locator('.card').first()).toBeVisible();
});

test('search and status filters narrow the list', async ({ page }) => {
  await signIn(page);
  const total = await page.locator('.card').count();
  expect(total).toBeGreaterThan(0);

  await page.click('#filters button[data-filter="draft"]');
  const drafts = await page.locator('.card').count();
  for (const chip of await page.locator('.card .chip').allTextContents()) {
    expect(chip.toLowerCase()).toBe('draft');
  }

  await page.click('#filters button[data-filter="all"]');
  await expect(page.locator('.card')).toHaveCount(total);

  await page.fill('#search', 'zzzz-no-such-post');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);

  await page.fill('#search', '');
  await expect(page.locator('.card')).toHaveCount(total);
  expect(drafts).toBeLessThanOrEqual(total);
});

test('New blog opens the split editor with a live preview', async ({ page }) => {
  await signIn(page);
  await page.click('#newPost');
  await expect(page.locator('#editorView')).toHaveClass(/on/);
  await expect(page.locator('.pane-edit')).toBeVisible();
  await expect(page.locator('.pane-preview')).toBeVisible();

  await page.fill('#bodyMd', '## Live preview heading\n\n**bold text**');
  // The preview is rendered server-side by the same code as the live page.
  await expect(page.locator('#pvBody h2')).toHaveText('Live preview heading');
  await expect(page.locator('#pvBody strong')).toHaveText('bold text');
});

test('nothing is written until Save is pressed', async ({ page }) => {
  await signIn(page);

  await page.click('#newPost');
  const title = `Unsaved draft ${Date.now()}`;
  await page.fill('#title', title);
  await page.fill('#excerpt', 'This must never reach the database.');
  await page.fill('#bodyMd', 'Typed but deliberately never saved.');
  await page.waitForTimeout(2500); // longer than any former autosave debounce

  // Asserting on this specific title rather than a total count, because other
  // specs add and remove posts in the same database.
  const after = (await (await page.request.get('/api/studio/list')).json()).posts;
  expect(after.some((p: { title: string }) => p.title === title)).toBe(false);
});

test('a draft is created only on Save, then appears in the list', async ({ page }) => {
  await signIn(page);
  await page.click('#newPost');

  const title = `Saved draft ${Date.now()}`;
  await page.fill('#title', title);
  await page.fill('#excerpt', 'Created by the studio UI test.');
  await page.fill('#bodyMd', 'Body text for the UI test.');
  await page.click('#saveBtn');

  await expect(page.locator('#editorError')).toHaveClass(/ok/);
  await expect(page.locator('#saveState')).toContainText('Saved');

  const posts = (await (await page.request.get('/api/studio/list')).json()).posts;
  const created = posts.find((p: { title: string }) => p.title === title);
  expect(created).toBeTruthy();

  // Clean up through the same soft-delete path the UI uses.
  await page.request.post('/api/studio/delete', { data: { id: created.id } });
});

test('deleting asks for confirmation first', async ({ page }) => {
  await signIn(page);
  const first = page.locator('.card').first();
  await first.hover();
  await first.locator('button[data-act="delete"]').click();

  await expect(page.locator('#scrim')).toBeVisible();
  await expect(page.locator('#dlgBody')).toContainText('soft delete');

  // Cancelling must leave the post untouched.
  const count = await page.locator('.card').count();
  await page.click('#dlgCancel');
  await expect(page.locator('#scrim')).not.toBeVisible();
  await expect(page.locator('.card')).toHaveCount(count);
});

test('a published post opens with Update and Unpublish; a draft shows neither', async ({ page }) => {
  await signIn(page);

  await page.click('#filters button[data-filter="published"]');
  await page.locator('.card').first().click();
  await expect(page.locator('#editorView')).toHaveClass(/on/);
  await expect(page.locator('#statusChip')).toHaveText('Published');
  await expect(page.locator('#publishBtn')).toHaveText('Update live post');
  await expect(page.locator('#unpublishBtn')).toBeVisible();

  await page.click('#backToList');
  await expect(page.locator('#listView')).toBeVisible();
  await page.click('#filters button[data-filter="draft"]');
  await expect(page.locator('.card .chip').first()).toHaveText('Draft');

  // Read the status off the card we are about to open and assert the editor
  // agrees, rather than assuming which post the filter put first.
  const card = page.locator('.card').first();
  const cardStatus = (await card.locator('.chip').textContent())?.trim();
  await card.click();
  await expect(page.locator('#statusChip')).toHaveText(cardStatus!);
  await expect(page.locator('#publishBtn')).toHaveText('Publish');
  // Regression guard: .sbtn is inline-flex, which used to defeat [hidden].
  await expect(page.locator('#unpublishBtn')).not.toBeVisible();
});
