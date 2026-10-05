import { initQuickSupport } from './quick-support.js';
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
  account: async () => ({ compte: { pseudo: 'Alex' } }), setSettings: async () => ({ ok: true }), updGet: async () => ({ state: 'idle' }),
};
const api = new Proxy(window.hc ?? DEMO, { get: (t, k) => t[k] ?? (typeof k === 'string' && k.startsWith('on') ? () => {} : async () => null) });
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); };
const keyText = (a) => String(a ?? '').replace('CommandOrControl', 'Ctrl').replace('Shift', 'Maj').replace('PrintScreen', 'Impr. écran').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('');
const hue = (g) => [...g].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 40);

let clips = []; let settings = {}; let art = {}; let view = 'home'; let game = null; let sortBy = 'new'; let cur = null; let compte = null;

// ---------- Icône et image d'un jeu ----------
const brandIcon = g => /^bureau$/i.test(g) ? 'brands/windows.svg' : /roblox/i.test(g) ? (/studio/i.test(g) ? 'brands/robloxstudio.svg' : 'brands/roblox.svg') : null;
function gico(g) {
  const brand = brandIcon(g);
  if (brand) return `<img class="gico brand-icon" src="${brand}" alt="">`;
  const a = art[g] ?? {};
  if (a.icon) return `<img class="gico" src="${esc(a.icon)}" alt="">`;
  // Image par-dessus la lettre : si elle ne charge pas, la lettre colorée reste
  return `<span class="gico" style="background:${a.img ? `url('${esc(a.img)}') center / cover, ` : ''}hsl(${hue(g)} 80% 60%)">${a.img ? '' : esc(g.slice(0, 1).toUpperCase())}</span>`;
}
const gamePlaceholder = g => brandIcon(g) ? `<img class="game-brand" src="${brandIcon(g)}" alt="">` : `<span class="gletter">${esc(g.slice(0, 1))}</span>`;
const gameBackground = g => /^bureau$/i.test(g) ? 'brands/windows-background.svg' : /roblox/i.test(g) ? 'brands/roblox-background.jpg' : art[g]?.img || clips.find(c => c.game === g && (c.thumb || c.image))?.thumb || clips.find(c => c.game === g && c.image)?.url;
const gamePicture = g => { const src = gameBackground(g); return src ? `<img class="game-backdrop" src="${esc(src)}" loading="lazy" decoding="async" alt=""><img class="game-picture" src="${esc(src)}" loading="lazy" decoding="async" alt="">` : gamePlaceholder(g); };
const gbg = g => `background:${gameBackground(g) ? `linear-gradient(#0006,#0006),url('${esc(gameBackground(g))}') center / cover, ` : ''}linear-gradient(135deg,hsl(${hue(g)} 70% 45%),#120e0a)`;
function card(c) {
  const poster = !c.url && art[c.game]?.img ? ` style="background-image:url('${esc(art[c.game].img)}')"` : '';
  return `<button class="card glass" data-t="${esc(c.token)}"><div class="thumb"${poster}>${c.image ? `<img src="${esc(c.url)}" alt="" loading="lazy" decoding="async">` : c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy" decoding="async">` : ''}<span class="tag">${gico(c.game)}${esc(c.game)}</span>${c.fav ? '<span class="star">⭐</span>' : ''}${c.image ? '<span class="dur">📸</span>' : ''}</div>
    <div class="info"><b>${esc(c.name)}</b><small>${when(c.at)} · ${size(c.size)}</small></div></button>`;
}
const emptyMsg = (t = 'Aucun clip ici pour l’instant') => `<div class="empty"><b>${t}</b>En jeu, appuie sur ${keyText(settings.hotClip ?? 'F8')} pour garder les ${settings.seconds ?? 30} dernières secondes.</div>`;
const games = () => [...new Set(clips.map((c) => c.game))].sort((a, b) => clips.filter((c) => c.game === b).length - clips.filter((c) => c.game === a).length);

// ---------- Chargement ----------
let artQueue = Promise.resolve();
async function load() {
  clips = await api.list().catch(() => []) ?? [];
  const gs = games();
  const missing = gs.filter((g) => !art[g]);
  // Afficher les clips immédiatement ; une seule recherche d’image à la fois en arrière-plan.
  for (const g of missing) {
    art[g] = {};
    artQueue = artQueue.then(async () => {
      Object.assign(art, await api.art([g]).catch(() => ({})) ?? {});
      paintLibrary();
    }).catch(() => {});
  }
  paintLibrary();
}
function paintLibrary() {
  const gs = games();
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
    $('gamegrid').innerHTML = games().filter((g) => !q || g.toLowerCase().includes(q)).map((g) => { const n = clips.filter((c) => c.game === g); return `<button class="gcard glass" data-g="${esc(g)}"><div class="gart" style="background:linear-gradient(135deg,hsl(${hue(g)} 70% 25%),#120e0a)">${gamePicture(g)}</div><div class="gmeta">${gico(g)}<span><b>${esc(g)}</b><small>${n.filter((c) => !c.image).length} clips · ${n.filter((c) => c.image).length} captures · ${size(n.reduce((t, c) => t + c.size, 0))}</small></span></div></button>`; }).join('') || emptyMsg('Aucun jeu pour l’instant');
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
    <p>${wait ? 'Le replay démarre tout seul dès qu’un jeu passe en plein écran (0 ressource utilisée d’ici là).<br>' : ''}Appuie sur ${keyText(settings.hotClip)} pour garder les ${settings.seconds} dernières secondes · ${keyText(settings.hotShot)} pour une capture.<br>${settings.source === 'game' ? '🎮 Le jeu seulement' : '🖥 Écran entier'} · ${settings.height}p · cible ${settings.fps} i/s${settings.captureBackend === 'native' ? ' · capture Windows native' : ' · capture compatible'}${settings.audio ? ' · son du PC' : ' · sans son'}</p>${err ? `<p class="err">⚠ L’enregistrement n’a pas démarré : ${esc(err)}</p>` : ''}${settings.noAudio && on ? '<p class="err">🔇 Windows ne donne pas le son du PC : vérifie ta sortie audio par défaut (Paramètres Windows › Son) puis redémarre History Clips.</p>' : ''}${settings.noMic && on ? '<p class="err">🎙 Micro indisponible : vérifie son branchement et son autorisation Windows, puis relance le replay.</p>' : ''}</div>
    <div class="heroact"><button type="button" class="btn" data-act="toggle">${settings.replay ? '⏸ Pause' : '▶ Activer'}</button><button type="button" class="btn" data-v="reglages">⚙ Réglages</button></div></section>
  <div class="stats"><div class="glass"><b>${vids.length}</b><small>clips</small></div><div class="glass"><b>${clips.length - vids.length}</b><small>captures</small></div><div class="glass"><b>${games().length}</b><small>jeux</small></div><div class="glass"><b>${size(clips.reduce((t, c) => t + c.size, 0))}</b><small>sur le disque</small></div></div>
  <div class="row-head"><h2>Derniers clips</h2>${vids.length > 6 ? '<button class="seeall" data-v="tout">Voir tout ›</button>' : ''}</div><div class="grid">${vids.slice(0, 6).map(card).join('') || emptyMsg()}</div>
  ${games().length ? `<div class="row-head"><h2>Tes jeux</h2><button class="seeall" data-v="jeux">Voir tout ›</button></div><div class="gamegrid">${games().slice(0, 4).map((x) => `<button class="gcard glass" data-g="${esc(x)}"><div class="gart" style="background:linear-gradient(135deg,hsl(${hue(x)} 70% 25%),#120e0a)">${gamePicture(x)}</div><div class="gmeta">${gico(x)}<span><b>${esc(x)}</b><small>${clips.filter((c) => c.game === x).length} fichiers</small></span></div></button>`).join('')}</div>` : ''}`;
}

