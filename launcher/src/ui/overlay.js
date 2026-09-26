// Écran d'infos en jeu : reçoit les données du launcher toutes les 2 secondes (aucun clic : il laisse passer la souris).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const gauge = (label, value, pct, hot = false) => `<div class="g ${hot ? 'hot' : ''}"><small>${label}</small><b>${value}</b>${pct != null ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>` : ''}</div>`;

function tick() { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
setInterval(tick, 5000);
tick();

window.launcher?.onOverlay((d) => {
  const s = d.session;
  $('game').innerHTML = s ? `<small>En jeu${d.boost ? ' · <span class="boost">Boost actif</span>' : ''}</small><b>${esc(s.name)}</b>${s.start ? `<small>Session : ${dur(Date.now() - s.start)}</small>` : ''}` : '<small>Aucun jeu détecté</small>';
  const pc = d.pc;
  if (pc) {
    const ram = pc.ram ? Math.round((100 * pc.ram.used) / pc.ram.total) : null;
    $('pc').innerHTML = [
      gauge('Processeur', pc.cpu?.usage != null ? `${pc.cpu.usage} %${pc.cpu.temp ? ` · ${pc.cpu.temp} °C` : ''}` : '…', pc.cpu?.usage, (pc.cpu?.temp ?? 0) >= 90),
      gauge('Mémoire', ram != null ? `${ram} %` : '…', ram),
      gauge('Carte graphique', pc.gpu?.usage != null ? `${pc.gpu.usage} %` : 'n/d', pc.gpu?.usage),
      gauge('Temp. graphique', pc.gpu?.temp != null ? `${pc.gpu.temp} °C` : 'n/d', null, (pc.gpu?.temp ?? 0) >= 85),
    ].join('');
  }
  $('music').innerHTML = d.music ? `<small>♪ Musique</small><b>${esc(d.music.title)}</b><small>${esc(d.music.artist ?? '')}</small>` : '';
  const f = d.friends;
  $('friends').innerHTML = f && (f.online || f.playing.length) ? `<small>${f.online} ami(s) en ligne</small>${f.playing.map((p) => `<b>${esc(p.name)} · ${esc(p.game)}</b>`).join('')}` : '';
});
