// Interface de History Clips : galerie par jeu, lecteur avec découpe, partage Discord, réglages.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`).replace('.', ',');
const when = (t) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const sec = (s) => `${Number(s).toFixed(1).replace('.', ',')} s`;
// Aperçu dans un navigateur (sans l'appli) : quelques clips d'exemple
const api = window.api ?? {
  list: async () => [['Rocket League', 3], ['FiveM', 2], ['Fortnite', 1]].flatMap(([g, n], i) => Array.from({ length: n }, (_, k) => ({ token: `${i}${k}`, game: g, name: `${g} ${k + 1}`, at: Date.now() - (i * 3 + k) * 3_600_000, size: 42e6, image: false, fav: k === 0, url: '' }))),
  settings: async () => ({ replay: true, rec: 'on', seconds: 30, height: 1080, fps: 60, audio: true, hotClip: 'F8', hotShot: 'F9', autostart: true, dir: 'C:\\Users\\toi\\Videos\\History Clips', version: 'démo' }),
  account: async () => ({ logged: false }), onChanged: () => {}, setSettings: async () => ({ ok: true }), saveNow: async () => {},
};
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); };
const keyText = (a) => String(a ?? '').replace('CommandOrControl', 'Ctrl').replace('Shift', 'Maj').replace('PrintScreen', 'Impr. écran').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('');

const hue = (g) => [...g].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 40);
const gdot = (g) => `<span class="gdot" style="background:hsl(${hue(g)} 85% 62%)">${esc(g.slice(0, 1).toUpperCase())}</span>`;
const card = (c) => `<button class="card glass" data-t="${esc(c.token)}"><div class="thumb">${c.image ? `<img src="${esc(c.url)}" alt="" loading="lazy">` : c.url ? `<video src="${esc(c.url)}#t=0.5" preload="metadata" muted></video>` : ''}<span class="tag">${esc(c.game)}</span>${c.fav ? '<span class="star">⭐</span>' : ''}</div>
    <div class="info"><b>${esc(c.name)}</b><small>${when(c.at)} · ${size(c.size)}</small></div></button>`;
const emptyMsg = () => `<div class="empty"><b>Aucun clip ici pour l’instant</b>En jeu, appuie sur ${keyText(settings.hotClip ?? 'F8')} pour garder les ${settings.seconds ?? 30} dernières secondes.</div>`;

let clips = []; let filter = 'home'; let cur = null; let settings = {};