// ---------- Navigation (un seul écouteur pour tous les clics) ----------
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) return t.closest('dialog').close();
  const w = t.closest('[data-win]'); if (w) return api.win(w.dataset.win);
  const v = t.closest('[data-v]'); if (v) return show(v.dataset.v);
  const g = t.closest('[data-g]'); if (g) return show('game', g.dataset.g);
  const c = t.closest('[data-t]');
  if (c && picks && !c.closest('dialog')) { const k = picks.indexOf(c.dataset.t); if (k >= 0) picks.splice(k, 1); else picks.push(c.dataset.t); return paintPicks(); }
  if (c) return openViewer(clips.find((x) => x.token === c.dataset.t));
  const s = t.closest('#sort [data-s]'); if (s) { sortBy = s.dataset.s; document.querySelectorAll('#sort button').forEach((b) => b.classList.toggle('on', b === s)); return render(); }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') setP({ replay: !settings.replay }, settings.replay ? '⏸ Replay en pause' : '🔴 Replay actif');
});
$('search').addEventListener('input', render);
// Logo du jeu introuvable : on affiche son nom à la place
document.addEventListener('error', (e) => { if (e.target.classList?.contains('glogo')) e.target.outerHTML = `<h1>${esc(e.target.alt)}</h1>`; }, true);
// Survol : la vidéo n'est chargée que sur la carte survolée (une seule à la fois), puis libérée
$('main').addEventListener('mouseover', (e) => {
  const card = e.target.closest('.card'); if (!card || card.querySelector('video')) return;
  const c = clips.find((x) => x.token === card.dataset.t); if (!c || c.image || !c.url || clipBusy.has(c.token)) return;
  const v = document.createElement('video'); v.muted = true; v.loop = true; v.src = c.url; v.play().catch(() => {});
  card.querySelector('.thumb').prepend(v);
});
$('main').addEventListener('mouseout', (e) => { const card = e.target.closest('.card'); const v = card?.querySelector('video'); if (v && !card.contains(e.relatedTarget)) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } });
$('saveNow').addEventListener('click', async () => {
  if ($('saveNow').disabled) return; $('saveNow').disabled = true; toast('🎬 Clip en cours d’enregistrement…');
  try { const r = await api.saveNow(); if (r) toast(r.ok ? '🎬 Clip enregistré' : r.error ?? 'Clip pas encore prêt'); }
  catch (e) { toast(`Clip non enregistré : ${e.message}`); }
  finally { $('saveNow').disabled = false; }
});
$('profile').addEventListener('click', () => (compte ? (show('reglages'), pane('acct')) : openAuth()));
api.onChanged(async () => { settings = await api.settings() ?? settings; paintPill(); load(); });
api.onFocus((f) => document.body.classList.toggle('idle', !f));
api.onMax((m) => { document.querySelector('[data-win=max]').textContent = m ? '❐' : '▢'; });

