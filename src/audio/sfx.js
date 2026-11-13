// All sound is synthesized: blade swishes, metallic clangs, ink splashes, wind and a
// plucked-string (guqin-like) ambience made with Karplus–Strong.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.rev = ctx.createConvolver();
    this.rev.buffer = this.impulse(2.4);
    const rg = ctx.createGain();
    rg.gain.value = 0.4;
    this.rev.connect(rg).connect(this.master);
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.qin = this.pluckBuffer(196);
    this.startAmbience();
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  pluckBuffer(freq) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 3.2);
    const N = Math.round(sr / freq);
    const b = ctx.createBuffer(1, len, sr);
    const y = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const r = Math.random() * 2 - 1;
      prev = prev * 0.55 + r * 0.45;
      y[i] = prev;
    }
    for (let i = N; i < len; i++) y[i] = (y[i - N] + y[i - N + 1]) * 0.5 * 0.9975;
    return b;
  }

  out(node, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.rev);
    }
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  ok() {
    return this.ctx && !this.muted;
  }

  swish(power = 1) {
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(3400, t + 0.12);
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * power, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(bp).connect(g);
    this.out(g, 0.1);
    s.start(t, Math.random());
    s.stop(t + 0.25);
  }

  ring(base, partials, decay, vol, wet, t) {
    const ctx = this.ctx;
    partials.forEach((k, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * k * (1 + (Math.random() - 0.5) * 0.004);
      const g = this.gain();
      const v = vol / (i + 1.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (1 - i * 0.12));
      o.connect(g);
      this.out(g, wet);
      o.start(t);
      o.stop(t + decay + 0.05);
    });
  }

  click(t, freq, dur, vol) {
    const ctx = this.ctx;
    const s = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = freq;
    const g = this.gain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp).connect(g);
    this.out(g, 0.2);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  thump(t, f0, f1, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.gain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, 0.15);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  clang(perfect) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.click(t, 2500, 0.05, 0.6);
    this.ring(perfect ? 1180 : 1320, [1, 1.47, 2.09, 2.76, 3.41], perfect ? 1.6 : 0.7, perfect ? 0.32 : 0.22, perfect ? 0.6 : 0.3, t);
    if (perfect) {
      this.thump(t, 150, 50, 0.35, 0.55);
      this.ring(392, [1, 2.01], 2.2, 0.08, 0.7, t + 0.02);
    }
  }

  block() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.click(t, 1800, 0.04, 0.4);
    this.ring(760, [1, 1.53, 2.31], 0.28, 0.16, 0.15, t);
  }

  hit(combo = 1) {
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.14);
    const g = this.gain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(lp).connect(g);
    this.out(g, 0.2);
    s.start(t, Math.random());
    s.stop(t + 0.2);
    this.thump(t, 120 + combo * 8, 48, 0.16, 0.6);
    // a rising plucked note per combo step — the duel plays a melody
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
    this.pluck(196 * Math.pow(2, (scale[Math.min(combo - 1, scale.length - 1)] + 12) / 12), t + 0.01, 0.35);
  }

  hurt() {
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.thump(t, 90, 35, 0.4, 0.9);
    const s = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g = this.gain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    s.connect(lp).connect(g);
    this.out(g, 0.25);
    s.start(t, Math.random());
    s.stop(t + 0.32);
  }

  windup() {
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2300, t);
    o.frequency.exponentialRampToValueAtTime(3300, t + 0.45);
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g);
    this.out(g, 0.4);
    o.start(t);
    o.stop(t + 0.6);
  }

  dodge() {
    if (!this.ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    s.connect(bp).connect(g);
    this.out(g, 0.1);
    s.start(t, Math.random());
    s.stop(t + 0.3);
  }

  death() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.ring(110, [1, 2.4, 3.9, 5.3], 3.6, 0.3, 0.7, t);
    [0, 3, 7, 12].forEach((s, i) => this.pluck(196 * Math.pow(2, s / 12), t + 0.6 + i * 0.32, 0.4));
  }

  lose() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [7, 3, 0, -5].forEach((s, i) => this.pluck(196 * Math.pow(2, s / 12), t + 0.3 + i * 0.45, 0.35));
  }

  pluck(freq, when, vol = 0.3) {
    if (!this.ok() || !this.qin) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.qin;
    s.playbackRate.setValueAtTime(freq / 196, when);
    // a small slide, like a finger moving on the string
    s.playbackRate.linearRampToValueAtTime((freq / 196) * 0.985, when + 0.6);
    const g = this.gain(vol);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    s.connect(lp).connect(g);
    this.out(g, 0.45);
    s.start(when);
  }

  startAmbience() {
    const ctx = this.ctx;
    const s = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.gain(0.05);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = this.gain(220);
    lfo.connect(lg).connect(lp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lg2 = this.gain(0.025);
    lfo2.connect(lg2).connect(g.gain);
    s.connect(lp).connect(g);
    this.out(g, 0.2);
    s.start();
    lfo.start();
    lfo2.start();
    const notes = [0, 3, 5, 7, 10, 12, 15];
    const tick = () => {
      if (!this.ctx) return;
      if (!this.muted && Math.random() < 0.7) {
        const n = notes[Math.floor(Math.random() * notes.length)];
        this.pluck(196 * Math.pow(2, (n - 12) / 12), this.ctx.currentTime + 0.05, 0.16);
        if (Math.random() < 0.4) this.pluck(196 * Math.pow(2, (n - 5) / 12), this.ctx.currentTime + 0.5, 0.1);
      }
      setTimeout(tick, 4000 + Math.random() * 6000);
    };
    setTimeout(tick, 2500);
  }
}
