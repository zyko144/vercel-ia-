// Overlay Rocket League (Ctrl+Alt+I) : rang et MMR, dernier match, victoires/défaites du jour par catégorie et par mode ;
// la flèche ouvre les dernières parties. Le néon autour de la carte est vert si la journée est positive, rouge sinon.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); if (m < 60) return `${Math.max(1, m)} min`; const d = new Date(t); const y = new Date(Date.now() - 86_400_000); return `${d.toDateString() === new Date().toDateString() ? '' : d.toDateString() === y.toDateString() ? 'hier ' : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} `}${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; };
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
const CAT = { ranked: 'classé', casual: 'occa' };
const catOf = (g) => (g.ranked === true ? 'ranked' : g.ranked === false ? 'casual' : 'all');
// Logos des rangs fournis (ui/rl/) ; sinon celui du profil
const rankIcon = (rk) => { const m = /^(bronze|silver|gold|platinum|diamond|champion|grand champion) (i{1,3})$|^supersonic legend$/i.exec(rk.tier); return m ? `rl/${(m[1] ?? 'supersonic-legend').toLowerCase().replace(' ', '-')}${m[2] ? `-${m[2].length}` : ''}.webp` : rk.icon; };
const TIER = [[/grand/i, '#ff6b6b'], [/supersonic/i, '#f3f0ff'], [/champion/i, '#c7a8ff'], [/diamond/i, '#5aa8ff'], [/platinum/i, '#7fe0ff'], [/gold/i, '#f5c542'], [/silver/i, '#c9d3e0'], [/bronze/i, '#d08a4f']];
let open = false; let tab = null; let last = null;

function draw(d) {
  last = d;
  document.body.dataset.style = d.style ?? 'card'; window.ovInit?.(d.zoom);
  const s = d.sum; const g = d.games[0]; const cat = tab ?? (g ? catOf(g) : 'ranked');
  $('card').style.setProperty('--c', s.net > 0 ? '#39ff8a' : s.net < 0 ? '#ff5a4f' : '#5aa8ff');
  $('live').className = `dot ${d.live ? 'on' : ''}`;
  $('streak').className = s.streak > 0 ? 'up' : 'ice';
  $('streak').innerHTML = s.streak ? `<i class="${s.streak > 0 ? 'flame' : ''}">${s.streak > 0 ? '🔥' : '🧊'}</i> ${Math.abs(s.streak)}` : '';
  const ranked = d.profile?.ranked ?? {}; const rk = ranked[g?.mode] ?? ranked['3v3'] ?? Object.values(ranked)[0];
  $('rkimg').hidden = !rk?.tier;
  if (rk?.tier) $('rkimg').src = rankIcon(rk);
  $('tier').style.color = TIER.find(([re]) => re.test(rk?.tier ?? ''))?.[1] ?? '';
  $('tier').textContent = rk?.tier ? `${rk.tier}${rk.division ? ` · ${rk.division.replace(/Division\s*/i, '')}` : ''}` : d.player ? 'Lecture du profil…' : 'Joue une partie';
  $('mmr').innerHTML = rk?.mmr != null ? `${Math.round(rk.mmr).toLocaleString('fr-FR')}${g?.ranked && g.mmr != null ? ` <small class="${g.mmr >= 0 ? 'up' : 'dn'}">${signed(g.mmr)}</small>` : ''}` : '';
  $('res').innerHTML = g
    ? `<span class="pill ${g.win ? 'win' : 'loss'}"><span class="long">${g.win ? 'Victoire' : 'Défaite'} ${g.us} - ${g.them}</span><span class="short">${g.win ? 'V' : 'D'}</span></span><small>${esc(g.mode)}${CAT[catOf(g)] ? ` · ${CAT[catOf(g)]}` : ''} · ${ago(g.at)}</small>`
    : `<small>${d.statsOff ? 'Stats du jeu coupées : Ctrl+Alt+I pour les activer' : 'Aucun match pour l’instant'}</small>`;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.cat === cat);
  $('modes').innerHTML = (cat === 'ranked' ? ['1v1', '2v2', '3v3'] : ['1v1', '2v2', '3v3', '4v4']).map((m) => {
    const [w, l] = s.modes[cat][m] ?? [0, 0];
    return `<span class="${w + l ? '' : 'zero'}"><i>${m}</i><b class="up">${w}</b>-<b class="dn">${l}</b></span>`;
  }).join('');
  const games = d.games.filter((x) => cat === 'all' || catOf(x) === cat);
  // Barre : mode en cours (Ranked / Occa, 2s…), rang + MMR classé ou MMR occa, bilan du jour de ce mode
  const now = d.current ?? (g ? { mode: g.mode, cat: g.ranked === true ? 'ranked' : g.ranked === false ? 'casual' : null } : null);
  if (now) {
    const occa = now.cat === 'casual'; const bk = occa ? d.profile?.casual?.[now.mode] : ranked[now.mode];
    // Gain de la dernière partie de ce mode et de ce type (reste affiché en jeu et au menu)
    const same = d.games.find((x) => x.mode === now.mode && (!now.cat || catOf(x) === now.cat));
    const delta = same?.mmr != null ? ` <small class="${same.mmr >= 0 ? 'up' : 'dn'}">${signed(same.mmr)}</small>` : '';
    $('barinfo').innerHTML = `${now.cat ? `<b class="chip ${occa ? 'occa' : 'rk'}">${occa ? 'Occa' : 'Ranked'}</b>` : ''}<b class="chip">${esc(now.mode.replace(/v\d/, 's'))}</b>${!occa && bk?.tier ? `<img src="${esc(rankIcon(bk))}" alt="">` : ''}${bk?.mmr != null ? `<b class="bmmr">${Math.round(bk.mmr).toLocaleString('fr-FR')}${delta}</b>` : ''}${d.current ? '<b class="chip live">En jeu</b>' : ''}`;
    const [w, l] = s.modes[now.cat ?? 'all'][now.mode] ?? [0, 0];
    $('rec').innerHTML = `<b class="up">${w}W</b> - <b class="dn">${l}L</b>`;
  } else { $('barinfo').innerHTML = ''; $('rec').innerHTML = ''; }
  $('list').innerHTML = games.length ? games.map((x) => `<div class="g ${x.win ? 'win' : 'loss'}"><i>${x.win ? 'V' : 'D'}</i><span>${x.us} - ${x.them}</span><small>${esc(x.mode)}</small>${x.mmr != null ? `<em class="${x.mmr >= 0 ? 'up' : 'dn'}">${signed(x.mmr)}</em>` : '<em></em>'}<time>${ago(x.at)}</time></div>`).join('') : '<small>Pas encore de parties</small>';
}
window.launcher?.onRl(draw);
$('tabs').addEventListener('click', (e) => { if (e.target.dataset.cat && last) { tab = e.target.dataset.cat; draw(last); } });
$('more').addEventListener('click', () => {
  open = !open;
  document.body.classList.toggle('open', open);
  $('list').hidden = !open;
});
$('sty').addEventListener('click', () => {
  const next = document.body.dataset.style === 'bar' ? 'card' : 'bar';
  document.body.dataset.style = next; window.launcher?.ovStyle(next);
});
setInterval(() => last && draw(last), 60_000); // « 12 min » à jour
