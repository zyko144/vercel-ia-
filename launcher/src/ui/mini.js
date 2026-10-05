// Mini-launcher de la barre des tâches : 5 derniers jeux, recherche, état du PC
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (t) => { if (!t) return 'Jamais lancé'; const h = (Date.now() - t) / 3.6e6; return h < 1 ? 'À l’instant' : h < 24 ? `Il y a ${Math.round(h)} h` : h < 48 ? 'Hier' : h < 168 ? `Il y a ${Math.round(h / 24)} j` : `Il y a ${Math.round(h / 168)} sem.`; };
let data = null;
const row = (g) => `<div class="g"><div class="cv"${g.cover ? ` style="background-image:url('${esc(g.cover)}')"` : ''}>${g.cover ? '' : esc(g.name[0] ?? '?')}</div><div><b>${esc(g.name)}</b><small>${g.last !== undefined ? `${ago(g.last)} · ${Math.round((g.minutes ?? 0) / 60)} h` : ''}</small></div><button class="play${g.update ? ' up' : ''}" data-id="${esc(g.id)}" data-a="${g.update ? 'update' : 'launch'}">${g.update ? '⬆ Mettre à jour' : '▶ Jouer'}</button></div>`;
function draw() {
  const q = $('q').value.trim().toLowerCase();
  const list = q ? data.all.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 5) : data.recent;
  $('lbl').textContent = q ? 'Résultats' : 'Joué récemment';
  $('list').innerHTML = list.map(row).join('') || '<p class="empty">Aucun jeu trouvé</p>';
}
async function load() {
  data = await window.mini.data();
  $('health').textContent = data.health != null ? `${data.health >= 70 ? '💚' : data.health >= 45 ? '💛' : '❤️'} ${data.health}` : '–';
  $('cpu').textContent = data.cpuT != null ? `${Math.round(data.cpuT)} °C` : '–';
  $('friends').textContent = String(data.playing ?? 0);
  $('online').textContent = data.online ? `${data.online} ami${data.online > 1 ? 's' : ''} en ligne` : '';
  if (data.logo) $('logo').src = data.logo;
  document.documentElement.style.setProperty('--acc', data.accent);
  $('q').value = ''; draw(); $('q').focus();
}
$('q').addEventListener('input', draw);
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('list').querySelector('[data-id]')?.click(); if (e.key === 'Escape') window.mini.act(null, 'hide'); });
$('list').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) window.mini.act(b.dataset.id, b.dataset.a); });
$('open').addEventListener('click', () => window.mini.act(null, 'open'));
window.mini.onShown(load);
load();
