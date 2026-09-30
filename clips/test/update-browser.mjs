const doc = new DOMParser().parseFromString(await (await fetch('../src/ui/index.html')).text(), 'text/html');
doc.querySelectorAll('script').forEach(e => e.remove());
document.body.replaceChildren(...doc.body.childNodes);
document.querySelectorAll('img[src="icon.png"]').forEach(e => e.src = '../src/ui/icon.png');
const $ = id => document.getElementById(id), results = [];
const assert = (ok, text) => { if (!ok) throw Error(text); results.push('✓ ' + text); };
let update, now = 0;
window.hc = { onUpdate: fn => update = fn, settings: async () => ({}), account: async () => ({ skipped: true }), list: async () => [], art: async () => ({}), updGet: async () => ({ state: 'idle' }), updNow: async () => now++ };
try {
  await import('../src/ui/app.js');
  await new Promise(r => setTimeout(r, 0));
  update({ state: 'available', version: '0.8.3' });
  assert($('updDlg').open, 'Nouvelle version proposée');
  $('updYes').click(); assert(now === 1 && !$('updDlg').open, 'Demande envoyée une fois');
  update({ state: 'progress', now: true, version: '0.8.3', percent: 37 });
  assert(!$('updScreen').hidden && $('updText').textContent.includes('37'), 'Progression visible');
  assert($('updCheck').disabled, 'Pas de nouvelle vérification pendant le téléchargement');
  update({ state: 'preparing', now: true, version: '0.8.3', percent: 100 });
  assert($('updText').textContent.includes('exports'), 'Attente des exports expliquée');
  update({ state: 'error', version: '0.8.3', error: 'Connexion interrompue' });
  assert($('updScreen').hidden && !$('updPill').hidden && !$('updCheck').disabled, 'Erreur : écran débloqué et nouvelle tentative visible');
  $('updPill').click(); assert(now === 2, 'Réessayer relance la demande');
  update({ state: 'ready', version: '0.8.3', percent: 100 });
  assert($('updPill').textContent.includes('Redémarrer'), 'Installation prête accessible');
  document.body.insertAdjacentHTML('beforeend', '<pre id="testResult" style="position:fixed;top:70px;right:20px;z-index:99999;background:#151515;color:white;padding:20px"></pre>');
  $('testResult').textContent = `PASS — ${results.length} checks\n` + results.join('\n');
} catch (e) { document.body.textContent = 'FAIL: ' + e.stack + '\n' + results.join('\n'); }
