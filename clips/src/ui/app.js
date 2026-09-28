// Interface de History Clips : accueil, galerie, jeux (avec leurs images), lecteur + découpe, Discord, compte, réglages.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`).replace('.', ',');
const when = (t) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const sec = (s) => `${Number(s).toFixed(1).replace('.', ',')} s`;
const STEAM = (id, f) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/${f}`;
// Aperçu dans un navigateur (sans l'appli) : quelques clips d'exemple
const DEMO = {
  list: async () => [['Rocket League', 3], ['FiveM', 2], ['Fortnite', 1]].flatMap(([g, n], i) => Array.from({ length: n }, (_, k) => ({ token: `${i}${k}`, game: g, name: `${g} ${k + 1}`, at: Date.now() - (i * 3 + k) * 3_600_000, size: 42e6, image: false, fav: k === 0, url: '' }))),
  art: async () => ({ 'Rocket League': { img: STEAM(252950, 'header.jpg'), logo: STEAM(252950, 'logo.png'), hero: STEAM(252950, 'library_hero.jpg') }, FiveM: { img: STEAM(271590, 'header.jpg'), logo: STEAM(271590, 'logo.png'), hero: STEAM(271590, 'library_hero.jpg') }, Fortnite: {} }),
  settings: async () => ({ replay: true, rec: 'on', inGame: 'Rocket League', seconds: 30, height: 1080, fps: 60, audio: true, sound: true, source: 'screen', onlyGame: true, gamePriority: true, maxGB: 0, theme: 'jaune', hotClip: 'F8', hotShot: 'F9', autostart: true, dir: 'C:\\Users\\toi\\Videos\\History Clips', version: 'démo' }),
  account: async () => ({ compte: { pseudo: 'Noam' } }), setSettings: async () => ({ ok: true }), updGet: async () => ({ state: 'idle' }),
};
const api = new Proxy(window.hc ?? DEMO, { get: (t, k) => t[k] ?? (typeof k === 'string' && k.startsWith('on') ? () => {} : async () => null) });
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); };
const keyText = (a) => String(a ?? '').replace('CommandOrControl', 'Ctrl').replace('Shift', 'Maj').replace('PrintScreen', 'Impr. écran').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('');
const hue = (g) => [...g].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 40);

let clips = []; let settings = {}; let art = {}; let view = 'home'; let game = null; let sortBy = 'new'; let cur = null; let compte = null;

// ---------- Icône et image d'un jeu ----------
function gico(g) {
  const a = art[g] ?? {};
  if (a.icon) return `<img class="gico" src="${esc(a.icon)}" alt="">`;
  // Image par-dessus la lettre : si elle ne charge pas, la lettre colorée reste
  return `<span class="gico" style="background:${a.img ? `url('${esc(a.img)}') center / cover, ` : ''}hsl(${hue(g)} 80% 60%)">${a.img ? '' : esc(g.slice(0, 1).toUpperCase())}</span>`;
}
const gbg = (g) => `background:${art[g]?.img ? `url('${esc(art[g].img)}') center / cover, ` : ''}linear-gradient(135deg,hsl(${hue(g)} 70% 45%),#120e0a)`;
function card(c) {
  const poster = !c.url && art[c.game]?.img ? ` style="background-image:url('${esc(art[c.game].img)}')"` : '';
  return `<button class="card glass" data-t="${esc(c.token)}"><div class="thumb"${poster}>${c.image ? `<img src="${esc(c.url)}" alt="" loading="lazy">` : c.url ? `<video src="${esc(c.url)}#t=0.5" preload="metadata" muted></video>` : ''}<span class="tag">${gico(c.game)}${esc(c.game)}</span>${c.fav ? '<span class="star">⭐</span>' : ''}${c.image ? '<span class="dur">📸</span>' : ''}</div>
    <div class="info"><b>${esc(c.name)}</b><small>${when(c.at)} · ${size(c.size)}</small></div></button>`;
}
const emptyMsg = (t = 'Aucun clip ici pour l’instant') => `<div class="empty"><b>${t}</b>En jeu, appuie sur ${keyText(settings.hotClip ?? 'F8')} pour garder les ${settings.seconds ?? 30} dernières secondes.</div>`;
const games = () => [...new Set(clips.map((c) => c.game))].sort((a, b) => clips.filter((c) => c.game === b).length - clips.filter((c) => c.game === a).length);

// ---------- Chargement ----------
async function load() {
  clips = await api.list().catch(() => []) ?? [];
  const gs = games();
  const missing = gs.filter((g) => !art[g]);
  if (missing.length) Object.assign(art, await api.art(missing).catch(() => ({})) ?? {});
  $('games').innerHTML = gs.slice(0, 8).map((g) => `<button data-g="${esc(g)}" class="${view === 'game' && game === g ? 'on' : ''}">${gico(g)}${esc(g)}<em>${clips.filter((c) => c.game === g).length}</em></button>`).join('');
  $('nTout').textContent = clips.filter((c) => !c.image).length || '';
  $('nJeux').textContent = gs.length || '';
  $('nFavs').textContent = clips.filter((c) => c.fav).length || '';
  $('nCaps').textContent = clips.filter((c) => c.image).length || '';
  render();
}
function show(v, g = null) {
  view = v; game = g;
  document.querySelectorAll('.side [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('#games [data-g]').forEach((b) => b.classList.toggle('on', v === 'game' && b.dataset.g === g));
  const panel = ['tout', 'favs', 'captures'].includes(v) ? 'list' : v;
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === `v-${panel}`));
  const amb = v === 'game' ? art[g]?.hero ?? art[g]?.img : null;
  $('ambient').style.setProperty('--amb', amb ? `url('${amb}')` : 'none'); $('ambient').classList.toggle('on', Boolean(amb));
  if (v === 'reglages') paintSettings();
  render(); $('main').scrollTop = 0;
}
function render() {
  const q = $('search').value.trim().toLowerCase();
  const match = (c) => !q || `${c.name} ${c.game}`.toLowerCase().includes(q);
  const sorted = (l) => [...l].sort((a, b) => (sortBy === 'old' ? a.at - b.at : sortBy === 'big' ? b.size - a.size : b.at - a.at));
  if (q && !['tout', 'favs', 'captures', 'game'].includes(view)) { show('tout'); return; }
  if (view === 'home') return renderHome();
  if (view === 'jeux') {
    $('gamegrid').innerHTML = games().filter((g) => !q || g.toLowerCase().includes(q)).map((g) => { const n = clips.filter((c) => c.game === g); return `<button class="gcard glass" data-g="${esc(g)}"><div class="gart" style="${gbg(g)}">${art[g]?.img ? '' : `<span class="gletter">${esc(g.slice(0, 1))}</span>`}</div><div class="gmeta">${gico(g)}<span><b>${esc(g)}</b><small>${n.filter((c) => !c.image).length} clips · ${n.filter((c) => c.image).length} captures · ${size(n.reduce((t, c) => t + c.size, 0))}</small></span></div></button>`; }).join('') || emptyMsg('Aucun jeu pour l’instant');
    return;
  }
  if (view === 'game') {
    const a = art[game] ?? {};
    const n = clips.filter((c) => c.game === game);
    $('ghero').setAttribute('style', a.hero || a.img ? `background:url('${esc(a.hero ?? a.img)}') center / cover, linear-gradient(135deg,hsl(${hue(game)} 70% 45%),#120e0a)` : gbg(game));
    $('ghero').innerHTML = `<button class="back" data-v="jeux">‹ Jeux</button>${a.logo ? `<img class="glogo" src="${esc(a.logo)}" alt="${esc(game)}">` : `<h1>${esc(game)}</h1>`}<div class="gsub"><b>${n.filter((c) => !c.image).length}</b> clips · <b>${n.filter((c) => c.image).length}</b> captures<br><small>${size(n.reduce((t, c) => t + c.size, 0))}</small></div>`;
    $('ggrid').innerHTML = sorted(n.filter(match)).map(card).join('') || emptyMsg();
    return;
  }
  if (['tout', 'favs', 'captures'].includes(view)) {
    $('listTitle').textContent = { tout: 'Mes clips', favs: 'Favoris', captures: 'Captures' }[view];
    const l = clips.filter((c) => (view === 'tout' ? !c.image || q : view === 'favs' ? c.fav : c.image)).filter(match);
    $('grid').innerHTML = sorted(l).map(card).join('') || emptyMsg(view === 'favs' ? 'Aucun favori' : view === 'captures' ? 'Aucune capture' : undefined);
  }
}
function renderHome() {
  const vids = clips.filter((c) => !c.image); const rec = settings.rec ?? 'off'; const on = rec === 'on'; const wait = rec === 'wait';
  const err = String(rec).startsWith('error') ? rec.slice(6) : '';
  const g = settings.inGame; const top = games()[0];
  const bg = art[g ?? top]?.hero ?? art[g ?? top]?.img;
  $('v-home').innerHTML = `<section class="hero glass">${bg ? `<div class="hbg" style="background-image:url('${esc(bg)}')"></div>` : ''}<div class="recdot ${on ? 'on' : wait ? 'wait' : ''}"><i></i></div>
    <div><h2>${on ? `Replay actif${g ? ` · ${esc(g)}` : ''}` : wait ? 'Prêt : en attente d’un jeu' : settings.replay ? 'Replay en démarrage…' : 'Replay en pause'}</h2>
    <p>${wait ? 'Le replay démarre tout seul dès qu’un jeu passe en plein écran (0 ressource utilisée d’ici là).<br>' : ''}Appuie sur ${keyText(settings.hotClip)} pour garder les ${settings.seconds} dernières secondes · ${keyText(settings.hotShot)} pour une capture.<br>${settings.source === 'game' ? '🎮 Le jeu seulement' : '🖥 Écran entier'} · ${settings.height}p · ${settings.fps} i/s${settings.audio ? ' · son du PC' : ' · sans son'}</p>${err ? `<p class="err">⚠ L’enregistrement n’a pas démarré : ${esc(err)}</p>` : ''}</div>
    <div class="heroact"><button type="button" class="btn" data-act="toggle">${settings.replay ? '⏸ Pause' : '▶ Activer'}</button><button type="button" class="btn" data-v="reglages">⚙ Réglages</button></div></section>
  <div class="stats"><div class="glass"><b>${vids.length}</b><small>clips</small></div><div class="glass"><b>${clips.length - vids.length}</b><small>captures</small></div><div class="glass"><b>${games().length}</b><small>jeux</small></div><div class="glass"><b>${size(clips.reduce((t, c) => t + c.size, 0))}</b><small>sur le disque</small></div></div>
  <div class="row-head"><h2>Derniers clips</h2>${vids.length > 6 ? '<button class="seeall" data-v="tout">Voir tout ›</button>' : ''}</div><div class="grid">${vids.slice(0, 6).map(card).join('') || emptyMsg()}</div>
  ${games().length ? `<div class="row-head"><h2>Tes jeux</h2><button class="seeall" data-v="jeux">Voir tout ›</button></div><div class="gamegrid">${games().slice(0, 4).map((x) => `<button class="gcard glass" data-g="${esc(x)}"><div class="gart" style="${gbg(x)}">${art[x]?.img ? '' : `<span class="gletter">${esc(x.slice(0, 1))}</span>`}</div><div class="gmeta">${gico(x)}<span><b>${esc(x)}</b><small>${clips.filter((c) => c.game === x).length} fichiers</small></span></div></button>`).join('')}</div>` : ''}`;
}

