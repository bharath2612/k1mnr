/* ---------------------------------------------------------------------------
   Studio client.

   Two views: a card list of every post, and a split-screen editor.

   Deliberately has no Supabase client and no markdown library. Every read and
   write goes through /api/studio/*, and the preview is rendered server-side by
   the same code the live page uses — so the preview cannot drift, and no
   database credential is ever present in this bundle.

   Saving is explicit. An earlier version autosaved on a debounce, which meant
   half-formed posts kept appearing in the list; now nothing is written until
   Save draft, Publish or Update is pressed.
   --------------------------------------------------------------------------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const $i = (id: string) => $<HTMLInputElement>(id);
const $t = (id: string) => $<HTMLTextAreaElement>(id);
const $v = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id);

interface Cover {
  url: string | null;
  width: number | null;
  height: number | null;
}

interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  updated_at: string;
  cover_url: string | null;
  cover_alt: string | null;
  tags: string[] | null;
  author_name: string | null;
}

interface StudioState {
  id: string | null;
  status: string;
  knownUpdatedAt: string | null;
  cover: Cover;
  tags: string[];
  slugTouched: boolean;
  dirty: boolean;
  /** Persisted at least once — controls Save vs Update wording and Preview. */
  saved: boolean;
}

const state: StudioState = {
  id: null,
  status: 'draft',
  knownUpdatedAt: null,
  cover: { url: null, width: null, height: null },
  tags: [],
  slugTouched: false,
  dirty: false,
  saved: false,
};

interface Enquiry {
  id: string;
  material: string;
  grade_spec: string | null;
  quantity_mt: number | null;
  contract_type: string;
  destination: string | null;
  timeline: string | null;
  company: string;
  contact_name: string;
  designation: string | null;
  phone: string;
  email: string;
  message: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'closed' | 'spam';
  created_at: string;
}

const ENQ_STATUSES = ['new', 'contacted', 'qualified', 'closed', 'spam'] as const;

let posts: PostSummary[] = [];
let filter: 'all' | 'published' | 'draft' = 'all';
let enquiries: Enquiry[] = [];
let enqFilter: 'all' | Enquiry['status'] = 'all';
let query = '';
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let pendingDelete: PostSummary | null = null;

const EDIT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5a1.6 1.6 0 0 1 2.3 2.3L6 12.6l-3 .7.7-3z"/></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5"/></svg>';

/* ---------- helpers ---------- */
interface ApiResult<T = any> { ok: boolean; status: number; data: T }

async function api<T = any>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(`/api/studio/${path}`, {
    headers: options.body instanceof FormData ? {} : { 'content-type': 'application/json' },
    ...options,
  });
  if (res.status === 401) { showGate(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data } as ApiResult<T>;
}

