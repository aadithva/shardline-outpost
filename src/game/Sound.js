export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
  }

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }
  }

  shoot() {
    if (!this.context) return;

    const now = this.context.currentTime;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.09, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      const envelope = 1 - index / data.length;
      data[index] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(780, now);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(now);

    this.tone(92, 0.08, "square", 0.28, -32);
  }

  enemyShot() {
    this.tone(170, 0.14, "sawtooth", 0.22, -70);
  }

  hit() {
    this.tone(680, 0.05, "square", 0.12, 160);
  }

  reload() {
    this.tone(310, 0.07, "triangle", 0.1, 90);
    window.setTimeout(() => this.tone(440, 0.08, "triangle", 0.1, 120), 260);
  }

  pulse() {
    this.tone(140, 0.45, "sine", 0.22, 520);
  }

  damage() {
    this.tone(74, 0.2, "sawtooth", 0.18, -24);
  }

  complete() {
    this.tone(260, 0.18, "triangle", 0.12, 160);
    window.setTimeout(() => this.tone(390, 0.22, "triangle", 0.12, 180), 150);
    window.setTimeout(() => this.tone(520, 0.3, "triangle", 0.14, 220), 320);
  }

  tone(frequency, duration, type, volume, sweep = 0) {
    if (!this.context) return;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.linearRampToValueAtTime(Math.max(30, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
