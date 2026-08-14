
/* ---------------------------------------------------------------------------
   Studio client.

   Deliberately has no Supabase client and no markdown library: every read and
   write goes through /api/studio/*, and the preview is rendered server-side by
   the same code the live page uses. That is why the preview cannot drift, and
   why no database credential is ever present in this bundle.
   --------------------------------------------------------------------------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** Narrower helpers so `.value` accesses are typed rather than asserted inline. */
const $i = (id: string) => $<HTMLInputElement>(id);
const $t = (id: string) => $<HTMLTextAreaElement>(id);
/** Every text-bearing control in the editor is one of these two. */
const $v = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id);

interface Cover {
  url: string | null;
  width: number | null;
  height: number | null;
}

interface StudioState {
  id: string | null;
  status: string;
  knownUpdatedAt: string | null;
  cover: Cover;
  tags: string[];
  slugTouched: boolean;
  dirty: boolean;
}

const state: StudioState = {
  id: null,
  status: 'draft',
  knownUpdatedAt: null,
  cover: { url: null, width: null, height: null },
  tags: [],
  slugTouched: false,
  dirty: false,
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

/* ---------- helpers ---------- */
interface ApiResult<T = any> { ok: boolean; status: number; data: T }

async function api<T = any>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(`/api/studio/${path}`, {
    headers: options.body instanceof FormData ? {} : { 'content-type': 'application/json' },
    ...options,
  });
  if (res.status === 401) { showGate(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function setSave(stateName: string, text: string): void {
  $('saveState').dataset.state = stateName;
  $('saveText').textContent = text;
}

function showError(el: string, message: string, list?: string[]): void {
  const box = $(el);
  box.innerHTML = message + (list?.length ? `<ul>${list.map((p) => `<li>${p}</li>`).join('')}</ul>` : '');
  box.hidden = false;
  box.classList.remove('ok');
}
function showOk(el: string, message: string): void {
  const box = $(el);
  box.innerHTML = message;
  box.hidden = false;
  box.classList.add('ok');
}
const hideError = (el: string): void => { $(el).hidden = true; };

function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 96).replace(/-+$/g, '');
}

/* ---------- gate ---------- */
function showGate() {
  $('gate').hidden = false;
  $('app').classList.remove('on');
}
function showApp() {
  $('gate').hidden = true;
  $('app').classList.add('on');
}

$('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('gateError');
  $<HTMLButtonElement>('gateSubmit').disabled = true;
  try {
    const res = await fetch('/api/studio/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: $i('passcode').value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showError('gateError', data.error || 'Sign-in failed.'); return; }
    $i('passcode').value = '';
    showApp();
    await loadList();
    newPost();
  } finally {
    $<HTMLButtonElement>('gateSubmit').disabled = false;
  }
});

$<HTMLButtonElement>('logout').addEventListener('click', async () => {
  await fetch('/api/studio/logout', { method: 'POST' });
  showGate();
});

/* ---------- post list ---------- */
async function loadList() {
  const { ok, data } = await api('list');
  if (!ok) return;
  const list = $('postList');
  list.innerHTML = '';
  for (const p of data.posts) {
    const btn = document.createElement('button');
    btn.className = 'post-item' + (p.id === state.id ? ' active' : '');
    btn.innerHTML =
      `<b></b><small class="${p.status === 'published' ? 'pub' : ''}"></small>`;
    btn.querySelector('b')!.textContent = p.title || 'Untitled';
    btn.querySelector('small')!.textContent =
      (p.status === 'published' ? 'Published' : 'Draft') + ' · ' +
      new Date(p.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    btn.addEventListener('click', () => loadPost(p.id));
    list.appendChild(btn);
  }
}

async function loadPost(id: string): Promise<void> {
  const res = await fetch(`/api/studio/post?id=${encodeURIComponent(id)}`);
  if (res.status === 401) return showGate();
  const post = (await res.json()).post;
  if (!post) return;
  applyPost(post);
  await loadList();
}

function applyPost(p: any): void {
  state.id = p.id;
  state.status = p.status;
  state.knownUpdatedAt = p.updated_at;
  state.tags = p.tags || [];
  state.cover = { url: p.cover_url, width: p.cover_width, height: p.cover_height };
  state.slugTouched = true;
  state.dirty = false;

  $i('title').value = p.title || '';
  $i('slug').value = p.slug || '';
  $t('excerpt').value = p.excerpt || '';
  $t('bodyMd').value = p.body_md || '';
  $i('coverAlt').value = p.cover_alt || '';
  $i('authorName').value = p.author_name || '';
  $i('seoTitle').value = p.seo_title || '';
  $t('seoDescription').value = p.seo_description || '';

  renderCover();
  renderTags();
  syncStatus();
  updateCounts();
  refreshPreview();
  setSave('idle', 'Loaded');
}

function newPost() {
  state.id = crypto.randomUUID();
  state.status = 'draft';
  state.knownUpdatedAt = null;
  state.tags = [];
  state.cover = { url: null, width: null, height: null };
  state.slugTouched = false;
  state.dirty = false;

  for (const f of ['title', 'slug', 'excerpt', 'bodyMd', 'coverAlt', 'authorName', 'seoTitle', 'seoDescription']) {
    $v(f).value = '';
  }
  renderCover();
  renderTags();
  syncStatus();
  updateCounts();
  refreshPreview();
  setSave('idle', 'New post');
  document.querySelectorAll('.post-item.active').forEach((el) => el.classList.remove('active'));
  $i('title').focus();
}
$<HTMLButtonElement>('newPost').addEventListener('click', newPost);

function syncStatus() {
  const published = state.status === 'published';
  $('statusPill').textContent = published ? 'Published' : 'Draft';
  $('statusPill').className = 'pill' + (published ? ' published' : '');
  $<HTMLButtonElement>('publishBtn').hidden = published;
  $<HTMLButtonElement>('unpublishBtn').hidden = !published;
  $<HTMLAnchorElement>('previewLink').href = published
    ? `/insights/${$i('slug').value}`
    : `/studio/preview/${state.id ?? ''}`;
}

/* ---------- autosave ---------- */
function markDirty() {
  state.dirty = true;
  setSave('saving', 'Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 400);
}

async function save() {
  if (!state.id) return;
  const title = $i('title').value.trim();
  if (title.length < 3) { setSave('idle', 'Add a title to save'); return; }

  const payload = {
    id: state.id,
    title,
    slug: $i('slug').value.trim() || slugify(title),
    excerpt: $t('excerpt').value,
    body_md: $t('bodyMd').value,
    cover_url: state.cover.url,
    cover_alt: $i('coverAlt').value,
    cover_width: state.cover.width,
    cover_height: state.cover.height,
    tags: state.tags,
    seo_title: $i('seoTitle').value,
    seo_description: $t('seoDescription').value,
    author_name: $i('authorName').value,
    known_updated_at: state.knownUpdatedAt,
  };

  const { ok, status, data } = await api('save', { method: 'POST', body: JSON.stringify(payload) });

  if (status === 409) {
    setSave('error', 'Conflict');
    showError('editorError', data.message);
    return;
  }
  if (!ok) {
    setSave('error', 'Not saved');
    showError('editorError', data.error || 'Could not save.');
    return;
  }
  if (data.skipped) { setSave('idle', 'Add a title to save'); return; }

  hideError('editorError');
  state.knownUpdatedAt = data.post.updated_at;
  state.status = data.post.status;
  state.dirty = false;
  $i('slug').value = data.post.slug;
  syncStatus();
  setSave('saved', 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  loadList();
}

for (const f of ['title', 'slug', 'excerpt', 'bodyMd', 'coverAlt', 'authorName', 'seoTitle', 'seoDescription']) {
  $(f).addEventListener('input', markDirty);
}
$i('title').addEventListener('input', () => {
  if (!state.slugTouched) $i('slug').value = slugify($i('title').value);
  updateCounts();
});
$i('slug').addEventListener('input', () => { state.slugTouched = true; });
$t('excerpt').addEventListener('input', updateCounts);

function updateCounts() {
  const n = $t('excerpt').value.length;
  const el = $('excerptCount');
  el.textContent = `${n}/320`;
  el.classList.toggle('over', n > 320);
  $('seoTitleHint').textContent = $i('title').value
    ? `Defaults to: ${$i('title').value} — K One Minerals`
    : 'Defaults to the post title.';
  $('pvTitle').textContent = $i('title').value || 'Untitled';
  const ex = $t('excerpt').value.trim();
  $('pvExcerpt').textContent = ex;
  $('pvExcerpt').hidden = !ex;
}

/* ---------- preview (server-rendered) ---------- */
async function refreshPreview() {
  updateCounts();
  const body = $t('bodyMd').value;
  if (!body.trim()) {
    $('pvBody').innerHTML = '<p class="preview-empty">Start writing to see the preview.</p>';
    return;
  }
  const { ok, data } = await api('render', { method: 'POST', body: JSON.stringify({ body_md: body }) });
  if (ok) $('pvBody').innerHTML = data.html;
}

function renderCover() {
  const has = Boolean(state.cover.url);
  $('coverPreview').hidden = !has;
  $('coverAltField').hidden = !has;
  $<HTMLImageElement>('pvCover').hidden = !has;
  if (state.cover.url) {
    $<HTMLImageElement>('coverImg').src = state.cover.url;
    $<HTMLImageElement>('pvCover').src = state.cover.url;
  }
}

/* ---------- tags ---------- */
function renderTags() {
  const wrap = $('tagInput');
  wrap.querySelectorAll('.tag-chip').forEach((el) => el.remove());
  for (const tag of state.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = '<span></span><button type="button" aria-label="Remove tag">×</button>';
    chip.querySelector('span')!.textContent = tag;
    chip.querySelector('button')!.addEventListener('click', () => {
      state.tags = state.tags.filter((t) => t !== tag);
      renderTags();
      markDirty();
    });
    wrap.insertBefore(chip, $i('tagField'));
  }
}
$i('tagField').addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  const field = e.currentTarget as HTMLInputElement;
  const v = field.value.trim();
  if (v && !state.tags.includes(v) && state.tags.length < 12) {
    state.tags.push(v);
    renderTags();
    markDirty();
  }
  field.value = '';
});

/* ---------- markdown toolbar ---------- */
const WRAPS: Record<string, [string, string]> = {
  bold: ['**', '**'], italic: ['*', '*'],
  h2: ['## ', ''], h3: ['### ', ''],
  ul: ['- ', ''], ol: ['1. ', ''], quote: ['> ', ''],
};

function applyMd(kind: string): void {
  const ta = $t('bodyMd');
  const start = ta.selectionStart, end = ta.selectionEnd;
  const selected = ta.value.slice(start, end);

  if (kind === 'hr') { insert(ta, '\n\n---\n\n'); return; }
  if (kind === 'image') { $i('bodyFile').click(); return; }
  if (kind === 'link') {
    const url = prompt('Link URL');
    if (!url) return;
    insert(ta, `[${selected || 'link text'}](${url})`);
    return;
  }

  const [before, after] = WRAPS[kind];
  const lineKinds = ['h2', 'h3', 'ul', 'ol', 'quote'];
  if (lineKinds.includes(kind)) {
    // Line-level: prefix each selected line (or the current one).
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const chunk = ta.value.slice(lineStart, end) || '';
    const prefixed = chunk.split('\n').map((l) => (l.startsWith(before) ? l : before + l)).join('\n');
    ta.setRangeText(prefixed, lineStart, end, 'end');
  } else {
    ta.setRangeText(before + selected + after, start, end, selected ? 'end' : 'end');
    if (!selected) ta.selectionStart = ta.selectionEnd = start + before.length;
  }
  ta.focus();
  markDirty();
}

function insert(ta: HTMLTextAreaElement, text: string): void {
  ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  markDirty();
}

$('toolbar').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-md]');
  if (btn?.dataset.md) applyMd(btn.dataset.md);
});