function showError(el: string, message: string, list?: string[]): void {
  const box = $(el);
  box.innerHTML = message + (list?.length ? `<ul>${list.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '');
  box.hidden = false;
  box.classList.remove('ok');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function showOk(el: string, message: string): void {
  const box = $(el);
  box.innerHTML = message;
  box.hidden = false;
  box.classList.add('ok');
}
const hideError = (el: string): void => { $(el).hidden = true; };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 96).replace(/-+$/g, '');
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/* ---------- view switching ---------- */
function showView(name: 'list' | 'editor' | 'enquiries'): void {
  $('listView').classList.toggle('on', name === 'list');
  $('editorView').classList.toggle('on', name === 'editor');
  $('enquiriesView').classList.toggle('on', name === 'enquiries');
  $('topnav').querySelectorAll('button').forEach((b) =>
    b.classList.toggle('on', b.dataset.tab === (name === 'enquiries' ? 'enquiries' : 'posts')),
  );
  window.scrollTo(0, 0);
}

$('topnav').addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
  if (!btn) return;
  if (btn.dataset.tab === 'enquiries') {
    showView('enquiries');
    await loadEnquiries();
  } else {
    if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    state.dirty = false;
    showView('list');
    await loadList();
  }
});

function showGate(): void {
  $('gate').hidden = false;
  $('app').classList.remove('on');
}
function showApp(): void {
  $('gate').hidden = true;
  $('app').classList.add('on');
}

/* ---------- gate ---------- */
$('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('gateError');
  const btn = $<HTMLButtonElement>('gateSubmit');
  btn.disabled = true;
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
    showView('list');
    await loadList();
  } finally {
    btn.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/studio/logout', { method: 'POST' });
  showGate();
});

/* ---------- list view ---------- */
async function loadList(): Promise<void> {
  const { ok, data } = await api<{ posts: PostSummary[] }>('list');
  if (!ok) return;
  posts = data.posts ?? [];
  renderList();
}

function visiblePosts(): PostSummary[] {
  const q = query.trim().toLowerCase();
  return posts.filter((p) => {
    if (filter === 'published' && p.status !== 'published') return false;
    if (filter === 'draft' && p.status === 'published') return false;
    if (!q) return true;
    const hay = [p.title, p.excerpt ?? '', (p.tags ?? []).join(' '), p.slug].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderList(): void {
  const published = posts.filter((p) => p.status === 'published').length;
  const drafts = posts.length - published;
  $('cAll').textContent = String(posts.length);
  $('cPub').textContent = String(published);
  $('cDraft').textContent = String(drafts);
  $('listSummary').textContent =
    posts.length === 0
      ? 'No posts yet.'
      : `${posts.length} post${posts.length === 1 ? '' : 's'} · ${published} published · ${drafts} draft${drafts === 1 ? '' : 's'}`;

  const list = visiblePosts();
  const grid = $('cards');
  grid.innerHTML = '';

  const empty = $('emptyState');
  empty.hidden = list.length > 0;
  grid.hidden = list.length === 0;

  if (list.length === 0) {
    const filtered = posts.length > 0;
    $('emptyTitle').textContent = filtered ? 'Nothing matches' : 'No posts yet';
    $('emptyBody').textContent = filtered
      ? 'Try a different search term or filter.'
      : 'Write the first Industry Insights piece.';
    $<HTMLButtonElement>('emptyNew').hidden = filtered;
    return;
  }

  for (const p of list) {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Edit ${p.title}`);

    const cover = p.cover_url
      ? `<div class="card-cover"><img src="${escapeHtml(p.cover_url)}" alt="${escapeHtml(p.cover_alt ?? '')}" loading="lazy"></div>`
      : '<div class="card-cover empty">No cover image</div>';

    card.innerHTML = `
      ${cover}
      <div class="card-actions">
        <button class="icon-btn" data-act="edit"   title="Edit"   aria-label="Edit">${EDIT_ICON}</button>
        <button class="icon-btn danger" data-act="delete" title="Delete" aria-label="Delete">${TRASH_ICON}</button>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="chip ${p.status === 'published' ? 'published' : 'draft'}">${p.status === 'published' ? 'Published' : 'Draft'}</span>
          <time>${fmtDate(p.status === 'published' ? p.published_at : p.updated_at)}</time>
        </div>
        <h3>${escapeHtml(p.title || 'Untitled')}</h3>
        <p>${escapeHtml(p.excerpt ?? '')}</p>
        <div class="card-slug">/insights/${escapeHtml(p.slug)}</div>
      </div>`;

    card.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (btn?.dataset.act === 'delete') { e.stopPropagation(); askDelete(p); return; }
      openPost(p.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPost(p.id); }
    });

    grid.appendChild(card);
  }
}

$i('search').addEventListener('input', (e) => {
  query = (e.currentTarget as HTMLInputElement).value;
  renderList();
});

$('filters').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter as typeof filter;
  $('filters').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
  renderList();
});

/* ---------- enquiries ---------- */
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

async function loadEnquiries(): Promise<void> {
  hideError('enqError');
  const { ok, data } = await api<{ enquiries: Enquiry[]; error?: string }>('enquiries');
  if (!ok) {
    showError('enqError', (data as any).error || 'Could not load enquiries.');
    $('enqSummary').textContent = 'Unavailable.';
    return;
  }
  enquiries = data.enquiries ?? [];
  renderEnquiries();
}

