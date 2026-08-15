import type { APIRoute } from 'astro';
import { RESEND_API_KEY } from 'astro:env/server';
import { serviceDb } from '../../lib/server/supabase';
import { clientIp, hashIp } from '../../lib/server/session';
import { json } from '../../lib/server/studio';
import { ORGANIZATION } from '../../lib/organization';

export const prerender = false;

/**
 * RFQ form handler. The one public write path on the site, so it is
 * deliberately paranoid:
 *
 *   * The table has no anon policies — this handler writes with the
 *     service-role key after validating every field against the same limits
 *     the DB constraints enforce.
 *   * Honeypot ("website" field): bots that fill it get a 200 and nothing is
 *     stored, so they never learn they were caught.
 *   * Rate limiting is Postgres-backed (rfq_rate_limits), same reasoning as
 *     the studio login: serverless is multi-instance.
 *   * Email notification is best-effort and OPTIONAL (needs RESEND_API_KEY in
 *     env). The row in rfq_enquiries is the source of truth; a mail failure
 *     must never lose an enquiry or fail the request.
 */

const RFQ = 'rfq_enquiries';
const LIMITS = 'rfq_rate_limits';
const MAX_PER_WINDOW = 5;
const WINDOW_MINUTES = 60;

const CONTRACT_TYPES = new Set(['one-off', 'recurring', 'annual']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Payload {
  material?: string;
  grade_spec?: string;
  quantity_mt?: string | number;
  contract_type?: string;
  destination?: string;
  timeline?: string;
  company?: string;
  contact_name?: string;
  designation?: string;
  phone?: string;
  email?: string;
  message?: string;
  website?: string; // honeypot
}

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export const POST: APIRoute = async ({ request }) => {
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // Honeypot: pretend success, store nothing.
  if (clean(body.website, 50)) return json({ ok: true });

  const material = clean(body.material, 120);
  const company = clean(body.company, 160);
  const contactName = clean(body.contact_name, 120);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 200);
  const contractType = clean(body.contract_type, 20) || 'one-off';

  const errors: Record<string, string> = {};
  if (material.length < 2) errors.material = 'Tell us the material you need.';
  if (company.length < 2) errors.company = 'Company name is required.';
  if (contactName.length < 2) errors.contact_name = 'Contact name is required.';
  if (phone.replace(/[^\d]/g, '').length < 7) errors.phone = 'A valid phone number is required.';
  if (!EMAIL_RE.test(email)) errors.email = 'A valid work email is required.';
  if (!CONTRACT_TYPES.has(contractType)) errors.contract_type = 'Invalid contract type.';

  let quantityMt: number | null = null;
  if (body.quantity_mt !== undefined && body.quantity_mt !== '') {
    quantityMt = Number(body.quantity_mt);
    if (!Number.isFinite(quantityMt) || quantityMt <= 0 || quantityMt > 100_000_000) {
      errors.quantity_mt = 'Quantity must be a positive number of metric tons.';
    }
  }

  if (Object.keys(errors).length) return json({ error: 'Please check the form.', fields: errors }, 400);

  const db = serviceDb();
  const ipHash = await hashIp(clientIp(request));

  // ---- rate limit ----------------------------------------------------------
  const { data: win } = await db
    .from(LIMITS)
    .select('window_start, count')
    .eq('ip_hash', ipHash)
    .maybeSingle<{ window_start: string; count: number }>();

  const stale = !win || (Date.now() - new Date(win.window_start).getTime()) / 60_000 > WINDOW_MINUTES;
  if (!stale && win!.count >= MAX_PER_WINDOW) {
    return json({ error: 'Too many enquiries from this connection. Please call us instead.' }, 429);
  }
  await db.from(LIMITS).upsert(
    stale
      ? { ip_hash: ipHash, window_start: new Date().toISOString(), count: 1 }
      : { ip_hash: ipHash, count: (win?.count ?? 0) + 1 },
    { onConflict: 'ip_hash' },
  );

  // ---- persist (source of truth) ------------------------------------------
  const row = {
    material,
    grade_spec: clean(body.grade_spec, 500) || null,
    quantity_mt: quantityMt,
    contract_type: contractType,
    destination: clean(body.destination, 200) || null,
    timeline: clean(body.timeline, 200) || null,
    company,
    contact_name: contactName,
    designation: clean(body.designation, 120) || null,
    phone,
    email,
    message: clean(body.message, 3000) || null,
    ip_hash: ipHash,
    user_agent: clean(request.headers.get('user-agent'), 300) || null,
  };

  const { data: saved, error } = await db.from(RFQ).insert(row).select('id').single();
  if (error) {
    console.error('[rfq] insert failed:', error.message);
    return json({ error: 'Something went wrong. Please email or call us directly.' }, 500);
  }

  // ---- notify (best-effort) ------------------------------------------------
  await notify(row, saved.id);

  return json({ ok: true });
};

/** Both mails go through Resend when configured; silently skipped otherwise. */
async function notify(row: Record<string, unknown>, id: string): Promise<void> {
  if (!RESEND_API_KEY) return;

  const to = ORGANIZATION.email;
  const from = `K One Minerals <rfq@k1mnr.com>`;

  const lines = Object.entries(row)
    .filter(([k, v]) => v != null && k !== 'ip_hash' && k !== 'user_agent')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join('\n');

  const send = (payload: unknown) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  const results = await Promise.allSettled([
    send({
      from,
      to: [to],
      reply_to: row.email,
      subject: `New RFQ — ${row.material} — ${row.company}`,
      text: `New enquiry (${id}):\n\n${lines}\n\nStored in rfq_enquiries.`,
    }),
    send({
      from,
      to: [row.email],
      subject: 'We received your enquiry — K One Minerals',
      text:
        `Hello ${row.contact_name},\n\n` +
        `Thank you for your enquiry about ${row.material}. Our team will come back to you ` +
        `within one business day.\n\nIf it is urgent, call us on ${ORGANIZATION.telephone} ` +
        `or WhatsApp the same number.\n\nK One Minerals & Natural Resources LLP\n${to}`,
    }),
  ]);

  for (const r of results) {
    if (r.status === 'rejected') console.error('[rfq] mail send failed:', r.reason);
    else if (!r.value.ok) console.error('[rfq] mail send failed:', r.value.status, await r.value.text().catch(() => ''));
  }
}