// ---------- Navigation (un seul écouteur pour tous les clics) ----------
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) return t.closest('dialog').close();
  const w = t.closest('[data-win]'); if (w) return api.win(w.dataset.win);
  const v = t.closest('[data-v]'); if (v) return show(v.dataset.v);
  const g = t.closest('[data-g]'); if (g) return show('game', g.dataset.g);
  const c = t.closest('[data-t]'); if (c) return openViewer(clips.find((x) => x.token === c.dataset.t));
  const s = t.closest('#sort [data-s]'); if (s) { sortBy = s.dataset.s; document.querySelectorAll('#sort button').forEach((b) => b.classList.toggle('on', b === s)); return render(); }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') setP({ replay: !settings.replay }, settings.replay ? '⏸ Replay en pause' : '🔴 Replay actif');
});
$('search').addEventListener('input', render);
// Logo du jeu introuvable : on affiche son nom à la place
document.addEventListener('error', (e) => { if (e.target.classList?.contains('glogo')) e.target.outerHTML = `<h1>${esc(e.target.alt)}</h1>`; }, true);
$('main').addEventListener('mouseover', (e) => { const v = e.target.closest('.card')?.querySelector('video'); if (v) v.play().catch(() => {}); });
$('main').addEventListener('mouseout', (e) => { const v = e.target.closest('.card')?.querySelector('video'); if (v && !e.relatedTarget?.closest?.('.card')?.contains(v)) { v.pause(); v.currentTime = 0.5; } });
$('saveNow').addEventListener('click', () => { api.saveNow(); toast('🎬 Clip en cours d’enregistrement…'); });
$('profile').addEventListener('click', () => (compte ? (show('reglages'), pane('acct')) : openAuth()));
api.onChanged(async () => { settings = await api.settings() ?? settings; paintPill(); load(); });
api.onMax((m) => { document.querySelector('[data-win=max]').textContent = m ? '❐' : '▢'; });