// ---------- Lecteur + découpe ----------
function openViewer(c) {
  if (!c) return;
  releaseClipMedia(); cur = c;
  $('vStatus').hidden = true;
  $('vTitle').textContent = `${c.name} · ${c.game}`;
  $('vImg').hidden = !c.image; $('vVideo').hidden = c.image; $('trim').hidden = c.image; $('vExport').hidden = c.image; $('vCopy').hidden = !c.image;
  if (c.image) $('vImg').src = c.url; else { $('vVideo').src = c.url; $('vVideo').load(); $('vVideo').play().catch(e => { if (cur === c && e.name !== 'AbortError') { $('vStatus').hidden = false; $('vStatus').textContent = 'Clique sur Lecture. Si le clip reste bloqué, ouvre-le depuis son dossier ou réessaie sa réparation.'; } }); }
  $('vFav').textContent = c.fav ? '⭐ Retirer des favoris' : '⭐ Favori';
  $('viewer').showModal();
}
// ---------- Découpe : timeline avec poignées, bande d'images, lecture de la sélection ----------
const V = $('vVideo');
let filmGeneration = 0; const clipBusy = new Set(), previewVideos = new Set();
function releaseVideo(v) { v.pause(); v.removeAttribute('src'); v.load(); }
function releaseClipMedia() {
  filmGeneration++;
  for (const v of previewVideos) releaseVideo(v);
  previewVideos.clear();
  document.querySelectorAll('.card video').forEach(v => { releaseVideo(v); v.remove(); });
  releaseVideo(V);
}
async function clipAction(c, fn) {
  if (!c || clipBusy.has(c.token)) return null;
  clipBusy.add(c.token);
  try { return await fn(); }
  catch (e) { toast(`Impossible : ${e.message ?? 'réessaie dans un instant'}`); return null; }
  finally { clipBusy.delete(c.token); }
}
let dur = 0; let tA = 0; let tB = 0; let selPlay = false;
const pct = (t) => `${dur ? (t / dur) * 100 : 0}%`;
function paintTrim() {
  $('tlSel').style.left = pct(tA); $('tlSel').style.width = `calc(${pct(tB)} - ${pct(tA)})`;
  $('shadeL').style.width = pct(tA); $('shadeR').style.width = `calc(100% - ${pct(tB)})`;
  $('oStart').textContent = sec(tA); $('oEnd').textContent = sec(tB); $('tSel').textContent = `Sélection : ${sec(tB - tA)}`;
}
const setA = (t) => { tA = Math.max(0, Math.min(t, tB - 0.5)); paintTrim(); };
const setB = (t) => { tB = Math.min(dur, Math.max(t, tA + 0.5)); paintTrim(); };
// Clip illisible (souvent un ancien replay aux horodatages abîmés) : réparé tout seul puis rouvert
const repaired = new Set();
V.addEventListener('error', async () => {
  const c = cur;
  if (!c || c.image || !V.getAttribute('src') || repaired.has(c.token)) return;
  repaired.add(c.token); releaseClipMedia();
  $('vStatus').hidden = false; $('vStatus').textContent = 'Réparation du clip en cours… L’original est conservé.';
  const r = await clipAction(c, () => api.repair(c.token));
  if (cur !== c || !$('viewer').open) return;
  if (!r?.ok) { $('vStatus').textContent = r?.error ?? 'Ce clip ne peut pas être lu. Son fichier original est conservé.'; return; }
  await load(); const fixed = clips.find(x => x.token === r.token);
  if (fixed && cur === c && $('viewer').open) { repaired.add(fixed.token); openViewer(fixed); toast('✅ Copie réparée créée'); }
});
V.addEventListener('loadedmetadata', () => { dur = Number.isFinite(V.duration) ? V.duration : 0; tA = 0; tB = dur; paintTrim(); filmstrip(cur); });
V.addEventListener('timeupdate', () => {
  $('tlPh').style.left = pct(V.currentTime);
  if (selPlay && V.currentTime >= tB) { V.pause(); V.currentTime = tA; selPlay = false; $('playSel').textContent = '▶ Lire la sélection'; }
});
// Bande d'images : 10 vignettes prises dans la vidéo
async function filmstrip(c) {
  const gen = ++filmGeneration, strip = $('strip'); strip.innerHTML = '';
  if (!c?.url || !dur) return;
  const duration = dur, v = document.createElement('video'); v.muted = true; v.preload = 'auto';
  previewVideos.add(v);
  const ready = (event, action) => new Promise(resolve => {
    const done = () => { clearTimeout(timer); v.removeEventListener(event, done); v.removeEventListener('error', done); resolve(); };
    const timer = setTimeout(done, 2000); v.addEventListener(event, done, { once: true }); v.addEventListener('error', done, { once: true }); action();
  });
  try {
    await ready('loadeddata', () => { v.src = c.url; });
    for (let i = 0; i < 10 && gen === filmGeneration && cur === c && v.readyState >= 2; i++) {
      await ready('seeked', () => { v.currentTime = duration * (i + 0.5) / 10; });
      if (gen !== filmGeneration || cur !== c || v.readyState < 2) break;
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90;
      cv.getContext('2d').drawImage(v, 0, 0, 160, 90); strip.append(cv);
    }
  } catch { /* La lecture reste utilisable si les vignettes ne sont pas disponibles. */ }
  finally { releaseVideo(v); previewVideos.delete(v); }
}
// Glisser : une poignée, toute la sélection, ou un clic pour placer la lecture
// Glisser : une poignée, toute la sélection, ou un simple clic pour placer la lecture (même dans la sélection).
// La vidéo ne suit qu'une fois par image affichée (pas à chaque mouvement de souris) : glissé fluide, sans à-coups.
let seekTo = null;
const seek = (t) => { if (seekTo == null) requestAnimationFrame(() => { if (seekTo != null) V.currentTime = seekTo; seekTo = null; }); seekTo = t; };
$('tl').addEventListener('pointerdown', (e) => {
  if (!dur || e.button !== 0) return;
  e.preventDefault();
  const tl = $('tl'); const r = tl.getBoundingClientRect(); const at = (x) => Math.max(0, Math.min(dur, ((x - r.left) / r.width) * dur));
  const h = e.target.closest('[data-h]')?.dataset.h; const onSel = !h && e.target.closest('#tlSel'); const x0 = e.clientX; const t0 = at(x0); const a0 = tA; const b0 = tB;
  let moved = false;
  tl.setPointerCapture(e.pointerId); tl.classList.add('dragging');
  if (!h && !onSel) { seek(t0); }
  const move = (ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 4) return; // petit tremblement = simple clic
    moved = true;
    const t = at(ev.clientX);
    if (h === 'a') { setA(t); seek(tA); } else if (h === 'b') { setB(t); seek(tB); }
    else if (onSel) { const d = Math.max(-a0, Math.min(dur - b0, t - t0)); tA = a0 + d; tB = b0 + d; paintTrim(); seek(tA); }
    else seek(t);
  };
  const up = () => {
    tl.classList.remove('dragging');
    if (!moved && onSel) seek(t0); // clic dans la sélection : on se place là
    tl.removeEventListener('pointermove', move); tl.removeEventListener('pointerup', up); tl.removeEventListener('pointercancel', up);
  };
  tl.addEventListener('pointermove', move); tl.addEventListener('pointerup', up); tl.addEventListener('pointercancel', up);
});
$('setA').addEventListener('click', () => setA(V.currentTime));
$('setB').addEventListener('click', () => setB(V.currentTime));
$('resetSel').addEventListener('click', () => { tA = 0; tB = dur; paintTrim(); });
$('playSel').addEventListener('click', () => {
  if (selPlay) { V.pause(); selPlay = false; $('playSel').textContent = '▶ Lire la sélection'; return; }
  V.currentTime = tA; V.play().catch(() => {}); selPlay = true; $('playSel').textContent = '⏸ Pause';
});
document.addEventListener('keydown', (e) => {
  if (!$('viewer').open || cur?.image || e.target.matches('input, textarea')) return;
  if (e.key === 'i' || e.key === 'I') setA(V.currentTime);
  else if (e.key === 'o' || e.key === 'O') setB(V.currentTime);
  else if (e.key === ' ') { e.preventDefault(); V.paused ? V.play().catch(() => {}) : V.pause(); }
  else if (e.key === 'ArrowLeft') V.currentTime = Math.max(0, V.currentTime - (e.shiftKey ? 1 : 0.1));
  else if (e.key === 'ArrowRight') V.currentTime = Math.min(dur, V.currentTime + (e.shiftKey ? 1 : 0.1));
});
V.addEventListener('dblclick', () => V.requestFullscreen?.().catch(() => {}));
// Valider : nouveau clip ou à la place de l'original
$('doTrim').addEventListener('click', () => {
  if (!dur || (tA < 0.05 && tB > dur - 0.05)) return toast('Déplace les poignées pour choisir le passage à garder.');
  ask(`✂ Garder ${sec(tB - tA)}`, `<p class="fine">De ${sec(tA)} à ${sec(tB)}. Comment l’enregistrer ?</p><div class="choice"><button type="button" class="btn play" data-to="new">💾 Nouveau clip<small>l’original reste intact</small></button><button type="button" class="btn" data-to="replace">♻ Remplacer l’original<small>l’ancien part à la corbeille</small></button></div>`, null, async (mode) => {
    toast('✂ Découpe en cours…');
    const c = cur, start = tA, end = tB;
    if (mode === 'replace') releaseClipMedia();
    const r = await clipAction(c, () => api.trim(c.token, start, end, mode));
    if (!r?.ok) { if (mode === 'replace' && cur === c) openViewer(c); return toast(r?.error ?? 'Découpe impossible'); }
    toast(mode === 'replace' ? '♻ Clip remplacé par le passage choisi' : '💾 Nouveau clip enregistré');
    if (mode === 'replace') $('viewer').close();
    load();
  });
});
$('vFav').addEventListener('click', async () => { cur.fav = await api.fav(cur.token); $('vFav').textContent = cur.fav ? '⭐ Retirer des favoris' : '⭐ Favori'; load(); });
$('vRename').addEventListener('click', () => ask('✏ Renommer le clip', `<input type="text" id="mName" maxlength="80" value="${esc(cur.name)}">`, async () => { await api.rename(cur.token, $('mName').value); $('vTitle').textContent = `${$('mName').value} · ${cur.game}`; load(); }));
$('vFolder').addEventListener('click', () => api.open(cur.token, 'folder'));
$('vCopy').addEventListener('click', async () => toast((await api.copy(cur.token)) ? '📋 Image copiée' : 'Copie impossible'));
$('vExport').addEventListener('click', async () => { toast('⬇ Export en MP4…'); const c = cur; const r = await clipAction(c, () => api.exportMp4(c.token)); if (!r?.cancelled) toast(r?.ok ? '⬇ Exporté en MP4' : r?.error ?? 'Export impossible'); });
// Suppression : notre propre fenêtre de confirmation (plus l'alerte Windows)
function confirmDelete(c, after) {
  ask('🗑 Supprimer ce clip ?', `<p class="fine">« ${esc(c.name)} » part dans la corbeille : tu peux encore le récupérer.</p><div class="choice"><button type="button" class="btn danger" data-to="yes">🗑 Supprimer</button><button type="button" class="btn" data-to="no">Annuler</button></div>`, null, async (v) => {
    if (v !== 'yes') return;
    await clipAction(c, async () => {
      releaseClipMedia();
      const r = await api.remove(c.token).catch(e => ({ ok: false, error: e.message }));
      if (r?.ok || r === true) { toast('🗑 Clip supprimé'); after?.(); await load(); }
      else { if ($('viewer').open && cur === c) openViewer(c); toast(r?.error ?? 'Suppression impossible'); }
    });
  });
}
$('vDelete').addEventListener('click', () => confirmDelete(cur, () => $('viewer').close()));
$('viewer').addEventListener('close', () => { releaseClipMedia(); cur = null; });

