// Tiny procedural sound effects via WebAudio.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.last = {}; }
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur, type = 'sine', gain = 0.08, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, gain = 0.05, freq = 800) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(this.ctx.destination);
    s.start(t);
  }
  play(name) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const now = performance.now();
    const minGap = { hit: 60, chop: 120, click: 30 }[name] || 0;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'square', 0.03); break;
      case 'select': this.tone(660, 0.06, 'triangle', 0.04); break;
      case 'command': this.tone(1800, 0.09, 'square', 0.03, 300); break; // short whistle chirp
      case 'hit': this.noise(0.07, 0.05, 500); break; // pad thud
      case 'arrow': this.noise(0.1, 0.02, 1800); break; // ball whoosh
      case 'place': this.tone(300, 0.15, 'sawtooth', 0.04, -100); break;
      case 'complete': this.tone(523, 0.12, 'sine', 0.06); setTimeout(() => this.tone(784, 0.2, 'sine', 0.06), 110); break;
      case 'trained': this.tone(2200, 0.18, 'square', 0.035); break; // coach whistle
      case 'alert': this.tone(180, 0.6, 'sawtooth', 0.08, 40); setTimeout(() => this.tone(180, 0.6, 'sawtooth', 0.08, 40), 650); break; // air horn
      case 'destroyed': this.noise(0.7, 0.1, 400); this.tone(330, 0.7, 'sine', 0.08, -160); break; // crowd "awww"
      case 'error': this.tone(200, 0.15, 'square', 0.04, -60); break;
      case 'victory': [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.45, 'sawtooth', 0.06), i * 140)); setTimeout(() => this.noise(1.2, 0.08, 900), 700); break; // band hit + crowd
      case 'defeat': this.noise(1.4, 0.09, 350); [440, 392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 'sawtooth', 0.05), i * 260)); break;
    }
  }
}