function renderEnquiries(): void {
  const fresh = enquiries.filter((q) => q.status === 'new').length;
  const badge = $('cEnqNew');
  badge.textContent = String(fresh);
  badge.hidden = fresh === 0;

  $('enqSummary').textContent =
    enquiries.length === 0
      ? 'No enquiries yet.'
      : `${enquiries.length} enquir${enquiries.length === 1 ? 'y' : 'ies'} · ${fresh} new`;

  const list = enqFilter === 'all' ? enquiries : enquiries.filter((q) => q.status === enqFilter);
  const wrap = $('enqList');
  wrap.innerHTML = '';

  const empty = $('enqEmpty');
  empty.hidden = list.length > 0;
  wrap.hidden = list.length === 0;
  if (list.length === 0) {
    const filtered = enquiries.length > 0;
    $('enqEmptyTitle').textContent = filtered ? 'Nothing in this status' : 'No enquiries yet';
    $('enqEmptyBody').textContent = filtered
      ? 'Pick a different status filter.'
      : 'When someone sends a requirement through the website form, it appears here.';
    return;
  }

  for (const q of list) {
    const row = document.createElement('article');
    row.className = 'enq-row';

    const facts: Array<[string, string | null]> = [
      ['Grade / spec', q.grade_spec],
      ['Quantity', q.quantity_mt != null ? `${q.quantity_mt} MT` : null],
      ['Type', q.contract_type],
      ['Destination', q.destination],
      ['Timeline', q.timeline],
      ['Designation', q.designation],
    ];
    const factHtml = facts
      .filter(([, v]) => v)
      .map(([k, v]) => `<span><b>${k}:</b> ${escapeHtml(v!)}</span>`)
      .join('');

    row.innerHTML = `
      <div class="enq-top">
        <div>
          <h3>${escapeHtml(q.material)} — ${escapeHtml(q.company)}</h3>
          <p class="enq-who">
            ${escapeHtml(q.contact_name)} ·
            <a href="mailto:${escapeHtml(q.email)}">${escapeHtml(q.email)}</a> ·
            <a href="tel:${escapeHtml(q.phone)}">${escapeHtml(q.phone)}</a>
          </p>
        </div>
        <div class="enq-side">
          <time>${fmtDateTime(q.created_at)}</time>
          <select class="enq-status" data-id="${q.id}" aria-label="Enquiry status">
            ${ENQ_STATUSES.map((s) =>
              `<option value="${s}" ${s === q.status ? 'selected' : ''}>${s[0].toUpperCase()}${s.slice(1)}</option>`,
            ).join('')}
          </select>
        </div>
      </div>
      ${factHtml ? `<div class="enq-facts">${factHtml}</div>` : ''}
      ${q.message ? `<p class="enq-msg">${escapeHtml(q.message)}</p>` : ''}`;

    wrap.appendChild(row);
  }
}

$('enqFilters').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-status]');
  if (!btn) return;
  enqFilter = btn.dataset.status as typeof enqFilter;
  $('enqFilters').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
  renderEnquiries();
});

$('enqList').addEventListener('change', async (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select.enq-status');
  if (!sel) return;
  const id = sel.dataset.id!;
  const status = sel.value as Enquiry['status'];
  sel.disabled = true;
  try {
    const { ok, data } = await api('enquiries', { method: 'POST', body: JSON.stringify({ id, status }) });
    if (!ok) {
      showError('enqError', (data as any).error || 'Could not update status.');
      return;
    }
    const q = enquiries.find((x) => x.id === id);
    if (q) q.status = status;
    renderEnquiries();
  } finally {
    sel.disabled = false;
  }
});

/* ---------- delete (soft, confirmed) ---------- */
function askDelete(p: PostSummary): void {
  pendingDelete = p;
  $('dlgBody').innerHTML =
    `<b>${escapeHtml(p.title || 'Untitled')}</b> will be removed from the studio` +
    (p.status === 'published' ? ' and taken off the live site' : '') +
    '. This is a soft delete — the record is kept and can be restored.';
  $('scrim').hidden = false;
  $<HTMLButtonElement>('dlgConfirm').focus();
}
function closeDialog(): void {
  pendingDelete = null;
  $('scrim').hidden = true;
}
$('dlgCancel').addEventListener('click', closeDialog);
$('scrim').addEventListener('click', (e) => { if (e.target === $('scrim')) closeDialog(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('scrim').hidden) closeDialog(); });

