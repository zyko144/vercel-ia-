// Amis History en direct : de quoi rejoindre ma partie, qui vient de lancer un jeu, et les cartes de notification
// (en bas à gauche de l'écran, comme Steam) pour les messages, « on joue ? » et invitations.

/** Ce qu'un ami doit savoir pour me rejoindre (jeu Steam ou serveur FiveM), ou null. */
export function joinFor(item, fivemCode = null) {
  if (!item) return null;
  if (item.source === 'fivem') return fivemCode ? { fivem: fivemCode } : null;
  if (item.steamId && /^\d{1,10}$/.test(String(item.steamId))) return { steam: String(item.steamId) };
  return null;
}

/** Dernier serveur FiveM joué d'après les journaux lus ({ fichier: { code, end } }). */
export function lastFivemServer(logs, fallback = null) {
  const last = Object.values(logs ?? {}).filter((x) => x?.code).sort((a, b) => b.end - a.end)[0];
  return last?.code ?? fallback;
}

/** Amis qui viennent de lancer un jeu (ou d'en changer) depuis le dernier passage. */
export function newlyPlaying(prev, amis) {
  if (!prev) return [];
  return (amis ?? []).filter((a) => a.playing && prev[a.id] !== a.playing);
}
export const playingMap = (amis) => Object.fromEntries((amis ?? []).map((a) => [a.id, a.playing ?? null]));

/** Peut-on rejoindre cet ami ? (lien Steam/FiveM, ou même jeu installé ici) */
export function canJoin(friend, items) {
  if (!friend?.playing) return false;
  if (friend.join?.fivem) return items.some((i) => i.source === 'fivem');
  if (friend.join?.steam) return true;
  return items.some((i) => i.installed && i.name?.toLowerCase() === friend.playing.toLowerCase());
}

const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

/** Carte de notification pour un élément de la boîte de réception. */
export function cardFor(x) {
  const who = x.pseudo ?? 'Un ami';
  if (x.type === 'msg') return { id: x.id, kind: 'msg', from: x.from, icon: '💬', title: who, body: cut(x.text, 140), actions: [['reply', 'Répondre']], ttl: 12_000 };
  if (x.type === 'ask') return { id: x.id, kind: 'ask', from: x.from, icon: '🎮', title: `${who} veut jouer avec toi`, body: x.game ? `Demande à rejoindre ta partie de ${cut(x.game, 40)}.` : 'Demande à jouer avec toi.', actions: [['accept', 'Accepter'], ['decline', 'Refuser']], ttl: 30_000 };
  if (x.type === 'invite') return { id: x.id, kind: 'invite', from: x.from, icon: '📨', title: `${who} t’invite`, body: x.game ? `Rejoins sa partie de ${cut(x.game, 40)} !` : 'Rejoins sa partie !', actions: [['accept', 'Rejoindre'], ['decline', 'Plus tard']], ttl: 30_000 };
  if (x.type === 'reply') {
    return x.oui
      ? { id: x.id, kind: 'reply', from: x.from, join: x.join ?? null, game: x.game, icon: '✅', title: `${who} est d’accord !`, body: x.game ? `Rejoins sa partie de ${cut(x.game, 40)}.` : 'Tu peux rejoindre sa partie.', actions: x.join || x.game ? [['join', 'Rejoindre']] : [], ttl: 20_000 }
      : { id: x.id, kind: 'reply', from: x.from, icon: '⏳', title: `${who} ne peut pas maintenant`, body: 'Ce sera pour une prochaine fois.', actions: [], ttl: 8_000 };
  }
  return null;
}

/** Carte « X joue à Y » quand un ami lance un jeu. */
export function playingCard(friend, joinable) {
  return {
    id: `play-${friend.id}-${Date.now()}`, kind: 'playing', from: friend.id, icon: '🟢', title: friend.pseudo, body: `joue maintenant à ${cut(friend.playing, 40)}`,
    actions: [...(joinable ? [['join', 'Rejoindre']] : []), ['ask', 'On joue ?']], ttl: 10_000, join: friend.join ?? null, game: friend.playing,
  };
}
