// Cartes de notification des amis (messages, « on joue ? », invitations, « X joue à … »).
const stack = document.getElementById('stack');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shown = new Set();
window.notif.onCards((cards) => {
  const ids = new Set(cards.map((c) => c.id));
  for (const el of [...stack.children]) if (!ids.has(el.dataset.id)) { el.classList.add('out'); setTimeout(() => el.remove(), 250); shown.delete(el.dataset.id); }
  for (const c of cards) {
    if (shown.has(c.id)) continue;
    shown.add(c.id);
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    el.style.setProperty('--ttl', `${c.ttl ?? 10000}ms`);
    el.innerHTML = `<div class="ico">${esc(c.icon)}</div><div class="txt"><b>${esc(c.title)}</b><p>${esc(c.body)}</p>${c.actions?.length ? `<div class="acts">${c.actions.map(([a, l], n) => `<button data-a="${esc(a)}" class="${n ? '' : 'main'}">${esc(l)}</button>`).join('')}</div>` : ''}</div><button class="x" data-a="close" title="Fermer">✕</button>`;
    stack.appendChild(el);
  }
});
stack.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  const card = e.target.closest('.card');
  if (card) window.notif.act(card.dataset.id, b ? b.dataset.a : 'open');
});
stack.addEventListener('mouseenter', () => window.notif.hover(true));
stack.addEventListener('mouseleave', () => window.notif.hover(false));
