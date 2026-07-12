// Lightweight synthesized sound effects via the Web Audio API — no asset files,
// works offline. Each SFX is a short oscillator sequence with a soft envelope.

const MUTE_KEY = 'fhq_muted_v1';

let ctx: AudioContext | null = null;
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
})();

const ac = (): AudioContext | null => {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

/** One enveloped tone starting `start` seconds from now. */
const blip = (freq: number, start: number, dur: number, type: OscillatorType = 'triangle', peak = 0.22) => {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
};

const seq = (notes: Array<[freq: number, at: number, dur: number]>, type: OscillatorType = 'triangle', peak = 0.22) => {
  if (muted) return;
  notes.forEach(([f, at, d]) => blip(f, at, d, type, peak));
};

/** Stadium crowd roar — a band-passed noise swell (no samples needed). */
const roar = (dur = 1.5, peak = 0.22) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 0.6;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filt = a.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 850;
  filt.Q.value = 0.5;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.28); // swells like a crowd rising
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur);
};

// --- CROWD BED: a continuous low stadium murmur under battles, so the fight has AIR in it.
// Looping filtered noise + a slow swell LFO; intensity is adjustable (momentum ties in).
let bed: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
export const crowdBedStart = () => {
  if (muted || bed) return;
  const a = ac();
  if (!a) return;
  try {
    const len = Math.floor(a.sampleRate * 2.5);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; data[i] = last * 3.2; } // brown-ish noise = distant crowd
    const src = a.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = a.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 620; filt.Q.value = 0.4;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, a.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, a.currentTime + 1.2); // fade the stadium in
    // slow breathing swell so it never sounds like a flat hiss
    const lfo = a.createOscillator(); lfo.frequency.value = 0.13;
    const lfoGain = a.createGain(); lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filt).connect(gain).connect(a.destination);
    src.start(); lfo.start();
    bed = { src, gain, lfo };
  } catch { /* audio unavailable */ }
};
/** Nudge the crowd louder/quieter with the flow of the game (0..1). */
export const crowdBedIntensity = (v: number) => {
  const a = ac();
  if (!bed || !a) return;
  try { bed.gain.gain.linearRampToValueAtTime(0.035 + Math.min(1, Math.max(0, v)) * 0.055, a.currentTime + 0.4); } catch { /* ignore */ }
};
export const crowdBedStop = () => {
  const a = ac();
  if (!bed) return;
  try {
    if (a) bed.gain.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.6);
    const b = bed;
    setTimeout(() => { try { b.src.stop(); b.lfo.stop(); } catch { /* already stopped */ } }, 700);
  } catch { /* ignore */ }
  bed = null;
};

/** Low-end impact: noise click + sub-sine drop. dur/deep scale the weight. */
const impact = (deep = 60, dur = 0.28, peak = 0.3) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  // sub thump
  const osc = a.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(deep * 2.4, t0);
  osc.frequency.exponentialRampToValueAtTime(deep, t0 + dur * 0.7);
  const g = a.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
  // dirt click on top
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g2 = a.createGain(); g2.gain.value = peak * 0.5;
  src.connect(f).connect(g2).connect(a.destination);
  src.start(t0);
};

/** Filtered-noise sweep — throw whoosh / formation shift. */
const sweep = (from = 400, to = 1900, dur = 0.35, peak = 0.14) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0); src.stop(t0 + dur);
};

/** The home crowd deflates — a falling "awwww": noise swell whose pitch sinks. */
const deflate = (dur = 1.1, peak = 0.15) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(950, t0);
  f.frequency.exponentialRampToValueAtTime(300, t0 + dur); // the pitch of the room sinks
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0); src.stop(t0 + dur);
};

/** Stadium air horn — two detuned saws beating together, sagging as it runs out of air. */
const horn = (dur = 0.75, peak = 0.16) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.05);
  g.gain.setValueAtTime(peak, t0 + dur - 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  f.connect(g).connect(a.destination);
  for (const det of [0, 6]) {
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(233 + det, t0);
    o.frequency.setValueAtTime(233 + det, t0 + dur - 0.12);
    o.frequency.exponentialRampToValueAtTime(196 + det, t0 + dur);
    o.connect(f); o.start(t0); o.stop(t0 + dur + 0.02);
  }
};

