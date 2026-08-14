import type { APIRoute } from 'astro';
import {
  verifyPasscode,
  createSessionValue,
  setSessionCookie,
  clearSessionCookie,
} from '../../../lib/server/session';
import {
  json,
  audit,
  studioContext,
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
  MAX_ATTEMPTS,
  WINDOW_MINUTES,
} from '../../../lib/server/studio';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const { db, ipHash } = await studioContext(request);

  if (await isRateLimited(db, ipHash)) {
    return json(
      { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` },
      429,
    );
  }

  let passcode = '';
  try {
    passcode = ((await request.json()) as { passcode?: string }).passcode ?? '';
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (await verifyPasscode(passcode)) {
    await clearAttempts(db, ipHash);
    setSessionCookie(cookies, await createSessionValue());
    await audit(db, 'login', { ipHash });
    return json({ ok: true });
  }

  await recordFailedAttempt(db, ipHash);
  await audit(db, 'login_failed', { ipHash });
  // Fixed delay on failure — cheap, and removes any signal from response time.
  await new Promise((r) => setTimeout(r, 400));
  clearSessionCookie(cookies);
  return json({ error: `Incorrect passcode. ${MAX_ATTEMPTS} attempts per ${WINDOW_MINUTES} minutes.` }, 401);
};
