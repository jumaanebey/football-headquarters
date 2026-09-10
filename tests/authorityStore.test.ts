import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthorityStore } from '../server/authorityStore';

afterEach(() => vi.unstubAllGlobals());

describe('supabase authority store startup', () => {
  it('starts inside an edge runtime that defines a global window (the deployed v2 crash)', () => {
    vi.stubGlobal('window', {});
    expect(() => createSupabaseAuthorityStore({ url: 'https://example.supabase.co', serviceRoleKey: 'service-role-test-key', fetch: vi.fn() })).not.toThrow();
  });
  it('refuses to run inside a real browser document', () => {
    vi.stubGlobal('document', { createElement: () => ({}) });
    expect(() => createSupabaseAuthorityStore({ url: 'https://example.supabase.co', serviceRoleKey: 'service-role-test-key', fetch: vi.fn() })).toThrow('server-only');
  });
  it('requires a private key and a plain https project URL', () => {
    expect(() => createSupabaseAuthorityStore({ url: 'https://example.supabase.co', serviceRoleKey: 'sb_publishable_123', fetch: vi.fn() })).toThrow();
    expect(() => createSupabaseAuthorityStore({ url: 'http://example.supabase.co', serviceRoleKey: 'service-role-test-key', fetch: vi.fn() })).toThrow();
    expect(() => createSupabaseAuthorityStore({ url: 'https://example.supabase.co/rest', serviceRoleKey: 'service-role-test-key', fetch: vi.fn() })).toThrow();
  });
});
