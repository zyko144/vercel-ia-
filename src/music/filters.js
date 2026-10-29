// Effets audio : seulement la 8D (les autres faisaient ramer les serveurs audio). Version ffmpeg (lecteur local) et Lavalink.
export const FILTERS = {
  '8d': {
    label: '8D', emoji: '🎧', description: 'Le son tourne autour de ta tête',
    af: 'apulsator=hz=0.125', lavalink: { rotation: { rotationHz: 0.2 } },
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
  return [...active].filter((key) => FILTERS[key]).map((key) => `${FILTERS[key].emoji} ${FILTERS[key].label}`).join(', ') || 'Aucun';
}
