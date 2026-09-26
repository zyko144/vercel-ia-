// Tri et filtres de la bibliothèque : sans dépendance, utilisé par Windows et par l'interface.
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export const SORTS = {
  joues: (a, b) => b.minutes - a.minutes || b.lastPlayed - a.lastPlayed,
  recents: (a, b) => b.lastPlayed - a.lastPlayed || b.minutes - a.minutes,
  nom: (a, b) => a.name.localeCompare(b.name, 'fr'),
  taille: (a, b) => b.size - a.size,
};

export function filterSort(items, { sort = 'joues', kind = 'tout', source = 'tout', installed = 'tout', q = '' } = {}) {
  const words = norm(q);
  return items
    .filter((i) => !i.hidden || kind === 'caches')
    .filter((i) => kind === 'tout' || kind === 'caches' ? true : kind === 'favoris' ? i.favorite : kind === 'jeux' ? i.kind === 'game' : kind === 'applis' ? i.kind !== 'game' : true)
    .filter((i) => kind !== 'caches' || i.hidden)
    .filter((i) => source === 'tout' || i.source === source)
    .filter((i) => installed === 'tout' || (installed === 'oui') === i.installed)
    .filter((i) => !words || norm(i.name).includes(words))
    .sort((a, b) => (b.favorite - a.favorite) || (SORTS[sort] ?? SORTS.joues)(a, b));
}

