// Tri et filtres de la bibliothèque : sans dépendance, utilisé par Windows et par l'interface.
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export const SORTS = {
  joues: (a, b) => b.minutes - a.minutes || b.lastPlayed - a.lastPlayed,
  recents: (a, b) => b.lastPlayed - a.lastPlayed || b.minutes - a.minutes,
  nom: (a, b) => a.name.localeCompare(b.name, 'fr'),
  taille: (a, b) => b.size - a.size,
};

/**
 * Par défaut (« Tous ») : les jeux installés ou joués, les applis connues ou utilisées, et les favoris. Un jeu seulement
 * possédé (jeu gratuit récupéré, jamais lancé) n'apparaît que dans « Non installés ».
 * Les jeux installés passent toujours en premier, puis les favoris, puis le tri choisi.
 */
export function filterSort(items, { sort = 'joues', kind = 'tout', source = 'tout', installed = 'tout', q = '' } = {}) {
  const words = norm(q);
  const played = (i) => i.minutes > 0 || i.lastPlayed > 0;
  return items
    .filter((i) => !i.hidden || kind === 'caches')
    .filter((i) => kind === 'tout' || kind === 'caches' ? true : kind === 'favoris' ? i.favorite : kind === 'jeux' ? i.kind === 'game' : kind === 'applis' ? i.kind !== 'game' : true)
    .filter((i) => kind !== 'caches' || i.hidden)
    .filter((i) => source === 'tout' || i.source === source)
    // Applis : par défaut seulement les connues (Spotify, Discord, CCleaner…) ou celles qu'on utilise vraiment
    .filter((i) => (installed === 'oui' ? i.installed : installed === 'non' ? !i.installed : (i.kind === 'game' ? i.installed || played(i) : i.known !== false || played(i)) || i.favorite || Boolean(words)))
    .filter((i) => !words || norm(i.name).includes(words))
    .sort((a, b) => (b.installed - a.installed) || (b.favorite - a.favorite) || (SORTS[sort] ?? SORTS.joues)(a, b));
}
