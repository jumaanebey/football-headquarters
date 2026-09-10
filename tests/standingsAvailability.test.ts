import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_SUPABASE_URL','https://example.test'); vi.stubEnv('VITE_SUPABASE_ANON_KEY','public-key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('distinguishes a healthy empty board from an unavailable board for the competition UI', async () => {
 const fetch = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[]}).mockResolvedValueOnce({ok:false}); vi.stubGlobal('fetch',fetch);
 const {fetchLeaderboard} = await import('../pvp');
 await expect(fetchLeaderboard(20,true)).resolves.toEqual([]);
 await expect(fetchLeaderboard(20,true)).rejects.toThrow('Standings unavailable');
});
it('preserves the previous empty fallback for callers that do not request failure reporting',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 const {fetchLeaderboard}=await import('../pvp');
 await expect(fetchLeaderboard()).resolves.toEqual([]);
 await expect(fetchLeaderboard(20,true)).rejects.toThrow('offline');
});