// ---------- Discord ----------
$('vDiscord').addEventListener('click', () => shareDiscord(cur));
// Envoi : serveur History Clips, un autre serveur où le bot est (salon « clips-history »), ou en privé à un ami
async function shareDiscord(c) {
  if (!c) return;
  if (!compte) { toast('Connecte ton compte History pour envoyer sur Discord'); return openAuth(); }
  const [amis, servs] = await Promise.all([api.friends().catch(() => []), api.servers().catch(() => [])]);
  const sv = (servs ?? []).map((g) => `<button type="button" class="btn ${g.home ? 'play' : ''}" data-to="g:${esc(g.id)}">${g.icon ? `<img src="${esc(g.icon)}" alt="" class="gicon">` : '📢'} ${g.home ? 'Serveur History Clips' : `${esc(g.name)} <small>· salon clips-history</small>`}</button>`).join('');
  ask('📤 Envoyer sur Discord', `<div class="pick">${sv || '<button type="button" class="btn play" data-to="">📢 Serveur History Clips</button>'}${(amis ?? []).map((a) => `<button type="button" class="btn ghost" data-to="${esc(a.id)}">💬 En privé à ${esc(a.pseudo)}</button>`).join('')}</div><p class="fine">Pour partager sur un autre serveur, ajoute le bot History Clips dessus : il crée tout seul le salon <b>clips-history</b>. Ton compte Discord doit être lié dans History Launcher.</p>`, null, async (to) => {
    toast('📤 Envoi du clip…');
    const r = await clipAction(c, () => to.startsWith('g:') ? api.discord(c.token, '', to.slice(2)) : api.discord(c.token, to));
    toast(r?.ok ? '✅ Clip envoyé sur Discord' : r?.error ?? 'Envoi impossible');
  });
}