// ---------- Galerie ----------
async function load() {
  clips = await api.list().catch(() => []);
  const games = [...new Set(clips.map((c) => c.game))].sort((a, b) => a.localeCompare(b));
  $('games').innerHTML = games.map((g) => `<button data-f="g:${esc(g)}" class="${filter === `g:${g}` ? 'on' : ''}">${gdot(g)}${esc(g)}<em>${clips.filter((c) => c.game === g).length}</em></button>`).join('');
  $('nTout').textContent = clips.filter((c) => !c.image).length || '';
  $('nFavs').textContent = clips.filter((c) => c.fav).length || '';
  $('nCaps').textContent = clips.filter((c) => c.image).length || '';
  render();
}
function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = clips.filter((c) => (filter === 'home' || (filter === 'tout' ? !c.image : filter === 'favs' ? c.fav : filter === 'captures' ? c.image : c.game === filter.slice(2))))
    .filter((c) => !q || `${c.name} ${c.game}`.toLowerCase().includes(q));
  $('title').textContent = filter === 'home' ? 'Accueil' : filter === 'tout' ? 'Mes clips' : filter === 'favs' ? 'Favoris' : filter === 'captures' ? 'Captures' : filter.slice(2);
  const home = filter === 'home' && !q;
  $('home').hidden = !home; $('grid').hidden = home;
  if (home) return renderHome();
  $('grid').innerHTML = list.map(card).join('') || emptyMsg();
}
$('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) select(b.dataset.f); });
$('games').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) select(b.dataset.f); });
function renderHome() {
  const vids = clips.filter((c) => !c.image); const on = settings.rec === 'on';
  const games = [...new Set(clips.map((c) => c.game))];
  const err = String(settings.rec ?? '').startsWith('error') ? settings.rec.slice(6) : '';
  $('home').innerHTML = `<section class="hero glass"><div class="recdot ${on ? 'on' : ''}"><i></i></div>
    <div><h2>${on ? 'Replay actif' : settings.replay ? 'Replay en démarrage…' : 'Replay en pause'}</h2><p>En jeu, appuie sur ${keyText(settings.hotClip)} pour garder les ${settings.seconds} dernières secondes · ${keyText(settings.hotShot)} pour une capture.<br>${settings.height}p · ${settings.fps} i/s${settings.audio ? ' · son du PC' : ' · sans son'}</p>${err ? `<p class="err">⚠ L’enregistrement n’a pas démarré : ${esc(err)}</p>` : ''}</div>
    <div class="heroact"><button type="button" class="btn" data-act="toggle">${settings.replay ? '⏸ Pause' : '▶ Activer'}</button><button type="button" class="btn" data-act="set">⚙ Réglages</button></div></section>
  <div class="stats"><div class="glass"><b>${vids.length}</b><small>clips</small></div><div class="glass"><b>${clips.length - vids.length}</b><small>captures</small></div><div class="glass"><b>${games.length}</b><small>jeux</small></div><div class="glass"><b>${size(clips.reduce((t, c) => t + c.size, 0))}</b><small>sur le disque</small></div></div>
  <h3 class="sect">Derniers clips ${vids.length > 6 ? '<button type="button" data-go="tout">Tout voir →</button>' : ''}</h3><div class="grid">${vids.slice(0, 6).map(card).join('') || emptyMsg()}</div>
  ${games.length ? `<h3 class="sect">Par jeu</h3><div class="games">${games.map((g) => `<button type="button" class="gcard glass" data-go="g:${esc(g)}">${gdot(g)}<span><b>${esc(g)}</b><small>${clips.filter((c) => c.game === g).length} fichiers</small></span></button>`).join('')}</div>` : ''}`;
}
$('home').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) return select(go.dataset.go);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') setP({ replay: !settings.replay }, settings.replay ? '⏸ Replay en pause' : '🔴 Replay actif').then(render);
  if (act === 'set') openSettings();
});
$('saveNow').addEventListener('click', () => { api.saveNow(); toast('🎬 Clip en cours d’enregistrement…'); });
$('profile').addEventListener('click', () => openSettings().then(() => $('acctSec').scrollIntoView()));
function select(f) { filter = f; document.querySelectorAll('.side nav button').forEach((b) => b.classList.toggle('on', b.dataset.f === f)); render(); }
$('search').addEventListener('input', render);
// Survol : aperçu muet
$('view').addEventListener('mouseover', (e) => { const v = e.target.closest('.card')?.querySelector('video'); if (v) v.play().catch(() => {}); });
$('view').addEventListener('mouseout', (e) => { const v = e.target.closest('.card')?.querySelector('video'); if (v && !e.relatedTarget?.closest?.('.card')?.contains(v)) { v.pause(); v.currentTime = 0.5; } });
$('view').addEventListener('click', (e) => { const c = e.target.closest('[data-t]'); if (c) openViewer(clips.find((x) => x.token === c.dataset.t)); });
api.onChanged(async () => { settings = await api.settings(); paintPill(); load(); });

