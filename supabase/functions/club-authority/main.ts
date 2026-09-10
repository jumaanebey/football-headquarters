// Deno entry for the club-authority Edge Function. `index.ts` beside this file is GENERATED
// from it by `npm run authority:build` (esbuild bundle of this entry plus every shared game
// module it imports) and is what Supabase deploys. Edit this file and the modules it imports,
// never the bundle.
import { createSupabaseAuthorityStore } from '../../../server/authorityStore.ts';
import { createAuthorityService } from '../../../server/authorityService.ts';
import { createAuthorityHttp } from '../../../server/authorityHttp.ts';

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response> | Response): void;
  env: { get(key: string): string | undefined };
};

const required = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error('Missing club service configuration.');
  return value;
};

const url = required('SUPABASE_URL');
const store = createSupabaseAuthorityStore({ url, serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createAuthorityHttp({ url, publicKey: required('SUPABASE_ANON_KEY'), service: createAuthorityService(store) }));
