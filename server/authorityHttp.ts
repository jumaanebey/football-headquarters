// server/authorityHttp.ts
import type { AuthorityService } from './authorityService';

export interface AuthorityHttpOptions {
  url: string;
  publicKey: string;
  service: AuthorityService;
  fetch?: typeof fetch;
}

export type AuthorityHttpHandler = (request: Request) => Promise<Response>;

const cors: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const headers: Record<string, string> = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers });

export function createAuthorityHttp(options: AuthorityHttpOptions): AuthorityHttpHandler {
  const send = options.fetch ?? fetch;
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ ok: false, code: 'method', message: 'Use a club request.' }, 405);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ ok: false, code: 'content_type', message: 'A JSON club request is required.' }, 415);
    const bearer = request.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._-]+$/.test(bearer) || bearer.length > 12e3) return reply({ ok: false, code: 'unauthorized', message: 'Reconnect your club to continue.' }, 401);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 1e4);
    try {
      const auth = await send(new URL('/auth/v1/user', options.url), { headers: { Authorization: bearer, apikey: options.publicKey }, redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (!auth.ok) return reply({ ok: false, code: 'unauthorized', message: 'Reconnect your club to continue.' }, 401);
      const user = await auth.json();
      if (typeof user.id !== 'string' || typeof user.created_at !== 'string' || !Number.isFinite(Date.parse(user.created_at))) return reply({ ok: false, code: 'unauthorized', message: 'Reconnect your club to continue.' }, 401);
      const reader = request.body?.getReader();
      if (!reader) return reply({ ok: false, code: 'invalid_request', message: 'The club request is missing.' }, 400);
      const decoder = new TextDecoder();
      let length = 0, text = '';
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 45e4) {
          await reader.cancel();
          return reply({ ok: false, code: 'too_large', message: 'This club request is too large.' }, 413);
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return reply({ ok: false, code: 'invalid_request', message: 'The club request could not be read.' }, 400);
      }
      return reply(await options.service({ owner: user.id, createdAt: Date.parse(user.created_at) }, body));
    } catch {
      return reply({ ok: false, code: 'unavailable', message: 'Online protection is temporarily unavailable. Your club has been kept.' }, 503);
    } finally {
      clearTimeout(timer);
    }
  };
}
