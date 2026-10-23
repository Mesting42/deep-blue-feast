/** 本地程序合成音景。首次手势后解锁 AudioContext，音乐与效果独立增益。 */
export class Audio {
  context: AudioContext | null = null;
  musicGain: GainNode | null = null;
  effectsGain: GainNode | null = null;
  music = 0.32;
  effects = 0.6;
  private nextNote = 0;
  private note = 0;
  private lastEat = 0;
  private region = 0;
  private noise: AudioBuffer | null = null;
  private swimGain: GainNode | null = null;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const c = this.context;
      this.musicGain = c.createGain();
      this.effectsGain = c.createGain();
      this.musicGain.connect(c.destination);
      this.effectsGain.connect(c.destination);
      this.musicGain.gain.value = this.music * 0.22;
      this.effectsGain.gain.value = this.effects * 0.22;
      this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const samples = this.noise.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.04) / 1.02;
        samples[i] = previous;
      }
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      const quiet = c.createGain();
      quiet.gain.value = 0.16;
      src.connect(filter);
      filter.connect(quiet);
      quiet.connect(this.musicGain);
      src.start();
      const swim = c.createBufferSource();
      swim.buffer = this.noise;
      swim.loop = true;
      const swFilter = c.createBiquadFilter();
      swFilter.type = 'bandpass';
      swFilter.frequency.value = 680;
      this.swimGain = c.createGain();
      this.swimGain.gain.value = 0;
      swim.connect(swFilter);
      swFilter.connect(this.swimGain);
      this.swimGain.connect(this.effectsGain);
      swim.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  volumes(music: number, effects: number) {
    this.music = music;
    this.effects = effects;
    if (this.context) {
      this.musicGain!.gain.setTargetAtTime(music * 0.22, this.context.currentTime, 0.12);
      this.effectsGain!.gain.setTargetAtTime(effects * 0.22, this.context.currentTime, 0.08);
    }
  }
  update(region: number, active: boolean, speed = 0) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    this.region = region;
    const now = c.currentTime;
    this.swimGain?.gain.setTargetAtTime(active ? Math.min(0.35, speed / 1500) : 0, now, 0.15);
    if (!active) {
      this.nextNote = now + 0.3;
      return;
    }
    if (now > this.nextNote) {
      const scales = [
        [196, 246.94, 293.66, 369.99, 440, 493.88],
        [146.83, 174.61, 220, 261.63, 293.66],
        [110, 146.83, 164.81, 220, 293.66],
      ];
      const notes = scales[region];
      this.tone(
        notes[(this.note * 7 + Math.floor(this.note / 3)) % notes.length],
        1.9,
        'sine',
        0.12,
        true,
      );
      if (this.note % 4 === 0) this.tone(notes[0] * 0.5, 3.2, 'sine', 0.13, true);
      this.note++;
      this.nextNote = now + 1.6 + region * 0.15;
    }
  }
  tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.5,
    music = false,
    bend = 0,
    delay = 0,
  ) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    const o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + bend), t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(music ? this.musicGain! : this.effectsGain!);
    o.start(t);
    o.stop(t + duration + 0.03);
  }
  play(name: string) {
    const c = this.context;
    if (!c) return;
    if (name === 'eat') {
      if (c.currentTime - this.lastEat < 0.055) return;
      this.lastEat = c.currentTime;
      this.tone(520 + Math.random() * 80, 0.16, 'sine', 0.5, false, 300);
    } else if (name === 'dash' || name === 'surge')
      this.tone(210, 0.45, 'triangle', 0.28, false, -150);
    else if (name === 'hurt') {
      this.tone(110, 0.28, 'triangle', 0.4, false, -45);
      this.tone(270, 0.13, 'sine', 0.2);
    } else if (name === 'warning') {
      this.tone(160, 0.5, 'triangle', 0.35);
      this.tone(190, 0.45, 'sine', 0.3, false, 0, 0.3);
    } else if (name === 'ink') this.tone(180, 0.8, 'sine', 0.4, false, -100);
    else if (name === 'pulse') {
      for (let i = 0; i < 5; i++)
        this.tone(350 + i * 130, 0.15, 'triangle', 0.2, false, 70, i * 0.06);
    } else if (name === 'armor') this.tone(440, 0.8, 'sine', 0.4, false, 220);
    else if (name === 'weak') {
      this.tone(740, 0.25, 'sine', 0.4);
      this.tone(985, 0.3, 'sine', 0.3, false, 0, 0.1);
    } else if (name === 'defeat') {
      [330, 293, 220, 164].forEach((n, i) => this.tone(n, 0.8, 'sine', 0.3, false, 0, i * 0.22));
    } else if (
      ['grow', 'evolve', 'treasure', 'beacon', 'region', 'victory', 'save'].includes(name)
    ) {
      const notes =
        name === 'victory'
          ? [392, 494, 587, 784, 988]
          : name === 'region'
            ? [294, 392, 440, 587]
            : [523, 659, 784];
      notes.forEach((n, i) =>
        this.tone(n, name === 'victory' ? 1.3 : 0.55, 'sine', 0.3, false, 0, i * 0.13),
      );
    } else this.tone(440, 0.12, 'sine', 0.2);
  }
  async background(hidden: boolean) {
    if (this.context) {
      if (hidden) await this.context.suspend();
      else if (this.context.state === 'suspended') await this.context.resume();
    }
  }
}
