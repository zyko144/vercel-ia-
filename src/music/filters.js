// Effets audio appliqués par ffmpeg.
export const FILTERS = {
  '8d': { label: '8D', emoji: '🎧', description: 'Le son tourne autour de ta tête', af: 'apulsator=hz=0.125' },
  bassboost: { label: 'Bass boost', emoji: '🔊', description: 'Plus de basses', af: 'bass=g=10:f=110:w=0.6' },
  nightcore: { label: 'Nightcore', emoji: '🌙', description: 'Plus rapide et plus aigu', af: 'aresample=48000,asetrate=60000,aresample=48000', speed: 1.25, group: 'speed' },
  slowed: { label: 'Slowed + reverb', emoji: '🐌', description: 'Ralenti avec de la réverb', af: 'aresample=48000,asetrate=40800,aresample=48000,aecho=0.8:0.88:60:0.4', speed: 0.85, group: 'speed' },
  vaporwave: { label: 'Vaporwave', emoji: '🌴', description: 'Lent et grave', af: 'aresample=48000,asetrate=38400,aresample=48000', speed: 0.8, group: 'speed' },
  speed: { label: 'Accéléré', emoji: '⏩', description: 'x1.25 sans changer la voix', af: 'atempo=1.25', speed: 1.25, group: 'speed' },
  karaoke: { label: 'Karaoké', emoji: '🎤', description: 'Enlève une partie de la voix', af: 'stereotools=mlev=0.03' },
  echo: { label: 'Écho', emoji: '🏔️', description: 'Effet grande salle', af: 'aecho=0.8:0.9:500:0.3' },
  tremolo: { label: 'Tremolo', emoji: '〰️', description: 'Volume qui ondule', af: 'tremolo=f=6:d=0.5' },
  vibrato: { label: 'Vibrato', emoji: '🎻', description: 'Voix qui vibre', af: 'vibrato=f=6:d=0.5' },
  surround: { label: 'Surround', emoji: '🔈', description: 'Son plus large', af: 'surround,pan=stereo|FL<FL+0.5*FC+0.6*BL|FR<FR+0.5*FC+0.6*BR' },
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

export function speedOf(active) {
  return [...active].reduce((speed, key) => speed * (FILTERS[key]?.speed ?? 1), 1);
}

export function filtersLabel(active) {
  return [...active].map((key) => `${FILTERS[key].emoji} ${FILTERS[key].label}`).join(', ') || 'Aucun';
}