$t('bodyMd').addEventListener('keydown', (e: KeyboardEvent) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const map: Record<string, string> = { b: 'bold', i: 'italic', k: 'link' };
  const kind = map[e.key.toLowerCase()];
  if (kind) { e.preventDefault(); applyMd(kind); }
});

/* ---------- image upload ---------- */
/**
 * Decode with EXIF orientation applied and downscale before upload. The naive
 * canvas path drops orientation metadata, which lands phone photos sideways.
 */
async function prepareImage(file: File) {
  const MAX = 1800;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
  if (!blob) throw new Error('Could not encode image.');
  return { blob, width: w, height: h };
}

async function upload(file: File): Promise<Cover | null> {
  if (!state.id) newPost();
  const { blob, width, height } = await prepareImage(file);
  const fd = new FormData();
  fd.append('file', new File([blob], 'image.webp', { type: 'image/webp' }));
  fd.append('post_id', state.id!);
  fd.append('width', String(width));
  fd.append('height', String(height));
  const { ok, data } = await api('upload', { method: 'POST', body: fd });
  if (!ok) { showError('editorError', data.error || 'Upload failed.'); return null; }
  return { url: data.url, width, height };
}

$('coverDrop').addEventListener('click', () => $i('coverFile').click());
['dragover', 'dragleave', 'drop'].forEach((evt) =>
  $('coverDrop').addEventListener(evt, (e: Event) => {
    e.preventDefault();
    $('coverDrop').classList.toggle('over', evt === 'dragover');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (evt === 'drop' && file) handleCover(file);
  }),
);
$i('coverFile').addEventListener('change', (e) => {
  const file = (e.currentTarget as HTMLInputElement).files?.[0];
  if (file) handleCover(file);
});

