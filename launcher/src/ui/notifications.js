export function initNotifications(api, { esc, openFriends, toast }) {
  const $ = (id) => document.getElementById(id);
  let rows = [], filter = 'all';
  function render() {
    const unread = rows.filter((n) => !n.read).length;
    $('notificationCount').hidden = !unread;
    $('notificationCount').textContent = unread > 99 ? '99+' : unread;
    const visible = rows.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : filter === 'app' ? n.kind === 'app' : n.kind !== 'app'));
    $('notificationList').innerHTML = visible.length ? visible.map((n) => {
      const actions = n.kind === 'call' && Date.now() - n.at > 45_000 ? [] : n.actions ?? [];
      return `<article class="notification-item ${n.read ? '' : 'unread'}"><span class="notification-icon">${esc(n.icon ?? '◈')}</span><div><b>${esc(n.title)}</b><p>${esc(n.body)}</p><time>${esc(new Date(n.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time><div class="notification-actions">${actions.map(([action, label]) => `<button class="btn sm" data-nid="${esc(n.id)}" data-naction="${esc(action)}">${esc(label)}</button>`).join('')}${!n.read ? `<button class="btn ghost sm" data-nread="${esc(n.id)}">Marquer comme lue</button>` : ''}</div></div></article>`;
    }).join('') : '<div class="empty">Tout est à jour.<br><small>Les nouvelles activités apparaîtront ici.</small></div>';
  }
  const update = (value) => { rows = Array.isArray(value) ? value : []; render(); };
  api.notifications?.().then(update).catch(() => {});
  api.onNotifications?.(update);
  api.onFriendsOpen?.(openFriends);
  $('notificationToggle').onclick = async () => {
    try { if (api.notifications) update(await api.notifications()); } catch { toast('Historique indisponible'); }
    render(); $('notificationCenter').showModal();
  };
  $('notificationClose').onclick = () => $('notificationCenter').close();
  $('notificationRead').onclick = async () => { if (api.notificationsRead) update(await api.notificationsRead()); };
  $('notificationFilters').onclick = (e) => {
    const button = e.target.closest('[data-filter]'); if (!button) return;
    filter = button.dataset.filter;
    for (const b of $('notificationFilters').querySelectorAll('button')) b.classList.toggle('on', b === button);
    render();
  };
  $('notificationList').onclick = async (e) => {
    const read = e.target.closest('[data-nread]');
    const action = e.target.closest('[data-naction]');
    try {
      if (read) update(await api.notificationsRead(read.dataset.nread));
      if (action) {
        action.disabled = true;
        await api.notificationAction(action.dataset.nid, action.dataset.naction);
        $('notificationCenter').close();
      }
    } catch { toast('Action indisponible. Réessaie.'); }
    finally { if (action) action.disabled = false; }
  };
}
