// Écran d'infos en jeu (Ctrl+Alt+O), compact : vrais FPS du jeu en couleur, processeur, carte graphique, musique.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const gauge = (label, value, hot = false) => `<div class="g ${hot ? 'hot' : ''}"><small>${label}</small><b>${value}</b></div>`;
const TONE = { good: 'bien', down: 'en baisse', bad: 'trop bas' };

function tick() { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
setInterval(tick, 5000);
tick();

window.launcher?.onOverlay((d) => {
  const s = d.session;
  $('game').textContent = s ? `${s.name}${s.start ? ` · ${dur(Date.now() - s.start)}` : ''}` : 'Aucun jeu détecté';
  const f = d.fps;
  $('fps').className = `fps ${f?.tone ?? ''}`;
  $('fps').innerHTML = f ? `<b>${f.now}</b><span>FPS<small>${TONE[f.tone] ?? ''}${f.low1 ? ` · 1 % low ${f.low1}` : ''}</small></span>` : `<span><small>${s ? 'FPS : active la mesure (⚡ Optimiser)' : ''}</small></span>`;
  const pc = d.pc;
  if (pc) {
    $('pc').innerHTML = [
      gauge('CPU', pc.cpu?.usage != null ? `${pc.cpu.usage} %${pc.cpu.temp ? ` · ${pc.cpu.temp}°` : ''}` : '…', (pc.cpu?.temp ?? 0) >= 90),
      gauge('GPU', pc.gpu?.usage != null ? `${pc.gpu.usage} %${pc.gpu.temp != null ? ` · ${pc.gpu.temp}°` : ''}` : 'n/d', (pc.gpu?.temp ?? 0) >= 85),
    ].join('');
  }
  $('music').innerHTML = d.music ? `<small>♪ ${esc(d.music.title)}${d.music.artist ? ` · ${esc(d.music.artist)}` : ''}</small>` : '';
});
