// Effets audio. Chaque effet existe en version ffmpeg (lecteur local) et en version Lavalink.
export const FILTERS = {
  '8d': {
    label: '8D', emoji: '🎧', description: 'Le son tourne autour de ta tête',
    af: 'apulsator=hz=0.125', lavalink: { rotation: { rotationHz: 0.2 } },
  },
  bassboost: {
    label: 'Bass boost', emoji: '🔊', description: 'Plus de basses',
    af: 'bass=g=10:f=110:w=0.6',
    lavalink: { equalizer: [{ band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 }, { band: 3, gain: 0.1 }, { band: 4, gain: 0.05 }] },
  },
  nightcore: {
    label: 'Nightcore', emoji: '🌙', description: 'Plus rapide et plus aigu',
    af: 'aresample=48000,asetrate=60000,aresample=48000', speed: 1.25, group: 'speed',
    lavalink: { timescale: { speed: 1.25, pitch: 1.25, rate: 1 } },
  },
  slowed: {
    label: 'Slowed + reverb', emoji: '🐌', description: 'Ralenti avec de la réverb',
    af: 'aresample=48000,asetrate=40800,aresample=48000,aecho=0.8:0.88:60:0.4', speed: 0.85, group: 'speed',
    lavalink: { timescale: { speed: 0.85, pitch: 0.9, rate: 1 } },
  },
  vaporwave: {
    label: 'Vaporwave', emoji: '🌴', description: 'Lent et grave',
    af: 'aresample=48000,asetrate=38400,aresample=48000', speed: 0.8, group: 'speed',
    lavalink: { timescale: { speed: 0.8, pitch: 0.8, rate: 1 } },
  },
  speed: {
    label: 'Accéléré', emoji: '⏩', description: 'x1.25 sans changer la voix',
    af: 'atempo=1.25', speed: 1.25, group: 'speed',
    lavalink: { timescale: { speed: 1.25, pitch: 1, rate: 1 } },
  },
  karaoke: {
    label: 'Karaoké', emoji: '🎤', description: 'Enlève une partie de la voix',
    af: 'stereotools=mlev=0.03',
    lavalink: { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
  },
  echo: {
    label: 'Écho', emoji: '🏔️', description: 'Effet grande salle',
    af: 'aecho=0.8:0.9:500:0.3',
    // Seuls les serveurs avec le module LavaDSPX savent faire l'écho
    lavalink: (node) => (node?.plugins?.some((p) => /dspx/i.test(p)) ? { pluginFilters: { echo: { echoLength: 0.5, decay: 0.5 } } } : {}),
  },
  tremolo: {
    label: 'Tremolo', emoji: '〰️', description: 'Volume qui ondule',
    af: 'tremolo=f=6:d=0.5', lavalink: { tremolo: { frequency: 4, depth: 0.75 } },
  },
  vibrato: {
    label: 'Vibrato', emoji: '🎻', description: 'Voix qui vibre',
    af: 'vibrato=f=6:d=0.5', lavalink: { vibrato: { frequency: 4, depth: 0.75 } },
  },
  surround: {
    label: 'Surround', emoji: '🔈', description: 'Son plus large',
    af: 'surround,pan=stereo|FL<FL+0.5*FC+0.6*BL|FR<FR+0.5*FC+0.6*BR',
    lavalink: { rotation: { rotationHz: 0.06 } },
  },
};

/** Garde un seul effet de vitesse à la fois (le dernier choisi). */
export function normalizeFilters(keys) {
  const result = [];
  for (const key of keys) {
    if (!FILTERS[key]) continue;
    if (FILTERS[key].group) {
      for (let i = result.length - 1; i >= 0; i--) if (FILTERS[result[i]].group === FILTERS[key].group) result.splice(i, 1);
    }
    if (!result.includes(key)) result.push(key);
  }
  return result;
}

export function filterChain(active, volume) {
  const parts = [...active].map((key) => FILTERS[key]?.af).filter(Boolean);
  parts.push(`volume=${(volume / 100).toFixed(2)}`);
  return parts.join(',');
}

/** Traduit les effets choisis pour un serveur Lavalink. */
export function lavalinkFilters(active, node) {
  const filters = {};
  for (const key of active) {
    const definition = FILTERS[key]?.lavalink;
    if (!definition) continue;
    const parts = typeof definition === 'function' ? definition(node) : definition;
    for (const [name, value] of Object.entries(parts)) {
      if (name === 'equalizer') filters.equalizer = [...(filters.equalizer ?? []), ...value];
      else if (name === 'pluginFilters') filters.pluginFilters = { ...(filters.pluginFilters ?? {}), ...value };
      else filters[name] ??= value;
    }
  }
  return filters;
}

export function speedOf(active) {
  return [...active].reduce((speed, key) => speed * (FILTERS[key]?.speed ?? 1), 1);
}

export function filtersLabel(active) {
  return [...active].map((key) => `${FILTERS[key].emoji} ${FILTERS[key].label}`).join(', ') || 'Aucun';
}
