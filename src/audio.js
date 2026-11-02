// Small synthesized sound kit: plastic slide, connector click, bump, start-up tone.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 4 / 7;
    this.slideGain = null;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? this.level() : 0;
    this.master.connect(c.destination);
    // looping noise for the slide sound
    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
    this.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    this.slideGain = c.createGain(); this.slideGain.gain.value = 0;
    src.connect(bp).connect(this.slideGain).connect(this.master);
    src.start();
    this.slideFilter = bp;
  }
  level() { return 0.55 * Math.pow(this.volume / (4 / 7), 1.2); }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.level() : 0, this.ctx.currentTime, 0.02);
  }
  // Control Panel speaker volume, 0..1 (0 is silent)
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.setEnabled(this.volume > 0); }
  slide(speed) { // speed: 0..1
    if (!this.ctx || !this.slideGain) return;
    const t = this.ctx.currentTime;
    this.slideGain.gain.setTargetAtTime(Math.min(0.22, speed * 0.22), t, 0.04);
    this.slideFilter.frequency.setTargetAtTime(900 + speed * 1600, t, 0.05);
  }
  burst(dur, freq, q, gain, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, gain, type = 'sine', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  click() { if (!this.ctx) return; this.burst(0.035, 3200, 1.2, 0.5); this.tone(2400, 0.03, 0.08, 'triangle'); }
  snap() { if (!this.ctx) return; this.burst(0.05, 1800, 0.9, 0.55); this.tone(180, 0.07, 0.12, 'sine'); }
  bump() { if (!this.ctx) return; this.tone(110, 0.12, 0.25, 'sine'); this.burst(0.06, 600, 0.8, 0.25); }
  release() { if (!this.ctx) return; this.burst(0.08, 2400, 0.6, 0.18); }
  beep() { if (!this.ctx) return; this.tone(1047, 0.32, 0.12, 'square'); this.tone(1047, 0.34, 0.1, 'sine'); }
  sysBeep() { if (!this.ctx) return; this.tone(880, 0.16, 0.1, 'square'); }
}
