import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../../../lib/server/session';
import { json } from '../../../lib/server/studio';
import { serviceDb } from '../../../lib/server/supabase';

export const prerender = false;

/**
 * RFQ enquiries for the studio: GET lists them, POST updates triage status.
 *
 * Same trust model as every other /api/studio/* route — the table has no anon
 * policies, so this signed-cookie-gated handler with the service-role key is
 * the only read path. ip_hash and user_agent stay server-side: the studio
 * shows who enquired, not the forensic columns.
 */

const RFQ = 'rfq_enquiries';
const STATUSES = ['new', 'contacted', 'qualified', 'closed', 'spam'] as const;

const COLUMNS =
  'id, material, grade_spec, quantity_mt, contract_type, destination, timeline, ' +
  'company, contact_name, designation, phone, email, message, status, created_at';

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  const { data, error } = await serviceDb()
    .from(RFQ)
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    // Most likely cause until migration 0004 runs: relation does not exist.
    console.error('[studio] enquiries list failed:', error.message);
    return json({ error: `Could not load enquiries: ${error.message}` }, 500);
  }
  return json({ enquiries: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthed({ cookies }))) return unauthorized();

  let id = '';
  let status = '';
  try {
    const body = (await request.json()) as { id?: string; status?: string };
    id = body.id ?? '';
    status = body.status ?? '';
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!id || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const { error } = await serviceDb().from(RFQ).update({ status }).eq('id', id);
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
};
