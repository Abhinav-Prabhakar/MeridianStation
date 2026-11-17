/**
 * Small synthesised sound kit. No audio files: every cue is built from
 * oscillators and filtered noise, so it stays in-theme and costs nothing.
 */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private humGain: GainNode | null = null;
  private humOscs: OscillatorNode[] = [];
  private tone: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  enabled = true;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(c.destination);

    const len = Math.floor(c.sampleRate * 1.6);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildHum();
  }

  private buildHum() {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 210;
    g.connect(lp).connect(this.master);
    for (const [f, amp] of [
      [50, 0.5],
      [100, 0.22],
      [150, 0.08],
    ]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start();
      this.humOscs.push(o);
    }
    this.humGain = g;
  }

  /** 0..1 mains hum level */
  setHum(v: number) {
    if (!this.ctx || !this.humGain) return;
    this.humGain.gain.setTargetAtTime(v * 0.035, this.ctx.currentTime, 0.4);
  }

  private noise(dur = 0.12, freq = 2400, q = 1, gain = 0.25, type: BiquadFilterType = "bandpass") {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  }

  private blip(freq: number, dur = 0.08, gain = 0.12, type: OscillatorType = "sine", slideTo?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  click() {
    this.noise(0.05, 3200, 2, 0.16);
    this.blip(1400, 0.03, 0.05, "square");
  }
  detent() {
    this.noise(0.035, 1900, 3, 0.1);
  }
  clunk() {
    this.noise(0.16, 220, 0.8, 0.3, "lowpass");
    this.blip(120, 0.16, 0.2, "sine", 48);
  }
  relay() {
    this.click();
    window.setTimeout(() => this.click(), 90);
  }
  thunk() {
    this.noise(0.3, 140, 0.7, 0.4, "lowpass");
    this.blip(84, 0.34, 0.32, "sine", 38);
  }
  ballast() {
    this.noise(0.09, 900, 0.6, 0.22, "highpass");
    this.blip(160, 0.12, 0.08, "sawtooth", 90);
  }
  steam(dur = 0.9) {
    this.noise(dur, 1600, 0.5, 0.22, "highpass");
  }
  paper() {
    this.noise(0.22, 5200, 0.7, 0.07, "highpass");
  }
  error() {
    this.blip(180, 0.22, 0.16, "square", 90);
  }
  success() {
    this.blip(660, 0.12, 0.1, "sine");
    window.setTimeout(() => this.blip(990, 0.22, 0.1, "sine"), 110);
  }
  door() {
    this.noise(1.6, 320, 0.5, 0.22, "lowpass");
    this.blip(58, 1.8, 0.22, "sine", 40);
  }

  /** continuous test tone for the anechoic chamber */
  oscOn(freq: number) {
    if (!this.ctx) return;
    if (!this.tone) {
      const c = this.ctx;
      this.tone = c.createOscillator();
      this.tone.type = "sine";
      this.toneGain = c.createGain();
      this.toneGain.gain.value = 0;
      this.tone.connect(this.toneGain).connect(this.master);
      this.tone.start();
    }
    this.tone.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
    this.toneGain!.gain.setTargetAtTime(0.075, this.ctx.currentTime, 0.03);
  }
  oscOff() {
    if (this.ctx && this.toneGain) this.toneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}

export const audio = new Audio();