/** A single snare-drum crack scheduled `at` seconds from now. */
const snare = (at: number, peak = 0.09) => {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const len = Math.floor(a.sampleRate * 0.09);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
  const g = a.createGain(); g.gain.value = peak;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
};

/** THE FIGHT SONG — a ~2.8s original brass riff + snare cadence for road wins.
    Melody on sawtooth "brass", harmony an octave down, marching snare underneath. */
const fightSong = () => {
  if (muted) return;
  const melody: Array<[number, number, number]> = [
    [659, 0.00, 0.14], [659, 0.16, 0.14], [698, 0.32, 0.14], [784, 0.48, 0.30],
    [659, 0.82, 0.14], [784, 0.98, 0.14], [880, 1.14, 0.14], [1047, 1.30, 0.55],
    [784, 1.92, 0.12], [880, 2.06, 0.12], [1047, 2.20, 0.55],
  ];
  seq(melody, 'sawtooth', 0.11);
  seq(melody.map(([f2, at, d]) => [f2 / 2, at, d] as [number, number, number]), 'triangle', 0.10);
  for (const at of [0, 0.32, 0.64, 0.98, 1.30, 1.62, 1.92, 2.20]) snare(at);
  snare(2.5, 0.12);
};

export const sfx = {
  thud:    () => impact(60, 0.26, 0.26),                              // boots hit the turf
  boom:    () => { impact(45, 0.5, 0.4); roar(0.8, 0.1); },           // facility sacked
  whoosh:  () => sweep(400, 1900, 0.35, 0.14),                        // throw / formation shift
  tick:    () => seq([[1320, 0, 0.04]], 'square', 0.08),              // suspense tick
  sting:   () => seq([[392, 0, 0.1], [587, 0.08, 0.12], [784, 0.16, 0.3]], 'sawtooth', 0.12), // reveal hit
  coinLand: () => seq([[1760, 0, 0.05], [2093, 0.04, 0.09]], 'triangle', 0.1), // arc arrival
  click:   () => seq([[880, 0, 0.06]], 'square', 0.12),
  crowdRoar: () => { roar(); seq([[659, 0.12, 0.12], [880, 0.26, 0.22]], 'triangle', 0.1); }, // roar + cheer sparkle
  aww:     () => { deflate(); seq([[349, 0.05, 0.3], [294, 0.28, 0.45]], 'triangle', 0.05); }, // home crowd deflates
  airhorn: () => horn(),                                              // the away section goes NUTS
  fightSong: () => fightSong(),                                       // the band takes the field
  kickoff:  () => { seq([[2100, 0, 0.14], [1800, 0.12, 0.1]], 'square', 0.14); roar(0.9, 0.12); }, // whistle + crowd stir
  collect: () => seq([[880, 0, 0.09], [1320, 0.05, 0.12]]),          // coin ding
  upgrade: () => seq([[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.18]]), // C-E-G rise
  sign:    () => seq([[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.1], [1046, 0.27, 0.28]]), // fanfare
  scout:   () => seq([[440, 0, 0.08], [587, 0.07, 0.12]]),
  error:   () => seq([[196, 0, 0.16], [155, 0.05, 0.2]], 'sawtooth', 0.18),
  whistle: () => seq([[2100, 0, 0.14], [1800, 0.12, 0.1]], 'square', 0.14),
  touchdown: () => seq([[659, 0, 0.1], [880, 0.09, 0.12], [1174, 0.19, 0.2]]), // rising cheer
  concede: () => seq([[330, 0, 0.14], [247, 0.12, 0.22]], 'sawtooth', 0.16),
  victory: () => seq([[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1046, 0.36, 0.35]]),
  defeat:  () => seq([[440, 0, 0.18], [349, 0.16, 0.18], [262, 0.34, 0.35]], 'sawtooth', 0.18),
};

export const isMuted = () => muted;

export const setMuted = (m: boolean) => {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (!m) sfx.click(); // audible confirmation when unmuting (also unlocks the context)
};

export const toggleMute = (): boolean => {
  setMuted(!muted);
  return muted;
};