// ---------- Lecteur + découpe ----------
function openViewer(c) {
  if (!c) return;
  cur = c;
  $('vTitle').textContent = `${c.name} · ${c.game}`;
  $('vImg').hidden = !c.image; $('vVideo').hidden = c.image; $('trim').hidden = c.image; $('vExport').hidden = c.image;
  if (c.image) $('vImg').src = c.url; else { $('vVideo').src = c.url; $('vVideo').play().catch(() => {}); }
  $('vFav').textContent = c.fav ? '⭐ Retirer des favoris' : '⭐ Favori';
  $('viewer').showModal();
}
$('vVideo').addEventListener('loadedmetadata', () => {
  const d = Number.isFinite($('vVideo').duration) ? $('vVideo').duration : 0;
  for (const id of ['tStart', 'tEnd']) $(id).max = String(d);
  $('tStart').value = '0'; $('tEnd').value = String(d); $('oStart').textContent = sec(0); $('oEnd').textContent = sec(d);
});
for (const id of ['tStart', 'tEnd']) $(id).addEventListener('input', () => {
  let a = Number($('tStart').value); let b = Number($('tEnd').value);
  if (a > b - 0.5) { if (id === 'tStart') a = Math.max(0, b - 0.5); else b = a + 0.5; $('tStart').value = a; $('tEnd').value = b; }
  $('oStart').textContent = sec(a); $('oEnd').textContent = sec(b);
  $('vVideo').currentTime = id === 'tStart' ? a : b;
});
$('vVideo').addEventListener('timeupdate', () => { const b = Number($('tEnd').value); if (b > 0 && $('vVideo').currentTime > b + 0.1 && !$('vVideo').paused) { $('vVideo').currentTime = Number($('tStart').value); } });
$('vVideo').addEventListener('dblclick', () => $('vVideo').requestFullscreen?.().catch(() => {}));
$('doTrim').addEventListener('click', async () => {
  toast('✂ Découpe en cours…');
  const r = await api.trim(cur.token, Number($('tStart').value), Number($('tEnd').value)).catch(() => null);
  toast(r?.ok ? '✂ Passage gardé (nouveau clip « coupé », l’original reste)' : r?.error ?? 'Découpe impossible'); if (r?.ok) load();
});
$('vFav').addEventListener('click', async () => { cur.fav = await api.fav(cur.token); $('vFav').textContent = cur.fav ? '⭐ Retirer des favoris' : '⭐ Favori'; load(); });
$('vRename').addEventListener('click', () => ask('✏ Renommer le clip', `<input type="text" id="mName" maxlength="80" value="${esc(cur.name)}">`, async () => { await api.rename(cur.token, $('mName').value); $('vTitle').textContent = `${$('mName').value} · ${cur.game}`; load(); }));
$('vFolder').addEventListener('click', () => api.open(cur.token, 'folder'));
$('vExport').addEventListener('click', async () => { toast('⬇ Export en MP4…'); const r = await api.exportMp4(cur.token); if (!r?.cancelled) toast(r?.ok ? '⬇ Exporté en MP4' : r?.error ?? 'Export impossible'); });
$('vDelete').addEventListener('click', async () => { if (await api.remove(cur.token)) { $('viewer').close(); toast('🗑 Clip supprimé'); load(); } });
$('viewer').addEventListener('close', () => { $('vVideo').pause(); $('vVideo').removeAttribute('src'); $('vVideo').load(); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });

// ---------- Discord ----------
$('vDiscord').addEventListener('click', async () => {
  const acc = await api.account();
  if (!acc.logged) { toast('Connecte ton compte History pour envoyer sur Discord'); return openSettings(); }
  const amis = await api.friends().catch(() => []);
  ask('📤 Envoyer sur Discord', `<div class="pick"><button type="button" class="btn play" data-to="">📢 Salon des clips du serveur History</button>${amis.map((a) => `<button type="button" class="btn ghost" data-to="${esc(a.id)}">💬 En privé à ${esc(a.pseudo)}</button>`).join('')}</div><p class="fine">En privé, ton ami doit avoir lié son Discord. La qualité est optimisée pour la limite de 10 Mo de Discord.</p>`, null, async (to) => {
    toast('📤 Envoi du clip…');
    const r = await api.discord(cur.token, to);
    toast(r?.ok ? '✅ Clip envoyé sur Discord' : r?.error ?? 'Envoi impossible');
  });
});

// Petite fenêtre : ok() pour « Valider », pick(valeur) pour les boutons data-to
function ask(title, html, ok, pick) {
  $('modalBox').innerHTML = `<div class="vhead"><h2>${title}</h2><button type="button" class="x" data-close>✕</button></div>${html}${ok ? '<div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn play" id="mOk">Valider</button></div>' : ''}`;
  $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    if (e.target.id === 'mOk') { $('modal').close(); await ok?.(); }
    const b = e.target.closest('[data-to]'); if (b) { $('modal').close(); await pick?.(b.dataset.to); }
  };
}