async function handleCover(file: File): Promise<void> {
  $('coverDrop').classList.add('busy');
  const result = await upload(file);
  $('coverDrop').classList.remove('busy');
  if (!result) return;
  state.cover = result;
  renderCover();
  markDirty();
  $i('coverAlt').focus();
}

$<HTMLButtonElement>('coverRemove').addEventListener('click', () => {
  state.cover = { url: null, width: null, height: null };
  $i('coverAlt').value = '';
  renderCover();
  markDirty();
});

$i('bodyFile').addEventListener('change', async (e) => {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const result = await upload(file);
  input.value = '';
  if (!result) return;
  const alt = prompt('Alt text for this image (describe it for screen readers)') || '';
  insert($t('bodyMd'), `\n\n![${alt}](${result.url})\n\n`);
});

/* ---------- publish ---------- */
$<HTMLButtonElement>('publishBtn').addEventListener('click', async () => {
  hideError('editorError');
  clearTimeout(saveTimer);
  await save();
  if (state.dirty) return;

  const { ok, status, data } = await api('publish', {
    method: 'POST',
    body: JSON.stringify({ id: state.id, action: 'publish' }),
  });

  if (status === 422) { showError('editorError', 'Not ready to publish:', data.problems); return; }
  if (!ok) { showError('editorError', data.error || 'Publish failed.'); return; }

  state.status = 'published';
  syncStatus();
  showOk('editorError',
    `Published. <a href="/insights/${data.slug}" target="_blank" rel="noopener">View live post ↗</a>` +
    (data.purged ? '' : ' — allow up to 60 seconds for the cache to refresh.'));
  loadList();
});

$<HTMLButtonElement>('unpublishBtn').addEventListener('click', async () => {
  if (!confirm('Unpublish this post? It will return to draft and disappear from the site.')) return;
  const { ok, data } = await api('publish', {
    method: 'POST',
    body: JSON.stringify({ id: state.id, action: 'unpublish' }),
  });
  if (!ok) { showError('editorError', data.error || 'Could not unpublish.'); return; }
  state.status = 'draft';
  syncStatus();
  showOk('editorError', 'Unpublished. This post is now a draft.');
  loadList();
});

$<HTMLButtonElement>('deleteBtn').addEventListener('click', async () => {
  if (!state.knownUpdatedAt) { newPost(); return; }
  if (!confirm('Delete this post permanently? This cannot be undone.')) return;
  const { ok, data } = await api('delete', { method: 'POST', body: JSON.stringify({ id: state.id }) });
  if (!ok) { showError('editorError', data.error || 'Could not delete.'); return; }
  newPost();
  loadList();
});

/* Warn before losing an unsaved edit. */
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

/* ---------- boot ---------- */
(async () => {
  const res = await fetch('/api/studio/list');
  if (res.status === 401) { showGate(); return; }
  showApp();
  await loadList();
  newPost();
})();

export {};