// ---------- Lecteur + découpe ----------
function openViewer(c) {
  if (!c) return;
  cur = c;
  $('vTitle').textContent = `${c.name} · ${c.game}`;
  $('vImg').hidden = !c.image; $('vVideo').hidden = c.image; $('trim').hidden = c.image; $('vExport').hidden = c.image; $('vCopy').hidden = !c.image;
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
$('vCopy').addEventListener('click', async () => toast((await api.copy(cur.token)) ? '📋 Image copiée' : 'Copie impossible'));
$('vExport').addEventListener('click', async () => { toast('⬇ Export en MP4…'); const r = await api.exportMp4(cur.token); if (!r?.cancelled) toast(r?.ok ? '⬇ Exporté en MP4' : r?.error ?? 'Export impossible'); });
$('vDelete').addEventListener('click', async () => { if (await api.remove(cur.token)) { $('viewer').close(); toast('🗑 Clip supprimé'); load(); } });
$('viewer').addEventListener('close', () => { $('vVideo').pause(); $('vVideo').removeAttribute('src'); $('vVideo').load(); });

// ---------- Discord ----------
$('vDiscord').addEventListener('click', async () => {
  if (!compte) { toast('Connecte ton compte History pour envoyer sur Discord'); return openAuth(); }
  const amis = await api.friends().catch(() => []) ?? [];
  ask('📤 Envoyer sur Discord', `<div class="pick"><button type="button" class="btn play" data-to="">📢 Salon des clips du serveur History Clips</button>${amis.map((a) => `<button type="button" class="btn ghost" data-to="${esc(a.id)}">💬 En privé à ${esc(a.pseudo)}</button>`).join('')}</div><p class="fine">En privé, ton ami doit avoir lié son Discord dans History Launcher.</p>`, null, async (to) => {
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

// ---------- Compte (même logique que History Launcher) ----------
let authMode = 'connexion'; let ticket2fa = null; let pairTimer = null;
function openAuth() { $('auth').hidden = false; authView('form'); }
function authView(which) {
  $('authForm').hidden = which !== 'form'; $('authTabs').hidden = which !== 'form'; $('authStep').hidden = which !== '2fa'; $('authPair').hidden = which !== 'pair';
  document.querySelector('.authlinks').hidden = which !== 'form'; $('authLauncher').hidden = which !== 'form'; document.querySelector('.or').hidden = which !== 'form';
  if (which !== 'pair') clearInterval(pairTimer);
}
$('authTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-auth]'); if (!b) return;
  authMode = b.dataset.auth;
  document.querySelectorAll('#authTabs button').forEach((x) => x.classList.toggle('on', x === b));
  $('pseudoField').hidden = authMode !== 'inscription'; $('authGo').textContent = authMode === 'inscription' ? 'Créer mon compte' : 'Se connecter'; $('authErr').textContent = '';
});
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('authErr').textContent = ''; $('authGo').disabled = true;
  const r = await api[authMode]({ pseudo: $('aPseudo').value.trim(), email: $('aEmail').value.trim(), motDePasse: $('aPass').value }).catch(() => null);
  $('authGo').disabled = false;
  if (r?.need2fa) { ticket2fa = r.ticket; authView('2fa'); $('stepCode').focus(); return; }
  if (r?.ok) return done(r.compte); $('authErr').textContent = r?.error ?? 'Connexion impossible.';
});
$('authStep').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api.twofa(ticket2fa, $('stepCode').value.trim());
  if (r?.ok) return done(r.compte); $('stepErr').textContent = r?.error ?? 'Code refusé.';
});
$('stepBack').addEventListener('click', () => authView('form'));
$('pairBack').addEventListener('click', () => authView('form'));
$('authSkip').addEventListener('click', () => { api.skip(); $('auth').hidden = true; });
$('authForgot').addEventListener('click', async () => {
  const email = $('aEmail').value.trim();
  if (!email) { $('authErr').textContent = 'Écris ton e-mail puis clique sur « Mot de passe oublié ? ».'; return; }
  await api.forgot(email); $('authErr').textContent = '📧 Si ce compte existe, un e-mail vient de partir. Change ton mot de passe depuis History Launcher.';
});
function pollPair() {
  clearInterval(pairTimer);
  pairTimer = setInterval(async () => { const r = await api.pairPoll(); if (r?.ok) { clearInterval(pairTimer); done(r.compte); } else if (r?.status === 410) { clearInterval(pairTimer); $('pairText').textContent = 'Code expiré, recommence.'; } }, 2500);
}
$('authPairBtn').addEventListener('click', async () => {
  authView('pair'); $('pairTitle').textContent = '💻 Connexion avec un autre PC'; $('pairCode').textContent = '····-····';
  const r = await api.pairStart(); if (r?.code) { $('pairCode').textContent = r.code; pollPair(); } else $('pairText').textContent = r?.error ?? 'Serveur injoignable.';
});
async function linkLauncher() {
  $('auth').hidden = false; authView('pair'); $('pairTitle').textContent = '🔗 Connexion avec History Launcher'; $('pairCode').textContent = '····-····';
  $('pairText').innerHTML = 'History Launcher s’ouvre et valide la connexion tout seul…';
  const r = await api.linkLauncher();
  if (r?.code) $('pairCode').textContent = r.code;
  if (r?.noLauncher) $('pairText').innerHTML = 'History Launcher n’est pas installé sur ce PC. Sur un PC où il est connecté : clique sur ton nom › <b>Connecter un autre PC</b> et entre ce code.';
  else if (!r?.ok && !r?.code) $('pairText').textContent = r?.error ?? 'Serveur injoignable.';
  if (r?.code) pollPair();
}
$('authLauncher').addEventListener('click', linkLauncher);
api.onLinkLauncher(linkLauncher);
function done(c) { compte = c ?? compte; $('auth').hidden = true; paintProfile(); toast(`👤 Connecté${compte?.pseudo ? ` : ${compte.pseudo}` : ''}`); if (view === 'reglages') paintSettings(); }
function paintProfile() {
  $('pName').textContent = compte?.pseudo ?? 'Invité'; $('pSub').textContent = compte ? 'Compte History' : 'Se connecter';
  const av = $('avatar'); av.textContent = compte ? (compte.pseudo ?? 'H').slice(0, 1).toUpperCase() : '?';
  av.style.backgroundImage = compte?.avatar && /^https:|^data:image\//.test(compte.avatar) ? `url('${compte.avatar}')` : '';
  if (compte?.avatar) av.textContent = '';
}
api.onAccount(async () => { compte = (await api.account())?.compte ?? null; paintProfile(); });

