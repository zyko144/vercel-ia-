// Browser preview only: no network traffic, no real messages or calls.
export function socialDemo() {
  const amis = [
    { id: 'm', pseudo: 'Max', online: true, playing: 'Rocket League', week: 840, join: { steam: '252950' }, status: 'Une dernière et on arrête ?' },
    { id: 'l', pseudo: 'Léa', online: true, playing: null, week: 300, status: 'Dispo pour jouer' },
    { id: 's', pseudo: 'Sam', online: false, playing: null, week: 95 },
  ];
  let demandes = [{ id: 'z', pseudo: 'Zoé', code: 'Zoé#11AA22' }];
  let groupes = [{ id: 'squad', name: 'La squad du soir', owner: true, members: amis.slice(0, 2) }];
  const threads = { m: [{ from: 'm', text: 'Tu nous rejoins ce soir ? On lance Rocket League vers 21 h.', at: Date.now() - 120000 }] };
  let notify;
  const rows = [
    { id: 'demo-msg', from: 'm', kind: 'msg', title: 'Max', body: 'Tu nous rejoins ce soir ?', icon: '💬', read: false, at: Date.now() - 120000, actions: [['reply', 'Répondre']] },
    { id: 'demo-friend', kind: 'friend', title: 'Zoé', body: 'Nouvelle demande d’ami', icon: '👤', read: false, at: Date.now() - 600000, actions: [['friends', 'Voir la demande']] },
    { id: 'demo-group', kind: 'group', title: 'La squad du soir · Léa', body: 'Rendez-vous à 21 h pour une partie.', icon: '👥', read: true, at: Date.now() - 3600000, actions: [] },
    { id: 'demo-app', kind: 'app', title: 'History est à jour', body: 'Tout est prêt pour ta prochaine session.', icon: '◈', read: false, at: Date.now() - 7200000, actions: [] },
  ];
  let chatOpen, friendsOpen;
  const view = () => ({ code: 'Noam#3F9A2C', moi: { week: 610 }, amis, demandes, groupes });
  return {
    hFriends: async () => view(),
    hFriendAdd: async () => ({ envoye: true }),
    hFriendAccept: async (id) => { demandes = demandes.filter((d) => d.id !== id); return view(); },
    hFriendRemove: async (id) => { demandes = demandes.filter((d) => d.id !== id); const i = amis.findIndex((a) => a.id === id); if (i >= 0) amis.splice(i, 1); return view(); },
    groupCreate: async (name, ids) => { groupes.push({ id: `g-${Date.now()}`, name, owner: true, members: amis.filter((a) => ids.includes(a.id)) }); return { ok: true, groupes }; },
    groupNotify: async (id) => ({ ok: true, sent: groupes.find((g) => g.id === id)?.members.length ?? 0 }),
    groupLeave: async (id) => { groupes = groupes.filter((g) => g.id !== id); return { groupes }; },
    chatThread: async (id) => ({ fil: threads[id] ?? [] }),
    chatSend: async (id, text) => { (threads[id] ??= []).push({ from: 'me', text, at: Date.now() }); return { ok: true, fil: threads[id] }; },
    callStart: async () => ({ error: 'Aperçu : les appels sont disponibles dans le launcher.' }),
    notifications: async () => rows,
    notificationsRead: async (id) => { for (const n of rows) if (!id || n.id === id || (typeof id === 'object' && n.kind === 'msg' && n.from === id.from)) n.read = true; notify?.(rows); return rows; },
    notificationAction: async (id, action) => { const n = rows.find((r) => r.id === id); if (!n) return; n.read = true; notify?.(rows); if (action === 'reply') chatOpen?.({ id: n.from }); if (action === 'friends') friendsOpen?.(); },
    onNotifications: (fn) => { notify = fn; },
    onChatOpen: (fn) => { chatOpen = fn; },
    onFriendsOpen: (fn) => { friendsOpen = fn; },
  };
}
