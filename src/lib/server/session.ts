import { STUDIO_PASSCODE, STUDIO_SECRET } from 'astro:env/server';
import type { APIContext, AstroCookies } from 'astro';

/**
 * Studio session: a signed, httpOnly cookie. No JWT library — an HMAC over a
 * tiny payload is ~30 lines of Web Crypto and runs identically on Node and
 * Edge runtimes.
 *
 * Threat model: the passcode is shared, so the real risk is a forwarded link,
 * not an online brute force. That is why STUDIO_PASSCODE must be high-entropy
 * (openssl rand -base64 24) and why every login is written to studio_audit.
 */

export const COOKIE_NAME = 'k1_studio';
const TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(STUDIO_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Length-invariant comparison so a mismatch leaks no timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Constant-time passcode check. */
export async function verifyPasscode(submitted: string): Promise<boolean> {
  // Compare digests, not raw strings, so differing lengths don't short-circuit.
  const [a, b] = await Promise.all([hmac(`pc:${submitted ?? ''}`), hmac(`pc:${STUDIO_PASSCODE}`)]);
  return timingSafeEqual(a, b);
}

export async function createSessionValue(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = String(exp);
  return `${payload}.${await hmac(payload)}`;
}

export async function isValidSessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return false;

  const expected = await hmac(payload);
  if (!timingSafeEqual(sig, expected)) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export function setSessionCookie(cookies: AstroCookies, value: string): void {
  cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

export async function isAuthed(context: APIContext | { cookies: AstroCookies }): Promise<boolean> {
  return isValidSessionValue(context.cookies.get(COOKIE_NAME)?.value);
}

/** Standard 401 for every /api/studio/* route. */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Hash an IP for the rate-limit and audit tables — never store raw IPs. */
export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${ip}:${STUDIO_SECRET}`));
  return b64url(new Uint8Array(digest)).slice(0, 32);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