// ---------- Réglages ----------
const THEMES = { jaune: '#ffc233', bleu: '#2f8bff', rouge: '#ff4d5e', violet: '#b36bff', vert: '#2ee07a', rose: '#ff5fb4' };
function pane(p) { document.querySelectorAll('#setnav button').forEach((b) => b.classList.toggle('on', b.dataset.p === p)); document.querySelectorAll('.pane').forEach((x) => x.classList.toggle('on', x.dataset.p === p)); }
$('setnav').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) pane(b.dataset.p); });
async function paintSettings() {
  settings = await api.settings() ?? settings;
  const s = settings;
  $('sReplay').checked = s.replay; $('sSeconds').value = String(s.seconds); $('sHeight').value = String(s.height); $('sFps').value = String(s.fps);
  $('sAudio').checked = s.audio; $('sSound').checked = s.sound; $('sOnlyGame').checked = s.onlyGame; $('sPriority').checked = s.gamePriority; $('sAuto').checked = s.autostart;
  $('sMax').value = String(s.maxGB ?? 0); $('sDir').textContent = s.dir; $('sVer').textContent = `History Clips ${s.version}`;
  document.querySelectorAll('#sSource button').forEach((b) => b.classList.toggle('on', b.dataset.val === s.source));
  document.querySelectorAll('[data-hk]').forEach((b) => { b.innerHTML = keyText(s[b.dataset.hk]); });
  $('themes').innerHTML = Object.entries(THEMES).map(([k, c]) => `<button type="button" data-theme="${k}" class="${s.theme === k ? 'on' : ''}"><i style="background:${c};color:${c}"></i>${k}</button>`).join('');
  $('acct').innerHTML = compte ? `<div class="acctbox"><span class="avatar">${esc((compte.pseudo ?? 'H').slice(0, 1).toUpperCase())}</span><div><b>${esc(compte.pseudo ?? 'Connecté')}</b><p class="fine">Connecté au même compte que History Launcher : amis, envoi Discord.</p></div></div><button type="button" class="btn ghost sm" id="aOut">Se déconnecter</button>`
    : '<p class="fine">Connecte-toi pour envoyer tes clips sur Discord et à tes amis.</p><button type="button" class="btn play" id="aIn">Se connecter</button>';
}
const setP = async (p, msg) => { const r = await api.setSettings(p); if (r?.ok === false) toast(r.error); else if (msg) toast(msg); settings = await api.settings() ?? settings; paintPill(); render(); return r; };
$('sReplay').addEventListener('change', (e) => setP({ replay: e.target.checked }, e.target.checked ? '🔴 Replay actif' : '⏸ Replay en pause'));
for (const [id, k] of [['sSeconds', 'seconds'], ['sHeight', 'height'], ['sFps', 'fps'], ['sMax', 'maxGB']]) $(id).addEventListener('change', (e) => setP({ [k]: Number(e.target.value) }, '✅ Réglage enregistré'));
for (const [id, k] of [['sAudio', 'audio'], ['sSound', 'sound'], ['sOnlyGame', 'onlyGame'], ['sPriority', 'gamePriority'], ['sAuto', 'autostart']]) $(id).addEventListener('change', (e) => setP({ [k]: e.target.checked }, '✅ Réglage enregistré'));
$('sSource').addEventListener('click', async (e) => { const b = e.target.closest('[data-val]'); if (b) { await setP({ source: b.dataset.val }, b.dataset.val === 'game' ? '🎮 Seul le jeu sera filmé' : '🖥 Tout l’écran sera filmé'); paintSettings(); } });
$('sPreset').addEventListener('click', async (e) => {
  const v = e.target.closest('[data-val]')?.dataset.val; if (!v) return;
  await setP({ perf: { height: 720, fps: 30 }, eq: { height: 1080, fps: 60 }, qual: { height: 1440, fps: 60 } }[v], '⚡ Réglage appliqué'); paintSettings();
});
$('themes').addEventListener('click', async (e) => { const b = e.target.closest('[data-theme]'); if (!b) return; document.body.dataset.theme = b.dataset.theme; await setP({ theme: b.dataset.theme }); paintSettings(); });
$('sPick').addEventListener('click', async () => { const d = await api.pickFolder(); if (d) { $('sDir').textContent = d; load(); } });
$('sOpenDir').addEventListener('click', () => api.root());
$('openSite').addEventListener('click', () => api.site());
$('acct').addEventListener('click', async (e) => {
  if (e.target.id === 'aOut') { await api.logout(); compte = null; paintProfile(); paintSettings(); toast('👋 Déconnecté'); }
  if (e.target.id === 'aIn') openAuth();
});
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
function paintPill() {
  const rec = settings.rec ?? 'off';
  $('replayPill').classList.toggle('on', rec === 'on'); $('replayPill').classList.toggle('wait', rec === 'wait');
  $('replayPill').querySelector('span').innerHTML = rec === 'on' ? `REC · ${keyText(settings.hotClip)}` : rec === 'wait' ? 'En attente d’un jeu' : settings.replay ? 'Replay…' : 'Replay en pause';
  document.body.dataset.theme = settings.theme ?? 'jaune';
}