$('dlgConfirm').addEventListener('click', async () => {
  if (!pendingDelete) return;
  const id = pendingDelete.id;
  closeDialog();
  const { ok, data } = await api('delete', { method: 'POST', body: JSON.stringify({ id }) });
  if (!ok) { alert(data.error || 'Could not delete.'); return; }
  if (state.id === id) { showView('list'); }
  await loadList();
});

/* ---------- editor ---------- */
function newPost(): void {
  state.id = crypto.randomUUID();
  state.status = 'draft';
  state.knownUpdatedAt = null;
  state.tags = [];
  state.cover = { url: null, width: null, height: null };
  state.slugTouched = false;
  state.dirty = false;
  state.saved = false;

  for (const f of ['title', 'slug', 'excerpt', 'bodyMd', 'coverAlt', 'authorName', 'seoTitle', 'seoDescription']) {
    $v(f).value = '';
  }
  hideError('editorError');
  renderCover();
  renderTags();
  syncStatus();
  updateCounts();
  refreshPreview();
  setSaveState('Not saved yet');
  showView('editor');
  $i('title').focus();
}
$('newPost').addEventListener('click', newPost);
$('emptyNew').addEventListener('click', newPost);

async function openPost(id: string): Promise<void> {
  const res = await fetch(`/api/studio/post?id=${encodeURIComponent(id)}`);
  if (res.status === 401) return showGate();
  const post = (await res.json()).post;
  if (!post) return;
  applyPost(post);
  showView('editor');
}

function applyPost(p: any): void {
  state.id = p.id;
  state.status = p.status;
  state.knownUpdatedAt = p.updated_at;
  state.tags = p.tags || [];
  state.cover = { url: p.cover_url, width: p.cover_width, height: p.cover_height };
  state.slugTouched = true;
  state.dirty = false;
  state.saved = true;

  $i('title').value = p.title || '';
  $i('slug').value = p.slug || '';
  $t('excerpt').value = p.excerpt || '';
  $t('bodyMd').value = p.body_md || '';
  $i('coverAlt').value = p.cover_alt || '';
  $i('authorName').value = p.author_name || '';
  $i('seoTitle').value = p.seo_title || '';
  $t('seoDescription').value = p.seo_description || '';

  hideError('editorError');
  renderCover();
  renderTags();
  syncStatus();
  updateCounts();
  refreshPreview();
  setSaveState(`Last saved ${fmtDate(p.updated_at)}`);
}

$('backToList').addEventListener('click', async () => {
  if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  showView('list');
  await loadList();
});

function setSaveState(text: string, dirty = false): void {
  const el = $('saveState');
  el.textContent = text;
  el.classList.toggle('dirty', dirty);
}

function syncStatus(): void {
  const published = state.status === 'published';
  const chip = $('statusChip');
  chip.textContent = published ? 'Published' : 'Draft';
  chip.className = `chip ${published ? 'published' : 'draft'}`;

  // A published post is edited in place: Update writes the change straight to
  // the live page, which is what "direct edit and publish" means here.
  $<HTMLButtonElement>('saveBtn').textContent = published ? 'Save changes' : 'Save draft';
  $<HTMLButtonElement>('publishBtn').textContent = published ? 'Update live post' : 'Publish';
  $<HTMLButtonElement>('unpublishBtn').hidden = !published;

  const link = $<HTMLAnchorElement>('previewLink');
  link.href = published ? `/insights/${$i('slug').value}` : `/studio/preview/${state.id ?? ''}`;
  link.textContent = published ? 'View live' : 'Preview';
  link.classList.toggle('busy', !published && !state.saved);
}

function markDirty(): void {
  state.dirty = true;
  setSaveState('Unsaved changes', true);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 400);
}

for (const f of ['title', 'slug', 'excerpt', 'bodyMd', 'coverAlt', 'authorName', 'seoTitle', 'seoDescription']) {
  $v(f).addEventListener('input', markDirty);
}
$i('title').addEventListener('input', () => {
  if (!state.slugTouched) $i('slug').value = slugify($i('title').value);
  updateCounts();
});
$i('slug').addEventListener('input', () => { state.slugTouched = true; });
$t('excerpt').addEventListener('input', updateCounts);

