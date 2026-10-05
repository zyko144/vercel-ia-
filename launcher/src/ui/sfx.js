// Sons premium de l'interface, synthétisés en direct (Web Audio) : navigation, lancement, notification, appel.
// Aucun fichier son ; volume et activation réglables dans Paramètres › Sons.
(() => {
  let ctx = null;
  let master = null;
  let verb = null;
  const cfg = { on: true, notif: true, vol: 0.6, pack: 'verre' }; // packs : verre (défaut), doux, retro
  function init() {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = cfg.vol;
    // Petite réverbération (délai filtré) pour un rendu « verre »
    const d = ctx.createDelay(); d.delayTime.value = 0.11;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    verb = ctx.createGain(); verb.gain.value = 0.35;
    verb.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }
  function tone(freq, t0, dur, { type = 'sine', gain = 0.2, attack = 0.005, glide = null, wet = true } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const k = cfg.pack === 'doux' ? 0.5 : 1; // doux : une octave plus bas, sans réverbération ; rétro : ondes carrées 8 bits
    if (cfg.pack === 'retro') type = 'square';
    if (cfg.pack === 'doux') { wet = false; gain *= 0.8; }
    o.type = type;
    o.frequency.setValueAtTime(freq * k, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide * k, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); if (wet) g.connect(verb);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function whoosh(t0, dur, from, to, gain = 0.08) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t0); bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master); g.connect(verb);
    src.start(t0);
  }
  const SOUNDS = {
    nav: (t) => { tone(1500, t, 0.07, { gain: 0.06, glide: 1100 }); },
    click: (t) => { tone(2200, t, 0.035, { gain: 0.05, wet: false }); tone(1100, t, 0.05, { gain: 0.04, wet: false }); },
    pop: (t) => { tone(660, t, 0.12, { gain: 0.08, glide: 990 }); },
    success: (t) => { tone(784, t, 0.18, { gain: 0.09 }); tone(1175, t + 0.08, 0.28, { gain: 0.08 }); },
    error: (t) => { tone(330, t, 0.16, { gain: 0.09, type: 'triangle', glide: 247 }); },
    launch: (t) => {
      whoosh(t, 0.7, 300, 5000, 0.07);
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + 0.05 + i * 0.06, 0.55, { gain: 0.07 - i * 0.008, type: i % 2 ? 'triangle' : 'sine' }));
      tone(131, t, 0.6, { gain: 0.1, type: 'sine', glide: 262, wet: false });
    },
    notif: (t) => { tone(1319, t, 0.35, { gain: 0.1 }); tone(1976, t + 0.11, 0.5, { gain: 0.08 }); tone(2637, t + 0.11, 0.3, { gain: 0.02 }); },
    call: (t) => { for (let k = 0; k < 2; k++) { const s = t + k * 0.42; tone(880, s, 0.28, { gain: 0.09, type: 'triangle' }); tone(1109, s + 0.14, 0.3, { gain: 0.08, type: 'triangle' }); } },
  };
  window.sfx = {
    play(name) {
      const isNotif = name === 'notif' || name === 'call';
      if (!(isNotif ? cfg.notif : cfg.on) || !SOUNDS[name]) return;
      try { init(); if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](ctx.currentTime + 0.01); } catch { /* pas de son possible */ }
    },
    set(c) { Object.assign(cfg, c); if (master) master.gain.value = cfg.vol; },
    get: () => ({ ...cfg }),
  };
})();