// ---------- Vertical (TikTok, Shorts) et lien de partage ----------
function vertical(c) {
  ask('📱 Exporter en vertical (9:16)', '<div class="choice"><button type="button" class="btn play" data-to="flou">🌫 Image entière<small>sur un fond flouté</small></button><button type="button" class="btn" data-to="zoom">🔍 Zoom au centre<small>plein écran, bords coupés</small></button></div>', null, async (mode) => {
    toast('📱 Export vertical en cours…');
    const r = await clipAction(c, () => api.vertical(c.token, mode)); toast(r?.ok ? '📱 Clip vertical prêt (dans le même dossier)' : r?.error ?? 'Export impossible'); if (r?.ok) load();
  });
}
async function shareLink(c) {
  if (!compte) { toast('Connecte ton compte History pour créer un lien'); return openAuth(); }
  toast('🔗 Mise en ligne du clip…');
  const r = await clipAction(c, () => api.link(c.token));
  toast(r?.ok ? '🔗 Lien copié ! Colle-le où tu veux (valable 7 jours)' : r?.error ?? 'Lien impossible');
}
$('vVertical').addEventListener('click', () => vertical(cur));
$('vLink').addEventListener('click', () => shareLink(cur));

// ---------- Montage : choisir plusieurs clips dans l'ordre, puis les assembler ----------
let picks = null;
function paintPicks() {
  document.body.classList.toggle('picking', Boolean(picks)); $('montageBar').hidden = !picks;
  document.querySelectorAll('.card .pickn').forEach((x) => x.remove());
  if (!picks) return;
  picks.forEach((t, i) => document.querySelector(`.card[data-t="${CSS.escape(t)}"] .thumb`)?.insertAdjacentHTML('beforeend', `<span class="pickn">${i + 1}</span>`));
  $('montageCount').textContent = `${picks.length} clip${picks.length > 1 ? 's' : ''} choisi${picks.length > 1 ? 's' : ''}`;
}
$('montageBtn').addEventListener('click', () => { picks = picks ? null : []; paintPicks(); if (picks) toast('🎞 Clique sur les clips à assembler, dans l’ordre'); });
$('montageCancel').addEventListener('click', () => { picks = null; paintPicks(); });
$('montageGo').addEventListener('click', async () => {
  if ((picks?.length ?? 0) < 2) return toast('Choisis au moins 2 clips.');
  const list = picks; picks = null; paintPicks(); toast(`🎞 Montage de ${list.length} clips en cours…`);
  const r = await clipAction({token: 'montage'}, () => api.montage(list)); toast(r?.ok ? '🎞 Montage prêt : dossier « Montages »' : r?.error ?? 'Montage impossible'); if (r?.ok) load();
});