// ---------- Réglages ----------
async function openSettings() {
  settings = await api.settings();
  $('sReplay').checked = settings.replay; $('sSeconds').value = String(settings.seconds); $('sHeight').value = String(settings.height); $('sFps').value = String(settings.fps);
  $('sAudio').checked = settings.audio; $('sAuto').checked = settings.autostart; $('sDir').textContent = settings.dir; $('sVer').textContent = `History Clips ${settings.version}`;
  document.querySelectorAll('[data-hk]').forEach((b) => { b.innerHTML = keyText(settings[b.dataset.hk]); });
  paintAccount();
  $('settings').showModal();
}
$('openSet').addEventListener('click', openSettings);
const setP = async (p, msg) => { const r = await api.setSettings(p); if (r?.ok === false) toast(r.error); else if (msg) toast(msg); settings = await api.settings(); paintPill(); return r; };
$('sReplay').addEventListener('change', (e) => setP({ replay: e.target.checked }, e.target.checked ? '🔴 Replay actif' : '⏸ Replay en pause'));
for (const [id, k] of [['sSeconds', 'seconds'], ['sHeight', 'height'], ['sFps', 'fps']]) $(id).addEventListener('change', (e) => setP({ [k]: Number(e.target.value) }, '🎬 Réglage enregistré'));
$('sAudio').addEventListener('change', (e) => setP({ audio: e.target.checked }));
$('sAuto').addEventListener('change', (e) => setP({ autostart: e.target.checked }));
$('sPick').addEventListener('click', async () => { const d = await api.pickFolder(); if (d) { $('sDir').textContent = d; load(); } });
document.querySelectorAll('[data-hk]').forEach((b) => b.addEventListener('click', () => {
  b.textContent = 'Appuie sur ta touche…';
  const onKey = async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;
    document.removeEventListener('keydown', onKey, true);
    if (ev.key === 'Escape') { b.innerHTML = keyText(settings[b.dataset.hk]); return; }
    const NAMED = { ' ': 'Space', Tab: 'Tab', PrintScreen: 'PrintScreen', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', '+': 'Plus' };
    const pad = /^Numpad(\d)$/.exec(ev.code)?.[1] ?? { NumpadAdd: 'add', NumpadSubtract: 'sub', NumpadMultiply: 'mult', NumpadDivide: 'div', NumpadDecimal: 'dec' }[ev.code];
    const key = pad != null ? `num${pad}` : NAMED[ev.key] ?? (ev.key.startsWith('Arrow') ? ev.key.slice(5) : /^F\d{1,2}$/.test(ev.key) ? ev.key : ev.key.length === 1 ? ev.key.toUpperCase() : null);
    if (!key) { toast('Touche non prise en charge'); b.innerHTML = keyText(settings[b.dataset.hk]); return; }
    const accel = [ev.ctrlKey && 'CommandOrControl', ev.altKey && 'Alt', ev.shiftKey && 'Shift', key].filter(Boolean).join('+');
    const r = await setP({ [b.dataset.hk]: accel }, '⌨ Raccourci enregistré');
    b.innerHTML = keyText(r?.ok === false ? settings[b.dataset.hk] : accel);
  };
  document.addEventListener('keydown', onKey, true);
}));
async function paintAccount() {
  const a = await api.account();
  $('pName').textContent = a.logged ? a.pseudo ?? 'Connecté' : 'Non connecté'; $('pSub').textContent = a.logged ? 'Compte History' : 'Se connecter';
  $('avatar').textContent = a.logged ? (a.pseudo ?? 'H').slice(0, 1).toUpperCase() : '?';
  $('acct').innerHTML = a.logged ? `<div class="row"><span>Connecté${a.pseudo ? ` : <b>${esc(a.pseudo)}</b>` : ''}</span><button type="button" class="btn ghost sm" id="aOut">Se déconnecter</button></div>`
    : '<p class="fine">Le même compte que History Launcher.</p><input type="email" id="aMail" placeholder="E-mail"><input type="password" id="aPass" placeholder="Mot de passe"><div class="row" style="justify-content:flex-end"><button type="button" class="btn play" id="aIn">Se connecter</button></div>';
}
$('acct').addEventListener('click', async (e) => {
  if (e.target.id === 'aOut') { await api.logout(); return paintAccount(); }
  if (e.target.id !== 'aIn') return;
  const done = (r) => { toast(r.ok ? `👤 Connecté${r.pseudo ? ` : ${r.pseudo}` : ''}` : r.error ?? 'Connexion impossible'); paintAccount(); };
  const r = await api.login($('aMail').value.trim(), $('aPass').value);
  if (!r.need2fa) return done(r);
  // Double authentification : code de l'application
  ask('🔐 Double authentification', '<p class="fine">Entre le code à 6 chiffres de ton application.</p><input type="text" id="m2fa" inputmode="numeric" maxlength="8" autocomplete="one-time-code">', async () => done(await api.login('', '', $('m2fa').value.trim(), r.ticket)));
});

function paintPill() {
  $('replayPill').classList.toggle('on', settings.rec === 'on');
  $('replayPill').querySelector('span').innerHTML = settings.rec === 'on' ? `REC · ${keyText(settings.hotClip)}` : settings.replay ? 'Replay…' : 'Replay en pause';
}
(async () => { settings = await api.settings(); paintPill(); paintAccount(); load(); })();