function updateCounts(): void {
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

/* ---------- save (explicit) ---------- */
function payload() {
  const title = $i('title').value.trim();
  return {
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
}

async function save(): Promise<boolean> {
  if (!state.id) return false;
  if ($i('title').value.trim().length < 3) {
    showError('editorError', 'A title of at least 3 characters is required before saving.');
    return false;
  }

  const { ok, status, data } = await api('save', { method: 'POST', body: JSON.stringify(payload()) });

  if (status === 409) { showError('editorError', data.message); return false; }
  if (!ok) { showError('editorError', data.error || 'Could not save.'); return false; }
  if (data.skipped) { showError('editorError', 'A title is required before saving.'); return false; }

  hideError('editorError');
  state.knownUpdatedAt = data.post.updated_at;
  state.status = data.post.status;
  state.dirty = false;
  state.saved = true;
  $i('slug').value = data.post.slug;
  syncStatus();
  setSaveState(`Saved ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  return true;
}

$('saveBtn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('saveBtn');
  btn.disabled = true;
  try {
    if (await save()) {
      showOk('editorError', state.status === 'published' ? 'Changes saved and live.' : 'Draft saved.');
      await loadList();
    }
  } finally { btn.disabled = false; }
});

/* ---------- preview (server-rendered) ---------- */
async function refreshPreview(): Promise<void> {
  updateCounts();
  const body = $t('bodyMd').value;
  if (!body.trim()) {
    $('pvBody').innerHTML = '<p class="preview-empty">Start writing to see the preview.</p>';
    return;
  }
  const { ok, data } = await api('render', { method: 'POST', body: JSON.stringify({ body_md: body }) });
  if (ok) $('pvBody').innerHTML = data.html;
}

function renderCover(): void {
  const has = Boolean(state.cover.url);
  $('coverPreview').hidden = !has;
  $('coverAltField').hidden = !has;
  $('pvCover').hidden = !has;
  if (state.cover.url) {
    $<HTMLImageElement>('coverImg').src = state.cover.url;
    $<HTMLImageElement>('pvCover').src = state.cover.url;
  }
}

/* ---------- tags ---------- */
function renderTags(): void {
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
  if (['h2', 'h3', 'ul', 'ol', 'quote'].includes(kind)) {
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const chunk = ta.value.slice(lineStart, end) || '';
    const prefixed = chunk.split('\n').map((l) => (l.startsWith(before) ? l : before + l)).join('\n');
    ta.setRangeText(prefixed, lineStart, end, 'end');
  } else {
    ta.setRangeText(before + selected + after, start, end, 'end');
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
  if (!state.id) return null;
  const { blob, width, height } = await prepareImage(file);
  const fd = new FormData();
  fd.append('file', new File([blob], 'image.webp', { type: 'image/webp' }));
  fd.append('post_id', state.id);
  fd.append('width', String(width));
  fd.append('height', String(height));
  const { ok, data } = await api('upload', { method: 'POST', body: fd });
  if (!ok) { showError('editorError', data.error || 'Upload failed.'); return null; }
  return { url: data.url, width, height };
}

$('coverDrop').addEventListener('click', () => $i('coverFile').click());
(['dragover', 'dragleave', 'drop'] as const).forEach((evt) =>
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

$('coverRemove').addEventListener('click', () => {
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
$('publishBtn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('publishBtn');
  btn.disabled = true;
  try {
    hideError('editorError');
    if (!(await save())) return;

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
    await loadList();
  } finally { btn.disabled = false; }
});

$('unpublishBtn').addEventListener('click', async () => {
  if (!confirm('Unpublish this post? It will return to draft and disappear from the site.')) return;
  const { ok, data } = await api('publish', {
    method: 'POST',
    body: JSON.stringify({ id: state.id, action: 'unpublish' }),
  });
  if (!ok) { showError('editorError', data.error || 'Could not unpublish.'); return; }
  state.status = 'draft';
  syncStatus();
  showOk('editorError', 'Unpublished. This post is now a draft.');
  await loadList();
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
  showView('list');
  await loadList();
  // Fetched at boot only for the "new enquiries" badge; errors (e.g. the
  // table not existing yet) stay silent here and surface on the tab itself.
  const enq = await api<{ enquiries: Enquiry[] }>('enquiries').catch(() => null);
  if (enq?.ok) {
    enquiries = enq.data.enquiries ?? [];
    renderEnquiries();
  }
})();

export {};
