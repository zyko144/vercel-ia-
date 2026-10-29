// Écran d'infos en jeu (Ctrl+Alt+O) : vrais FPS du jeu en couleur, processeur, carte graphique, Spotify en un clic.
// Se glisse où on veut ; le bouton ⇄ change la forme (carte, barre, mini).
const $ = (id) => document.getElementById(id);
const dur = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const gauge = (label, value, hot = false) => `<div class="g ${hot ? 'hot' : ''}"><small>${label}</small><b>${value}</b></div>`;
const TONE = { good: 'bien', down: 'en baisse', bad: 'trop bas' };
// Pourquoi les FPS manquent (même textes que la mini-barre)
const FPS_WHY = { off: 'FPS : active la mesure (⚡ Optimiser)', droits: 'FPS : reconnecte-toi à Windows', nogame: 'FPS : jeu non repéré', wait: 'FPS : mesure en cours…' };

function tick() { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
setInterval(tick, 5000);
tick();

window.launcher?.onOverlay((d) => {
  document.body.dataset.style = d.style ?? 'card'; window.ovInit?.(d.zoom);
  const s = d.session;
  $('game').textContent = s ? `${s.name}${s.start ? ` · ${dur(Date.now() - s.start)}` : ''}` : 'Aucun jeu détecté';
  const f = d.fps;
  $('fps').className = `fps ${f?.tone ?? ''}`;
  $('fps').innerHTML = f ? `<b>${f.now}</b><span>FPS<small>${TONE[f.tone] ?? ''}${f.low1 ? ` · 1 % low ${f.low1}` : ''}</small></span>` : `<span><small>${s ? FPS_WHY[d.fpsWhy] ?? FPS_WHY.wait : ''}</small></span>`;
  const pc = d.pc;
  if (pc) {
    $('pc').innerHTML = [
      gauge('CPU', pc.cpu?.usage != null ? `${pc.cpu.usage} %${pc.cpu.temp ? ` · ${pc.cpu.temp}°` : ''}` : '…', (pc.cpu?.temp ?? 0) >= 90),
      gauge('GPU', pc.gpu?.usage != null ? `${pc.gpu.usage} %${pc.gpu.temp != null ? ` · ${pc.gpu.temp}°` : ''}` : 'n/d', (pc.gpu?.temp ?? 0) >= 85),
    ].join('');
  }
  $('music').textContent = d.music ? `${d.music.title}${d.music.artist ? ` · ${d.music.artist}` : ''}` : '';
});
$('sp').addEventListener('click', () => window.launcher?.openSpotify());
const STYLES = ['card', 'bar', 'mini'];
$('sty').addEventListener('click', () => {
  const next = STYLES[(STYLES.indexOf(document.body.dataset.style ?? 'card') + 1) % STYLES.length];
  document.body.dataset.style = next; window.launcher?.ovStyle(next);
});
// Anneau Spotify : bat au niveau sonore de Spotify seulement (rien quand il n'y a pas de son)
let beat = 0;
window.launcher?.onBeat((v) => { beat = Math.max(Number(v) || 0, beat * 0.75); $('sp').style.setProperty('--lvl', beat < 0.02 ? 0 : Math.min(1, beat * 1.4).toFixed(2)); });