// Best-of de la semaine : favoris des 7 derniers jours (sinon les 6 derniers clips), assemblés en une vidéo
$('bestOfBtn').addEventListener('click', async () => {
  const week = clips.filter((c) => !c.image && Date.now() - c.at < 7 * 86_400_000).sort((a, b) => a.at - b.at);
  const favs = week.filter((c) => c.fav);
  const list = (favs.length >= 2 ? favs : week.slice(-6)).slice(-12).map((c) => c.token);
  if (list.length < 2) return toast('Il faut au moins 2 clips cette semaine.');
  toast(`⭐ Best-of de ${list.length} clips en cours…`);
  const r = await clipAction({ token: 'montage' }, () => api.montage(list)); toast(r?.ok ? '⭐ Best-of prêt : dossier « Montages »' : r?.error ?? 'Best-of impossible'); if (r?.ok) load();
});

// ---------- Discord et History Launcher ----------
$('discordBtn').addEventListener('click', async () => { toast('🎮 Ouverture du serveur Discord…'); await api.discordInvite(); });
$('launcherLink').addEventListener('click', async () => { const has = await api.launcher(); toast(has ? '🚀 Ouverture de History Launcher…' : '⬇ Page de téléchargement de History Launcher'); });

// ---------- Clic droit sur un clip ----------
const menu = document.createElement('div'); menu.className = 'ctx glass'; menu.hidden = true; document.body.append(menu);
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-t]'); if (!el) return;
  e.preventDefault();
  const c = clips.find((x) => x.token === el.dataset.t); if (!c) return;
  menu.innerHTML = `<b>${esc(c.name)}</b><button data-m="open">▶ Ouvrir</button>${c.image ? '<button data-m="copy">📋 Copier l’image</button>' : '<button data-m="discord">📤 Envoyer sur Discord</button><button data-m="link">🔗 Copier un lien de partage</button><button data-m="vertical">📱 Exporter en vertical</button><button data-m="export">⬇ Exporter en MP4</button>'}<button data-m="fav">${c.fav ? '⭐ Retirer des favoris' : '⭐ Ajouter aux favoris'}</button><button data-m="rename">✏ Renommer</button><button data-m="folder">📁 Afficher dans le dossier</button><hr><button data-m="delete" class="danger">🗑 Supprimer</button>`;
  menu.hidden = false;
  menu.style.left = `${Math.min(e.clientX, innerWidth - menu.offsetWidth - 8)}px`; menu.style.top = `${Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)}px`;
  menu.onclick = async (ev) => {
    const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
    menu.hidden = true; cur = c;
    if (m === 'open') openViewer(c);
    else if (m === 'discord') shareDiscord(c);
    else if (m === 'copy') toast((await api.copy(c.token)) ? '📋 Image copiée' : 'Copie impossible');
    else if (m === 'export') { const r = await clipAction(c, () => api.exportMp4(c.token)); if (!r?.cancelled) toast(r?.ok ? '⬇ Exporté en MP4' : r?.error ?? 'Export impossible'); }
    else if (m === 'fav') { await api.fav(c.token); load(); }
    else if (m === 'rename') ask('✏ Renommer le clip', `<input type="text" id="mName" maxlength="80" value="${esc(c.name)}">`, async () => { await api.rename(c.token, $('mName').value); load(); });
    else if (m === 'folder') api.open(c.token, 'folder');
    else if (m === 'link') shareLink(c);
    else if (m === 'vertical') vertical(c);
    else if (m === 'delete') confirmDelete(c);
  };
});
addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) menu.hidden = true; }, true);
addEventListener('blur', (e) => { if (e.target === window) menu.hidden = true; });
addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });

