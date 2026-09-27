// Widget du bureau : températures, charge, FPS en jeu et amis en ligne (mis à jour toutes les 5 s par le launcher)
const $ = (id) => document.getElementById(id);
const pct = (v) => (v == null ? '–' : `${v} %`);
window.widget?.onData((d) => {
  $('cpu').textContent = pct(d.cpu); $('gpu').textContent = pct(d.gpu); $('ram').textContent = pct(d.ram);
  $('cpuT').textContent = d.cpuT != null ? `${d.cpuT} °C` : ' '; $('cpuT').classList.toggle('hot', d.cpuT >= 90);
  $('gpuT').textContent = d.gpuT != null ? `${d.gpuT} °C` : ' '; $('gpuT').classList.toggle('hot', d.gpuT >= 85);
  $('fps').textContent = d.fps ?? '–'; $('fpsHint').textContent = d.game ? 'en direct' : 'en jeu';
  $('game').textContent = d.hot ? '🔥 Surchauffe : vérifie la ventilation' : d.game ? `▶ ${d.game}` : '';
  $('game').classList.toggle('hot', Boolean(d.hot));
  const f = d.streamer ? null : d.playing?.[0];
  $('friends').innerHTML = '';
  const dot = document.createElement('i');
  $('friends').append(dot, document.createTextNode(f ? `${f.name} joue à ${f.game}${d.online > 1 ? ` · ${d.online} en ligne` : ''}` : `${d.online ?? 0} ami${d.online > 1 ? 's' : ''} en ligne`));
});
$('x').addEventListener('click', () => window.widget?.close());
$('friends').addEventListener('click', () => window.widget?.open());
