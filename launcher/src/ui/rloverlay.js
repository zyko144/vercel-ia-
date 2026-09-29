// Overlay Rocket League (Ctrl+Alt+I) : dernier match, rang et MMR, série ; la flèche ouvre le résumé des dernières parties.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); if (m < 60) return `il y a ${Math.max(1, m)} min`; const d = new Date(t); const y = new Date(Date.now() - 86_400_000); return `${d.toDateString() === new Date().toDateString() ? 'Aujourd’hui' : d.toDateString() === y.toDateString() ? 'Hier' : d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; };
const short = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
const mmr = (g) => (g.mmr != null ? `<em class="${g.mmr >= 0 ? 'up' : 'down'}">${g.mmr > 0 ? '+' : ''}${g.mmr} MMR</em>` : '');
let open = false;
let last = null;

function draw(d) {
  last = d;
  const r = d.profile; const g = d.games[0];
  const mode = g?.mode ?? '3v3'; const rk = r?.ranked?.[mode] ?? r?.ranked?.['3v3'] ?? Object.values(r?.ranked ?? {})[0];
  $('name').textContent = d.player?.name ?? r?.name ?? 'Rocket League';
  if (r?.avatar) $('avatar').src = r.avatar;
  $('rank').innerHTML = rk?.tier ? `${rk.icon ? `<img src="${esc(rk.icon)}" alt="">` : ''}<span>${esc(rk.tier)}${rk.division ? ` · ${esc(rk.division.replace(/Division/i, 'Div.'))}` : ''}</span>${rk.mmr != null ? `<small>${Math.round(rk.mmr).toLocaleString('fr-FR')} MMR</small>` : ''}` : `<small>${d.player ? 'Rang : profil en cours de lecture' : 'Joue une partie pour relier ton compte'}</small>`;
  $('live').className = `dot ${d.live ? 'on' : ''}`;
  $('res').innerHTML = g
    ? `<div class="big ${g.win ? 'win' : 'loss'}"><span class="ic">${g.win ? '🏆' : '✖'}</span>${g.win ? 'Victoire' : 'Défaite'}</div><div class="score"><b class="blue">${g.us}</b> - <b class="orange">${g.them}</b></div>${mmr(g)}<small class="meta">${g.ranked ? 'Classé' : 'Partie'} ${esc(g.mode)} · ${ago(g.at)}</small>`
    : `<small class="meta">${d.statsOff ? 'Stats en direct coupées dans le jeu : Ctrl+Alt+I pour les activer, puis relance Rocket League.' : 'Aucun match enregistré pour l’instant : lance une partie.'}</small>`;
  const s = d.sum;
  $('sum').innerHTML = `${s.streak ? `<b class="${s.streak > 0 ? 'up' : 'down'}">${s.streak > 0 ? '🔥' : '❄'} ${Math.abs(s.streak)}${s.streak > 0 ? 'V' : 'D'} d’affilée</b> · ` : ''}<b class="up">${s.wins}V</b> <b class="down">${s.losses}D</b> aujourd’hui`;
  $('list').innerHTML = d.games.length ? d.games.map((x) => `<div class="g ${x.win ? 'win' : 'loss'}"><i>${x.win ? 'V' : 'D'}</i><span>${x.us} - ${x.them}</span><small>${esc(x.mode)}${x.ranked ? ' classé' : ''}</small>${mmr(x)}<time>${short(x.at)}</time></div>`).join('') : '<small class="meta">Pas encore de parties.</small>';
}
window.launcher?.onRl(draw);
$('more').addEventListener('click', () => {
  open = !open;
  document.body.classList.toggle('open', open);
  $('list').hidden = !open;
  window.launcher?.rlExpand(open);
});
setInterval(() => last && draw(last), 60_000); // « il y a X min » à jour
