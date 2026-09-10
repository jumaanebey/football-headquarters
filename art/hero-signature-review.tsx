import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatedHero } from '../components/AnimatedHero';
import { loadHeroSignatures } from '../components/loadHeroSignatures';
import '../tailwind.css';
import '../game-motion.css';

// Local Vite-only art workbench. No club, gameplay, auth or network state.
await Promise.all(['qb', 'enforcer'].map(loadHeroSignatures));
function Review() {
  const [facing, setFacing] = useState(-1);
  const [take, setTake] = useState(0);
  return <main style={{ background: '#0f172a', color: '#fff', minHeight: '100vh', padding: 24, fontFamily: 'system-ui' }}>
    <h1>Franchise / Enforcer — ground registration</h1>
    <p>Four source poses at one body scale. Green line is the shared foot anchor. Small row is 72px game size.</p>
    <button onClick={() => setFacing(f => -f)}>Turn both heroes</button>{' '}
    <button onClick={() => setTake(t => t + 1)}>Reload takes</button>
    {(['qb', 'enforcer'] as const).map(key => <section key={key} aria-label={key}>
      <h2>{key === 'qb' ? 'The Franchise · Hail Mary' : 'The Enforcer · Truck Stick'}</h2>
      <div style={{ position: 'relative', width: 72, height: 72 }}><AnimatedHero heroKey={key} mode="idle" facing={facing} label={`${key} original idle`} /></div>
      <p>Original idle reference</p>
      {[192, 72].map(size => <div key={size} style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {['Set', 'Load', key === 'qb' ? 'Release' : 'Contact', 'Recover'].map((label, frame) => <div key={label}>
          <div style={{ width: size, height: size, position: 'relative', background: '#243f32', borderBottom: '1px solid #334155' }}>
            <div style={{ position: 'absolute', top: '96.354%', width: '100%', borderTop: '1px solid #4ade80' }} />
            <AnimatedHero heroKey={key} mode="signature" facing={facing} playbackKey={take} loadSignatureArt
              elapsedSeconds={(key === 'qb' ? [.01, .2, .36, .53] : [.01, .12, .21, .34])[frame]} label={`${key} ${label}`} />
          </div><p>{label}</p>
        </div>)}
      </div>)}
    </section>)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Review />);