// ---------- Mises à jour (comme le launcher) ----------
function paintUpdate(u) {
  if (!u) return;
  $('updPill').hidden = !['available', 'ready'].includes(u.state);
  $('updPill').textContent = u.state === 'ready' ? `⬆ Redémarrer pour la v${u.version}` : `⬆ Mettre à jour (v${u.version})`;
  $('updScreen').hidden = !(u.state === 'progress' && u.now);
  $('updTitle').textContent = `Mise à jour v${u.version ?? ''}`; $('updFill').style.width = `${u.percent ?? 0}%`; $('updText').textContent = `Téléchargement… ${u.percent ?? 0} %`;
  $('updStatus').textContent = { checking: 'Recherche…', uptodate: '✅ Tu as la dernière version.', available: `Nouvelle version v${u.version} disponible.`, progress: `Téléchargement ${u.percent ?? 0} %…`, ready: `v${u.version} prête : elle s’installe au redémarrage.`, error: `Erreur : ${u.error ?? ''}` }[u.state] ?? 'Les mises à jour s’installent toutes seules.';
}
$('updPill').addEventListener('click', () => api.updNow());
$('updCheck').addEventListener('click', async () => { const r = await api.updCheck(); if (r?.dev) $('updStatus').textContent = 'Version développeur : pas de mise à jour automatique.'; });
api.onUpdate(paintUpdate);

(async () => {
  settings = await api.settings() ?? {}; paintPill();
  const a = await api.account().catch(() => null); compte = a?.compte ?? null; paintProfile();
  if (!compte && !a?.skipped) openAuth();
  paintUpdate(await api.updGet());
  load();
})();
