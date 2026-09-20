/**
 * Moteur audio CASINHO.
 *
 * Tous les sons sont SYNTHÉTISÉS en direct (Web Audio) : aucun fichier, aucune licence à gérer,
 * et chaque déclenchement varie légèrement (hauteur, durée) pour ne jamais sonner « bouclé ».
 * Chaque jeu a sa propre matière sonore : métal pour Mines, roulement pour la Roulette,
 * moteur et butées pour les machines à sous, tension puis rupture pour Crash.
 */

type Bus = 'master' | 'music' | 'sfx' | 'ui' | 'ambience' | 'win' | 'jackpot';

const STORAGE = 'casinho-audio';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private gains: Partial<Record<Bus, GainNode>> = {};
  private noise: AudioBuffer | null = null;
  private ambienceNode: { stop: () => void } | null = null;
  volumes: Record<Bus, number> = { master: 0.8, music: 0.35, sfx: 0.9, ui: 0.6, ambience: 0.3, win: 0.9, jackpot: 1 };
  enabled = true;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
      this.volumes = { ...this.volumes, ...(saved.volumes ?? {}) };
      this.enabled = saved.enabled ?? true;
    } catch {
      // premier passage
    }
  }

  /** Le contexte ne peut démarrer qu'après une interaction : on l'ouvre au premier clic. */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined' || !this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      const master = this.ctx.createGain();
      master.gain.value = this.volumes.master;
      master.connect(this.ctx.destination);
      this.gains.master = master;
      for (const bus of ['music', 'sfx', 'ui', 'ambience', 'win', 'jackpot'] as Bus[]) {
        const gain = this.ctx.createGain();
        gain.gain.value = this.volumes[bus];
        gain.connect(master);
        this.gains[bus] = gain;
      }
      // bruit blanc réutilisé partout (souffle, impacts, explosions)
      const length = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(bus: Bus, value: number) {
    this.volumes[bus] = value;
    const gain = this.gains[bus];
    if (gain && this.ctx) gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    this.persist();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      this.stopAmbience();
      void this.ctx?.suspend();
    } else {
      void this.ctx?.resume();
    }
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ volumes: this.volumes, enabled: this.enabled }));
    } catch {
      // stockage indisponible : on continue sans mémoriser
    }
  }

  /** Baisse temporairement l'ambiance et la musique (gros gain, jackpot). */
  duck(seconds = 1.2) {
    const ctx = this.ensure();
    if (!ctx) return;
    for (const bus of ['ambience', 'music'] as Bus[]) {
      const gain = this.gains[bus];
      if (!gain) continue;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(this.volumes[bus] * 0.25, ctx.currentTime, 0.08);
      gain.gain.setTargetAtTime(this.volumes[bus], ctx.currentTime + seconds, 0.25);
    }
  }

  // ===================== briques de synthèse =====================

  private env(node: AudioNode, bus: Bus, { attack = 0.004, decay = 0.2, peak = 1, at = 0 }) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const t = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(gain);
    gain.connect(this.gains[bus] ?? this.gains.master!);
    return { gain, t };
  }

  /** Oscillateur simple avec enveloppe (clics, cloches, bips musicaux). */
  tone(frequency: number, {
    type = 'sine' as OscillatorType,
    decay = 0.18,
    peak = 0.3,
    bus = 'sfx' as Bus,
    at = 0,
    slideTo = 0,
    attack = 0.004,
  } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const { t } = this.env(osc, bus, { attack, decay, peak, at });
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + decay);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  /** Bruit filtré : souffle, impacts, frottements, explosions. */
  noiseBurst({
    decay = 0.2,
    peak = 0.3,
    bus = 'sfx' as Bus,
    at = 0,
    filter = 'bandpass' as BiquadFilterType,
    frequency = 1200,
    q = 3,
    sweepTo = 0,
  } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.frequency.value = frequency;
    band.Q.value = q;
    source.connect(band);
    const { t } = this.env(band, bus, { attack: 0.003, decay, peak, at });
    if (sweepTo) band.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + decay);
    source.start(t);
    source.stop(t + decay + 0.1);
  }

  /** Impact métallique : plusieurs partiels inharmoniques (plaque, butée, cloche). */
  metal(base: number, { decay = 0.35, peak = 0.22, bus = 'sfx' as Bus, at = 0, partials = [1, 2.76, 5.4, 8.9] } = {}) {
    for (const [index, ratio] of partials.entries()) {
      this.tone(base * ratio * (0.99 + Math.random() * 0.02), {
        type: 'sine',
        decay: decay / (1 + index * 0.6),
        peak: peak / (index + 1.3),
        bus,
        at,
      });
    }
  }

  // ===================== interface =====================

  ui = {
    click: () => {
      this.tone(2100, { type: 'square', decay: 0.03, peak: 0.07, bus: 'ui' });
      this.noiseBurst({ decay: 0.04, peak: 0.1, bus: 'ui', frequency: 3200, q: 1.2 });
    },
    hover: () => this.tone(1500, { type: 'sine', decay: 0.05, peak: 0.03, bus: 'ui' }),
    toggle: () => this.tone(760, { type: 'triangle', decay: 0.09, peak: 0.12, bus: 'ui', slideTo: 1180 }),
    error: () => {
      this.tone(320, { type: 'sawtooth', decay: 0.12, peak: 0.16, bus: 'ui', slideTo: 190 });
    },
    coin: (index = 0) => {
      this.metal(880 + index * 60, { decay: 0.3, peak: 0.16, bus: 'win', partials: [1, 2.4, 4.1] });
      this.noiseBurst({ decay: 0.06, peak: 0.08, bus: 'win', frequency: 5200, q: 2 });
    },
  };

  /** Pluie de pièces : utilisée pour les gains importants. */
  coinShower(count = 14) {
    const ctx = this.ensure();
    if (!ctx) return;
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.ui.coin(Math.floor(Math.random() * 6)), i * 55 + Math.random() * 40);
    }
  }

  win(level: 'small' | 'medium' | 'big' | 'mega') {
    const scales = {
      small: [523.25, 659.25],
      medium: [523.25, 659.25, 783.99],
      big: [523.25, 659.25, 783.99, 1046.5],
      mega: [392, 523.25, 659.25, 783.99, 1046.5, 1318.5],
    }[level];
    scales.forEach((frequency, index) => {
      this.tone(frequency, { type: 'triangle', decay: 0.42, peak: 0.16, bus: 'win', at: index * 0.085 });
      this.tone(frequency * 2, { type: 'sine', decay: 0.3, peak: 0.06, bus: 'win', at: index * 0.085 });
    });
    if (level === 'big' || level === 'mega') {
      this.duck(1.4);
      this.coinShower(level === 'mega' ? 26 : 14);
    }
  }

  jackpot() {
    this.duck(3);
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    notes.forEach((frequency, index) => {
      this.tone(frequency, { type: 'triangle', decay: 0.7, peak: 0.2, bus: 'jackpot', at: index * 0.1 });
      this.metal(frequency, { decay: 0.9, peak: 0.1, bus: 'jackpot', at: index * 0.1 });
    });
    this.coinShower(40);
  }

  // ===================== jeux =====================

  slots = {
    /** Bouton physique : un déclic mécanique, pas un bip. */
    button: () => {
      this.noiseBurst({ decay: 0.05, peak: 0.28, frequency: 900, q: 1.1 });
      this.tone(160, { type: 'square', decay: 0.06, peak: 0.16, slideTo: 90 });
    },
    /** Moteur + rouleaux : une boucle tenue tant que ça tourne. */
    spin: (durationMs: number) => {
      const ctx = this.ensure();
      if (!ctx || !this.noise) return;
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 480;
      band.Q.value = 1.6;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const end = now + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.12);
      gain.gain.setValueAtTime(0.14, end - 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      band.frequency.setValueAtTime(320, now);
      band.frequency.exponentialRampToValueAtTime(900, now + 0.35);
      band.frequency.exponentialRampToValueAtTime(420, end);
      source.connect(band);
      band.connect(gain);
      gain.connect(this.gains.sfx ?? this.gains.master!);
      source.start(now);
      source.stop(end + 0.05);
      // moteur (basse continue)
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.setValueAtTime(58, now);
      const motorFilter = ctx.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.value = 220;
      const motorGain = ctx.createGain();
      motorGain.gain.setValueAtTime(0.0001, now);
      motorGain.gain.exponentialRampToValueAtTime(0.05, now + 0.15);
      motorGain.gain.exponentialRampToValueAtTime(0.0001, end);
      motor.connect(motorFilter);
      motorFilter.connect(motorGain);
      motorGain.connect(this.gains.sfx ?? this.gains.master!);
      motor.start(now);
      motor.stop(end + 0.05);
    },
    /** Butée d'un rouleau : plus grave à chaque rouleau, comme une vraie machine. */
    reelStop: (index: number) => {
      this.metal(300 - index * 22, { decay: 0.22, peak: 0.3, partials: [1, 2.1, 3.4] });
      this.noiseBurst({ decay: 0.07, peak: 0.22, frequency: 700 - index * 60, q: 1.4 });
      this.tone(90 - index * 6, { type: 'sine', decay: 0.12, peak: 0.25 });
    },
    /** Tension quand deux scatters sont tombés. */
    anticipation: () => {
      this.tone(220, { type: 'sawtooth', decay: 1.1, peak: 0.08, slideTo: 660, attack: 0.3 });
      this.noiseBurst({ decay: 1.1, peak: 0.05, frequency: 400, q: 0.8, sweepTo: 2400 });
    },
  };

  mines = {
    reveal: () => {
      this.noiseBurst({ decay: 0.08, peak: 0.16, frequency: 1800, q: 2.2 });
      this.tone(420, { type: 'triangle', decay: 0.1, peak: 0.1, slideTo: 620 });
    },
    gem: (step: number) => {
      const base = 660 * 1.06 ** Math.min(step, 12);
      this.tone(base, { type: 'sine', decay: 0.4, peak: 0.16, bus: 'win' });
      this.tone(base * 2.01, { type: 'sine', decay: 0.28, peak: 0.07, bus: 'win' });
      this.metal(base * 1.5, { decay: 0.35, peak: 0.05, bus: 'win', partials: [1, 3.1] });
    },
    explode: () => {
      this.duck(0.9);
      this.noiseBurst({ decay: 0.9, peak: 0.55, filter: 'lowpass', frequency: 2400, sweepTo: 90, q: 0.7 });
      this.tone(70, { type: 'sine', decay: 0.7, peak: 0.45, slideTo: 28 });
      this.metal(180, { decay: 0.8, peak: 0.12, partials: [1, 1.7, 3.2, 6.1] });
    },
    cashout: () => {
      this.win('medium');
    },
  };

  plinko = {
    drop: () => this.noiseBurst({ decay: 0.06, peak: 0.12, frequency: 2200, q: 1.5 }),
    peg: (row: number) => {
      const base = 900 + row * 55 + Math.random() * 60;
      this.tone(base, { type: 'triangle', decay: 0.07, peak: 0.09 });
      this.noiseBurst({ decay: 0.03, peak: 0.06, frequency: base * 2, q: 4 });
    },
    land: (multiplier: number) => {
      this.metal(220, { decay: 0.5, peak: 0.25, partials: [1, 2.4, 4.6] });
      if (multiplier >= 1) this.win(multiplier >= 20 ? 'big' : multiplier >= 3 ? 'medium' : 'small');
    },
  };

  roulette = {
    spin: (durationMs: number) => {
      const ctx = this.ensure();
      if (!ctx || !this.noise) return;
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const end = now + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(600, end);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.gains.sfx ?? this.gains.master!);
      source.start(now);
      source.stop(end + 0.05);
    },
    tick: () => this.tone(2400 + Math.random() * 400, { type: 'square', decay: 0.02, peak: 0.05 }),
    ball: () => this.metal(1400, { decay: 0.12, peak: 0.1, partials: [1, 2.3] }),
    chips: () => {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => this.noiseBurst({ decay: 0.05, peak: 0.1, frequency: 2600 + Math.random() * 900, q: 3 }), i * 38);
      }
    },
  };

  crash = {
    launch: () => {
      this.noiseBurst({ decay: 1.4, peak: 0.18, filter: 'lowpass', frequency: 300, sweepTo: 1800, q: 0.7 });
      this.tone(90, { type: 'sawtooth', decay: 1.2, peak: 0.12, slideTo: 260 });
    },
    tick: (multiplier: number) => {
      const frequency = 320 * Math.min(6, multiplier) ** 0.6;
      this.tone(frequency, { type: 'square', decay: 0.04, peak: 0.05 });
    },
    boom: () => {
      this.duck(1);
      this.noiseBurst({ decay: 1.1, peak: 0.6, filter: 'lowpass', frequency: 3000, sweepTo: 60, q: 0.6 });
      this.tone(60, { type: 'sine', decay: 0.9, peak: 0.5, slideTo: 24 });
    },
    cashout: (multiplier: number) => this.win(multiplier >= 10 ? 'big' : multiplier >= 3 ? 'medium' : 'small'),
  };

  dice = {
    roll: () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => this.noiseBurst({ decay: 0.05, peak: 0.14, frequency: 900 + Math.random() * 1200, q: 2 }), i * 45);
      }
    },
    settle: (win: boolean) => (win ? this.win('small') : this.tone(200, { type: 'sine', decay: 0.25, peak: 0.12, slideTo: 120 })),
  };

  wheel = {
    tick: () => this.tone(1800 + Math.random() * 300, { type: 'square', decay: 0.025, peak: 0.06 }),
    stop: (multiplier: number) => (multiplier > 1 ? this.win(multiplier >= 5 ? 'big' : 'small') : this.tone(180, { type: 'sine', decay: 0.3, peak: 0.12, slideTo: 110 })),
  };

  cards = {
    slide: () => this.noiseBurst({ decay: 0.12, peak: 0.12, filter: 'bandpass', frequency: 3000, q: 0.8, sweepTo: 1200 }),
    flip: () => this.noiseBurst({ decay: 0.06, peak: 0.16, frequency: 1800, q: 1.2 }),
  };

  /** Ambiance de salle : très discrète, juste une présence. */
  startAmbience() {
    const ctx = this.ensure();
    if (!ctx || !this.noise || this.ambienceNode) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.gains.ambience ?? this.gains.master!);
    source.start();

    // quelques pièces et cloches lointaines
    const timer = setInterval(() => {
      if (Math.random() < 0.35) this.ui.coin(Math.floor(Math.random() * 4));
      if (Math.random() < 0.12) this.metal(520 + Math.random() * 300, { decay: 0.9, peak: 0.02, bus: 'ambience' });
    }, 4200);

    this.ambienceNode = {
      stop: () => {
        clearInterval(timer);
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
        setTimeout(() => source.stop(), 900);
      },
    };
  }

  stopAmbience() {
    this.ambienceNode?.stop();
    this.ambienceNode = null;
  }
}

export const audio = new AudioEngine();
export type { Bus };