// Petite fenêtre : ok() pour « Valider », pick(valeur) pour les boutons data-to
function ask(title, html, ok, pick) {
  $('modalBox').innerHTML = `<div class="vhead"><h2>${title}</h2><button type="button" class="x" data-close>✕</button></div>${html}${ok ? '<div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn play" id="mOk">Valider</button></div>' : ''}`;
  $('modal').showModal();
  let submitted = false;
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('[data-to]'), confirm = e.target.id === 'mOk';
    if ((!confirm && !b) || submitted) return;
    submitted = true; $('modal').close();
    try { if (confirm) await ok?.(); else await pick?.(b.dataset.to); }
    catch (err) { toast(`Impossible : ${err.message ?? 'réessaie'}`); }
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
  if (r?.ok) return done((await api.account())?.compte);
  if (r?.noLauncher) { $('pairText').innerHTML = 'History Launcher n’est pas installé sur ce PC : connecte-toi avec ton e-mail, ou avec un code depuis un autre PC.'; $('pairCode').textContent = '—'; }
  else $('pairText').textContent = r?.error ?? 'Connexion pas validée : ouvre History Launcher et connecte-toi, puis réessaie.';
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
api.onAccount(async () => { compte = (await api.account())?.compte ?? null; paintProfile(); if (compte) { $('auth').hidden = true; if (view === 'reglages') paintSettings(); } });

// ---------- Réglages ----------
const THEMES = { jaune: '#ffc233', bleu: '#2f8bff', rouge: '#ff4d5e', violet: '#b36bff', vert: '#2ee07a', rose: '#ff5fb4' };
function pane(p) { document.querySelectorAll('#setnav button').forEach((b) => b.classList.toggle('on', b.dataset.p === p)); document.querySelectorAll('.pane').forEach((x) => x.classList.toggle('on', x.dataset.p === p)); }
$('setnav').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) pane(b.dataset.p); });
async function paintSettings() {
  settings = await api.settings() ?? settings;
  const s = settings;
  $('sReplay').checked = s.replay; $('sSeconds').value = String(s.seconds); $('sHeight').value = String(s.height); $('sFps').value = String(s.fps);
  $('sAudio').checked = s.audio; $('sMic').checked = Boolean(s.mic); $('sMicVol').value = String(s.micVol ?? 100); $('oMicVol').textContent = `${s.micVol ?? 100} %`; $('sSound').checked = s.sound; $('sOnlyGame').checked = s.onlyGame; $('sPriority').checked = s.gamePriority; $('sAuto').checked = s.autostart;
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
$('sMicVol').addEventListener('input', (e) => { $('oMicVol').textContent = `${e.target.value} %`; });
$('sMicVol').addEventListener('change', (e) => setP({ micVol: Number(e.target.value) }, '🎙 Volume du micro enregistré'));
for (const [id, k] of [['sMic', 'mic'], ['sAudio', 'audio'], ['sSound', 'sound'], ['sOnlyGame', 'onlyGame'], ['sPriority', 'gamePriority'], ['sAuto', 'autostart']]) $(id).addEventListener('change', (e) => setP({ [k]: e.target.checked }, '✅ Réglage enregistré'));
$('sSource').addEventListener('click', async (e) => { const b = e.target.closest('[data-val]'); if (b) { await setP({ source: b.dataset.val }, b.dataset.val === 'game' ? '🎮 Seul le jeu sera filmé' : '🖥 Tout l’écran sera filmé'); paintSettings(); } });
$('sPreset').addEventListener('click', async (e) => {
  const v = e.target.closest('[data-val]')?.dataset.val; if (!v) return;
  await setP({ perf: { height: 720, fps: 30 }, eq: { height: 1080, fps: 60 }, qual: { height: 1440, fps: 60 } }[v], '⚡ Réglage appliqué'); paintSettings();
});
$('themes').addEventListener('click', async (e) => { const b = e.target.closest('[data-theme]'); if (!b) return; document.body.dataset.theme = b.dataset.theme; await setP({ theme: b.dataset.theme }); paintSettings(); });
$('sPick').addEventListener('click', async () => { const d = await api.pickFolder(); if (d) { $('sDir').textContent = d; load(); } });
$('sOpenDir').addEventListener('click', () => api.root());
$('openSite').addEventListener('click', () => api.site());
// Avis : note, commentaire et capture facultatifs, ajoutés au bandeau des avis du site
$('openReview').addEventListener('click', () => {
  let stars = 0; let img = null;
  $('modalBox').innerHTML = `<h2>⭐ Ton avis sur History Clips</h2><p class="fine">Il s’affichera sur le site, avec ton pseudo.</p>
    <div class="rvstars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-rv="${n}">★</button>`).join('')}</div>
    <textarea id="rvText" maxlength="500" rows="3" placeholder="Ton commentaire (facultatif)"></textarea>
    <label class="btn sm">🖼 Ajouter une capture (facultatif)<input type="file" id="rvImg" accept="image/png,image/jpeg,image/webp" hidden></label> <small class="fine" id="rvInfo"></small>
    <div class="row"><button type="button" class="btn" data-rvx="1">Annuler</button><button type="button" class="btn play" id="rvSend">Envoyer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rv) { stars = Number(b.dataset.rv); $('modalBox').querySelectorAll('[data-rv]').forEach((x) => x.classList.toggle('on', Number(x.dataset.rv) <= stars)); return; }
    if (b.dataset.rvx) return $('modal').close();
    if (b.id === 'rvSend') {
      if (!stars) return toast('Choisis une note de 1 à 5 étoiles');
      const r = await api.review(stars, $('rvText').value, img);
      if (r?.ok) { $('modal').close(); toast('Merci pour ton avis ! Il est sur le site 🙏'); } else toast(r?.error ?? 'Impossible pour l’instant');
    }
  };
  $('rvImg').onchange = async () => {
    const f = $('rvImg').files[0]; if (!f) return;
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); img = c.toDataURL('image/jpeg', 0.82);
    $('rvInfo').textContent = `✓ ${f.name}`;
  };
});
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
let askedVersion = null;
function paintUpdate(u) {
  if (!u) return;
  if (u.state === 'available' && askedVersion !== u.version) {
    askedVersion = u.version; $('updDlgTitle').textContent = `🎉 History Clips ${u.version} est disponible`;
    $('updDlgNotes').textContent = u.notes || 'Nouveautés et corrections. Tes clips et tes réglages sont conservés.';
    if (!$('updDlg').open) $('updDlg').showModal();
  }
  $('updPill').hidden = !['available', 'ready', 'error'].includes(u.state);
  $('updPill').textContent = u.state === 'error' ? '↻ Réessayer la mise à jour' : u.state === 'ready' ? `⬆ Redémarrer pour la v${u.version}` : `⬆ Mettre à jour (v${u.version})`;
  $('updScreen').hidden = !(['progress', 'preparing', 'installing'].includes(u.state) && u.now);
  $('updTitle').textContent = `Mise à jour v${u.version ?? ''}`; $('updFill').style.width = `${u.percent ?? 0}%`; $('updText').textContent = u.state === 'preparing' ? 'Fin des exports en cours et fermeture de l’enregistreur…' : u.state === 'installing' ? 'Ouverture de l’installateur History Clips…' : `Téléchargement… ${u.percent ?? 0} %`;
  $('updCheck').disabled = ['checking', 'progress', 'preparing', 'installing'].includes(u.state);
  $('updStatus').textContent = { checking: 'Recherche…', uptodate: '✅ Tu as la dernière version.', available: `Nouvelle version v${u.version} disponible.`, progress: `Téléchargement ${u.percent ?? 0} %…`, ready: `v${u.version} prête : elle s’installe au redémarrage.`, preparing: 'Préparation : les exports en cours sont conservés.', installing: 'Installation en cours…', error: `Mise à jour interrompue : ${u.error ?? ''}. Réessaie avec le bouton en haut. Si l’installateur indique « anciens fichiers : 2 », quitte Clips depuis son icône près de l’horloge puis relance l’installateur. Si cela persiste, redémarre Windows avant de réessayer.` }[u.state] ?? 'Les mises à jour s’installent toutes seules.';
}
$('updPill').addEventListener('click', () => api.updNow());
$('updYes').addEventListener('click', () => { $('updDlg').close(); api.updNow(); });
$('updLater').addEventListener('click', () => { $('updDlg').close(); api.updLater(); toast('⬆ Téléchargement en arrière-plan ; installation après fermeture de Clips'); });
$('updCheck').addEventListener('click', async () => { const r = await api.updCheck(); if (r?.dev) $('updStatus').textContent = 'Version développeur : pas de mise à jour automatique.'; });
api.onUpdate(paintUpdate);

(async () => {
  settings = await api.settings() ?? {}; paintPill();
  const a = await api.account().catch(() => null); compte = a?.compte ?? null; paintProfile();
  if (!compte && !a?.skipped) openAuth();
  paintUpdate(await api.updGet());
  load();
})();

initQuickSupport(api, 'clips');
