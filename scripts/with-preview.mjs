// Run a command while `vite preview` serves dist on the given port, then stop the server.
//   node scripts/with-preview.mjs <port> <command...>
import { spawn, spawnSync } from 'node:child_process';
const [port, ...command] = process.argv.slice(2);
const url0 = `http://127.0.0.1:${port}/`;
// Refuse a port that is already answering: otherwise another server (a dev server from a parallel
// task, another checkout's preview) would silently receive the checks and invalidate them.
try { const probe = await fetch(url0, { signal: AbortSignal.timeout(1500) }); if (probe) { console.error(`port ${port} is already serving something; choose a free port`); process.exit(1); } } catch { /* free */ }
const server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
let exited = false; server.on('exit', () => { exited = true; });
const url = url0;
let up = false;
for (let i = 0; i < 60 && !exited; i++) { try { const r = await fetch(url); if (r.ok) { up = true; break; } } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)); }
if (!up) { console.error(`preview did not start on ${url} (port busy or build missing?)`); server.kill(); process.exit(1); }
const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
server.kill();
process.exit(result.status ?? 1);
