// Mini-barre : « 144 FPS ↑ +9 % » avec une vraie flèche colorée (vert = mieux que tes parties d'avant, rouge = moins bien).
// Sans FPS, elle dit pourquoi (mesure pas activée, reconnexion à Windows, jeu pas repéré).
const txt = document.getElementById('txt');
const ARROW = { up: '<svg viewBox="0 0 12 14"><path d="M6 1 11 7H7.6v6H4.4V7H1Z"/></svg>', down: '<svg viewBox="0 0 12 14"><path d="M6 13 1 7h3.4V1h3.2v6H11Z"/></svg>' };
const WHY = { off: 'FPS : active la mesure (⚡)', droits: 'FPS : reconnecte-toi à Windows', nogame: 'FPS : jeu non repéré', wait: 'FPS…' };
window.perfbar.onData((d) => {
  const dir = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : null;
  if (d.fps) txt.innerHTML = `<b>${d.fps}</b> FPS${dir ? ` <span class="arr ${dir}">${ARROW[dir]}${d.delta > 0 ? '+' : ''}${d.delta} %</span>` : ''}`;
  else txt.textContent = WHY[d.state] ?? (d.gpu != null ? `GPU ${d.gpu} %` : '…');
});
