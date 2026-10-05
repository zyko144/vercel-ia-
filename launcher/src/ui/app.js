import { initQuickSupport } from './quick-support.js';
import { initPersonal } from './personal.js';
import { cachedTask } from '../core/personal.js';
import { initSettings } from './settings.js';
import { initMore } from './more.js';
import { scamCheck } from '../core/friendsync.js';
// Interface du launcher : accueil (bannière, plus joués, applis, recommandations), bibliothèque, statistiques,
// assistant IA et lecteur de musique. Toutes les images sont les images officielles trouvées par le launcher.
import { filterSort } from '../core/sort.js';

const $ = (id) => document.getElementById(id);
let demoVerify = null; // aperçu hors Electron seulement
const api = window.launcher ? { ...window.launcher } : demoApi(); // hors Electron (aperçu dans un navigateur) : données d'exemple
const CROS = api.platform === 'linux'; // Chromebook : pas d'outils Windows (Mon PC, Optimisation, overlays)
if (CROS) document.documentElement.classList.add('cros');
const state = { items: [], sources: {}, sel: null, active: new Set(), view: 'accueil', list: { sort: 'joues', kind: 'tout', source: 'tout', installed: 'tout', q: '' }, period: 'semaine', rank: 'tout', profile: 'Joueur', music: null, recos: [], free: [], deals: [], cols: {}, friends: null, hist: null, events: [], ftab: 'history', song: null, account: null };
let personal = null;
let moreUi = null; // 0.54 : vérifications, fiche enrichie, collections par genre (ui/more.js)
const readProgress = cachedTask(() => api.progress?.(), 30000);
const readPc = cachedTask(() => api.pc?.(), 1500);
const sidebar = { hiddenPlatforms: [], hiddenNav: [] }; // menu de gauche personnalisé (sur ce compte)
let boostGames = {}; // opti auto par jeu : id -> true (toujours) | false (jamais)
const unread = {}; // messages d'amis non lus (id -> nombre)
const gUnread = {}; // messages de groupe non lus (id groupe -> nombre)
let chatWith = null; // discussion ouverte
let callS = null; // appel en cours
let ringing = null; // appel qui sonne

// ---------- Formats ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Adresse d'image pour un attribut style="…" : entre apostrophes, sans aucun guillemet (rien ne peut sortir de l'attribut)
const url = (u) => `url('${String(u).replace(/["'\\\n<>]/g, '')}')`;
const hours = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.round(min / 60).toLocaleString('fr-FR')} h`);
const size = (b) => (!b ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`);
function ago(t) {
  if (!t) return 'Jamais';
  const d = (Date.now() - t) / 86_400_000;
  if (d < 1 && new Date(t).getDate() === new Date().getDate()) return 'Aujourd’hui';
  if (d < 2) return 'Hier';
  if (d < 30) return `Il y a ${Math.round(d)} j`;
  if (d < 365) return `Il y a ${Math.round(d / 30)} mois`;
  return `Il y a ${Math.round(d / 365)} an${d >= 730 ? 's' : ''}`;
}
const CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const BRANDS = { spotify: '#1ed760', deezer: '#a238ff', discord: '#5865f2', 'google chrome': '#fbbc04', chrome: '#fbbc04', 'obs studio': '#8f7cff', netflix: '#e50914', twitch: '#9146ff', whatsapp: '#25d366', telegram: '#2aabee', vlc: '#ff8800', capcut: '#ffffff' };
const CATEGORY_COLORS = { musique: '#b36bff', video: '#ff4d5e', discussion: '#7b86ff', appli: '#5fe0c8' };
const colorOf = (i) => (i.brand?.color ?? (i.kind === 'game' ? state.sources[i.source]?.color : BRANDS[String(i.name).toLowerCase()] ?? CATEGORY_COLORS[i.category])) ?? '#9aa0aa';
const srcIcon = (i) => state.sources[i.source]?.logo ?? state.sources[i.source]?.icon;

// Toasts, barre d'appel, sonnerie : dans la « couche du dessus » du navigateur (popover), réaffichés après
// chaque fenêtre ouverte pour ne jamais passer dessous
function raiseTop() {
  const t = $('toast');
  for (const [el, show] of [[$('callBar'), Boolean(callS)], [$('ringBox'), Boolean(ringing)], [t, t.classList.contains('on')]]) {
    if (!el?.showPopover) continue;
    try { if (el.matches(':popover-open')) el.hidePopover(); if (show) el.showPopover(); } catch { /* pas encore dans la page */ }
  }
}
// Une fenêtre (dialog) qui s'ouvre passe devant : on remet la barre d'appel, la sonnerie et le toast au-dessus
new MutationObserver((list) => { if (list.some((m) => m.target.open)) requestAnimationFrame(raiseTop); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
/** Copie dans le presse-papiers (par l'appli ; dans un navigateur, par l'API du navigateur). */
function copyText(text) {
  const t = String(text ?? '');
  if (api.copy) return api.copy(t).catch(() => false);
  return navigator.clipboard?.writeText(t).then(() => true).catch(() => false) ?? Promise.resolve(false);
}
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch { /* aperçu sans popover */ }
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- Images officielles : jaquette, sinon logo sur fond, sinon icône de l'appli ----------
// Grosse appli : fond aux couleurs de la marque et logo officiel net (sinon son icône en grand)
const brandMark = (item, cls) => (item.brand?.logo ? `<img class="${cls} brandlogo" src="${esc(item.brand.logo)}" alt="">`
  : item.art?.icon || item.iconData ? `<img class="${cls}" src="${esc(item.art?.icon ?? item.iconData)}" alt="">` : null);
function art(item) {
  if (item.brand?.bg) return `<div class="art"><div class="bgl brandimg" style="background-image:url('${esc(item.brand.bg)}')"></div></div>`;
  if (item.brand && (item.kind !== 'game' || !(item.art?.cover || item.art?.hero || item.art?.header))) {
    return `<div class="art"><div class="bgl brandbg" style="--b:${esc(item.brand.color)}"></div><div class="front show">${brandMark(item, 'appicon') ?? `<span class="letter">${esc((item.name ?? '?')[0].toUpperCase())}</span>`}</div></div>`;
  }
  const a = item.art ?? {};
  const bg = a.hero ?? a.header ?? a.cover ?? null;
  const back = bg ? `<div class="bgl" style="background-image:${url(bg)}"></div>` : '<div class="bgl none"></div>';
  const inner = a.logo ? `<img class="logo" loading="lazy" decoding="async" src="${esc(a.logo)}" alt="">`
    : a.header ? `<img class="banner" src="${esc(a.header)}" alt="">`
      : a.icon || item.iconData ? `<img class="appicon" src="${esc(a.icon ?? item.iconData)}" alt="">`
        : `<span class="letter">${esc((item.name ?? '?')[0].toUpperCase())}</span>`;
  const cover = a.cover ? `<img class="cov" src="${esc(a.cover)}" alt="" loading="lazy">` : '';
  return `<div class="art">${back}${cover}<div class="front ${a.cover ? '' : 'show'}">${inner}</div></div>`;
}
// Image introuvable : on passe au plan suivant (logo → bannière → icône → initiale)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const host = img.closest('[data-id]');
  const item = state.items.find((i) => i.id === host?.dataset.id) ?? (img.closest('#hero') ? state.sel : null);
  if (img.classList.contains('cov')) {
    const alt = item?.art?.coverAlt;
    if (alt && img.getAttribute('src') !== alt) { img.src = alt; return; } // adresse de secours avant l'initiale
    img.parentElement.querySelector('.front')?.classList.add('show'); img.remove(); return;
  }
  if (img.classList.contains('hlogo')) { img.replaceWith(Object.assign(document.createElement('h1'), { className: 'htitle', textContent: item?.name ?? '' })); return; }
  if (!item || !img.closest('.front')) { img.removeAttribute('src'); img.style.visibility = 'hidden'; return; }
  const next = img.classList.contains('logo') && item.art?.header ? `<img class="banner" src="${esc(item.art.header)}" alt="">`
    : (img.classList.contains('logo') || img.classList.contains('banner')) && (item.iconData || item.art?.icon) ? `<img class="appicon" src="${esc(item.art?.icon ?? item.iconData)}" alt="">`
      : `<span class="letter">${esc((item.name ?? '?')[0].toUpperCase())}</span>`;
  img.outerHTML = next;
}, true);

// ---------- Barre de gauche ----------
function renderPlatforms() {
  const counts = {};
  for (const i of state.items) if (!i.hidden && i.kind === 'game') counts[i.source] = (counts[i.source] ?? 0) + 1;
  for (const k of sidebar.hiddenPlatforms) delete counts[k];
  $('platforms').innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const s = state.sources[k] ?? { label: k, color: '#999' };
    // Logo officiel net sur la couleur de la plateforme (PC = Windows)
    const logo = s.logo ? `<span class="pdot plogo" style="background:${esc(s.bg ?? s.color)}"><img src="${esc(s.logo)}" alt=""></span>`
      : s.icon ? `<img src="${esc(s.icon)}" alt="">` : `<span class="pdot" style="background:${esc(s.color)}">${esc(s.label[0])}</span>`;
    return `<button data-platform="${esc(k)}" class="${state.view === 'liste' && state.list.source === k ? 'on' : ''}">${logo}${esc(s.label)}<em>${n}</em></button>`;
  }).join('');
  if (typeof renderCollections === 'function') renderCollections();
}

// ---------- Accueil ----------
const games = () => state.items.filter((i) => i.kind === 'game' && !i.hidden);
const apps = () => state.items.filter((i) => i.kind !== 'game' && !i.hidden);

// Grand fond du jeu : la meilleure image qui charge vraiment (grand fond, adresse de secours, fond du magasin,
// bannière, jaquette). Une petite image n'est jamais étirée : elle est posée nette sur un fond flou.
const imgProbe = new Map();
function probeImg(u) {
  if (!imgProbe.has(u)) imgProbe.set(u, new Promise((res) => { const im = new Image(); im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ ok: false }); im.src = u; }));
  return imgProbe.get(u);
}
async function bestBackdrop(i) {
  const a = i.art ?? {};
  const big = window.innerWidth * (window.devicePixelRatio || 1) > 2200;
  const list = [big ? a.hero2x : null, a.hero, a.heroAlt, i.details?.background, a.header, a.headerAlt, a.cover, a.coverAlt].filter((u, n, all) => u && all.indexOf(u) === n);
  for (const u of list) { const r = await probeImg(u); if (r.ok && r.w >= 120) return { u, ...r }; }
  return null;
}
async function paintHeroBg(i) {
  const el = document.querySelector(`#hero [data-hbg="${CSS.escape(i.id)}"]`);
  if (!el) return;
  const b = await bestBackdrop(i);
  if (!el.isConnected || state.sel?.id !== i.id) return;
  if (!b) { el.classList.add('blur'); el.style.backgroundImage = i.art?.icon || i.iconData ? url(i.art?.icon ?? i.iconData) : 'none'; return; }
  const wide = b.w / b.h >= 2.3 && b.w >= 1400;
  el.classList.toggle('low', !wide);
  el.style.backgroundImage = url(b.u);
  el.innerHTML = wide ? '' : `<div class="hfit" style="background-image:${url(b.u)}"></div>`;
  el.classList.add('ready');
  moreUi?.heroTrailer(i, el);
  if (!i.brand?.bg) $('ambient').style.setProperty('--amb', url(i.art?.header ?? i.art?.cover ?? b.u)); // fond flou : une petite image suffit
}
function renderHero() {
  const i = state.sel;
  const hero = $('hero');
  if (!i) { hero.innerHTML = '<h1 class="htitle">Ta bibliothèque se remplit…</h1>'; return; }
  const a = i.art ?? {};
  const bg = a.hero ?? a.heroAlt ?? i.details?.background ?? a.header ?? a.cover ?? null;
  const isApp = i.kind !== 'game';
  const amb = i.brand?.bg ?? bg ?? a.cover ?? null;
  $('ambient').style.setProperty('--amb', amb ? url(amb) : 'none');
  $('ambient').classList.toggle('on', Boolean(amb) && document.body.dataset.ambient !== 'off');
  document.body.dataset.theme = isApp && i.category === 'musique' ? 'musique' : 'jeu';
  const title = i.brand && isApp && brandMark(i, 'happicon') ? brandMark(i, 'happicon') : a.logo ? `<img class="hlogo" src="${esc(a.logo)}" alt="${esc(i.name)}">`
    : isApp && (a.icon || i.iconData) ? `<img class="happicon" src="${esc(a.icon ?? i.iconData)}" alt="">` : `<h1 class="htitle">${esc(i.name)}</h1>`;
  const src = state.sources[i.source];
  const d = i.details ?? {};
  const ach = d.achievements ? `<dt>Succès</dt><dd>${d.achievements.done} / ${d.achievements.total}</dd>` : '';
  const live = state.active.has(i.id); // déjà lancé : pas de 2e lancement, « En cours » en vert
  const upd = !live && i.installed && i.updatePending && i.source === 'steam'; // mise à jour du jeu faite depuis le launcher
  const main = live ? 'En cours' : upd ? '⟳ Mettre à jour' : i.installed ? (isApp ? 'Ouvrir' : 'Jouer') : 'Installer';
  hero.innerHTML = `
    ${i.brand?.bg ? `<div class="hbg brandimg" style="background-image:url('${esc(i.brand.bg)}')"></div>` : i.brand && isApp ? `<div class="hbg brandbg" style="--b:${esc(i.brand.color)}"></div>` : bg ? `<div class="hbg" data-hbg="${esc(i.id)}"></div>` : `<div class="hbg blur" style="background-image:${a.icon || i.iconData ? url(a.icon ?? i.iconData) : 'none'}"></div>`}
    ${title}
    <div class="hbottom">
      <div class="playbtn"><button class="main${live ? ' live' : upd ? ' upd' : ''}" data-action="${upd ? 'update' : i.installed ? 'launch' : 'install'}"${live ? ' disabled' : ''}>${main}</button><button class="more" id="moreBtn" title="Plus d’actions">▾</button></div>${i.installed && !isApp && !live ? '<button class="optiplay" data-action="optiplay" title="Vérifie ton PC et prépare la partie (tout est remis comme avant à la fin)"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>Optimiser</button>' : ''}
      <div class="hstat"><small>${CLOCK}${isApp ? 'Temps d’utilisation' : 'Temps de jeu'}</small><b>${hours(i.minutes)}</b><em class="tsrc" title="D’où vient ce temps">${esc(timeSource(i))}</em></div>
      <div class="hstat"><small>${CLOCK}Dernière session</small><b>${state.active.has(i.id) ? '<span class="ok">En cours</span>' : ago(i.lastPlayed)}</b></div>
    </div>
    <div class="hinfo">
      <dl>
        <dt>Plateforme</dt><dd>${src?.logo || src?.icon ? `<img src="${esc(src.logo ?? src.icon)}" alt="">` : ''}${esc(src?.label ?? 'PC')}</dd>
        <dt>Statut</dt><dd>${i.installed ? '<span class="ok">● Installé</span>' : 'Non installé'}</dd>
        <dt>Taille</dt><dd>${size(i.size)}</dd>
        ${ach}
        ${d.developers?.[0] ? `<dt>Studio</dt><dd>${esc(d.developers[0])}</dd>` : ''}
      </dl>
      <div class="thumbs">${(d.screenshots ?? []).slice(0, 3).map((s) => `<img src="${esc(s)}" alt="">`).join('')}<button data-sheet="1" title="Fiche complète">•••</button></div>
    </div>`;
  paintHeroBg(i);
}

// Menu d'actions d'un jeu ou d'une appli : bouton ▾ du grand bandeau ET clic droit partout
function menuFor(i) {
  const isApp = i.kind !== 'game';
  const m = [];
  if (!state.active.has(i.id)) m.push(`<button data-action="${i.installed ? 'launch' : 'install'}" class="primary">${i.installed ? (isApp ? '▶ Ouvrir' : '▶ Jouer') : '⬇ Installer'}</button>`);
  if (state.active.has(i.id)) m.push('<button data-action="close">■ Fermer</button>');
  if (i.updatePending) m.push(`<button data-action="update">⟳ Mettre à jour${i.updateBytes ? ` (${size(i.updateBytes)})` : ''}</button>`);
  m.push('<hr>');
  m.push(`<button data-set="favorite">${i.favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>`);
  m.push('<button data-cols="1">📚 Collections…</button>');
  m.push('<button data-sheet="1">≡ Fiche complète</button>');
  if (i.installed && i.installDir) m.push('<button data-action="folder">📁 Ouvrir le dossier</button>');
  if (i.installed && ['steam', 'epic'].includes(i.source)) m.push('<button data-action="verify">🛠 Vérifier et réparer les fichiers</button>');
  if (i.installed && i.source === 'steam' && i.kind === 'game') m.push('<button data-action="cache">🧹 Vider le cache du jeu</button>');
  if (i.installed && i.installDir && i.kind === 'game') m.push('<button data-mods="1">🧩 Mods du jeu</button>');
  if (i.source === 'steam') m.push('<button data-action="store">🛈 Page du magasin</button>');
  if (i.kind === 'game') {
    const fin = Object.values(state.cols).find((c) => c.name === 'À finir');
    m.push(`<button data-tofinish="1">${fin?.items.includes(i.id) ? '🏁 Retirer de « À finir »' : '🏁 Ajouter à « À finir »'}</button>`);
    m.push('<button data-tools="1">🎛 Outils du jeu (profil, sauvegardes, FPS…)</button>');
    if (i.steamId) m.push('<button data-reqs="1">✅ Mon PC peut-il le faire tourner ?</button>');
    m.push('<button data-tips="1">🤖 Conseils de l’IA pour ce jeu</button>');
    m.push('<button data-invgame="1">📨 Inviter un ami à y jouer</button>');
    if (i.installed && i.installDir) m.push('<button data-modscan="1">🛡 Analyser les mods (antivirus)</button>');
    if (i.source === 'steam' && i.steamId) m.push('<button data-gift="1">🎁 Offrir ce jeu à un ami</button>');
    const g = boostGames[i.id];
    m.push(`<button data-boostgame="${g === true ? 'off' : g === false ? 'auto' : 'on'}">${g === true ? '⚡ Opti auto : toujours (changer → jamais)' : g === false ? '⚡ Opti auto : jamais (changer → par défaut)' : '⚡ Toujours optimiser ce jeu'}</button>`);
  }
  if (i.source === 'steam' && String(i.steamId) === '4000') m.push('<button data-gmod="1">🧩 Addons Garry’s Mod</button>');
  if (i.source === 'fivem') m.push('<button data-fivemsrv="1">🌐 Mes serveurs FiveM</button><button data-fivem="1">🔗 Rejoindre un serveur…</button>');
  if (i.custom) m.push('<button data-rename="1">✏ Renommer</button>');
  m.push('<hr>');
  m.push(`<button data-set="hidden">${i.hidden ? '◉ Afficher dans la bibliothèque' : '◌ Masquer de la bibliothèque'}</button>`);
  if (i.custom) m.push('<button data-remove="1" class="danger">✕ Retirer de la bibliothèque</button>');
  if (i.installed && (i.uninstallCmd || ['steam', 'epic'].includes(i.source))) m.push('<button data-action="uninstall" class="danger">🗑 Désinstaller</button>');
  return m.join('');
}
function openCtx(item, x, y, anchor = null) {
  if (!item) return;
  const rect = anchor?.getBoundingClientRect();
  if (state.sel !== item) { state.sel = item; if (state.view === 'accueil') renderHero(); }
  const ctx = $('ctx');
  ctx.innerHTML = `<div class="ctxhead">${esc(item.name)}</div>${menuFor(item)}`;
  ctx.hidden = false;
  const w = ctx.offsetWidth; const h = ctx.offsetHeight;
  const vw = window.innerWidth; const vh = window.innerHeight;
  let left = x; let top = y;
  if (rect) { left = rect.left; top = rect.bottom + 8 + h > vh ? rect.top - h - 8 : rect.bottom + 8; }
  ctx.style.left = `${Math.max(8, Math.min(left, vw - w - 8))}px`;
  ctx.style.top = `${Math.max(8, Math.min(top, vh - h - 8))}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
}
const hideCtx = () => { $('ctx').hidden = true; };
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-id]');
  if (!el || el.closest('dialog')) return;
  const item = state.items.find((i) => i.id === el.dataset.id);
  if (!item) return;
  e.preventDefault();
  openCtx(item, e.clientX, e.clientY);
});
// Fermé quand la fenêtre perd le focus, change de taille ou que la page défile (jamais pendant un clic dans le menu)
window.addEventListener('blur', hideCtx);
window.addEventListener('resize', hideCtx);
$('main').addEventListener('scroll', hideCtx, { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); });

// Fenêtres du launcher (confirmation, saisie) : même style partout, jamais les fenêtres grises de Windows
// Taille de la fenêtre commune : chaque ouverture repart de la taille normale (sauf si elle demande « large »)
function setModal(...cls) { $('modalBox').classList.remove('wide', 'fp', 'procardbox', 'ratebox', 'sellbox'); if (cls.length) $('modalBox').classList.add(...cls); }
const ui = {
  confirm({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false, icon = '⚠️', list = [] }) {
    window.sfx?.play('pop');
    return new Promise((resolve) => {
      setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon ${danger ? 'danger' : ''}">${esc(icon)}</span><h2>${esc(title)}</h2></div>
        ${text ? `<p class="mtext">${esc(text).replace(/\n/g, '<br>')}</p>` : ''}
        ${list.length ? `<ul class="mlist">${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <div class="row end"><button type="button" class="btn ghost" data-m="0">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'dangerbtn' : 'play'}" data-m="1">${esc(ok)}</button></div>`;
      const dlg = $('modal');
      const done = (v) => { dlg.close(); resolve(v); };
      $('modalBox').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) done(b.dataset.m === '1'); };
      dlg.oncancel = (e) => { e.preventDefault(); done(false); };
      dlg.showModal();
      $('modalBox').querySelector('[data-m="1"]').focus();
    });
  },
  prompt({ title, text = '', value = '', placeholder = '', ok = 'Valider', icon = '✏️' }) {
    return new Promise((resolve) => {
      setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">${esc(icon)}</span><h2>${esc(title)}</h2></div>
        ${text ? `<p class="mtext">${esc(text)}</p>` : ''}
        <input class="minput" id="mInput" maxlength="80" placeholder="${esc(placeholder)}" value="${esc(value)}">
        <div class="row end"><button type="button" class="btn ghost" data-m="0">Annuler</button><button type="button" class="btn play" data-m="1">${esc(ok)}</button></div>`;
      const dlg = $('modal');
      const done = (v) => { dlg.close(); resolve(v); };
      $('modalBox').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) done(b.dataset.m === '1' ? $('mInput').value.trim() || null : null); };
      $('mInput').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done($('mInput').value.trim() || null); } };
      dlg.oncancel = (e) => { e.preventDefault(); done(null); };
      dlg.showModal();
      $('mInput').select();
    });
  },
};
api.onAsk?.(async (q) => api.answer(q.id, await ui.confirm(q)));
api.onAppError?.((m) => toast(`⚠️ ${m}`));
api.onCols?.((c) => { state.cols = c ?? {}; renderCollections(); });
if (!window.launcher) window.hlui = ui; // aperçu dans un navigateur (bancs d'essai)

// D'où vient le temps affiché (pour savoir qu'il est réel)
function timeSource(i) {
  if (i.steamTimes && Object.keys(i.steamTimes).length) return 'Steam (officiel)';
  if (i.timeFromLogs) return `journaux FiveM · ${i.sessionsCount ?? 0} session${(i.sessionsCount ?? 0) > 1 ? 's' : ''}`;
  if (!i.minutes) return '';
  return 'suivi par History';
}
function card(i, cls = 'gcard') {
  const live = state.active.has(i.id);
  const icon = srcIcon(i);
  return `<div class="${cls} ${i.installed ? '' : 'off'} ${state.sel?.id === i.id ? 'sel' : ''}" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}">
    ${art(i)}${icon ? `<img class="srcicon" loading="lazy" decoding="async" src="${esc(icon)}" alt="">` : ''}
    ${live ? '<span class="badge live">En cours</span>' : !i.installed ? '<span class="badge">Non installé</span>' : i.updatePending ? '<span class="badge upd">Mise à jour</span>' : ''}
    <div class="meta"><b>${esc(i.name)}</b><small>${CLOCK}${hours(i.minutes)}</small></div></div>`;
}

// Disque presque plein : quels jeux oubliés libérer (en verre rouge)
let diskAlerts = [];
function renderDiskAlert() {
  const el = $('diskAlert'); if (!el) return;
  el.innerHTML = diskAlerts.map((a) => `<div class="adv ${a.critical ? 'p0' : 'p1'} diskadv"><div><b>💽 Disque ${esc(a.drive)} presque plein : ${gb(a.free)} libres sur ${gb(a.total)}</b><small>${a.idle.length ? 'Ces jeux n’ont pas été lancés depuis plus de 3 mois :' : 'Les jeux risquent de ne plus pouvoir se mettre à jour. Libère de la place (Mon PC › Stockage).'}</small>
    ${a.idle.length ? `<div class="diskidle">${a.idle.map((i) => `<span>${esc(i.name)} · ${gb(i.size)}<button type="button" class="btn ghost sm" data-uninst="${esc(i.id)}">Désinstaller</button></span>`).join('')}</div>` : ''}</div></div>`).join('');
}
api.onDiskAlerts?.((d) => { diskAlerts = d ?? []; renderDiskAlert(); });
$('diskAlert').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-uninst]'); if (!b) return;
  const r = await api.action(b.dataset.uninst, 'uninstall');
  if (r?.ok) { toast('Jeu désinstallé'); api.diskAlerts?.().then((d) => { diskAlerts = d ?? []; renderDiskAlert(); }).catch(() => {}); } else if (r?.error) toast(r.error);
});
setTimeout(() => api.diskAlerts?.().then((d) => { diskAlerts = d ?? []; renderDiskAlert(); }).catch(() => {}), 4000);
function renderHome() {
  personal?.render();
  const top = filterSort(games(), { sort: 'joues' }).slice(0, 6);
  $('topGames').innerHTML = top.length ? top.map((i) => card(i)).join('') : '<div class="empty">Aucun jeu trouvé pour l’instant.</div>';
  // Applis de l'accueil : les connues ou utilisées (filterSort les filtre déjà), les plus utilisées d'abord
  const a = filterSort(apps().filter((i) => i.kind === 'app'), { sort: 'joues' }).slice(0, 6);
  $('topApps').innerHTML = a.length ? a.map((i) => {
    const icon = i.art?.icon ?? i.iconData;
    const status = state.active.has(i.id) ? '<small class="inuse">En cours</small>' : `<small>${i.minutes ? hours(i.minutes) : ago(i.lastPlayed)}</small>`;
    const mark = i.brand ? `<span class="ai brandbg" style="--b:${esc(i.brand.color)}">${brandMark(i, 'aimg') ?? esc(i.name[0])}</span>` : null;
    return `<div class="atile" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}">${mark ?? (icon ? `<img src="${esc(icon)}" alt="">` : `<span class="ai">${esc(i.name[0])}</span>`)}<div><b>${esc(i.name)}</b>${status}</div></div>`;
  }).join('') : '<div class="empty">Aucune application trouvée.</div>';
  renderRecos();
  renderUpdates();
  readProgress().then((p) => {
    const list = (p?.rediscover ?? []).map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
    $('rediscBlock').hidden = !list.length;
    $('rediscover').innerHTML = list.map((i) => card(i)).join('');
  }).catch(() => {});
}

function renderUpdates() {
  const list = state.items.filter((i) => i.updatePending && i.installed).slice(0, 6);
  $('updBlock').hidden = !list.length;
  $('updates').innerHTML = list.map((i) => `<div class="atile" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}">${i.art?.logo || i.art?.header ? `<img src="${esc(i.art.header ?? i.art.logo)}" alt="" class="wide">` : `<span class="ai">${esc(i.name[0])}</span>`}<div><b>${esc(i.name)}</b><small>Mise à jour en attente</small></div><button class="btn play" data-upd="${esc(i.id)}">Mettre à jour</button></div>`).join('');
}
function renderNews(list) {
  $('newsBlock').hidden = !list?.length;
  const day = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  $('news').innerHTML = (list ?? []).slice(0, 6).map((n) => `<div class="newscard" ${n.url ? `data-nurl="${esc(n.url)}"` : `data-news="${esc(n.appid)}" data-gid="${esc(n.gid)}"`}>
    ${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy">` : ''}<div><small>${esc(n.game)} · ${day(n.at)}${n.patch ? ' · <span class="upd">Mise à jour</span>' : ''}</small><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div></div>`).join('');
}

function renderDeals() {
  const list = state.deals.slice(0, 5);
  $('dealBlock').hidden = !list.length;
  $('deals').innerHTML = list.map((d) => `
    <div class="rcard free now" data-deal="${esc(d.appid)}">
      ${d.image ? `<img src="${esc(d.image)}" alt="" loading="lazy">` : ''}
      <span class="badge live">-${esc(d.pct)} %</span>
      <div class="meta"><b>${esc(d.name)}</b><small>${d.price ? `${esc(d.price)}${d.before ? ` <s>${esc(d.before)}</s>` : ''}` : 'En promo'}</small></div>
    </div>`).join('');
}

// ---------- Amis (deux panneaux) : liste à gauche, détail à droite ; onglets Amis / Groupes / Soirées en haut ----------
const FRIEND_HELP = {
  cle: 'La liste d’amis Steam n’est pas disponible ici : ajoute tes potes dans l’onglet History (code ami) pour voir à quoi ils jouent, les rejoindre et leur écrire.',
  prive: 'Ta liste d’amis Steam est privée : Steam › Profil › Modifier › Confidentialité › « Liste d’amis » en Public.',
  compte: 'Aucun compte Steam trouvé sur ce PC.',
  erreur: 'Steam ne répond pas pour l’instant. Réessaie dans un moment.',
};
async function loadFriends(force = false) {
  const r = await api.friends?.(force).catch(() => null);
  if (!r) return;
  state.friends = r;
  const online = r.friends.filter((f) => f.online).length;
  $('friendsOnline').textContent = online || '';
  if (!document.hidden && state.view === 'amis' && state.ftab === 'steam') renderFriends();
}

// Pastille d'un joueur : initiale sur une couleur tirée de son pseudo (toujours la même)
const hueOf = (t) => [...String(t ?? '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 360, 7);
// Photo de profil (ou initiale sur sa couleur) ; p = pseudo ou { pseudo, avatar, color }
const safeImg = (u) => (/^https:\/\/[\w.-]+\/api\/compte\/avatar\/[\w-]+\?v=\d+$/.test(String(u ?? '')) ? u : null);
function avStyle(p) {
  const name = typeof p === 'string' ? p : p?.pseudo;
  const img = typeof p === 'object' ? safeImg(p?.avatar) : null;
  const col = typeof p === 'object' && /^#[0-9a-f]{6}$/i.test(p?.color ?? '') ? p.color : null;
  const fc = typeof p === 'object' && /^#[0-9a-f]{6}$/i.test(p?.frameColor ?? '') ? p.frameColor : null;
  return { name, img, style: `--h:${hueOf(name)};${col ? `background-color:${col};` : ''}${fc ? `--fc:${fc};` : ''}${img ? `background-image:url('${img}');` : ''}` };
}
const avatar = (p, cls = '') => { const a = avStyle(p); const fr = typeof p === 'object' && p?.frame && !/fr-/.test(cls) ? ` fr-${p.frame}` : ''; return `<span class="pav ${a.img ? 'img' : ''} ${cls}${fr}" style="${a.style}">${a.img ? '' : esc(String(a.name ?? '?').trim()[0]?.toUpperCase() ?? '?')}</span>`; };
const avWrap = (p, st, cls = '') => `<span class="favw ${st}">${avatar(p, cls)}<i class="st"></i></span>`;
/** Met une photo de profil (ou l'initiale) dans un élément existant. */
function setAv(el, p) {
  if (!el) return;
  const a = avStyle(p);
  el.setAttribute('style', a.style);
  el.classList.toggle('img', Boolean(a.img));
  el.textContent = a.img ? '' : String(a.name ?? '?').trim()[0]?.toUpperCase() ?? '?';
}
const needLogin = '<div class="fxnote">Connecte-toi à ton compte History pour ajouter des amis, créer des groupes et organiser des soirées.<button class="btn play sm" data-login="1">Se connecter</button></div>';
const fx = { tab: 'amis', sel: null }; // sel : { type: 'ami' | 'steam' | 'groupe' | 'soiree' | 'nouvelleSoiree', id }
function fxTab(tab) {
  fx.tab = tab;
  document.querySelectorAll('#fxNav [data-fx]').forEach((b) => b.classList.toggle('on', b.dataset.fx === tab));
  document.querySelectorAll('#view-amis .fxpane').forEach((p) => { p.hidden = p.dataset.fx !== tab; });
  const keep = fx.sel && ({ amis: ['ami', 'steam'], groupes: ['groupe'], soirees: ['soiree', 'nouvelleSoiree'] })[tab].includes(fx.sel.type);
  if (!keep) fxShow(null);
}
function fxCounts() {
  const on = (state.hist?.amis ?? []).filter((a) => a.online).length;
  $('fxnAmis').textContent = on ? `${on} en ligne` : '';
  $('fxnGroupes').textContent = (state.hist?.groupes ?? []).length || '';
  $('fxnSoirees').textContent = (state.events ?? []).length || '';
}
const EMPTY = {
  amis: ['Choisis un ami', 'Sa discussion, ce à quoi il joue et les boutons pour le rejoindre ou l’appeler s’affichent ici.'],
  groupes: ['Choisis un groupe', 'Préviens tout le groupe d’un coup, ou annonce une partie sur Discord.'],
  soirees: ['Choisis une soirée', 'Ou clique « Organiser » : tes amis reçoivent l’invitation et un rappel 10 min avant.'],
};
/** Affiche le panneau de droite pour la sélection (ou l'écran vide de l'onglet). */
function fxShow(sel) {
  fx.sel = sel;
  $('fxChat').hidden = sel?.type !== 'ami';
  $('fxEventForm').hidden = sel?.type !== 'nouvelleSoiree';
  $('fxDetail').hidden = !['steam', 'soiree'].includes(sel?.type);
  $('fxGroup').hidden = sel?.type !== 'groupe';
  $('fxEmpty').hidden = Boolean(sel);
  if (!sel) { const [t, x] = EMPTY[fx.tab]; $('fxEmptyT').textContent = t; $('fxEmptyS').textContent = x; chatWith = null; }
  if (sel?.type !== 'ami') chatWith = null;
  if (sel?.type === 'steam') renderSteamDetail();
  if (sel?.type === 'groupe') openGroupChat(sel.id);
  if (sel?.type === 'soiree') renderEventDetail();
  document.querySelectorAll('#view-amis [data-fsel], #view-amis [data-gsel], #view-amis [data-esel], #view-amis [data-ssel]').forEach((el) => el.classList.toggle('sel', Boolean(sel) && (el.dataset.fsel ?? el.dataset.gsel ?? el.dataset.esel ?? el.dataset.ssel) === sel.id));
}
$('fxNav').addEventListener('click', (e) => { const b = e.target.closest('[data-fx]'); if (b) fxTab(b.dataset.fx); });

// Liste des amis Steam (même présentation que les amis History)
function renderFriends() {
  const r = state.friends;
  if (!r) { $('friendsBody').innerHTML = '<div class="fxnote">Chargement…</div>'; return; }
  if (!r.ok) { $('friendsBody').innerHTML = `<div class="fxnote">${esc(FRIEND_HELP[r.reason] ?? FRIEND_HELP.erreur)}</div>`; return; }
  const q = ($('fSearch')?.value ?? '').trim().toLowerCase();
  const all = r.friends.filter((f) => !q || f.name.toLowerCase().includes(q));
  const groups = [['En jeu', all.filter((f) => f.game)], ['En ligne', all.filter((f) => f.online && !f.game)], ['Hors ligne', all.filter((f) => !f.online)]];
  $('friendsBody').innerHTML = groups.filter(([, l]) => l.length).map(([title, l]) => `<div class="fxlab">${title} — ${l.length}</div>${l.map((f) => `
    <div class="fxrow ${f.game ? 'ingame' : f.online ? 'on' : 'off'} ${fx.sel?.id === f.id64 ? 'sel' : ''}" data-ssel="${esc(f.id64)}">
      <span class="favw ${f.game ? 'ingame' : f.online ? 'on' : 'off'}">${f.avatar ? `<img class="pav sm" src="${esc(f.avatar)}" alt="">` : avatar(f.name, 'sm')}<i class="st"></i></span>
      <div class="fxrinfo"><b>${esc(f.name)}</b><small>${f.game ? `Joue à ${esc(f.game)}` : esc(f.status)}</small></div>
    </div>`).join('')}`).join('') || `<div class="fxnote">${q ? `Aucun ami Steam ne s’appelle « ${esc(q)} ».` : 'Aucun ami Steam pour l’instant.'}</div>`;
}
function renderSteamDetail() {
  const f = state.friends?.friends?.find((x) => x.id64 === fx.sel?.id);
  if (!f) return fxShow(null);
  const mine = f.appid && state.items.find((i) => i.steamId === f.appid && i.installed);
  $('fxDetail').innerHTML = `<div class="dhead">${f.avatar ? `<img class="pav big" src="${esc(f.avatar)}" alt="">` : avatar(f.name, 'big')}<div class="dwho"><b>${esc(f.name)}</b><small class="${f.game ? 'g' : ''}">${f.game ? `Joue à ${esc(f.game)}` : esc(f.status)}</small></div><span class="dtag">Steam</span></div>
    <div class="dbody"><div class="dacts">
      ${f.game ? `<button class="btn play" data-friend="join" data-fid="${esc(f.id64)}" ${f.lobby ? '' : 'disabled title="Pas de partie ouverte à rejoindre"'}>▶ Rejoindre</button>` : ''}
      ${f.game && !f.lobby && mine ? `<button class="btn" data-id="${esc(mine.id)}">Lancer ${esc(f.game)}</button>` : ''}
      ${f.online ? `<button class="btn" data-friend="message" data-fid="${esc(f.id64)}">Message sur Steam</button>` : ''}
      <button class="btn ghost" data-friend="profile" data-fid="${esc(f.id64)}">Profil Steam</button>
    </div><p class="hint">Les amis Steam se contactent par Steam. Ajoute-les aussi sur History (leur code ami) pour discuter, les appeler et voir leurs parties ici.</p></div>`;
}

// ---------- Groupes ----------
function lastLine(g) {
  const m = threads.get(`g:${g.id}`)?.at(-1);
  if (!m) return null;
  const who = m.from === myId() ? 'Toi' : g.members.find((x) => x.id === m.from)?.pseudo ?? '?';
  return `${who} : ${m.text}`.slice(0, 60);
}
function renderGroups(list) {
  state.groups = list;
  if (state.hist) state.hist.groupes = list;
  $('hGroups').innerHTML = list.length ? list.map((g) => {
    const on = g.members.filter((m) => m.online).length;
    return `<div class="fxrow grp ${fx.sel?.id === g.id ? 'sel' : ''}" data-gsel="${esc(g.id)}">
      <span class="gstack">${g.members.slice(0, 3).map((m) => avatar(m, 'xs')).join('')}</span>
      <div class="fxrinfo"><b>${esc(g.name)}</b><small>${esc(lastLine(g) ?? `${on}/${g.members.length} en ligne${g.members.some((m) => m.playing) ? ' · en jeu' : ''}`)}</small></div>
      ${gUnread[g.id] ? `<em class="funread">${gUnread[g.id]}</em>` : ''}
    </div>`;
  }).join('') : (state.hist && !state.hist.error && state.hist.status !== 401 ? '<div class="fxnote">Pas encore de groupe. Crée « Squad RL » avec tes potes pour les prévenir tous d’un coup.</div>' : needLogin);
  fxCounts();
  if (fx.sel?.type === 'groupe') { if (list.some((g) => g.id === fx.sel.id)) renderGroupDetail(); else fxShow(null); }
}
function renderGroupDetail() {
  const g = (state.groups ?? []).find((x) => x.id === fx.sel?.id);
  if (!g) return;
  const on = g.members.filter((m) => m.online).length;
  $('gAv').innerHTML = g.members.slice(0, 3).map((m) => avatar(m, 'sm')).join('');
  $('gWho').textContent = g.name;
  const playing = g.members.filter((m) => m.playing);
  $('gSub').textContent = `${g.members.length} membres · ${on} en ligne${playing.length ? ` · ${playing.map((m) => m.pseudo).slice(0, 2).join(', ')} en jeu` : ''}`;
  $('gMembersBtn').textContent = `👥 ${g.members.length}`;
  $('gMembers').innerHTML = g.members.map((m) => `<div class="drow">${avWrap(m, m.playing ? 'ingame' : m.online ? 'on' : 'off', 'sm')}<div class="fxrinfo"><b>${esc(m.pseudo)}</b><small>${m.playing ? `Joue à ${esc(m.playing)}` : m.online ? 'En ligne' : 'Hors ligne'}</small></div>${state.hist?.amis?.some((a) => a.id === m.id) ? `<button type="button" class="btn ghost sm" data-hchat="${esc(m.id)}" data-name="${esc(m.pseudo)}">Message</button>` : ''}</div>`).join('');
}
$('groupNew').addEventListener('click', async () => {
  const amis = state.hist?.amis ?? [];
  if (!amis.length) return toast('Ajoute d’abord des amis History');
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">👥</span><h2>Nouveau groupe</h2></div>
    <input class="minput" id="gName" maxlength="40" placeholder="Nom du groupe (ex. Squad RL)">
    <div class="checks">${amis.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}">${esc(a.pseudo)}</label>`).join('')}</div>
    <div class="row end"><button type="button" class="btn ghost" data-m="0">Annuler</button><button type="button" class="btn play" data-m="1">Créer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    if (b.dataset.m === '0') return $('modal').close();
    const r = await api.groupCreate($('gName').value, [...document.querySelectorAll('#modalBox .checks input:checked')].map((x) => x.value));
    if (r?.error) return toast(r.error);
    $('modal').close(); toast('Groupe créé');
    renderGroups(r.groupes ?? []);
    const created = (r.groupes ?? []).at(-1);
    if (created) fxShow({ type: 'groupe', id: created.id });
  };
});
// Actions des groupes, où qu'elles soient (liste ou panneau de droite)
$('view-amis').addEventListener('click', async (e) => {
  const gsel = e.target.closest('[data-gsel]'); if (gsel) return fxShow({ type: 'groupe', id: gsel.dataset.gsel });
  const esel = e.target.closest('[data-esel]'); if (esel) return fxShow({ type: 'soiree', id: esel.dataset.esel });
  const ssel = e.target.closest('[data-ssel]'); if (ssel) return fxShow({ type: 'steam', id: ssel.dataset.ssel });
  const fsel = e.target.closest('[data-fsel]'); if (fsel && !e.target.closest('button')) return openChat(fsel.dataset.fsel);
  const n = e.target.closest('[data-gnotify]'); const l = e.target.closest('[data-gleave]'); const pty = e.target.closest('[data-gparty]');
  if (pty) { const text = await ui.prompt({ title: 'Annoncer sur Discord', text: 'Le bot mentionne les membres du groupe sur Discord (bouton « Je viens ») et les prévient aussi dans le launcher.', value: state.session?.name ? `Je lance ${state.session.name}, qui vient ?` : 'On lance une partie, qui vient ?', ok: 'Annoncer', icon: '🎮' }); if (!text) return; const r = await api.groupParty(pty.dataset.gparty, text); return toast(r?.ok ? `Annoncé sur Discord${r.mentioned ? ` (${r.mentioned} mentionné${r.mentioned > 1 ? 's' : ''})` : ''}` : r?.error ?? 'Impossible'); }
  if (n) { const text = await ui.prompt({ title: 'Prévenir le groupe', text: 'Ton message (tout le groupe le reçoit dans le launcher) :', value: state.session?.name ? `Je lance ${state.session.name}, vous venez ?` : 'On joue ?', ok: 'Envoyer', icon: '👥' }); if (!text) return; const r = await api.groupNotify(n.dataset.gnotify, text); return toast(r?.ok ? `Envoyé à ${r.sent} ami${r.sent > 1 ? 's' : ''}` : r?.error ?? 'Impossible'); }
  if (l && await ui.confirm({ title: 'Quitter ce groupe ?', ok: 'Quitter', icon: '👥' })) { const r = await api.groupLeave(l.dataset.gleave); if (r?.groupes) { renderGroups(r.groupes); fxShow(null); } }
});
$('gMembersBtn').addEventListener('click', () => { $('gMembers').hidden = !$('gMembers').hidden; });
$('gNotify').addEventListener('click', async () => { const id = gOpen(); if (!id) return; const text = await ui.prompt({ title: 'Prévenir le groupe', text: 'Une notification part chez tout le groupe (même s’ils ne sont pas sur la discussion) :', value: state.session?.name ? `Je lance ${state.session.name}, vous venez ?` : 'On joue ?', ok: 'Envoyer', icon: '🔔' }); if (!text) return; const r = await api.groupNotify(id, text); toast(r?.ok ? `Envoyé à ${r.sent} ami${r.sent > 1 ? 's' : ''}` : r?.error ?? 'Impossible'); });
$('gParty').addEventListener('click', async () => { const id = gOpen(); if (!id) return; const text = await ui.prompt({ title: 'Annoncer sur Discord', text: 'Le bot mentionne les membres du groupe sur Discord (bouton « Je viens ») et les prévient aussi dans le launcher.', value: state.session?.name ? `Je lance ${state.session.name}, qui vient ?` : 'On lance une partie, qui vient ?', ok: 'Annoncer', icon: '🎮' }); if (!text) return; const r = await api.groupParty(id, text); toast(r?.ok ? `Annoncé sur Discord${r.mentioned ? ` (${r.mentioned} mentionné${r.mentioned > 1 ? 's' : ''})` : ''}` : r?.error ?? 'Impossible'); });
$('gMore').addEventListener('click', (e) => {
  const g = (state.groups ?? []).find((x) => x.id === gOpen()); if (!g) return;
  const ctx = $('ctx');
  ctx.innerHTML = `<div class="ctxhead">${esc(g.name)}</div><button class="danger" data-gleave="${esc(g.id)}">${g.owner ? 'Supprimer le groupe' : 'Quitter le groupe'}</button>`;
  ctx.hidden = false;
  const r = e.target.getBoundingClientRect();
  ctx.style.left = `${Math.min(r.left, window.innerWidth - ctx.offsetWidth - 8)}px`; ctx.style.top = `${r.bottom + 6}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
  e.stopPropagation();
});
$('ctx').addEventListener('click', async (e) => {
  const l = e.target.closest('[data-gleave]'); if (!l) return;
  $('ctx').hidden = true;
  if (await ui.confirm({ title: 'Quitter ce groupe ?', ok: 'Quitter', icon: '👥' })) { const r = await api.groupLeave(l.dataset.gleave); if (r?.groupes) { renderGroups(r.groupes); fxShow(null); } }
});
$('secDiscord').addEventListener('click', async () => {
  const r = await api.discordCode();
  if (!r?.ok) return toast(r?.error ?? 'Connecte-toi d’abord');
  $('settings').close();
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🔗</span><h2>Lier ton compte Discord</h2></div>
    <p class="mtext">Dans le salon <b>#lier-son-compte</b> du serveur History, colle la commande :</p><div class="codebox big"><b>/launcher lier code:${esc(r.code)}</b></div>
    <p class="hint">Le code est valable 10 minutes. Ensuite : <b>/launcher profil</b> montre ton niveau, ton benchmark et ton jeu du moment, et tu reçois automatiquement les rôles de ton niveau et de ton PC.${r.lie ? '<br>Ton compte est déjà lié : le lier à nouveau remplace l’ancien compte Discord.' : ''}</p>
    <div class="row end">${r.lie ? '<button type="button" class="btn ghost" data-unlink="1">Délier</button>' : ''}<button type="button" class="btn" data-copy="1">Copier la commande</button><button type="button" class="btn play" data-m="1">OK</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    if (e.target.closest('[data-copy]')) { copyText(`/launcher lier code:${r.code}`); toast('Commande copiée'); }
    if (e.target.closest('[data-unlink]')) { await api.discordUnlink(); toast('Discord délié'); $('modal').close(); }
    if (e.target.closest('[data-m]')) $('modal').close();
  };
});
async function loadHistory() {
  const [r, ev] = await Promise.all([api.hFriends?.().catch(() => null), api.events?.().catch(() => null)]);
  state.hist = r;
  state.events = ev?.soirees ?? [];
  renderHistory();
  if (r && !r.error && r.status !== 401) renderGroups(r.groupes ?? []);
  fxCounts();
  const online = (r?.amis ?? []).filter((a) => a.online).length + (state.friends?.friends ?? []).filter((f) => f.online).length;
  $('friendsOnline').textContent = online || '';
}
function friendRow(a) {
  const n = unread[a.id] ?? 0;
  const st = a.playing ? 'ingame' : a.online ? 'on' : 'off';
  const line = a.playing ? `Joue à ${esc(a.playing)}${dispoTxt(a)}` : a.online ? (a.dnd ? 'Ne pas déranger' : a.status ? esc(a.status) : 'En ligne') : 'Hors ligne';
  return `<div class="fxrow ${st} ${fx.sel?.type === 'ami' && fx.sel.id === a.id ? 'sel' : ''}" data-fsel="${esc(a.id)}">
    ${avWrap(a, st, 'sm')}
    <div class="fxrinfo"><b>${esc(a.pseudo)}</b><small>${line}</small></div>
    ${n ? `<em class="fxbadge">${n}</em>` : ''}
  </div>`;
}
function renderHistory() {
  const r = state.hist;
  fxCounts();
  if (!r || r.status === 401) { $('hFriends').innerHTML = needLogin; $('hRequests').innerHTML = ''; $('myCode').textContent = '—'; $('eventsList').innerHTML = needLogin; $('hGroups').innerHTML = needLogin; return; }
  if (r.error) { $('hFriends').innerHTML = `<div class="fxnote">${esc(r.error)}</div>`; return; }
  $('myCode').textContent = r.code;
  const me = String(r.code ?? '').split('#')[0] || 'Toi';
  $('meName').textContent = me; setAv($('meAv'), { pseudo: me, ...(r.moi ?? {}) });
  $('hRequests').innerHTML = r.demandes.length ? `<div class="fxlab">Demandes d’ami — ${r.demandes.length}</div>${r.demandes.map((d) => `
    <div class="fxrow req">${avatar(d, 'sm')}<div class="fxrinfo"><b>${esc(d.pseudo)}</b><small>${esc(d.code)}</small></div><button class="btn play sm" data-hacc="${esc(d.id)}" title="Accepter">✓</button><button class="btn ghost sm" data-hrem="${esc(d.id)}" title="Refuser">✕</button></div>`).join('')}` : '';
  const q = ($('fSearch')?.value ?? '').trim().toLowerCase();
  const list = r.amis.filter((a) => !q || a.pseudo.toLowerCase().includes(q));
  const sections = [['En jeu', list.filter((a) => a.playing)], ['En ligne', list.filter((a) => a.online && !a.playing)], ['Hors ligne', list.filter((a) => !a.online)]];
  $('hFriends').innerHTML = r.amis.length
    ? (sections.filter(([, l]) => l.length).map(([title, l]) => `<div class="fxlab">${title} — ${l.length}</div>${l.map(friendRow).join('')}`).join('') || `<div class="fxnote">Aucun ami ne s’appelle « ${esc(q)} ».</div>`)
    : '<div class="fxnote"><b>Pas encore d’amis</b>Clique « Ajouter un ami » en haut et colle le code de ton pote, ou envoie-lui ton code.</div>';
  renderEvents();
  $('eInvites').innerHTML = r.amis.length ? r.amis.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}">${esc(a.pseudo)}</label>`).join('') : '<small class="hint">Ajoute d’abord des amis.</small>';
  const games2 = games().filter((i) => i.installed || i.minutes).sort((a, b) => b.minutes - a.minutes);
  $('eGame').innerHTML = games2.map((i) => `<option>${esc(i.name)}</option>`).join('');
  if (!$('eAt').value) { const d = new Date(Date.now() + 3_600_000); d.setMinutes(0, 0, 0); $('eAt').value = new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
  if (fx.sel?.type === 'ami') { if (r.amis.some((a) => a.id === fx.sel.id)) chatHeader(); else fxShow(null); }
}
// ---------- Profil : carte de joueur (bannière, cadre animé, effet du pseudo, badges, jeu préféré, réseaux) ----------
const PCOLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#64748b', '#1f2937'];
const FRAMES = [['aucun', 'Aucun'], ['perso', 'Ta couleur'], ['neon', 'Néon'], ['or', 'Or'], ['arcenciel', 'Arc-en-ciel'], ['feu', 'Feu'], ['glace', 'Glace'], ['toxique', 'Toxique'], ['galaxie', 'Galaxie']];
const NAMEFX = [['aucun', 'Normal'], ['degrade', 'Dégradé'], ['neon', 'Néon'], ['or', 'Or'], ['arcenciel', 'Arc-en-ciel']];
const BANNERS = [['nuit', 'Nuit'], ['aurore', 'Aurore'], ['coucher', 'Coucher de soleil'], ['ocean', 'Océan'], ['foret', 'Forêt'], ['lave', 'Lave'], ['neige', 'Neige'], ['synthwave', 'Synthwave'], ['carbone', 'Carbone'], ['rose', 'Rose']];
const BADGES = { fondateur: ['🏅', 'Fondateur'], nuit: ['🌙', 'Oiseau de nuit'], rp: ['🚓', 'Rôliste'], fps: ['🎯', 'Chasseur de FPS'], streamer: ['🎥', 'Streamer'], collection: ['📚', 'Collectionneur'], social: ['🤝', 'Pote de tout le monde'], compet: ['🏆', 'Compétiteur'], chill: ['🛋', 'Joueur chill'], createur: ['🛠', 'Créateur'], speedrun: ['⏱', 'Speedrunner'], coop: ['🧩', 'Fan de coop'] };
const LINKS = [['discord', 'Discord', 'pseudo ou lien d’invitation'], ['twitch', 'Twitch', 'twitch.tv/… ou pseudo'], ['youtube', 'YouTube', 'youtube.com/@… ou @chaîne'], ['tiktok', 'TikTok', 'tiktok.com/@… ou @compte'], ['steam', 'Steam', 'lien du profil Steam'], ['instagram', 'Instagram', 'instagram.com/… ou @compte']];
// Logos officiels des réseaux (fichiers dans brands/social)
const LINK_ICONS = Object.fromEntries(['discord', 'twitch', 'youtube', 'tiktok', 'steam', 'instagram'].map((k) => [k, `<img src="brands/social/${k}.png" alt="" draggable="false">`]));
// Pseudo ou lien collé -> pseudo gardé + vrai lien (mêmes règles que le serveur)
const LINK_URL = {
  twitch: /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([\w.-]+)/i,
  youtube: /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:@|c\/|user\/|channel\/)?([\w.-]+)/i,
  tiktok: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([\w.-]+)/i,
  steam: /^(?:https?:\/\/)?steamcommunity\.com\/(?:id|profiles)\/([\w.-]+)/i,
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([\w.-]+)/i,
  discord: /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/([\w-]+)/i,
};
function linkHandle(kind, raw) {
  const v = String(raw ?? '').trim();
  const m = v.match(LINK_URL[kind] ?? /$^/);
  if (m) return kind === 'discord' ? `gg/${m[1]}` : m[1].slice(0, 40);
  const h = v.replace(/^@/, '');
  if (kind === 'discord') return /^(gg\/)?[\w.#-]{2,40}$/.test(h) ? h : null;
  return /^[\w.-]{2,40}$/.test(h) ? h : null;
}
function linkUrl(kind, h) {
  if (!h) return null;
  if (kind === 'discord') return h.startsWith('gg/') ? `https://discord.gg/${h.slice(3)}` : null;
  if (kind === 'twitch') return `https://www.twitch.tv/${h}`;
  if (kind === 'youtube') return /^UC[\w-]{22}$/.test(h) ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
  if (kind === 'tiktok') return `https://www.tiktok.com/@${h}`;
  if (kind === 'steam') return /^\d{17}$/.test(h) ? `https://steamcommunity.com/profiles/${h}` : `https://steamcommunity.com/id/${h}`;
  if (kind === 'instagram') return `https://www.instagram.com/${h}`;
  return null;
}
const linkShown = (kind, h) => (kind === 'discord' && h.startsWith('gg/') ? `discord.gg/${h.slice(3)}` : kind === 'discord' || kind === 'steam' ? h : `@${h}`);
const safeBanner = (u) => (/^https:\/\/[\w.-]+\/api\/compte\/banniere\/[\w-]+\?v=\d+$/.test(String(u ?? '')) ? u : null);
/** Carte de profil complète (aperçu de l'éditeur et profil d'un ami). */
const GIFTS = { citrouille: ['🎃', 'Citrouille'], couronne: ['👑', 'Couronne'], flamme: ['🔥', 'Flamme'], coeur: ['💛', 'Cœur'], trophee: ['🏆', 'Trophée'], fantome: ['👻', 'Fantôme'] };
function profileCard(p, { live = null } = {}) {
  const col = /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : '#3b82f6';
  const ban = p.bannerData ?? safeBanner(p.bannerImg);
  const game = p.favGame ? state.items.find((i) => i.name.toLowerCase() === p.favGame.toLowerCase()) : null;
  const since = p.since ? new Date(p.since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null;
  const links = LINKS.filter(([k]) => p.links?.[k]);
  const cb = /^#[0-9a-f]{6}$/i.test(p.cardBg ?? '') ? p.cardBg : null;
  const hide = new Set(p.hide ?? []);
  return `<div class="pc2 ${cb ? 'custombg' : ''}" style="--pc:${col};${cb ? `--cb:${cb}` : ''}">
    <div class="pc2ban ban-${esc(p.banner ?? 'nuit')}" ${ban ? `style="background-image:url('${esc(ban)}')"` : ''}></div>
    <div class="pc2main">
      <div class="pc2top">${p.avatarData ? `<span class="pav xl img ${p.frame ? `fr-${esc(p.frame)}` : ''}" style="background-image:url('${esc(p.avatarData)}');${/^#[0-9a-f]{6}$/i.test(p.frameColor ?? '') ? `--fc:${p.frameColor}` : ''}"></span>` : avatar(p, `xl ${p.frame ? `fr-${p.frame}` : ''}`)}
        ${live ? `<span class="pc2live ${live.cls}">${esc(live.text)}</span>` : ''}</div>
      <div class="pc2name nfx-${esc(p.nameFx ?? 'aucun')}">${esc(p.pseudo ?? '')}</div>
      <small class="pc2sub">${p.code ? esc(p.code) : ''}${since ? `${p.code ? ' · ' : ''}membre depuis ${esc(since)}` : ''}</small>
      ${p.bio ? `<p class="pc2bio">${esc(p.bio)}</p>` : ''}
      ${(p.badges ?? []).length ? `<div class="pc2badges">${p.badges.filter((b) => BADGES[b]).map((b) => `<span class="pbadge"><i>${BADGES[b][0]}</i>${esc(BADGES[b][1])}</span>`).join('')}</div>` : ''}
      ${(p.gifts ?? []).length ? `<div class="pc2gifts" title="Cadeaux reçus de ses amis">🎁 ${p.gifts.map((g) => GIFTS[g]?.[0] ?? '').join(' ')}</div>` : ''}
      <div class="pc2grid">
        ${p.favGame ? `<div class="pc2box fav">${game?.art?.cover ? `<img src="${esc(game.art.cover)}" alt="">` : '<span class="pc2ico">🎮</span>'}<div><small>Jeu préféré</small><b>${esc(p.favGame)}</b></div></div>` : ''}
        ${p.week && !hide.has('semaine') ? `<div class="pc2box"><span class="pc2ico">⏱</span><div><small>Cette semaine</small><b>${hours(p.week)}</b></div></div>` : ''}
        ${p.bench && !hide.has('bench') ? `<div class="pc2box"><span class="pc2ico">🏁</span><div><small>Benchmark</small><b>${p.bench}</b></div></div>` : ''}
        ${p.top && !hide.has('top') && p.top !== p.favGame ? `<div class="pc2box"><span class="pc2ico">🔥</span><div><small>Le plus joué (7 j)</small><b>${esc(p.top)}</b></div></div>` : ''}
      </div>
      ${links.length ? `<div class="pc2links">${links.map(([k, label]) => { const h = p.links[k]; const url = linkUrl(k, h); return `<button type="button" class="plink2 pl-${k}" ${url ? `data-plopen="${esc(k)}" data-plh="${esc(h)}" title="Ouvrir ${esc(label)}"` : `data-copytext="${esc(h)}" data-copied="${esc(label)} copié : ${esc(h)}" title="Copier le pseudo"`}><i class="plico">${LINK_ICONS[k]}</i><span><small>${esc(label)}</small><b>${esc(linkShown(k, h))}</b></span><em>${url ? '↗' : '⧉'}</em></button>`; }).join('')}</div>` : ''}
    </div></div>`;
}
/** Profil d'un ami (clic sur sa photo ou son nom). */
function openFriendProfile(id) {
  const f = (state.hist?.amis ?? []).find((a) => a.id === id);
  if (!f) return;
  const live = f.playing ? { cls: 'g', text: `Joue à ${f.playing}` } : f.online ? { cls: 'on', text: 'En ligne' } : { cls: 'off', text: 'Hors ligne' };
  setModal('wide', 'fp'), $('modalBox').innerHTML = `${profileCard(f, { live })}<div class="row end"><button type="button" class="btn" data-hchat="${esc(f.id)}" data-name="${esc(f.pseudo)}" data-m="1">💬 Message</button>${f.online ? `<button type="button" class="btn" data-hcall="${esc(f.id)}" data-name="${esc(f.pseudo)}" data-m="1">📞 Appeler</button>` : ''}<button type="button" class="btn" data-giftfor="${esc(f.id)}">🎁 Offrir</button><button type="button" class="btn play" data-m="1" autofocus>Fermer</button></div><div class="giftpick" id="giftPick" hidden>${Object.entries(GIFTS).map(([k, [e, n]]) => `<button type="button" class="btn sm" data-gift="${k}" data-to="${esc(f.id)}">${e} ${n}</button>`).join('')}</div>`;
  $('modal').showModal();
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) setTimeout(() => $('modal').close(), 0); };
}
$('modal').addEventListener('close', () => $('modalBox').classList.remove('wide', 'fp', 'procardbox', 'ratebox', 'sellbox'));
/** Recadrer une image (glisser pour déplacer, molette ou curseur pour zoomer) avant de l'envoyer. */
function adjustImage(file, w, h, { round = false, maxKb = 140, title = 'Ajuste ton image' } = {}) {
  return new Promise((resolve) => {
    createImageBitmap(file).then((bmp) => {
      const W = w / h >= 2 ? 560 : 300; const H = Math.round((W * h) / w);
      $('cropTitle').textContent = title;
      const cv = $('cropCv'); cv.width = W; cv.height = H; cv.classList.toggle('round', round);
      const base = Math.max(W / bmp.width, H / bmp.height);
      let z = 1; let ox = 0; let oy = 0; let drag = null;
      const clamp = () => { const k = base * z; const mx = Math.max(0, (bmp.width * k - W) / 2); const my = Math.max(0, (bmp.height * k - H) / 2); ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy)); };
      const draw = (ctx, CW, CH) => { const r = CW / W; const k = base * z * r; ctx.clearRect(0, 0, CW, CH); ctx.drawImage(bmp, CW / 2 + ox * r - (bmp.width * k) / 2, CH / 2 + oy * r - (bmp.height * k) / 2, bmp.width * k, bmp.height * k); };
      const paint = () => { clamp(); draw(cv.getContext('2d'), W, H); };
      $('cropZoom').value = '1';
      $('cropZoom').oninput = (e) => { z = Number(e.target.value); paint(); };
      cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); };
      cv.onpointermove = (e) => { if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); paint(); };
      cv.onpointerup = () => { drag = null; };
      cv.onwheel = (e) => { e.preventDefault(); z = Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 0.93))); $('cropZoom').value = String(z); paint(); };
      const done = (ok) => {
        $('cropDlg').onclose = null; $('cropDlg').close();
        if (!ok) return resolve(null);
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        draw(out.getContext('2d'), w, h);
        for (const q of [0.88, 0.75, 0.6, 0.45, 0.3]) { const u = out.toDataURL('image/webp', q); if (u.length * 0.75 < maxKb * 1024) return resolve(u); }
        return resolve(out.toDataURL('image/jpeg', 0.4));
      };
      $('cropOk').onclick = () => done(true);
      $('cropCancel').onclick = () => done(false);
      $('cropDlg').onclose = () => resolve(null);
      $('cropDlg').showModal();
      paint();
    }).catch(() => resolve(undefined));
  });
}
async function openProfileEditor() {
  if (!state.account) return showAuth(true);
  const cur = state.account.profile ?? {};
  const moi = state.hist?.moi ?? {};
  const d = {
    pseudo: state.account.pseudo, code: state.hist?.code, since: state.account.createdAt, week: moi.week, top: moi.top,
    avatar: cur.avatar, bannerImg: cur.bannerImg, color: cur.color ?? '#3b82f6', bio: cur.bio ?? '', frame: cur.frame, frameColor: cur.frameColor ?? cur.color ?? '#3b82f6', nameFx: cur.nameFx, banner: cur.banner ?? 'nuit',
    favGame: cur.favGame ?? '', badges: [...(cur.badges ?? [])], links: { ...(cur.links ?? {}) },
    cardBg: cur.cardBg ?? null, hide: [...(cur.hide ?? [])], bench: state.hist?.moi?.bench ?? null,
  };
  const files = { avatar: null, banner: null };
  const raw = Object.fromEntries(LINKS.map(([k]) => [k, d.links[k] ? (linkUrl(k, d.links[k]) ?? d.links[k]) : '']));
  const change = {};
  let tab = 'look';
  const gamesList = [...new Set(games().filter((i) => i.installed || i.minutes).sort((a, b) => b.minutes - a.minutes).map((i) => i.name))].slice(0, 60);
  const paint = () => {
    $('peCard').innerHTML = profileCard(d);
    document.querySelectorAll('#modalBox [data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === tab));
    document.querySelectorAll('#modalBox .ptabpane').forEach((p) => { p.hidden = p.dataset.ptab !== tab; });
    document.querySelectorAll('#modalBox [data-pcol]').forEach((b) => b.classList.toggle('on', b.dataset.pcol === d.color));
    document.querySelectorAll('#modalBox [data-pbg]').forEach((b) => b.classList.toggle('on', (b.dataset.pbg === 'auto' && !d.cardBg) || b.dataset.pbg === d.cardBg));
    document.querySelectorAll('#modalBox [data-pframe]').forEach((b) => b.classList.toggle('on', b.dataset.pframe === (d.frame ?? 'aucun')));
    document.querySelectorAll('#modalBox [data-pfx]').forEach((b) => b.classList.toggle('on', b.dataset.pfx === (d.nameFx ?? 'aucun')));
    document.querySelectorAll('#modalBox [data-pban]').forEach((b) => b.classList.toggle('on', !d.bannerImg && !d.bannerData && b.dataset.pban === d.banner));
    document.querySelectorAll('#modalBox [data-pbadge]').forEach((b) => b.classList.toggle('on', d.badges.includes(b.dataset.pbadge)));
    document.querySelector('#modalBox .pframe[data-pframe="perso"] .pav')?.style.setProperty('--fc', d.frameColor);
    $('peFrameCol').hidden = d.frame !== 'perso';
    $('peAvAdj').hidden = !files.avatar; $('peBanAdj').hidden = !files.banner;
    $('peBanUp').classList.toggle('on', Boolean(d.bannerImg || d.bannerData));
    $('peBadgeCount').textContent = `${d.badges.length}/3`;
    for (const [k] of LINKS) {
      const v = raw[k].trim(); const h = v ? linkHandle(k, v) : null;
      const st = document.querySelector(`#modalBox [data-plst="${k}"]`);
      st.className = `plst ${!v ? '' : h ? 'ok' : 'bad'}`;
      st.textContent = !v ? '' : h ? (linkUrl(k, h) ? `✓ ${linkUrl(k, h).replace(/^https:\/\/(www\.)?/, '')}` : `✓ ${h} (copié au clic)`) : '✕ Pseudo ou lien non reconnu';
    }
  };
  const sample = (fx) => `<span class="nfx-${fx}" style="--pc:${esc(d.color)}">${esc(d.pseudo)}</span>`;
  setModal('wide'), $('modalBox').innerHTML = `<div class="pedit2">
    <div class="pe2prev"><div id="peCard"></div><small class="hint">Aperçu : c’est ce que tes amis voient.</small></div>
    <div class="pe2ctl">
      <div class="mhead"><h2>Mon profil</h2></div>
      <div class="tabs ptabs"><button type="button" data-ptab="look" class="on">Apparence</button><button type="button" data-ptab="about">À propos</button><button type="button" data-ptab="links">Réseaux</button></div>
      <div class="pe2scroll">
      <div class="ptabpane" data-ptab="look">
        <b class="sub">Photo</b>
        <div class="pphoto"><button type="button" class="btn sm" id="pePick">Choisir une photo</button><button type="button" class="btn sm" id="peAvAdj" hidden>✂ Recadrer</button><button type="button" class="btn ghost sm" id="peDel">Retirer</button><input type="file" id="peFile" accept="image/png,image/jpeg,image/webp" hidden></div>
        <b class="sub">Cadre de la photo</b>
        <div class="pframes">${FRAMES.map(([k, l]) => `<button type="button" class="pframe" data-pframe="${k}" title="${l}">${avatar({ pseudo: d.pseudo, avatar: d.avatar, color: d.color, frameColor: d.frameColor }, `sm ${k !== 'aucun' ? `fr-${k}` : ''}`)}<small>${l}</small></button>`).join('')}</div>
        <label class="pframecol" id="peFrameCol" hidden><span>Couleur du cadre</span><input type="color" id="peFrameColor" value="${esc(d.frameColor)}"></label>
        <b class="sub">Bannière</b>
        <div class="pbanners">${BANNERS.map(([k, l]) => `<button type="button" class="pban ban-${k}" data-pban="${k}" title="${l}"></button>`).join('')}<button type="button" class="pban up" id="peBanUp" title="Ta propre image"><span>＋ Ton image</span></button><input type="file" id="peBanFile" accept="image/png,image/jpeg,image/webp" hidden></div>
        <button type="button" class="btn sm" id="peBanAdj" hidden>✂ Recadrer la bannière</button>
        <b class="sub">Fond de la carte</b>
        <div class="pcolors">${['', '#1e1b2e', '#0f172a', '#1e293b', '#3b0764', '#4c0519', '#052e16', '#172554', '#431407', '#18181b', '#e2e8f0'].map((c) => `<button type="button" class="pcol bgpick ${c ? '' : 'auto'}" data-pbg="${c || 'auto'}" style="${c ? `background:${c}` : ''}" title="${c ? c : 'Automatique'}">${c ? '' : 'Auto'}</button>`).join('')}<label class="pcol custom" title="Autre couleur de fond"><input type="color" id="peBg" value="${esc(d.cardBg ?? '#1e1b2e')}"></label></div>
        <b class="sub">Couleur du profil</b>
        <div class="pcolors">${PCOLORS.map((c) => `<button type="button" class="pcol" data-pcol="${c}" style="background:${c}" title="${c}"></button>`).join('')}<label class="pcol custom" title="Autre couleur"><input type="color" id="peColor" value="${esc(d.color)}"></label></div>
        <b class="sub">Effet du pseudo</b>
        <div class="pfxs">${NAMEFX.map(([k, l]) => `<button type="button" class="pfx" data-pfx="${k}"><b>${sample(k)}</b><small>${l}</small></button>`).join('')}</div>
      </div>
      <div class="ptabpane" data-ptab="about" hidden>
        <b class="sub">Bio</b>
        <textarea id="peBioIn" maxlength="140" rows="3" placeholder="Ex. RP tous les soirs, main support sur Overwatch…">${esc(d.bio)}</textarea>
        <b class="sub">Jeu préféré</b>
        <input class="minput" id="peGame" list="peGames" maxlength="60" placeholder="Ex. FiveM" value="${esc(d.favGame)}"><datalist id="peGames">${gamesList.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
        <b class="sub">Afficher sur mon profil</b>
        <div class="phide">${[['semaine', '⏱ Temps de jeu cette semaine'], ['top', '🔥 Jeu le plus joué (7 jours)'], ['bench', '🏁 Score du benchmark']].map(([k, l]) => `<label class="toggle small"><input type="checkbox" data-phide="${k}" ${d.hide.includes(k) ? '' : 'checked'}><span></span>${l}</label>`).join('')}</div>
        <b class="sub">Badges <small class="hint" id="peBadgeCount"></small></b>
        <div class="pbadgepick">${Object.entries(BADGES).map(([k, [i, l]]) => `<button type="button" class="pbadge pick" data-pbadge="${k}"><i>${i}</i>${esc(l)}</button>`).join('')}</div>
      </div>
      <div class="ptabpane" data-ptab="links" hidden>
        <p class="hint">Colle le lien de ta chaîne ou ton pseudo : sur ton profil, tes amis cliquent et ça s’ouvre directement.</p>
        ${LINKS.map(([k, l, ph]) => `<div class="plinkrow pl-${k}"><i class="plico">${LINK_ICONS[k]}</i><div class="plinkf"><b>${l}</b><input data-plink="${k}" maxlength="120" placeholder="${esc(ph)}" value="${esc(raw[k])}"><small data-plst="${k}"></small></div></div>`).join('')}
      </div>
      </div>
      <div class="pe2foot"><button type="button" class="btn ghost" data-m="0">Annuler</button><button type="button" class="btn play" data-m="1">Enregistrer</button></div>
    </div></div>`;
  $('modal').showModal(); paint();
  const pickAvatar = async (f) => { const u = await adjustImage(f, 256, 256, { round: true, maxKb: 140, title: 'Recadre ta photo' }); if (u === undefined) return toast('Image illisible'); if (!u) return; files.avatar = f; change.avatar = u; d.avatarData = u; paint(); };
  const pickBanner = async (f) => { const u = await adjustImage(f, 900, 300, { maxKb: 280, title: 'Ajuste ta bannière' }); if (u === undefined) return toast('Image illisible'); if (!u) return; files.banner = f; change.banniereImg = u; d.bannerData = u; paint(); };
  $('pePick').onclick = () => $('peFile').click();
  $('peFile').onchange = () => { const f = $('peFile').files?.[0]; $('peFile').value = ''; if (f) pickAvatar(f); };
  $('peAvAdj').onclick = () => files.avatar && pickAvatar(files.avatar);
  $('peDel').onclick = () => { change.avatar = null; d.avatarData = null; d.avatar = null; files.avatar = null; paint(); };
  $('peBanUp').onclick = () => (files.banner ? pickBanner(files.banner) : $('peBanFile').click());
  $('peBanFile').onchange = () => { const f = $('peBanFile').files?.[0]; $('peBanFile').value = ''; if (f) pickBanner(f); };
  $('peBanAdj').onclick = () => files.banner && pickBanner(files.banner);
  $('peColor').oninput = (e) => { d.color = e.target.value; change.couleur = d.color; paint(); };
  $('peBg').oninput = (e) => { d.cardBg = e.target.value; change.fond = d.cardBg; paint(); };
  document.querySelectorAll('#modalBox [data-phide]').forEach((c) => { c.onchange = () => { d.hide = [...document.querySelectorAll('#modalBox [data-phide]')].filter((x) => !x.checked).map((x) => x.dataset.phide); change.cacher = [...d.hide]; paint(); }; });
  $('peFrameColor').oninput = (e) => { d.frameColor = e.target.value; change.cadreCouleur = d.frameColor; paint(); };
  $('peBioIn').oninput = (e) => { d.bio = e.target.value; change.bio = d.bio; paint(); };
  $('peGame').oninput = (e) => { d.favGame = e.target.value; change.jeu = d.favGame; paint(); };
  $('modalBox').oninput = (e) => {
    const k = e.target.dataset?.plink; if (!k) return;
    raw[k] = e.target.value;
    const h = raw[k].trim() ? linkHandle(k, raw[k]) : null;
    if (h) d.links[k] = h; else delete d.links[k];
    change.liens = { ...d.links }; paint();
  };
  $('modalBox').onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.ptab) { tab = t.dataset.ptab; return paint(); }
    if (t.dataset.pcol) { d.color = t.dataset.pcol; change.couleur = d.color; return paint(); }
    if (t.dataset.pbg) { d.cardBg = t.dataset.pbg === 'auto' ? null : t.dataset.pbg; change.fond = d.cardBg; return paint(); }
    if (t.dataset.pframe) { d.frame = t.dataset.pframe === 'aucun' ? null : t.dataset.pframe; change.cadre = t.dataset.pframe; if (d.frame === 'perso') change.cadreCouleur = d.frameColor; return paint(); }
    if (t.dataset.pfx) { d.nameFx = t.dataset.pfx === 'aucun' ? null : t.dataset.pfx; change.effet = t.dataset.pfx; return paint(); }
    if (t.dataset.pban) { d.banner = t.dataset.pban; d.bannerImg = null; d.bannerData = null; files.banner = null; change.banniere = d.banner; change.banniereImg = null; return paint(); }
    if (t.dataset.pbadge) {
      const k = t.dataset.pbadge;
      if (d.badges.includes(k)) d.badges = d.badges.filter((x) => x !== k); else if (d.badges.length < 3) d.badges.push(k); else return toast('3 badges au maximum');
      change.badges = [...d.badges]; return paint();
    }
    if (!t.dataset.m) return;
    if (t.dataset.m === '0') return $('modal').close();
    if (!Object.keys(change).length) return $('modal').close();
    t.disabled = true;
    const r = await api.saveProfile?.(change);
    t.disabled = false;
    if (!r?.ok) return toast(r?.error ?? 'Impossible pour l’instant');
    setAccount(r.compte); $('modal').close(); toast('Profil mis à jour');
    loadHistory();
  };
}
// Optimisation en pause : seul « Remettre Windows comme avant » reste disponible
$('maintReset').addEventListener('click', async (e) => {
  e.target.disabled = true;
  const r = await api.optiUndoAll?.().catch(() => null);
  e.target.disabled = false;
  if (r?.cancelled) return;
  if (!r?.ok) return toast(r?.refused ? 'Autorisation refusée : rien n’a été changé' : r?.error ?? 'Impossible');
  toast(r.changed ? `↩ ${r.changed} réglage(s) remis comme avant : redémarre le PC` : 'Tout est déjà comme Windows d’origine 👍');
});
$('meAv').addEventListener('click', openProfileEditor);
$('meName').addEventListener('click', openProfileEditor);

$('fSearch').addEventListener('input', () => (state.ftab === 'steam' ? renderFriends() : renderHistory()));
$('fAddBtn').addEventListener('click', () => { fxTab('amis'); showFriendTab('history'); $('fxAdd').hidden = !$('fxAdd').hidden; if (!$('fxAdd').hidden) $('addCode').focus(); });
$('addCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addFriend').click(); });
$('myStatus').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('saveStatus').click(); });
// ---------- Clic droit sur le menu de gauche : onglets, plateformes, collections ----------
const NAV_FIXED = ['accueil', 'bibliotheque'];
function applySidebar() {
  document.querySelectorAll('#nav button[data-view]').forEach((b) => { b.hidden = sidebar.hiddenNav.includes(b.dataset.view); });
  renderPlatforms();
}
const saveSidebar = () => api.setSettings({ sidebar: { ...sidebar } }).then(applySidebar);
function sideMenu(el, x, y) {
  const b = (a, label, k = '', cls = '') => `<button data-side="${a}" data-k="${esc(k)}" class="${cls}">${label}</button>`;
  let title = '';
  const m = [];
  if (el.dataset.col) {
    const c = state.cols[el.dataset.col];
    if (!c) return;
    title = c.name;
    m.push(b('col-open', '📂 Ouvrir', el.dataset.col), b('col-rename', '✏ Renommer', el.dataset.col), b('col-empty', '🧹 Vider (retirer tous les jeux)', el.dataset.col), '<hr>', b('col-del', '🗑 Supprimer la collection', el.dataset.col, 'danger'));
  } else if (el.dataset.platform) {
    const k = el.dataset.platform;
    title = state.sources[k]?.label ?? k;
    m.push(b('plat-open', '📂 Voir ses jeux', k), b('plat-hide', '◌ Masquer du menu', k));
  } else if (el.dataset.view) {
    const v = el.dataset.view;
    title = el.textContent.trim();
    m.push(b('nav-open', '📂 Ouvrir', v));
    if (!NAV_FIXED.includes(v)) m.push(b('nav-hide', '◌ Masquer cet onglet', v));
  } else if (el.closest('.colhead')) {
    title = 'Collections';
    m.push(b('col-new', '＋ Nouvelle collection'));
  } else return;
  const hid = sidebar.hiddenNav.length + sidebar.hiddenPlatforms.length;
  if (hid) m.push('<hr>', b('side-reset', `◉ Réafficher ce que j’ai masqué (${hid})`));
  const ctx = $('ctx');
  ctx.innerHTML = `<div class="ctxhead">${esc(title)}</div>${m.join('')}`;
  ctx.hidden = false;
  ctx.style.left = `${Math.min(x, window.innerWidth - ctx.offsetWidth - 8)}px`;
  ctx.style.top = `${Math.max(8, Math.min(y, window.innerHeight - ctx.offsetHeight - 8))}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
}
document.querySelector('.side').addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-col], [data-platform], [data-view], .colhead');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  sideMenu(el, e.clientX, e.clientY);
});
async function sideAction(a, k) {
  if (a === 'col-open') return document.querySelector(`#collections [data-col="${CSS.escape(k)}"]`)?.click();
  if (a === 'col-rename') { const n = await ui.prompt({ title: 'Renommer la collection', value: state.cols[k]?.name ?? '', ok: 'Renommer', icon: '📚' }); if (n && state.cols[k]) { state.cols[k].name = n.slice(0, 40); saveCols(); toast('Collection renommée'); } return; }
  if (a === 'col-empty') { if (state.cols[k] && await ui.confirm({ title: `Vider « ${state.cols[k].name} » ?`, text: 'Les jeux restent dans la bibliothèque.', ok: 'Vider', icon: '🧹' })) { state.cols[k].items = []; saveCols(); if (state.list.collection === k) renderList(); } return; }
  if (a === 'col-del') { if (state.cols[k] && await ui.confirm({ title: `Supprimer « ${state.cols[k].name} » ?`, text: 'Les jeux restent dans la bibliothèque.', ok: 'Supprimer', danger: true, icon: '📚' })) { delete state.cols[k]; saveCols(); if (state.list.collection === k) go('bibliotheque'); toast('Collection supprimée'); } return; }
  if (a === 'col-new') return $('newCol').click();
  if (a === 'plat-open') return document.querySelector(`#platforms [data-platform="${CSS.escape(k)}"]`)?.click();
  if (a === 'plat-hide') { sidebar.hiddenPlatforms = [...new Set([...sidebar.hiddenPlatforms, k])]; await saveSidebar(); return toast('Plateforme masquée du menu (clic droit › Réafficher pour la remettre)'); }
  if (a === 'nav-open') return go(k);
  if (a === 'nav-hide') { sidebar.hiddenNav = [...new Set([...sidebar.hiddenNav, k])]; if (state.view === k) go('accueil'); await saveSidebar(); return toast('Onglet masqué (clic droit › Réafficher pour le remettre)'); }
  if (a === 'side-reset') { sidebar.hiddenNav = []; sidebar.hiddenPlatforms = []; await saveSidebar(); return toast('Menu remis comme avant'); }
}

// ---------- Messages entre amis + synchro en direct ----------
// « dispo vers 22 h 15 » (fin probable de sa partie, d'après ses parties habituelles)
const dispoTxt = (f) => (f?.dispo && f.dispo > Date.now() ? ` · dispo vers ${new Date(f.dispo).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}` : '');
window.addEventListener('focus', () => { if (chatWith) markRead(`f:${chatWith.id}`); });
function chatHeader() {
  if (!chatWith) return;
  const f = state.hist?.amis?.find((a) => a.id === chatWith.id);
  $('chatWho').textContent = chatWith.name;
  $('chatAv').className = `pav ${f?.playing ? 'ingame' : f?.online ? 'on' : 'off'}`;
  setAv($('chatAv'), f ?? chatWith.name);
  if (f?.frame) $('chatAv').classList.add(`fr-${f.frame}`);
  $('chatWho').className = `nfx-${f?.nameFx ?? 'aucun'}`; $('chatWho').style.setProperty('--pc', f?.color ?? '#3b82f6');
  $('chatSub').textContent = `${f?.playing ? `${dispoTxt(f) ? `${dispoTxt(f).slice(3).replace(/^d/, 'D')} · ` : ''}Joue à ${f.playing}` : f?.online ? (f.status ? `En ligne · « ${f.status} »` : 'En ligne') : 'Hors ligne · il verra ton message à sa prochaine connexion'}${f?.bio ? ` — ${f.bio}` : ''}`;
  $('chatCall').hidden = !f?.online;
  $('chatJoin').hidden = !f?.playing;
  $('chatAsk').hidden = !f?.playing;
  $('chatInvite').hidden = !(state.active.size > 0 && f?.online && !f?.playing);
}
const dayOf = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
// Fils de discussion (amis « f:id », groupes « g:id ») : gardés en mémoire et sur ce PC pour s'afficher tout de suite
const threads = new Map();
const pendingMsgs = new Map(); // identifiant d'envoi -> { key, text, at, failed }
try { for (const [k, v] of JSON.parse(localStorage.getItem('hl-threads') ?? '[]')) if (Array.isArray(v)) threads.set(k, v); } catch { /* rien en cache */ }
function keepThread(key, fil) {
  threads.delete(key); threads.set(key, fil.slice(-80));
  try { localStorage.setItem('hl-threads', JSON.stringify([...threads].slice(-40))); } catch { /* stockage plein ou bloqué */ }
}
const myId = () => state.account?.id ?? 'me';
const gOpen = () => (fx.sel?.type === 'groupe' ? fx.sel.id : null);
const newCid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const threadEl = (key) => (key === `f:${chatWith?.id}` ? $('chatFil') : key === `g:${gOpen()}` ? $('gFil') : null);
const REACTS = ['👍', '😂', '🔥', '❤️', '😮', '😢'];
const replyTo = new Map(); // discussion -> message auquel on répond
const live = { lus: {}, typing: [] };
const safeMsgImg = (u) => (/^https:\/\/[\w.-]+(:\d+)?\/api\/compte\/img\/[\w-]{8,64}$/.test(String(u ?? '')) ? u : null);
const hm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function paintThread(key, { force = false } = {}) {
  const el = threadEl(key);
  if (!el) return;
  const fil = threads.get(key);
  const pend = [...pendingMsgs].filter(([, p]) => p.key === key);
  if (!fil && !pend.length) { el.innerHTML = '<div class="cload"><i></i><i></i><i></i></div>'; return; }
  const group = key.startsWith('g:');
  const members = group ? (state.groups ?? []).find((g) => `g:${g.id}` === key)?.members ?? [] : [];
  const nameOf = (id) => (id === myId() ? { pseudo: 'Toi' } : members.find((m) => m.id === id) ?? state.hist?.amis?.find((a) => a.id === id) ?? { pseudo: '?' });
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  let day = '';
  const list = fil ?? [];
  const lu = group ? 0 : live.lus[key.slice(2)] ?? 0;
  const seenIdx = lu ? list.map((m, i) => [m, i]).filter(([m]) => m.from === myId() && m.at <= lu).at(-1)?.[1] ?? -1 : -1;
  const lastIdx = list.length - 1;
  const html = list.map((m, i) => {
    const d = dayOf(m.at); const sep = d !== day ? `<div class="cday">${esc(d)}</div>` : ''; day = d;
    const them = m.from !== myId();
    const grouped = i > 0 && list[i - 1].from === m.from && m.at - list[i - 1].at < 120_000 && !sep && !m.re;
    const who = group && them && !grouped ? nameOf(m.from) : null;
    const img = safeMsgImg(m.imgUrl);
    const reacts = Object.entries(m.reacts ?? {}).filter(([, ids]) => ids?.length);
    return `${sep}<div class="cmsg ${them ? 'them' : 'me'} ${grouped ? 'grouped' : ''} ${who ? 'named' : ''}" data-mid="${esc(m.id ?? '')}">${who ? `<em class="cname">${avatar(who, 'xs')}${esc(who.pseudo)}</em>` : ''}
      ${m.re ? `<div class="cquote" data-mjump="${esc(m.re.id)}"><b>${esc(nameOf(m.re.from).pseudo)}</b>${esc(m.re.text)}</div>` : ''}
      ${img ? `<img class="cimg" src="${esc(img)}" data-mview="${esc(img)}" alt="Image" loading="lazy">` : ''}${m.file ? `<button type="button" class="cfile" data-mfile="${esc(m.file)}" data-fname="${esc(m.fileName ?? 'fichier')}">📄 <b>${esc(m.fileName ?? 'fichier')}</b><small>${(m.fileSize ?? 0) < 1e6 ? `${Math.max(1, Math.ceil((m.fileSize ?? 0) / 1e3))} Ko` : gb(m.fileSize)} · télécharger</small></button>` : ''}${m.text ? `<span>${esc(m.text)}</span>` : ''}
      ${them && scamCheck(m.text) ? `<em class="scam">⚠ ${esc(scamCheck(m.text))}</em>` : ''}
      ${reacts.length ? `<div class="creacts">${reacts.map(([e, ids]) => `<button type="button" class="creact ${ids.includes(myId()) ? 'mine' : ''}" data-mreact="${e}" data-rid="${esc(m.id)}" title="${esc(ids.map((x) => nameOf(x).pseudo).join(', '))}">${e}<b>${ids.length}</b></button>`).join('')}</div>` : ''}
      <small>${hm(m.at)}${i === seenIdx ? ` · <b class="cseen">Vu${lu && i === lastIdx ? ` à ${hm(lu)}` : ''}</b>` : ''}</small>
      ${m.id ? `<div class="ctools"><button type="button" data-mreply="${esc(m.id)}" title="Répondre">↩</button><button type="button" data-mpick="${esc(m.id)}" title="Réagir">😀</button>${!them ? `<button type="button" data-mdel="${esc(m.id)}" title="Supprimer le message">🗑</button>` : ''}</div>` : ''}</div>`;
  }).join('') + pend.map(([cid, p]) => `<div class="cmsg me ${p.failed ? 'failed' : 'sending'}" data-cid="${esc(cid)}">${p.image ? `<img class="cimg" src="${esc(p.image)}" alt="">` : ''}${p.text ? `<span>${esc(p.text)}</span>` : ''}<small>${p.failed ? `⚠ ${esc(p.failed)} · <button type="button" class="linkbtn" data-mretry="${esc(cid)}">Réessayer</button> · <button type="button" class="linkbtn" data-mdrop="${esc(cid)}">Annuler</button>` : 'envoi…'}</small></div>`).join('');
  if (!force && el.dataset.html === html) return;
  el.dataset.html = html;
  const empty = group ? '<div class="cempty"><span class="cemo">👥</span><b>Discussion du groupe</b><small>Tout le groupe voit les messages ici. Dis bonjour 👋</small></div>' : `<div class="cempty">${avatar(state.hist?.amis?.find((a) => a.id === chatWith?.id) ?? chatWith?.name ?? '?', 'big')}<b>${esc(chatWith?.name ?? '')}</b><small>Pas encore de message : dis bonjour 👋</small></div>`;
  el.innerHTML = html || empty;
  if (atBottom || force) el.scrollTop = el.scrollHeight;
}
// Barre « Répondre à … », ligne « … écrit », messages programmés
const composerIds = (key) => (key?.[0] === 'g' ? { bar: 'gReplyBar', typing: 'gTyping', scheds: 'gScheds', text: 'gText' } : { bar: 'chatReplyBar', typing: 'chatTyping', scheds: 'chatScheds', text: 'chatText' });
const openKey = (kind) => (kind === 'g' ? (gOpen() ? `g:${gOpen()}` : null) : (chatWith ? `f:${chatWith.id}` : null));
function paintReply(key) {
  const ids = composerIds(key); const m = replyTo.get(key);
  $(ids.bar).hidden = !m;
  if (m) $(ids.bar).innerHTML = `<span>↩ Réponse à <b>${esc(m.from === myId() ? 'toi' : (state.hist?.amis?.find((a) => a.id === m.from)?.pseudo ?? (state.groups ?? []).flatMap((g) => g.members).find((x) => x.id === m.from)?.pseudo ?? '?'))}</b> : ${esc(String(m.text || '📷 Image').slice(0, 80))}</span><button type="button" data-rcancel title="Annuler">✕</button>`;
}
function paintTyping() {
  for (const kind of ['f', 'g']) {
    const key = openKey(kind); const el = $(composerIds(key ?? kind).typing);
    if (!key) { el.textContent = ''; continue; }
    const who = live.typing.filter((t) => Date.now() - t.seenAt < 6000 && (kind === 'g' ? t.gid === key.slice(2) : !t.gid && t.from === key.slice(2)))
      .map((t) => state.hist?.amis?.find((a) => a.id === t.from)?.pseudo ?? (state.groups ?? []).flatMap((g) => g.members).find((x) => x.id === t.from)?.pseudo ?? '?');
    el.innerHTML = who.length ? `<i></i><i></i><i></i> ${esc(who.slice(0, 3).join(', '))} ${who.length > 1 ? 'écrivent' : 'écrit'}…` : '';
  }
}
async function paintScheds(key) {
  if (!key) return;
  const list = (await api.schedList?.().catch(() => []) ?? []).filter((x) => x.key === key);
  $(composerIds(key).scheds).innerHTML = list.map((x) => `<div class="csched">⏰ <b>${new Date(x.at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</b><span>${esc(x.text)}</span><button type="button" data-sdel="${esc(x.id)}" title="Annuler">✕</button></div>`).join('');
}
let readTimer = null;
function markRead(key) {
  if (!key || key[0] !== 'f' || !document.hasFocus()) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => api.chatRead?.(key.slice(2)).catch(() => {}), 600);
}
async function loadThread(key) {
  const [kind, id] = [key[0], key.slice(2)];
  const r = await (kind === 'f' ? api.chatThread(id) : api.groupThread?.(id))?.catch(() => null);
  if (!r?.fil) { if (!threads.has(key)) { const el = threadEl(key); if (el) el.innerHTML = `<p class="hint">${esc(r?.error ?? 'Impossible de charger la discussion.')} <button type="button" class="linkbtn" data-mreload="${esc(key)}">Réessayer</button></p>`; } return; }
  keepThread(key, r.fil);
  if (r.lu) live.lus[key.slice(2)] = Math.max(live.lus[key.slice(2)] ?? 0, r.lu);
  paintThread(key);
  if (key[0] === 'g') renderGroups(state.groups ?? []);
  markRead(key);
}
async function openChat(id, name) {
  const f = state.hist?.amis?.find((a) => a.id === id);
  chatWith = { id, name: name ?? f?.pseudo ?? 'Ami' };
  delete unread[id];
  if (state.view !== 'amis') go('amis');
  if (fx.tab !== 'amis') fxTab('amis');
  fxShow({ type: 'ami', id });
  chatHeader();
  paintThread(`f:${id}`, { force: true });
  $('chatText').focus();
  loadThread(`f:${id}`);
  paintReply(`f:${id}`); paintScheds(`f:${id}`); paintTyping();
  if (state.hist) renderHistory();
  updateFriendsBadge();
}
function openGroupChat(id) {
  delete gUnread[id];
  renderGroupDetail();
  $('gMembers').hidden = true;
  paintThread(`g:${id}`, { force: true });
  setTimeout(() => $('gText').focus(), 0);
  loadThread(`g:${id}`);
  paintReply(`g:${id}`); paintScheds(`g:${id}`); paintTyping();
  renderGroups(state.groups ?? []);
  updateFriendsBadge();
}
const refreshChat = () => chatWith && loadThread(`f:${chatWith.id}`);
async function sendMsg(key, text, cid = newCid(), extra = {}) {
  pendingMsgs.set(cid, { key, text, failed: null, ...extra });
  paintThread(key, { force: true });
  const id = key.slice(2);
  const x = { ...(extra.re ? { re: extra.re } : {}), ...(extra.image ? { image: extra.image } : {}), ...(extra.file ? { file: extra.file } : {}) };
  const r = await (key[0] === 'f' ? api.chatSend(id, text, cid, x) : api.groupSend(id, text, cid, x)).catch(() => null);
  if (!r || r.error || (r.status && r.status !== 200)) { pendingMsgs.set(cid, { key, text, failed: r?.error ?? 'Non envoyé', ...extra }); paintThread(key); return; }
  pendingMsgs.delete(cid);
  if (r.fil) keepThread(key, r.fil);
  else keepThread(key, [...(threads.get(key) ?? []), r.message ?? { id: r.id ?? cid, from: myId(), text, at: Date.now() }]);
  paintThread(key, { force: true });
  if (key[0] === 'g') renderGroups(state.groups ?? []);
}
function submitFrom(area, key) {
  const text = area.value.trim();
  if (!text || !key) return;
  area.value = ''; area.style.height = '';
  const re = replyTo.get(key)?.id;
  replyTo.delete(key); paintReply(key);
  sendMsg(key, text, newCid(), re ? { re } : {});
}
$('chatForm').addEventListener('submit', (e) => { e.preventDefault(); if (chatWith) submitFrom($('chatText'), `f:${chatWith.id}`); });
$('gForm').addEventListener('submit', (e) => { e.preventDefault(); if (gOpen()) submitFrom($('gText'), `g:${gOpen()}`); });
let typingSent = 0;
for (const id of ['chatText', 'gText']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } if (e.key === 'Escape') { const k = openKey(id === 'gText' ? 'g' : 'f'); if (k && replyTo.has(k)) { replyTo.delete(k); paintReply(k); } } });
  $(id).addEventListener('input', (e) => {
    const k = openKey(id === 'gText' ? 'g' : 'f');
    if (!k || !e.target.value.trim() || Date.now() - typingSent < 3000) return;
    typingSent = Date.now();
    api.chatTyping?.(k[0], k.slice(2)).catch(() => {});
  });
  if (id === 'gText') $(id).addEventListener('input', (e) => { e.target.style.height = ''; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; });
}
// Répondre, réagir, voir une image, supprimer, réessayer, annuler (discussion d'ami ou de groupe)
function reactPicker(msgEl, mid) {
  document.querySelectorAll('.cpick').forEach((x) => x.remove());
  msgEl.insertAdjacentHTML('beforeend', `<div class="cpick">${REACTS.map((e) => `<button type="button" data-mreact="${e}" data-rid="${esc(mid)}">${e}</button>`).join('')}</div>`);
}
async function react(key, mid, emoji) {
  document.querySelectorAll('.cpick').forEach((x) => x.remove());
  const fil = threads.get(key) ?? [];
  const m = fil.find((x) => x.id === mid); if (!m) return;
  const who = new Set(m.reacts?.[emoji] ?? []);
  if (who.has(myId())) who.delete(myId()); else who.add(myId());
  m.reacts = { ...(m.reacts ?? {}), [emoji]: [...who] };
  keepThread(key, fil); paintThread(key);
  const r = await api.chatReact?.(key[0], key.slice(2), mid, emoji).catch(() => null);
  if (r?.message) { keepThread(key, fil.map((x) => (x.id === mid ? { ...x, reacts: r.message.reacts } : x))); paintThread(key); } else if (!r?.ok) toast(r?.error ?? 'Réaction impossible');
}
for (const fil of ['chatFil', 'gFil']) {
  $(fil).addEventListener('click', async (e) => {
    const key = fil === 'chatFil' ? (chatWith ? `f:${chatWith.id}` : null) : (gOpen() ? `g:${gOpen()}` : null);
    if (!key) return;
    const t = e.target.closest('[data-mdel],[data-mretry],[data-mdrop],[data-mreload],[data-mreply],[data-mpick],[data-mreact],[data-mview],[data-mjump],[data-mfile]'); if (!t) return;
    if (t.dataset.mfile) { api.chatDownload(t.dataset.mfile, t.dataset.fname).then((r) => toast(r?.ok ? `📥 ${r.file} dans Téléchargements` : r?.error ?? 'Téléchargement impossible')); return; }
    if (t.dataset.mreload) return loadThread(key);
    if (t.dataset.mdrop) { pendingMsgs.delete(t.dataset.mdrop); return paintThread(key, { force: true }); }
    if (t.dataset.mretry) { const p = pendingMsgs.get(t.dataset.mretry); if (p) sendMsg(key, p.text, t.dataset.mretry, { re: p.re, image: p.image, file: p.file }); return; }
    if (t.dataset.mreply) { const m = (threads.get(key) ?? []).find((x) => x.id === t.dataset.mreply); if (m) { replyTo.set(key, m); paintReply(key); $(composerIds(key).text).focus(); } return; }
    if (t.dataset.mpick) return reactPicker(t.closest('.cmsg'), t.dataset.mpick);
    if (t.dataset.mreact) return react(key, t.dataset.rid, t.dataset.mreact);
    if (t.dataset.mview) { setModal('wide'), $('modalBox').innerHTML = `<img class="cimgbig" src="${esc(t.dataset.mview)}" alt=""><div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`; $('modal').showModal(); $('modalBox').onclick = (ev) => { if (ev.target.closest('[data-m]')) $('modal').close(); }; return; }
    if (t.dataset.mjump) { const el = $(fil).querySelector(`[data-mid="${CSS.escape(t.dataset.mjump)}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } return; }
    const mid = t.dataset.mdel;
    if (!(await ui.confirm({ title: 'Supprimer ce message ?', text: key[0] === 'g' ? 'Il disparaît pour tout le groupe.' : 'Il disparaît aussi chez ton ami.', ok: 'Supprimer', danger: true, icon: '🗑' }))) return;
    const before = threads.get(key) ?? [];
    keepThread(key, before.filter((m) => m.id !== mid)); paintThread(key);
    const r = await (key[0] === 'f' ? api.chatDelete?.(key.slice(2), mid) : api.groupDelete?.(key.slice(2), mid))?.catch(() => null);
    if (!r?.ok) { keepThread(key, before); paintThread(key); return toast(r?.error ?? 'Suppression impossible pour l’instant'); }
    if (r.fil) { keepThread(key, r.fil); paintThread(key); }
  });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.cpick,[data-mpick]')) document.querySelectorAll('.cpick').forEach((x) => x.remove()); });
// Barre de réponse, messages programmés, pièce jointe (les deux discussions)
for (const kind of ['f', 'g']) {
  const ids = composerIds(kind === 'g' ? 'g:' : 'f:');
  $(ids.bar).addEventListener('click', (e) => { if (e.target.closest('[data-rcancel]')) { const k = openKey(kind); replyTo.delete(k); paintReply(k); } });
  $(ids.scheds).addEventListener('click', async (e) => { const b = e.target.closest('[data-sdel]'); if (!b) return; await api.schedDel?.(b.dataset.sdel); paintScheds(openKey(kind)); toast('Message programmé annulé'); });
  $(kind === 'g' ? 'gForm' : 'chatForm').addEventListener('click', async (e) => {
    const k = openKey(kind); if (!k) return;
    if (e.target.closest('[data-csched]')) return scheduleMsg(k);
    if (e.target.closest('[data-catt]')) return attachMenu(k, e.target.closest('[data-catt]'));
  });
}
async function scheduleMsg(key) {
  const area = $(composerIds(key).text);
  const d = new Date(Date.now() + 60 * 60_000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">⏰</span><h2>Programmer un message</h2></div><p class="hint">Il part tout seul à l’heure choisie (le launcher doit être ouvert, même réduit).</p>
    <textarea class="minput" id="schText" rows="3" maxlength="500" placeholder="Ex. On lance la partie, connectez-vous !">${esc(area.value.trim())}</textarea>
    <label class="field"><span>Quand</span><input type="datetime-local" class="minput" id="schAt" value="${local}"></label>
    <div class="row end"><button type="button" class="btn ghost" data-m="0">Annuler</button><button type="button" class="btn play" data-m="1">Programmer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    if (b.dataset.m === '0') return $('modal').close();
    const text = $('schText').value.trim(); const at = new Date($('schAt').value).getTime();
    if (!text) return toast('Écris le message');
    const r = await api.schedAdd?.(key, text, at);
    if (!r?.ok) return toast(r?.error ?? 'Impossible');
    area.value = ''; $('modal').close(); paintScheds(key);
    toast(`⏰ Message programmé pour ${new Date(at).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`);
  };
}
// Réduire une image du PC avant l'envoi (1600 px max, moins de 1,1 Mo)
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.7, 0.55, 0.4]) { const u = c.toDataURL('image/jpeg', q); if (u.length * 0.75 < 1_100_000) return u; }
  return null;
}
function attachMenu(key, btn) {
  const ctx = $('ctx');
  ctx.innerHTML = '<div class="ctxhead">Envoyer une image</div><button data-att="shot">📷 Une de mes captures</button><button data-att="file">🖼 Une image du PC</button><button data-att="doc">📎 Un fichier (10 Mo max)</button>';
  ctx.hidden = false;
  const r = btn.getBoundingClientRect();
  ctx.style.left = `${r.left}px`; ctx.style.top = `${Math.max(8, r.top - ctx.offsetHeight - 6)}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
  ctx.onclick = async (e) => {
    const b = e.target.closest('[data-att]'); if (!b) return;
    ctx.hidden = true; ctx.onclick = null;
    if (b.dataset.att === 'doc') {
      const inp = document.createElement('input'); inp.type = 'file';
      inp.onchange = async () => {
        const f = inp.files?.[0]; if (!f) return;
        if (f.size > 10 * 1024 * 1024) return toast('Fichier trop gros (10 Mo maximum)');
        toast(`📎 Envoi de ${f.name}…`);
        const r = await api.chatUpload(f.name, new Uint8Array(await f.arrayBuffer())).catch(() => null);
        if (!r?.ok) return toast(r?.error ?? 'Envoi impossible');
        sendMsg(key, '', newCid(), { file: r.id });
      };
      return inp.click();
    }
    if (b.dataset.att === 'file') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
      inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const u = await shrinkImage(f).catch(() => null); if (!u) return toast('Image illisible ou trop lourde'); sendMsg(key, '', newCid(), { image: u }); };
      return inp.click();
    }
    const list = await api.capturesRecent?.().catch(() => []) ?? [];
    setModal('wide'), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">📷</span><h2>Envoyer une capture</h2></div>${list.length ? `<div class="shotpick">${list.map((c) => `<button type="button" data-shot="${esc(c.token)}"><img src="${esc(c.url)}" alt="" loading="lazy"><small>${esc(c.game)} · ${new Date(c.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small></button>`).join('')}</div>` : '<p class="hint">Pas encore de capture : Ctrl+Alt+S pendant une partie.</p>'}
      <div class="row end"><button type="button" class="btn ghost" data-m="0">Annuler</button></div>`;
    $('modal').showModal();
    $('modalBox').onclick = async (ev) => {
      if (ev.target.closest('[data-m]')) return $('modal').close();
      const s2 = ev.target.closest('[data-shot]'); if (!s2) return;
      const u = await api.captureData?.(s2.dataset.shot).catch(() => null);
      if (!u) return toast('Capture illisible');
      $('modal').close(); sendMsg(key, '', newCid(), { image: u });
    };
  };
}
$('chatText').addEventListener('input', (e) => { e.target.style.height = ''; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; });
$('chatAv').addEventListener('click', () => chatWith && openFriendProfile(chatWith.id));
$('chatWho').addEventListener('click', () => chatWith && openFriendProfile(chatWith.id));
$('chatAsk').addEventListener('click', async () => { if (!chatWith) return; const r = await api.friendInvite(chatWith.id, 'ask'); toast(r?.ok ? 'Demande envoyée' : r?.error ?? 'Impossible'); });
$('chatInvite').addEventListener('click', async () => { if (!chatWith) return; const r = await api.friendInvite(chatWith.id, 'invite'); toast(r?.ok ? 'Invitation envoyée' : r?.error ?? 'Impossible'); });
// « ••• » : copier son code, le retirer de mes amis
$('chatMore').addEventListener('click', (e) => {
  const f = state.hist?.amis?.find((a) => a.id === chatWith?.id);
  if (!f) return;
  const ctx = $('ctx');
  ctx.innerHTML = `<div class="ctxhead">${esc(f.pseudo)}</div>${f.code ? `<button data-copytext="${esc(f.code)}" data-copied="Code de ${esc(f.pseudo)} copié">Copier son code ami (${esc(f.code)})</button>` : ''}<hr><button class="danger" data-hrem="${esc(f.id)}" data-name="${esc(f.pseudo)}">Retirer de mes amis</button>`;
  ctx.hidden = false;
  const r = e.target.getBoundingClientRect();
  ctx.style.left = `${Math.min(r.left, window.innerWidth - ctx.offsetWidth - 8)}px`;
  ctx.style.top = `${r.bottom + 6}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
  e.stopPropagation();
});
$('chatCall').addEventListener('click', () => chatWith && startCall(chatWith.id, chatWith.name));
$('chatJoin').addEventListener('click', async () => { if (!chatWith) return; const r = await api.friendJoin(chatWith.id); toast(r?.ok ? 'On rejoint la partie…' : r?.error ?? 'Impossible'); });
function updateFriendsBadge() {
  const online = (state.hist?.amis ?? []).filter((a) => a.online).length + (state.friends?.friends ?? []).filter((f) => f.online).length;
  const n = Object.values(unread).reduce((a, b) => a + b, 0) + Object.values(gUnread).reduce((a, b) => a + b, 0);
  $('friendsOnline').textContent = n ? `${n} ✉` : online || '';
  $('friendsOnline').classList.toggle('hot', n > 0);
}
api.onChatOpen?.((d) => { showFriendTab('history'); setTimeout(() => openChat(d.id), 200); });
// Un message arrivé par la boîte en direct s'ajoute tout de suite au fil (sans recharger toute la discussion)
function applyLive(x) {
  const key = ['msg', 'msgdel'].includes(x.type) || (x.type === 'react' && !x.gid) ? `f:${x.from}` : `g:${x.gid}`;
  const fil = threads.get(key);
  if (x.type === 'react') { if (threadEl(key)) loadThread(key); return false; }
  if (x.type === 'msgdel' || x.type === 'gmsgdel') { if (fil) { keepThread(key, fil.filter((m) => m.id !== x.msg)); paintThread(key); } return false; }
  const m = { id: x.msg ?? x.id, from: x.from, text: x.text, at: x.sentAt ?? x.at };
  if (fil && !fil.some((y) => y.id === m.id)) keepThread(key, [...fil, m].sort((a, b) => a.at - b.at));
  if (threadEl(key)) { paintThread(key); loadThread(key); live.typing = live.typing.filter((t) => t.from !== x.from); paintTyping(); return false; }
  return true;
}
api.onSocial?.((d) => {
  let ding = false;
  for (const x of d.items ?? d.messages ?? []) {
    if (!['msg', 'gmsg', 'msgdel', 'gmsgdel', 'react'].includes(x.type)) continue;
    if (!applyLive(x)) continue;
    ding = true;
    if (x.type === 'msg') unread[x.from] = (unread[x.from] ?? 0) + 1; else gUnread[x.gid] = (gUnread[x.gid] ?? 0) + 1;
  }
  if (ding && document.hasFocus()) window.sfx?.play('notif');
  // « … écrit » et « Vu »
  if (d.typing?.length) { live.typing = [...live.typing.filter((t) => Date.now() - t.seenAt < 6000), ...d.typing.map((t) => ({ ...t, seenAt: Date.now() }))]; paintTyping(); setTimeout(paintTyping, 6200); }
  if (d.lus) { let changed = false; for (const [k, v] of Object.entries(d.lus)) if (v > (live.lus[k] ?? 0)) { live.lus[k] = v; changed = true; } if (changed && chatWith) paintThread(`f:${chatWith.id}`); }
  if (chatWith && (d.items ?? []).some((x) => x.type === 'msg' && x.from === chatWith.id)) markRead(`f:${chatWith.id}`);
  if (state.hist && !state.hist.error && d.amis) {
    state.hist = { ...state.hist, amis: d.amis, demandes: d.demandes ?? state.hist.demandes, groupes: d.groupes ?? state.hist.groupes };
    if (state.view === 'amis') { if (state.ftab === 'history') renderHistory(); if (d.groupes) renderGroups(d.groupes); }
  }
  if (chatWith) chatHeader();
  updateFriendsBadge();
});
// Réponse envoyée depuis la bulle (en jeu) : le fil se met à jour ici aussi
api.onSocialSent?.((d) => { if (d?.fil) { keepThread(d.key, d.fil); paintThread(d.key); } else if (d?.key && threadEl(d.key)) loadThread(d.key); });
api.onGroupOpen?.((d) => { go('amis'); showFriendTab('history'); setTimeout(() => { fxTab('groupes'); fxShow({ type: 'groupe', id: d.id }); }, 200); });
// ---------- Appels vocaux (WebRTC pair à pair, micro avec suppression du bruit et de l'écho) ----------
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
function callUi(state, extra = '') {
  if (!callS) { try { $('callBar').hidePopover(); } catch { /* déjà caché */ } return; }
  if (!$('callBar').matches(':popover-open')) raiseTop();
  $('callWho').textContent = callS.name;
  $('callAv').textContent = callS.name[0]?.toUpperCase() ?? '?';
  $('callBar').classList.toggle('live', state === 'live');
  $('callState').textContent = extra || { ringing: 'Sonnerie…', connecting: 'Connexion…', live: 'En appel' }[state] || state;
}
async function callSetup(id, role, name) {
  if (callS) return toast('Un appel est déjà en cours');
  let mic;
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch { toast('Micro inaccessible : autorise-le dans Windows (Confidentialité › Microphone)'); if (role === 'callee') api.callAnswer(id, false); else api.callEnd(id); return; }
  const pc = new RTCPeerConnection({ iceServers: ICE });
  callS = { id, role, name, pc, mic, after: -1, offered: false, start: null, timer: null, poll: null };
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));
  pc.ontrack = (e) => { $('callAudio').srcObject = e.streams[0]; $('callAudio').play().catch(() => {}); };
  pc.onicecandidate = (e) => { if (e.candidate) api.callSignal(id, { ice: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    if (!callS) return;
    if (pc.connectionState === 'connected' && !callS.start) {
      callS.start = Date.now();
      window.sfx?.play('success');
      callS.timer = setInterval(() => { const s = Math.floor((Date.now() - callS.start) / 1000); callUi('live', `En appel · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); }, 1000);
    }
    if (pc.connectionState === 'failed') callEnd('La connexion a échoué (réseau trop protégé ?)');
  };
  callUi(role === 'caller' ? 'ringing' : 'connecting');
  const tick = async () => {
    if (!callS || callS.id !== id) return;
    const r = await api.callPoll(id, callS.after).catch(() => null);
    if (!callS || callS.id !== id) return;
    if (r?.state && ['ended', 'declined', 'missed'].includes(r.state)) return callEnd({ ended: 'Appel terminé', declined: `${name} a refusé`, missed: `${name} n’a pas répondu` }[r.state]);
    if (r?.state === 'live' && role === 'caller' && !callS.offered) {
      callS.offered = true;
      callUi('connecting');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      api.callSignal(id, { sdp: pc.localDescription.toJSON() });
    }
    for (const sig of r?.signals ?? []) {
      callS.after = Math.max(callS.after, sig.n);
      const d = sig.data ?? {};
      try {
        if (d.sdp) {
          await pc.setRemoteDescription(d.sdp);
          if (d.sdp.type === 'offer') { const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); api.callSignal(id, { sdp: pc.localDescription.toJSON() }); }
        } else if (d.ice) await pc.addIceCandidate(d.ice);
      } catch { /* signal en double ou arrivé trop tôt */ }
    }
    callS.poll = setTimeout(tick, callS.start ? 3000 : 800);
  };
  tick();
}
function callEnd(msg = 'Appel terminé', notify = true) {
  if (!callS) return;
  const { id, pc, mic, timer, poll } = callS;
  clearInterval(timer); clearTimeout(poll);
  try { pc.close(); } catch { /* déjà fermé */ }
  mic.getTracks().forEach((t) => t.stop());
  callS = null;
  callUi();
  $('callAudio').srcObject = null;
  if (notify) api.callEnd(id).catch(() => {});
  toast(`📞 ${msg}`);
}
async function startCall(fid, name) {
  const r = await api.callStart(fid);
  if (r?.error || !r?.id) return toast(r?.error ?? 'Appel impossible');
  window.sfx?.play('call');
  callSetup(r.id, 'caller', name ?? r.avec ?? 'Ami');
}
async function answerCall(callId) {
  ringStop(callId);
  api.callRingDone?.(callId, 'answer');
  const r = await api.callAnswer(callId, true);
  if (r?.error) return toast(r.error);
  callSetup(callId, 'callee', r.avec ?? 'Ami');
}
api.onIncomingCall?.((d) => answerCall(d.callId));
// Sonnerie dans la fenêtre : au-dessus de tout (même d'une fenêtre ouverte), jusqu'à la réponse
function ringStop(callId) {
  if (!ringing || (callId && ringing.callId !== callId)) return;
  clearInterval(ringing.timer); clearTimeout(ringing.end);
  ringing = null;
  try { $('ringBox').hidePopover(); } catch { /* déjà caché */ }
}
api.onCallRinging?.((d) => {
  if (callS || ringing?.callId === d.callId) return;
  ringStop();
  const name = d.pseudo ?? state.hist?.amis?.find((a) => a.id === d.from)?.pseudo ?? 'Un ami';
  $('ringWho').textContent = name;
  $('ringAv').textContent = name[0]?.toUpperCase() ?? '?'; $('ringAv').style.setProperty('--h', hueOf(name));
  ringing = { callId: d.callId, timer: setInterval(() => window.sfx?.play('call'), 2600), end: setTimeout(() => ringStop(d.callId), 45_000) };
  window.sfx?.play('call');
  raiseTop();
});
api.onCallRingStop?.((d) => ringStop(d.callId));
$('ringYes').addEventListener('click', () => ringing && answerCall(ringing.callId));
$('ringNo').addEventListener('click', () => { if (!ringing) return; const id = ringing.callId; ringStop(id); api.callRingDone?.(id, 'hangup'); api.callAnswer(id, false); });
api.onCallStart?.((d) => { const f = state.hist?.amis?.find((a) => a.id === d.id); startCall(d.id, f?.pseudo); });
$('callHang').addEventListener('click', () => callEnd('Tu as raccroché'));
$('callMute').addEventListener('click', () => {
  if (!callS) return;
  const on = callS.mic.getAudioTracks()[0];
  on.enabled = !on.enabled;
  $('callMute').classList.toggle('off', !on.enabled);
  $('callMute').textContent = on.enabled ? '🎙' : '🔇';
});
const whenTxt = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
function renderEvents() {
  $('eventsList').innerHTML = (state.events ?? []).length ? state.events.map((e) => {
    const yes = e.invites.filter((i) => i.reponse === 'oui').length + 1;
    const live = e.at <= Date.now();
    return `<div class="fxrow eve2 ${fx.sel?.id === e.id ? 'sel' : ''}" data-esel="${esc(e.id)}">
      <span class="edate"><b>${new Date(e.at).getDate()}</b><small>${new Date(e.at).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span>
      <div class="fxrinfo"><b>${esc(e.game)}</b><small>${live ? 'En cours' : new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${yes} participant${yes > 1 ? 's' : ''}${!e.mine && e.ma == null ? ' · à répondre' : ''}</small></div>
      ${!e.mine && e.ma == null ? '<em class="fxbadge">!</em>' : ''}
    </div>`;
  }).join('') : (state.hist && !state.hist.error && state.hist.status !== 401 ? '<div class="fxnote">Aucune soirée prévue. Clique « Organiser » pour en créer une.</div>' : needLogin);
  fxCounts();
  if (fx.sel?.type === 'soiree') { if (state.events.some((x) => x.id === fx.sel.id)) renderEventDetail(); else fxShow(null); }
}
function renderEventDetail() {
  const e = (state.events ?? []).find((x) => x.id === fx.sel?.id);
  if (!e) return;
  const game = state.items.find((i) => i.installed && i.name === e.game);
  const rep = { oui: 'vient', non: 'ne peut pas' };
  $('fxDetail').innerHTML = `<div class="dhead"><span class="edate big"><b>${new Date(e.at).getDate()}</b><small>${new Date(e.at).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span><div class="dwho"><b>${esc(e.game)}</b><small>${e.at <= Date.now() ? 'En cours' : esc(whenTxt(e.at))}</small></div>
      ${e.mine ? `<button class="btn ghost sm" data-ecancel="${esc(e.id)}">Annuler la soirée</button>` : ''}</div>
    <div class="dbody">
      ${e.mine ? '' : `<div class="dacts"><button class="btn ${e.ma === 'oui' ? 'play' : ''}" data-eresp="${esc(e.id)}" data-r="oui">Je viens</button><button class="btn ${e.ma === 'non' ? 'play' : ''}" data-eresp="${esc(e.id)}" data-r="non">Pas dispo</button>${game ? `<button class="btn ghost" data-id="${esc(game.id)}">Voir le jeu</button>` : ''}</div>`}
      ${e.mine && game ? `<div class="dacts"><button class="btn ghost" data-id="${esc(game.id)}">Voir le jeu</button></div>` : ''}
      <div class="dsec">Participants</div>
      <div class="dlist"><div class="drow">${avatar(e.organisateur, 'sm')}<div class="fxrinfo"><b>${esc(e.mine ? 'Toi' : e.organisateur)}</b><small>organise</small></div></div>
      ${e.invites.map((i) => `<div class="drow">${avatar(i.pseudo, 'sm')}<div class="fxrinfo"><b>${esc(i.pseudo)}</b><small class="${i.reponse === 'oui' ? 'ok' : i.reponse === 'non' ? 'no' : ''}">${rep[i.reponse] ?? 'pas encore répondu'}</small></div></div>`).join('')}</div>
      <p class="hint">Rappel automatique 10 min avant pour tous ceux qui viennent.</p>
    </div>`;
}
$('eNew').addEventListener('click', () => { if (!(state.hist?.amis ?? []).length) return toast('Ajoute d’abord des amis History'); fxShow({ type: 'nouvelleSoiree', id: 'new' }); });
$('eCancelForm').addEventListener('click', () => fxShow(null));
function showFriendTab(tab) {
  state.ftab = tab;
  document.querySelectorAll('#friendTabs button').forEach((b) => b.classList.toggle('on', b.dataset.ftab === tab));
  $('hFriends').hidden = tab !== 'history'; $('hRequests').hidden = tab !== 'history';
  $('friendsBody').hidden = tab !== 'steam';
  if (fx.sel?.type === (tab === 'history' ? 'steam' : 'ami')) fxShow(null);
  if (tab === 'history') loadHistory(); else { renderFriends(); loadFriends(); }
}
$('stChips').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; $('myStatus').value = b.dataset.st; $('saveStatus').click(); if (b.dataset.st.startsWith('⛔')) api.setSettings({ dnd: true }); });
$('saveStatus').addEventListener('click', async () => { await api.setSettings({ status: $('myStatus').value }); toast($('myStatus').value.trim() ? 'Statut mis à jour' : 'Statut retiré'); });
$('copyInvite').addEventListener('click', async () => { const code = $('myCode').textContent; if (!code || code === '—') return toast('Connecte-toi d’abord'); await copyText(`history://ami/${encodeURIComponent(code)}`); toast('Lien copié : envoie-le à tes potes (ils cliquent → demande d’ami)'); });
api.onInvite?.(async (d) => {
  if (!(await ui.confirm({ title: 'Ajouter cet ami ?', text: `Envoyer une demande d’ami à ${d.code} ?`, ok: 'Ajouter', icon: '👥' }))) return;
  const r = await api.hFriendAdd(d.code);
  toast(r?.amis ? 'Vous êtes maintenant amis !' : r?.envoye ? 'Demande envoyée' : r?.error ?? 'Impossible');
});
$('copyCode').addEventListener('click', async () => { const c = $('myCode').textContent; if (!c || c === '—' || c === '…') return toast('Connecte-toi d’abord'); await copyText(c); toast('Code copié'); });
$('addFriend').addEventListener('click', async () => {
  const code = $('addCode').value.trim();
  if (!code) return;
  const r = await api.hFriendAdd(code);
  toast(r?.amis ? 'Vous êtes maintenant amis !' : r?.envoye ? 'Demande envoyée' : r?.error ?? 'Impossible pour l’instant');
  if (r?.amis || r?.envoye) { $('addCode').value = ''; $('fxAdd').hidden = true; loadHistory(); }
});
$('eCreate').addEventListener('click', async () => {
  const invites = [...document.querySelectorAll('#eInvites input:checked')].map((i) => i.value);
  if (!invites.length) return toast('Coche au moins un ami');
  const r = await api.eventCreate({ jeu: $('eGame').value, at: new Date($('eAt').value).getTime(), invites });
  if (r?.soirees) { state.events = r.soirees; renderEvents(); toast('Invitations envoyées'); const e = r.soirees.filter((x) => x.mine).sort((a, b) => b.at - a.at)[0]; fxShow(e ? { type: 'soiree', id: e.id } : null); } else toast(r?.error ?? 'Impossible pour l’instant');
});
setInterval(() => { if (!document.hidden && state.view === 'amis' && state.ftab === 'history') loadHistory(); }, 60_000);
setInterval(() => { if (!document.hidden && state.view === 'amis' && state.ftab === 'steam') loadFriends(); }, 60_000);

// ---------- Centre de notifications : l'appli et les amis, avec les actions qui restent possibles ----------
const nc = { tab: 'tout', list: [], unread: 0 };
function sinceTxt(t) {
  const m = (Date.now() - t) / 60_000;
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${Math.round(m)} min`;
  if (m < 6 * 60) return `il y a ${Math.round(m / 60)} h`;
  const d = new Date(t);
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `aujourd’hui ${hm}` : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${hm}`;
}
function bellCount(n) {
  nc.unread = n;
  $('bellCount').textContent = n ? (n > 99 ? '99+' : String(n)) : '';
  $('bellBtn').classList.toggle('has', n > 0);
}
async function loadNotifs() {
  const r = await api.notifs?.().catch(() => null);
  if (!r) return;
  nc.list = r.list; bellCount(r.unread);
  if ($('notifCenter').matches(':popover-open')) renderNotifs();
}
function notifActions(e) {
  const age = Date.now() - e.at;
  const b = (a, label, cls = '') => `<button class="btn sm ${cls}" data-nact="${a}" data-nid="${esc(e.id)}">${label}</button>`;
  if (e.done && !['msg', 'group', 'missed', 'app'].includes(e.kind)) return `<small class="ncdone">${{ accept: '✓ Accepté', decline: 'Refusé', answer: '✓ Décroché', hangup: 'Refusé', join: '✓ Rejoint', saveget: '✓ Reçue' }[e.done] ?? '✓ Fait'}</small>`;
  if (e.kind === 'msg' || e.kind === 'group') return `${b('reply', '💬 Répondre', 'play')}${e.join ? b('join', '▶ Rejoindre') : ''}`;
  if ((e.kind === 'ask' || e.kind === 'invite') && age < 15 * 60_000) return `${b('accept', e.kind === 'invite' ? '▶ Rejoindre' : '✓ Accepter', 'play')}${b('decline', 'Refuser', 'ghost')}`;
  if (e.kind === 'reply' && e.join && age < 30 * 60_000) return b('join', '▶ Rejoindre', 'play');
  if (e.kind === 'playing' && age < 30 * 60_000) return `${e.join ? b('join', '▶ Rejoindre', 'play') : ''}${b('ask', '🎮 On joue ?')}`;
  if (e.kind === 'call' && age < 45_000) return `${b('answer', '📞 Décrocher', 'play')}${b('hangup', 'Refuser', 'ghost')}`;
  if (e.kind === 'missed' && e.from) return b('callback', '📞 Rappeler', 'play');
  if (e.kind === 'share' && age < 86_400_000) return b('saveget', '💾 Recevoir', 'play');
  if (e.kind === 'heat') return b('help', '🆘 Demander de l’aide', 'play');
  if (e.file) return `${b('play', 'Ouvrir')}${b('folder', 'Dossier', 'ghost')}`;
  return '';
}
// Visage de la notification : la photo de l'ami (ou son initiale), sinon le logo du launcher
function ncFace(e) {
  const f = e.from ? (state.hist?.amis ?? []).find((a) => a.id === e.from) ?? (state.hist?.demandes ?? []).find((a) => a.id === e.from) : null;
  const name = f?.pseudo ?? (e.cat === 'amis' ? String(e.title).replace(/^(Appel manqué de |)/, '').split(/[ ·]/)[0] : null);
  if (f || name) return `<span class="ncface">${avatar(f ?? name, 'sm')}<i class="ncbadge">${esc(e.icon)}</i></span>`;
  return '<span class="ncface app"><img src="icon.png" alt=""></span>';
}
function renderNotifs() {
  const list = nc.list.filter((e) => nc.tab === 'tout' || e.cat === nc.tab);
  document.querySelectorAll('#ncTabs [data-nc]').forEach((x) => x.classList.toggle('on', x.dataset.nc === nc.tab));
  if (!list.length) { $('ncList').innerHTML = `<div class="ncempty"><span>🔔</span><b>Rien pour l’instant</b><small>${nc.tab === 'amis' ? 'Messages, appels et invitations de tes amis arrivent ici.' : 'Tes notifications s’afficheront ici.'}</small></div>`; return; }
  const today = new Date().toDateString(); const yest = new Date(Date.now() - 86_400_000).toDateString();
  let head = '';
  $('ncList').innerHTML = list.map((e) => {
    const d = new Date(e.at).toDateString();
    const h = d === today ? 'Aujourd’hui' : d === yest ? 'Hier' : 'Plus ancien';
    const sep = h !== head ? `<div class="ncday">${h}</div>` : ''; head = h;
    return `${sep}<div class="ncitem ${e.read ? '' : 'unread'} ${e.cat}" data-nopen="${esc(e.id)}">
      ${ncFace(e)}
      <div class="ncbody"><b>${esc(e.title)}</b>${e.body ? `<p>${esc(e.body)}</p>` : ''}<div class="ncfoot"><small>${esc(sinceTxt(e.at))}</small><div class="ncacts">${notifActions(e)}</div></div></div>
    </div>`;
  }).join('');
}
// Toujours ancré sous la cloche, calculé avant l'affichage (pas de saut d'un côté à l'autre)
$('notifCenter').addEventListener('beforetoggle', (e) => { if (e.newState === 'open') { const r = $('bellBtn').getBoundingClientRect(); const w = Math.min(420, window.innerWidth - 24); $('notifCenter').style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 12))}px`; $('notifCenter').style.right = 'auto'; } });
$('notifCenter').addEventListener('toggle', (e) => { if (e.newState === 'open') { renderNotifs(); loadNotifs(); } else if (nc.unread) api.notifsRead?.().then((r) => { bellCount(r?.unread ?? 0); nc.list.forEach((x) => { x.read = true; }); }); });
$('ncTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-nc]'); if (t) { nc.tab = t.dataset.nc; renderNotifs(); } });
$('ncRead').addEventListener('click', async () => { const r = await api.notifsRead?.(); nc.list.forEach((x) => { x.read = true; }); bellCount(r?.unread ?? 0); renderNotifs(); });
$('ncClear').addEventListener('click', async () => { const r = await api.notifsClear?.(nc.tab === 'tout' ? null : nc.tab); if (r) { nc.list = r.list; bellCount(r.unread); renderNotifs(); } });
$('ncList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-nact]');
  if (b) {
    const entry = nc.list.find((x) => x.id === b.dataset.nid);
    b.disabled = true;
    if (b.dataset.nact === 'help') { $('notifCenter').hidePopover(); return openHelp('Mon PC chauffe en jeu', entry?.body ?? ''); }
    if (b.dataset.nact === 'reply' && entry?.from) { $('notifCenter').hidePopover(); go('amis'); showFriendTab('history'); setTimeout(() => openChat(entry.from), 200); api.notifsRead?.(entry.id); return; }
    const r = await api.notifsAct?.(b.dataset.nid, b.dataset.nact);
    if (r?.call) { $('notifCenter').hidePopover(); startCall(r.call, state.hist?.amis?.find((a) => a.id === r.call)?.pseudo); }
    if (entry) { entry.read = true; entry.done = b.dataset.nact; }
    return renderNotifs();
  }
  const item = e.target.closest('[data-nopen]');
  if (item) { const entry = nc.list.find((x) => x.id === item.dataset.nopen); if (entry && !entry.read) { entry.read = true; item.classList.remove('unread'); const r = await api.notifsRead?.(entry.id); bellCount(r?.unread ?? 0); } }
});
api.onNotifs?.((d) => {
  if (typeof d?.unread === 'number') bellCount(d.unread);
  if (d?.entry) { nc.list = [d.entry, ...nc.list.filter((x) => x.id !== d.entry.id)].slice(0, 150); $('bellBtn').classList.remove('ding'); void $('bellBtn').offsetWidth; $('bellBtn').classList.add('ding'); }
  if ($('notifCenter').matches(':popover-open')) (d?.entry ? renderNotifs() : loadNotifs());
});
loadNotifs();

// ---------- Résumé de la semaine ----------
function showRecap(r) {
  const trend = r.change == null ? '' : r.change >= 0 ? `<span class="up">▲ ${r.change} %</span> par rapport à la semaine d’avant` : `<span class="down">▼ ${-r.change} %</span> par rapport à la semaine d’avant`;
  const max = r.top[0]?.minutes || 1;
  $('recapBody').innerHTML = r.minutes ? `
    <div class="recapbig"><b>${hours(r.minutes)}</b><small>de jeu la semaine dernière · ${r.count} jeu${r.count > 1 ? 'x' : ''}</small><div class="hint">${trend}</div></div>
    ${r.top.map((g, n) => `<div class="rrow" data-id="${esc(g.id)}" style="--c:#2f8bff"><span class="n">${MEDALS[n + 1]}</span><div><b>${esc(g.name)}</b></div><div class="barw"><i style="width:${(g.minutes / max) * 100}%"></i></div><span class="t">${hours(g.minutes)}</span></div>`).join('')}` : '<div class="empty">Pas de partie la semaine dernière. Cette semaine, c’est la bonne 😉</div>';
  $('recapDlg').showModal();
}
$('openRecap').addEventListener('click', () => api.recap?.().then(showRecap));

// ---------- Thèmes ----------
const THEMES = { bleu: '#2f8bff', violet: '#8b5cf6', rouge: '#ef4444', vert: '#22c55e', orange: '#f97316', rose: '#ec4899' };
function mix(hex, other, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(other)];
  return `#${a.map((v, i) => Math.round(v * (1 - k) + b[i] * k).toString(16).padStart(2, '0')).join('')}`;
}
function applyTheme(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) return;
  const root = document.documentElement.style;
  root.setProperty('--blue', color);
  root.setProperty('--blue-2', mix(color, '#000000', 0.35));
  root.setProperty('--cyan', mix(color, '#ffffff', 0.35));
}
let themeName = 'bleu';
async function themeFor(item) {
  if (themeName !== 'auto' || !item) return;
  const c = await api.colorOf?.(item.id).catch(() => null);
  if (themeName === 'auto' && state.sel?.id === item.id) applyTheme(c ?? THEMES.bleu);
}

// Fond de l'appli : jaquette floue du jeu, dégradé animé ou sobre
const setBg = (m) => { document.body.dataset.bg = m; document.body.dataset.ambient = m === 'jeu' ? 'on' : 'off'; if (m !== 'jeu') $('ambient').classList.remove('on'); };
let savedTheme = { theme: 'bleu', themeColor: '#2f8bff', bgMode: 'jeu', neon: 90 }; let themeBusy = false;
function previewTheme() {
  themeName = $('themeSel').value; $('themeColor').hidden = themeName !== 'perso';
  if (themeName === 'auto') themeFor(state.sel); else applyTheme(themeName === 'perso' ? $('themeColor').value : THEMES[themeName]);
  setBg($('bgMode').value); document.documentElement.dataset.neon = Number($('neonIntensity').value) === 0 ? 'off' : 'on'; document.documentElement.style.setProperty('--neon-intensity', Number($('neonIntensity').value) / 100);
  $('neonValue').textContent = `${$('neonIntensity').value} %`;
}
function restoreTheme() {
  $('themeSel').value = savedTheme.theme; $('themeColor').value = savedTheme.themeColor; $('bgMode').value = savedTheme.bgMode; $('neonIntensity').value = savedTheme.neon;
  previewTheme(); $('themeApply').disabled = true; $('themeCancel').disabled = true; $('themeStatus').textContent = 'Ton thème est enregistré.';
}
for (const id of ['themeSel','themeColor','bgMode','neonIntensity']) $(id).addEventListener('input', () => { previewTheme(); $('themeApply').disabled = false; $('themeCancel').disabled = false; $('themeStatus').textContent = 'Aperçu · applique pour enregistrer.'; });
$('themeCancel').addEventListener('click', restoreTheme);
$('settings').addEventListener('close', () => { if (!themeBusy) restoreTheme(); });
$('themeApply').addEventListener('click', async () => {
  if (themeBusy) return; themeBusy = true;
  const ids = ['themeSel','themeColor','bgMode','neonIntensity','themeApply','themeCancel']; ids.forEach((id) => { $(id).disabled = true; });
  const value = { theme: $('themeSel').value, themeColor: $('themeColor').value, bgMode: $('bgMode').value, neon: Number($('neonIntensity').value) };
  try { const r = await api.setSettings(value); if (r?.error) throw new Error(r.error); savedTheme = value; $('themeStatus').textContent = 'Thème enregistré.'; }
  catch (e) { $('themeStatus').textContent = e.message; }
  finally { themeBusy = false; ids.forEach((id) => { $(id).disabled = false; }); if (!$('settings').open) restoreTheme(); }
});
$('dailyLimit').addEventListener('change', (e) => api.setSettings({ dailyLimit: Number(e.target.value) }).then(() => toast(Number(e.target.value) ? 'Limite enregistrée' : 'Pas de limite')));
$('breakEvery').addEventListener('change', (e) => api.setSettings({ breakEvery: Number(e.target.value) }));
api.settings?.().then((s) => {
  savedTheme = { theme: s?.theme ?? 'bleu', themeColor: s?.themeColor ?? '#2f8bff', bgMode: s?.bgMode ?? 'jeu', neon: s?.neon ?? 90 }; restoreTheme();
  themeName = s?.theme ?? 'bleu';
  $('themeSel').value = themeName; $('dailyLimit').value = String(s?.dailyLimit ?? 0); $('breakEvery').value = String(s?.breakEvery ?? 0);
  if (s?.themeColor) $('themeColor').value = s.themeColor;
  $('themeColor').hidden = themeName !== 'perso';
  if (themeName !== 'auto') applyTheme(themeName === 'perso' ? $('themeColor').value : THEMES[themeName] ?? THEMES.bleu);
  $('bgMode').value = s?.bgMode ?? 'jeu'; setBg($('bgMode').value);
}).catch(() => {});

// ---------- Quoi de neuf (après chaque mise à jour) ----------
// Nouveautés par version : après une mise à jour, un court message avec l'essentiel (titres seulement)
const CHANGELOG = {
  '0.57.3': [
    ['🌍', 'Ton PC de n’importe où', 'Plus besoin d’être chez toi : connecte-toi sur l’appli téléphone avec ton compte (le QR ne sert qu’une fois), choisis ton PC et contrôle-le en 4G. Nouveau : « Veille + réveil » met le PC en veille et le rallume tout seul à l’heure choisie. Les ordres arrivent plus vite.', ['#openSettings', 'wait700', '.setnav [data-pane="telephone"]', 'wait1200']],
  ],
  '0.57.2': [
    ['📱', 'Appli téléphone : jeux et Opti Pro', 'Les pochettes de tes jeux s’affichent sur le téléphone (images Steam en secours). L’Opti Pro y repart de zéro quand la dernière est finie, et tu peux écrire au technicien ou la refaire depuis le téléphone.', ['#openSettings', 'wait700', '.setnav [data-pane="telephone"]', 'wait1200']],
  ],
  '0.57.1': [
    ['💶', 'Préparer la vente corrigé', 'La fenêtre se ferme (✕ en haut ou Échap), défile pour voir le prix de toutes les pièces, et « Copier l’annonce » marche. « Copier l’image » de la carte avant / après aussi.', ['[data-view=pc]', 'wait600', '[data-pctab=verifs]', 'wait2500', '#mvSell', 'wait800']],
    ['🧰', 'Outils IA rangés', 'Les outils de l’IA sont classés : Dépannage, Tes jeux, Achat et sécurité.'],
  ],
  '0.57.0': [
    ['💾', 'Stockage', 'Mon PC › Stockage : la place de chaque disque comme dans Windows, et tout ce qui prend de la place trié par taille (jeux, applis, dossiers, fichiers) avec leur logo. Recherche, tri, ouvrir l’emplacement, supprimer ou désinstaller en un clic.', ['[data-view=pc]', 'wait600', '[data-pctab=stockage]', 'wait2500']],
    ['🕰', 'Fichiers anciens', 'Un bouton liste tout ce que tu n’as pas ouvert depuis 3, 6, 9 ou 12 mois (jeux morts, vieux téléchargements…). Tu décoches ce que tu gardes : les fichiers vont dans la corbeille, les jeux se réinstallent depuis leur boutique.'],
    ['🔁', 'Refaire l’Opti Pro', 'Un bouton à la fin du ticket : nouvelle Opti Pro avec seulement ce qui reste à faire. Ce que tu as déjà validé n’apparaît plus, rien n’est remis à zéro, pas de clé USB ni de formatage.'],
    ['⭐', 'Note au centre de l’écran', 'Quand ton Opti Pro est finie, une fenêtre s’ouvre pour noter le technicien avec de grandes étoiles.'],
    ['💶', 'Préparer la vente refait', 'Prix conseillé en grand, ton annonce prête à copier, le prix de chaque pièce et les étapes avant de vendre.'],
  ],
  '0.56.0': [
    ['📱', 'Appli téléphone refaite', 'Scanne le QR code de Paramètres › Téléphone : ton téléphone se connecte direct à ton compte ET à ce PC, même en 4G. Lance un jeu, ferme-le, prends une capture, mets le PC en veille ou éteins-le à distance. Style du launcher, plus simple.', ['#openSettings', 'wait700', '.setnav [data-pane="telephone"]', 'wait1200']],
    ['🧪', 'Vérifs refaites', 'Mon PC › Vérifs : un résumé clair, les réglages à revoir en grandes cartes, et le vrai prix de revente de ton PC composant par composant (carte graphique, processeur, RAM, disques, carte mère).', ['[data-view=pc]', 'wait600', '[data-pctab=verifs]', 'wait2500']],
    ['📸', 'Carte avant / après refaite', 'Nouvelle carte à partager sur Discord, et le score « après » est maintenant mesuré à nouveau pour de vrai (réglages compris) au lieu de reprendre l’ancien.'],
    ['🧰', 'Outils de l’IA', 'La barre d’outils de l’IA est remplacée par un simple bouton « 🧰 Outils ».'],
    ['🌬', 'Mon PC et Optimisation aérés', 'Plus d’espace partout, onglets mieux rangés : les mêmes fonctions, en plus lisible.'],
  ],
  '0.55.1': [
    ['📱', 'Appli History sur téléphone', 'Gratuite et sans store : amis et messages, ticket Opti Pro et accès à ton PC. QR code dans Paramètres › Téléphone pour l’installer en 2 secondes.', ['#openSettings', 'wait700', '.setnav [data-pane="telephone"]', 'wait1200']],
  ],
  '0.55.0': [
    ['🔐', 'Sécurité & compte', 'Appareils connectés (déconnecte-les à distance), code PIN du launcher, contrôle parental, export de toutes tes données, suppression du compte, alerte si ton mot de passe a fuité, analyse antivirus des mods et alerte si un outil peut te faire bannir.', ['#openSettings', 'wait700', '.setnav [data-pane="compte"]', 'wait1200']],
    ['🎨', 'Confort et design', 'Mode clair, couleurs pour daltoniens, animations réduites, packs de sons, mode focus (Ctrl+Maj+F), Ctrl+Z pour annuler, économiseur d’écran, bande-annonce en fond, menus en anglais, accueil guidé et astuce du jour.'],
    ['🎄', 'Saisons', 'Calendrier de l’Avent, feux d’artifice du Nouvel an, Saint-Valentin, été, anniversaire de ton compte et ton récap de l’année.'],
    ['📱', 'Téléphone', 'Installer un jeu, températures, notifications, clips, ticket Opti Pro, veille / extinction, second écran et mode TV depuis ton téléphone. QR code pour lier Discord.'],
    ['📊', 'Statistiques et Premium', 'Statistiques avancées (jour préféré, heure de pointe, record, tendance) et ce que Premium t’a apporté. 200 Mo par jeu pour les sauvegardes en ligne avec Premium.'],
  ],
  '0.54.0': [
    ['🧩', 'Tes composants, un par un', 'Mon PC › Composants montre chaque pièce de TON PC en 3D réaliste (rendue dans Blender) : Ryzen AM4/AM5 ou Intel Core, RTX / GTX / Radeon / Arc, DDR4 / DDR5 / SO-DIMM, SSD NVMe / SATA ou disque dur, avec la marque, le modèle exact et ses détails.', ['[data-view="pc"]', 'wait700', '#pcTabs [data-pctab="composants"]', 'wait1800']],
    ['🧪', 'Onglet Vérifs', 'Écran bridé en Hz, câble branché sur la carte mère, PCIe, double canal, XMP, Secure Boot, TPM, pilotes, BIOS, disques presque pleins, écrans bleus expliqués, batterie. Plus : revente estimée, alim et écran conseillés, températures sur 30 jours, rappel de poussière, test de stabilité, test RAM, test souris, journal avec annulation une par une, jeux à réinstaller.'],
    ['🎬', 'BIOS animé dans Opti Pro', 'Où cliquer dans TON BIOS (MSI, ASUS, Gigabyte, ASRock) en animation, sur l’appli et sur Discord. Et aussi : chrono d’étape, mode express, note du technicien, carte avant / après à partager, badge « PC optimisé », suivi chaque mois, nouveau PC détecté.'],
    ['🤖', 'Outils IA', 'Expliquer une erreur, lire une capture, réglages graphiques pour ton PC, guide d’un jeu, pourquoi ton jeu plante, patch notes en 3 lignes, comparer 2 composants, risque de panne, détecteur d’arnaque. Mode débutant et mémoire de ton PC.'],
    ['🎮', 'Bibliothèque', 'Filtre « Jamais lancés », options de lancement par jeu, fusionner deux fiches, collections par genre, bande-annonce et avis Steam, historique des versions, alerte de sortie des jeux de ta liste de souhaits, inviter un ami sur un jeu, offrir un jeu Steam, coéquipiers par jeu et rang.'],
    ['⭐', 'Premium', 'Formule 1 an (12 mois pour le prix de 10), promos de saison automatiques, paliers de parrainage, 3 jours offerts pour un avis, page de remerciement.'],
  ],
  '0.53.40': [
    ['🧭', 'Mini-launcher réparé', 'Les pochettes des jeux s’affichent dans le mini-launcher de la barre des tâches, et le bouton « Ouvrir History Launcher » n’est plus coupé : la fenêtre prend la hauteur qu’il faut.', ['.side nav button:nth-child(1)', 'wait900']]
  ],
  '0.53.39': [
    ['🎮', 'Fortnite est de retour', 'Fortnite n’apparaissait plus dans la bibliothèque quand il n’était pas installé (Epic le range dans les « applications »). Il revient, avec le bouton pour l’installer.', ['.side nav button:nth-child(2)', 'wait900']],
    ['🧭', 'Mini-launcher dans la barre des tâches', 'Clique sur l’icône History à côté de l’horloge : tes 5 derniers jeux avec leur pochette et « ▶ Jouer », la recherche de tous tes jeux, la santé du PC, la température du processeur et tes amis en jeu. Clic droit sur l’icône pour ouvrir le launcher en grand.']
  ],
  '0.53.38': [
    ['🎯', 'Un plan pour chaque demande', 'Opti Pro : chaque ticket a son propre plan, calculé d’après ton PC, tes jeux et ce que tu veux (refroidissement d’abord si ça chauffe, formatage si ça rame, XMP / double canal, réseau, stream…). Les points faisables par le launcher ont leur bouton « ⚡ Le faire pour moi ».', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']],
    ['🔥', 'Overclocking seulement si ça vaut le coup', 'L’overclocking du processeur est proposé seulement s’il est possible ET rentable (jeux limités par le processeur, bon refroidissement, pas sur portable). Il faut le demander soi-même, après un message d’avertissement.']
  ],
  '0.53.37': [
    ['⚡', 'Le technicien le fait pour toi', 'Opti Pro : quand un réglage peut être fait par le launcher (optimisation Windows, alimentation, nettoyage, réparation, disques, anciens pilotes, dernier pilote graphique, clé USB, mesure), le technicien met un bouton « ⚡ Le faire pour moi ». Une validation, et c’est fait. Le BIOS et le panneau NVIDIA restent guidés.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']],
    ['🖱', 'La page ne remonte plus', 'Opti Pro : « Continuer », « Détail » et les autres boutons gardent ta position sur la page.']
  ],
  '0.53.36': [
    ['💬', 'Tout le message du technicien', 'Opti Pro : les phrases et les questions du technicien (pas seulement les listes) font partie du parcours. « Continuer » passe dessus aussi, et un clic sur n’importe quelle partie floutée l’affiche.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']]
  ],
  '0.53.35': [
    ['📷', 'Envoie des captures au technicien', 'Opti Pro : dans « 💬 Écrire au technicien », ajoute jusqu’à 3 captures ou photos (écran du BIOS, message d’erreur, réglages…) ou colle-les avec Ctrl+V. Le technicien IA les regarde pour t’aider plus précisément. Sur Discord, envoie simplement l’image dans ton fil.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1200', '[data-pa=ask]', 'wait700']]
  ],
  '0.53.34': [
    ['🖱', 'Plus de saut de page', 'Opti Pro : la page ne remonte plus toute seule. Le ticket se met à jour seulement quand il y a du nouveau.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']],
    ['📏', 'Plus de place', 'Les messages du technicien et le détail pas à pas prennent toute la hauteur de la fenêtre. Les boutons « Passer » sont retirés : chaque étape se valide avec « Fait ».']
  ],
  '0.53.33': [
    ['🖱', 'Défilement réparé', 'Opti Pro : la molette fait défiler seulement les messages du technicien, plus toute la page, et la page ne saute plus toute seule pendant que tu lis.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']]
  ],
  '0.53.32': [
    ['🎯', 'Concentration totale', 'Opti Pro : les titres des autres parties (Mémoire, Mets à jour ton BIOS…) sont floutés aussi. Seuls la tâche en cours et son titre restent nets.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']]
  ],
  '0.53.31': [
    ['🎯', 'Une tâche à la fois', 'Opti Pro : dans la réponse du technicien, seule la tâche en cours est nette, les autres sont floutées. « Continuer ▶ » passe à la suivante, « 📖 Détail pas à pas » explique tout (touches, menus de TA carte mère, valeurs, comment vérifier) et cache le reste pour rester concentré.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500', '[data-pfa=detail]', 'wait900']],
    ['🧼', 'Messages plus sobres', 'Les messages du technicien sont plus simples, sans couleurs partout, avec une barre de progression des étapes. « 💬 Écrire au technicien » s’ouvre dans une fenêtre à part.']
  ],
  '0.53.30': [
    ['🔒', 'Étapes dans l’ordre', 'Opti Pro : une étape s’ouvre seulement quand la précédente est terminée. Les suivantes sont grisées avec « Termine d’abord l’étape… », sauf si tu la passes avec « ⏭ Passer ».', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']]
  ],
  '0.53.29': [
    ['🔔', 'Cloche des notifications réparée', 'Quand une notification arrive, la cloche sonne sans se tourner ni grossir : elle reste visible et cliquable.', ['#bellBtn', 'wait900']],
    ['📊', 'Score plus logique', 'Les nouveaux réglages de confort et de confidentialité ne font plus baisser la note de santé de ton PC. Seuls les réglages qui jouent sur les performances comptent.'],
    ['🛠', 'Optimisation plus fiable', 'Réglage Copilot retiré (Windows le bloque sans droits administrateur) ; le nombre de changements affiché ne compte plus ceux que Windows a refusés, et l’erreur est écrite clairement.'],
    ['🎃', 'Halloween plus calme', 'Plus d’araignées qui descendent ni de chauves-souris qui traversent l’écran : il reste les toiles et les citrouilles.', ['.side nav button:nth-child(1)', 'wait900']]
  ],
  '0.53.28': [
    ['👤', 'Un humain sur Discord', 'Opti Pro : « Parler à un humain » t’explique où aller : le serveur Discord History, salon #🚀・opti-pro, dans ton fil privé. L’équipe Opti Pro répond là-bas, pas dans le support de l’appli.', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500', '[data-pa=discord]', 'wait900']]
  ],
  '0.53.27': [
    ['🎫', 'Ticket Opti Pro guidé', 'Optimisation › 🚀 Opti Pro : ouvre ton ticket, le technicien IA répond tout de suite à chaque étape d’après ton vrai PC (processeur, carte mère, BIOS, RAM, températures). Pose tes questions, passe les étapes facultatives, appelle un humain si besoin. Le même ticket est sur Discord (/launcher opti).', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1800']],
    ['🧠', 'Overclocking conseillé ou non', 'Le technicien recommande l’overclocking seulement si ton matériel s’y prête (processeur débloqué, carte mère, refroidissement, pas sur portable, pas si ça chauffe déjà). Sinon : gains via le BIOS.'],
    ['🔄', 'Mets à jour ton BIOS', 'Ta version de BIOS est lue, le technicien cherche la dernière version de TA carte mère et un bouton ouvre la page officielle de téléchargement.'],
    ['💾', 'Clé USB en 1 clic', 'L’outil officiel Microsoft se télécharge et s’ouvre en 1 clic (signature Microsoft vérifiée).'],
    ['⚡', 'Optimisation finale en 1 clic', 'Tout est proposé dans une seule fenêtre de validation : réglages système (point de restauration avant), Windows, nettoyage et tes jeux. 10 nouveaux réglages : bridage d’énergie, widgets, Copilot, applis sponsorisées, Bing, pub, confidentialité, touches rémanentes…']
  ],
  '0.53.26': [
    ['🚀', 'Opti Pro accompagnée', 'Optimisation › 🚀 Opti Pro : un vrai parcours en 7 étapes comme chez un technicien — ticket, validation (staff ou IA), clé USB, formatage, BIOS & overclocking, réglages finaux Windows / NVIDIA / énergie, puis test avant / après. Ton PC est prêt 🚀', ['[data-view=optimisation]', 'wait600', '#optTabs [data-ot=pro]', 'wait1500']],
    ['🧠', 'BIOS selon ton matériel', 'L’appli lit ton processeur, ta carte mère et ta RAM : overclocking possible ou non, PBO / Curve Optimizer, XMP / EXPO pas activé, double canal. Premium : guide BIOS pas à pas par l’IA.'],
    ['🗂', 'Optimisation mieux rangée', 'Deux onglets : ⚡ Optimisation rapide (analyse et un clic) et 🚀 Opti Pro accompagnée.']
  ],
  '0.53.25': [
    ['🖼️', 'Bannières en grand', 'Les bannières de Fortnite et Roblox remplissent tout l’en-tête du jeu, et le logo Fortnite de la pochette est mieux cadré.', ['.side nav button:nth-child(2)', 'wait900']],
  ],
  '0.53.24': [
    ['🎮', 'Fortnite a sa pochette', 'Fortnite a enfin sa vraie pochette et sa bannière. Roblox : bannière qui remplit tout l’en-tête et logo bien centré sur la pochette.', ['.side nav button:nth-child(2)', 'wait900']],
  ],
  '0.53.23': [
    ['🛒', 'Upgrade complet', 'Carte graphique (NVIDIA, AMD ou Intel), processeur et carte mère, mémoire et stockage : seulement ce qui est compatible avec ton PC, l’alimentation à prévoir et le meilleur rapport qualité / prix. Choisis tes jeux (même pas installés) pour voir tes FPS avant / après.', ['[data-view=pc]', 'wait600', '[data-pctab=upgrade]', 'wait1200']],
    ['🧱', 'Roblox a sa pochette', 'Roblox a enfin sa pochette et sa bannière dans la bibliothèque.'],
    ['🤖', 'Avis de l’IA plus clair', 'Titres en couleur et en gras, sans bandeaux.'],
  ],
  '0.53.22': [
    ['🛰️', 'Support plus rapide', 'Le launcher indique sa version à ton compte : en cas de souci, l’équipe sait tout de suite si tu as la dernière mise à jour.', ['#openSettings', 'wait600', '.setnav [data-pane=aide]', 'wait900']],
  ],
  '0.53.21': [
    ['🛒', 'Upgrade refait', 'Une grande carte « ta carte → carte conseillée » avec le gain en %, tes jeux avec leur vraie pochette et tes vrais FPS avant / après, ce que ton processeur et ton écran peuvent suivre. Premium : avis détaillé de l’IA.', ['[data-view=pc]', 'wait600', '[data-pctab=upgrade]', 'wait1200']],
    ['🛠', 'Réparation par History', 'Vérifier et réparer : History vérifie chaque fichier lui-même, retire ceux qui sont abîmés et les fait re-télécharger en arrière-plan, sans ouvrir la fenêtre de Steam.'],
    ['🤖', 'L’assistant optimise vraiment', '« Optimise mon PC » : il analyse, te liste ce qu’il a trouvé, corrige tout en un clic et te dit ce qui a été fait.'],
    ['🎨', 'Conseils de l’IA plus lisibles', 'Titres en couleur, réglages en gras, listes aérées. Et les vraies pochettes des jeux dans Optimisation.'],
  ],
  '0.53.20': [
    ['🛒', 'Upgrade et Entretien', 'Mon PC › 🛒 Upgrade : quoi acheter avec ton budget et tes FPS estimés avec une autre carte graphique. 🩺 Entretien : santé des disques (alerte si l’un faiblit) et nettoyage des anciens pilotes graphiques.', ['[data-view=pc]', 'wait600', '[data-pctab=upgrade]', 'wait900']],
    ['🎁', 'Cadeaux & codes Premium', 'Essai gratuit de 3 jours, ton code ami (−20 % pour lui, 7 jours offerts pour toi) et les cartes cadeaux à offrir.'],
    ['🛠', 'Outils de jeu', 'Clic droit sur un jeu : réparer avec Steam / Epic, vider son cache, gérer ses mods, taille de la mise à jour en attente.'],
    ['🌡️', 'Après chaque partie', 'Températures max de la partie dans l’historique du jeu, et les programmes qui prenaient trop de mémoire.'],
    ['🔕', 'Zéro notification en jeu', 'Paramètres › Jeux : coupe les bulles Windows pendant toutes tes parties, rétablies à la fin.'],
    ['💬', 'Amis', 'Statuts rapides (Dispo, Ne pas déranger, En vocal, AFK) et cadeaux à offrir, affichés sur la carte de profil.'],
    ['🎄', 'Saisons', 'Noël en décembre (neige qui tombe). Halloween : toiles plus discrètes, et les araignées descendent à des endroits différents puis remontent.'],
  ],
  '0.53.19': [
    ['🎃', 'Ambiance Halloween', 'Pour octobre, l’appli passe en mode Halloween : logo citrouille, fond plus sombre, citrouilles réalistes, toiles et araignées qui bougent. Tu peux revenir au thème normal dans Paramètres › Apparence › Ambiance de saison.', ['#openSettings', 'wait600', '.setnav [data-pane=apparence]', 'wait900']],
  ],
  '0.53.18': [
    ['🆘', 'Aide en un clic', 'Ton PC chauffe en jeu ? La cloche propose de demander de l’aide au support, avec l’analyse de ton PC jointe. Tu peux aussi écrire au support depuis Discord avec /launcher aide.', ['#bellBtn', 'wait900']],
    ['🆕', 'Mises à jour des jeux', 'Quand un de tes jeux est mis à jour, la cloche te prévient et le salon #maj-des-jeux du Discord donne le lien des patch notes.'],
    ['📈', 'FPS avant / après l’opti', 'Après l’optimisation d’un jeu, ta première partie compare tes FPS à ceux d’avant. Les gains sont partagés anonymement sur Discord (si le partage d’activité est activé).'],
    ['⚡', 'Bibliothèque plus fluide', 'Les logos des jeux se chargent seulement quand ils apparaissent à l’écran.'],
  ],
  '0.53.17': [
    ['🗑️', 'Désinstaller partout', 'Les jeux installés directement sur un disque (comme D:\\Fortnite) se désinstallent enfin depuis le launcher, sans le message « dossier trop proche de la racine ».', ['#openSettings', 'wait600', '.setnav [data-pane=jeux]', 'wait900']],
  ],
  '0.53.16': [
    ['🆘', 'Support avec l’analyse du PC', 'Ta demande d’aide envoie aussi ton matériel, ta santé PC et tes températures (si tu le veux) : l’équipe sur Discord t’aide sans te poser 10 questions.', ['#openSettings', 'wait600', '.setnav [data-pane=aide]', 'wait600', '#newSupport', 'wait900']],
  ],
  '0.53.15': [
    ['💳', 'Paiement plus sûr', 'Chaque achat a une note unique à copier dans le paiement PayPal « Entre proches » : elle est vérifiée sur ta capture pour activer ton Premium plus vite.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.14': [
    ['🔗', 'Lier Discord simplifié', 'La commande est copiée et le launcher te dit où la coller (#lier-son-compte). Dès que c’est lié, un message « Ton compte a bien été lié » s’affiche.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.13': [
    ['📊', 'FPS toujours affichés', 'La mesure des FPS se relance toute seule si le jeu redémarre ou si plus rien n’arrive : fini le compteur sans FPS en pleine partie.', ['#openSettings', 'wait600', '.setnav [data-pane=jeux]', 'wait900']],
    ['🖥', 'Overlays et plein écran', 'Pour tous les jeux : si le jeu est en plein écran, une voix et un message te disent de passer en « Plein écran fenêtré » au lieu de forcer l’overlay.'],
  ],
  '0.53.12': [
    ['🚗', 'Overlay Rocket League stable', 'L’overlay ne fait plus sortir Rocket League de son écran et le launcher ne touche plus aux réglages du jeu. En plein écran, une voix et un message te disent de passer en « Plein écran fenêtré ».', ['#openSettings', 'wait600', '.setnav [data-pane=jeux]', 'wait900']],
  ],
  '0.53.11': [
    ['🔗', 'Lier Discord en 1 clic', 'Après un achat Premium, « Lier en 1 clic » copie la commande et ouvre le serveur : il ne reste qu’à la coller.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.10': [
    ['⭐', 'Offres Premium plus complètes', 'Cartes mieux remplies et 2 avantages de plus par offre (fermer un jeu en une phrase, soirées entre amis, nettoyage profond, support prioritaire…).', ['#premiumBtn', 'wait900']],
  ],
  '0.53.9': [
    ['💳', 'Réponse du paiement dans l’appli', 'Quand ton paiement Premium est accepté ou refusé, le launcher te le dit directement. Et tu peux lier ton Discord et rejoindre le serveur en un clic après l’achat.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.8': [
    ['⭐', 'De nouveaux visuels Premium', 'Des images dédiées à chaque offre, avec un léger flou et un voile jaune doux.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.7': [
    ['⚙', 'Paramètres refaits', 'Fenêtre plus grande, menu rangé par catégories avec une couleur par rubrique, textes plus lisibles.', ['#openSettings', 'wait600', '.setnav [data-pane=jeux]', 'wait900']],
  ],
  '0.53.6': [
    ['💳', 'Nouvelle fenêtre d’achat', 'Acheter le Premium se fait en 3 étapes claires : payer sur PayPal, ton nom PayPal, puis la capture (glisser, coller ou cliquer).', ['#premiumBtn', 'wait900']],
  ],
  '0.53.5': [
    ['⭐', 'Des offres Premium plus lisibles', 'Trois cartes épurées, des accents jaune doux et des prix bien visibles pour choisir History IA, Opti Pro ou le duo.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.4': [
    ['✨', 'Menu plus léger', 'Le Premium s’ouvre avec le bouton doré en haut, à côté de Discord : une ligne de moins dans le menu de gauche.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.3': [
    ['💳', 'Capture du paiement', 'Pour activer le Premium, ajoute la capture d’écran de ton paiement PayPal avec ton nom PayPal : la vérification va plus vite.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.2': [
    ['💳', 'Nouveau compte PayPal', 'Les achats Premium se paient maintenant sur paypal.me/zyko921.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.1': [
    ['⭐', 'Achat du Premium vérifié', 'Achète depuis la page Premium (connecté à ton compte), paie sur PayPal puis indique ton nom PayPal : le Premium s’active dès que le paiement est vérifié. Le bouton du site ouvre directement le launcher.', ['#premiumBtn', 'wait900']],
  ],
  '0.53.0': [
    ['⭐', 'History Premium', 'Nouvelle page Premium : History IA (2,49 €), Opti Pro (2,49 €) ou les deux (3,99 €) par mois, sans engagement. Paiement PayPal, activé en moins d’une minute.', ['#premiumBtn', 'wait900']],
    ['🩺', 'L’opti suit ton PC', 'L’optimisation propose une correction pour chaque problème trouvé par l’analyse (fichiers inutiles, démarrage, réglages, plantages…), ou « Tout corriger » en un clic.'],
    ['❌', '« Ferme le jeu » marche', 'Le jeu en cours se ferme, même installé dans un dossier court (D:\\Fortnite), et l’assistant dit quand ça échoue. « Stop Fortnite » ne met plus la musique en pause.'],
    ['🔕', 'Moins de notifications', 'Jamais deux fois la même en 6 h, 3 par heure au plus. Le boost et le bilan de chaque partie restent dans la cloche.'],
    ['💻', 'Chromebook', 'Les outils propres à Windows (Mon PC, Optimisation, overlays) sont cachés sur Chromebook.'],
  ],
  '0.52.2': [
    ['💻', 'History Launcher sur Chromebook', 'Une version pour Chromebook est disponible sur le site (Linux de ChromeOS, processeurs Intel/AMD et ARM) : comptes, amis, messages, avis et jeux gratuits. Les outils propres à Windows restent sur PC.', ['#openSettings', 'wait600', '.setnav [data-pane=about]', 'wait900']],
  ],
  '0.52.1': [
    ['⬇', 'Mets à jour sans lancer le jeu', 'History suit le téléchargement et l’installation avec les données réelles disponibles. Le jeu reste fermé après la mise à jour.', ['[data-upd="steam:359550"]', 'wait600']],
    ['✉', 'Réponds directement en jeu', 'La bulle affiche ses boutons en entier. Répondre ouvre le champ de saisie par-dessus le jeu, et une erreur conserve ton message.'],
  ],
  '0.52.0': [
    ['⠿', 'Personnalise directement ton accueil', 'Déplace les blocs et tes jeux épinglés directement sur la page. Les changements sont visibles et sauvegardés immédiatement.', ['#customizeHome', 'wait600']],
  ],
  '0.51.2': [
    ['✉', 'Discord et Support réunis', 'Les deux boutons sont côte à côte à droite de la barre du haut.', ['.qs-trigger', 'wait600']],
  ],
  '0.51.1': [
    ['✉', 'Support bien visible', 'Le bouton rouge est placé à droite de la barre du haut, près des commandes de fenêtre.', ['.qs-trigger', 'wait600']],
    ['●', 'Le suivi du support en couleurs', 'Bleu : reçue. Orange : en cours. Vert : résolue. Le statut reste écrit pour être lisible par tous.', ['.qs-trigger', '[data-tab="list"]', 'wait600']],
  ],
  '0.51.0': [
    ['✉', 'Le support, à portée de clic', 'Un panneau en haut à droite pour envoyer une demande, joindre une capture et retrouver les réponses de l’équipe.', ['.qs-trigger', 'wait600']],
    ['◈', 'Des paramètres faciles à repérer', 'Des icônes identifient chaque catégorie de réglages.'],
  ],
  '0.50.0': [
    ['🏠', 'Ton accueil, à ta façon', 'Réorganise les blocs, épingle tes jeux et choisis tes raccourcis.', ['#customizeHome', 'wait600'], 'accueil'],
    ['📓', 'Un carnet pour chaque jeu', 'Retrouve tes notes, builds, commandes et liens depuis la fiche du jeu.', [], 'carnet'],
    ['🎨', 'Essaie ton prochain thème', 'Couleurs, fond et intensité des néons en aperçu, avec Appliquer et Annuler.', ['#openSettings', '[data-pane="apparence"]', 'wait600'], 'apparence'],
    ['💬', 'Un centre d’aide intégré', 'Signalements privés avec capture, diagnostic facultatif et suivi des réponses.', [], 'aide'],
    ['⚡', 'Plus léger en arrière-plan', 'Une seule boucle manette et des rafraîchissements suspendus quand la fenêtre est masquée.'],
  ],
  '0.49.0': [
    ['✨', 'Des paramètres à ta façon', 'Navigation repensée, recherche de réglages et cartes aux contours néon animés. Tout est regroupé par usage.', ['#openSettings', 'wait600']],
    ['⭐', 'Un nouvel espace pour ton avis', 'Une note, tes mots et une capture avec aperçu : partage ton expérience depuis Paramètres › Ton avis.', ['#openSettings', 'wait600', '.setnav [data-pane=avis]', '#openReview', 'wait600']],
  ],
  '0.48.0': [
    ['⭐', 'Donne ton avis', 'Paramètres › À propos › « Donner mon avis » : une note de 1 à 5 étoiles, un commentaire et une capture si tu veux. Ton avis s’affiche dans le bandeau des avis du site.', ['#openSettings', 'wait600', '.setnav [data-pane=about]', 'wait900']],
  ],
  '0.47.3': [
    ['🛡', 'Toujours connecté', 'Le launcher sait retrouver son serveur même s’il change d’adresse : comptes, amis et messages continuent de marcher sans rien réinstaller.', ['#openSettings', 'wait600', '.setnav [data-pane=compte]', 'wait900']],
  ],
  '0.47.2': [
    ['🎯', 'Overlays seulement sur le jeu', 'Les overlays se cachent dès qu’une autre fenêtre passe devant (Discord, navigateur…) et reviennent sur le jeu. Ctrl+Alt+O et Ctrl+Alt+I ne s’ouvrent que pendant une partie.'],
    ['🖥', 'Overlays par-dessus le plein écran', 'Pendant la partie, les overlays sont remis au premier plan en continu. Si les « optimisations plein écran » de Windows sont coupées pour Rocket League, le launcher propose de les réactiver (réversible) : le plein écran laisse alors passer les overlays.', ['#openSettings', 'wait700']],
  ],
  '0.47.1': [
    ['🖥', 'Overlays toujours visibles sur Rocket League', 'Accepte une fois le « plein écran sans bordure » (même rendu que le plein écran) : le launcher le remet tout seul à chaque lancement, et les overlays restent par-dessus le jeu. Proposé au lancement de Rocket League tant que ce n’est pas accepté.', ['#openSettings', 'wait700']],
  ],
  '0.47.0': [
    ['⚡', 'Résultat instantané', 'Victoire ou défaite s’affiche dès que le jeu annonce le gagnant, sans attendre l’écran de fin.', ['#openSettings', 'wait600', '.setnav [data-pane=raccourcis]', 'wait900']],
    ['🖥', 'Overlays en plein écran', 'Le launcher propose (une fois, avec ton accord) de passer Rocket League en « plein écran sans bordure » : même rendu, et les overlays restent visibles par-dessus le jeu.'],
    ['❔', 'MMR : état du profil', 'Si le gain de MMR n’arrive pas, la barre l’indique (« MMR … » pendant la lecture, « MMR ? » si le profil public est illisible).'],
  ],
  '0.46.5': [
    ['⚡', 'Optimisation tout de suite', 'Plus de message « bientôt fini » pendant quelques secondes en ouvrant l’onglet Optimisation.', ['[data-view=optimisation]', 'wait1500']],
  ],
  '0.46.4': [
    ['🚗', 'Néon selon ta dernière partie', 'Le néon de l’overlay Rocket League est vert si tu viens de gagner, rouge si tu viens de perdre. Le « V » / « D » de la barre est bien centré.', ['#openSettings', 'wait700']],
  ],
  '0.46.3': [
    ['🚗', 'Barre Rocket League au point', 'Juste « V » ou « D » pour la dernière partie, ton bilan du mode en « 4W - 3L », et le gain de MMR (+12) à côté du MMR. Au retour au menu, la barre reste sur ta dernière partie (plus de faux « 1s » avec l’entraînement libre).', ['#openSettings', 'wait700']],
    ['⚡', 'MMR plus vite', 'Le gain de MMR et le nouveau MMR arrivent dès que le profil se met à jour (relu toutes les 30 s après la partie).'],
    ['🖥', 'Overlay jamais coupé', 'En l’agrandissant ou en changeant de forme, l’overlay reste entièrement dans l’écran.'],
  ],
  '0.46.2': [
    ['🔥', 'Flamme fixe', 'La flamme de la série de victoires ne bouge plus.', ['#openSettings', 'wait700']],
  ],
  '0.46.1': [
    ['🪶', 'Launcher plus léger', 'Moins de processeur et de mémoire : les néons animés se redessinent 2 fois moins souvent, le rythme Spotify ne tourne que quand une musique joue, et le profil Rocket League est lu 3 fois moins souvent, sans images ni pubs.', ['#openSettings', 'wait700']],
  ],
  '0.46.0': [
    ['🚗', 'Barre Rocket League plus complète', 'La barre montre si tu joues en Ranked ou en Occa et dans quel mode (1s, 2s, 3s, 4s), avec le bon MMR : logo du rang et MMR classé en Ranked, MMR occa en Occa. Plus ton bilan du jour dans ce mode et « En jeu » pendant la partie.', ['#openSettings', 'wait600', '.setnav [data-pane=raccourcis]', 'wait900']],
    ['🎯', 'Chaque partie au bon endroit', 'Le mode lancé (classé ou occa) est lu dans le jeu dès le début : ta victoire va direct dans Occa ou Classé, et dans son mode.'],
    ['🎵', 'Spotify au rythme du son', 'L’anneau néon de Spotify bat au son de Spotify (et seulement de Spotify), le titre est en blanc et en gras.'],
    ['🔍', 'Taille des overlays', 'Boutons − et + au survol pour agrandir ou réduire chaque overlay, gardé pour la prochaine fois. Fond moins transparent et néon vert qui tourne autour.'],
  ],
  '0.45.1': [
    ['✨', 'Overlays plus propres', 'Plus de carré visible autour des overlays, le bouton ⇄ apparaît dès que la souris passe dessus, et on les glisse de n’importe où.', ['#openSettings', 'wait600', '.setnav [data-pane=raccourcis]', 'wait900']],
    ['🎵', 'Le son en cours', 'Le titre que tu écoutes s’affiche à côté du logo Spotify (entouré d’un léger néon), même en barre ou en mini.'],
  ],
  '0.45.0': [
    ['🖐', 'Overlays à ta façon', 'Glisse les overlays (Ctrl+Alt+O et Ctrl+Alt+I) où tu veux sur l’écran, ils restent à cette place. Le bouton ⇄ change leur forme : carte, barre ou mini, pour prendre plus ou moins de place.'],
    ['🎵', 'Spotify en un clic', 'Le logo Spotify en néon dans l’overlay en jeu ouvre l’appli directement.'],
    ['🚗', 'Rocket League : plus aucune partie perdue', 'Le rang et le MMR se lisent enfin, et chaque partie est classée (classé ou occa) même si tu en joues plusieurs d’affilée.'],
    ['🟢', 'Jeu en cours / mise à jour', 'Quand un jeu tourne, le bouton passe en vert « En cours » (pas de double lancement). Si le jeu a une mise à jour, le bouton devient « Mettre à jour ».', ['#hero .playbtn', 'wait900']],
    ['⬆', 'Mises à jour qui rattrapent tout', 'Si tu as du retard, le launcher installe directement la dernière version, en une fois et en ne téléchargeant que ce qui change.'],
  ],
  '0.44.0': [
    ['🚗', 'Overlay Rocket League refait', 'Rang au centre avec ton MMR, néon qui tourne autour (vert si ta journée est positive, rouge sinon), série 🔥 ou 🧊, et victoires/défaites séparées : classé, occa, et chaque mode (1v1, 2v2, 3v3, 4v4).', ['#openSettings', 'wait600', '.setnav [data-pane=raccourcis]', 'wait900']],
    ['🏅', 'Rang et MMR fiables', 'Les logos officiels des rangs, et le profil est lu même quand le site bloque : le mode classé ou occa est détecté tout seul après chaque partie.'],
  ],
  '0.43.0': [
    ['🚗', 'Rocket League en direct (Ctrl+Alt+I)', 'Victoire ou défaite, score, gain de MMR, rang, série et bilan du jour ; la flèche ouvre tes dernières parties. Au lancement du jeu, ta dernière game s’affiche en petit.', ['#openSettings', 'wait900']],
    ['📊', 'Infos en jeu plus petites (Ctrl+Alt+O)', 'Les vrais FPS du jeu en grand : vert si c’est bien, orange en baisse, rouge trop bas.'],
  ],
  '0.42.0': [
    ['📊', 'Vrai pourcentage partout', 'Réparer Windows (DISM + SFC), nettoyage profond, optimisation des disques et mises à jour de Windows : barre avec le % réel et l’étape en cours.', ['[data-view=optimisation]', 'wait3000']],
    ['🌙', 'Ça continue en fond', 'Tu peux utiliser ton PC et même fermer la fenêtre : la tâche continue et Windows te prévient à la fin.'],
    ['🩺', 'Réparation de Windows fiable', 'Le résultat du contrôle des fichiers système (SFC) est maintenant bien lu : réparé, sain ou à vérifier.'],
    ['🎮', 'Vrais logos', 'FiveM et Fortnite ont leur logo officiel dans l’optimisation.'],
  ],
  '0.41.0': [
    ['🔓', 'L’optimisation est ouverte', 'Profils par jeu (FiveM, Fortnite, R6, Rocket League, Garry’s Mod), nettoyage avec les chemins exacts avant de valider, et tout s’annule en un clic.', ['[data-view=optimisation]', 'wait3500']],
    ['🚪', 'Entrée spéciale', 'La 1re fois : cadenas 3D qui s’ouvre, portes blindées et fumée verte.'],
  ],
  '0.40.0': [
    ['🛠', 'Bouton « Corriger »', 'Dans Mon PC, les conseils qui se règlent sans risque ont un bouton : Mode Jeu, alimentation, définitions antivirus, menaces, redémarrage, ou la bonne page de Windows.', ['[data-view=pc]', 'wait3000']],
    ['🎨', 'Alertes plus lisibles', 'Fini les grosses cartes colorées : titre en couleur et petite pastille Urgent, À surveiller ou Conseil.'],
    ['✅', 'Diagnostic plus juste', 'Plus de « 65535 jours » ni d’alerte antivirus quand un autre antivirus te protège, plus de faux plantages (messages d’info de services), et plus de conseil qui fait bugger FiveM.'],
  ],
  '0.39.0': [
    ['🧪', 'Avant / après, en vrais FPS', '« Optimiser et jouer » compare tes FPS moyens et ton 1 % low d’avant ta 1re optimisation avec ceux d’après.', ['#hero .optiplay', 'wait1200']],
    ['🪟', 'Superpositions qui coûtent des FPS', 'NVIDIA, Xbox Game Bar, Discord, Overwolf, Medal, OBS… repérées avant de jouer, avec où les couper.'],
    ['🧠', 'Programmes gourmands', 'Un programme qui prend plus de 2 Go de mémoire est signalé avant la partie.'],
    ['🚓', 'Cache FiveM surveillé', 'Taille du cache affichée, alerte au-dessus de 5 Go ; ReShade et ENB signalés et gardés tels quels.'],
    ['🔧', 'Addons Garry’s Mod les plus lourds', 'Taille de chaque addon, les plus lourds d’abord, et leur page Steam pour te désabonner.'],
    ['💥', 'Saccades expliquées', 'Après la partie : mémoire pleine, processeur au maximum ou disque, et quoi faire.'],
    ['🖥', 'Pilote graphique', 'Ta version et la nouvelle, avec le lien officiel (rien n’est installé tout seul).'],
    ['🧹', 'Nettoyage doux chaque semaine', 'À activer dans Paramètres : seulement les caches qui se recréent, avec un petit rapport. Désactivé par défaut.'],
  ],
  '0.38.0': [
    ['🕹', 'Jeux avec anti-triche détectés', 'R6, Fortnite, Rocket League… sont maintenant bien repérés quand ils tournent : temps de jeu, « En cours » et mini-compteur de FPS.', ['[data-view=jeux]', 'wait1200']],
    ['🛠', 'L’optimisation avance', 'Profils par jeu (FiveM, Garry’s Mod, Fortnite, R6, Rocket League) avec leurs logos, niveau de risque de chaque action et retour arrière en un clic : on la termine de notre côté avant de l’ouvrir.'],
  ],
  '0.37.3': [
    ['🟦', 'Fortnite avec ses vraies images', 'Logo, jaquette et grand fond officiels lus dans le catalogue Epic de ton PC (même hors ligne), avec nouvel essai du magasin Epic toutes les 6 h si besoin.', ['[data-view=jeux]', 'wait900']],
    ['⏱', 'Temps de jeu Fortnite, Rocket League…', 'Les jeux avec anti-triche sont enfin reconnus en cours : temps de jeu, « En cours », mini-compteur de FPS.'],
  ],
  '0.37.2': [
    ['🔎', 'Fortnite trouvé dans la recherche', 'Un jeu déjà connu du launcher mais masqué ou filtré n’empêchait plus sa fiche magasin d’apparaître : tape « fortnite », il est là.', ['[data-view=jeux]', 'wait900']],
  ],
  '0.37.1': [
    ['❌', '« Ferme Rocket League » marche pour de vrai', 'Dis « Hey History, ferme Rocket League » : les jeux avec anti-triche se ferment maintenant aussi sur Steam, et le bon est fermé si le jeu est sur Steam et Epic.', ['#aifab', 'wait900']],
    ['📊', 'FPS repérés pour Fortnite, Rocket League…', 'Le mini-compteur retrouve maintenant les jeux avec anti-triche et attend qu’ils démarrent (jusqu’à 2 min) : fini « jeu non repéré ».'],
    ['🔎', 'Recherche dans les magasins', 'Tape « fortnite » (ou n’importe quel jeu) dans la recherche : même non installé, il apparaît avec sa fiche Steam ou Epic à ouvrir.'],
  ],
  '0.37.0': [
    ['⚡', 'Nouveau bouton Optimiser', 'À côté de Jouer : un clic règle Windows pour ton jeu (Mode Jeu, capture Xbox en fond coupée, photo des réglages avant) puis le lance.', ['#hero .optiplay', 'wait900']],
    ['🎯', 'Vrais gains de FPS', 'Options sûres par jeu : mode Performance de Fortnite, cache FiveM à refaire, priorité au jeu et carte graphique puissante. Tout est décoché si risqué et réversible.'],
    ['📊', 'FPS avec flèches', 'Le mini-compteur affiche tes FPS avec une flèche verte ou rouge, et dit pourquoi s’ils manquent.'],
    ['🟦', 'Jeux Epic au complet', 'Fortnite et les jeux Epic ont leur logo, fond et jaquette officiels, et les jeux Epic manquants sont retrouvés.'],
    ['📰', 'Accueil plus aéré', 'Les actus de tes jeux (patchs Fortnite inclus), promos et jeux gratuits de la semaine passent tout en bas et se mettent à jour seuls.'],
  ],
  '0.36.2': [
    ['📊', 'Tes FPS dans le mini-compteur', 'Cocher le mini-compteur dans ⚡ Optimiser et jouer active aussi la mesure des FPS (Windows demande l’autorisation une seule fois, puis reconnecte-toi à Windows).', ['#hero .optiplay', 'wait900']],
    ['🎮', 'Carte graphique libérée', 'Pendant une partie, le launcher coupe toutes ses animations et effets de flou, et la bordure néon ne tourne plus : toute la carte graphique pour ton jeu.'],
  ],
  '0.36.1': [
    ['🔒', 'Sécurité renforcée', 'Fenêtres en bac à sable, aucune navigation vers l’extérieur, le launcher refuse de démarrer si ses fichiers ont été modifiés, et chaque installateur est publié avec son empreinte SHA-256 (SHA256SUMS.txt) pour vérifier qu’il est original.', ['#openSettings', 'wait700']],
  ],
  '0.36.0': [
    ['⚡', 'Optimiser et jouer', 'Nouveau bouton ⚡ à côté de « Jouer » : le launcher vérifie ton PC (applis lourdes, mémoire, disque, pilote), prépare la partie et te montre ce qu’il fait. Tout est temporaire et remis comme avant à la fin.', ['#hero .optiplay', 'wait900']],
    ['📊', 'Mini-compteur en jeu', 'Tout petit en haut à gauche : tes FPS, avec une flèche verte ou rouge pour le gain ou la perte par rapport à tes parties d’avant. Ctrl+Alt+P pour le cacher.'],
    ['☁', 'Sauvegardes de jeux en ligne', 'Les jeux sans cloud (hors Steam) envoient leur sauvegarde après chaque partie. Récupère-la sur n’importe quel PC depuis Outils du jeu › Sauvegardes.'],
    ['💾', 'Alerte disque plein', 'Prévenu avant qu’une mise à jour de jeu échoue faute de place.'],
    ['🎮', 'Bouton Discord', 'En haut à droite : rejoins le serveur History Launcher en un clic.'],
  ],
  '0.35.0': [
    ['🖥', 'Le bon pilote pour ta carte', 'L’alerte « nouveau pilote NVIDIA » cherche maintenant le pilote de TA carte graphique (ex. GTX 1660 SUPER), plus celui des cartes récentes qui n’était pas compatible.', ['.side [data-view=pc]', 'wait900']],
    ['🧹', 'Menu allégé', 'Les catégories Applications et Statistiques sont retirées : le launcher va à l’essentiel et utilise moins de mémoire.'],
    ['⌨', 'Nouveaux raccourcis', 'Ctrl+L relance ton dernier jeu, Ctrl+Maj+R choisit un jeu au hasard, Ctrl+Maj+C ouvre History Clips, Ctrl+Maj+O l’optimisation. Touche « ? » pour tous les voir.'],
  ],
  '0.34.2': [
    ['🔗', 'History Clips se connecte tout seul', 'Connecté au launcher = History Clips est relié à ton compte automatiquement, sans code ni mot de passe.', ['#openSettings', 'wait700', '.setnav [data-pane=clips]', 'wait800']],
  ],
  '0.34.1': [
    ['🎬', 'History Clips en un clic', 'Nouveau bouton jaune History Clips en bas à gauche : il ouvre l’appli si elle est installée (et la connecte à ton compte tout seul), sinon il télécharge son installateur.', ['#openSettings', 'wait600', '.setnav [data-pane=clips]', 'wait900']],
  ],
  '0.34.0': [
    ['🎬', 'Les clips ont leur propre appli : History Clips', 'Le replay et la galerie de clips quittent le launcher (qui devient plus léger) pour History Clips : enregistrement, découpe, galerie par jeu et envoi sur Discord. Lien de téléchargement dans le menu et dans Paramètres › Clips.', ['#openSettings', 'wait700', '.setnav [data-pane=clips]', 'wait900']],
  ],
  '0.33.1': [
    ['🪶', 'Beaucoup moins de mémoire avec le replay', 'Le replay ne filme plus l’écran en permanence : il tourne seulement pendant tes parties (et rend sa mémoire 1 min après), avec deux encodages vidéo au lieu de trois. Option « Replay aussi hors des parties » dans Paramètres › Clips & captures.', ['#openSettings', 'wait600', '.setnav [data-pane=clips]', 'wait800']],
  ],
  '0.33.0': [
    ['⚙', 'Paramètres rangés', 'Nouvelles catégories : 🎨 Apparence, 🎬 Clips & captures, ⌨ Raccourcis, 🎙 Assistant vocal et 📱 Téléphone. Chaque réglage est à sa place.', ['#openSettings', 'wait600', '.setnav [data-pane=clips]', 'wait800']],
    ['🎬', 'Clips sur mesure', 'Durée (15 s à 2 min), qualité (720p à 1440p), 30 ou 60 images/s, avec ou sans le son du PC.'],
    ['📤', 'Clip à un ami sur Discord', 'Depuis la page Clips : envoie un clip dans le salon du serveur ou en message privé à un ami précis. Qualité bien meilleure sur Discord (débit calculé pour la limite de 10 Mo, 1080p quand ça tient).'],
    ['⛶', 'Clips en plein écran', 'Bouton ⛶ ou double-clic sur un clip pour le regarder en plein écran (c’était bloqué). 🗑 pour supprimer un clip (il part dans la corbeille).'],
    ['🔇', 'Plus de lancement surprise', 'L’écoute « Hey History » est plus exigeante et ne peut plus ouvrir Epic Games, Steam ou les autres plateformes : un bruit du jeu ou de Discord ne lance plus rien.'],
  ],
  '0.32.0': [
    ['🎬', 'Catégorie Clips', 'Nouvelle page Clips dans le menu : tous tes clips, à regarder dans l’appli en bonne qualité avec le son, à envoyer sur Discord ou ouvrir dans leur dossier.', ['[data-view=clips]', 'wait1200']],
    ['🛠', 'Clips réparés', 'Windows refusait l’accès à l’écran à l’enregistreur du replay : les clips marchent maintenant, en 1080p jusqu’à 60 images/s, avec le son du PC.'],
    ['⌨', 'N’importe quelle touche', 'Raccourcis : F1-F24, Impr. écran, Inser, pavé numérique… seuls, ou n’importe quelle touche avec Ctrl / Alt / Maj.'],
    ['🎙', 'Volume à la voix', '« Hey History, baisse le son de Discord », « coupe le son du jeu », « remets le son de Spotify » : le volume de chaque appli, même en pleine partie.'],
    ['🗣', 'Voix de l’assistant', 'Paramètres › Général : choisis la voix de l’assistant (toutes celles installées sur Windows) ou coupe complètement ses réponses à voix haute.'],
    ['❌', '« Ferme Rocket League » marche', 'Les jeux avec anti-triche (Rocket League, Fortnite…) étaient invisibles pour la commande « ferme » : ils se ferment maintenant.'],
  ],
  '0.31.3': [
    ['🪟', 'Epic Games ne s’ouvre plus en grand', 'Après une partie avec le boost, Epic Games était rouvert en plein écran : il repart maintenant discrètement en fond, comme au démarrage de Windows.', ['[data-view=optimisation]', 'wait1200']],
  ],
  '0.31.2': [
    ['🧹', 'Collections retirées pour de bon', 'La catégorie Collections ne s’affiche plus dans le menu de gauche (elle restait visible dans la 0.31.1).', ['wait800']],
  ],
  '0.31.1': [
    ['⌨', 'Raccourcis à ton goût', 'Paramètres › Raccourcis : clique sur un raccourci (clip, capture, infos en jeu, afficher le launcher, recherche) et appuie sur ta combinaison. Retour arrière remet celui d’origine.', ['#openSettings', 'wait600', '[data-pane=general]', 'wait800']],
    ['📎', 'Fichiers dans les messages', 'Le trombone permet maintenant d’envoyer n’importe quel fichier (10 Mo max) à un ami ou un groupe ; il le télécharge d’un clic.'],
    ['💬', 'Messages en jeu', 'La bulle des messages s’affiche aussi en mode tournoi (les autres notifications restent coupées).'],
    ['🎬', 'Clips réparés', 'Si le replay était coupé, le raccourci du clip l’active tout de suite ; appuyer trop tôt ne le bloque plus.'],
    ['🧹', 'Menu plus simple', 'La catégorie Collections est retirée du menu de gauche.'],
  ],
  '0.31.0': [
    ['📱', 'Contrôle depuis le téléphone', 'Paramètres › Téléphone : active-le, ouvre l’adresse affichée sur ton téléphone (même Wi-Fi) et entre le code. Tu vois les températures du PC et tu lances un jeu à distance.', ['#openSettings', 'wait600', '[data-pane=general]', 'wait800']],
    ['🌙', 'Mises à jour la nuit', 'Paramètres › Jeux : entre 3 h et 6 h, si le PC est allumé et ne sert pas, Steam s’ouvre en fond et télécharge les mises à jour de tes jeux. Au réveil, tout est prêt.'],
    ['🎮', 'Réglages de jeux dans le cloud', 'Touches, sensibilité et graphismes de Fortnite, FiveM, GTA V, Rocket League et Minecraft partent dans ta sauvegarde. Sur un nouveau PC : Paramètres › Compte › « Remettre mes réglages de jeux ».'],
    ['🎨', 'Ta couleur et ton fond', 'Paramètres › Général : choisis n’importe quelle couleur pour l’appli, et le fond (jaquette floue du jeu, dégradé animé ou sobre).'],
  ],
  '0.30.0': [
    ['⚡', 'Mode Performance de Fortnite', 'Dans Outils du jeu › Réglages conseillés : active en un clic le mode officiel « Performance » de Fortnite (beaucoup plus de FPS, moins de freezes). Tes anciens réglages sont gardés et remis en un clic.'],
    ['🧊', 'Cache FiveM en un clic', 'Outils du jeu › Saccades vide les caches que FiveM retélécharge tout seul (cache, server-cache). Tes mods, packs graphiques et fichiers de GTA ne sont jamais touchés.'],
    ['🔎', 'Qui fait freezer ta partie', 'Pendant le boost, le launcher repère les programmes qui prennent du processeur et te les donne à la fin de la partie, avec la durée et les applis fermées.'],
    ['📈', 'Le boost prouvé', 'Après une partie, tu vois combien de FPS le boost te fait gagner par rapport à tes parties sans boost.'],
    ['☁', 'OneDrive en pause pendant le jeu', 'Si tu coches OneDrive dans le boost, sa synchro est mise en pause proprement puis reprend à la fin.'],
    ['🖥', 'Écran bridé repéré', 'Mon PC te prévient si ton écran tourne à 60 Hz alors qu’il peut monter à 144 Hz ou plus.'],
    ['🚀', 'Steam prêt en fond', 'Nouvelle option dans Paramètres › Jeux : Steam se prépare discrètement au démarrage, les jeux Steam se lancent plus vite.', ['#openSettings', 'wait600', '[data-pane=jeux]', 'wait800']],
  ],
  '0.29.0': [
    ['🎯', 'Priorité au jeu', 'Pendant le boost : le jeu passe devant les autres programmes, les navigateurs se mettent en retrait (fini les freezes quand Chrome ou Edge tournent), les tâches Windows inutiles en jeu (widgets, Lien avec le téléphone) sont fermées, et Windows utilise la carte graphique puissante pour ce jeu (gros gain sur les portables). Tout est remis à la fin, désactivable dans Mon PC › Performances.', ['[data-view=pc]', '[data-pctab=perf]', 'wait1200']],
  ],
  '0.28.2': [
    ['🚧', 'Bandes de travaux qui défilent', 'Sur la page Optimisation, les traits rouges et noirs des bandes défilent en continu, seulement quand l’onglet est affiché.', ['[data-view=optimisation]', 'wait1500']],
  ],
  '0.28.1': [
    ['🚧', 'Optimisation en travaux', 'Le panneau rouge revient comme avant : seules les bandes arrivent et se collent à l’ouverture. Un logo danger rouge s’affiche à gauche d’« Optimisation » dans le menu.'],
  ],
  '0.28.0': [
    ['🪶', 'Launcher plus léger', 'Moins de mémoire utilisée : images des jeux en taille normale (au lieu de ×2) sauf sur grand écran, fond flou dessiné en petit, jeux hors de l’écran non dessinés, fenêtres de notification et de message libérées quand elles ne servent plus, et mémoire vidée quand le launcher est réduit.'],
    ['🚧', 'Bandes qui arrivent', 'Sur la page Optimisation, les bandes de travaux arrivent et se collent à chaque ouverture.'],
  ],
  '0.27.2': [
    ['✨', 'Tes logos sur les profils', 'Discord, Twitch, YouTube, TikTok, Steam et Instagram utilisent maintenant les logos que tu as fournis (TikTok recadré, sans fond à damier).'],
    ['🪟', 'Fenêtres remises à la bonne taille', 'La fenêtre de mise à jour (et les autres confirmations) ne s’affiche plus en très large après avoir ouvert un profil.'],
  ],
  '0.27.1': [
    ['🏷', 'Nom « History Launcher » partout', 'Les notifications de Windows, le gestionnaire des tâches et l’écran de connexion affichent maintenant « History Launcher » (plus « Electron »).'],
  ],
  '0.27.0': [
    ['🖼', 'Fonds des jeux réparés', 'Le grand fond de chaque jeu prend la meilleure image qui charge vraiment (Rainbow Six Siege, GTA V, CS2, Left 4 Dead 2…), avec une adresse de secours si la première ne répond pas.'],
    ['🎯', 'Mieux cadré, même en grand écran', 'Plus de zoom excessif : une petite image n’est jamais étirée (elle est posée nette sur un fond flou), et la bannière s’adapte aux grands écrans.'],
    ['🎨', 'Fond de ta carte de profil', 'Choisis la couleur du fond de ta carte (ou « Auto »).'],
    ['🙈', 'Ce que tu montres', 'À propos › Afficher sur mon profil : cache ton temps de la semaine, ton jeu le plus joué ou ton benchmark.'],
    ['✨', 'Logos officiels', 'Discord, Twitch, YouTube, TikTok, Steam et Instagram ont leurs vrais logos sur les profils.'],
  ],
  '0.26.0': [
    ['☁', 'Comptes reliés à Supabase', 'Comptes, amis, messages et groupes sont gardés sur Supabase ; tes photos, bannières et images de discussion vont dans Supabase Storage. Paramètres › Compte montre si tout est bien sauvegardé.'],
    ['📶', 'Hors ligne visible', 'Si le serveur ne répond plus, une pastille « Hors ligne » s’affiche en haut, puis « De retour en ligne » quand ça revient.'],
    ['🔔', 'Barre des tâches qui clignote', 'Un ami t’écrit pendant que le launcher est derrière une autre fenêtre : son icône clignote dans la barre des tâches.'],
    ['↩', 'Dernière page rouverte', 'Le launcher rouvre la page où tu étais (Amis, Mon PC, Statistiques…).'],
  ],
  '0.25.0': [
    ['⏱', 'Temps de jeu en direct', 'Le temps de jeu monte chaque minute pendant la partie, même pour Steam et FiveM (qui ne l’écrivent qu’à la fermeture du jeu), sans jamais compter deux fois.'],
    ['💬', 'Messages : Vu, écrit…, réponses, réactions', '« Vu à 21 h 04 » sous ton message, « Max écrit… » en direct, ↩ pour répondre à un message précis, 😀 pour réagir (👍 😂 🔥 ❤️ 😮 😢), en privé et en groupe.'],
    ['📷', 'Images et messages programmés', '📎 envoie une de tes captures (ou une image du PC) dans la discussion ; ⏰ programme un message (« on lance à 21 h »).'],
    ['🕒', '« Dispo vers 22 h »', 'Pendant ta partie, tes amis voient vers quelle heure tu seras dispo, d’après la durée habituelle de tes parties.'],
    ['▶', 'Lancer avec le jeu', 'Outils du jeu › Santé & lancement : Discord, Spotify, OBS… s’ouvrent tout seuls avec le jeu. Et si une mise à jour Steam attend, History te propose de la faire avant de jouer.'],
    ['💥', 'Plantages expliqués', 'Si un jeu se ferme brutalement, History lit le journal de Windows et te dit la cause probable (pilote, mod, overlay, anti-triche…) et quoi faire. Le temps de démarrage est aussi mesuré.'],
    ['💽', 'Disques surveillés', 'Alerte quand un disque est presque plein, avec les gros jeux oubliés à libérer ; Mon PC › Composants montre l’usure et la santé de tes SSD et disques durs.'],
    ['🚀', 'Test de connexion', 'Mon PC › Réseau : ping, stabilité, paquets perdus, débit, Wi-Fi ou câble, avec un conseil clair. En jeu, le widget affiche ton ping en direct.'],
    ['💻', 'Connexion par code', 'Sur un nouveau PC : « Se connecter avec un autre PC », puis entre le code affiché depuis un PC déjà connecté. Tes réglages, collections, journal et alertes de prix suivent.'],
    ['📓', 'Journal de parties', 'Statistiques : chaque partie indique avec quels amis tu as joué et combien de captures tu as prises.'],
  ],
  '0.24.0': [
    ['💬', 'Messages fiables', 'Un message qui ne part pas est renvoyé tout seul (sans doublon), sinon il reste affiché avec « Réessayer ». Les discussions s’ouvrent tout de suite, même au démarrage.'],
    ['🗑', 'Supprimer un message', 'Passe la souris sur un de tes messages › 🗑 : il disparaît aussi chez ton ami (ou tout le groupe).'],
    ['👥', 'Discussion de groupe', 'Chaque groupe a maintenant sa propre discussion, avec le nom et la photo de qui parle. « Prévenir » envoie toujours une notification à tout le monde.'],
    ['🎮', 'Réponds sans quitter ton jeu', 'Quand un ami t’écrit, une petite bulle apparaît en haut à droite, même en partie : clique dessus, écris, Entrée, et tu retournes jouer (jeu en plein écran fenêtré).'],
    ['🖼', 'Profil retouché', 'Recadre ta photo et ta bannière (glisser + zoom), cadre à ta couleur, nouvelles bannières plus douces, bio sans cadre, et réseaux cliquables : colle le lien de ta chaîne, tes amis l’ouvrent en un clic.'],
    ['🚧', 'Optimisation en travaux', 'On retravaille l’optimisation pour qu’elle ne fasse plus bugger aucun jeu. En attendant, rien n’est modifié ; « Remettre Windows comme avant » reste disponible.'],
  ],
  '0.23.0': [
    ['🖼', 'Profil bien plus personnalisable', 'Bannière (10 styles ou ta propre image), cadre animé autour de ta photo (néon, or, feu, glace, galaxie…), effet sur ton pseudo (dégradé, néon, or, arc-en-ciel).'],
    ['🏅', 'Badges, jeu préféré et réseaux', 'Choisis jusqu’à 3 badges, ton jeu préféré et tes réseaux (Discord, Twitch, YouTube, TikTok, Steam, Instagram) : tes amis les copient en un clic.'],
    ['🪪', 'Carte de profil', 'Clique sur la photo d’un ami dans sa discussion pour voir sa carte : bannière, bio, badges, temps de jeu de la semaine, benchmark et réseaux.'],
    ['👀', 'Aperçu en direct', 'L’éditeur de profil montre ta carte telle que tes amis la verront pendant que tu la modifies.'],
  ],
  '0.22.0': [
    ['👥', 'Page Amis en deux panneaux', 'Tes amis à gauche, la discussion à droite (plus de fenêtre qui s’ouvre). Groupes et Soirées ont leurs onglets en haut, avec le même principe : la liste à gauche, le détail à droite.', ['[data-view=amis]']],
    ['🎨', 'Personnalise ton profil', 'Photo de profil, couleur et bio : clique sur ton nom en bas à gauche › Personnaliser mon profil. Tes amis les voient partout (liste, discussion, notifications).'],
    ['🔔', 'Notifications plus claires', 'La cloche passe à gauche, et chaque notification montre la photo de ton ami.'],
    ['🧩', 'Composants avec néon', 'Mon PC › Composants : un néon de couleur tourne autour de chaque composant. Les alertes importantes (redémarrage en attente…) passent en verre rouge.', ['[data-view=pc]', '[data-pctab=composants]', 'wait1500']],
    ['🎮', 'Jeu en cours plus juste', 'Riot Vanguard, les anti-triche, clients et lanceurs ne sont plus affichés comme des jeux (« Joue à … »).'],
  ],
  '0.21.1': [
    ['🔐', 'Double authentification seulement à la connexion', 'Le code de l’application n’est plus demandé à chaque ouverture : seulement quand tu te reconnectes à ton compte (option « à chaque ouverture » dans Paramètres › Compte si tu préfères). Et tant que tu ouvres le launcher, tu restes connecté.'],
    ['🛠', 'Optimisation corrigée', 'L’optimisation retire toute seule les réglages d’anciennes versions qui faisaient bugger FiveM et d’autres jeux, et ne les propose plus jamais.', ['[data-view=optimisation]']],
    ['💽', 'Analyse pro : choisis tes disques', 'Mon PC › Analyse pro : coche un seul disque ou plusieurs avant de lancer.', ['[data-view=pc]', '[data-pctab=analyse]', 'wait900']],
    ['📋', 'Boutons Copier réparés', 'Code ami, lien d’invitation, commande Discord, rapport, codes de secours : tout se copie. Et un bouton pour copier le code de chaque ami.'],
  ],
  '0.21.0': [
    ['👥', 'Page Amis refaite', 'Cartes d’amis claires (en jeu, en ligne, hors ligne), recherche, ton profil et ton code à droite, groupes avec les avatars des membres : plus rien ne déborde ni ne passe sous les fenêtres.', ['[data-view=amis]']],
    ['🔔', 'Centre de notifications', 'La cloche en haut à droite garde tes dernières notifications (amis et appli) : répondre, rejoindre, rappeler un appel manqué, recevoir une sauvegarde… directement depuis la liste.', ['[data-view=amis]', '#bellBtn', 'wait900']],
    ['⚡', 'Messages et appels instantanés', 'Les messages, invitations et appels arrivent tout de suite (plus 15 s d’attente). Un appel sonne toujours, même notifications coupées ou en partie, et un appel raté reste dans le centre.'],
    ['💬', 'Discussion plus agréable', 'Statut de ton ami en direct, bouton Appeler / Rejoindre, Entrée pour envoyer, messages regroupés par jour.'],
  ],
  '0.20.1': [
    ['↩', 'Correctif FiveM et jeux qui buggent', 'Les réglages qui pouvaient faire saccader ou planter certains jeux (planification GPU forcée, bridage réseau, applis en arrière-plan) sont retirés. Optimisation › « Remettre Windows comme avant » remet tout comme avant ta première optimisation.', ['[data-view=optimisation]']],
    ['🎮', 'Rien par-dessus tes parties', 'Pendant un jeu, les notifications d’amis attendent la fin de la partie (plus de fenêtre qui fait clignoter FiveM en plein écran), et le launcher mesure le PC plus légèrement.'],
    ['🧊', 'Caches de shaders gardés', 'L’optimisation ne vide plus les caches de shaders (DirectX, NVIDIA, AMD) : c’est ce qui faisait saccader les jeux après un nettoyage.'],
  ],
  '0.20.0': [
    ['📤', 'Clips et captures sur Discord', 'Bouton « Discord » après un clip (Ctrl+Alt+R) ou une capture, et dans la fiche d’un jeu : ça part dans le salon des clips du serveur (vidéo trop lourde réduite toute seule).', ['[data-view=accueil]']],
    ['🎮', 'Parties de groupe sur Discord', 'Dans Amis › Groupes, « 🎮 Discord » : le bot mentionne les membres et affiche « Je viens / Pas dispo ». Tu es prévenu dans le launcher quand quelqu’un vient.', ['[data-view=amis]']],
    ['🎚', 'Réglages graphiques conseillés', 'Clic droit sur un jeu › Outils du jeu › Réglages conseillés : qualité, résolution, DLSS/FSR et conseils selon ton benchmark, tes FPS mesurés et ton écran.', ['[data-view=accueil]', '#moreBtn', '[data-tools]', 'wait1500', '[data-ttab=graph]', 'wait1200']],
    ['💾', 'Envoyer sa sauvegarde à un ami', 'Outils du jeu › Sauvegardes › « Envoyer à un ami ». Il la reçoit en un clic ; sa partie est copiée avant.'],
    ['🔴', 'Mode streamer', 'Automatique quand OBS, Streamlabs ou Twitch Studio tourne : plus de notifications, pseudos d’amis masqués.'],
    ['🔥', 'Alerte de surchauffe', 'En jeu, si le processeur ou la carte graphique chauffe trop, une alerte apparaît. Le widget peut aussi s’afficher tout seul pendant les parties.'],
    ['💸', 'Promos en message privé Discord', 'Tes prix suivis et ta liste de souhaits Steam : le bot t’écrit en privé, même PC éteint. Et sur Discord : /launcher comparer et /launcher fps.'],
  ],
  '0.19.1': [
    ['⬆', 'Mises à jour proposées toutes seules', 'Le launcher cherche une nouvelle version toutes les 30 min et dès que tu reviens dessus, avec une notification Windows s’il est fermé.'],
    ['🎁', 'Salon des bons plans sur Discord', 'Jeux gratuits Epic et grosses promos Steam (-50 % et plus) postés tout seuls dans un salon dédié.'],
  ],
  '0.19.0': [
    ['🎛', 'Outils du jeu', 'Clic droit sur un jeu › Outils du jeu : profil automatique (performances, applis fermées, notifications Windows coupées, partie classée), sauvegardes des parties, réparation des saccades, déplacement vers un autre disque, historique des FPS.', ['[data-view=accueil]', '#moreBtn', '[data-tools]', 'wait1500', '[data-ttab=perf]', 'wait1200']],
    ['📈', 'Vrais FPS et goulot', 'Mesure réelle avec PresentMon : FPS moyens, 1 % low, saccades, et qui limite (processeur ou carte graphique), partie après partie.'],
    ['👥', 'Groupes de jeu', 'Crée « Squad RL » avec tes amis et préviens tout le groupe d’un coup (« On lance à 21 h ? »).', ['[data-view=amis]']],
    ['🎮', 'Place prise par tes jeux', 'Optimisation : ce que chaque jeu occupe, et ceux pas lancés depuis 6 mois à désinstaller. Plus : gain mesuré avant / après et historique des réglages Windows.', ['[data-view=optimisation]', '#optiScan', 'wait9000', '.gamesize']],
    ['🖥', 'Widget, manette, batterie, prix', 'Widget sur le bureau (températures, FPS, amis), navigation à la manette, économie sur batterie, alertes de prix Steam + meilleur prix ailleurs.', ['#openSettings', '.setnav [data-pane=jeux]', '#setGamesNew']],
    ['🤖', 'History sur Discord', '/launcher profil (niveau, benchmark, jeu du moment), rôles automatiques, jeux gratuits Epic annoncés, et un e-mail si ton compte se connecte depuis un nouveau PC.'],
  ],
  '0.18.0': [
    ['🏁', 'Benchmark extrême', 'Processeur : 5 vraies épreuves (SHA-256, compression, physique, tri, IA) sur 1 cœur puis tous, + 30 s d’endurance pour voir s’il chauffe. Mémoire : débit et latence. Disque : 2 Go, lecture d’un vrai fichier de jeu, 4 Ko aléatoires. Carte graphique : 3 scènes en 2560×1440 (150 000 cubes, raymarching, HDR + bloom). Nouveau classement mondial.', ['[data-view=pc]', '[data-pctab=perf]']],
    ['⬆', 'Mises à jour réparées', 'La fenêtre « Nouvelle version disponible » s’affiche enfin, le bouton « Rechercher une mise à jour » marche, et une mise à jour se télécharge toute seule si tu ne réponds pas.'],
    ['🔒', 'Double authentification à chaque ouverture', 'Avec la double authentification, le launcher demande le code de ton application à chaque ouverture (réglable), et les autres PC sont déconnectés quand tu l’actives.'],
    ['🪶', 'Beaucoup plus léger', 'Moins de processeur (plus de PowerShell relancé toutes les 5 s, animations en pause en arrière-plan) et moins de mémoire (la fenêtre se libère quand le launcher est dans la barre des tâches, démarrage de Windows sans fenêtre).'],
  ],
  '0.17.1': [
    ['🌐', 'Nouveau site du launcher', 'zyko144.github.io/vercel-ia- : toutes les fonctions, l’analyse pro, Windows Update et le journal des versions. Paramètres › À propos › Site du launcher.', ['#openSettings', '.setnav [data-pane=about]']],
  ],
  '0.17.0': [
    ['🔬', 'Analyse pro de tout le PC', 'Mon PC › Analyse pro : chaque fichier de chaque disque est lu un par un, les doublons sont confirmés par empreinte SHA-256, chaque fichier louche passe à l’antivirus et le journal de Windows est vérifié (écrans bleus, arrêts brutaux, erreurs disque).', ['[data-view=pc]', '[data-pctab=analyse]']],
    ['⬆', 'Windows Update dans le launcher', 'Mon PC › Windows Update : recherche, choisis et installe tes mises à jour Windows, pilotes et Defender, avec l’avancement en direct.', ['[data-view=pc]', '[data-pctab=maj]']],
    ['❤', 'Un seul score de santé', 'Le même score partout (Mon PC et Optimisation), détaillé : matériel et sécurité, entretien, fichiers, stabilité de Windows.', ['[data-view=pc]', 'wait2500']],
    ['⚙', 'Optimisation pro', 'Réglages système en administrateur (priorité aux jeux, planification GPU, performances optimales, veille prolongée…) avec point de restauration, TRIM/défragmentation de tous les disques, réparation de Windows (DISM + SFC).', ['[data-view=optimisation]', '#optiScan', 'wait9000', '#sysTweaks']],
    ['🗂', 'Mon PC rangé en onglets', 'Vue d’ensemble, Analyse pro, Windows Update, Composants, Sécurité, Performances, Réseau : tout est plus aéré.'],
  ],
  '0.16.0': [
    ['🏅', 'Niveaux, badges et série de jours', 'Statistiques : ton niveau de joueur, ta série de jours d’affilée et 15 badges à débloquer (marathon, oiseau de nuit, machine de guerre…).', ['[data-view=stats]']],
    ['🕒', 'Quand tu joues', 'Tes heures de jeu sur 30 jours et le journal de tes sessions (début, durée), en plus des statistiques.'],
    ['🌡', 'Courbes des dernières 24 h et réseau', 'Mon PC : processeur, température graphique et mémoire sur 24 h, latence vers Steam / Epic / Riot / FiveM, et le DNS le plus rapide.', ['[data-view=pc]', '#pcTemps']],
    ['👥', 'Statut, ne pas déranger et lien d’invitation', 'Mets un statut (« Dispo pour jouer »), coupe les notifications, partage un lien history:// qui ajoute ton code, et les liens d’arnaque sont signalés dans le chat.', ['[data-view=amis]']],
    ['🎯', 'À redécouvrir', 'L’accueil te repropose les jeux où tu as passé des heures mais que tu n’as pas lancés depuis un mois.', ['[data-view=accueil]', '#rediscBlock']],
    ['🏆', 'Mode tournoi, mode compact, taille du texte', 'Paramètres : boost automatique et zéro notification en tournoi, plus de jeux à l’écran, texte plus grand, test du micro.', ['#openSettings']],
    ['📋', 'Configuration requise', 'Clic droit sur un jeu Steam › Config requise : minimum et recommandé comparés à ton PC, avec l’avis de l’IA et des conseils.'],
    ['🌍', 'Classement mondial des benchmarks', 'Compare ton score à tous les joueurs History (tes amis sont mis en avant) et suis ta progression.'],
    ['🧩', 'GOG et Ubisoft Connect', 'Les jeux GOG et Ubisoft installés apparaissent dans la bibliothèque, sans doublon.'],
    ['🛟', 'Point de restauration, rapport PDF, export', 'Crée un point de restauration Windows en un clic, enregistre le rapport du PC en PDF, exporte ou importe ta bibliothèque.'],
    ['🔔', 'Alertes utiles', 'Un nouveau jeu gratuit sur Epic ou une baisse de santé du PC au diagnostic de la semaine : tu es prévenu.'],
  ],
  '0.15.0': [
    ['📞', 'Appels entre amis', 'Bouton 📞 sur un ami en ligne : appel vocal direct (micro avec suppression du bruit), sonnerie en bas à gauche.', ['[data-view=amis]']],
    ['🧩', 'Addons Garry’s Mod', 'Clic droit sur Garry’s Mod : tes addons installés, et colle un lien du Workshop pour en ajouter.'],
    ['⚡', 'Installation en un clic', 'Plus d’assistant Windows : l’installation se lance directement puis History s’ouvre tout seul.'],
  ],
  '0.14.1': [
    ['🎮', 'Mémoire vidéo exacte', 'Mon PC affiche la vraie mémoire des cartes graphiques de plus de 4 Go (Windows la tronquait).', ['[data-view=pc]']],
    ['🌐', 'Site du launcher', 'Toutes les fonctions expliquées avec des captures, et la dernière version à télécharger : zyko144.github.io/vercel-ia-'],
  ],
  '0.14.0': [
    ['🔬', 'Analyse complète du PC', 'Mon PC › Analyse complète : composants, antivirus complet, programmes louches, fichiers inutiles, benchmark et rapport détaillé.', ['[data-view=pc]']],
    ['⏳', 'Durée de vie des composants', 'Usure réelle des SSD, heures des disques durs, santé de la batterie : avec une estimation en années.'],
    ['💡', 'Améliorations conseillées', 'Barrette manquante, XMP désactivé, disque système lent, pilote ancien… avec le gain attendu.'],
    ['🏁', 'Benchmark History', 'Processeur, mémoire, disque et carte graphique mesurés pour de vrai, avec un score comparable.'],
    ['🛡', 'Antivirus intégré', 'Analyse rapide ou complète avec l’antivirus de Windows et suppression des menaces depuis le launcher.'],
  ],
  '0.13.1': [
    ['📣', 'Nouveautés annoncées sur Discord', 'Chaque nouvelle version est postée sur le serveur Discord avec une capture de la nouveauté.', ['#openSettings', '.setnav [data-pane=about]']],
  ],
  '0.13.0': [
    ['🛡', 'Double authentification', 'Paramètres › Compte : scanne le QR code avec Google Authenticator, Authy ou 2FAS. 8 codes de secours fournis.', ['#openSettings', '.setnav [data-pane=compte]']],
    ['✉', 'Vérification de l’e-mail', 'Un code est envoyé à l’inscription pour confirmer ton adresse.'],
    ['🔑', 'Mot de passe oublié', 'Reçois un code par e-mail pour choisir un nouveau mot de passe (toutes les sessions sont déconnectées).'],
  ],
  '0.12.1': [
    ['🔊', 'Sons premium', 'Navigation, lancement de jeu, notifications et appels ont leur son (réglable dans Paramètres › Sons).'],
    ['⚙', 'Paramètres rangés', 'Tout est classé par catégories : Général, Jeux, Amis, Sons, Compte, À propos.'],
    ['🛡', 'Anti-triche respecté', 'Rocket League, Rainbow Six et les jeux avec Easy Anti-Cheat ou BattlEye passent toujours par Steam / Epic.'],
    ['⬆', 'Écran de mise à jour', 'La mise à jour s’affiche dans notre fenêtre avec la progression, puis le launcher redémarre tout seul.'],
    ['☁', 'Sauvegarde en ligne', 'Collections, favoris, réglages et heures sauvegardés sur ton compte, retrouvés sur un autre PC.'],
    ['🖼', 'Fond animé', 'Le fond prend doucement les couleurs du jeu sélectionné.'],
  ],
  '0.12.0': [
    ['📸', 'Captures d’écran', 'Ctrl+Alt+S (ou « fais une capture » à l’IA) : rangées dans Vidéos › nom du jeu et visibles dans la fiche du jeu.'],
    ['🎬', 'Replay 30 secondes', 'Active-le dans les Paramètres, puis Ctrl+Alt+R (ou « clip ça ») garde les 30 dernières secondes.'],
  ],
  '0.11.2': [
    ['⚡', 'Opti par jeu', 'Clic droit sur un jeu › « Toujours optimiser ce jeu » (ou jamais). Marche aussi quand le jeu est lancé hors du launcher.'],
    ['🖥', 'Alerte pilote graphique', 'Si ton pilote NVIDIA, AMD ou Intel est vieux, un rappel te mène à la page officielle.'],
    ['✨', 'Score d’opti plus propre', 'Plus de carré autour du cercle.'],
  ],
  '0.11.1': [
    ['🖱', 'Clic droit sur le menu', 'Collections : renommer, vider, supprimer. Plateformes et onglets : masquer (réglage perso, remis d’un clic).'],
  ],
  '0.11.0': [
    ['👥', 'Amis en direct', 'Quand un ami lance un jeu, une notification apparaît en bas à gauche : Rejoindre ou « On joue ? ».'],
    ['💬', 'Messages entre amis', 'Écris à tes amis History : ils reçoivent le message en bas à gauche de leur écran, même en jeu.'],
    ['🌐', 'Serveurs FiveM', 'Clic droit sur FiveM › Mes serveurs : favoris, joueurs en ligne, tes heures par serveur, rejoindre en un clic.'],
    ['🤖', 'IA sans clé', 'L’assistant marche directement avec ton compte History : plus besoin de clé dans les Paramètres.'],
  ],
  '0.10.4': [
    ['⬆', 'Mises à jour propres', 'Le launcher demande « Mettre à jour maintenant ? » puis s’installe en silence, sans réinstallation. Tu peux aussi dire à l’IA « fais la mise à jour ».'],
    ['🛠', 'Bibliothèque en direct réparée', 'La liste des jeux se met de nouveau à jour toute seule.'],
  ],
  '0.10.3': [
    ['🪟', 'Logo sans fond partout', 'L’icône de l’app sur Windows (barre des tâches, bureau, notifications) n’a plus de fond noir.'],
  ],
  '0.10.2': [
    ['🎨', 'Menu en dégradé', 'Le fond du menu de gauche devient un dégradé de couleurs qui glisse doucement.'],
  ],
  '0.10.1': [
    ['✨', 'Nouveau menu en verre', 'Le menu de gauche passe en effet verre liquide aux couleurs animées, et le logo n’a plus de fond.'],
  ],
  '0.10.0': [
    ['🎮', 'Tes vraies heures FiveM', 'Lues dans les journaux de FiveM, même celles d’avant le launcher. Clic droit › Rejoindre un serveur.'],
    ['⏱', 'Heures de jeu plus fiables', 'Un programme ne compte que pour un seul jeu, rien n’est compté PC verrouillé ou en veille, et la source du temps est affichée.'],
    ['🔐', 'Création de compte corrigée', 'Règle de mot de passe plus simple, indication pendant la saisie et bouton 👁.'],
    ['⬆', 'Mises à jour automatiques', 'Plus besoin de réinstaller : le launcher se met à jour tout seul et te prévient.'],
  ],
  '0.9.0': [
    ['⚡', 'Page Optimisation', 'Score de santé du PC, catégories rangées, avancement en direct et optimisation automatique chaque semaine.'],
    ['🔎', 'Recherche rapide', 'Ctrl+Espace (ou Ctrl+Alt+Espace depuis Windows) : lance n’importe quel jeu en 2 touches.'],
    ['🖱', 'Clic droit partout', 'Jouer, favori, collections, masquer, désinstaller… sur chaque jeu et appli.'],
    ['🎙', 'Voix améliorée', 'Windows écoute tes jeux par leur nom ; « Hey History » seul = écoute par Gemini.'],
    ['📺', 'Mode grand écran', 'F11 : tout en grand, idéal avec une manette sur la TV.'],
    ['🤖', 'L’IA agit à ta place', 'Ajoute des amis, organise des soirées, optimise le PC, change les réglages…'],
  ],
};
const vnum = (v) => String(v ?? '0').split('.').map((n) => Number(n) || 0).reduce((a, n) => a * 1000 + n, 0);
// Serveurs FiveM : favoris avec joueurs en ligne, heures par serveur (tirées des journaux de FiveM), rejoindre en un clic
// Garry's Mod : addons installés + ajout depuis un lien du Workshop (installé par Steam, tenu à jour tout seul)
async function openGmod(found = null) {
  hideCtx();
  const r = await api.gmodAddons?.().catch(() => null);
  const list = r?.list ?? [];
  const card = found && !found.error ? `<div class="wscard">${found.preview ? `<img src="${esc(found.preview)}" alt="">` : ''}<div><b>${esc(found.title)}</b><small>${found.size ? `${(found.size / 1e6).toFixed(1).replace('.', ',')} Mo · ` : ''}${found.subs.toLocaleString('fr-FR')} abonnés${found.tags.length ? ` · ${esc(found.tags.join(', '))}` : ''}</small><button type="button" class="btn play sm" data-gminst="${esc(found.id)}">⬇ Installer (via Steam)</button></div></div>` : found?.error ? `<p class="autherr">${esc(found.error)}</p>` : '';
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🧩</span><h2>Addons Garry’s Mod</h2></div>
    <div class="row"><input id="wsLink" class="wsin" placeholder="Colle le lien d’un addon du Workshop" value="${esc(found?.id ?? '')}"><button type="button" class="btn" id="wsGo">Voir</button></div>
    ${card}
    <p class="hint">Steam télécharge l’addon et le garde à jour ; il est disponible au prochain lancement de Garry’s Mod.</p>
    <b class="sub">Installés (${list.length}${list.length ? ` · ${gb(list.reduce((n, a) => n + (a.bytes ?? 0), 0))}` : ''})</b>
    ${list.length ? '<p class="hint">Les plus lourds rallongent chaque chargement : désabonne-toi de ceux que tu n’utilises plus (☁ ouvre sa page Steam).</p>' : ''}
    <div class="wslist">${r?.error ? `<p class="hint">${esc(r.error)}</p>` : list.length ? list.slice(0, 60).map((a) => `<span>${a.where === 'workshop' ? `<button type="button" class="linkbtn" data-gminst="${esc(a.id)}" title="Page Steam : se désabonner">☁</button>` : '📦'} ${esc(a.name)} <em>${gb(a.bytes ?? 0)}</em></span>`).join('') : '<p class="hint">Aucun addon pour l’instant.</p>'}</div>
    <div class="row end"><button type="button" class="btn ghost" id="wsBrowse">Parcourir le Workshop</button><button type="button" class="btn" data-m="1">Fermer</button></div>`;
  if (!$('modal').open) $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) return $('modal').close();
    if (b.id === 'wsBrowse') return api.gmodBrowse();
    if (b.id === 'wsGo') { const d = await api.gmodDetails($('wsLink').value); return openGmod(d?.error ? d : d); }
    if (b.dataset.gminst) { await api.gmodInstall(b.dataset.gminst); toast('Steam s’ouvre sur la page de l’addon (S’abonner ou Se désabonner)'); }
  };
}
// ---------- Outils du jeu : profil, sauvegardes, saccades, déplacement, performances ----------
let toolsFor = null;
// Santé du jeu : derniers plantages expliqués, temps de démarrage, applis lancées avec le jeu
function santeHtml(item, care, w) {
  const loads = care?.loads ?? []; const crashes = care?.crashes ?? [];
  const sec = (ms) => `${Math.round(ms / 1000)} s`;
  const avgLoad = loads.length ? loads.reduce((a, x) => a + x.ms, 0) / loads.length : null;
  const last = loads.at(-1);
  return `<b class="sub">⏱ Temps de démarrage</b>
    ${loads.length ? `<div class="scansum"><div><b>${sec(last.ms)}</b><small>dernier lancement</small></div><div><b>${sec(avgLoad)}</b><small>en moyenne (${loads.length})</small></div><div class="${last.ms > avgLoad * 1.5 ? 'bad' : ''}"><b>${last.ms > avgLoad * 1.5 ? 'Plus lent' : 'Normal'}</b><small>par rapport à d’habitude</small></div></div>` : '<p class="hint">Lance le jeu depuis History : le temps entre le clic et l’apparition de sa fenêtre sera mesuré (tu es prévenu s’il devient anormalement long).</p>'}
    <b class="sub">💥 Plantages</b>
    ${crashes.length ? `<div class="flist">${crashes.slice(0, 8).map((c) => `<div class="crash"><div><b>${esc(c.cause)}</b><small>${new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}${c.module ? ` · module ${esc(c.module)}` : ''}</small><p>${esc(c.fix)}</p></div></div>`).join('')}</div>` : '<p class="hint">Aucun plantage repéré 👍 Si le jeu se ferme brutalement, History lit le journal de Windows et t’explique la cause probable.</p>'}
    <b class="sub">▶ Lancer avec le jeu</b><p class="hint">Ces applis s’ouvrent en même temps que ${esc(item.name)} (si elles ne tournent pas déjà).</p>
    ${w?.apps?.length ? `<div class="checks">${w.apps.map((a) => `<label class="check"><input type="checkbox" data-with="${esc(a.id)}" ${w.with.includes(a.id) ? 'checked' : ''}>${esc(a.name)}</label>`).join('')}</div><div class="row"><button class="btn play" data-tact="with">Enregistrer</button></div>` : '<p class="hint">Aucune appli trouvée sur le PC.</p>'}`;
}
async function openTools(item, tab = 'profil') {
  hideCtx();
  toolsFor = item;
  const [d, care, withApps] = await Promise.all([api.tools(item.id).catch(() => null), api.gameCare?.(item.id).catch(() => null), api.gameWith?.(item.id).catch(() => null)]);
  if (!d || d.error) return toast(d?.error ?? 'Impossible');
  const p = d.profile;
  const tabs = [['profil', '🎛 Profil'], ['graph', '🎚 Réglages conseillés'], ['saves', '💾 Sauvegardes'], ['shaders', '🧊 Saccades'], ...(d.canMove ? [['move', '📦 Déplacer']] : []), ['sante', '🩺 Santé & lancement'], ['perf', '📈 Performances']];
  const perf = d.perf.slice().reverse();
  const B = { cpu: 'processeur limitant', gpu: 'carte graphique à fond', mixte: 'équilibré' };
  const month = (days) => perf.filter((x) => Date.now() - x.at < days * 86_400_000 && x.avg);
  const avgOf = (l) => (l.length ? Math.round(l.reduce((a, x) => a + x.avg, 0) / l.length) : null);
  const recent = avgOf(month(7)); const older = avgOf(perf.filter((x) => Date.now() - x.at >= 7 * 86_400_000 && Date.now() - x.at < 37 * 86_400_000 && x.avg));
  const body = {
    profil: `<p class="hint">Appliqué automatiquement à chaque lancement de ${esc(item.name)}, puis tout est remis comme avant.</p>
      <label class="toggle"><input type="checkbox" data-prof="enabled" ${p.enabled ? 'checked' : ''}><span></span><b>Activer le profil de ce jeu</b></label>
      <label class="toggle small"><input type="checkbox" data-prof="power" ${p.power !== 'none' ? 'checked' : ''}><span></span>Windows en « Performances élevées » pendant la partie</label>
      <label class="toggle small"><input type="checkbox" data-prof="quiet" ${p.quiet ? 'checked' : ''}><span></span>Couper les notifications de Windows</label>
      <label class="toggle small"><input type="checkbox" data-prof="dnd" ${p.dnd ? 'checked' : ''}><span></span>🎯 Partie classée : ne pas déranger (tes amis voient « En partie classée »)</label>
      <label class="toggle small"><input type="checkbox" data-prof="saves" ${p.saves ? 'checked' : ''}><span></span>💾 Copier mes sauvegardes avant chaque partie</label>
      <label class="toggle small"><input type="checkbox" data-prof="fps" ${p.fps !== false ? 'checked' : ''}><span></span>📈 Mesurer les FPS de ce jeu ${d.fps ? '' : '<small class="opt">à activer dans Paramètres › Jeux</small>'}</label>
      <b class="sub">Fermer pendant la partie</b><div class="checks" id="profApps">${d.apps.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}" ${p.close.includes(a.id) ? 'checked' : ''}>${esc(a.label)}</label>`).join('')}</div>`,
    saves: `<p class="hint">Copie de tes parties dans Documents › History › Sauvegardes de jeux (les 5 dernières sont gardées). Avant une restauration, ta partie actuelle est mise de côté.</p>
      <div class="flist">${d.saveDirs.length ? d.saveDirs.map((x) => `<div><div><b>📁 ${esc(x.split(/[\\\\/]/).pop())}</b><small>${esc(x)}</small></div></div>`).join('') : '<div><div><b>Dossier non trouvé</b><small>Choisis-le à la main (Documents, AppData, Saved Games…)</small></div></div>'}</div>
      <div class="row"><button class="btn play" data-tact="backup" ${d.saveDirs.length ? '' : 'disabled'}>💾 Sauvegarder maintenant</button><button class="btn ghost" data-tact="pick">📁 ${d.savesCustom || d.saveDirs.length ? 'Changer le dossier' : 'Choisir le dossier'}</button><button class="btn ghost" data-tact="openSaves">Ouvrir le dossier des copies</button></div>
      <div class="row"><button class="btn" data-tact="cloudup" ${d.saveDirs.length ? '' : 'disabled'}>☁ Envoyer en ligne</button><button class="btn ghost" data-tact="clouddown" ${d.saveDirs.length ? '' : 'disabled'}>☁ Récupérer la sauvegarde en ligne</button><small class="hint">Jeux hors Steam : envoyée toute seule après chaque partie (compte History)</small></div>
      ${d.received?.length ? `<b class="sub">Reçues de tes amis</b><div class="flist">${d.received.map((x) => `<div><div><b>💾 ${esc(x.from)} · ${esc(x.name)}</b><small>${new Date(x.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · valable 24 h</small></div><button class="btn play sm" data-recv="${esc(x.id)}">Recevoir</button></div>`).join('')}</div>` : ''}
      <div class="row"><button class="btn" data-tact="share" ${d.saveDirs.length ? '' : 'disabled'}>📤 Envoyer ma sauvegarde à un ami</button></div>
      <b class="sub">Copies</b><div class="flist">${d.backups.length ? d.backups.map((b) => `<div><div><b>${new Date(b.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</b><small>${gb(b.bytes)}</small></div><button class="btn ghost sm" data-restore="${esc(b.id)}">Restaurer</button></div>`).join('') : '<p class="hint">Pas encore de copie.</p>'}</div>`,
    graph: graphicsHtml(d.graphics) + (d.fortnite ? `<b class="sub">⚡ Mode Performance de Fortnite</b><p class="hint">Le mode officiel du jeu (moteur léger) : beaucoup plus de FPS et moins de freezes, graphismes plus simples. Tes anciens réglages sont gardés et remis si tu le désactives.</p>
      <div class="row"><button class="btn ${d.fortnite.on ? 'ghost' : 'play'}" data-tact="fnperf">${d.fortnite.on ? '↩ Revenir à mes réglages' : '⚡ Activer le mode Performance'}</button></div>` : ''),
    sante: santeHtml(item, care, withApps),
    shaders: `<p class="hint">Un cache de shaders abîmé ou trop vieux donne des saccades (surtout après une mise à jour du jeu ou du pilote). Il se recrée tout seul : les premières minutes peuvent saccader le temps qu’il se reconstruise.</p>
      <div class="checks">${d.caches.map((c) => `<label class="check"><input type="checkbox" data-cache="${esc(c.id)}" ${c.own ? 'checked' : ''}><span>${esc(c.label)}</span><em>${gb(c.bytes)}</em></label>`).join('')}</div>
      <div class="row"><button class="btn play" data-tact="shaders">🧊 Vider la sélection</button></div>`,
    move: d.canMove ? `<p class="hint">Actuellement dans <b>${esc(d.from)}</b>${d.size ? ` · ${gb(d.size)}` : ''}. Ferme Steam complètement avant de lancer le déplacement.</p>
      <div class="flist">${d.targets.length ? d.targets.map((t) => `<div><div><b>${esc(t.lib)}</b><small>${t.free != null ? `${gb(t.free)} libres` : ''}${d.size && t.free != null && t.free < d.size ? ' · pas assez de place' : ''}</small></div><button class="btn play sm" data-move="${esc(t.lib)}" ${d.size && t.free != null && t.free < d.size ? 'disabled' : ''}>Déplacer ici</button></div>`).join('') : '<p class="hint">Aucune autre bibliothèque Steam : crées-en une dans Steam › Paramètres › Stockage.</p>'}</div><div id="moveProg"></div>` : '',
    perf: `${perf.length ? `<div class="scansum">${recent ? `<div><b>${recent}</b><small>FPS moyens (7 jours)</small></div>` : ''}${older && recent ? `<div class="${recent < older * 0.9 ? 'bad' : ''}"><b>${recent >= older ? '+' : ''}${Math.round((100 * (recent - older)) / older)} %</b><small>vs le mois d’avant (${older} FPS)</small></div>` : ''}<div><b>${perf.length}</b><small>parties suivies</small></div></div>
      <div class="flist">${perf.slice(0, 20).map((x) => `<div><div><b>${new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${x.minutes} min</b><small>${x.avg ? `${x.avg} FPS moy. · 1 % low ${x.low1}${x.stutters ? ` · ${x.stutters} saccades` : ''}` : 'FPS non mesurés'}${x.bound ? ` · ${B[x.bound]}` : ''}${x.gpuAvg != null ? ` · carte graphique ${x.gpuAvg} %` : ''}${x.coreMax != null ? ` · cœur le plus chargé ${x.coreMax} %` : ''}${x.gpuTmax ? ` · 🌡️ GPU ${x.gpuTmax} °C` : ''}${x.cpuTmax ? ` · CPU ${x.cpuTmax} °C` : ''}</small></div></div>`).join('')}</div>`
      : `<p class="hint">Joue une partie de plus de 3 minutes : tes FPS (si la mesure est activée), la charge du processeur et de la carte graphique et le composant qui limite s’afficheront ici.</p>`}
      ${d.fps ? '' : '<div class="row"><button class="btn" data-tact="fps">📈 Activer la mesure des vrais FPS</button></div>'}`,
  };
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🎛</span><h2>${esc(item.name)}</h2></div>
    <div class="tabs toolstabs">${tabs.map(([k, l]) => `<button data-ttab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="toolsbody">${body[tab] ?? ''}</div>
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  if (!$('modal').open) $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.m) return $('modal').close();
    if (t.dataset.ttab) return openTools(item, t.dataset.ttab);
    if (t.dataset.restore) { const r = await api.savesRestore(item.id, t.dataset.restore); if (r?.ok) toast('💾 Sauvegarde restaurée'); else if (!r?.cancelled) toast(r?.error ?? 'Impossible'); return openTools(item, 'saves'); }
    if (t.dataset.move) {
      t.disabled = true;
      const r = await api.steamMove(item.id, t.dataset.move);
      if (r?.ok) { toast(`📦 ${item.name} déplacé (${gb(r.bytes)})`); return $('modal').close(); }
      t.disabled = false; if (!r?.cancelled) toast(r?.error ?? 'Déplacement impossible');
      return;
    }
    const a = t.dataset.tact;
    if (a === 'with') { const list = [...document.querySelectorAll('#modalBox [data-with]:checked')].map((x) => x.dataset.with); const r = await api.gameWith(item.id, list); toast(r?.ok ? (list.length ? `▶ ${list.length} appli(s) lancée(s) avec ${item.name}` : 'Plus rien ne se lance avec le jeu') : 'Impossible'); return; }
    if (a === 'backup') { t.disabled = true; const r = await api.savesBackup(item.id); toast(r?.ok ? `💾 Copie faite (${gb(r.bytes)})` : r?.error ?? 'Impossible'); return openTools(item, 'saves'); }
    if (a === 'pick') { await api.savesPick(item.id); return openTools(item, 'saves'); }
    if (a === 'cloudup') { t.disabled = true; const r = await api.savesCloudUp?.(item.id); toast(r?.ok ? `☁ Sauvegarde en ligne (${gb(r.bytes)})` : r?.error ?? 'Envoi impossible'); t.disabled = false; return; }
    if (a === 'clouddown') { const r = await api.savesCloudDown?.(item.id); if (!r?.cancelled) toast(r?.ok ? `☁ ${r.files} fichier(s) récupéré(s)` : r?.error ?? 'Impossible'); return; }
    if (a === 'openSaves') return api.savesOpen();
    if (a === 'fnperf') { const r = await api.fortnitePerf(item.id, !d.fortnite.on); toast(r?.ok ? (d.fortnite.on ? '↩ Réglages de Fortnite remis' : '⚡ Mode Performance activé') : r?.error ?? 'Impossible'); return openTools(item, 'graph'); }
    if (a === 'shaders') { const which = [...document.querySelectorAll('#modalBox [data-cache]:checked')].map((x) => x.dataset.cache); if (!which.length) return toast('Rien de coché'); const r = await api.shadersClear(item.id, which); toast(r?.ok ? `🧊 ${gb(r.freed)} de cache vidés` : r?.error ?? 'Impossible'); return openTools(item, 'shaders'); }
    if (a === 'fps') return enableFps();
    if (a === 'bench') { $('modal').close(); return showView('pc'); }
    if (t.dataset.recv) { t.disabled = true; const r = await api.savesReceive(t.dataset.recv); if (r?.ok) toast(r.folder ? `💾 ${r.files} fichier(s) rangés dans Sauvegardes reçues` : `💾 Sauvegarde installée (${r.files} fichier(s))`); else if (!r?.cancelled) toast(r?.error ?? 'Impossible'); return openTools(item, 'saves'); }
    if (a === 'share') return shareSaves(item);
  };
  $('modalBox').onchange = async (e) => {
    const el = e.target;
    if (el.dataset.prof) await api.toolsProfile(item.id, { [el.dataset.prof]: el.dataset.prof === 'power' ? (el.checked ? 'high' : 'none') : el.checked });
    if (el.closest('#profApps')) await api.toolsProfile(item.id, { close: [...document.querySelectorAll('#profApps input:checked')].map((x) => x.value) });
    if (el.dataset.prof === 'enabled') toast(el.checked ? `🎛 Profil actif pour ${item.name}` : 'Profil désactivé');
  };
}
function graphicsHtml(g) {
  if (!g) return '<p class="hint">Réglages conseillés disponibles pour les jeux seulement.</p>';
  if (g.need === 'benchmark') return '<p class="hint">Lance d’abord le benchmark (Mon PC › Performances) : les conseils se basent sur la vraie puissance de ton PC.</p><div class="row"><button class="btn play" data-tact="bench">🏁 Aller au benchmark</button></div>';
  return `<p class="hint">D’après ton benchmark${g.measured ? `, tes ${g.measured} FPS mesurés sur ce jeu` : ''} et ton écran.${g.known ? '' : ' Jeu non répertorié : estimation pour un jeu récent moyen.'}</p>
    <div class="scansum"><div><b>${esc(g.preset)}</b><small>Qualité conseillée</small></div><div><b>${esc(g.res)}</b><small>Résolution</small></div><div><b>${esc(g.upscaler)}</b><small>Mise à l’échelle</small></div><div><b>${g.target}</b><small>FPS visés</small></div></div>
    ${g.tips.length ? `<b class="sub">Conseils</b><ul class="tips">${g.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
}
async function shareSaves(item) {
  const r = await api.hFriends().catch(() => null);
  const amis = r?.amis ?? [];
  if (!amis.length) return toast('Ajoute d’abord des amis History (onglet Amis)');
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">📤</span><h2>Envoyer ma sauvegarde</h2></div>
    <p class="hint">${esc(item.name)} : ton ami la reçoit dans son launcher (valable 24 h). Sa partie à lui est copiée avant d’être remplacée.</p>
    <div class="flist">${amis.map((a) => `<div><div><b>${a.online ? '🟢' : '⚫'} ${esc(a.pseudo)}</b></div><button class="btn play sm" data-sendto="${esc(a.id)}">Envoyer</button></div>`).join('')}</div>
    <div class="row end"><button type="button" class="btn ghost" data-back="1">Retour</button></div>`;
  $('modalBox').onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.back) return openTools(item, 'saves');
    if (t.dataset.sendto) { t.disabled = true; t.textContent = 'Envoi…'; const x = await api.savesShare(item.id, t.dataset.sendto); toast(x?.ok ? `📤 Sauvegarde envoyée (${gb(x.bytes)})` : x?.error ?? 'Impossible'); return openTools(item, 'saves'); }
  };
}
api.onMove?.((p) => { const el = document.getElementById('moveProg'); if (el && p.total) el.innerHTML = `<div class="gbar big"><i style="width:${Math.round((100 * p.copied) / p.total)}%"></i></div><small class="hint">${gb(p.copied)} / ${gb(p.total)} · ${esc(p.file ?? '')}</small>`; });
async function enableFps() {
  if (!(await ui.confirm({ title: 'Mesurer les vrais FPS ?', text: 'Le launcher télécharge PresentMon (outil officiel open source d’Intel, 400 Ko, vérifié) et demande une seule fois l’autorisation administrateur pour avoir le droit de lire les images des jeux. Il faudra ensuite te déconnecter / reconnecter à Windows une fois.', list: ['FPS moyens et 1 % les plus lents de chaque partie', 'Saccades repérées', 'Qui limite : processeur ou carte graphique', 'FPS en direct dans le widget et l’écran d’infos'], ok: '📈 Activer', icon: '📈' }))) return;
  const r = await api.fpsEnable();
  if (!r?.ok) return toast(r?.error ?? 'Autorisation refusée');
  ui.confirm({ title: '✅ Mesure des FPS activée', text: 'Déconnecte-toi puis reconnecte-toi à Windows une fois : ensuite, chaque partie est mesurée automatiquement.', ok: 'OK', cancel: 'Fermer', icon: '📈' });
}

async function openReqs(item) {
  hideCtx();
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>${esc(item.name)}</h2></div><p class="hint">Comparaison avec ton PC…</p>`;
  if (!$('modal').open) $('modal').showModal();
  const r = await api.gameReqs(item.id);
  const row = (label, c, unit = ' Go') => (c?.need == null ? '' : `<div class="reqrow"><span>${label}</span><b>${Math.round(c.need * 10) / 10}${unit}</b><b>${c.have == null ? '?' : `${Math.round(c.have * 10) / 10}${unit}`}</b><em class="${c.ok ? 'ok' : c.ok === false ? 'bad' : ''}">${c.ok ? '✓' : c.ok === false ? '✗' : '?'}</em></div>`);
  const block = (title, v) => (v ? `<div class="reqblock"><h3>${title} ${v.pass === true ? '<span class="ok">● OK</span>' : v.pass === false ? '<span class="bad">● insuffisant</span>' : ''}</h3>
    <div class="reqrow head"><span></span><b>Demandé</b><b>Ton PC</b><em></em></div>${row('Mémoire', v.checks.ram)}${row('Place libre', v.checks.disk)}${row('Mémoire vidéo', v.checks.vram)}
    ${v.cpu ? `<small class="hint">Processeur demandé : ${esc(v.cpu)}</small>` : ''}${v.gpu ? `<small class="hint">Carte graphique demandée : ${esc(v.gpu)}</small>` : ''}</div>` : '');
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>${esc(item.name)} sur ton PC</h2></div>
    ${r?.error ? `<p class="hint">${esc(r.error)}</p>` : `${block('Minimum', r.min)}${block('Recommandé', r.rec)}
    <small class="hint">Ton PC : ${esc(r.mine.cpu ?? '?')} · ${esc(r.mine.gpu ?? '?')}</small>
    ${r.ai ? `<div class="reporttxt">🤖 ${esc(r.ai)}</div>` : ''}`}
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); };
}
async function openFivemServers() {
  hideCtx();
  setModal(), $('modalBox').innerHTML = '<div class="mhead"><span class="micon">🌐</span><h2>Mes serveurs FiveM</h2></div><p class="hint">Chargement…</p>';
  if (!$('modal').open) $('modal').showModal();
  const r = await api.fivemServers?.().catch(() => null);
  const list = (r?.list ?? []).sort((a, b) => (b.fav - a.fav) || (b.minutes - a.minutes));
  const row = (x) => `<div class="fsrv">
      <button type="button" class="star ${x.fav ? 'on' : ''}" data-ffav="${esc(x.code)}" data-on="${x.fav ? '' : '1'}" title="${x.fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${x.fav ? '★' : '☆'}</button>
      <div class="fmeta"><b>${esc(x.name ?? x.code)}</b><small>${x.online === false ? '<span class="off">● Hors ligne</span>' : x.online ? `<span class="ok">● ${x.players}${x.max ? ` / ${x.max}` : ''} joueurs</span>` : '● ?'} · ${x.minutes ? `${hours(x.minutes)} de jeu` : 'pas encore joué'} · <code>${esc(x.code)}</code></small></div>
      <button type="button" class="btn play sm" data-fjoin="${esc(x.code)}">Rejoindre</button></div>`;
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🌐</span><h2>Mes serveurs FiveM</h2></div>
    <div class="fsrvs">${list.length ? list.map(row).join('') : '<p class="hint">Aucun serveur pour l’instant : ajoute un favori ou joue une partie, tes serveurs apparaîtront ici avec tes heures.</p>'}</div>
    ${r?.unknownMinutes > 30 ? `<p class="hint">${hours(r.unknownMinutes)} de jeu sans serveur reconnu (vieux journaux ou connexion directe).</p>` : ''}
    <div class="row end"><button type="button" class="btn ghost" data-fadd="1">＋ Ajouter un favori</button><button type="button" class="btn" data-m="1">Fermer</button></div>`;
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) return $('modal').close();
    if (b.dataset.fjoin) { const j = await api.fivemJoin(b.dataset.fjoin); $('modal').close(); return toast(j?.ok ? 'Connexion au serveur…' : j?.error ?? 'Impossible'); }
    if (b.dataset.ffav) { await api.fivemFav(b.dataset.ffav, Boolean(b.dataset.on)); return openFivemServers(); }
    if (b.dataset.fadd) {
      $('modal').close();
      const code = await ui.prompt({ title: 'Ajouter un serveur favori', text: 'Colle le lien ou le code du serveur (ex. cfx.re/join/abc123).', placeholder: 'cfx.re/join/…', ok: 'Ajouter', icon: '★' });
      if (code) { const f = await api.fivemFav(code, true); if (!f?.ok) toast(f?.error ?? 'Impossible'); }
      return openFivemServers();
    }
  };
}
// Optimisation ouverte : la page se débloque, et un panneau vert l'annonce UNE seule fois par utilisateur
async function optiReady() {
  const s = await api.optiState?.().catch(() => null);
  const nav = document.querySelector('[data-view=optimisation]');
  // Ouverte dès l'affichage (plus de message « en travaux » pendant quelques secondes) ; remise en pause seulement si demandé
  if (s?.paused) $('view-optimisation').classList.add('paused');
  if (!s || s.paused) return;
  // 1re ouverture de la page après le déblocage : cadenas qui s'ouvre puis portes qui s'écartent (une seule fois)
  try { if (!localStorage.getItem('hl-opti-unlocked')) state.unlockFx = true; } catch { /* rien */ }
  if (s.introSeen) return;
  if ($('modal').open) await new Promise((r) => $('modal').addEventListener('close', r, { once: true }));
  api.optiIntroSeen();
  setModal('optiok'), $('modalBox').innerHTML = `<div class="okbadge">✓</div><h2>L’optimisation est prête</h2>
    <p class="mtext">Testée jeu par jeu, sans rien d’irréversible : tu peux y accéder dès maintenant.</p>
    <div class="oklist"><span>🎯 Profils FiveM, Fortnite, R6, Rocket League, Garry’s Mod</span><span>🧹 Nettoyage avec les chemins exacts avant de valider</span><span>↩ Tout s’annule en un clic</span></div>
    <div class="row end"><button type="button" class="btn ghost" data-m="1">Plus tard</button><button type="button" class="btn play" data-optigo="1" autofocus>Découvrir l’optimisation</button></div>`;
  $('modalBox').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $('modal').close(); if (b.dataset.optigo) nav.click(); };
  $('modal').showModal();
}
async function showWhatsNew(force = false) {
  const v = await api.version?.().catch(() => null);
  let seen = null;
  try { seen = localStorage.getItem('hl-seen-version'); } catch { /* rien */ }
  if (!force && (!v || seen === v)) return;
  try { localStorage.setItem('hl-seen-version', v ?? ''); } catch { /* rien */ }
  // Après une mise à jour : seulement les versions pas encore vues, en titres courts ; depuis Paramètres : tout, détaillé
  const versions = Object.keys(CHANGELOG).filter((k) => force || vnum(k) > vnum(seen)).sort((a, b) => vnum(b) - vnum(a));
  const list = versions.flatMap((k) => CHANGELOG[k]).slice(0, force ? 20 : 6);
  if (!list.length) return;
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✨</span><h2>${force ? 'Quoi de neuf' : 'Mise à jour installée'}${v ? ` · v${esc(v)}` : ''}</h2></div>
    <div class="wnew ${force ? '' : 'short'}">${list.map(([ic, t, d, shots, tour]) => `<div><span>${ic}</span><div><b>${esc(t)}</b>${force ? `<small>${esc(d)}</small>` : ''}${tour ? `<button type="button" class="btn sm" data-tour="${esc(tour)}">Montre-moi ↗</button>` : ''}</div></div>`).join('')}</div>
    <div class="row end"><button type="button" class="btn play" data-m="1">C’est parti</button></div>`;
  $('modalBox').onclick = (e) => { const t = e.target.closest('[data-tour]'); if (t) { $('modal').close(); personal.tour(t.dataset.tour); } else if (e.target.closest('[data-m]')) $('modal').close(); };
  $('modal').showModal();
}
// Mises à jour : « Mettre à jour maintenant ? » dès qu'une version sort (Oui → téléchargée puis redémarrage auto ;
// Plus tard → téléchargée en fond, installée à la prochaine fermeture). Bouton dans les Paramètres + commande IA.
let updAsked = null;
let appVersion = '';
function renderUpdateRow(u) {
  const el = $('updStatus'); if (!el || !u) return;
  const cur = u.current ? `Version ${u.current}` : '';
  el.textContent = !u.packaged && u.packaged !== undefined ? `${cur} · version développeur (mise à jour par le .bat)`
    : u.state === 'checking' ? `${cur} · recherche…`
    : u.state === 'available' ? `${cur} · v${u.version} disponible`
    : u.state === 'progress' ? `${cur} · téléchargement ${u.percent ?? 0} %`
    : u.state === 'ready' || u.ready ? `${cur} · v${u.version ?? u.ready} prête`
    : u.state === 'uptodate' ? `${cur} · à jour ✓`
    : u.state === 'error' ? `${cur} · erreur : ${u.error ?? '?'}` : cur;
}
function handleAppUpdate(u) {
  renderUpdateRow({ ...u, packaged: true, current: appVersion });
  if (u.state === 'available' && updAsked !== u.version && !u.installNow) {
    updAsked = u.version;
    ui.confirm({ title: `Nouvelle version v${u.version} disponible`, text: 'Mettre à jour maintenant ? Le launcher se télécharge puis redémarre tout seul (moins d’une minute). Sinon, elle s’installera à la prochaine fermeture.', ok: '⬆ Mettre à jour maintenant', cancel: 'Plus tard', icon: '⬆' })
      .then((yes) => { api.downloadUpdate(yes); toast(yes ? '⬆ Téléchargement de la mise à jour…' : 'OK : elle s’installera à la prochaine fermeture'); });
  }
  // Notre écran de progression (plein écran, verre) quand on a choisi « Mettre à jour maintenant »
  if (u.installNow && ['progress', 'ready'].includes(u.state)) {
    $('updScreen').hidden = false;
    $('updTitle').textContent = `Mise à jour v${u.version ?? ''}`.trim();
    const pct = u.state === 'ready' ? 100 : u.percent ?? 0;
    $('updFill').style.width = `${pct}%`;
    $('updPct').textContent = `${pct} %`;
    $('updText').textContent = u.state === 'ready' ? 'Installation… le launcher redémarre tout seul.' : 'Téléchargement de la nouvelle version…';
  }
  if (u.state === 'error' && u.installNow) $('updScreen').hidden = true;
  if (u.state === 'ready' && !u.installNow && updAsked !== `ready-${u.version}`) {
    updAsked = `ready-${u.version}`;
    ui.confirm({ title: `Mise à jour v${u.version} prête`, text: 'Redémarrer maintenant pour l’installer ? Sinon, elle s’installera toute seule à la prochaine fermeture.', ok: '⬆ Redémarrer maintenant', cancel: 'Plus tard', icon: '⬆' })
      .then((yes) => { if (yes) { $('updScreen').hidden = false; $('updFill').style.width = '100%'; $('updPct').textContent = '100 %'; $('updText').textContent = 'Installation… le launcher redémarre tout seul.'; setTimeout(() => api.installUpdate(), 600); } });
  }
  if (u.state === 'error' && u.installNow) toast(`Mise à jour impossible : ${u.error ?? 'réessaie plus tard'}`);
}
api.onAppUpdate?.(handleAppUpdate);
api.updateInfo?.().then((u) => { appVersion = u?.current ?? ''; renderUpdateRow(u); if (['available', 'ready'].includes(u?.state)) handleAppUpdate(u); }).catch(() => {});
$('openSite').addEventListener('click', () => api.openLink('site'));
$('checkUpd').addEventListener('click', async () => {
  const r = await api.checkUpdate?.(false);
  if (!r) return;
  if (r.dev) return toast('Version développeur : lance « restaurer-launcher.bat » pour la mettre à jour');
  if (r.error) return toast(`Vérification impossible : ${r.error}`);
  if (r.uptodate) return toast(`Tu as la dernière version (${r.current}) 👍`);
  if (r.ready) return api.installUpdate();
});
$('openNews2').addEventListener('click', () => { $('settings').close(); showWhatsNew(true); });
// ---------- Recherche rapide (Ctrl+Espace, ou Ctrl+Alt+Espace depuis Windows) ----------
const PAL_VIEWS = [['accueil', 'Accueil', '🏠'], ['premium', 'Premium', '⭐'], ['bibliotheque', 'Bibliothèque', '📚'], ['jeux', 'Jeux', '🎮'], ['applis', 'Applications', '🧩'], ['favoris', 'Favoris', '★'], ['stats', 'Statistiques', '📊'], ['classement', 'Classement', '🏆'], ['amis', 'Amis', '👥'], ['pc', 'Mon PC', '🖥'], ['optimisation', 'Optimisation', '⚡']].filter(([v]) => !CROS || !['pc', 'optimisation'].includes(v));
const PAL_ACTIONS = [
  ...(CROS ? [] : [['Optimiser mon PC', '🚀', () => go('optimisation')]]),
  ['Paramètres', '⚙', () => $('openSettings').click()],
  ['Ajouter un jeu', '➕', () => $('addGame').click()],
  ['Mode grand écran', '📺', () => toggleBig()],
  ['Raccourcis clavier', '⌨', () => $('keys').showModal()],
  ['Résumé de la semaine', '📅', () => $('openRecap').click()],
  ['Infos par-dessus le jeu (Ctrl+Alt+O)', '🎯', () => toast('Appuie sur Ctrl+Alt+O pendant une partie')],
];
let palSel = 0;
let palList = [];
function palScore(name, q) {
  const n = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (!q) return 1;
  if (n.startsWith(q)) return 100 - n.length / 100;
  if (n.split(/[\s:-]+/).some((w) => w.startsWith(q))) return 80;
  if (n.includes(q)) return 60;
  const initials = n.split(/[\s:-]+/).map((w) => w[0]).join('');
  if (initials.startsWith(q)) return 50;
  let i = 0;
  for (const c of n) if (c === q[i]) i++;
  return i === q.length ? 20 : 0;
}
function renderPalette() {
  const q = $('palQ').value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const items = state.items.filter((i) => !i.hidden).map((i) => ({ i, s: palScore(i.name, q) + (i.installed ? 5 : 0) + Math.min(5, i.minutes / 3000) })).filter((x) => x.s > 5).sort((a, b) => b.s - a.s).slice(0, q ? 8 : 6);
  const views = PAL_VIEWS.map(([v, l, ic]) => ({ v, l, ic, s: palScore(l, q) })).filter((x) => x.s > 0 && q).slice(0, 3);
  const acts = PAL_ACTIONS.map(([l, ic, fn]) => ({ l, ic, fn, s: palScore(l, q) })).filter((x) => x.s > 0 && (q || true)).sort((a, b) => b.s - a.s).slice(0, q ? 3 : 4);
  palList = [
    ...items.map(({ i }) => ({ kind: 'item', i, html: `${i.art?.icon || i.iconData || i.brand?.logo ? `<img src="${esc(i.art?.icon ?? i.iconData ?? i.brand.logo)}" alt="" style="${i.brand ? `background:${esc(i.brand.color)}` : ''}">` : `<span class="pl">${esc(i.name[0])}</span>`}<div><b>${esc(i.name)}</b><small>${esc(state.sources[i.source]?.label ?? 'PC')} · ${i.installed ? hours(i.minutes) : 'non installé'}</small></div><em>${state.active.has(i.id) ? 'En cours' : i.installed ? (i.kind === 'game' ? 'Jouer' : 'Ouvrir') : 'Installer'}</em>` })),
    ...views.map((x) => ({ kind: 'view', v: x.v, html: `<span class="pl">${x.ic}</span><div><b>${esc(x.l)}</b><small>Aller à la page</small></div><em>Ouvrir</em>` })),
    ...acts.map((x) => ({ kind: 'act', fn: x.fn, html: `<span class="pl">${x.ic}</span><div><b>${esc(x.l)}</b><small>Action</small></div><em>Faire</em>` })),
  ];
  if (q.length > 2) palList.push({ kind: 'ask', text: $('palQ').value.trim(), html: `<span class="pl">✨</span><div><b>Demander à l’IA : « ${esc($('palQ').value.trim())} »</b><small>L’assistant comprend et agit (lancer, fermer, conseiller…)</small></div><em>Demander</em>` });
  palSel = Math.min(palSel, Math.max(0, palList.length - 1));
  $('palRes').innerHTML = palList.map((r, n) => `<div class="palrow ${n === palSel ? 'on' : ''}" data-pal="${n}">${r.html}</div>`).join('') || '<div class="empty">Rien trouvé.</div>';
}
function openPalette() { hideCtx(); $('palette').hidden = false; $('palQ').value = ''; palSel = 0; renderPalette(); setTimeout(() => $('palQ').focus(), 20); }
function closePalette() { $('palette').hidden = true; }
async function runPal(n, sheet = false) {
  const r = palList[n];
  if (!r) return;
  closePalette();
  if (r.kind === 'item') { select(r.i); if (sheet) return openSheet(r.i); if (r.i.kind === 'game' || r.i.installed) return act(r.i.installed ? 'launch' : 'install'); }
  if (r.kind === 'view') return go(r.v);
  if (r.kind === 'act') return r.fn();
  if (r.kind === 'ask') { openAssistant(true); return ask(r.text); }
}
$('palQ').addEventListener('input', () => { palSel = 0; renderPalette(); });
$('palQ').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palList.length - 1, palSel + 1); renderPalette(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
  if (e.key === 'Enter') { e.preventDefault(); runPal(palSel, e.shiftKey); }
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
$('palRes').addEventListener('click', (e) => { const r = e.target.closest('[data-pal]'); if (r) runPal(Number(r.dataset.pal)); });
$('palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });
api.onPalette?.(openPalette);

// ---------- Mode grand écran (TV, manette) ----------
async function toggleBig(on) {
  const full = await api.fullscreen?.(on).catch(() => null);
  const big = full ?? !document.body.classList.contains('big');
  document.body.classList.toggle('big', big);
  toast(big ? '📺 Mode grand écran (F11 pour sortir)' : 'Mode normal');
}

// ---------- Collections ----------
function renderCollections() {
  const entries = [...Object.entries(state.cols), ...Object.entries(moreUi?.genreCols() ?? {})];
  $('collections').innerHTML = entries.map(([id, c]) => `<button data-col="${esc(id)}" class="${state.view === 'liste' && state.list.collection === id ? 'on' : ''}"><span class="pdot" style="background:${c.auto ? '#8a5cff' : '#2f8bff'}">${c.auto ? '🏷' : '📚'}</span>${esc(c.name)}<em>${c.items.filter((x) => state.items.some((i) => i.id === x)).length}</em></button>`).join('') || '<small class="hint colempty">Range tes jeux : « Avec les potes », « À finir »…</small>';
}
async function saveCols() { state.cols = await api.saveCollections(state.cols); renderCollections(); }
function newColId() { return `c${Date.now().toString(36)}`; }
function openCollections(item) {
  $('colTitle').textContent = `Collections · ${item.name}`;
  const draw = () => {
    $('colChecks').innerHTML = Object.entries(state.cols).map(([id, c]) => `<label class="check"><input type="checkbox" value="${esc(id)}" ${c.items.includes(item.id) ? 'checked' : ''}>${esc(c.name)}<button type="button" class="btn ghost colx" data-coldel="${esc(id)}" title="Supprimer la collection">✕</button></label>`).join('') || '<small class="hint">Aucune collection : crée la première ci-dessous.</small>';
  };
  draw();
  $('colChecks').onchange = (e) => { const c = state.cols[e.target.value]; if (!c) return; c.items = e.target.checked ? [...new Set([...c.items, item.id])] : c.items.filter((x) => x !== item.id); saveCols(); };
  $('colChecks').onclick = (e) => { const b = e.target.closest('[data-coldel]'); if (!b) return; e.preventDefault(); const id = b.dataset.coldel; $('colDlg').close(); ui.confirm({ title: `Supprimer « ${state.cols[id].name} » ?`, text: 'Les jeux restent dans la bibliothèque.', ok: 'Supprimer', danger: true, icon: '📚' }).then((yes) => { if (yes) { delete state.cols[id]; saveCols(); } }); };
  $('colAdd').onclick = () => { const name = $('colName').value.trim(); if (!name) return; state.cols[newColId()] = { name, items: [item.id] }; $('colName').value = ''; saveCols().then(draw); };
  $('colDlg').showModal();
}
$('newCol').addEventListener('click', async () => { const name = await ui.prompt({ title: 'Nouvelle collection', placeholder: 'Ex. Avec les potes, À finir…', ok: 'Créer', icon: '📚' }); if (name) { state.cols[newColId()] = { name, items: [] }; saveCols(); toast('Collection créée : ajoute des jeux par clic droit › Collections'); } });

// ---------- Ajouter un jeu : bouton ou .exe glissé dans la fenêtre ----------
$('showHidden').addEventListener('click', () => { state.list = { ...state.list, kind: state.list.kind === 'caches' ? 'tout' : 'caches', source: 'tout', collection: null }; $('showHidden').classList.toggle('on', state.list.kind === 'caches'); showView('liste'); renderList(); });
$('addGame').addEventListener('click', () => api.pickGame?.().then((r) => r?.ok && toast(`${r.name} ajouté`)));
let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((x) => x.kind === 'file')) { dragDepth++; $('dropzone').hidden = false; } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').hidden = true; } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0; $('dropzone').hidden = true;
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.exe$/i.test(f.name));
  if (!files.length) return toast('Glisse le fichier .exe du jeu');
  for (const f of files) { const r = await api.addGameFile?.(f).catch(() => null); toast(r?.ok ? `${r.name} ajouté` : r?.error ?? 'Impossible d’ajouter ce fichier'); }
});

// ---------- Mon PC : jauges en direct, boost, nettoyage ----------
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.round(b / 1e6)} Mo`);
const gaugeHtml = (label, value, pct, sub = '', hot = false) => `<div class="gauge ${hot ? 'hot' : ''}"><small>${label}</small><b>${value}</b>${pct != null ? `<div class="gbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>` : ''}<small>${sub}</small></div>`;
async function renderPc() {
  const p = await readPc().catch(() => null);
  if (!p || document.hidden || state.view !== 'pc') return;
  const ram = Math.round((100 * p.ram.used) / p.ram.total);
  $('pcGauges').innerHTML = [
    gaugeHtml('Processeur', p.cpu.usage != null ? `${p.cpu.usage} %` : '…', p.cpu.usage, esc(p.cpu.temp ? `${p.cpu.temp} °C` : 'Température : lance en admin'), (p.cpu.temp ?? 0) >= 90),
    gaugeHtml('Mémoire', `${ram} %`, ram, `${gb(p.ram.used)} / ${gb(p.ram.total)}`),
    gaugeHtml('Carte graphique', p.gpu?.usage != null ? `${p.gpu.usage} %` : 'n/d', p.gpu?.usage, esc(p.gpu?.name ?? '')),
    gaugeHtml('Temp. graphique', p.gpu?.temp != null ? `${p.gpu.temp} °C` : 'n/d', p.gpu?.temp, p.gpu?.vramTotal ? `Mémoire vidéo ${(p.gpu.vramUsed / 1024).toFixed(1).replace('.', ',')} / ${Math.round(p.gpu.vramTotal / 1024)} Go` : 'NVIDIA seulement', (p.gpu?.temp ?? 0) >= 85),
  ].join('');
}
let pcTimer = null;
async function openPc() {
  renderPc();
  if (!state.pcDiagDone) pcDiag(false);
  api.driverInfo?.().then((d) => {
    $('pcDriver').innerHTML = !d ? '' : `<div class="adv ${d.latest ? 'p1' : 'p2'}"><div><b>${d.latest ? `Nouveau pilote NVIDIA ${esc(d.latest)} disponible` : `Pilote graphique ancien (${Math.round((d.age ?? 0) / 30)} mois)`}</b><small>${esc(d.name)} · tu as la ${esc(d.version)}${d.date ? ` · sorti le ${new Date(d.date).toLocaleDateString('fr-FR')}` : ''}. Les jeux récents gagnent souvent des FPS et des corrections avec le dernier pilote.</small></div><div class="row"><button class="btn ghost sm" data-drv="notes">${d.latest ? 'Nouveautés' : 'Page officielle'}</button>${d.download ? '<button class="btn play sm" data-drv="download">Télécharger</button>' : ''}</div></div>`;
  }).catch(() => {});
  refreshHealth();
  api.scanLast?.().then(showScanLast).catch(() => {});
  if (!state.demoShown) api.demo?.().then((d) => { if (!d) return; state.demoShown = true; renderScan(d.scan); showScanLast(d.scan); wu = d.wu; renderWu(); }).catch(() => {});
  renderTemps();
  api.pcBenchHistory?.().then((h) => h?.length && renderBench(h[0], h)).catch(() => {});
  clearInterval(pcTimer);
  pcTimer = setInterval(() => (state.view === 'pc' ? (!document.hidden && renderPc()) : clearInterval(pcTimer)), 2500);
  const b = await api.boost?.().catch(() => null);
  if (!b) return;
  $('boostOn').checked = b.enabled; $('boostPower').checked = b.power; $('boostRestore').checked = b.restore; $('boostTune').checked = b.tune; $('heatAlerts').checked = b.heatAlerts; $('weeklyClean').checked = b.weeklyClean;
  $('boostApps').innerHTML = b.apps.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}" ${b.close.includes(a.id) ? 'checked' : ''}>${esc(a.label)}</label>`).join('');
}
// ---------- Mon PC : diagnostic, composants, conseils, antivirus, programmes, benchmark, rapport ----------
const STATUS = { ok: 'En forme', warn: 'À surveiller', bad: 'Problème' };
function renderDiag(d) {
  if (!d || d.error) { $('pcComps').innerHTML = `<div class="empty">${esc(d?.error ?? 'Diagnostic impossible.')}</div>`; return; }
  $('pcOs').textContent = `${d.os.name} · build ${d.os.build} · allumé depuis ${d.os.uptimeDays ?? '?'} j${d.board ? ` · carte mère ${d.board}` : ''}`;
  state.pcDiagDone = true;
  state.diag = d;
  renderTop();
  moreUi?.pc3d();
  $('pcComps').innerHTML = d.components.map((c) => `<div class="comp st-${c.status} ck-${esc(c.key ?? 'x')}">
    <div class="ch"><span>${c.icon}</span><div><small>${esc(c.title)}</small><b>${esc(c.name)}</b></div><em class="chip">${STATUS[c.status]}</em></div>
    <ul>${c.specs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${c.life?.pct != null ? `<div class="lifebar"><i style="width:${c.life.pct}%;background-position:${100 - c.life.pct}% 0"></i></div>` : ''}
    <div class="life">⏳ ${esc(c.life?.text ?? '')}</div></div>`).join('');
  $('pcAdvice').innerHTML = d.advice.length ? d.advice.map((a) => `<div class="adv p${a.prio}"><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small>${a.gain ? `<em>↗ ${esc(a.gain)}</em>` : ''}</div>${a.fix ? `<button type="button" class="btn sm" data-pcfix="${esc(a.fix)}">Corriger</button>` : ''}</div>`).join('') : '<div class="empty">Rien à améliorer d’urgent : ton PC est en forme 👌</div>';
  const av = d.av;
  const threats = (d.threats ?? []).filter((t) => !t.removed);
  $('pcAv').innerHTML = av ? `${av.on && av.realtime ? '<span class="ok">● Protection en temps réel active</span>' : '<span class="bad">● Protection désactivée</span>'} · définitions de ${av.sigAge ?? '?'} j · dernière analyse rapide il y a ${av.quickAge ?? '?'} j, complète il y a ${av.fullAge ?? 'jamais'} j${threats.length ? `<br><b class="bad">${threats.length} menace(s) à supprimer :</b> ${threats.map((t) => esc(t.files[0] ?? t.id)).join(', ')}` : '<br>Aucune menace active.'}` : 'Antivirus de Windows introuvable (un autre antivirus est peut-être installé).';
}
const n1 = (v) => (v == null ? 'n/d' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
function benchRows(r) {
  if (r.v !== 2) {
    return [['Processeur (1 cœur)', r.scores.cpu1, `${r.cpu.single} Mo/s`], ['Processeur (tous)', r.scores.cpuN, `${r.cpu.multi} Mo/s · ${r.cpu.threads} threads`], ['Mémoire', r.scores.ram, `${r.ram.gbps} Go/s`], ['Disque', r.scores.disk, r.disk ? `${r.disk.write} / ${r.disk.read} Mo/s · ${r.disk.iops} IOPS` : 'n/d'], ['Carte graphique', r.scores.gpu, r.gpu?.fps ? `${r.gpu.fps} images/s` : 'n/d']];
  }
  const c = r.cpu ?? {}; const s = c.single ?? {}; const m = c.multi ?? {}; const g = r.gpu?.scenes ?? {}; const d = r.disk;
  return [
    ['Processeur (1 cœur)', r.scores.cpu1, `SHA-256 ${n1(s.sha)} Mo/s · compression ${n1(s.zip)} Mo/s · physique ${n1(s.nbody)} M interactions/s · IA ${n1(s.path)} chemins/s`],
    ['Processeur (tous)', r.scores.cpuN, `${c.threads} threads · SHA-256 ${n1(m.sha)} Mo/s · physique ${n1(m.nbody)} M/s · tenue en charge ${c.sustain?.stability ?? '?'} %`],
    ['Mémoire', r.scores.ram, `${n1(r.ram?.gbps)} Go/s · latence ${n1(r.ram?.latency)} ns`],
    ['Disque', r.scores.disk, d ? `écriture ${n1(d.write)} Mo/s · lecture ${n1(d.read)} Mo/s${d.readSrc === 'jeu' ? ' (vrai fichier de jeu)' : ''} · 4 Ko : ${n1(d.iopsR)} IOPS lecture, ${n1(d.iopsW)} écritures synchronisées/s` : 'n/d'],
    ['Carte graphique', r.scores.gpu, r.gpu?.scenes ? `2560×1440 · géométrie ${n1(g.geometry)} i/s · shaders ${n1(g.shader)} i/s · post-traitement ${n1(g.post)} i/s${r.gpu.renderer ? ` · ${r.gpu.renderer}` : ''}` : esc(r.gpu?.error ?? 'n/d')],
  ];
}
function renderBench(r, hist = []) {
  if (!r) return;
  const rows = benchRows(r);
  const same = hist.filter((h) => (h.v ?? 1) === (r.v ?? 1));
  const max = Math.max(2000, ...rows.map(([, v]) => v ?? 0));
  const warm = r.v === 2 && r.cpu?.sustain?.stability != null && r.cpu.sustain.stability < 85;
  $('pcBench').innerHTML = `<div class="pcscore"><b class="big">${r.scores.total ?? '–'}</b><div><b>${esc(r.tier ?? '')}</b><small class="hint" style="display:block">le ${new Date(r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${r.v === 2 ? 'benchmark extrême' : 'ancien benchmark'} · trait blanc = PC de référence (1000)</small></div></div>
    ${warm ? `<div class="adv p1"><div><b>Le processeur ralentit sous la charge</b><small>Après 30 s à fond, il ne tient que ${r.cpu.sustain.stability} % de ses performances : il chauffe trop. Nettoie la poussière, vérifie le ventirad et la pâte thermique.</small></div></div>` : ''}
    <div class="benchbars">${rows.map(([n, v, raw]) => `<div class="bbar"><span>${n}</span><div class="t"><i style="width:${Math.min(100, (100 * (v ?? 0)) / max)}%"></i><b style="left:${(100 * 1000) / max}%"></b></div><b>${v ?? '–'}</b></div><small class="hint bdetail">${raw}</small>`).join('')}</div>
    ${same.length > 1 ? `<div class="bhist"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${spark([...same].reverse().map((h) => h.scores.total - Math.min(...same.map((x) => x.scores.total)) * 0.9), '#22d3ee', (Math.max(...same.map((x) => x.scores.total)) - Math.min(...same.map((x) => x.scores.total)) * 0.9) * 1.1)}</svg><small class="hint">Historique : ${[...same].reverse().map((h) => h.scores.total).join(' → ')}</small></div>` : ''}`;
}
function spark(values, color, max = 100) {
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${100 - (Math.max(0, v ?? 0) / max) * 100}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
}
async function renderTemps() {
  const list = await api.pcTemps?.().catch(() => []);
  if (!list?.length) return;
  const last = list.at(-1);
  const series = [['cpu', 'Processeur %', '#2f8bff', 100], ['gpuT', 'Temp. graphique °C', '#ff6b6b', 100], ['ram', 'Mémoire %', '#22d3ee', 100]].filter(([k]) => list.some((x) => x[k] != null));
  $('pcTemps').innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${series.map(([k, , c, m]) => spark(list.map((x) => x[k]), c, m)).join('')}</svg>
    <div class="tleg">${series.map(([k, n, c]) => `<span><i style="background:${c}"></i>${n} : <b>${last[k] ?? '–'}</b> (max ${Math.max(...list.map((x) => x[k] ?? 0))})</span>`).join('')}</div>`;
}
$('netPing').addEventListener('click', async () => {
  $('netOut').innerHTML = '<p class="hint">Mesure en cours…</p>';
  const r = await api.netPing();
  if (!Array.isArray(r)) return ($('netOut').innerHTML = `<p class="hint">${esc(r?.error ?? 'Impossible')}</p>`);
  $('netOut').innerHTML = `<div class="netlist">${r.map((x) => `<div><span>${esc(x.name)}</span><b class="${x.ms == null ? 'bad' : x.ms < 60 ? 'ok' : x.ms < 120 ? '' : 'bad'}">${x.ms == null ? 'injoignable' : `${x.ms} ms`}</b></div>`).join('')}</div><small class="hint">Temps d’ouverture de la connexion, médiane de 3 essais.</small>`;
});
$('netDns').addEventListener('click', async () => {
  $('netOut').innerHTML = '<p class="hint">Test des DNS…</p>';
  const r = await api.netDns();
  if (!r?.list) return ($('netOut').innerHTML = `<p class="hint">${esc(r?.error ?? 'Impossible')}</p>`);
  $('netOut').innerHTML = `<div class="netlist">${r.list.map((x) => `<div><span>${esc(x.name)}${x.ip ? ` <small>${esc(x.ip)}</small>` : ''}</span><b>${x.ms == null ? 'échec' : `${x.ms} ms`}</b></div>`).join('')}</div>
    <p class="hint">${r.best && r.gain > 5 ? `💡 ${esc(r.best.name)} (${esc(r.best.ip)}) répond ${r.gain} ms plus vite que ton DNS actuel : Paramètres Windows › Réseau › Modifier les options DNS.` : 'Ton DNS actuel est déjà rapide 👌'}</p>`;
});
$('restoreBtn').addEventListener('click', async () => {
  if (!(await ui.confirm({ title: 'Créer un point de restauration ?', text: 'Windows pourra revenir à l’état actuel si une optimisation ou un pilote pose problème. Windows va demander l’autorisation administrateur.', ok: '🛟 Créer', icon: '🛟' }))) return;
  toast('Création du point de restauration…');
  const r = await api.restorePoint();
  toast(r?.ok ? '🛟 Point de restauration créé' : r?.error ?? 'Impossible');
});
$('rankBtn').addEventListener('click', async () => {
  const r = await api.benchRanking();
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🌍</span><h2>Classement mondial des benchmarks</h2></div>
    ${r?.top ? `<p class="hint">${r.rang ? `Tu es ${r.rang}${r.rang === 1 ? 'er' : 'e'} sur ${r.total}.` : 'Fais un benchmark pour entrer dans le classement.'}</p><div class="ranklist2">${r.top.map((x, n) => `<div class="${x.moi ? 'me' : x.ami ? 'friend' : ''}"><span>${n + 1}</span><b>${esc(x.pseudo)}${x.ami ? ' 👥' : ''}</b><small>${esc([x.cpu, x.gpuName].filter(Boolean).join(' · '))}</small><em>${x.total}</em></div>`).join('')}</div>` : `<p class="hint">${esc(r?.error ?? 'Connecte-toi pour voir le classement.')}</p>`}
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  $('modal').showModal();
  $('modalBox').querySelector('.ranklist2')?.insertAdjacentHTML('beforebegin', '<button type="button" class="btn ghost sm" data-rkf="1">👥 Moi et mes amis seulement</button>');
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-rkf]')) return $('modalBox').querySelector('.ranklist2')?.classList.toggle('amis'); if (e.target.closest('[data-m]')) $('modal').close(); };
});
async function renderProcs() {
  $('pcProcs').innerHTML = '<div class="empty">Mesure pendant 2 secondes…</div>';
  const list = await api.pcProcs?.().catch(() => null);
  if (!Array.isArray(list)) { $('pcProcs').innerHTML = `<div class="empty">${esc(list?.error ?? 'Impossible de lire les programmes.')}</div>`; return; }
  $('pcProcs').innerHTML = list.slice(0, 18).map((p) => `<div class="proc ${p.suspect ? 'suspect' : ''}"><div><b>${esc(p.name)}</b>${p.suspect ? ' <span class="bad">⚠ non signé, lancé depuis un dossier temporaire</span>' : ''}<small title="${esc(p.path)}">${esc(p.signer ? `${p.signer} · ` : p.signed ? '' : 'non signé · ')}${esc(p.path)}</small></div><span>${p.cpu} % CPU</span><span>${Math.round(p.ram / 1e6)} Mo</span>${/\\windows\\/i.test(p.path) ? '<small>Windows</small>' : `<button class="btn ghost sm" data-kill="${p.id}" data-kpath="${esc(p.path)}">Fermer</button>`}</div>`).join('');
}
function pcProgress(p) {
  $('pcProg').hidden = p.step === 'done';
  $('pcProgFill').style.width = `${p.pct ?? 0}%`;
  $('pcProgText').textContent = `${p.pct != null ? `${p.pct} % · ` : ''}${p.label ?? ''}`;
}
api.onPcProgress?.(pcProgress);
// « Corriger » : l'action sûre de ce conseil (réglage réversible ou page de Windows), puis nouvelle analyse
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pcfix]'); if (!b) return;
  b.disabled = true; b.textContent = '…';
  const r = await api.pcFix(b.dataset.pcfix).catch(() => null);
  b.disabled = false; b.textContent = 'Corriger';
  if (r?.cancelled) return;
  toast(r?.opened ? 'Réglage de Windows ouvert : termine là-bas' : r?.ok ? '✓ Corrigé' : r?.needAdmin ? 'Accepte la demande administrateur de Windows' : 'Impossible de corriger automatiquement');
  if (r?.ok && !r.opened) pcDiag(true);
});
async function pcDiag(force) {
  pcProgress({ step: 'diag', pct: 20, label: 'Lecture des composants et de leur santé…' });
  const d = await api.pcDiag?.(force).catch((err) => ({ error: err.message }));
  pcProgress({ step: 'done' });
  renderDiag(d);
  return d;
}
/** Texte de l'IA (Markdown simple) → titres colorés, gras, listes aérées. Tout est échappé avant. */
function richText(t) {
  let html = '', list = false, sec = 0;
  const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(\d+(?:[.,]\d+)?\s?(?:FPS|%|Go|Mo|°C|ms|Hz))/g, '<span class="rnum">$1</span>');
  for (const raw of String(t ?? '').split('\n')) {
    const l = raw.trim();
    const item = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (!item && list) { html += '</ul>'; list = false; }
    if (!l) continue;
    const h = l.match(/^#{1,4}\s*(.+)/) ?? l.match(/^«\s*(.+?)\s*»\s*:?$/);
    if (h) html += `<h4 class="rh c${sec++ % 4}">${inline(h[1].replace(/\*\*/g, ''))}</h4>`;
    else if (item) { if (!list) { html += '<ul class="rlist">'; list = true; } html += `<li>${inline(item[1])}</li>`; }
    else html += `<p>${inline(l)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}
function showReport(r, title = 'Rapport détaillé') {
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">📄</span><h2>${esc(title)}</h2></div><div class="reporttxt ${r?.text ? 'rich' : ''}">${r?.text ? richText(r.text) : esc(r?.error ?? 'Rapport indisponible.')}</div>
    <small class="hint">${r?.ai ? 'Rédigé par l’IA à partir des vraies mesures de ton PC.' : 'Rapport automatique (connecte-toi pour la version rédigée par l’IA).'}</small>
    <div class="row end"><button type="button" class="btn" id="repPdf">📄 PDF</button><button type="button" class="btn" id="repCopy">Copier</button><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); if (e.target.closest('#repCopy')) { copyText(r?.text ?? ''); toast('Rapport copié'); } if (e.target.closest('#repPdf')) api.pcPdf(title, r?.text ?? '').then((p) => toast(p?.ok ? '📄 PDF enregistré dans Documents › History' : p?.error ?? 'Impossible')); };
}
$('pcDiagBtn').addEventListener('click', () => pcDiag(true));
$('pcBenchBtn').addEventListener('click', async () => {
  if (!(await ui.confirm({ title: 'Lancer le benchmark extrême ?', text: 'Environ 2 min 30 à pleine puissance : le PC va chauffer et souffler, c’est normal. Ferme tes jeux et applis pour un résultat juste.', list: ['Processeur : 5 épreuves (SHA-256, compression, physique, tri, IA) sur 1 cœur puis tous, + 30 s d’endurance', 'Mémoire : débit et latence', 'Disque : 2 Go écrits, lecture d’un vrai fichier de jeu, accès aléatoires 4 Ko', 'Carte graphique : 3 scènes en 2560×1440 (géométrie, shaders, post-traitement)'], ok: '🏁 C’est parti', icon: '🏁' }))) return;
  const r = await api.pcBench();
  pcProgress({ step: 'done' });
  if (r?.error) return toast(r.error);
  window.sfx?.play('success');
  renderBench(r, await api.pcBenchHistory());
});
$('pcReportBtn').addEventListener('click', async () => { toast('Rédaction du rapport…'); showReport(await api.pcReport()); });
$('procRefresh').addEventListener('click', renderProcs);
document.querySelectorAll('[data-avscan]').forEach((b) => b.addEventListener('click', async () => {
  toast(b.dataset.avscan === 'full' ? 'Analyse complète lancée (longue)…' : 'Analyse rapide lancée…');
  const r = await api.pcDefScan(b.dataset.avscan);
  pcProgress({ step: 'done' });
  toast(r?.found ? '⚠ Menaces trouvées : clique sur « Supprimer les menaces »' : '✓ Aucune menace trouvée');
  pcDiag(true);
}));
$('avRemove').addEventListener('click', async () => { const r = await api.pcDefRemove(); toast(r?.ok ? 'Menaces supprimées ✓' : 'Accepte la demande administrateur de Windows pour supprimer'); pcDiag(true); });
$('pcProcs').addEventListener('click', async (e) => { const b = e.target.closest('[data-kill]'); if (!b) return; const r = await api.pcKill(Number(b.dataset.kill), b.dataset.kpath); if (r?.ok) { toast('Programme fermé'); renderProcs(); } else if (!r?.cancelled) toast(r?.error ?? 'Impossible'); });
for (const [id, key] of [['boostOn', 'enabled'], ['boostPower', 'power'], ['boostRestore', 'restore'], ['boostTune', 'tune'], ['heatAlerts', 'heatAlerts'], ['weeklyClean', 'weeklyClean']]) {
  $(id).addEventListener('change', (e) => api.setBoost({ [key]: e.target.checked }).then(() => key === 'enabled' && toast(e.target.checked ? 'Boost activé pour les prochaines parties' : 'Boost désactivé')));
}
$('boostApps').addEventListener('change', () => api.setBoost({ close: [...document.querySelectorAll('#boostApps input:checked')].map((i) => i.value) }));
// ---------- Optimisation : score de santé, catégories rangées, avancement en direct ----------
let opti = null;
const GROUPS = [
  ['systeme', '🗑', 'Fichiers temporaires de Windows', 'Temporaires, rapports d’erreur, cache Internet de Windows.'],
  ['pilotes', '🖥', 'Pilotes et shaders', 'Anciens pilotes décompressés, caches DirectX / NVIDIA / AMD (recréés au prochain lancement).'],
  ['jeux', '🎮', 'Launchers et jeux', 'Caches web, journaux et rapports de plantage de Steam, Epic, Riot, Discord…'],
  ['navigateurs', '🌐', 'Navigateurs', 'Cache de Chrome, Edge, Brave, Opera, Firefox. Mots de passe, historique et cookies gardés.'],
];
function setRing(score, label) {
  const C = 2 * Math.PI * 52;
  const col = score == null ? 'var(--muted)' : score >= 90 ? '#2ee07a' : score >= 75 ? '#22d3ee' : score >= 55 ? '#f59e0b' : '#ef4444';
  $('ringVal').style.strokeDasharray = `${score == null ? 0 : (score / 100) * C} ${C}`;
  $('ringVal').style.stroke = col;
  $('optiRing').style.setProperty('--ring', col);
  $('ringNum').textContent = score ?? '–';
  $('ringNum').style.color = col;
  $('ringLabel').textContent = label ?? 'Pas encore analysé';
  $('optiBadge').textContent = ''; // optimisation en pause
}
const catCard = (key, icon, title, desc, total, body, { checked = true, open = false, count = '' } = {}) => `
  <div class="ocat ${open ? 'open' : ''}" data-cat="${key}">
    <div class="ohead">
      ${key ? `<label class="ocheck" title="Inclure dans « Tout optimiser »"><input type="checkbox" data-catcheck="${key}" ${checked ? 'checked' : ''}><span></span></label>` : ''}
      <span class="oicon">${icon}</span>
      <div class="otitle"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
      <div class="ototal"><b>${total}</b><small>${count}</small></div>
      <button class="btn ghost ocaret" data-toggle="${key || title}">Détails ▾</button>
    </div>
    <div class="obody">${body}</div>
  </div>`;
const SHADERS = ['d3d', 'nvdx', 'nvgl', 'amddx', 'amdvk', 'amd-dxc'];
const itemRow = (group, x, checked = true) => `<label class="check"><input type="checkbox" data-g="${group}" value="${esc(x.id)}" ${checked ? 'checked' : ''}><span>${esc(x.label)}${x.note ? ` <small class="hint">· ${esc(x.note)}</small>` : ''}</span><em>${gb(x.bytes)}</em></label>`;
const OPTI_SECTIONS = [['A', 'Tes jeux'], ['B', 'Nettoyage'], ['C', 'Windows'], ['D', 'Entretien'], ['E', 'Annuler']];
const GAME_ICONS = { FiveM: '🚓', 'Garry’s Mod': '🔧', Fortnite: '🪂', 'Rainbow Six Siege': '🎯', 'Rocket League': '🚗' };
const RISKS = { safe: ['Sûr', 'ok'], moderate: ['Modéré', 'mid'], advanced: ['Avancé', 'warn'] };
const gameRow = (a) => `<label class="check" title="${esc(a.help)}"><input type="checkbox" data-g="games" value="${esc(a.id)}" ${a.on && !a.applied && !a.readonly ? 'checked' : ''} ${a.applied || a.readonly ? 'disabled' : ''}><span>${esc(a.label)} <small class="risk ${RISKS[a.risk][1]}">${RISKS[a.risk][0]}</small>${a.reboot ? ' <small class="opt">redémarrage</small>' : ''}${a.applied ? ' <small class="opt">déjà appliqué</small>' : ''}</span><em>${a.kind === 'clean' ? `${gb(a.bytes ?? 0)} · ${a.files ?? 0} fichier${a.files > 1 ? 's' : ''}` : ''}</em></label>`;
function renderOpti() {
  const o = opti;
  setRing(state.health?.score ?? o.score, state.health?.label ?? o.label);
  const junkTotal = o.junk.reduce((n, x) => n + x.bytes, 0);
  const orphanTotal = o.orphans.reduce((n, x) => n + x.bytes, 0);
  const tweaksOff = o.tweaks.filter((t) => !t.on && !t.optional && !t.retired);
  const heavyOn = o.startup.filter((x) => x.enabled && x.heavy);
  $('optiSum').innerHTML = `
    <div><b>${o.score}/100</b><small>entretien</small></div>
    <div><b>${gb(junkTotal + orphanTotal + o.recycle)}</b><small>à libérer</small></div>
    <div><b>${heavyOn.length}</b><small>appli${heavyOn.length > 1 ? 's' : ''} lourde${heavyOn.length > 1 ? 's' : ''} au démarrage</small></div>
    <div><b>${o.tweaks.filter((t) => t.on).length}/${o.tweaks.length}</b><small>réglages optimisés</small></div>
    ${o.free != null ? `<div><b>${gb(o.free)}</b><small>libres${o.disk ? ` sur ${gb(o.disk)}` : ''}</small></div>` : ''}`;
  $('optiRun').hidden = false;
  $('optiRun').classList.add('play'); $('optiScan').classList.remove('play');
  const S = { A: [], B: [], C: [], D: [], E: [] };
  S.E.push(catCard('', '↩', 'Annuler ou tout remettre par défaut', 'Chaque fichier de jeu et chaque valeur du registre modifiés sont sauvegardés avant (même ceux qui n’existaient pas) : reviens exactement à l’état d’avant.', '',
    '<div class="row"><button class="btn" data-undo="1" type="button">↩ Annuler la dernière optimisation</button><button class="btn play" id="optiReset" type="button">Tout remettre par défaut</button></div><p class="hint">« Tout remettre » annule toutes les optimisations et remet Windows comme avant la première (point de restauration créé avant les réglages système, autorisation administrateur).</p>', { count: 'réparer', open: [...o.tweaks, ...(state.sys ?? [])].some((t) => t.retired) }));
  for (const [key, icon, title, desc] of GROUPS) {
    const list = o.junk.filter((x) => x.group === key);
    if (!list.length) continue;
    S.B.push(catCard(key, icon, title, desc, gb(list.reduce((n, x) => n + x.bytes, 0)), `<div class="checks">${list.map((x) => itemRow('junk', SHADERS.includes(x.id) ? { ...x, note: 'À vider seulement si un jeu saccade après une mise à jour du pilote : sinon les jeux saccadent le temps de le recréer' } : x, !SHADERS.includes(x.id))).join('')}</div>`, { count: `${list.length} élément${list.length > 1 ? 's' : ''}` }));
  }
  if (o.recycle > 0) S.B.push(catCard('recycle', '♻', 'Corbeille', 'Fichiers déjà supprimés qui prennent encore de la place.', gb(o.recycle), '<p class="hint">Elle sera vidée définitivement.</p>'));
  S.B.push(catCard('orphans', '🧩', 'Restes de jeux désinstallés', 'Dossiers de jeux Steam qui ne sont plus installés.', gb(orphanTotal),
    o.orphans.length ? `<div class="checks">${o.orphans.map((x) => itemRow('orphans', x, false)).join('')}</div><p class="hint">Décochés par défaut : coche ceux que tu veux supprimer.</p>` : '<p class="hint">Aucun reste trouvé 👍</p>', { checked: false, count: `${o.orphans.length} dossier${o.orphans.length > 1 ? 's' : ''}` }));
  S.C.push(catCard('', '⏻', 'Démarrage de Windows', 'Moins d’applis au démarrage = PC prêt plus vite et plus de mémoire libre.', `${o.startup.filter((x) => x.enabled).length}`,
    `${o.startup.map((x) => `<label class="toggle small"><input type="checkbox" data-startup="${esc(x.name)}" ${x.enabled ? 'checked' : ''}><span></span>${esc(x.name)}${x.heavy ? ' <small class="warn">ralentit le démarrage</small>' : ''}</label>`).join('') || '<p class="hint">Aucune appli lancée au démarrage.</p>'}<p class="hint">Désactiver ne désinstalle rien (réversible ici ou dans le Gestionnaire des tâches).</p>`, { count: 'au démarrage', open: heavyOn.length > 0 }));
  S.C.push(catCard('tweaks', '🎯', 'Réglages Windows pour les jeux', 'Réglages sûrs et réversibles qui donnent des FPS et de la réactivité.', `${o.tweaks.filter((t) => t.on).length}/${o.tweaks.length}`,
    o.tweaks.map((t) => `<label class="toggle small"><input type="checkbox" data-tweak="${esc(t.id)}" ${t.on ? 'checked' : ''}><span></span><div class="tlabel">${esc(t.label)}${t.optional ? ' <small class="opt">facultatif</small>' : ''}${t.retired ? ' <small class="warn">déconseillé : décoche-le</small>' : ''}<small class="hint">${esc(t.retired ?? t.help)}</small></div></label>`).join(''), { count: tweaksOff.length ? `${tweaksOff.length} à faire` : 'optimisés', open: tweaksOff.length > 0 }));
  // Profils par jeu : chaque action avec son risque, son chemin exact et ce qu'elle libère
  const byGame = {};
  for (const a of o.games ?? []) (byGame[a.game] ??= []).push(a);
  Object.entries(byGame).forEach(([game, list], n) => {
    const bytes = list.reduce((t, a) => t + (a.bytes ?? 0), 0);
    // Logo officiel du jeu (sinon son icône, sinon un emoji)
    const it = game !== 'Autres jeux' && state.items.find((x) => x.id === list[0].itemId);
    // Vrais logos : FiveM et Fortnite (Simple Icons, officiels) ; sinon logo du magasin, jamais l'icône du .exe
    // Vraie pochette du jeu (comme dans la bibliothèque) ; logo officiel seulement s'il n'y a pas de pochette
    const cover = it && (it.art?.cover ?? it.art?.header ?? it.art?.hero);
    const logo = { FiveM: 'brands/fivem.svg', Fortnite: 'brands/fortnite.svg' }[game] ?? (it && (it.art?.logo ?? it.art?.icon));
    S.A.push(catCard(`game${n}`, cover ? `<span class="ogcover" style="background-image:url('${esc(cover)}')"></span>` : logo ? `<span class="ogcover logo"><img src="${esc(logo)}" alt=""></span>` : GAME_ICONS[game] ?? '🎮', game, '', bytes ? gb(bytes) : `${list.filter((a) => a.applied).length}/${list.length}`,
      `<div class="checks">${list.map(gameRow).join('')}</div>`, { count: `${list.length} action${list.length > 1 ? 's' : ''}` }));
  });
  // Place prise par chaque jeu installé (et ceux pas lancés depuis 6 mois)
  const games = state.items.filter((x) => x.kind === 'game' && x.installed && x.size > 0).sort((a, b) => b.size - a.size);
  const stale = games.filter((g) => !g.lastPlayed || Date.now() - g.lastPlayed > 182 * 86_400_000);
  if (games.length) {
    const maxG = games[0].size;
    S.B.push(catCard('', '🎮', 'Place prise par tes jeux', stale.length ? `${stale.length} jeu${stale.length > 1 ? 'x' : ''} pas lancé${stale.length > 1 ? 's' : ''} depuis 6 mois (${gb(stale.reduce((n, g) => n + g.size, 0))}) : désinstalle-les pour faire de la place.` : 'Tous tes jeux installés ont servi ces 6 derniers mois.', gb(games.reduce((n, g) => n + g.size, 0)),
      `<div class="gamesize">${games.slice(0, 20).map((g) => { const old = stale.includes(g); return `<div class="${old ? 'stale' : ''}"><span>${esc(g.name)}</span><div class="t"><i style="width:${(100 * g.size) / maxG}%"></i></div><b>${gb(g.size)}</b><small>${g.lastPlayed ? `joué ${ago(g.lastPlayed).toLowerCase()}` : 'jamais lancé ici'}</small>${old ? `<button class="btn ghost sm" data-uninst="${esc(g.id)}">Désinstaller</button>` : '<span></span>'}</div>`; }).join('')}</div>`, { count: `${games.length} jeux`, open: stale.length > 0 }));
  }
  S.E.push(catCard('', '🕘', 'Réglages sauvegardés', 'Avant chaque changement de réglages Windows, History garde une photo de tes réglages : reviens en arrière en un clic ou exporte le rapport avant / après.', '', '<div id="setHist"><p class="hint">Chargement…</p></div>', { count: 'historique' }));
  S.C.push(catCard('', '⚙', 'Réglages système pro', 'Priorité aux jeux, planification GPU, alimentation, veille prolongée, télémétrie… Un point de restauration est créé avant. Demande l’autorisation administrateur.', state.sys ? `${state.sys.filter((t) => t.on).length}/${state.sys.length}` : '…',
    `<div id="sysTweaks">${sysTweaksHtml()}</div><div class="row"><button class="btn play" id="sysApply" type="button">Appliquer les réglages cochés</button></div><p class="hint">Chaque réglage est réversible : décoche puis applique pour revenir à la valeur de Windows.</p>`, { count: 'admin', open: Boolean(state.sys?.some((t) => !t.on)) }));
  S.D.push(catCard('', '💽', 'Stockage : TRIM et défragmentation', 'TRIM de chaque SSD (garde leurs performances d’écriture) et défragmentation des disques durs, comme l’outil officiel de Windows.', '',
    `<button class="btn" id="optiStorage" type="button" ${state.jobs.storage ? 'disabled' : ''}>Optimiser tous les disques</button><div data-job="storage">${jobHtml('storage')}</div>`, { count: 'admin' }));
  S.D.push(catCard('', '🩺', 'Réparer Windows (DISM + SFC)', 'Vérifie l’image de Windows et la répare depuis Windows Update, puis contrôle chaque fichier système un par un et remplace ceux qui sont abîmés.', '',
    `<button class="btn" id="optiRepair" type="button" ${state.jobs.repair ? 'disabled' : ''}>Vérifier et réparer Windows</button><p class="hint">15 à 40 minutes. Utile après des plantages, écrans bleus ou erreurs bizarres.</p><div data-job="repair">${jobHtml('repair')}</div><div id="repairOut"></div>`, { count: 'admin' }));
  S.D.push(catCard('', '🛡', 'Nettoyage profond de Windows', 'Anciennes mises à jour, fichiers temporaires système, cache de distribution, TRIM du SSD, nettoyage des composants. Demande l’autorisation administrateur.', '',
    `<button class="btn" id="optiDeep" type="button" ${state.jobs.deep ? 'disabled' : ''}>Lancer le nettoyage profond</button><p class="hint">Plusieurs minutes. Windows affiche une demande d’autorisation.</p><div data-job="deep">${jobHtml('deep')}</div>`, { count: 'admin' }));
  // Rangé en 5 parties aérées : jeux, nettoyage, Windows, entretien, annuler
  // Menu A-E à gauche (fixe), contenu à droite
  const secs = OPTI_SECTIONS.filter(([k]) => S[k].length);
  $('optiBody').innerHTML = `<nav class="onav">${secs.map(([k, t], i) => `<a data-osec="${k}" class="${i ? '' : 'on'}"><b>${k}</b>${t}</a>`).join('')}</nav>${secs.map(([k, t]) => `<section class="osec" id="osec${k}"><h3><span>${k}</span>${t}</h3>${S[k].join('')}</section>`).join('')}`;
  renderSetHist();
  renderOptiDiag(o);
}
// ---------- Ce que l'analyse a trouvé : une correction proposée pour chaque vrai problème du PC ----------
function optiFindings(o) {
  const f = [];
  const junk = o.junk.filter((x) => !SHADERS.includes(x.id));
  const junkB = junk.reduce((n, x) => n + x.bytes, 0) + o.recycle;
  const heavy = o.startup.filter((x) => x.enabled && x.heavy);
  const tweaksOff = o.tweaks.filter((t) => !t.on && !t.optional && !t.retired);
  const gamesTodo = (o.games ?? []).filter((a) => !a.applied);
  const part = (id) => state.health?.parts?.find((p) => p.id === id)?.score;
  const s = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  if (o.free != null && o.disk && o.free / o.disk < 0.1) f.push(['bad', '💽', `Disque presque plein : ${gb(o.free)} libres`, 'Windows et les jeux ralentissent sous 10 % libres.', 'space', 'Voir quoi libérer']);
  if (junkB > 500e6) f.push([junkB > 3e9 ? 'bad' : 'warn', '🗑', `${gb(junkB)} de fichiers inutiles`, 'Temporaires, caches et corbeille. Tes fichiers perso ne sont pas touchés.', 'junk', 'Nettoyer']);
  if (heavy.length) f.push(['warn', '⏻', `${s(heavy.length, 'appli lourde')} au démarrage`, heavy.map((x) => x.name).join(', '), 'startup', 'Retirer du démarrage']);
  if (tweaksOff.length) f.push(['warn', '🎯', `${s(tweaksOff.length, 'réglage')} Windows pas optimisé${tweaksOff.length > 1 ? 's' : ''} pour le jeu`, tweaksOff.slice(0, 3).map((t) => t.label).join(' · '), 'tweaks', 'Appliquer']);
  if (gamesTodo.length) f.push(['info', '🎮', `${s(gamesTodo.length, 'optimisation')} possible${gamesTodo.length > 1 ? 's' : ''} pour tes jeux`, [...new Set(gamesTodo.map((a) => a.game))].join(', '), 'games', 'Voir']);
  if (o.orphans.length) f.push(['info', '🧩', `${s(o.orphans.length, 'reste')} de jeux désinstallés`, gb(o.orphans.reduce((n, x) => n + x.bytes, 0)), 'space', 'Voir']);
  if (part('stabilite') != null && part('stabilite') < 70) f.push(['bad', '🩺', 'Plantages de Windows cette semaine', 'La réparation (DISM + SFC) remplace les fichiers système abîmés.', 'repair', 'Réparer Windows']);
  if (part('materiel') != null && part('materiel') < 60) f.push(['bad', '🖥', 'Problèmes de matériel ou de sécurité', 'Températures, pilote ou protection : le détail est dans Mon PC.', 'pc', 'Voir dans Mon PC']);
  return f;
}
/** Ouvre une demande au support (Paramètres › Aide), déjà remplie ; l'analyse du PC est jointe. */
function openHelp(title, description) {
  $('openSettings').click(); document.querySelector('.setnav [data-pane=aide]')?.click(); $('newSupport').click();
  $('supportTitle').value = title; $('supportForm').elements.description.value = description.slice(0, 4000);
}
function renderOptiDiag(o) {
  const f = optiFindings(o);
  const fixable = f.some(([, , , , k]) => ['junk', 'startup', 'tweaks'].includes(k));
  $('optiDiag').innerHTML = `<div class="odiag"><div class="odhead"><b>🩺 Ce que l’analyse a trouvé</b>${f.length ? '<button class="btn" type="button" data-fix="help" style="margin-left:auto">🆘 Demander de l’aide</button>' : ''}${fixable ? '<button class="btn play" type="button" data-fix="all">⚡ Tout corriger</button>' : ''}</div>${f.length
    ? f.map(([lvl, ico, t, d, k, b]) => `<div class="odrow ${lvl}"><i>${ico}</i><div><b>${esc(t)}</b><small>${esc(d)}</small></div><button class="btn" type="button" data-fix="${k}">${b}</button></div>`).join('')
    : '<p class="hint">✅ Rien à corriger : ton PC est bien réglé.</p>'}</div>`;
}
$('optiDiag').addEventListener('click', async (e) => {
  const k = e.target.closest('[data-fix]')?.dataset.fix;
  if (!k || !opti) return;
  const goSec = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (k === 'space') return goSec('osecB');
  if (k === 'games') return goSec('osecA');
  if (k === 'pc') return go('pc');
  if (k === 'help') { // demande au support Discord, déjà remplie avec ce que l'analyse a trouvé
    return openHelp('Aide pour optimiser mon PC', `Problèmes trouvés par l’analyse :\n${optiFindings(opti).map(([, , t, d]) => `- ${t} : ${d}`).join('\n')}`);
  }
  if (!(await premOk('opti'))) return openPremium('opti');
  if (k === 'repair') return $('optiRepair')?.click();
  const none = { games: [], junk: [], orphans: [], recycle: false, tweaks: [] };
  const junk = { junk: opti.junk.filter((x) => !SHADERS.includes(x.id)).map((x) => x.id), recycle: opti.recycle > 0 };
  const tweaks = { tweaks: opti.tweaks.filter((t) => !t.on && !t.optional && !t.retired).map((t) => t.id) };
  if (k === 'startup' || k === 'all') {
    for (const x of opti.startup.filter((y) => y.enabled && y.heavy)) { const r = await api.optiStartup(x.name, false).catch(() => null); if (r?.ok) opti.startup = r.startup; }
    if (k === 'startup') { renderOpti(); return toast('⏻ Applis lourdes retirées du démarrage'); }
  }
  return runOpti({ ...none, ...(k === 'junk' || k === 'all' ? junk : {}), ...(k === 'tweaks' || k === 'all' ? tweaks : {}) });
});
async function renderSetHist() {
  const el = document.getElementById('setHist'); if (!el) return;
  const h = await api.settingsHistory().catch(() => null);
  if (!h?.list?.length) { el.innerHTML = '<p class="hint">Rien pour l’instant : la première photo sera prise avant ton prochain changement de réglages.</p>'; return; }
  el.innerHTML = `<div class="flist">${h.list.map((x) => `<div><div><b>${new Date(x.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</b><small>${esc(x.label)} · ${diffSettings(x, h.now).length} différence(s) avec maintenant</small></div><button class="btn ghost sm" data-shreport="${x.at}">Rapport</button><button class="btn ghost sm" data-shrestore="${x.at}">Revenir à ces réglages</button></div>`).join('')}</div>`;
  state.setHist = h;
}
function diffSettings(a, b) {
  const out = [];
  for (const k of ['sys', 'game']) for (const t of a[k]) { const n = b[k].find((x) => x.id === t.id); if (n && n.on !== t.on) out.push(`${t.label} : ${t.on ? 'activé' : 'désactivé'} → ${n.on ? 'activé' : 'désactivé'}`); }
  for (const t of a.startup) { const n = b.startup.find((x) => x.name === t.name); if (n && n.enabled !== t.enabled) out.push(`Démarrage de ${t.name} : ${t.enabled ? 'oui' : 'non'} → ${n.enabled ? 'oui' : 'non'}`); }
  return out;
}
function planFromUi() {
  const on = (k) => document.querySelector(`[data-catcheck="${k}"]`)?.checked;
  const ids = (g) => [...document.querySelectorAll(`#optiBody input[data-g="${g}"]:checked`)].filter((i) => on(i.closest('.ocat')?.dataset.cat)).map((i) => i.value);
  return { games: ids('games'), junk: ids('junk'), orphans: ids('orphans'), recycle: Boolean(on('recycle')) && opti.recycle > 0, tweaks: on('tweaks') ? opti.tweaks.filter((t) => !t.on && !t.optional && !t.retired).map((t) => t.id) : [] };
}
const SCAN_STEPS = [['junk', 'Fichiers inutiles'], ['recycle', 'Corbeille'], ['orphans', 'Restes de jeux'], ['startup', 'Démarrage de Windows'], ['tweaks', 'Réglages pour les jeux']];
function showProgress(html) { $('optiProgress').hidden = !html; $('optiProgress').innerHTML = html ?? ''; }
let scanDone = new Set();
async function optiScanUi() {
  scanDone = new Set();
  $('optiScan').disabled = true; $('optiRun').hidden = true;
  $('optiScan').textContent = 'Analyse en cours…';
  const draw = () => showProgress(`<div class="oprog"><b>Analyse de ton PC…</b><div class="gbar big"><i style="width:${(scanDone.size / SCAN_STEPS.length) * 100}%"></i></div>
    <div class="osteps">${SCAN_STEPS.map(([k, l]) => `<span class="${scanDone.has(k) ? 'ok' : 'run'}">${scanDone.has(k) ? '✓' : '<i class="spin"></i>'} ${l}</span>`).join('')}</div></div>`);
  draw();
  state.optiDraw = draw;
  opti = await api.optiScan?.().catch(() => null);
  state.optiDraw = null;
  showProgress(null);
  $('optiScan').disabled = false; $('optiScan').textContent = 'Analyser à nouveau';
  if (opti?.error) { toast(opti.error); opti = null; } else if (opti) { renderOpti(); refreshHealth(); } else toast('Analyse impossible pour l’instant');
}
let runLog = [];
api.onOpti?.((p) => {
  if (p.phase === 'scan') { scanDone.add(p.step); state.optiDraw?.(); return; }
  if (p.phase !== 'run') return;
  if (p.status === 'fait') runLog[p.index] = { label: p.label, got: p.got };
  if (p.status === 'erreur') runLog[p.index] = { label: p.label, error: p.error };
  const pct = ((p.index + (p.status === 'fait' ? 1 : 0.5)) / p.total) * 100;
  showProgress(`<div class="oprog"><b>Optimisation en cours… ${Math.floor(pct)} %</b><span class="ofreed">${gb(p.freed)} libérés</span>
    <div class="gbar big"><i style="width:${pct}%"></i></div>
    <div class="olog">${runLog.map((r) => r && (r.error ? `<div class="err">✗ ${esc(r.label)} : ${esc(r.error)}</div>` : `<div class="ok">✓ ${esc(r.label)}${r.got ? ` <em>${gb(r.got)}</em>` : ''}</div>`)).filter(Boolean).slice(-6).join('')}${p.status === 'en cours' ? `<div class="run"><i class="spin"></i> ${esc(p.label)}</div>` : ''}</div></div>`);
});
$('optiScan').addEventListener('click', optiScanUi);
$('optiRun').addEventListener('click', () => runOpti());
async function runOpti(plan = planFromUi(), sys = []) {
  if (!(await premOk('opti'))) return openPremium('opti');
  // Résumé exact avant d'appliquer : chaque dossier vidé (chemin, fichiers, taille) et chaque changement
  const dels = [...opti.junk.filter((x) => plan.junk.includes(x.id)), ...opti.orphans.filter((x) => plan.orphans.includes(x.id)), ...(opti.games ?? []).filter((a) => a.kind === 'clean' && plan.games.includes(a.id))];
  const changes = [...plan.tweaks.map((id) => opti.tweaks.find((t) => t.id === id)?.label), ...(opti.games ?? []).filter((a) => a.kind !== 'clean' && plan.games.includes(a.id)).map((a) => `${a.game} : ${a.label}`)].filter(Boolean);
  const files = dels.reduce((n, x) => n + (x.files ?? 0), 0);
  const bytes = dels.reduce((n, x) => n + (x.bytes ?? 0), 0) + (plan.recycle ? opti.recycle : 0);
  const list = [...changes.map((c) => `⚙ ${c}`), ...dels.map((x) => `🗑 ${x.dir ?? x.label} — ${x.files != null ? `${x.files} fichier${x.files > 1 ? 's' : ''}, ` : ''}${gb(x.bytes)}`), ...(plan.recycle ? [`🗑 Corbeille — ${gb(opti.recycle)}`] : [])];
  list.unshift(...sys.map((c) => `🛡 ${state.sys.find((t) => t.id === c.id)?.label}`));
  if (!list.length) return toast('Rien de coché à optimiser');
  if (!(await ui.confirm({ title: 'Lancer l’optimisation ?', text: `${sys.length ? `${sys.length} réglage${sys.length > 1 ? 's' : ''} système (point de restauration Windows créé avant, autorisation administrateur), ` : ''}${changes.length} changement${changes.length > 1 ? 's' : ''}, ${files} fichier${files > 1 ? 's' : ''} (${gb(bytes)}) supprimé${files > 1 ? 's' : ''}. Une sauvegarde de chaque fichier et réglage modifié est créée avant : tout est annulable. Tes jeux, mods, sauvegardes et fichiers perso ne sont pas touchés.`, list, ok: '⚡ Optimiser', icon: '🚀' }))) return;
  if (sys.length) { const r = await api.optiSysApply(sys).catch(() => null); if (r?.ok) state.sys = r.states; else toast('Réglages système : autorisation refusée, le reste continue'); }
  const before = opti.score;
  runLog = [];
  const gain = $('optiGain').checked;
  let benchBefore = null;
  if (gain) { showProgress('<div class="oprog"><b>Mesure avant optimisation (≈ 10 s)…</b><div class="gbar big indet"><i></i></div></div>'); benchBefore = await api.benchQuick().catch(() => null); }
  $('optiRun').disabled = true; $('optiScan').disabled = true;
  const r = await api.optiRun(plan).catch(() => null);
  $('optiRun').disabled = false; $('optiScan').disabled = false;
  if (!r?.ok) { showProgress(null); return ui.confirm({ title: 'L’optimisation s’est arrêtée', text: r?.error ? `Erreur : ${r.error}` : 'Réessaie dans un instant.', ok: 'OK', cancel: 'Fermer', icon: '⚠️' }); }
  if (r.scan) { opti = r.scan; renderOpti(); }
  const summary = { done: true, freed: r.freed ?? 0, changes: (r.tweaks ?? 0) + (r.games ?? 0) };
  if (r.fixed?.fixed) toast(r.fixed.reboot ? '✅ Réglages qui faisaient bugger les jeux corrigés : redémarre le PC' : '✅ Réglages qui faisaient bugger les jeux corrigés');
  await refreshHealth(true);
  let benchAfter = null;
  if (gain && benchBefore && !benchBefore.error) { showProgress('<div class="oprog"><b>Mesure après optimisation (≈ 10 s)…</b><div class="gbar big indet"><i></i></div></div>'); benchAfter = await api.benchQuick().catch(() => null); }
  const delta = benchAfter?.total && benchBefore?.total ? Math.round((100 * (benchAfter.total - benchBefore.total)) / benchBefore.total) : null;
  showProgress(`<div class="oprog done"><b>✅ Optimisation terminée</b><div class="odone"><div><b>${gb(r.freed)}</b><small>libérés</small></div><div><b>${r.tweaks + (r.games ?? 0)}</b><small>changement${r.tweaks + (r.games ?? 0) > 1 ? 's' : ''} appliqué${r.tweaks + (r.games ?? 0) > 1 ? 's' : ''}</small></div><div><b>${before} → ${r.score ?? '?'}</b><small>note d’entretien</small></div><div><b>${state.health?.score ?? '–'}</b><small>score de santé global</small></div>${delta != null ? `<div><b>${benchBefore.total} → ${benchAfter.total}</b><small>mini-benchmark (${delta >= 0 ? '+' : ''}${delta} %${Math.abs(delta) <= 2 ? ', dans la marge de mesure' : ''})</small></div>` : ''}</div>${r.errors?.length ? `<div class="olog">${r.errors.map((x) => `<div class="err">✗ ${esc(x)}</div>`).join('')}</div>` : ''}<div class="row">${r.undo ? '<button class="btn" data-undo="1" type="button">↩ Annuler cette optimisation</button>' : ''}<button class="btn ghost" data-closeprog="1">Fermer</button></div></div>`);
  return summary;
}

$('optiProgress').addEventListener('click', (e) => { if (e.target.closest('[data-closeprog]')) showProgress(null); });
// Annuler la dernière optimisation (depuis le rapport ou la carte « Annuler ») : fichiers et réglages reviennent comme avant
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-undo]')) return;
  const r = await api.optiUndo().catch(() => null);
  if (r?.cancelled) return;
  toast(r?.ok ? '↩ Optimisation annulée : tout est revenu comme avant' : r?.error ?? 'Impossible');
  if (r?.ok) { showProgress(null); optiScanUi(); }
});
$('optiBody').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.startup) { const r = await api.optiStartup(el.dataset.startup, el.checked); if (r?.ok) { opti.startup = r.startup; toast(el.checked ? `${el.dataset.startup} se lancera au démarrage` : `${el.dataset.startup} ne se lancera plus au démarrage`); } }
  if (el.dataset.tweak) { const r = await api.optiTweak(el.dataset.tweak, el.checked); if (r?.ok) { opti.tweaks = r.tweaks; toast('Réglage appliqué'); } }
  if (el.dataset.catcheck) el.closest('.ocat').classList.toggle('off', !el.checked);
});
$('optiBody').addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-osec]');
  if (nav) { document.querySelectorAll('.onav a').forEach((a) => a.classList.toggle('on', a === nav)); return $(`osec${nav.dataset.osec}`)?.scrollIntoView({ behavior: 'smooth' }); }
  const tg = e.target.closest('[data-toggle]');
  if (tg) { tg.closest('.ocat').classList.toggle('open'); return; }
  if (e.target.dataset.uninst) { const it = state.items.find((x) => x.id === e.target.dataset.uninst); if (it) { state.sel = it; const r = await api.action(it.id, 'uninstall'); if (r && !r.ok && r.error) toast(r.error); } return; }
  if (e.target.dataset.shrestore) { const r = await api.settingsRestore(Number(e.target.dataset.shrestore)); if (r?.ok) { toast(`🕘 Réglages remis${r.sys ? ' (réglages système compris)' : ''}`); renderSetHist(); } return; }
  if (e.target.dataset.shreport) {
    const x = state.setHist.list.find((y) => y.at === Number(e.target.dataset.shreport));
    const d = diffSettings(x, state.setHist.now);
    return showReport({ text: `Réglages du ${new Date(x.at).toLocaleString('fr-FR')} (${x.label}) comparés à maintenant :\n\n${d.length ? d.map((l) => `- ${l}`).join('\n') : 'Aucune différence.'}` }, 'Rapport avant / après');
  }
  if (e.target.id === 'optiReset') {
    e.target.disabled = true;
    const r = await api.optiUndoAll();
    e.target.disabled = false;
    if (r?.cancelled) return;
    if (!r?.ok) return toast(r?.refused ? 'Autorisation refusée : les réglages système n’ont pas été remis' : r?.error ?? 'Impossible');
    toast(r.changed ? `↩ ${r.changed} réglage(s) remis comme avant : redémarre le PC` : 'Tout est déjà comme Windows d’origine 👍');
    state.sys = await api.optiSys().catch(() => state.sys);
    return optiScanUi();
  }
  if (e.target.id === 'sysApply') {
    const changes = [...document.querySelectorAll('#sysTweaks [data-sys]')].map((i) => ({ id: i.dataset.sys, on: i.checked })).filter((c) => state.sys.find((t) => t.id === c.id)?.on !== c.on);
    if (!changes.length) return toast('Aucun changement à appliquer');
    if (!(await ui.confirm({ title: 'Appliquer les réglages système ?', text: 'Un point de restauration Windows est créé juste avant. Windows va demander l’autorisation administrateur.', list: changes.map((c) => `${c.on ? '✓' : '↩'} ${state.sys.find((t) => t.id === c.id).label}`), ok: '⚙ Appliquer', icon: '⚙' }))) return;
    e.target.disabled = true;
    const r = await api.optiSysApply(changes);
    e.target.disabled = false;
    if (!r?.ok) return toast('Autorisation refusée : rien n’a été changé');
    state.sys = r.states; $('sysTweaks').innerHTML = sysTweaksHtml();
    toast(changes.some((c) => state.sys.find((t) => t.id === c.id)?.reboot) ? '✓ Appliqué : redémarre le PC pour finir' : '✓ Réglages appliqués');
    return;
  }
  if (e.target.id === 'optiStorage') {
    const r = await runJob('storage', e.target, () => api.optiStorage());
    toast(r?.ok ? '✓ Disques optimisés (TRIM / défragmentation)' : 'Autorisation refusée');
    return;
  }
  if (e.target.id === 'optiRepair') {
    if (!(await ui.confirm({ title: 'Vérifier et réparer Windows ?', text: '15 à 40 minutes. Windows va demander l’autorisation administrateur. Tu peux continuer à utiliser le PC.', list: ['DISM : état de l’image de Windows, réparée depuis Windows Update si besoin', 'SFC : contrôle de chaque fichier système, remplacement de ceux qui sont abîmés'], ok: '🩺 Lancer', icon: '🩺' }))) return;
    const r = await runJob('repair', e.target, () => api.optiRepair());
    const H = { Healthy: 'saine', Repairable: 'abîmée mais réparable', NonRepairable: 'abîmée et non réparable' };
    const S = { ok: 'aucun fichier système abîmé', repare: 'fichiers abîmés trouvés et réparés', echec: 'fichiers abîmés que Windows n’a pas pu réparer', inconnu: 'contrôle terminé' };
    $('repairOut').innerHTML = r?.ok ? `<div class="adv ${r.sfc === 'echec' || r.health === 'NonRepairable' ? 'p0' : 'p3'}"><div><b>✅ Vérification terminée</b><small>Image de Windows : ${esc(H[r.health] ?? r.health ?? '?')}${r.dismFixed ? ' (réparée)' : ''} · SFC : ${esc(S[r.sfc] ?? r.sfc)}.</small></div></div>` : `<p class="hint">${esc(r?.error ?? 'Réparation impossible')}</p>`;
    return;
  }
  if (e.target.id === 'optiDeep') {
    if (!(await ui.confirm({ title: 'Nettoyage profond de Windows ?', text: 'Windows va demander l’autorisation administrateur. Ça peut prendre plusieurs minutes.', list: ['Fichiers temporaires de Windows', 'Anciennes mises à jour téléchargées', 'Cache d’optimisation de la distribution', 'Rapports d’erreur système', 'TRIM du SSD et nettoyage des composants Windows'], ok: '🛡 Lancer', icon: '🛡' }))) return;
    const r = await runJob('deep', e.target, () => api.optiDeep());
    showProgress(r?.ok ? `<div class="oprog done"><b>✅ Nettoyage profond terminé</b><div class="odone"><div><b>${r.freed != null ? gb(r.freed) : '—'}</b><small>libérés</small></div></div><button class="btn ghost" data-closeprog="1">Fermer</button></div>` : null);
    if (!r?.ok) toast('Nettoyage profond annulé');
  }
});
$('optiAuto').addEventListener('change', (e) => api.optiAuto?.(e.target.checked).then(() => toast(e.target.checked ? 'Optimisation automatique chaque semaine activée' : 'Optimisation automatique désactivée')));
function unlockFx() {
  const r = $('view-optimisation').closest('main').getBoundingClientRect(); // zone de contenu (la page n'est pas encore affichée)
  const fx = document.createElement('div');
  fx.className = 'unlockfx';
  Object.assign(fx.style, { left: `${r.left}px`, top: `${Math.max(0, r.top)}px`, width: `${r.width}px`, height: `${innerHeight - Math.max(0, r.top)}px` });
  fx.innerHTML = '<img class="doors" src="doors0.webp" alt=""><div class="lockbox"><i class="lock3d"></i><b>Optimisation débloquée</b></div>';
  document.body.append(fx);
  window.sfx?.play('pop');
  // Portes blindées 3D (rendu Blender) : fermées pendant le cadenas, puis la vidéo d'ouverture avec la fumée verte
  setTimeout(() => { fx.querySelector('.doors').src = `doors3d.webp?${Date.now()}`; }, 1000);
  fx.addEventListener('animationend', (e) => { if (e.target === fx) fx.remove(); });
  try { localStorage.setItem('hl-opti-unlocked', '1'); } catch { /* rien */ }
}
function openOpti() {
  // Entrée de la page : un reflet vert traverse la carte et « Analyser mon PC » s'illumine
  const hero = document.querySelector('#view-optimisation .optihero');
  if (hero) { hero.classList.remove('enter'); void hero.offsetWidth; hero.classList.add('enter'); }
  if (state.unlockFx) { state.unlockFx = false; requestAnimationFrame(unlockFx); }
  // Les bandes de chantier arrivent et se collent à chaque ouverture de la page
  const m = document.querySelector('#view-optimisation .maint');
  if (m) { m.classList.remove('go'); void m.offsetWidth; m.classList.add('go'); }
  api.optiAuto?.().then((a) => { $('optiAuto').checked = a?.on !== false; }).catch(() => {});
  if (!opti) setRing(state.health?.score ?? null, state.health?.label);
  api.optiSys?.().then((l) => { state.sys = l; if (opti) renderOpti(); }).catch(() => {});
  refreshHealth();
}
function sysTweaksHtml() {
  if (!state.sys) return '<p class="hint">Lecture des réglages…</p>';
  // Réglages retirés encore actifs : décochés d'office, « Appliquer » les remet comme Windows
  return state.sys.map((t) => `<label class="toggle small"><input type="checkbox" data-sys="${esc(t.id)}" ${t.on && !t.retired ? 'checked' : ''}><span></span><div class="tlabel">${esc(t.label)}${t.retired ? ' <small class="warn">déconseillé : sera retiré</small>' : t.on ? ' <small class="ok">actif</small>' : ''}${t.reboot ? ' <small class="opt">redémarrage</small>' : ''}<small class="hint">${esc(t.retired ?? t.help)}</small></div></label>`).join('');
}

// ---------- Score de santé unique (Mon PC = Optimisation) ----------
function paintRing(prefix, score, label) {
  const C = 2 * Math.PI * 52;
  const col = score == null ? 'var(--muted)' : score >= 90 ? '#2ee07a' : score >= 75 ? '#22d3ee' : score >= 55 ? '#f59e0b' : '#ef4444';
  $(`${prefix}Val`).style.strokeDasharray = `${score == null ? 0 : (score / 100) * C} ${C}`;
  $(`${prefix}Val`).style.stroke = col;
  $(`${prefix}Num`).textContent = score ?? '–';
  $(`${prefix}Num`).style.color = col;
  $(`${prefix}Label`).textContent = label ?? 'Pas encore analysé';
}
async function refreshHealth(force = false) {
  const h = await api.health?.(force).catch(() => null);
  if (!h || h.error) return;
  state.health = h;
  paintRing('pcRing', h.score, h.label);
  setRing(h.score, h.label);
  $('healthParts').innerHTML = h.parts.map((p) => `<div><span>${esc(p.label)}</span><div class="lvlbar"><i style="width:${p.score}%"></i></div><b>${p.score}</b></div>`).join('') + (h.deepAt ? '' : '<small class="hint">Lance l’analyse pro pour ajouter la note des fichiers et du stockage.</small>');
  renderTop();
}
function renderTop() {
  const list = [...(state.health?.events?.findings ?? []), ...(state.diag?.advice ?? [])].sort((a, b) => a.prio - b.prio).slice(0, 4);
  $('pcTop').innerHTML = list.length ? list.map((a) => `<div class="adv p${a.prio}"><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small>${a.gain ? `<em>↗ ${esc(a.gain)}</em>` : ''}</div>${a.fix ? `<button type="button" class="btn sm" data-pcfix="${esc(a.fix)}">Corriger</button>` : ''}</div>`).join('') : '<div class="empty">Rien d’urgent : ton PC est en forme 👌</div>';
}

// ---------- Mon PC : onglets ----------
function pcTab(tab) {
  document.querySelectorAll('#pcTabs [data-pctab]').forEach((b) => b.classList.toggle('on', b.dataset.pctab === tab));
  document.querySelectorAll('#view-pc .pctab').forEach((el) => { el.hidden = el.dataset.pctab !== tab; });
  state.pcTab = tab;
  if (tab === 'securite' && !$('pcProcs').dataset.done) { $('pcProcs').dataset.done = '1'; renderProcs(); }
  if (tab === 'analyse' && !$('scanDrives').children.length) renderScanDrives();
  if (tab === 'upgrade') renderUpgrade();
  if (tab === 'entretien') renderCare();
  if (tab === 'verifs') moreUi?.verifs();
  if (tab === 'stockage') moreUi?.storage();
  if (tab === 'composants') moreUi?.pc3d();
}
// 🛒 Upgrade : carte graphique (marque au choix), processeur + carte mère, RAM, stockage ; compatibilité et FPS par jeu
const up = { budget: 600, mode: 'gpu', brand: 'all', target: null, picked: (() => { try { return JSON.parse(localStorage.getItem('upPicked') ?? '[]'); } catch { return []; } })() };
// Jeux populaires qu'on peut choisir même s'ils ne sont pas installés (pochette Steam quand elle existe)
const POPULAR = [['Fortnite'], ['Valorant'], ['Counter-Strike 2', 730], ['Rocket League', 252950], ['Grand Theft Auto V', 271590], ['FiveM'], ['Apex Legends', 1172470], ['Call of Duty: Warzone'], ['Minecraft'], ['Roblox'], ['League of Legends'], ['Tom Clancy’s Rainbow Six Siege', 359550], ['Overwatch 2', 2357570], ['Marvel Rivals', 2767030], ['The Finals', 2073850], ['Cyberpunk 2077', 1091500], ['ELDEN RING', 1245620], ['Red Dead Redemption 2', 1174180], ['Baldur’s Gate 3', 1086940], ['Helldivers 2', 553850], ['Rust', 252490], ['DayZ', 221100], ['Palworld', 1623730], ['Garry’s Mod', 4000], ['Dead by Daylight', 381210], ['EA SPORTS FC 25', 2669320], ['Fall Guys', 1097150], ['Sea of Thieves', 1172620], ['Destiny 2', 1085660], ['Valheim', 892970]];
const popCover = (name) => { const p = POPULAR.find(([n]) => n === name); return name === 'Roblox' ? 'art/roblox-cover.jpg' : p?.[1] ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${p[1]}/library_600x900.jpg` : null; };
const coverOf = (id, name) => { const it = state.items.find((i) => i.id === id) ?? state.items.find((i) => i.name === name); return it?.art?.cover ?? it?.art?.header ?? it?.art?.hero ?? popCover(name); };
const shortCpu = (n) => String(n ?? '').replace(/\(R\)|\(TM\)|CPU|Processor|\d+-Core|AMD |Intel /gi, '').replace(/\s+/g, ' ').trim();
async function renderUpgrade() {
  const r = await api.upgrade?.({ budget: up.budget, mode: up.mode, brand: up.brand, target: up.target, picked: up.picked }); if (!r) return;
  $('upBrands').hidden = r.mode !== 'gpu';
  $('upGamesHead').hidden = $('upGames').hidden = !['gpu', 'cpu'].includes(r.mode);
  const card = (cls, small, title, bar, em) => `<div class="upcard ${cls}"><small>${small}</small><b>${esc(title)}</b>${bar != null ? `<div class="upbar"><i style="width:${Math.min(100, bar)}%"></i></div>` : ''}<em>${em}</em></div>`;
  const gainBox = (g, txt) => `<div class="upgain ${g > 0 ? '' : 'none'}"><b>${g != null ? `${g > 0 ? '+' : ''}${g} %` : '—'}</b><small>${txt}</small></div>`;
  const opt = (o, { title, price, gain, tags = [], notes = [] }) => `<button type="button" class="upopt ${up.target === o || (!up.target && tags.includes('best')) ? 'on' : ''}" data-uptarget="${esc(o ?? '')}"><div class="uptags">${tags.includes('best') ? '<span class="t best">🚀 Le plus puissant utile</span>' : ''}${tags.includes('value') ? '<span class="t value">⭐ Meilleur rapport qualité / prix</span>' : ''}${tags.includes('waste') ? '<span class="t warn">⚠️ Bridée par ton processeur</span>' : ''}</div><b>${esc(title)}</b><span class="upprice">~${price} €</span>${gain != null ? `<span class="upg">${gain > 0 ? '+' : ''}${gain} %</span>` : ''}<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></button>`;
  let notes = [];
  if (r.mode === 'gpu') {
    const g = r.gpuOpt, cur = g.current, t = r.target;
    $('upHero').innerHTML = card('cur', 'TA CARTE ACTUELLE', cur?.name ?? (r.gpuName || 'Inconnue'), cur ? cur.score / 4.5 : 0, `${esc(shortCpu(r.cpuName))}${r.ramGb ? ` · ${r.ramGb} Go` : ''}`) + '<div class="uparrow">➜</div>'
      + card('best', up.target ? 'CARTE CHOISIE' : `CONSEILLÉE POUR ${up.budget} €`, t?.name ?? 'Rien d’utile à ce prix', t ? t.score / 4.5 : 0, t ? `~${t.price} € · alimentation ≥ ${t.psu} W` : 'Augmente le budget ou change de marque') + gainBox(t?.gain ?? null, 'de FPS dans les jeux<br>limités par la carte');
    const b = g.balance, nameAt = (cap) => GPU_NAMES_AT(r, cap);
    notes = [b.cpuCap && `🧠 Ton processeur (${esc(shortCpu(r.cpuName))}) suit une carte jusqu’au niveau <b>${esc(nameAt(b.cpuCap * 1.1))}</b>.`, b.screenCap && `🖥️ Ton écran (${r.width >= 3800 ? '4K' : r.width >= 2500 ? '1440p' : '1080p'} à ${r.hz ?? '?'} Hz) n’affichera pas mieux qu’une <b>${esc(nameAt(b.screenCap * 1.1))}</b>.`, t && `⚡ Vérifie ton alimentation : <b>${t.psu} W minimum</b> pour cette carte avec ton processeur.`].filter(Boolean);
    $('upOpts').innerHTML = g.options.map((o) => opt(o.name, { title: o.name, price: o.price, gain: o.gain, tags: [o === g.best || o.name === g.best?.name ? 'best' : '', o.name === g.value?.name ? 'value' : '', o.wasted ? 'waste' : ''], notes: [`Alimentation ≥ ${o.psu} W`, `${{ nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' }[o.brand]} · port PCIe x16 standard`] })).join('') || '<p class="hint">Aucune carte de cette marque n’apporte au moins +15 % dans ce budget.</p>';
  } else if (r.mode === 'cpu') {
    const c = r.cpuOpt, t = r.target;
    $('upHero').innerHTML = card('cur', 'TON PROCESSEUR', shortCpu(r.cpuName) || 'Inconnu', c.current ? c.current / 2 : 0, `Socket ${esc(c.platform.socket ?? '?')} · ${esc(c.platform.mem ?? '?')}`) + '<div class="uparrow">➜</div>'
      + card('best', up.target ? 'CHOIX' : `CONSEILLÉ POUR ${up.budget} €`, t?.name ?? 'Rien d’utile à ce prix', t ? t.score / 2 : 0, t ? `~${t.total} € au total${t.same ? ' · même carte mère' : ` · ${t.board?.label ?? ''}`}` : 'Augmente le budget') + gainBox(t?.gain ?? null, 'dans les jeux<br>limités par le processeur');
    notes = [t && !t.same && '🔁 Nouvelle plateforme : processeur, carte mère et parfois mémoire changent ensemble. Ta carte graphique et tes disques se gardent.', t?.same && '✅ Rien d’autre à changer : il se pose sur ta carte mère actuelle.'].filter(Boolean);
    $('upOpts').innerHTML = c.options.map((o) => opt(o.name, { title: o.name, price: o.total, gain: o.gain, tags: [o.name === c.best?.name ? 'best' : '', o.name === c.value?.name ? 'value' : ''], notes: o.notes })).join('') || '<p class="hint">Rien de plus rapide dans ce budget pour ton PC.</p>';
  } else {
    const o = r.mode === 'ram' ? r.ramOpt : r.diskOpt;
    $('upHero').innerHTML = card('cur', r.mode === 'ram' ? 'TA MÉMOIRE' : 'TON STOCKAGE', r.mode === 'ram' ? `${r.ramGb ?? '?'} Go ${o.type ?? ''}` : 'Disques actuels', null, r.mode === 'ram' ? `Compatible : ${esc(o.type)} uniquement` : 'Vois aussi Mon PC › Entretien');
    $('upOpts').innerHTML = o.options.map((x) => opt(null, { title: x.title, price: x.price, gain: null, notes: [x.gain, ...(x.notes ?? [])] })).join('');
  }
  $('upBal').innerHTML = notes.map((n) => `<div>${n}</div>`).join('');
  if (['gpu', 'cpu'].includes(r.mode)) $('upGames').innerHTML = (r.sim ?? []).length ? r.sim.map((g) => { const c = coverOf(g.id, g.name); const p = g.unknown ? null : Math.round((g.after / Math.max(1, g.now) - 1) * 100); return `<div class="upgame"><span class="upcov"><em>${esc(g.name[0])}</em>${c ? `<i style="background-image:url('${esc(c)}')"></i>` : ''}</span><b>${esc(g.name)}</b>${g.unknown ? '<small class="warn">Pas encore de mesure : joue une partie avec la mesure des FPS</small>' : `<span class="upfps">${g.now} <i>➜</i> <strong>${g.after}</strong> FPS</span><small class="${p > 3 ? 'ok' : 'warn'}">${p > 3 ? `+${p} %` : 'Peu de gain ici'} · ${g.measured ? 'tes FPS mesurés' : 'estimé (tests 1080p élevé)'}</small>`}</div>`; }).join('') : '<p class="hint">Clique sur « Choisir mes jeux » pour voir tes FPS avant / après.</p>';
}
const GPU_NAMES_AT = (_r, cap) => UP_GPUS.filter((g) => g.score <= cap).at(-1)?.name ?? '—';
const UP_GPUS = [['GTX 1660 Super', 68], ['RTX 3060', 100], ['RTX 4060', 118], ['RTX 5060', 135], ['RTX 4060 Ti', 140], ['RTX 3070', 145], ['RX 7700 XT', 175], ['RTX 4070', 180], ['RX 7800 XT', 210], ['RTX 5070', 215], ['RX 9070', 245], ['RX 9070 XT', 270], ['RTX 5080', 310], ['RTX 5090', 450]].map(([name, score]) => ({ name, score }));
$('upBudget').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; document.querySelectorAll('#upBudget button').forEach((x) => x.classList.toggle('on', x === b)); up.budget = Number(b.dataset.b); up.target = null; $('upAiOut').hidden = true; renderUpgrade(); });
$('upModes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; document.querySelectorAll('#upModes button').forEach((x) => x.classList.toggle('on', x === b)); up.mode = b.dataset.mode; up.target = null; $('upAiOut').hidden = true; renderUpgrade(); });
$('upBrands').addEventListener('click', (e) => { const b = e.target.closest('[data-brand]'); if (!b) return; document.querySelectorAll('#upBrands button').forEach((x) => x.classList.toggle('on', x === b)); up.brand = b.dataset.brand; up.target = null; renderUpgrade(); });
$('upOpts').addEventListener('click', (e) => { const b = e.target.closest('[data-uptarget]'); if (!b || !b.dataset.uptarget) return; up.target = b.dataset.uptarget; $('upAiOut').hidden = true; renderUpgrade(); });
// Choisir ses jeux : toute la bibliothèque, avec la vraie pochette
$('upPick').addEventListener('click', () => {
  let d = document.getElementById('upPickDlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'upPickDlg'; d.innerHTML = '<div class="dlg upick"><h2>🎮 Choisis tes jeux</h2><input id="upPickQ" placeholder="Rechercher un jeu…"><div class="upickl" id="upPickL"></div><div class="row end"><button class="btn play" type="button" id="upPickOk">Voir les FPS</button></div></div>'; document.body.append(d); }
  const sel = new Set(up.picked);
  const tile = (id, name, c) => `<button type="button" class="upk ${sel.has(id) ? 'on' : ''}" data-pk="${esc(id)}"><span class="upcov"><em>${esc(name[0])}</em>${c ? `<i style="background-image:url('${esc(c)}')"></i>` : ''}</span><b>${esc(name)}</b></button>`;
  const paint = () => {
    const q = d.querySelector('#upPickQ').value.toLowerCase();
    const mine = state.items.filter((i) => i.kind === 'game' && i.name && i.name.toLowerCase().includes(q)).sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 60);
    const pop = POPULAR.filter(([n]) => n.toLowerCase().includes(q) && !state.items.some((i) => i.name === n));
    d.querySelector('#upPickL').innerHTML = (mine.length ? '<p class="upickh">Ta bibliothèque</p>' : '') + mine.map((i) => tile(i.id, i.name, i.art?.cover ?? i.art?.header ?? popCover(i.name))).join('')
      + (pop.length ? '<p class="upickh">Jeux populaires</p>' : '') + pop.map(([n]) => tile(`pop:${n}`, n, popCover(n))).join('');
  };
  d.querySelector('#upPickQ').oninput = paint;
  d.querySelector('#upPickL').onclick = (e) => { const b = e.target.closest('[data-pk]'); if (!b) return; sel.has(b.dataset.pk) ? sel.delete(b.dataset.pk) : sel.add(b.dataset.pk); b.classList.toggle('on'); };
  d.querySelector('#upPickOk').onclick = () => { up.picked = [...sel].slice(0, 12); try { localStorage.setItem('upPicked', JSON.stringify(up.picked)); } catch { /* pas grave */ } d.close(); renderUpgrade(); };
  paint(); d.showModal();
});
$('upAiBtn').addEventListener('click', async () => {
  if (!(await premOk('ia'))) return openPremium('ia');
  $('upAiBtn').disabled = true; $('upAiBtn').textContent = '🤖 L’IA étudie ton PC…';
  const r = await api.upgradeAi?.({ budget: up.budget, mode: up.mode, brand: up.brand, target: up.target, picked: up.picked }).catch(() => null);
  $('upAiBtn').disabled = false; $('upAiBtn').textContent = '🤖 Avis détaillé de l’IA';
  if (r?.error === 'premium') return openPremium('ia');
  $('upAiOut').hidden = false; $('upAiOut').innerHTML = r?.text ? richText(r.text) : esc(r?.error ?? 'IA indisponible');
});
// ⚡ / 🚀 Optimisation : onglets « rapide » et « Opti Pro accompagnée » (7 étapes guidées)
$('optTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ot]'); if (!b) return; document.querySelectorAll('#optTabs [data-ot]').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('#view-optimisation .optitab').forEach((el) => { el.hidden = el.dataset.ot !== b.dataset.ot; }); if (b.dataset.ot === 'pro') renderPro(); else clearInterval(proPoll); });
const PRO_STEPS = [
  ['🎫', 'Ton setup', 'Ton matériel est lu tout seul, tu dis ce que tu veux.'],
  ['✅', 'Validation', 'Le technicien IA valide et te dit quelles étapes faire.'],
  ['💾', 'Clé USB bootable', 'Facultatif · l’outil Microsoft en 1 clic.', [['usb', '💾 Télécharger l’outil (1 clic)']]],
  ['🧹', 'Formatage propre', 'Facultatif · sauvegardes, installation, pilotes.'],
  ['🧠', 'BIOS & overclocking', 'Mise à jour du BIOS, processeur et RAM selon ton matériel.', [['bios', '🔄 Dernier BIOS de ta carte mère'], ['occt', '🧪 OCCT']]],
  ['⚙️', 'Optimisation finale', 'Windows, carte graphique, énergie : en 1 clic, avec validation.', [['final', '⚡ Tout optimiser (1 clic)'], ['nvidia', '🟩 Pilote NVIDIA'], ['amd', '🟥 Pilote AMD']]],
  ['🏁', 'Test & validation', 'On remesure et on valide chaque réglage.', [['bench', '🏁 Mesurer mes performances']]]
];
const PRO_COLORS = ['#619fff', '#36c995', '#9b8cff', '#f5a623', '#ff6b6b', '#2ee07a', '#ffc439'];
let pro = null, proBusy = false, proPoll = 0, proHuman = false, proSeen = '', proPlanOpen = true;
const proEmbed = (m, k) => `<div class="emb ${m.who}" data-k="${k}"><div class="emba">${m.who === 'bot' ? `<img src="logo.png" alt=""><b>Technicien History</b><span>Étape ${m.step + 1}/7 · ${PRO_STEPS[m.step][1]}</span>` : m.who === 'staff' ? '<b>Équipe History</b>' : '<b>Toi</b>'}</div><div class="reporttxt rich">${proLinks(richText(m.text)).replace(/\[\[faire:([a-z_]+)\]\]/g, (_, id) => (PRO_DO[id] ? `<button class="btn sm play pdo" data-do="${id}">⚡ Le faire pour moi</button>` : ''))}</div>${m.who === 'bot' ? `<div class="embbar"><i style="width:${Math.round(((m.step + 1) / 7) * 100)}%"></i></div>` : ''}</div>`;
// Mode concentration : une tâche à la fois dans le dernier message du technicien, les autres floutées
const proFocus = {}, proDetail = {};
function proFocusUi() {
  const m = [...$('proLog').querySelectorAll('.emb.bot[data-k]')].pop(), items = m ? [...m.querySelectorAll(':scope > .reporttxt > ul > li, :scope > .reporttxt > p')] : [];
  if (!m || items.length < 2 || pro.closed) return;
  const k = m.dataset.k, i = Math.min(proFocus[k] ?? 0, items.length - 1), d = proDetail[`${k}:${i}`];
  m.classList.add('focus'); m.classList.toggle('detailing', Boolean(d));
  items.forEach((li, j) => { li.classList.toggle('on', j === i); li.classList.toggle('past', j < i); li.dataset.pf = j; });
  let h = (items[i].tagName === 'LI' ? items[i].parentElement : items[i]).previousElementSibling; while (h && h.tagName !== 'H4') h = h.previousElementSibling; h?.classList.add('on');
  items[i].insertAdjacentHTML('beforeend', `<div class="pfbtns">${items[i].tagName === 'P' && /\?\s*$/.test(items[i].textContent) ? '<button class="btn sm play" data-pa="ask">💬 Répondre</button>' : ''}<button class="btn sm" data-pfa="detail" ${d === 0 ? 'disabled' : ''}>${d === 0 ? '⏳ Le technicien détaille…' : d ? '✕ Fermer le détail' : '📖 Détail pas à pas'}</button>${i < items.length - 1 ? '<button class="btn sm play" data-pfa="next">Continuer ▶</button>' : '<small class="hint">Dernière tâche : clique sur « Fait » en bas quand c’est bon.</small>'}</div>${d ? `<div class="pfdetail reporttxt rich">${proLinks(richText(d))}</div>` : ''}`);
}

const proLinks = (html) => html.replace(/\[([^\]]+)\]\((https:\/\/[^\s)<]+)\)|(https:\/\/[^\s<)]+)/g, (_, t, u, bare) => `<a href="#" class="plink" data-url="${u ?? bare}">${t ?? bare}</a>`);
// Re-dessin du ticket sans faire bouger la page (on garde la position de chaque zone qui défile)
function renderProTicket(jump = true) {
  const keep = []; for (let p = $('proTicket').parentElement; p; p = p.parentElement) if (p.scrollTop) keep.push([p, p.scrollTop]);
  const h = $('proTicket').offsetHeight; $('proTicket').style.minHeight = `${h}px`;
  proTicketDraw(jump);
  $('proTicket').style.minHeight = ''; keep.forEach(([p, t]) => { p.scrollTop = t; });
}
function proTicketDraw(jump) {
  const prev = $('proLog')?.scrollTop;
  const s = pro, last = s && s.step >= PRO_STEPS.length - 1, nx = s && PRO_STEPS[s.step + 1], opt = (i) => [2, 3, 4].includes(i);
  if (!s || s.closed) {
    $('proTicket').innerHTML = s?.done && moreUi ? moreUi.proEnd(s) : `<div class="emb bot" style="--ec:#619fff"><div class="emba"><img src="logo.png" alt="">🚀 Opti Pro · Étape 1/7 · 🎫 Ton setup</div><h4>Ouvre ton ticket</h4><p class="hint">Processeur, carte mère, BIOS, RAM, carte graphique et températures sont envoyés tout seuls. Le technicien IA répond tout de suite, à chaque étape, et l’équipe peut intervenir.</p><label class="embl">Tes jeux et ce que tu veux<textarea id="proNeed" rows="3" placeholder="Ex : Fortnite en 1080p 240 Hz, j’ai des chutes de FPS…"></textarea></label><label class="embl">Refroidissement et alimentation<input id="proCool" placeholder="Ex : watercooling 240 mm, alim 750 W"></label><div class="row"><button class="btn play" data-pa="open">🚀 Ouvrir mon ticket</button><small class="hint">Aussi sur Discord : <b>/launcher opti</b> (même ticket)</small></div></div>`;
    return;
  }
  const plan = s.todo?.length ? `<details class="emb proplan" ${proPlanOpen ? 'open' : ''}><summary><b>🎯 Ton plan Opti Pro</b><span class="hint">fait pour ton PC et ta demande · ${s.todo.length} points</span></summary><ul>${s.todo.map((x) => `<li><span>${x.icon}</span><div><b>${esc(x.label)}</b><small>${esc(x.why)}</small></div>${x.auto && PRO_DO[x.auto] ? `<button class="btn sm play" data-do="${x.auto}">⚡ Le faire pour moi</button>` : x.optin ? (s.ocOptIn ? '<em class="ok">✅ Accepté</em>' : '<button class="btn sm danger" data-pa="oc">🔥 Je veux overclocker</button>') : `<em>${x.buy ? 'Achat conseillé' : 'Guidé'}</em>`}</li>`).join('')}</ul></details>` : '';
  $('proTicket').innerHTML = `${moreUi?.proBar(s) ?? ''}${plan}<div class="embs" id="proLog">${s.log.map((m, k) => proEmbed(m, k)).join('')}${proBusy ? '<div class="emb bot typing" style="--ec:#619fff"><div class="emba"><img src="logo.png" alt="">Le technicien écrit…</div><div class="gbar indet"><i></i></div></div>' : ''}</div>
    <div class="emb human" id="proHuman" style="--ec:#5865f2" ${proHuman ? '' : 'hidden'}><div class="emba"><img src="logo.png" alt="">👤 Parler à un humain</div><p>L’équipe Opti Pro répond <b>sur Discord</b>, pas dans le support de l’appli. Rejoins le serveur History, va dans le salon <b>#🚀・opti-pro</b> : ton ticket y est dans ton fil privé${s.thread ? '' : ' (lie ton compte Discord dans Paramètres › Compte, puis tape <b>/launcher opti</b>)'}. Clique sur <b>👤 Parler à un humain</b> dans le fil : un membre de l’équipe arrive.</p><div class="row"><button class="btn play" data-pa="discordgo">🎮 Ouvrir Discord</button></div></div>
    <div class="row probtns"><button class="btn play" data-pa="${last ? 'done' : 'next'}" ${proBusy ? 'disabled' : ''}>${last ? '🚀 Terminé' : `✅ Fait · ${nx[0]} ${nx[1]}`}</button>${s.todo?.some((x) => PRO_DO[x.auto]) ? '<button class="btn ghost" data-pexp="1" title="Seulement ce que le launcher fait tout seul">⚡ Express</button>' : ''}<button class="btn ghost" data-pa="ask">💬 Écrire au technicien</button><button class="btn ghost" data-pa="discord">👤 Parler à un humain</button><button class="btn ghost" data-pa="close">🔒 Fermer</button></div>
    ${s.links?.length ? `<div class="row prolinks">${s.links.map(([l, u]) => `<button class="btn sm ghost" data-url="${esc(u)}">${esc(l)} ↗</button>`).join('')}</div>` : ''}
    ${s.thread ? '<small class="hint">💬 Le même ticket est sur Discord dans ton fil privé #opti-pro.</small>' : ''}`;
  proFocusUi(); const log = $('proLog'), on = log.querySelector('.emb.focus li.on'); // défile seulement dans le ticket, jamais toute la page
  log.scrollTop = !jump && prev != null ? prev : on ? log.scrollTop + on.getBoundingClientRect().top - log.getBoundingClientRect().top - 60 : log.scrollHeight;
}
async function renderPro(refresh = true) {
  if (refresh) { const r = await api.proSession?.().catch(() => null); if (r && !r.error) { if (proSeen && JSON.stringify(r.session) === proSeen) return; pro = r.session; } }
  proSeen = JSON.stringify(pro);
  const step = pro && !pro.closed ? pro.step : pro?.done ? 7 : 0;
  $('proBar').style.width = `${Math.round((100 * step) / PRO_STEPS.length)}%`;
  $('proProg').textContent = pro?.done ? 'Ton PC est prêt 🚀' : pro && !pro.closed ? `Étape ${step + 1} / 7 · ${PRO_STEPS[step][1]}` : 'Ouvre ton ticket pour commencer';
  // Une étape s'ouvre seulement quand la précédente est terminée (ou passée avec le bouton « Passer »)
  const open = pro && !pro.closed, lock = (i) => (pro?.done ? false : i > step || (!open && i > 0));
  $('proSteps').innerHTML = PRO_STEPS.map(([ic, t, d, tools], i) => `<li class="${i < step ? 'done' : i === step && open ? 'now' : lock(i) ? 'locked' : ''}"><span class="pron">${i < step ? '✓' : lock(i) ? '🔒' : i + 1}</span><div><b>${ic} ${t}</b><small>${lock(i) ? `🔒 Termine d’abord l’étape ${i} (${PRO_STEPS[i - 1][1]}).` : d}</small>${tools ? `<div class="row">${tools.map(([k, l]) => `<button class="btn sm${k === 'final' ? ' play' : ''}" data-pt="${k}" ${lock(i) ? 'disabled' : ''}>${l}</button>`).join('')}</div>` : ''}</div></li>`).join('');
  renderProTicket(!refresh || !$('proLog'));
  clearInterval(proPoll);
  if (pro && !pro.closed) proPoll = setInterval(() => { if ($('view-optimisation').offsetParent && !proBusy && !document.getElementById('proAskDlg')?.open) renderPro(); }, 10000);
  if ($('proPc').dataset.done) return;
  const p = await api.proGet?.().catch(() => null); if (!p) return;
  $('proPc').dataset.done = '1';
  const oc = { oui: ['ok', 'Overclockable'], limité: ['warn', 'Overclocking limité'], non: ['bad', 'Non débloqué : gains via le BIOS'] }[p.plan.cpuOc];
  $('proPc').innerHTML = `<div><b>🧠 ${esc(p.cpu || 'Processeur')}</b><em class="${oc[0]}">${oc[1]}</em><ul>${p.plan.cpuHow.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b>🧩 RAM ${p.ramGb} Go${p.plan.ramType ? ` ${p.plan.ramType}` : ''}${p.plan.ramNow ? ` · ${p.plan.ramNow} MHz` : ''}</b><em class="${p.plan.ramLimited ? 'warn' : 'ok'}">${p.plan.ramLimited ? 'Optimisée via le BIOS' : 'Gain possible'}</em><ul>${p.plan.ramHow.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>Déjà à sa vitesse maximale : on resserre les timings</li>'}</ul></div><small class="hint">Carte mère : ${esc(p.board || 'inconnue')} · le BIOS n’est jamais modifié par l’appli : le technicien te guide.</small>`;
}
async function proAction(action, text = '', imgs = []) {
  if (proBusy) return;
  if (action !== 'open' && pro) { proBusy = true; if (action === 'msg') pro.log.push({ who: 'user', text: `${text}${imgs.length ? ` 📷 ${imgs.length} capture(s) jointe(s)` : ''}`, step: pro.step }); renderProTicket(); }
  const r = action === 'open' ? (proBusy = true, $('proTicket').querySelector('[data-pa=open]').textContent = '⏳ Le technicien lit ton PC…', await api.proStart({ need: $('proNeed').value, cooling: $('proCool').value }).catch(() => null)) : await api.proAct(action, text, imgs).catch(() => null);
  proBusy = false;
  if (r?.error === 'premium') { renderProTicket(); return openPremium('opti'); }
  if (!r || r.error) { toast(r?.error === 'login' ? 'Connecte-toi à ton compte History (Paramètres › Compte).' : r?.error ?? 'Serveur injoignable. Réessaie.'); return renderPro(); }
  pro = r.session; renderPro(false);
}
$('proTicket').addEventListener('click', async (e) => {
  const dob = e.target.closest('[data-do]'); if (dob) return PRO_DO[dob.dataset.do] && proDo(dob.dataset.do, dob);
  const exp = e.target.closest('[data-pexp]'); if (exp) return proExpress(exp);
  const f = e.target.closest('[data-pfa]'), li = e.target.closest('.emb.focus [data-pf]:not(.on)');
  const m = (f ?? li)?.closest('.emb'), k = m?.dataset.k, i = proFocus[k] ?? 0;
  if (li) { proFocus[k] = Number(li.dataset.pf); return renderProTicket(); }
  if (f?.dataset.pfa === 'next') { proFocus[k] = i + 1; return renderProTicket(); }
  if (f?.dataset.pfa === 'detail') {
    const key = `${k}:${i}`; if (proDetail[key]) { delete proDetail[key]; return renderProTicket(); }
    proDetail[key] = 0; renderProTicket();
    const c = m.querySelectorAll(':scope > .reporttxt > ul > li, :scope > .reporttxt > p')[i].cloneNode(true); c.querySelectorAll('.pfbtns, .pfdetail').forEach((x) => x.remove());
    const r = await api.proAct('detail', c.textContent.trim()).catch(() => null);
    proDetail[key] = r?.detail ?? r?.error ?? 'Détail indisponible, réessaie.'; return renderProTicket();
  }
  const l = e.target.closest('[data-url]'); if (l) { e.preventDefault(); return api.proOpen?.(l.dataset.url); } const b = e.target.closest('[data-pa]'); if (!b) return; if (b.dataset.pa === 'discord') { proHuman = !proHuman; $('proHuman').hidden = !proHuman; return $('proHuman').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } if (b.dataset.pa === 'discordgo') return api.discordInvite?.(); if (b.dataset.pa === 'ask') return proAsk(); if (b.dataset.pa === 'oc') { if (!(await ui.confirm({ title: '⚠️ Overclocking du processeur', text: 'À lire avant de continuer. Tu restes libre : sans overclocking, on va quand même chercher des gains sûrs dans le BIOS.', list: String(pro?.ocWarning ?? '').split('\n').map((l) => l.replace(/^- /, '')), ok: '🔥 J’ai compris, je veux overclocker', icon: '🔥' }))) return; }  proAction(b.dataset.pa); });
// Actions que le technicien IA propose de faire à ta place (toujours avec une validation avant)
const PRO_DO = {
  optimiser: ['Optimisation complète de Windows et de tes jeux', () => optiFinal()],
  alimentation: ['Plan d’alimentation Performances optimales', () => api.optiSysApply([{ id: 'power', on: true }])],
  nettoyage: ['Nettoyage profond de Windows', () => api.optiDeep()],
  reparer: ['Réparation de Windows (DISM + SFC)', () => api.optiRepair()],
  disques: ['TRIM des SSD et défragmentation des disques durs', () => api.optiStorage()],
  pilotes_anciens: ['Suppression des anciens pilotes graphiques', () => api.careDrivers()],
  pilote_gpu: ['Téléchargement du dernier pilote de ta carte graphique', () => api.driverOpen('download')],
  usb: ['Téléchargement de l’outil Microsoft pour la clé USB', () => api.proUsb()],
  mesure: ['Mini-benchmark (≈ 10 s)', () => api.benchQuick()]
};
async function proDo(id, b) {
  const [label, run] = PRO_DO[id];
  if (id !== 'optimiser' && !(await ui.confirm({ title: 'Le technicien s’en occupe ?', text: `${label}. Windows peut demander l’autorisation administrateur ; un point de restauration est créé avant les réglages système.`, ok: '⚡ Le faire', icon: '⚡' }))) return;
  b.disabled = true; b.textContent = '⏳ En cours…';
  const r = await Promise.resolve(run()).catch((err) => ({ error: err.message }));
  const ok = r !== false && !r?.error && r?.ok !== false;
  b.textContent = ok ? '✅ Fait' : '⚠️ Pas fait'; toast(ok ? `✅ ${label} : fait` : `${label} : ${r?.error ?? 'refusé ou interrompu'}`);
  if (ok && id !== 'optimiser') proAction('msg', `✅ Fait automatiquement par le launcher : ${label}${r?.total ? ` (${r.total} points)` : ''}.`);
}
// Opti Pro express (≈ 15 min) : toutes les actions automatiques du plan, une seule validation
async function proExpress(b) {
  const ids = [...new Set((pro?.todo ?? []).map((x) => x.auto).filter((id) => PRO_DO[id] && !['usb', 'pilote_gpu', 'mesure'].includes(id)))];
  if (!ids.length || !(await ui.confirm({ title: '⚡ Opti Pro express', text: 'Le launcher fait tout seul ce qui est automatique dans ton plan. Un point de restauration est créé avant les réglages système ; Windows peut demander l’autorisation administrateur.', list: ids.map((id) => PRO_DO[id][0]), ok: '⚡ Tout faire', icon: '⚡' }))) return;
  b.disabled = true; const done = [];
  for (const id of ids) { b.textContent = `⏳ ${PRO_DO[id][0]}…`; const r = await Promise.resolve(PRO_DO[id][1]()).catch((err) => ({ error: err.message })); if (r !== false && !r?.error && r?.ok !== false) done.push(PRO_DO[id][0]); }
  b.disabled = false; b.textContent = '⚡ Express';
  toast(`⚡ Express : ${done.length} / ${ids.length} fait${done.length > 1 ? 's' : ''}`);
  if (done.length) proAction('msg', `⚡ Opti Pro express fait automatiquement par le launcher : ${done.join(', ')}.`);
}
$('proTicket').addEventListener('toggle', (e) => { if (e.target.classList?.contains('proplan')) proPlanOpen = e.target.open; }, true);
// Question au technicien : dans une fenêtre à part pour garder la page concentrée sur l'étape
const proShots = [];
// Capture réduite en JPEG (1600 px max) : rapide à envoyer, assez nette pour lire un BIOS
const proShrink = (file) => new Promise((ok) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = () => ok(null); const r = new FileReader(); r.onload = () => { img.src = r.result; }; r.onerror = () => ok(null); r.readAsDataURL(file); });
async function proAddShots(files) {
  for (const f of [...files].filter((x) => /^image\//.test(x.type)).slice(0, 3 - proShots.length)) { const u = await proShrink(f); if (u) proShots.push(u); }
  $('proShots').innerHTML = proShots.map((u, i) => `<span><img src="${u}" alt=""><button type="button" data-rm="${i}" title="Retirer">✕</button></span>`).join('') + (proShots.length < 3 ? '<label class="btn sm ghost">📷 Ajouter une capture<input type="file" accept="image/*" multiple hidden></label>' : '');
}
// Question au technicien : dans une fenêtre à part pour garder la page concentrée sur l'étape
function proAsk() {
  let d = document.getElementById('proAskDlg');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'proAskDlg';
    d.innerHTML = '<form class="dlg proask" method="dialog"><h2>💬 Écrire au technicien</h2><p class="hint">Une question, un souci, une valeur à vérifier. Ajoute des captures ou des photos (écran du BIOS, message d’erreur…) : le technicien les regarde pour mieux t’aider. Tu peux aussi coller une image avec Ctrl+V.</p><textarea id="proMsg" rows="5" maxlength="1500" placeholder="Ex : je ne trouve pas PBO dans mon BIOS, voilà l’écran…"></textarea><div class="proshots" id="proShots"></div><div class="row end"><button class="btn ghost" value="no">Annuler</button><button class="btn play" value="ok">Envoyer</button></div></form>';
    document.body.append(d);
    d.addEventListener('change', (e) => { if (e.target.type === 'file') proAddShots(e.target.files); });
    d.addEventListener('click', (e) => { const r = e.target.closest('[data-rm]'); if (r) { proShots.splice(Number(r.dataset.rm), 1); proAddShots([]); } });
    d.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); proAddShots(f); } });
    d.addEventListener('close', () => { const v = $('proMsg').value.trim(), imgs = proShots.splice(0); if (d.returnValue === 'ok' && (v || imgs.length)) { $('proMsg').value = ''; proAction('msg', v, imgs); } });
  }
  proAddShots([]); d.showModal(); $('proMsg').focus();
}
$('proSteps').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pt]'); if (!b) return; const k = b.dataset.pt;
  if (['bios', 'occt', 'nvidia', 'amd'].includes(k)) return api.proLink?.(k);
  if (k === 'final') return optiFinal();
  const label = b.textContent; b.disabled = true;
  if (k === 'usb') { b.textContent = '⏳ Téléchargement de l’outil Microsoft…'; const r = await api.proUsb?.().catch(() => null); toast(r?.ok ? '✅ Outil Microsoft téléchargé et ouvert : branche ta clé USB et suis-le.' : r?.error ?? 'Téléchargement impossible.'); }
  if (k === 'bench') { b.textContent = '⏳ Mesure (≈ 10 s)…'; const t = await api.benchQuick?.().catch(() => null); if (t?.total && pro && !pro.closed) await proAction('msg', `🏁 Mini-benchmark History : ${t.total} points (processeur 1 cœur ${t.cpu1}, tous les cœurs ${t.cpuN}, mémoire ${t.ram}).`); else toast(t?.total ? `🏁 ${t.total} points` : 'Mesure impossible.'); }
  b.disabled = false; b.textContent = label;
});
// Optimisation finale en 1 clic : analyse, puis TOUT est proposé dans une seule fenêtre de validation (annulable)
async function optiFinal() {
  if (!(await premOk('opti'))) return openPremium('opti');
  document.querySelector('#optTabs [data-ot=rapide]').click();
  if (!opti) await optiScanUi();
  if (!opti) return;
  state.sys = await api.optiSys().catch(() => state.sys ?? []);
  const laptop = (await api.proGet?.().catch(() => null))?.laptop;
  const sys = (state.sys ?? []).filter((t) => !t.on && !t.retired && t.id !== 'hibernate' && !(laptop && t.id === 'power')).map((t) => ({ id: t.id, on: true }));
  await runOpti({ games: (opti.games ?? []).map((a) => a.id), junk: opti.junk.map((x) => x.id), orphans: opti.orphans.map((x) => x.id), recycle: opti.recycle > 0, tweaks: opti.tweaks.filter((t) => !t.on && !t.retired).map((t) => t.id) }, sys);
}
// 🩺 Entretien : état SMART des disques, anciens pilotes graphiques
async function renderCare() {
  const r = await api.care?.(); if (!r) return;
  const H = { Healthy: ['💚', 'En bonne santé'], Warning: ['🟠', 'Commence à faiblir : sauvegarde tes fichiers'], Unhealthy: ['🔴', 'En mauvais état : sauvegarde tout et remplace-le'] };
  $('careDisks').innerHTML = r.disks.map((d) => { const h = H[d.health] ?? ['⚪', 'État inconnu']; return `<div class="uprow"><b>${h[0]} ${esc(d.name ?? 'Disque')}</b><span>${esc(d.media ?? '')} · ${size(d.size)}</span><small>${h[1]}</small></div>`; }).join('') || '<p class="hint">Lance l’analyse de Mon PC pour lire l’état des disques.</p>';
  $('careDrv').innerHTML = r.drivers.count ? `<p><b>${r.drivers.count} ancien(s) pilote(s)</b> · ${size(r.drivers.bytes)} récupérables</p>` : '<p class="hint">✅ Aucun ancien pilote graphique en trop.</p>';
  $('careDrvGo').hidden = !r.drivers.count;
}
$('careDrvGo').addEventListener('click', async () => {
  if (!(await ui.confirm({ title: 'Nettoyer les anciens pilotes ?', text: 'Windows va demander l’autorisation administrateur. Un point de restauration est créé avant, et le pilote utilisé n’est jamais touché.', ok: 'Nettoyer' }))) return;
  const r = await api.careDrivers?.(); if (r?.error) { toast(r.error); return openPremium('opti'); }
  toast(r?.ok ? `🧹 ${r.removed} ancien(s) pilote(s) retiré(s)` : 'Nettoyage arrêté'); renderCare();
});
$('pcDriver').addEventListener('click', (e) => { const b = e.target.closest('[data-drv]'); if (b) api.driverOpen(b.dataset.drv); });
$('pcTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pctab]'); if (b) { window.sfx?.play('nav'); pcTab(b.dataset.pctab); } });
document.querySelector('#view-pc').addEventListener('click', (e) => { const b = e.target.closest('[data-gotab]'); if (b) pcTab(b.dataset.gotab); });

// ---------- Analyse pro ----------
const dur = (ms) => { const m = Math.round(ms / 60_000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m >= 1 ? `${m} min` : `${Math.max(1, Math.round(ms / 1000))} s`; };
const num = (n) => Number(n ?? 0).toLocaleString('fr-FR');
function showScanLast(l) {
  $('scanLast').textContent = l ? `Dernière analyse le ${new Date(l.at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} : ${num(l.files)} fichiers lus en ${dur(l.elapsed)}, note ${l.score}/100.` : 'Jamais lancée sur ce PC.';
}
api.onScan?.((p) => {
  if (p.phase === 'done') { $('scanLive').hidden = true; return; }
  $('scanLive').hidden = false;
  const stepN = { prep: 1, walk: 1, hash: 2, suspects: 3, events: 4 }[p.phase] ?? 1;
  const steps = ['Lecture de chaque fichier', 'Doublons (empreinte SHA-256)', 'Fichiers louches (signature + antivirus)', 'Journal de Windows'];
  const pct = p.phase === 'hash' && p.total ? (100 * p.bytes) / p.total : p.phase === 'suspects' && p.total ? (100 * p.index) / p.total : null;
  $('scanLive').innerHTML = `<div class="oprog"><b>Étape ${stepN}/4 · ${steps[stepN - 1]}</b>
    <div class="gbar big ${pct == null ? 'indet' : ''}"><i style="width:${pct ?? 30}%"></i></div>
    <div class="scanstats">${p.phase === 'walk' ? `<div><b>${num(p.files)}</b><small>fichiers lus</small></div><div><b>${num(p.dirs)}</b><small>dossiers</small></div><div><b>${gb(p.bytes)}</b><small>parcourus</small></div>` : ''}${p.phase === 'hash' ? `<div><b>${num(p.files)}</b><small>fichiers comparés</small></div><div><b>${gb(p.bytes)} / ${gb(p.total)}</b><small>lus en entier</small></div>` : ''}${p.elapsed ? `<div><b>${dur(p.elapsed)}</b><small>écoulé</small></div>` : ''}${p.eta != null ? `<div><b>≈ ${dur(p.eta * 1000)}</b><small>restant</small></div>` : ''}</div>
    <small class="hint scanpath">${esc(p.label ?? p.current ?? '')}</small></div>`;
});
function renderScan(r) {
  const cats = r.cats.sort((a, b) => b.bytes - a.bytes);
  const max = Math.max(1, ...cats.map((c) => c.bytes));
  const ev = r.events;
  $('scanOut').innerHTML = `
    <div class="scansum">
      <div><b>${r.score}/100</b><small>note fichiers et stockage</small></div>
      <div><b>${num(r.files)}</b><small>fichiers lus un par un</small></div>
      <div><b>${gb(r.bytes)}</b><small>analysés en ${dur(r.elapsed)}</small></div>
      <div><b>${gb(r.junkBytes)}</b><small>inutiles</small></div>
      <div><b>${gb(r.dupWasted)}</b><small>en doublons</small></div>
      <div class="${r.threats ? 'bad' : ''}"><b>${r.threats}</b><small>menace${r.threats > 1 ? 's' : ''} confirmée${r.threats > 1 ? 's' : ''}</small></div>
    </div>
    <div class="pcgrid">
      <div class="panel"><h3>📊 Ce qui occupe tes disques</h3><div class="catbars">${cats.map((c) => `<div class="bbar"><span>${c.icon} ${esc(c.label)}</span><div class="t"><i style="width:${(100 * c.bytes) / max}%"></i></div><b>${gb(c.bytes)}</b></div>`).join('')}</div></div>
      <div class="panel"><h3>🗑 Fichiers inutiles <small class="hint">cochés = supprimés</small></h3>${r.junk.length ? `<div class="checks">${r.junk.map((j) => `<label class="check"><input type="checkbox" data-junk="${esc(j.id)}" checked><span>${j.icon} ${esc(j.label)} <small class="hint">· ${num(j.files)} fichiers</small></span><em>${gb(j.bytes)}</em></label>`).join('')}</div><div class="row"><button class="btn play" id="scanClean" type="button">Nettoyer la sélection</button></div><small class="hint">Les installateurs vont à la corbeille (récupérables), le reste se recrée tout seul.</small>` : '<p class="hint">Aucun fichier inutile trouvé 👌</p>'}</div>
    </div>
    <div class="panel"><h3>⚠ Fichiers louches <small class="hint">non signés, vérifiés un par un par l’antivirus de Windows</small></h3>${r.suspects.length ? `<div class="flist">${r.suspects.map((x) => `<div class="${x.defender === 'menace' ? 'bad' : ''}"><div><b>${esc(x.path.split(/[\\/]/).pop())}</b> ${x.defender === 'menace' ? '<span class="bad">● menace confirmée</span>' : x.defender === 'propre' ? '<span class="ok">● antivirus : rien trouvé</span>' : ''}<small>${esc(x.reason)} · ${esc(x.path)}</small></div><button class="btn ghost sm" data-show="${esc(x.path)}">Voir</button><button class="btn ghost sm" data-trash="${esc(x.path)}">Corbeille</button></div>`).join('')}</div>` : '<p class="hint">Aucun fichier louche 👍</p>'}</div>
    <div class="panel"><h3>👯 Doublons <small class="hint">contenu identique octet par octet (SHA-256)</small></h3>${r.duplicates.length ? `<div class="flist">${r.duplicates.slice(0, 30).map((d) => `<div class="dup"><div><b>${esc(d.paths[0].split(/[\\/]/).pop())}</b> <small class="hint">${d.paths.length} copies · ${gb(d.size)} chacune</small>${d.paths.map((p, i) => `<small>${i ? `<button class="linkbtn" data-trash="${esc(p)}">corbeille</button> ` : '<em class="ok">gardé</em> '}${esc(p)}</small>`).join('')}</div></div>`).join('')}</div>` : '<p class="hint">Aucun doublon de plus de 1 Mo dans tes dossiers 👍</p>'}</div>
    <div class="pcgrid">
      <div class="panel"><h3>🐘 Plus gros fichiers</h3><div class="flist">${r.largest.slice(0, 12).map((x) => `<div><div><b>${esc(x.path.split(/[\\/]/).pop())}</b><small>${esc(x.path)}</small></div><em>${gb(x.size)}</em><button class="btn ghost sm" data-show="${esc(x.path)}">Voir</button></div>`).join('') || '<p class="hint">—</p>'}</div>${r.old.files ? `<p class="hint">Et ${num(r.old.files)} gros fichiers pas modifiés depuis 2 ans (${gb(r.old.bytes)}).</p>` : ''}</div>
      <div class="panel"><h3>🧾 Stabilité de Windows <small class="hint">7 derniers jours</small></h3>${ev ? `<div class="evgrid"><div class="${ev.bsod ? 'bad' : ''}"><b>${ev.bsod}</b><small>écrans bleus</small></div><div class="${ev.power ? 'warn' : ''}"><b>${ev.power}</b><small>arrêts brutaux</small></div><div class="${ev.whea ? 'bad' : ''}"><b>${ev.whea}</b><small>erreurs matérielles</small></div><div class="${ev.disk ? 'bad' : ''}"><b>${ev.disk}</b><small>erreurs disque</small></div><div class="${ev.gpu ? 'warn' : ''}"><b>${ev.gpu}</b><small>plantages pilote graphique</small></div></div>${ev.findings.map((f) => `<div class="adv p${f.prio}"><div><b>${esc(f.title)}</b><small>${esc(f.text)}</small></div></div>`).join('')}` : '<p class="hint">Journal de Windows illisible sur ce PC.</p>'}</div>
    </div>
    <small class="hint">${num(r.denied)} éléments protégés par Windows n’ont pas pu être lus (normal sans droits administrateur).</small>`;
}
// Choix des disques à analyser : tous cochés au départ, on garde le dernier choix
async function renderScanDrives() {
  const list = await api.scanDrives?.().catch(() => null);
  if (!list?.length) { $('scanDrives').innerHTML = ''; return; }
  let keep = null;
  try { keep = JSON.parse(localStorage.getItem('scanDrives') ?? 'null'); } catch { /* rien de gardé */ }
  $('scanDrives').innerHTML = `<b class="sub">Disques à analyser</b><div class="drivechips">${list.map((d) => `<label class="drivechip"><input type="checkbox" value="${esc(d.letter)}" ${!keep || keep.includes(d.letter) ? 'checked' : ''}><span>💽 ${esc(d.letter)}:${d.system ? ' <small>(Windows)</small>' : ''}<small>${gb(d.used)} utilisés sur ${gb(d.size)}</small></span></label>`).join('')}</div>`;
}
const scanLetters = () => [...document.querySelectorAll('#scanDrives input:checked')].map((i) => i.value);
$('scanDrives').addEventListener('change', () => { try { localStorage.setItem('scanDrives', JSON.stringify(scanLetters())); } catch { /* pas grave */ } });
$('scanBtn').addEventListener('click', async () => {
  const letters = scanLetters();
  if (document.querySelector('#scanDrives input') && !letters.length) return toast('Coche au moins un disque');
  const which = letters.length ? `${letters.map((l) => `${l}:`).join(' et ')}` : 'chaque disque';
  if (!(await ui.confirm({ title: 'Lancer l’analyse pro ?', text: `Chaque fichier de ${letters.length === 1 ? `ton disque ${which}` : letters.length ? `tes disques ${which}` : 'chaque disque'} va être lu. Compte 10 à 30 minutes selon ton nombre de fichiers ; le PC reste utilisable (un peu plus lent pendant la lecture).`, list: ['Lecture de chaque fichier (taille, date, type)', 'Doublons confirmés par empreinte SHA-256', 'Fichiers louches : signature + antivirus de Windows', 'Journal de Windows : écrans bleus, arrêts brutaux, erreurs disque'], ok: '🔬 Lancer', icon: '🔬' }))) return;
  $('scanBtn').disabled = true; $('scanStop').hidden = false; $('scanOut').innerHTML = '';
  const r = await api.scanStart(letters.length ? letters : undefined);
  $('scanBtn').disabled = false; $('scanStop').hidden = true; $('scanLive').hidden = true;
  if (r?.error) return toast(r.error);
  window.sfx?.play('success');
  renderScan(r);
  showScanLast({ at: r.at, files: r.files, elapsed: r.elapsed, score: r.score });
  if (r.health) { state.health = r.health; paintRing('pcRing', r.health.score, r.health.label); refreshHealth(); }
  pcDiag(true);
});
$('scanStop').addEventListener('click', () => api.scanStop());
$('scanOut').addEventListener('click', async (e) => {
  const sh = e.target.closest('[data-show]'); if (sh) return api.scanShow(sh.dataset.show);
  const tr = e.target.closest('[data-trash]');
  if (tr) { const r = await api.scanTrash([tr.dataset.trash]); if (r?.ok) { toast('Mis à la corbeille'); tr.closest('small, .flist > div')?.remove(); } return; }
  if (e.target.id === 'scanClean') {
    const kinds = [...document.querySelectorAll('#scanOut [data-junk]:checked')].map((i) => i.dataset.junk);
    if (!kinds.length) return toast('Rien de coché');
    e.target.disabled = true;
    const r = await api.scanClean(kinds);
    toast(r?.ok ? `🧹 ${num(r.n)} fichiers supprimés · ${gb(r.freed)} libérés` : 'Nettoyage impossible');
    kinds.forEach((k) => document.querySelector(`#scanOut [data-junk="${k}"]`)?.closest('label')?.remove());
    e.target.disabled = false;
    refreshHealth(true);
  }
});

// ---------- Windows Update ----------
let wu = null;
function renderWu() {
  const groups = Object.entries(wu.kinds ?? {}).map(([k, [icon, label]]) => [k, icon, label, wu.updates.filter((u) => u.kind === k)]).filter(([, , , l]) => l.length);
  $('wuOut').innerHTML = `${wu.reboot ? '<div class="adv p0"><div><b>Redémarrage en attente</b><small>Des mises à jour déjà installées attendent un redémarrage pour se terminer.</small></div><button class="btn play" id="wuReboot">Redémarrer</button></div>' : ''}
    ${wu.updates.length ? `<div class="panel"><h3>${wu.updates.length} mise${wu.updates.length > 1 ? 's' : ''} à jour disponible${wu.updates.length > 1 ? 's' : ''} <small class="hint">${gb(wu.updates.reduce((n, u) => n + u.size, 0))} à télécharger au maximum</small></h3>
      ${groups.map(([k, icon, label, l]) => `<b class="sub">${icon} ${esc(label)}</b><div class="checks">${l.map((u) => `<label class="check"><input type="checkbox" data-wu="${esc(u.id)}" ${u.optional ? '' : 'checked'}><span>${esc(u.title)}${u.optional ? ' <small class="opt">facultative</small>' : ''}${u.reboot ? ' <small class="hint">· redémarrage</small>' : ''}</span><em>${u.size ? gb(u.size) : ''}</em></label>`).join('')}</div>`).join('')}
      <div class="row"><button class="btn play big" id="wuInstall" type="button">Installer la sélection</button></div></div>` : '<div class="empty">✅ Windows est à jour.</div>'}
    ${wu.history.length ? `<div class="panel"><h3>🕘 Dernières installations</h3><div class="flist">${wu.history.slice(0, 10).map((h) => `<div><div><b>${esc(h.title)}</b><small>${h.date ? new Date(h.date).toLocaleDateString('fr-FR') : ''}</small></div><em class="${h.result === 'ok' ? 'ok' : 'bad'}">${{ ok: 'installée', echec: 'échec', annule: 'annulée' }[h.result] ?? h.result}</em></div>`).join('')}</div></div>` : ''}`;
  $('wuBadge').textContent = wu.updates.filter((u) => !u.optional).length || '';
}
$('wuSearch').addEventListener('click', async () => {
  $('wuSearch').disabled = true; $('wuSearch').textContent = 'Recherche en cours…';
  $('wuOut').innerHTML = '<div class="oprog"><b>Windows Update cherche les mises à jour…</b><div class="gbar big indet"><i></i></div><small class="hint">La première recherche peut prendre quelques minutes.</small></div>';
  const r = await api.wuSearch();
  $('wuSearch').disabled = false; $('wuSearch').textContent = 'Rechercher à nouveau';
  if (r?.error) { $('wuOut').innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  wu = r;
  $('wuLast').textContent = `Dernière recherche : ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  renderWu();
});
// Tâches longues (réparation, nettoyage profond, disques) : barre avec le vrai %, gardée même si on change de page
state.jobs = {};
const JOB_TXT = { 'dism-scan': 'DISM : vérification de l’image de Windows', 'dism-repair': 'DISM : réparation depuis Windows Update', sfc: 'SFC : contrôle de chaque fichier système' };
const jobHtml = (id) => { const j = state.jobs[id]; return j ? `<div class="jobbar"><div class="gbar big"><i style="width:${j.pct}%"></i></div><small class="hint"><b>${j.pct} %</b> · ${esc(JOB_TXT[j.step] ?? j.step ?? 'Accepte la demande d’autorisation de Windows…')}</small><small class="hint">Tu peux continuer à utiliser ton PC, et même fermer la fenêtre : ça continue en fond et Windows te prévient à la fin.</small></div>` : ''; };
const drawJob = (id) => document.querySelectorAll(`[data-job="${id}"]`).forEach((el) => { el.innerHTML = jobHtml(id); });
api.onJob?.((p) => { if (!state.jobs[p.id] || p.step === 'done') return; state.jobs[p.id] = { pct: Math.min(99, p.pct ?? 0), step: p.step }; drawJob(p.id); });
async function runJob(id, btn, call) {
  state.jobs[id] = { pct: 0, step: null }; drawJob(id); btn.disabled = true;
  const r = await call().catch(() => null);
  delete state.jobs[id]; drawJob(id); btn.disabled = false; document.getElementById(btn.id)?.removeAttribute('disabled'); // bouton redessiné entre-temps
  return r;
}
api.onWu?.((p) => {
  $('wuLive').hidden = p.phase === 'done';
  if (p.phase === 'done') return;
  const pct = ((p.index - (p.phase === 'download' ? 1 : 0.5)) / Math.max(1, p.total)) * 100;
  $('wuLive').innerHTML = `<div class="oprog"><b>${p.phase === 'download' ? 'Téléchargement' : 'Installation'} ${p.index}/${p.total} · ${Math.round(pct)} %</b><div class="gbar big"><i style="width:${pct}%"></i></div><small class="hint">${esc(p.title ?? '')}</small><small class="hint">Tu peux continuer à utiliser ton PC, et même fermer la fenêtre : ça continue en fond.</small></div>`;
});
$('wuOut').addEventListener('click', async (e) => {
  if (e.target.id === 'wuReboot') return api.wuReboot();
  if (e.target.id !== 'wuInstall') return;
  const ids = [...document.querySelectorAll('#wuOut [data-wu]:checked')].map((i) => i.dataset.wu);
  if (!ids.length) return toast('Coche au moins une mise à jour');
  if (!(await ui.confirm({ title: `Installer ${ids.length} mise${ids.length > 1 ? 's' : ''} à jour ?`, text: 'Windows va demander l’autorisation administrateur. Tu peux continuer à utiliser le PC pendant l’installation.', ok: '⬆ Installer', icon: '⬆' }))) return;
  e.target.disabled = true;
  const r = await api.wuInstall(ids);
  $('wuLive').hidden = true;
  if (!r?.ok) { e.target.disabled = false; return toast(r?.error ?? 'Installation impossible'); }
  const ok = r.results.filter((x) => x.ok).length;
  window.sfx?.play(ok ? 'success' : 'error');
  await ui.confirm({ title: ok === r.results.length ? '✅ Mises à jour installées' : 'Installation terminée', text: `${ok} sur ${r.results.length} installée${ok > 1 ? 's' : ''}.${r.reboot ? ' Un redémarrage est nécessaire pour finir.' : ''}`, list: r.results.map((x) => `${x.ok ? '✓' : '✗'} ${x.title}`), ok: 'OK', cancel: 'Fermer', icon: '⬆' });
  if (r.reboot) api.wuReboot();
  $('wuSearch').click();
});

function renderFree() {
  const list = state.free.slice(0, 5);
  $('freeBlock').hidden = !list.length;
  const day = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('freeGames').innerHTML = list.map((g) => `
    <div class="rcard free ${g.now ? 'now' : ''}" data-free="${esc(g.slug)}">
      ${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : ''}
      <span class="badge ${g.now ? 'live' : ''}">${g.now ? 'Gratuit' : 'Bientôt'}</span>
      <div class="meta"><b>${esc(g.name)}</b><small>${g.now ? `Jusqu’au ${day(g.until)}` : `À partir du ${day(g.from)}`}</small></div>
    </div>`).join('');
}

function renderRecos() {
  const list = state.recos;
  $('recoBlock').hidden = !list.length;
  $('recos').innerHTML = list.length ? list.slice(0, 5).map((r, n) => `
    <div class="rcard" data-reco="${n}">
      <img src="${esc(r.art?.header ?? r.art?.hero ?? r.art?.cover ?? '')}" alt="">
      <div class="meta"><b>${esc(r.name)}</b><small>${esc(r.why ?? '')}</small></div>
    </div>`).join('') : '<div class="empty">Les recommandations arrivent dès que l’IA est disponible.</div>';
}

// ---------- Bibliothèque ----------
const TITLES = { bibliotheque: 'Bibliothèque', jeux: 'Jeux', applis: 'Applications', favoris: 'Favoris', caches: '👁 Éléments masqués (clic droit › Afficher)' };
function renderList() {
  const col = state.list.collection && (state.cols[state.list.collection] ?? moreUi?.genreCols()[state.list.collection]);
  // Une collection montre tous ses jeux (même non installés), sauf filtre choisi
  const list = col ? filterSort(state.items.filter((i) => col.items.includes(i.id)), { ...state.list, kind: 'tout', source: 'tout', installed: state.list.installed === 'tout' ? 'tous' : state.list.installed }) : filterSort(state.items, state.list);
  $('listTitle').textContent = col ? `📚 ${col.name}` : state.list.q ? `Résultats pour « ${state.list.q} »` : state.list.source !== 'tout' ? state.sources[state.list.source]?.label ?? 'Plateforme' : TITLES[state.list.kind === 'tout' ? 'bibliotheque' : state.list.kind] ?? 'Bibliothèque';
  $('count').textContent = `${list.length} élément${list.length > 1 ? 's' : ''}`;
  $('grid').innerHTML = list.length ? list.map((i) => card(i, 'gridcard')).join('') : state.list.q ? '' : '<div class="empty">Rien ici.</div>';
  if (state.list.q && !col) storeResults(state.list.q, list);
}
// Recherche : les jeux des magasins Steam et Epic aussi (même non installés, ex. Fortnite)
let storeT = 0;
function storeResults(q, list) {
  clearTimeout(storeT);
  storeT = setTimeout(async () => {
    const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
    const have = new Set(list.map((i) => norm(i.name))); // seulement ceux déjà affichés (un jeu masqué ou filtré reste trouvable)
    const r = (await api.storeSearch?.(q).catch(() => []) ?? []).filter((x) => !have.has(norm(x.name)));
    if (q !== state.list.q || state.view !== 'liste') return;
    $('grid').insertAdjacentHTML('beforeend', r.length ? `<div class="storehead">Dans les magasins</div>${r.map((x) => `<div class="gridcard" data-surl="${esc(x.url)}">${art({ name: x.name, art: { hero: x.img } })}<span class="badge">${x.src === 'epic' ? 'Epic Games' : 'Steam'}</span><div class="meta"><b>${esc(x.name)}</b><small>Voir dans le magasin</small></div></div>`).join('')}` : list.length ? '' : '<div class="empty">Rien trouvé, même dans les magasins.</div>');
  }, 350);
}

// ---------- Statistiques ----------
const CATS = [['jeux', 'Jeux', '#2f8bff'], ['applis', 'Applications', '#22d3ee'], ['musique', 'Musique', '#6d7cff'], ['autres', 'Autres', '#2ee07a']];
async function renderProgress() {
  const p = await api.progress?.().catch(() => null);
  if (!p) return;
  const l = p.level;
  $('progCard').innerHTML = `<div class="lvl"><b>${l.level}</b><small>niveau</small></div>
    <div class="lvlinfo"><b>${esc(state.account?.pseudo ?? state.profile)} · niveau ${l.level}</b><div class="lvlbar"><i style="width:${l.pct}%"></i></div><small class="hint">${hours(p.totalMinutes)} de jeu · encore ${l.hoursToNext} h pour le niveau ${l.level + 1}</small></div>
    <div class="streak"><b>🔥 ${p.streak}</b><small>jour${p.streak > 1 ? 's' : ''} d’affilée</small></div>`;
  const max = Math.max(1, ...p.hourly);
  $('hourly').innerHTML = p.hourly.map((m, h) => `<div class="hb" title="${h} h : ${hours(m)}"><i style="height:${Math.max(2, (100 * m) / max)}%"></i><small>${h % 3 === 0 ? h : ''}</small></div>`).join('');
  $('sessions').innerHTML = p.sessions.length ? p.sessions.map((x) => `<div class="sess" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small>${new Date(x.start).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${hours(Math.max(1, (x.end - x.start) / 60_000))}</small>${x.with?.length || x.shots ? `<em class="sessx">${x.with?.length ? `👥 avec ${esc(x.with.join(', '))}` : ''}${x.with?.length && x.shots ? ' · ' : ''}${x.shots ? `📷 ${x.shots} capture${x.shots > 1 ? 's' : ''}` : ''}</em>` : ''}</div>`).join('') : '<div class="empty">Tes prochaines parties apparaîtront ici.</div>';
  const got = p.badges.filter((b) => b.got).length;
  $('badgeCount').textContent = `${got} / ${p.badges.length} débloqués`;
  $('badges').innerHTML = p.badges.map((b) => `<div class="bdg ${b.got ? 'got' : ''}" title="${esc(b.desc)}"><span>${b.icon}</span><b>${esc(b.title)}</b><small>${esc(b.desc)}</small>${b.got ? '' : `<div class="lvlbar"><i style="width:${b.progress}%"></i></div>`}</div>`).join('');
}
async function renderStats() {
  renderProgress();
  const s = await api.stats(state.period);
  const total = Object.values(s.split).reduce((a, b) => a + b, 0);
  let offset = 0;
  const R = 46;
  const C = 2 * Math.PI * R;
  const arcs = CATS.map(([k, , color]) => {
    const part = total ? s.split[k] / total : 0;
    const arc = `<circle cx="60" cy="60" r="${R}" stroke="${color}" stroke-width="11" stroke-dasharray="${Math.max(0, part * C - 3)} ${C}" stroke-dashoffset="${-offset * C}" transform="rotate(-90 60 60)" stroke-linecap="round"/>`;
    offset += part;
    return part ? arc : '';
  }).join('');
  $('donut').innerHTML = `<circle cx="60" cy="60" r="${R}" stroke="rgba(255,255,255,.06)" stroke-width="11"/>${arcs}<text x="60" y="62" text-anchor="middle">${hours(total)}</text><text class="s" x="60" y="76" text-anchor="middle">Temps total</text>`;
  $('legend').innerHTML = CATS.map(([k, label, color]) => `<div><i style="background:${color}"></i>${label}<span>${total ? Math.round((s.split[k] / total) * 100) : 0} %</span></div>`).join('');
  state.profile = s.profile || state.profile;
  if (!state.account) { $('profileName').textContent = state.profile; $('avatar').textContent = state.profile[0]?.toUpperCase() ?? '?'; }
  if (state.view === 'stats') {
    const max = Math.max(1, ...s.top.map((t) => t.minutes));
    $('statsBig').innerHTML = s.top.map((t) => `<div class="bar"><b>${esc(t.name)}</b><i style="width:${Math.max(2, (t.minutes / max) * 100)}%"></i><span>${hours(t.minutes)}</span></div>`).join('') || '<div class="empty">Pas encore de temps enregistré.</div>';
  }
}

// ---------- Classement ----------
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
async function renderRanking() {
  if (state.rank === 'amis') return renderFriendRanking();
  let list = games().filter((i) => i.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  let minutesOf = (i) => i.minutes;
  if (state.rank !== 'tout') {
    const s = await api.stats('semaine');
    const recent = s.twoWeeks ?? {};
    minutesOf = (i) => recent[i.id] ?? 0;
    list = games().filter((i) => minutesOf(i) > 0).sort((a, b) => minutesOf(b) - minutesOf(a));
  }
  if (!list.length) {
    $('podium').innerHTML = '';
    $('ranklist').innerHTML = `<div class="empty">${state.rank === 'tout' ? 'Pas encore de temps de jeu.' : 'Aucun jeu lancé ces 2 dernières semaines sur ce compte.'}</div>`;
    return;
  }
  const pod = (i, n) => i ? `<div class="pod ${['', 'first', 'second', 'third'][n]}" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}"><span class="medal">${MEDALS[n]}</span>${art(i)}<div class="meta"><b>${esc(i.name)}</b><small>${CLOCK}${hours(minutesOf(i))}</small></div></div>` : '<div></div>';
  $('podium').innerHTML = pod(list[1], 2) + pod(list[0], 1) + pod(list[2], 3);
  const max = minutesOf(list[0]) || 1;
  $('ranklist').innerHTML = list.slice(3, 30).map((i, n) => {
    const src = state.sources[i.source];
    return `<div class="rrow" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}"><span class="n">${n + 4}</span><div class="thumb">${art(i)}</div>
      <div><b>${esc(i.name)}</b><small>${esc(src?.label ?? 'PC')} · ${ago(i.lastPlayed)}</small></div>
      <div class="barw"><i style="width:${Math.max(2, (minutesOf(i) / max) * 100)}%"></i></div><span class="t">${hours(minutesOf(i))}</span></div>`;
  }).join('');
}

// Classement entre amis History : temps de jeu des 7 derniers jours (toi compris)
async function renderFriendRanking() {
  const r = await api.hFriends?.().catch(() => null);
  $('podium').innerHTML = '';
  if (!r || r.status === 401) { $('ranklist').innerHTML = needLogin; return; }
  if (r.error) { $('ranklist').innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  const people = [{ pseudo: state.account?.pseudo ? `${state.account.pseudo} (toi)` : 'Toi', week: r.moi.week, top: r.moi.top, me: true }, ...r.amis].sort((a, b) => b.week - a.week);
  if (people.length < 2) { $('ranklist').innerHTML = '<div class="empty">Ajoute des amis dans Amis › History pour vous comparer chaque semaine.</div>'; return; }
  const max = people[0].week || 1;
  $('ranklist').innerHTML = people.map((p, n) => `<div class="rrow ${p.me ? 'me' : ''}" style="--c:${['#ffd34d', '#c9d3e0', '#e39a5b'][n] ?? '#2f8bff'}"><span class="n">${n < 3 ? MEDALS[n + 1] : n + 1}</span><div class="thumb"><span class="fav">${esc(p.pseudo[0])}</span></div>
    <div><b>${esc(p.pseudo)}</b><small>${p.top ? `Surtout ${esc(p.top)}` : 'Pas encore joué cette semaine'}</small></div>
    <div class="barw"><i style="width:${Math.max(2, (p.week / max) * 100)}%"></i></div><span class="t">${hours(p.week)}</span></div>`).join('');
}

// ---------- Assistant ----------
function say(text, who = 'bot') {
  const div = Object.assign(document.createElement('div'), { className: `msg ${who === 'me' ? 'me' : who === 'wait' ? 'wait' : ''}` });
  div.textContent = text;
  $('chat').append(div);
  $('chat').scrollTop = $('chat').scrollHeight;
  return div;
}
function renderChips() {
  const top = filterSort(games().filter((i) => i.installed), { sort: 'recents' })[0];
  const notInstalled = games().find((i) => !i.installed);
  const chips = [
    top && ['▶', `Lance ${top.name}`],
    notInstalled && ['⤓', `Installe ${notInstalled.name}`],
    ['🚀', 'Optimise mon PC'],
    ['👥', 'Qui joue parmi mes amis ?'],
    ['💽', 'Combien de place il me reste ?'],
    ['🌡', 'Est-ce que mon PC chauffe ?'],
    ['⚡', 'Active le boost'],
    top && ['📚', `Ajoute ${top.name} à la collection À finir`],
    ['✅', 'Accepte mes demandes d’amis'],
    ['♻', 'Vide la corbeille'],
    ['⏻', 'Désactive Discord au démarrage'],
    ['🎉', 'Organise une soirée demain à 21h'],
    ['🗑', 'Quel jeu je pourrais désinstaller ?'],
    ['⏱', 'Quel est mon jeu le plus joué ?'],
  ].filter(Boolean).slice(0, 3); // 3 idées seulement : la place reste à la conversation
  $('chips').innerHTML = chips.map(([ico, t]) => `<button data-ask="${esc(t)}"><i>${ico}</i>${esc(t)}</button>`).join('');
}
function applyReply(r) {
  if (!r) return;
  say(r.reply || 'D’accord.');
  const views = { jeux: 'jeux', applis: 'applis', favoris: 'favoris', stats: 'stats', classement: 'classement', bibliotheque: 'bibliotheque', accueil: 'accueil', amis: 'amis', pc: 'pc', optimisation: 'optimisation' };
  if (r.action === 'show') { if (r.value === 'parametres') $('openSettings').click(); else go(views[r.value] ?? 'bibliotheque'); }
  if (r.action === 'premium') openPremium(r.value);
  if (r.action === 'optimize') assistantOpti();
  if (r.action === 'deep_clean') go('optimisation');
  if (r.action === 'theme' && r.value) { savedTheme.theme = r.value; themeName = r.value; $('themeSel').value = r.value; if (r.value === 'auto') themeFor(state.sel); else applyTheme(THEMES[r.value]); }
  if (r.action === 'fullscreen') toggleBig(true);
  if (r.action === 'recap') api.recap?.().then(showRecap);
  if (r.action === 'daily_limit') $('dailyLimit').value = String(r.value ?? 0);
  if (r.action === 'sort') { state.list.sort = r.value; $('sort').value = r.value; go('bibliotheque'); }
  if (r.action === 'search') { $('q').value = r.value; $('q').dispatchEvent(new Event('input')); }
  if (r.itemId && !['uninstall'].includes(r.action)) { const it = state.items.find((i) => i.id === r.itemId); if (it) select(it); }
  if (['music', 'volume'].includes(r.action)) setTimeout(refreshMusic, 800);
}
// Assistant « optimise mon PC » : analyse, liste claire de ce qu'il a trouvé, bouton pour tout corriger, puis compte rendu
function sayHtml(html) { const d = say(''); d.innerHTML = html; d.classList.add('rich'); $('chat').scrollTop = $('chat').scrollHeight; return d; }
async function assistantOpti() {
  const wait = say('🔍 Analyse en cours (disque, démarrage, réglages Windows, jeux)…', 'wait');
  const o = await api.optiScan?.().catch(() => null);
  wait.remove();
  if (!o || o.error) return say(`Je n’ai pas pu analyser ton PC${o?.error ? ` : ${o.error}` : ''}.`);
  opti = o; renderOpti?.();
  const f = optiFindings(o);
  if (!f.length) return sayHtml('<b>✅ Ton PC est déjà bien réglé.</b><br>Rien à nettoyer ni à corriger pour l’instant.');
  const fixable = f.filter(([, , , , k]) => ['junk', 'startup', 'tweaks'].includes(k));
  const box = sayHtml(`<b>J’ai trouvé ${f.length} chose${f.length > 1 ? 's' : ''} à améliorer :</b><ul class="aiopti">${f.map(([lvl, ico, t, d]) => `<li class="${lvl}"><i>${ico}</i><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('')}</ul>${fixable.length ? `Je peux corriger <b>${fixable.length}</b> point${fixable.length > 1 ? 's' : ''} tout de suite (réversible).<div class="aiacts"><button type="button" class="btn play sm" data-aifix="1">⚡ Oui, corrige tout</button><button type="button" class="btn sm" data-aisee="1">Voir le détail</button></div>` : '<div class="aiacts"><button type="button" class="btn sm" data-aisee="1">Voir le détail</button></div>'}`);
  box.onclick = async (e) => {
    if (e.target.closest('[data-aisee]')) return go('optimisation');
    if (!e.target.closest('[data-aifix]')) return;
    if (!(await premOk('opti'))) return openPremium('opti');
    box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    let startup = 0;
    for (const x of o.startup.filter((y) => y.enabled && y.heavy)) { const r = await api.optiStartup(x.name, false).catch(() => null); if (r?.ok) { opti.startup = r.startup; startup++; } }
    const plan = { games: [], orphans: [], junk: o.junk.filter((x) => !SHADERS.includes(x.id)).map((x) => x.id), recycle: o.recycle > 0, tweaks: o.tweaks.filter((t) => !t.on && !t.optional && !t.retired).map((t) => t.id) };
    const r = (plan.junk.length || plan.tweaks.length || plan.recycle) ? await runOpti(plan) : { done: true, freed: 0, changes: 0 };
    if (!r?.done) return say(startup ? `✅ ${startup} appli(s) lourde(s) retirée(s) du démarrage. Le reste n’a pas été appliqué.` : 'D’accord, je n’ai rien changé.');
    sayHtml(`<b>✅ C’est fait !</b><ul class="aiopti">${r.freed ? `<li class="ok"><i>🗑</i><div><b>${gb(r.freed)} libérés</b><small>fichiers temporaires, caches et corbeille</small></div></li>` : ''}${startup ? `<li class="ok"><i>⏻</i><div><b>${startup} appli(s) retirée(s) du démarrage</b><small>le PC démarre plus vite</small></div></li>` : ''}${r.changes ? `<li class="ok"><i>🎯</i><div><b>${r.changes} réglage(s) Windows appliqué(s)</b><small>réglés pour le jeu</small></div></li>` : ''}</ul>Tout est <b>réversible</b> dans Optimisation › Annuler.`);
  };
}
async function ask(text) {
  if (!text.trim()) return;
  $('chips').hidden = true; // les idées laissent la place à la conversation
  say(text, 'me');
  const wait = say('…', 'wait');
  const r = await api.ask(text).catch((err) => ({ reply: `Erreur : ${err.message}` }));
  wait.remove();
  applyReply(r);
}

// ---------- Musique ----------
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
async function refreshMusic() {
  const m = await api.nowPlaying().catch(() => null);
  state.music = m;
  $('pTitle').textContent = m?.title ?? (m ? `${m.player} en pause` : 'Aucune musique');
  $('pArtist').textContent = m?.artist ?? (m ? 'Appuie sur lecture' : 'Lance Spotify ou Deezer');
  $('pPlay').textContent = m?.playing ? '⏸' : '▶';
  if (m?.cover) { $('pCover').src = m.cover; $('pCover').style.visibility = ''; } else $('pCover').removeAttribute('src');
  $('player').classList.toggle('music', Boolean(m?.playing));
  // Progression : le titre démarre quand on le voit apparaître ; en pause, le compteur s'arrête
  const key = m?.title ? `${m.artist}|${m.title}` : null;
  const now = Date.now();
  if (key && key !== state.song?.key) state.song = { key, start: now, pausedAt: null, duration: m.duration ?? 0 };
  if (state.song) {
    if (!m?.playing && !state.song.pausedAt) state.song.pausedAt = now;
    if (m?.playing && state.song.pausedAt) { state.song.start += now - state.song.pausedAt; state.song.pausedAt = null; }
    if (m?.duration) state.song.duration = m.duration;
  }
  tickProgress();
}
function tickProgress() {
  const sg = state.song;
  if (!sg || !state.music) { $('pNow').textContent = '0:00'; $('pDur').textContent = '0:00'; $('pFill').style.width = '0'; return; }
  const elapsed = Math.min(((sg.pausedAt ?? Date.now()) - sg.start) / 1000, sg.duration || Infinity);
  $('pNow').textContent = mmss(elapsed);
  $('pDur').textContent = sg.duration ? mmss(sg.duration) : '–:––';
  $('pFill').style.width = sg.duration ? `${Math.min(100, (elapsed / sg.duration) * 100)}%` : '0';
}
setInterval(() => { if (!document.hidden) tickProgress(); }, 1000);

// ---------- Navigation ----------
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${name}`));
}
function go(view) {
  if (CROS && (view === 'pc' || view === 'optimisation')) view = 'accueil';
  if (view !== state.view) window.sfx?.play('nav');
  const lists = { bibliotheque: 'tout', jeux: 'jeux', applis: 'applis', favoris: 'favoris' };
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'ia') { openAssistant(true); document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view || (state.view === 'liste' && false))); return; }
  if (view in lists) { state.list.kind = lists[view]; state.list.source = 'tout'; state.list.collection = null; showView('liste'); } else showView(view);
  renderPlatforms();
  if (state.view === 'liste') renderList();
  if (state.view === 'stats') { renderStats(); moreUi?.renderAdv(); }
  if (state.view === 'classement') renderRanking();
  if (state.view === 'amis') showFriendTab(state.ftab);
  if (state.view === 'pc') openPc();
  if (state.view === 'optimisation') openOpti();
  if (state.view === 'premium') loadPremium(true);
  $('main').scrollTop = 0;
}


function select(item) {
  if (!item) return;
  state.sel = item;
  themeFor(item);
  if (state.view !== 'accueil') go('accueil');
  renderHero();
  renderHome();
  $('main').scrollTo({ top: 0, behavior: 'smooth' });
  if (item.kind === 'game' && !item.detailsAsked && api.details) {
    item.detailsAsked = true;
    api.details(item.id).then((d) => { if (d) { item.details = d; if (state.sel?.id === item.id) renderHero(); } }).catch(() => {});
  }
}

function openSheet(i) {
  const d = i.details ?? {};
  const a = i.art ?? {};
  const bg = d.background ?? a.hero ?? a.header ?? a.cover;
  $('sheetBody').innerHTML = `
    <div class="shero" style="background-image:${bg ? url(bg) : 'none'}"></div>
    <h2>${esc(i.name)}</h2>
    ${d.genres?.length ? `<div class="chipsline">${d.genres.map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
    ${d.description ? `<p>${esc(d.description)}</p>` : '<p class="fine">Pas de description disponible.</p>'}
    <p class="fine">${[d.developers?.[0] && `Studio : ${esc(d.developers[0])}`, d.released && `Sortie : ${esc(d.released)}`, d.score && `Metacritic : ${esc(d.score)}`, `Temps : ${hours(i.minutes)}`, `Taille : ${size(i.size)}`].filter(Boolean).join(' · ')}</p>
    ${d.screenshots?.length ? `<div class="shots">${d.screenshots.map((s) => `<img src="${esc(s)}" alt="">`).join('')}</div>` : ''}
    <button type="button" class="btn" data-notebook="${esc(i.id)}">Ouvrir mon carnet ↗</button><div id="sxMore"></div><div id="sxHist"></div><div id="sxTime"></div><div id="sxPatch"></div><div id="sxAch"></div><div id="sxCaps"></div>
    <div class="acts"><button class="btn" data-close="1">Fermer</button></div>`;
  $('sheet').showModal();
  loadSheetExtras(i);
  moreUi?.sheetMore(i);
}

// Fiche : durée pour finir, succès (les plus faciles d'abord), captures d'écran
async function loadSheetExtras(i) {
  api.gameHistory?.(i.id).then((h) => {
    if (!h || !$('sxHist') || !h.total) return;
    const max = Math.max(...h.days.map((d) => d.minutes), 1);
    const W = 560; const H = 90; const bw = W / h.days.length;
    const bars = h.days.map((d, n) => { const bh = d.minutes ? Math.max(3, (d.minutes / max) * (H - 14)) : 2; return `<rect x="${(n * bw + 1.5).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" class="${d.minutes ? 'on' : ''}"><title>${new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : ${d.minutes ? hours(d.minutes) : 'pas joué'}</title></rect>`; }).join('');
    const bestDay = h.best ? new Date(h.best.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    $('sxHist').innerHTML = `<h3>📈 Tes 30 derniers jours</h3>
      <svg class="histo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg>
      <div class="hltb"><div><small>Temps joué</small><b>${hours(h.total)}</b></div><div><small>Jours joués</small><b>${h.daysPlayed} / 30</b></div><div><small>Moyenne par jour joué</small><b>${hours(h.avg)}</b></div></div>
      <p class="fine">${h.best ? `Record : ${hours(h.best.minutes)} le ${bestDay}.` : ''}${h.streak > 1 ? ` 🔥 ${h.streak} jours d’affilée !` : ''}</p>`;
  }).catch(() => {});
  if (i.kind !== 'game') return;
  api.timeToBeat?.(i.id).then((t) => {
    if (!t || !$('sxTime')) return;
    const played = i.minutes / 60;
    const left = t.main ? Math.max(0, t.main - played) : null;
    const pct = t.main ? Math.min(100, (played / t.main) * 100) : 0;
    $('sxTime').innerHTML = `<h3>⏱ Durée pour finir <small class="hint">moyennes HowLongToBeat</small></h3>
      <div class="hltb">${[['Histoire', t.main], ['+ À côtés', t.extra], ['100 %', t.complete]].map(([k, v]) => `<div><small>${k}</small><b>${v ? `${String(v).replace('.', ',')} h` : '—'}</b></div>`).join('')}</div>
      ${t.main ? `<div class="gbar big"><i style="width:${pct}%"></i></div><p class="fine">${left > 0 ? `Il te reste environ ${hours(left * 60)} pour finir l’histoire.` : 'Tu as déjà dépassé la durée moyenne de l’histoire 🎉'}</p>` : ''}`;
  }).catch(() => {});
  api.gameNews?.(i.id).then((list) => {
    const n = list?.find((x) => x.patch) ?? list?.[0];
    if (!n || !$('sxPatch')) return;
    $('sxPatch').innerHTML = `<h3>📰 ${n.patch ? 'Dernière mise à jour' : 'Dernière actu'} <small class="hint">${new Date(n.at).toLocaleDateString('fr-FR')}</small></h3><div class="newscard flat" data-news="${esc(n.appid)}" data-gid="${esc(n.gid)}"><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p><small class="link">Lire l’article complet ›</small></div></div>`;
  }).catch(() => {});
  api.achievements?.(i.id).then((a) => {
    if (!$('sxAch') || !a) return;
    if (a.none) return;
    const row = (x) => `<div class="achi ${x.done ? 'done' : ''}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : '<span class="noic">🏆</span>'}<div><b>${esc(x.name)}</b><small>${esc(x.desc || (x.hidden ? 'Succès caché' : ''))}</small></div>${x.pct != null ? `<em>${x.pct.toFixed(1).replace('.', ',')} %</em>` : ''}</div>`;
    $('sxAch').innerHTML = `<h3>🏆 Succès <small class="hint">${a.done} / ${a.total}</small></h3>
      <div class="gbar big"><i style="width:${(100 * a.done) / a.total}%"></i></div>
      ${a.easy.length ? `<b class="sub">Les plus faciles à débloquer</b>${a.easy.map(row).join('')}` : '<p class="fine">Tous les succès sont débloqués 👑</p>'}
      ${a.recent.length ? `<details><summary>Derniers débloqués</summary>${a.recent.map(row).join('')}</details>` : ''}`;
  }).catch(() => {});
  api.captures?.(i.id).then((caps) => {
    if (!$('sxCaps') || !caps?.length) return;
    const imgs = caps.filter((c) => !c.video);
    const vids = caps.filter((c) => c.video).length;
    $('sxCaps').innerHTML = `<h3>📸 Captures <small class="hint">${imgs.length} image${imgs.length > 1 ? 's' : ''}${vids ? ` · ${vids} vidéo${vids > 1 ? 's' : ''}` : ''}</small></h3>
      <div class="caps">${imgs.slice(0, 24).map((c) => `<img src="${esc(c.url)}" data-cap="${esc(c.token)}" alt="" loading="lazy">`).join('')}</div>
      <div class="row"><button class="btn" data-capdir="${esc(caps[0].token)}">Ouvrir le dossier</button><button class="btn ghost" data-capmode="1" title="Clique ensuite sur une capture pour l’envoyer dans le salon des clips">📤 Envoyer sur Discord</button></div>`;
  }).catch(() => {});
}

const human = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.round(b / 1e6)} Mo`);
function showVerify(p) {
  const dlg = $('verifyDlg');
  if (!dlg.open) dlg.showModal();
  $('vTitle').textContent = `Vérification de ${p.name}`;
  if (p.phase === 'start') {
    $('vMode').textContent = 'Lecture de la liste officielle des fichiers…';
    $('vFill').style.width = '0'; $('vPct').textContent = '0 %'; $('vCount').textContent = ''; $('vFile').textContent = ''; $('vResult').innerHTML = '';
    $('vCancel').hidden = false; $('vRepair').hidden = true; $('vClose').hidden = true;
    state.verifying = p.id;
  }
  if (p.phase === 'run') {
    const pct = p.totalBytes ? Math.min(100, (p.bytes / p.totalBytes) * 100) : p.total ? (p.done / p.total) * 100 : 0;
    $('vMode').textContent = 'Chaque fichier est comparé à la liste officielle (taille et empreinte).';
    $('vFill').style.width = `${pct}%`;
    $('vPct').textContent = `${Math.floor(pct)} %`;
    $('vCount').textContent = `${p.done ?? 0} / ${p.total ?? '?'} fichiers · ${human(p.bytes ?? 0)} / ${human(p.totalBytes ?? 0)}`;
    $('vFile').textContent = p.file ?? '';
  }
  if (p.phase === 'done') {
    const r = p.result;
    $('vFill').style.width = '100%'; $('vPct').textContent = '100 %'; $('vFile').textContent = '';
    $('vCount').textContent = `${r.checked + r.missing.length + r.corrupt.length + r.sizes.length} fichier(s) contrôlé(s)`;
    $('vCancel').hidden = true; $('vClose').hidden = false;
    const list = [...r.missing.map((f) => `Manquant : ${f}`), ...r.corrupt.map((f) => `Abîmé : ${f}`), ...r.sizes.map((f) => `Mauvaise taille : ${f}`)];
    if (r.mode === 'simple') $('vMode').textContent = 'Pas de liste officielle pour ce jeu : présence des fichiers et taille totale vérifiées.';
    $('vResult').innerHTML = r.ok
      ? `<div class="vok">✅ Tout est bon : ${r.checked} fichier${r.checked > 1 ? 's' : ''} vérifié${r.checked > 1 ? 's' : ''}${r.mode === 'complet' ? ', aucun abîmé ni manquant' : ''}.</div>`
      : `<div class="vbad">❌ ${list.length} problème${list.length > 1 ? 's' : ''} trouvé${list.length > 1 ? 's' : ''}${p.canRepair ? ' : la réparation re-télécharge seulement ces fichiers.' : '.'}<ul>${list.slice(0, 40).map((l) => `<li>${esc(l)}</li>`).join('')}${list.length > 40 ? `<li>… et ${list.length - 40} autres</li>` : ''}</ul></div>`;
    $('vRepair').hidden = r.ok || !p.canRepair;
    state.verifying = null;
  }
  if (p.phase === 'cancel' || p.phase === 'error') {
    $('vResult').innerHTML = `<div class="vbad">${p.phase === 'cancel' ? 'Vérification annulée.' : `Erreur : ${esc(p.error)}`}</div>`;
    $('vCancel').hidden = true; $('vClose').hidden = false; state.verifying = null;
  }
}
api.onVerify?.((p) => { state.verifyItem = p.id; showVerify(p); });
$('vCancel').addEventListener('click', () => api.cancelVerify());
$('vClose').addEventListener('click', () => $('verifyDlg').close());
$('vRepair').addEventListener('click', async () => {
  $('vRepair').disabled = true; $('vRepair').textContent = 'Réparation…';
  const r = await api.repair(state.verifyItem);
  $('vRepair').disabled = false; $('vRepair').textContent = 'Réparer';
  $('verifyDlg').close();
  if (!r?.ok) return toast(`Impossible : ${r?.error ?? 'erreur'}`);
  toast(`🛠 Réparation par History : ${(r.removed ?? 0) + (r.missing ?? 0)} fichier(s) à remettre, téléchargement en arrière-plan`);
  if (r.track) startGameUpdate(state.items.find((i) => i.id === state.verifyItem)); // avancement suivi dans History, Steam reste caché
});

let gameUpdateGeneration=0,gameUpdateTimer=null;
const gameUpdateRequests=new Map();
async function startGameUpdate(item) {
  if(!item)return;
  const generation=++gameUpdateGeneration;clearTimeout(gameUpdateTimer);
  const dialog=$('gameUpdateDialog');$('guTitle').textContent=`Mise à jour de ${item.name}`;$('guStatus').textContent='History prépare la demande…';$('guProgress').removeAttribute('value');$('guDetail').textContent='';
  if(!dialog.open)dialog.showModal();
  try {
    if(!gameUpdateRequests.has(item.id))gameUpdateRequests.set(item.id,api.action(item.id,'update').then(r=>{if(!r?.ok)throw Error(r?.error||'Mise à jour indisponible.');return r;}).catch(e=>{gameUpdateRequests.delete(item.id);throw e;}));
    await gameUpdateRequests.get(item.id);
  } catch(e){if(generation===gameUpdateGeneration)$('guStatus').textContent=e.message;return;}
  let previous=null;
  async function poll(){
    if(generation!==gameUpdateGeneration||!dialog.open)return;
    let p;try{p=await api.gameUpdateProgress(item.id);}catch{p={error:'Connexion au suivi interrompue. Nouvelle tentative…'};}
    if(generation!==gameUpdateGeneration||!dialog.open)return;
    $('guStatus').textContent=p.error||p.label;
    if(p.percent==null)$('guProgress').removeAttribute('value');else $('guProgress').value=p.percent;
    const now=Date.now();let speed='';if(previous&&p.phase==='download'&&p.bytes>previous.bytes&&now>previous.at)speed=` · ${human((p.bytes-previous.bytes)*1000/(now-previous.at))}/s`;
    $('guDetail').textContent=p.total?`${p.percent} % · ${human(p.bytes)} / ${human(p.total)}${speed}`:p.phase==='done'?'100 %':'';
    previous={bytes:p.bytes??0,at:now};
    if(p.phase==='done'||p.phase==='error'){gameUpdateRequests.delete(item.id);return;}
    gameUpdateTimer=setTimeout(poll,2000);
  }
  await poll();
}
$('guClose').onclick=()=>$('gameUpdateDialog').close();
$('guDownloads').onclick=async()=>{try{if(!await api.gameUpdateDownloads())$('guStatus').textContent='Impossible d’ouvrir les téléchargements.';}catch{$('guStatus').textContent='Impossible d’ouvrir les téléchargements.';}};
$('gameUpdateDialog').addEventListener('close',()=>{gameUpdateGeneration++;clearTimeout(gameUpdateTimer);});

// 🧩 Mods : liste des dossiers mods / plugins du jeu, activer ou couper chacun (réversible)
async function openMods(item) {
  let d = document.getElementById('modsDlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'modsDlg'; d.innerHTML = '<div class="dlg"><h2 id="modsT"></h2><div id="modsL" class="modsl"></div><p class="hint">Couper un mod le renomme en « .disabled » : rien n’est supprimé.</p><button class="btn" type="button" id="modsX">Fermer</button></div>'; document.body.append(d); d.querySelector('#modsX').onclick = () => d.close(); }
  const paint = (mods) => { d.querySelector('#modsL').innerHTML = mods.length ? mods.map((m) => `<label class="toggle"><input type="checkbox" data-mdir="${esc(m.dir)}" data-mname="${esc(m.name)}" ${m.on ? 'checked' : ''}><span></span>${esc(m.name)} <small class="hint">${esc(m.dir)}</small></label>`).join('') : '<p class="hint">Aucun mod trouvé (dossiers mods, plugins, BepInEx…).</p>'; };
  d.querySelector('#modsT').textContent = `🧩 Mods de ${item.name}`; paint(await api.modsList?.(item.id) ?? []);
  d.querySelector('#modsL').onchange = async (e) => { const c = e.target; const r = await api.modsToggle?.(item.id, c.dataset.mdir, c.dataset.mname, c.checked); if (r?.ok) { paint(r.mods); toast(c.checked ? 'Mod activé' : 'Mod coupé'); } else toast('Impossible : ferme le jeu d’abord'); };
  d.showModal();
}
async function act(action) {
  const item = state.sel;
  if (!item) return;
  if (action === 'update') return startGameUpdate(item);
  if (action === 'optiplay') return openOptiPlay(item);
  if (action === 'verify') { api.verify(item.id).then((r) => r?.error && toast(`Impossible : ${r.error}`)); return; }
  if (action === 'cache') { const r = await api.action(item.id, 'cache'); if (r?.ok) toast(r.freed ? `🧹 ${size(r.freed)} de cache vidés` : 'Cache déjà vide'); return; }
  const labels = { update: 'Mise à jour demandée dans History', launch: `Lancement de ${item.name}…`, install: `Installation de ${item.name}…`, verify: 'Vérification des fichiers lancée', uninstall: 'Désinstallation…', folder: 'Dossier ouvert', store: 'Page du magasin ouverte' };
  // Mise à jour en attente : la faire d'abord plutôt que d'attendre devant l'écran de chargement
  if (action === 'launch' && item.updatePending && item.source === 'steam') {
    const c = await ui.confirm({ title: `${item.name} a une mise à jour`, text: 'History peut suivre la mise à jour maintenant. Le jeu ne sera pas lancé automatiquement après.', ok: '⬇ Mettre à jour', cancel: 'Jouer quand même', icon: '⬆' });
    if (c) return startGameUpdate(item);
  }
  if (action === 'launch') window.sfx?.play('launch');
  const r = await api.action(item.id, action);
  if (r?.ok) toast(labels[action]);
  else if (action === 'launch') window.sfx?.play('error');
  else if (r?.error) toast(`Impossible : ${r.error}`);
}

// ---------- Événements ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-id], [data-reco], [data-free], [data-deal], [data-news], [data-nurl], [data-surl]');
  const inCtx = Boolean(t?.closest('#ctx'));
  if (!t) { hideCtx(); return; }
  if (t.id === 'moreBtn') { if ($('ctx').hidden) openCtx(state.sel, 0, 0, t); else hideCtx(); return; }
  hideCtx();
  if (inCtx && t.tagName === 'HR') return;
  if (t.dataset.side) return sideAction(t.dataset.side, t.dataset.k);
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.platform) {
    document.querySelectorAll('#nav button').forEach((b) => b.classList.remove('on'));
    state.list = { ...state.list, kind: 'tout', source: t.dataset.platform, collection: null };
    showView('liste');
    renderPlatforms();
    return renderList();
  }
  if (t.dataset.action) return act(t.dataset.action);
  if (t.dataset.sheet && state.sel) return openSheet(state.sel);
  if (t.dataset.close) return $('sheet').close();
  if (t.dataset.set && state.sel) {
    const key = t.dataset.set;
    const value = !state.sel[key];
    await api.setItem(state.sel.id, { [key]: value });
    state.sel[key] = value;
    toast(key === 'favorite' ? (value ? 'Ajouté aux favoris' : 'Retiré des favoris') : value ? 'Masqué' : 'De nouveau visible');
    return renderAll();
  }
  if (t.dataset.ask) return ask(t.dataset.ask);
  if (t.dataset.key) { await api.mediaKey(t.dataset.key); setTimeout(refreshMusic, 700); return; }
  if (t.dataset.inst) { document.querySelectorAll('#installed button').forEach((x) => x.classList.toggle('on', x === t)); state.list.installed = t.dataset.inst; return renderList(); }
  if (t.dataset.p) { document.querySelectorAll('#periods button').forEach((x) => x.classList.toggle('on', x === t)); state.period = t.dataset.p; return renderStats(); }
  if (t.dataset.rank) { document.querySelectorAll('#rankTabs button').forEach((x) => x.classList.toggle('on', x === t)); state.rank = t.dataset.rank; return renderRanking(); }
  if (t.dataset.ftab) return showFriendTab(t.dataset.ftab);
  if (t.dataset.upd) return startGameUpdate(state.items.find(i=>i.id===t.dataset.upd));
  if (t.dataset.surl) return api.storeOpen(t.dataset.surl).then(() => toast('Fiche du jeu ouverte'));
  if (t.dataset.nurl) return api.newsUrl?.(t.dataset.nurl).then(() => toast('Article ouvert'));
  if (t.dataset.news) return api.openNews(t.dataset.news, t.dataset.gid).then(() => toast('Article ouvert'));
  if (t.dataset.boostgame && state.sel) {
    const r = await api.setBoost({ game: { id: state.sel.id, mode: t.dataset.boostgame } });
    boostGames = r?.games ?? {};
    return toast(t.dataset.boostgame === 'on' ? `⚡ ${state.sel.name} sera toujours optimisé au lancement` : t.dataset.boostgame === 'off' ? `${state.sel.name} ne sera jamais optimisé` : 'Réglage par défaut remis');
  }
  if (t.dataset.giftfor) { $('giftPick').hidden = !$('giftPick').hidden; return; }
  if (t.dataset.gift) { const r = await api.friendGift?.(t.dataset.to, t.dataset.gift); toast(r?.ok ? `🎁 ${GIFTS[t.dataset.gift].join(' ')} offert !` : r?.error ?? 'Cadeau impossible'); $('giftPick').hidden = true; return; }
  if (t.dataset.gmod) return openGmod();
  if (t.dataset.mods && state.sel) return openMods(state.sel);
  if (t.dataset.tofinish && state.sel) {
    let id = Object.keys(state.cols).find((k) => state.cols[k].name === 'À finir');
    if (!id) { id = newColId(); state.cols[id] = { name: 'À finir', items: [] }; }
    const c = state.cols[id];
    const on = !c.items.includes(state.sel.id);
    c.items = on ? [...c.items, state.sel.id] : c.items.filter((x) => x !== state.sel.id);
    saveCols();
    return toast(on ? `🏁 ${state.sel.name} ajouté à « À finir »` : 'Retiré de « À finir »');
  }
  if (t.dataset.reqs && state.sel) return openReqs(state.sel);
  if (t.dataset.tools && state.sel) return openTools(state.sel);
  if (t.dataset.tips && state.sel) { const it = state.sel; toast('L’IA prépare ses conseils…'); const r = await api.gameTips(it.id); return showReport(r?.text ? { text: r.text, ai: true } : { error: r?.error }, `Conseils pour ${it.name}`); }
  if (t.dataset.fivemsrv) return openFivemServers();
  if (t.dataset.copytext) { await copyText(t.dataset.copytext); return toast(t.dataset.copied || 'Copié'); }
  if (t.dataset.plopen) { const r = await api.openProfileLink?.(t.dataset.plopen, t.dataset.plh); if (!r?.ok) toast('Lien impossible à ouvrir'); return; }
  if (t.dataset.pact) return profileAction(t.dataset.pact);
  if (t.dataset.hchat) return openChat(t.dataset.hchat, t.dataset.name);
  if (t.dataset.hcall) return startCall(t.dataset.hcall, t.dataset.name);
  if (t.dataset.hjoin) { const r = await api.friendJoin(t.dataset.hjoin); return toast(r?.ok ? 'On rejoint la partie…' : r?.error ?? 'Impossible'); }
  if (t.dataset.hask || t.dataset.hinv) { const r = await api.friendInvite(t.dataset.hask ?? t.dataset.hinv, t.dataset.hask ? 'ask' : 'invite'); return toast(r?.ok ? (t.dataset.hask ? 'Demande envoyée 🎮' : 'Invitation envoyée 📨') : r?.error ?? 'Impossible'); }
  if (t.dataset.fivem) {
    const code = await ui.prompt({ title: 'Rejoindre un serveur FiveM', text: 'Colle le lien ou le code du serveur (ex. cfx.re/join/abc123).', placeholder: 'cfx.re/join/…', ok: 'Rejoindre', icon: '🔗' });
    if (!code) return;
    const r = await api.fivemJoin(code);
    return toast(r?.ok ? 'Connexion au serveur…' : r?.error ?? 'Impossible');
  }
  if (t.dataset.capmode) { const on = t.closest('#sxCaps')?.querySelector('.caps')?.classList.toggle('send'); t.classList.toggle('on', on); return toast(on ? '📤 Clique sur la capture à envoyer sur Discord' : 'Envoi annulé'); }
  if (t.dataset.cap && t.closest('.caps.send')) {
    const note = await ui.prompt({ title: 'Envoyer sur Discord', text: 'Un petit mot avec la capture ? (facultatif)', placeholder: 'GG !', ok: '📤 Envoyer', icon: '📤' });
    if (note === null || note === undefined) return;
    t.closest('.caps').classList.remove('send');
    const r = await api.captureDiscord(t.dataset.cap, note);
    return toast(r?.ok ? '✅ Envoyée dans le salon des clips' : r?.error ?? 'Envoi impossible');
  }
  if (t.dataset.cap) return api.openCapture(t.dataset.cap);
  if (t.dataset.capdir) return api.captureFolder(t.dataset.capdir);
  if (t.dataset.cols && state.sel) return openCollections(state.sel);
  if (t.dataset.col) { document.querySelectorAll('#nav button').forEach((b) => b.classList.remove('on')); state.list = { ...state.list, kind: 'tout', source: 'tout', collection: t.dataset.col }; showView('liste'); renderPlatforms(); return renderList(); }
  if (t.dataset.rename && state.sel) { const n = await ui.prompt({ title: 'Renommer le jeu', value: state.sel.name, ok: 'Renommer' }); if (n) api.renameGame(state.sel.id, n).then((r) => r?.ok && toast('Jeu renommé')); return; }
  if (t.dataset.remove && state.sel) { if (await ui.confirm({ title: `Retirer ${state.sel.name} ?`, text: 'Il disparaît du launcher ; les fichiers du jeu ne sont pas touchés.', ok: 'Retirer', danger: true, icon: '✕' })) api.removeGame(state.sel.id).then((r) => { if (r?.ok) { state.sel = null; toast('Jeu retiré'); } }); return; }
  if (t.dataset.login) return showAuth(true);
  if (t.dataset.hacc) { const r = await api.hFriendAccept(t.dataset.hacc); if (r?.amis) { state.hist = r; renderHistory(); toast('Nouvel ami ajouté'); } return; }
  if (t.dataset.hrem) {
    if (t.dataset.name && !(await ui.confirm({ title: `Retirer ${t.dataset.name} de tes amis ?`, ok: 'Retirer', danger: true, icon: '👥' }))) return;
    const r = await api.hFriendRemove(t.dataset.hrem);
    if (r?.amis) { state.hist = r; renderHistory(); }
    return;
  }
  if (t.dataset.eresp) { const r = await api.eventRespond(t.dataset.eresp, t.dataset.r); if (r?.soirees) { state.events = r.soirees; renderEvents(); } return; }
  if (t.dataset.ecancel) { if (!(await ui.confirm({ title: 'Annuler cette soirée ?', text: 'Tes amis invités ne la verront plus.', ok: 'Annuler la soirée', cancel: 'Garder', danger: true, icon: '🎉' }))) return; const r = await api.eventCancel(t.dataset.ecancel); if (r?.soirees) { state.events = r.soirees; renderEvents(); } return; }
  if (t.dataset.friend) {
    const r = await api.friendAction(t.dataset.friend, t.dataset.fid);
    return toast(r?.ok ? { join: 'Connexion à la partie…', message: 'Discussion Steam ouverte', profile: 'Profil ouvert' }[t.dataset.friend] : r?.error ?? 'Impossible pour l’instant');
  }
  if (t.dataset.deal) return api.openDeal?.(t.dataset.deal).then(() => toast('Page Steam ouverte'));
  if (t.dataset.free) return api.openFree?.(t.dataset.free).then(() => toast('Page Epic ouverte'));
  if (t.dataset.reco !== undefined) {
    const r = state.recos[Number(t.dataset.reco)];
    if (r?.itemId) return select(state.items.find((i) => i.id === r.itemId));
    if (r?.steamId) return api.openReco(r.steamId).then(() => toast('Page Steam ouverte'));
  }
  if (t.dataset.id) select(state.items.find((i) => i.id === t.dataset.id));
});
document.addEventListener('dblclick', (e) => {
  const t = e.target.closest('[data-id]');
  const item = t && state.items.find((i) => i.id === t.dataset.id);
  if (item?.installed) { state.sel = item; act('launch'); }
});
$('askForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('askInput').value; $('askInput').value = ''; ask(v); });
$('sort').addEventListener('change', (e) => { state.list.sort = e.target.value; renderList(); });
$('q').addEventListener('input', (e) => {
  state.list.q = e.target.value.trim();
  if (state.list.q && state.view !== 'liste') { state.list.kind = 'tout'; state.list.source = 'tout'; showView('liste'); }
  renderList();
});
document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => api.win(b.dataset.win)));
// ---------- Raccourcis clavier (liste complète : touche « ? ») ----------
const VIEW_KEYS = ['accueil', 'bibliotheque', 'jeux', 'favoris', 'classement', 'amis', 'pc', 'optimisation'];
function visibleItems() {
  return [...document.querySelectorAll(state.view === 'liste' ? '#grid [data-id]' : '#topGames [data-id], #topApps [data-id]')].map((el) => state.items.find((i) => i.id === el.dataset.id)).filter(Boolean);
}
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'Space') { e.preventDefault(); if ($('palette').hidden) openPalette(); else closePalette(); return; }
  if (e.key === 'F11') { e.preventDefault(); toggleBig(); return; }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); return; }
  if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); openAssistant(true); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); $('openSettings').click(); return; }
  if (ctrl && /^[1-8]$/.test(e.key)) { e.preventDefault(); go(VIEW_KEYS[Number(e.key) - 1]); return; }
  // Relancer le dernier jeu, jeu au hasard, History Clips, optimisation rapide
  const playable = () => games().filter((i) => i.installed);
  if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); const g = playable().sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0]; if (g) { select(g); act('launch'); toast(`▶ ${g.name}`); } return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); const l = playable(); const g = l[Math.floor(Math.random() * l.length)]; if (g) { go('accueil'); select(g); toast(`🎲 ${g.name} · Entrée pour jouer`); } return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); api.clipsSite?.(); return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); go('optimisation'); return; }
  if (ctrl && e.key.toLowerCase() === 'd' && state.sel) {
    e.preventDefault();
    const on = !state.sel.favorite;
    api.setItem(state.sel.id, { favorite: on }).then(() => { state.sel.favorite = on; renderHero(); toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris'); });
    return;
  }
  if (e.key === 'F5') { e.preventDefault(); toast('Recherche de nouveaux jeux…'); api.rescan?.().then((lib) => lib && applyLibrary(lib)); return; }
  if (typing || document.querySelector('dialog[open]') || !$('palette').hidden) return;
  if (e.key === '/') { e.preventDefault(); $('q').focus(); return; }
  if (e.key === '?') { $('keys').showModal(); return; }
  if (e.key === ' ') { e.preventDefault(); api.mediaKey?.('toggle').then(() => setTimeout(refreshMusic, 700)); return; }
  if (e.key === 'Enter' && state.sel?.installed) { act('launch'); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const list = visibleItems();
    if (!list.length) return;
    const at = list.findIndex((i) => i.id === state.sel?.id);
    const next = list[(at + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    if (state.view === 'liste') { state.sel = next; renderList(); document.querySelector(`#grid [data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' }); toast(next.name); } else select(next);
  }
});
$('openKeys').addEventListener('click', (e) => { e.preventDefault(); $('settings').close(); $('keys').showModal(); });

// Réglages
function showKeys(s) {
  Object.assign(sidebar, { hiddenPlatforms: [], hiddenNav: [] }, s.sidebar ?? {});
  applySidebar();
  $('autostart').checked = Boolean(s.autostart);
  $('directLaunch').checked = s.directLaunch !== false;
  $('preloadSteam').checked = Boolean(s.preloadSteam);
  $('nightUpdates').checked = Boolean(s.nightUpdates);
  $('voiceReply').checked = s.voiceReply !== false;
  api.voiceList?.().then((vs) => { $('voiceName').innerHTML = '<option value="">Voix française par défaut</option>' + (vs ?? []).map((v) => `<option value="${esc(v.name)}">${esc(v.name.replace(/^Microsoft /, ''))} · ${esc(v.lang)}${v.gender === 'Female' ? ' · femme' : v.gender === 'Male' ? ' · homme' : ''}</option>`).join(''); $('voiceName').value = s.voiceName ?? ''; }).catch(() => {});
  $('remoteOn').checked = Boolean(s.remote); showRemote();
  $('gameMode').checked = s.gameMode !== false;
  $('dealAlerts').checked = s.dealAlerts !== false;
  $('widgetGame').checked = Boolean(s.widgetGame); $('gamePopups').checked = s.gamePopups === true; $('promoDm').checked = s.promoDm !== false;
  $('streamerAuto').checked = s.streamerAuto !== false; $('streamerOn').checked = Boolean(s.streamer);
  $('discordStatus').checked = s.discordStatus !== false;
  $('shareActivity').checked = s.shareActivity !== false;
  $('friendNotifs').checked = s.friendNotifs !== false;
  $('textScale').value = String(s.textScale ?? 1);
  $('compact').checked = Boolean(s.compact); document.body.classList.toggle('compact', Boolean(s.compact));
  $('dnd').checked = Boolean(s.dnd); $('tournament').checked = Boolean(s.tournament);
  $('fpsOn').checked = s.fps === true; $('widgetOn').checked = Boolean(s.widget); $('widgetTop').checked = s.widgetTop !== false; $('widgetTopRow').hidden = !s.widget;
  $('batterySaver').checked = s.batterySaver === true; $('gamepad').checked = s.gamepad !== false; state.gamepadOn = s.gamepad !== false;
  if (s.status != null) $('myStatus').value = s.status;
  if (s.dnd || s.tournament) window.sfx?.set({ notif: false });
  window.sfx?.set({ on: s.sfxOn !== false, notif: s.sfxNotif !== false, vol: (s.sfxVol ?? 60) / 100 });
  $('sfxOn').checked = s.sfxOn !== false;
  $('sfxNotif').checked = s.sfxNotif !== false;
  $('sfxVol').value = String(s.sfxVol ?? 60);
}
const backupTxt = (at) => (at ? `Dernière sauvegarde : ${new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Pas encore sauvegardé');
function showBackup() { api.backupInfo?.().then((b) => { $('backupStatus').textContent = b?.logged ? backupTxt(b.at) : 'Connecte-toi pour sauvegarder en ligne'; }).catch(() => {}); }
$('openSettings').addEventListener('click', () => { api.settings().then(showKeys); showBackup(); showSecurity(); $('settings').showModal(); });
$('backupNow').addEventListener('click', async () => { const r = await api.backupNow(); toast(r?.ok ? '☁ Sauvegardé sur ton compte' : r?.error ?? 'Impossible'); showBackup(); });
$('backupRestore').addEventListener('click', async () => {
  if (!(await ui.confirm({ title: 'Restaurer la sauvegarde ?', text: 'Collections, favoris, réglages et heures de ton compte sont remis sur ce PC (tes heures actuelles sont gardées si elles sont plus grandes).', ok: '☁ Restaurer', icon: '☁' }))) return;
  const r = await api.backupRestore();
  toast(r?.ok ? 'Sauvegarde restaurée ✓' : r?.error ?? 'Impossible');
  if (r?.ok) api.settings().then(showKeys);
});
document.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); api.openLink?.(b.dataset.link); }));
$('autostart').addEventListener('change', (e) => api.setSettings({ autostart: e.target.checked }));
$('directLaunch').addEventListener('change', (e) => api.setSettings({ directLaunch: e.target.checked }));
$('preloadSteam').addEventListener('change', (e) => api.setSettings({ preloadSteam: e.target.checked }));
$('nightUpdates').addEventListener('change', (e) => api.setSettings({ nightUpdates: e.target.checked }));
$('quietGames').addEventListener('change', (e) => api.setSettings({ quietGames: e.target.checked }));
api.settings?.().then((x) => { $('quietGames').checked = Boolean(x?.quietGames); }).catch(() => {});
$('clipsLink').addEventListener('click', () => api.clipsSite?.());
$('discordBtn').addEventListener('click', () => { toast('🎮 Ouverture du serveur Discord…'); api.discordInvite?.(); });

// ---------- ⭐ Premium : History IA, Opti Pro ou les deux (thème jaune). Le serveur décide, relu à chaque retour sur l'appli ----------
let prem = null;
const PREM_NAMES = { ia: 'History IA', opti: 'Opti Pro' };
async function loadPremium(fresh = false) {
  prem = (await api.premiumGet?.(fresh).catch(() => null)) ?? prem ?? { ia: false, opti: false };
  if (prem.news?.length) premNews(prem.news[prem.news.length - 1]);
  moreUi?.premExtras(prem);
  document.documentElement.classList.toggle('isprem', Boolean(prem.ia || prem.opti));
  document.documentElement.classList.toggle('noia', !prem.ia);
  $('aiState').textContent = prem.ia ? 'History IA · en ligne' : 'Réservé à History IA';
  $('aiState').classList.toggle('on', Boolean(prem.ia));
  const on = ['ia', 'opti'].filter((k) => prem[k]);
  $('premState').innerHTML = !prem.logged && !prem.dev ? 'Connecte-toi à ton compte History (Compte & sauvegarde) : ton Premium te suit sur tous tes PC.'
    : on.length ? `Actif : ${on.map((k) => `<b>${PREM_NAMES[k]}</b>${prem.until?.[k] ? ` jusqu’au ${new Date(prem.until[k]).toLocaleDateString('fr-FR')}` : ''}`).join(' · ')}` : 'Pas encore de Premium : choisis ton pack.';
  $('pgCode').textContent = prem.code ?? 'Connecte-toi'; $('pgTrial').disabled = Boolean(prem.trialUsed || (prem.ia && prem.opti)); if (prem.trialUsed) $('pgTrial').textContent = 'Essai déjà utilisé';
  document.querySelectorAll('[data-buy]').forEach((b) => { const have = b.dataset.buy === 'pack' ? prem.ia && prem.opti : prem[b.dataset.buy]; b.textContent = have ? '✓ Actif' : 'Acheter avec PayPal'; b.disabled = Boolean(have); });
  return prem;
}
const premOk = async (pack) => Boolean((prem ?? await loadPremium())[pack]);
function openPremium(pack) {
  if ($('settings').open) $('settings').close();
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  go('premium');
  document.querySelectorAll('.premcard').forEach((c) => c.classList.toggle('want', c.dataset.pack === pack));
  loadPremium(true);
}
// Opti Pro : les actions qui modifient le PC (l'analyse reste gratuite)
for (const n of ['optiRun', 'optiTweak', 'optiStartup', 'optiSysApply', 'optiStorage', 'optiRepair', 'optiDeep', 'pcFix', 'fortnitePerf', 'shadersClear', 'cleanRun', 'optiLaunch']) {
  const f = api[n];
  if (f) api[n] = async (...a) => ((await premOk('opti')) ? f(...a) : (openPremium('opti'), { ok: false, error: 'réservé à ⭐ Opti Pro' }));
}
// Achat : fenêtre maison en 3 étapes (payer, nom PayPal, capture), puis vérification à la main sur Discord
const PACK_INFO = { ia: ['History IA', '2,49 €'], opti: ['Opti Pro', '2,49 €'], pack: ['Pack Premium', '3,99 €'] };
let claimShot = null;
function claimShotSet(src) { claimShot = src; $('pdPrev').hidden = !src; if (src) $('pdPrev').src = src; $('pdDropTxt').hidden = Boolean(src); $('pdDrop').classList.toggle('has', Boolean(src)); }
async function claimFile(f) { if (f?.type?.startsWith('image/')) claimShotSet(await shrinkImage(f).catch(() => null)); }
document.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
  if (!prem?.logged && !prem?.dev) return toast('Connecte-toi à ton compte History (Paramètres › Compte) pour acheter');
  const [name, price] = PACK_INFO[b.dataset.buy];
  $('premClaim').dataset.pack = b.dataset.buy;
  $('pdTitle').textContent = name; $('pdPrice').textContent = price; $('pdAmount').textContent = price;
  $('pdDone').hidden = true; $('premClaim').classList.remove('sent'); $('pdLink').hidden = false;
  $('premDlg').showModal(); $('premPaypal').focus();
  $('pdNote').textContent = '…';
  $('pdCode').value = ''; $('pdGift').checked = false; $('pdYear').checked = false; refreshNote();
}));
// Note (et prix) recalculés quand on met un code ami ou qu'on coche « cadeau »
function refreshNote() {
  const pack = $('premClaim').dataset.pack; $('pdNote').textContent = '…';
  api.premiumNote?.(pack, $('pdCode').value.trim(), $('pdGift').checked, $('pdYear').checked).then((r) => {
    $('pdNote').textContent = r?.note ?? 'indisponible'; if (r?.error) toast(r.error);
    const price = r?.price ? `${r.price.replace('.', ',')} €` : PACK_INFO[pack][1]; $('pdPrice').textContent = price; $('pdAmount').textContent = price;
  }).catch(() => {});
}
$('pdCode').addEventListener('change', refreshNote); $('pdGift').addEventListener('change', refreshNote); $('pdYear').addEventListener('change', refreshNote);
// 🎁 Cadeaux & codes : essai gratuit, code ami à partager, carte cadeau
$('pgTrial').addEventListener('click', async () => { const r = await api.premiumTrial?.(); if (r?.ok) { toast('⭐ Essai activé : 3 jours de Pack Premium'); loadPremium(true); } else toast(r?.error ?? 'Essai indisponible'); });
$('pgCopy').addEventListener('click', () => { if (/^AMI-/.test($('pgCode').textContent)) { copyText($('pgCode').textContent); toast('Code ami copié'); } });
$('pgRedeemF').addEventListener('submit', async (e) => { e.preventDefault(); const r = await api.premiumRedeem?.($('pgRedeem').value.trim()); if (r?.ok) { toast(`🎁 ${PACK_INFO[r.pack]?.[0] ?? 'Premium'} activé`); $('pgRedeem').value = ''; loadPremium(true); } else toast(r?.error ?? 'Code invalide'); });
$('pdPay').addEventListener('click', () => api.premiumBuy?.($('premClaim').dataset.pack, $('pdPrice').textContent));
$('pdCopyNote').addEventListener('click', () => { if (/^HIST-/.test($('pdNote').textContent)) { copyText($('pdNote').textContent); toast('Note copiée : colle-la dans le message du paiement'); } });
$('pdClose').addEventListener('click', () => $('premDlg').close());
$('pdOk').addEventListener('click', () => $('premDlg').close());
// Lier Discord : la commande est copiée, on dit où la coller, et on affiche le succès dès que c'est lié
let linkWatch = null;
$('pdLink').addEventListener('click', async () => {
  const r = await api.discordCode?.().catch(() => null);
  if (!r?.ok) return toast(r?.error ?? 'Connecte-toi d’abord');
  copyText(`/launcher lier code:${r.code}`);
  $('pdDisc').innerHTML = `<b>Commande copiée ✓</b><small>Colle-la (Ctrl+V) dans le salon <b>#lier-son-compte</b> du serveur History. Valable 10 min.</small>${r.qr ? `<small>📱 Sur téléphone : scanne pour ouvrir le salon, puis tape <b>/launcher lier code:${esc(r.code)}</b></small><img class="dcqr" src="${r.qr}" alt="QR du salon Discord">` : ''}`;
  $('pdLink').hidden = true;
  clearInterval(linkWatch);
  const until = Date.now() + 600_000;
  linkWatch = setInterval(async () => {
    const a = await api.account?.().catch(() => null);
    if (a?.compte?.discord) { clearInterval(linkWatch); $('pdDisc').innerHTML = '<b>✅ Ton compte a bien été lié</b><small>Tes avantages Premium arrivent sur Discord dans quelques minutes.</small>'; toast('✅ Ton compte Discord a bien été lié'); }
    else if (Date.now() > until) { clearInterval(linkWatch); $('pdLink').hidden = false; }
  }, 4000);
});
$('pdJoin').addEventListener('click', () => api.discordInvite?.());
// Réponse du chef (paiement accepté ou refusé) : affichée dans la même fenêtre, une seule fois
function premNews(n) {
  const name = PACK_INFO[n.pack]?.[0] ?? 'Premium';
  $('pdDoneT').textContent = n.ok ? `${name} est actif` : 'Paiement non validé';
  if (n.ok && n.gift) { $('pdDoneT').textContent = '🎁 Ta carte cadeau est prête'; $('pdDoneS').textContent = `Code à offrir : ${n.gift} (à entrer dans ⭐ Premium › Carte cadeau).`; copyText(n.gift); } else
  $('pdDoneS').textContent = n.ok ? `Merci 💛 Ton paiement est vérifié. Débloqué tout de suite : ${{ ia: 'assistant IA, outils IA, voix « Hey History »', opti: 'optimisation complète, ticket Opti Pro, suivi mensuel', pack: 'assistant et outils IA, optimisation complète, ticket Opti Pro' }[n.pack] ?? 'ton Premium'}.` : 'Le paiement n’a pas pu être vérifié. Si tu as bien payé, écris au support (bouton Support en haut).';
  $('pdDoneIco').classList.toggle('no', !n.ok); $('pdDoneIco').classList.remove('wait');
  const t = $('pdTrack').children; t[1].className = n.ok ? 'ok' : 'bad'; t[2].className = n.ok ? 'ok' : ''; $('pdStep2').textContent = n.ok ? 'Vérifié' : 'Refusé';
  $('premClaim').classList.add('sent'); $('pdDone').hidden = false;
  if (!$('premDlg').open) $('premDlg').showModal();
}
setInterval(() => { if (prem?.logged) loadPremium(true); }, 120_000); // réponse du chef visible en moins de 3 min
$('premShot').addEventListener('change', () => claimFile($('premShot').files[0]));
$('pdDrop').addEventListener('dragover', (e) => { e.preventDefault(); $('pdDrop').classList.add('over'); });
$('pdDrop').addEventListener('dragleave', () => $('pdDrop').classList.remove('over'));
$('pdDrop').addEventListener('drop', (e) => { e.preventDefault(); $('pdDrop').classList.remove('over'); claimFile(e.dataTransfer.files[0]); });
$('premDlg').addEventListener('paste', (e) => claimFile([...e.clipboardData.files][0]));
$('premClaim').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('pdSend');
  if (btn.disabled) return; // un seul envoi, même en double-cliquant
  if (!claimShot) return toast('Ajoute la capture d’écran du paiement PayPal');
  btn.disabled = true; btn.textContent = 'Envoi…';
  const r = await api.premiumClaim?.(e.target.dataset.pack, $('premPaypal').value, claimShot).catch(() => null);
  btn.disabled = false; btn.textContent = 'Envoyer pour vérification';
  if (!r?.ok) return toast(r?.error ?? 'Impossible pour le moment');
  $('premPaypal').value = ''; $('premShot').value = ''; claimShotSet(null);
  $('pdDoneT').textContent = 'Demande envoyée'; $('pdDoneS').textContent = 'On vérifie ton paiement. Tu auras la réponse ici, sans redémarrer.'; $('pdDoneIco').classList.remove('no'); $('pdDoneIco').classList.add('wait');
  const t = $('pdTrack').children; t[1].className = 'now'; t[2].className = ''; $('pdStep2').textContent = 'Vérification';
  e.target.classList.add('sent'); $('pdDone').hidden = false;
});
api.onPremiumOpen?.((pack) => openPremium(pack));
// Overlay demandé alors que Rocket League est en plein écran exclusif : message visible dès le retour sur le launcher
api.onRlFullscreen?.((msg) => ui.confirm({ title: 'Mets ton jeu en fenêtré', text: msg, ok: 'OK', cancel: 'Fermer', icon: '🖥' }));
$('premiumBtn').addEventListener('click', () => openPremium());
addEventListener('focus', () => { if (prem && !prem.dev) loadPremium(true); });
loadPremium();

// ---------- ⚡ Optimiser et jouer : vérifie le PC, applique des réglages temporaires, lance le jeu ----------
let odItem = null;
async function openOptiPlay(item) {
  odItem = item;
  const d = await api.optiPrepare?.(item.id).catch(() => null);
  if (!d) { act('launch'); return; }
  $('odTitle').textContent = `Optimiser ${d.name}`;
  $('odSub').textContent = d.windows ? 'Réglages temporaires : tout est remis comme avant à la fin de la partie' : 'Optimisation disponible sous Windows';
  const g = d.gain;
  $('odStats').innerHTML = `<div><b>${d.base?.avg ?? '–'}</b><small>FPS habituels${d.base ? ` (${d.base.games} partie${d.base.games > 1 ? 's' : ''})` : ''}</small></div><div><b>${d.base?.low1 ?? '–'}</b><small>1 % low habituel</small></div><div class="${g > 0 ? 'up' : g < 0 ? 'down' : ''}"><b>${g != null ? `<svg class="garr" viewBox="0 0 12 14"><path d="${g >= 0 ? 'M6 1 11 7H7.6v6H4.4V7H1Z' : 'M6 13 1 7h3.4V1h3.2v6H11Z'}"/></svg>${g > 0 ? '+' : ''}${g} %` : '–'}</b><small>${g != null ? 'avec l’optimisation' : 'gain mesuré après 2 parties'}</small></div>${d.since ? `<div class="since ${d.since.delta > 0 ? 'up' : d.since.delta < 0 ? 'down' : ''}"><b>${d.since.before.avg} → ${d.since.after.avg} FPS</b><small>avant / après ta 1re optimisation${d.since.before.low1 && d.since.after.low1 ? ` · 1 % low ${d.since.before.low1} → ${d.since.after.low1}` : ''}</small></div>` : ''}`;
  const hist = (d.history ?? []).filter((r) => r.avg);
  if (hist.length >= 2) {
    const max = Math.max(...hist.map((r) => r.avg));
    $('odStats').insertAdjacentHTML('beforeend', `<div class="odspark" title="FPS moyens de tes dernières parties (orange = avec optimisation)">${hist.map((r) => `<i class="${r.boost ? 'b' : ''}" style="height:${Math.max(8, Math.round((100 * r.avg) / max))}%" title="${r.avg} FPS"></i>`).join('')}<small>FPS de tes ${hist.length} dernières parties</small></div>`);
  }
  const icon = { wintweaks: '🎮', fnperf: '🚀', fivemcache: '🧊', close: '🧹', power: '🔋', priority: '🎯', quiet: '🔕', perfbar: '📊', ram: '🧠', disk: '💾', heat: '🌡', driver: '🖥' };
  $('odChecks').innerHTML = d.checks.map((c) => `<label class="odck ${c.level}" ${c.apps ? `data-apps="${esc(c.apps.join(','))}"` : ''}><span class="ico">${c.level === 'ok' ? '✅' : c.level === 'warn' ? '⚠' : icon[c.id] ?? '⚡'}</span><span><b>${esc(c.label)}</b>${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</span>${c.level === 'act' || c.act ? `<input type="checkbox" data-ck="${c.id}" ${c.on ? 'checked' : ''}>` : ''}</label>`).join('');
  $('odRun').hidden = true; $('odChecks').hidden = false; $('odFoot').hidden = false; $('odStats').hidden = false;
  $('odLog').innerHTML = ''; $('odFill').style.width = '0';
  $('optiDlg').showModal();
}
$('odClose').addEventListener('click', () => $('optiDlg').close());
$('odPlain').addEventListener('click', () => { $('optiDlg').close(); if (odItem) { state.sel = odItem; act('launch'); } });
$('odGo').addEventListener('click', async () => {
  if (!odItem) return;
  if (!(await premOk('opti'))) { $('optiDlg').close(); return openPremium('opti'); }
  const on = (k) => Boolean(document.querySelector(`[data-ck="${k}"]`)?.checked);
  const choice = { wintweaks: on('wintweaks'), fnperf: on('fnperf'), fivemcache: on('fivemcache'), close: on('close') ? (document.querySelector('.odck[data-apps]')?.dataset.apps ?? '').split(',').filter(Boolean) : [], power: on('power'), priority: on('priority'), quiet: on('quiet'), perfbar: on('perfbar') };
  $('odChecks').hidden = true; $('odFoot').hidden = true; $('odStats').hidden = true; $('odRun').hidden = false;
  const r = await api.optiLaunch?.(odItem.id, choice).catch(() => null);
  if (r?.ok === false && r.error) toast(`Impossible : ${r.error}`);
  setTimeout(() => $('optiDlg').close(), 1600);
});
let lastStep = null;
api.onOptiStep?.((s) => {
  $('odFill').style.width = `${s.pct}%`; $('odStep').textContent = s.text;
  if (lastStep && lastStep !== s.text) $('odLog').insertAdjacentHTML('beforeend', `<li>${esc(lastStep.replace(/…$/, ''))}</li>`);
  lastStep = s.pct >= 100 ? null : s.text;
});
$('clipsDownload').addEventListener('click', () => api.clipsSite?.());
$('voiceReply').addEventListener('change', (e) => api.setSettings({ voiceReply: e.target.checked }));
$('voiceName').addEventListener('change', (e) => { api.setSettings({ voiceName: e.target.value }); api.voiceSay?.(e.target.value); });
$('voiceTest').addEventListener('click', () => api.voiceSay?.($('voiceName').value));
async function showRemote() {
  const r = await api.remoteGet?.().catch(() => null);
  $('remoteInfo').hidden = !r?.on;
  if (r?.on) $('remoteInfo').innerHTML = r.url ? `Sur ton téléphone (même Wi-Fi), ouvre <b>${esc(r.url)}</b> et entre le code <b>${esc(r.pin)}</b>. Windows peut demander l’autorisation du pare-feu la première fois : clique « Autoriser ».` : 'Aucun réseau Wi-Fi ou Ethernet trouvé sur ce PC.';
}
// Raccourcis modifiables : clic sur un raccourci, puis la nouvelle combinaison (Échap annule, Retour arrière = par défaut)
const HK = { shot: '📸 Capture d’écran', overlay: '📊 Infos en jeu', perfbar: '⚡ Mini-compteur de performances', rocketleague: '🚗 Rocket League en direct', toggle: '🪟 Afficher / ranger le launcher', palette: '🔎 Recherche rapide' };
const hkText = (a) => String(a ?? '').replace('CommandOrControl', 'Ctrl').replace('Shift', 'Maj').replace('PrintScreen', 'Impr. écran').replace(/num(\d)/, 'Pavé $1').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('');
async function showHotkeys() {
  const cur = await api.hotkeysGet?.().catch(() => null);
  if (!cur) return;
  $('hotkeys').innerHTML = Object.entries(HK).map(([k, l]) => `<div class="setrow"><span>${l}</span><button type="button" class="btn ghost sm" data-hk="${k}">${hkText(cur[k])}</button></div>`).join('');
}
$('hotkeys').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hk]'); if (!b) return;
  b.textContent = 'Appuie sur ta combinaison…';
  const onKey = async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;
    document.removeEventListener('keydown', onKey, true);
    if (ev.key === 'Escape') return showHotkeys();
    const NAMED = { ' ': 'Space', Tab: 'Tab', PrintScreen: 'PrintScreen', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Enter: 'Return', '+': 'Plus' };
    const pad = /^Numpad(\d)$/.exec(ev.code)?.[1] ?? { NumpadAdd: 'add', NumpadSubtract: 'sub', NumpadMultiply: 'mult', NumpadDivide: 'div', NumpadDecimal: 'dec' }[ev.code];
    const key = pad != null ? `num${pad}` : NAMED[ev.key] ?? (ev.key.startsWith('Arrow') ? ev.key.slice(5) : /^F\d{1,2}$/.test(ev.key) ? ev.key : ev.key.length === 1 ? ev.key.toUpperCase() : null);
    const accel = ev.key === 'Backspace' ? null : key && [ev.ctrlKey && 'CommandOrControl', ev.altKey && 'Alt', ev.shiftKey && 'Shift', key].filter(Boolean).join('+');
    if (accel !== null && !key) { toast('Touche non prise en charge'); return showHotkeys(); }
    const r = await api.hotkeysSet(b.dataset.hk, accel);
    toast(r?.ok ? '⌨ Raccourci enregistré' : r?.error ?? 'Impossible'); showHotkeys();
  };
  document.addEventListener('keydown', onKey, true);
});
showHotkeys();
$('remoteOn').addEventListener('change', async (e) => { await api.setSettings({ remote: e.target.checked }); showRemote(); });
$('configsRestore').addEventListener('click', async () => { const r = await api.configsRestore(); if (r?.ok) toast(`🎮 Réglages remis : ${r.games.join(', ')}`); else if (!r?.cancelled) toast(r?.error ?? 'Impossible'); });
$('gameMode').addEventListener('change', (e) => api.setSettings({ gameMode: e.target.checked }));
$('dealAlerts').addEventListener('change', (e) => api.setSettings({ dealAlerts: e.target.checked }));
for (const [id, key] of [['widgetGame', 'widgetGame'], ['gamePopups', 'gamePopups'], ['promoDm', 'promoDm'], ['streamerAuto', 'streamerAuto'], ['streamerOn', 'streamer']]) $(id).addEventListener('change', (e) => api.setSettings({ [key]: e.target.checked }).then(() => api.streamer?.()).then((on) => { if (on != null) document.body.classList.toggle('streamer', Boolean(on)); }));
// Mode streamer : pseudos des amis floutés tant qu'un logiciel de live tourne (ou si le mode est forcé)
api.streamer?.().then((on) => document.body.classList.toggle('streamer', Boolean(on))).catch(() => {});
api.onStreamer?.((on) => { document.body.classList.toggle('streamer', Boolean(on)); if (on) toast('🔴 Mode streamer : notifications coupées, pseudos masqués'); });
$('discordStatus').addEventListener('change', (e) => api.setSettings({ discordStatus: e.target.checked }));
$('shareActivity').addEventListener('change', (e) => api.setSettings({ shareActivity: e.target.checked }));
$('friendNotifs').addEventListener('change', (e) => api.setSettings({ friendNotifs: e.target.checked }));
personal = initPersonal(api, { items: () => state.items, card, go, toast });
initSettings(api);
moreUi = initMore(api, { $, esc, toast, ui, setModal, state, rich: richText, prem: () => prem, pro: () => pro, redraw: () => renderProTicket(false), setPro: (s) => { pro = s; renderPro(false); } });
initQuickSupport(api, 'launcher');
document.addEventListener('visibilitychange', () => document.body.classList.toggle('ui-paused', document.hidden));
const sfxSave = () => { const c = { sfxOn: $('sfxOn').checked, sfxNotif: $('sfxNotif').checked, sfxVol: Number($('sfxVol').value) }; window.sfx?.set({ on: c.sfxOn, notif: c.sfxNotif, vol: c.sfxVol / 100 }); api.setSettings(c); };
['sfxOn', 'sfxNotif'].forEach((id) => $(id).addEventListener('change', sfxSave));
$('sfxVol').addEventListener('change', () => { sfxSave(); window.sfx?.play('success'); });
document.querySelectorAll('[data-sfxtry]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const was = window.sfx.get(); window.sfx.set({ on: true, notif: true }); window.sfx.play(b.dataset.sfxtry); window.sfx.set(was); }));
$('textScale').addEventListener('change', (e) => api.setSettings({ textScale: Number(e.target.value) }));
// ---------- Ambiance de saison : Halloween en octobre (toiles qui bougent, araignées, citrouilles Blender, chauves-souris) ----------
function applySeason(mode) {
  const month = new Date().getMonth();
  const noel = mode !== 'off' && (month === 11 || mode === 'noel'); // Noël en décembre : rouge et vert sapin, neige qui tombe
  document.getElementById('noel')?.remove();
  if (noel) { document.body.dataset.season = 'noel'; document.body.insertAdjacentHTML('beforeend', `<div id="noel" aria-hidden="true">${Array.from({ length: 40 }, () => `<i style="left:${Math.random() * 100}%;--d:${8 + Math.random() * 10}s;--w:${-Math.random() * 18}s;--s:${2 + Math.random() * 4}px;--x:${-30 + Math.random() * 60}px"></i>`).join('')}</div>`); }
  const on = mode !== 'off' && !noel && (month === 9 || mode === 'halloween');
  if (!noel) document.body.dataset.season = on ? 'halloween' : '';
  document.getElementById('halloween')?.remove();
  for (const img of document.querySelectorAll('img[src="logo.png"], img[data-logo]')) { img.dataset.logo = '1'; img.src = on ? 'halloween/logo.png' : 'logo.png'; } // logo d'Halloween
  if (!on) return;
  const web = (cls, s, rot) => { // toile en coin : rayons + fils en arc
    const rays = 7, rings = 6, R = 100; let d = '';
    for (let k = 1; k <= rings; k++) {
      const r = (R * k) / rings;
      const pts = Array.from({ length: rays }, (_, j) => { const a = (j / (rays - 1)) * Math.PI / 2; return [r * Math.cos(a), r * Math.sin(a)]; });
      d += `M${pts[0]}` + pts.slice(1).map((p, j) => { const q = pts[j]; const m = [(p[0] + q[0]) / 2 * .9, (p[1] + q[1]) / 2 * .9]; return ` Q${m} ${p}`; }).join('');
    }
    const lines = Array.from({ length: rays }, (_, j) => { const a = (j / (rays - 1)) * Math.PI / 2; return `<line x1="0" y1="0" x2="${R * Math.cos(a)}" y2="${R * Math.sin(a)}"/>`; }).join('');
    return `<svg class="web ${cls}" style="--s:${s}px" viewBox="0 0 100 100"><g transform="${rot}">${lines}<path d="${d}"/></g></svg>`;
  };
  document.body.insertAdjacentHTML('beforeend', `<div id="halloween" aria-hidden="true">${web('tr', 92, '')}${web('bl', 84, 'translate(0 100) scale(1 -1)')}</div>`);
}
$('season').addEventListener('change', (e) => { applySeason(e.target.value); api.setSettings({ season: e.target.value }); });
api.settings?.().then((s) => { $('season').value = s?.season === 'off' ? 'off' : 'auto'; applySeason($('season').value); }).catch(() => applySeason('auto'));
$('compact').addEventListener('change', (e) => { document.body.classList.toggle('compact', e.target.checked); api.setSettings({ compact: e.target.checked }); });
$('dnd').addEventListener('change', (e) => api.setSettings({ dnd: e.target.checked }).then(() => { window.sfx?.set({ notif: !e.target.checked && $('sfxNotif').checked }); toast(e.target.checked ? '⛔ Ne pas déranger activé' : 'Notifications réactivées'); }));
$('tournament').addEventListener('change', (e) => api.setSettings({ tournament: e.target.checked }).then(() => toast(e.target.checked ? '🏆 Mode tournoi : boost sur chaque partie, zéro notification' : 'Mode tournoi désactivé')));
$('libExport').addEventListener('click', async () => { const r = await api.libExport(); if (r?.ok) toast('📤 Bibliothèque exportée'); });
$('libImport').addEventListener('click', async () => {
  const button = $('libImport'); button.disabled = true;
  $('libImportStatus').textContent = 'Choisis une sauvegarde History (.json) dans la fenêtre de fichiers.';
  try {
    const r = await api.libImport?.();
    $('libImportStatus').textContent = r?.ok ? '✓ Bibliothèque importée.' : r?.error ?? (r ? 'Import annulé. Tu peux choisir un autre fichier.' : 'L’import est disponible dans l’application History Launcher.');
    if (r?.ok) { toast('📥 Bibliothèque importée'); api.settings().then(showKeys); }
  } catch { $('libImportStatus').textContent = 'Impossible d’importer ce fichier. Réessaie avec une sauvegarde History.'; }
  finally { button.disabled = false; }
});
$('micTest').addEventListener('click', async (e) => {
  e.preventDefault();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return toast('Micro inaccessible : autorise-le dans Windows (Confidentialité › Microphone)'); }
  const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize); let peak = 0; const end = Date.now() + 6000;
  toast('🎙 Parle pendant 6 secondes…');
  (function loop() {
    an.getByteTimeDomainData(buf);
    const lvl = Math.min(100, Math.round(Math.max(...buf.map((v) => Math.abs(v - 128))) / 1.28));
    peak = Math.max(peak, lvl);
    $('micLvl').style.width = `${lvl}%`;
    if (Date.now() < end) requestAnimationFrame(loop);
    else { stream.getTracks().forEach((t) => t.stop()); ctx.close(); $('micLvl').style.width = '0'; toast(peak < 8 ? '🎙 Aucun son capté : vérifie le micro choisi dans Windows' : peak > 95 ? '🎙 Micro qui sature : baisse son volume dans Windows' : '🎙 Micro OK 👍'); }
  })();
});

// Assistant : bulle en bas à droite, qui s'ouvre et se referme
function openAssistant(open = !$('aipop').classList.contains('open')) {
  $('aipop').classList.toggle('open', open);
  if (open) setTimeout(() => $('askInput').focus(), 50);
}
$('aifab').addEventListener('click', () => openAssistant());
$('aiPayBtn').addEventListener('click', () => { openAssistant(false); openPremium('ia'); });
$('fold').addEventListener('click', () => openAssistant(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openAssistant(false); });

// Voix : écoute « Hey History » (Windows) et bouton micro
$('voiceToggle').addEventListener('change', async (e) => {
  await api.setVoice?.(e.target.checked);
  $('voiceState').textContent = e.target.checked ? 'Démarrage de l’écoute…' : '';
  document.body.classList.toggle('listening', e.target.checked);
});
api.onVoice?.((kind, v) => {
  if (kind === 'state') {
    const text = { pret: '🎙 J’écoute : dis « Hey History, lance… »', ecoute: '🎙 Oui ? Je t’écoute…', erreur: `⚠️ ${v.message ?? 'Erreur du micro'}`, arret: 'Écoute arrêtée.', off: '' }[v.state] ?? '';
    $('voiceState').textContent = text;
    document.body.classList.toggle('listening', v.state === 'pret' || v.state === 'ecoute');
    if (v.state === 'erreur') $('voiceToggle').checked = false;
  }
  if (kind === 'heard') { openAssistant(true); say(`🎙 ${v.text}`, 'me'); }
  if (kind === 'reply') applyReply(v);
  if (kind === 'record') recordCommand({ auto: true });
});
// Micro : enregistrement puis transcription par Gemini. En automatique (après « Hey History »), l'enregistrement
// s'arrête tout seul après 1,2 s de silence une fois qu'on a parlé (8 s au maximum).
let recorder = null;
async function recordCommand({ auto = false } = {}) {
  if (recorder) { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    let ctx = null;
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close();
      $('micBtn').classList.remove('rec');
      document.body.classList.remove('recording');
      recorder = null;
      const buf = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer());
      if (buf.length < 2000) return;
      const wait = say('🎙 …', 'wait');
      const r = await api.transcribe(buf, 'audio/webm').catch(() => ({ reply: 'Micro indisponible.' }));
      wait.remove();
      if (r.heard) say(`🎙 ${r.heard}`, 'me');
      applyReply(r);
    };
    recorder.start(250);
    $('micBtn').classList.add('rec');
    document.body.classList.add('recording');
    if (auto) {
      openAssistant(true);
      say('🎙 Je t’écoute…', 'wait').classList.add('listen');
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      let spoke = false; let quietSince = performance.now(); const start = performance.now();
      const watch = () => {
        if (!recorder || recorder.state !== 'recording') return;
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const level = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (level > 6) { spoke = true; quietSince = now; }
        if ((spoke && now - quietSince > 1200) || now - start > 8000 || (!spoke && now - start > 4000)) { document.querySelectorAll('.msg.listen').forEach((m) => m.remove()); recorder.stop(); return; }
        requestAnimationFrame(watch);
      };
      watch();
    } else setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 8000);
  } catch {
    toast('Micro inaccessible : autorise-le dans Windows (Paramètres › Confidentialité › Microphone).');
  }
}
$('micBtn').addEventListener('click', () => recordCommand());

// ---------- Compte ----------
let authMode = 'connexion';
function showAuth(show) { $('auth').hidden = !show; if (show) setTimeout(() => $('aEmail').focus(), 50); }
function setAccount(c) {
  state.account = c;
  const name = c?.pseudo ?? state.profile;
  $('profileName').textContent = name;
  setAv($('avatar'), c ? { pseudo: name, ...(c.profile ?? {}) } : name);
  $('profileSub').innerHTML = c ? '<i class="online"></i>Compte History' : 'Pas connecté · se connecter';
}
$('authTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  authMode = b.dataset.auth;
  document.querySelectorAll('#authTabs button').forEach((x) => x.classList.toggle('on', x === b));
  $('pseudoField').hidden = authMode !== 'inscription';
  $('authGo').textContent = authMode === 'inscription' ? 'Créer mon compte' : 'Se connecter';
  $('aPass').autocomplete = authMode === 'inscription' ? 'new-password' : 'current-password';
  $('authErr').textContent = '';
});
// Même règle que le serveur : affichée pendant la saisie (inscription)
function passwordProblem(p) {
  if (p.length < 8) return `Encore ${8 - p.length} caractère${8 - p.length > 1 ? 's' : ''} minimum`;
  if (/^(.)\1+$/.test(p) || ['12345678', '123456789', 'password', 'motdepasse', 'azertyui', 'azertyuiop', 'azerty123', 'abcd1234'].includes(p.toLowerCase())) return 'Trop facile à deviner';
  const kinds = [/\p{L}/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(p)).length;
  if (kinds < 2 && p.length < 10) return 'Ajoute un chiffre ou un symbole (ou fais 10 caractères)';
  return null;
}
$('aPass').addEventListener('input', () => {
  const p = $('aPass').value;
  if (authMode !== 'inscription' || !p) { $('passHint').textContent = ''; return; }
  const bad = passwordProblem(p);
  const strong = !bad && p.length >= 12 && /\d/.test(p) && /[^\p{L}\d]/u.test(p);
  $('passHint').textContent = bad ?? (strong ? '✅ Mot de passe solide' : '✅ Mot de passe valide');
  $('passHint').className = `passhint ${bad ? 'bad' : 'good'}`;
});
$('aEye').addEventListener('click', () => { const a = $('aPass'); a.type = a.type === 'password' ? 'text' : 'password'; $('aEye').textContent = a.type === 'password' ? '👁' : '🙈'; });
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authErr').textContent = '';
  $('authGo').disabled = true;
  const body = { pseudo: $('aPseudo').value.trim(), email: $('aEmail').value.trim(), motDePasse: $('aPass').value };
  if (authMode === 'inscription') {
    const bad = body.pseudo.length < 3 ? 'Le pseudo doit faire au moins 3 caractères.' : passwordProblem(body.motDePasse);
    if (bad) { $('authErr').textContent = bad; $('authGo').disabled = false; return; }
  }
  const r = await (authMode === 'inscription' ? api.register(body) : api.login(body)).catch(() => ({ error: 'Erreur réseau.' }));
  $('authGo').disabled = false;
  if (r.need2fa) { $('aPass').value = ''; return openStep('2fa', { ticket: r.ticket }); }
  if (!r.ok) { $('authErr').textContent = r.error ?? 'Erreur.'; window.sfx?.play('error'); return; }
  $('aPass').value = '';
  loggedInUi(r, authMode === 'inscription');
});
function loggedInUi(r, isNew) {
  setAccount(r.compte);
  window.sfx?.play('success');
  if (r.compte && r.compte.verified === false) return openStep('verif');
  showAuth(false);
  toast(isNew ? `Bienvenue ${r.compte.pseudo} ! 🎉` : `Content de te revoir, ${r.compte.pseudo} !`);
  if (r.recoveryLeft != null) toast(`Code de secours utilisé : il t’en reste ${r.recoveryLeft}`);
}
// Étapes : code de double authentification, vérification de l'e-mail, mot de passe oublié
let step = null;
const STEPS = {
  lock: { title: '🔒 Déverrouille History', text: 'Ton compte est protégé par la double authentification : entre le code à 6 chiffres de ton application (ou un code de secours) pour ouvrir le launcher.', go: 'Déverrouiller', resend: false, back: 'Se déconnecter' },
  '2fa': { title: '🛡 Double authentification', text: 'Entre le code à 6 chiffres de ton application d’authentification (ou un code de secours).', go: 'Se connecter', resend: false },
  verif: { title: '✉ Vérifie ton e-mail', text: 'On t’a envoyé un code à 6 chiffres par e-mail (regarde aussi les spams).', go: 'Valider mon e-mail', resend: true },
  oubli: { title: '🔑 Mot de passe oublié', text: 'Entre ton e-mail : on t’envoie un code pour choisir un nouveau mot de passe.', go: 'Recevoir le code', resend: false, email: true, nocode: true },
  reset: { title: '🔑 Nouveau mot de passe', text: 'Entre le code reçu par e-mail et ton nouveau mot de passe.', go: 'Changer le mot de passe', resend: false, pass: true },
};
function openStep(kind, data = {}) {
  step = { kind, ...data };
  const d = STEPS[kind];
  showAuth(true);
  $('authForm').hidden = true; $('authTabs').hidden = true; $('authForgot').hidden = true;
  $('authStep').hidden = false;
  $('stepTitle').textContent = d.title; $('stepText').textContent = d.text; $('stepGo').textContent = d.go;
  $('stepEmailF').hidden = !d.email; $('stepPassF').hidden = !d.pass; $('stepCode').hidden = Boolean(d.nocode);
  $('stepResend').hidden = !d.resend; $('stepErr').textContent = ''; $('stepCode').value = ''; $('stepPass').value = '';
  if (d.email) $('stepEmail').value = $('aEmail').value;
  $('stepBack').textContent = d.back ?? 'Retour';
  setTimeout(() => (d.email ? $('stepEmail') : $('stepCode')).focus(), 50);
}
function closeStep() {
  step = null;
  $('authStep').hidden = true; $('authForm').hidden = false; $('authTabs').hidden = false; $('authForgot').hidden = false;
}
$('authForgot').addEventListener('click', () => openStep('oubli'));
$('stepBack').addEventListener('click', async () => {
  if (step?.kind === 'lock') { await api.logout?.(); setAccount(null); closeStep(); showAuth(true); return toast('Déconnecté'); }
  if (step?.kind === 'verif') { closeStep(); showAuth(false); toast('Tu pourras vérifier ton e-mail dans Paramètres › Compte'); } else closeStep();
});
$('stepResend').addEventListener('click', async () => { const r = await api.verifyResend(); toast(r?.ok ? 'Nouveau code envoyé ✉' : r?.error ?? 'Impossible'); });
$('authStep').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!step) return;
  $('stepGo').disabled = true; $('stepErr').textContent = '';
  const code = $('stepCode').value.trim();
  let r;
  if (step.kind === '2fa') r = await api.login2fa(step.ticket, code);
  if (step.kind === 'lock') r = await api.unlock2fa(code);
  if (step.kind === 'verif') r = await api.verifyEmail(code);
  if (step.kind === 'oubli') r = await api.forgotPassword($('stepEmail').value.trim());
  if (step.kind === 'reset') {
    const bad = passwordProblem($('stepPass').value);
    r = bad ? { ok: false, error: bad } : await api.resetPassword(step.email, code, $('stepPass').value);
  }
  $('stepGo').disabled = false;
  if (!r?.ok) { $('stepErr').textContent = r?.error ?? 'Erreur.'; window.sfx?.play('error'); return; }
  if (step.kind === '2fa') { closeStep(); return loggedInUi(r, false); }
  if (step.kind === 'lock') { closeStep(); showAuth(false); window.sfx?.play('success'); toast(`🔓 Content de te revoir, ${state.account?.pseudo ?? ''} !`); if (r.recoveryLeft != null) toast(`Code de secours utilisé : il t’en reste ${r.recoveryLeft}`); return; }
  if (step.kind === 'verif') { closeStep(); setAccount(r.compte); showAuth(false); window.sfx?.play('success'); return toast('E-mail vérifié ✓'); }
  if (step.kind === 'oubli') { if (r.mail === false) { $('stepErr').textContent = 'L’envoi d’e-mails n’est pas encore activé sur le serveur.'; return; } return openStep('reset', { email: $('stepEmail').value.trim() }); }
  if (step.kind === 'reset') { const mail = step.email; closeStep(); window.sfx?.play('success'); $('aEmail').value = mail; toast('Mot de passe changé : connecte-toi avec le nouveau'); }
});
// Paramètres › Compte : état et double authentification
function showSecurity() {
  const c = state.account;
  $('secState').textContent = !c ? 'Connecte-toi pour gérer la sécurité.' : `${c.email} · ${c.verified === false ? '✉ e-mail à vérifier' : '✓ e-mail vérifié'} · ${c.twoFactor ? '🛡 double authentification activée' : 'double authentification désactivée'}`;
  $('secVerify').hidden = !c || c.verified !== false;
  $('sec2fa').hidden = !c;
  $('sec2fa').textContent = c?.twoFactor ? '🛡 Désactiver la double authentification' : '🛡 Activer la double authentification';
  $('lock2faRow').hidden = !c?.twoFactor;
  api.settings?.().then((s) => { $('lock2fa').checked = s?.lock2fa === true; }).catch(() => {});
}
$('fpsOn').addEventListener('change', async (e) => { if (e.target.checked) { e.target.checked = false; await enableFps(); const st = await api.settings(); e.target.checked = st?.fps === true; } else { await api.fpsDisable(); toast('Mesure des FPS coupée'); } });
$('widgetOn').addEventListener('change', (e) => { api.setSettings({ widget: e.target.checked }); $('widgetTopRow').hidden = !e.target.checked; });
$('widgetTop').addEventListener('change', (e) => api.setSettings({ widgetTop: e.target.checked }));
$('batterySaver').addEventListener('change', (e) => api.setSettings({ batterySaver: e.target.checked }).then(() => toast(e.target.checked ? '🔋 Économie sur batterie activée' : 'Économie sur batterie coupée')));
$('gamepad').addEventListener('change', (e) => { state.gamepadOn = e.target.checked; api.setSettings({ gamepad: e.target.checked }); });
$('priceBtn').addEventListener('click', () => { $('settings').close(); openPrices(); });
api.onSettingsChanged?.((c) => { if ('widget' in c) { $('widgetOn').checked = c.widget; $('widgetTopRow').hidden = !c.widget; } });
// ---------- 💸 Alertes de prix ----------
async function openPrices() {
  const list = await api.priceList().catch(() => []);
  const eur = (v) => (v == null ? '?' : `${Number(v).toFixed(2).replace('.', ',')} €`);
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">💸</span><h2>Alertes de prix</h2></div>
    <p class="hint">Tu es prévenu dès qu’un jeu passe sous ton prix sur Steam (vérifié toutes les 6 h). Le meilleur prix ailleurs (Epic, GOG, Humble…) vient de CheapShark, en dollars.</p>
    <div class="addfriend"><input id="priceQ" placeholder="Nom du jeu ou lien Steam" maxlength="120"><button class="btn play" type="button" id="priceFind">Chercher</button></div>
    <div class="flist" id="priceRes"></div>
    <b class="sub">Suivis</b>
    <div class="flist">${list.length ? list.map((a) => `<div><div><b>${esc(a.name)}</b><small>Steam : ${a.last?.free ? 'gratuit' : `${eur(a.last?.price)}${a.last?.discount ? ` (-${a.last.discount} %)` : ''}`} · alerte sous ${eur(a.target)}${a.best ? ` · ailleurs : ${a.best.price} $ sur ${esc(a.best.store)}${a.best.cheapest ? ` (record ${a.best.cheapest} $)` : ''}` : ''}</small></div><button class="btn ghost sm" data-unprice="${esc(a.appId)}">Retirer</button></div>`).join('') : '<p class="hint">Aucun jeu suivi.</p>'}</div>
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  if (!$('modal').open) $('modal').showModal();
  const find = async () => {
    const r = await api.priceSearch($('priceQ').value);
    $('priceRes').innerHTML = r.length ? r.map((g) => `<div><div><b>${esc(g.name)}</b><small>${g.price != null ? `${eur(g.price)} sur Steam` : ''}</small></div><button class="btn play sm" data-track="${esc(g.id)}" data-name="${esc(g.name)}">Suivre</button></div>`).join('') : '<p class="hint">Rien trouvé.</p>';
  };
  $('priceFind').onclick = find;
  $('priceQ').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
  $('modalBox').onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.m) return $('modal').close();
    if (t.dataset.unprice) { await api.priceSet(t.dataset.unprice, '', null); return openPrices(); }
    if (t.dataset.track) {
      const v = await ui.prompt({ title: `Prévenir sous quel prix ?`, text: `${t.dataset.name} : prix en euros.`, placeholder: '19,99', ok: 'Suivre', icon: '💸' });
      const target = Number(String(v ?? '').replace(',', '.'));
      if (!v || !Number.isFinite(target)) return openPrices();
      await api.priceSet(t.dataset.track, t.dataset.name, target);
      toast('💸 Prix suivi');
      return openPrices();
    }
  };
}
$('lock2fa').addEventListener('change', (e) => api.setSettings({ lock2fa: e.target.checked }).then(() => toast(e.target.checked ? '🔒 Le code sera demandé à chaque ouverture' : 'Le code ne sera demandé qu’à la connexion')));
$('secVerify').addEventListener('click', async () => { $('settings').close(); await api.verifyResend(); openStep('verif'); });
$('sec2fa').addEventListener('click', async () => {
  $('settings').close();
  if (state.account?.twoFactor) {
    const pw = await ui.prompt({ title: 'Désactiver la double authentification', text: 'Ton mot de passe :', placeholder: 'Mot de passe', ok: 'Continuer', icon: '🛡' });
    if (!pw) return;
    const code = await ui.prompt({ title: 'Code de l’application', text: 'Le code à 6 chiffres (ou un code de secours) :', placeholder: '000000', ok: 'Désactiver', icon: '🛡' });
    if (!code) return;
    const r = await api.twoFaOff(pw, code);
    if (r?.compte) setAccount(r.compte);
    return toast(r?.ok ? 'Double authentification désactivée' : r?.error ?? 'Impossible');
  }
  const s = await api.twoFaStart();
  if (!s?.ok) return toast(s?.error ?? 'Impossible');
  setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🛡</span><h2>Double authentification</h2></div>
    <div class="qrwrap"><img src="${esc(s.qr)}" alt="QR code"><div><p>1. Ouvre ton application d’authentification (Google Authenticator, Microsoft Authenticator, Authy, 2FAS…).</p><p>2. Scanne ce QR code, ou entre la clé :</p><code>${esc(s.secret.replace(/(.{4})/g, '$1 ').trim())}</code></div></div>
    <p>3. Entre le code à 6 chiffres affiché :</p><input id="tfCode" class="codein" inputmode="numeric" maxlength="6" placeholder="000000"><p class="autherr" id="tfErr"></p>
    <div class="row end"><button type="button" class="btn ghost" data-m="1">Annuler</button><button type="button" class="btn play" id="tfGo">Activer</button></div>`;
  $('modal').showModal();
  setTimeout(() => $('tfCode')?.focus(), 50);
  $('modalBox').onclick = async (e) => {
    if (e.target.closest('[data-m]')) return $('modal').close();
    if (!e.target.closest('#tfGo')) return;
    const r = await api.twoFaOn($('tfCode').value.trim());
    if (!r?.ok) { $('tfErr').textContent = r?.error ?? 'Code incorrect'; window.sfx?.play('error'); return; }
    setAccount(r.compte);
    window.sfx?.play('success');
    setModal(), $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>Double authentification activée</h2></div>
      <p>Garde ces <b>codes de secours</b> en lieu sûr : chacun marche une seule fois si tu perds ton téléphone.</p>
      <div class="recov">${r.recovery.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <div class="row end"><button type="button" class="btn" id="tfCopy">Copier</button><button type="button" class="btn play" data-m="1">J’ai noté mes codes</button></div>`;
    $('tfCopy').onclick = () => { copyText(r.recovery.join('\n')); toast('Codes copiés'); };
  };
});
$('authSkip').addEventListener('click', async () => { await api.skipAccount?.(); showAuth(false); });
// Menu du compte (en bas du menu de gauche) : personnaliser le profil ou se déconnecter
$('profileBtn').addEventListener('click', (e) => {
  if (!state.account) return showAuth(true);
  const ctx = $('ctx');
  ctx.innerHTML = `<div class="ctxhead">${esc(state.account.pseudo)}</div><button data-pact="edit">🎨 Personnaliser mon profil</button><button data-pact="friends">👥 Mes amis</button><button data-pact="pair">💻 Connecter un autre PC</button><hr><button class="danger" data-pact="logout">Se déconnecter</button>`;
  ctx.hidden = false;
  const r = $('profileBtn').getBoundingClientRect();
  ctx.style.left = `${r.left}px`;
  ctx.style.top = `${Math.max(8, r.top - ctx.offsetHeight - 8)}px`;
  ctx.classList.remove('show'); void ctx.offsetWidth; ctx.classList.add('show');
  e.stopPropagation();
});
async function profileAction(a) {
  if (a === 'edit') return openProfileEditor();
  if (a === 'friends') return go('amis');
  if (a === 'pair') {
    const code = await ui.prompt({ title: 'Connecter un autre PC', text: 'Sur le nouveau PC, clique sur « Se connecter avec un autre PC » : un code s’affiche. Entre-le ici. Ne le fais que si ce PC est à toi !', value: '', ok: 'Connecter', icon: '💻' });
    if (!code) return;
    const r = await api.pairApprove?.(code);
    return toast(r?.ok ? `✅ ${r.nom} est maintenant connecté à ton compte` : r?.error ?? 'Code refusé');
  }
  if (a === 'logout') {
    if (!(await ui.confirm({ title: 'Se déconnecter ?', text: `Connecté en tant que ${state.account.pseudo} (${state.account.email}).`, ok: 'Se déconnecter', icon: '👤' }))) return;
    await api.logout();
    threads.clear(); try { localStorage.removeItem('hl-threads'); } catch { /* rien */ }
    setAccount(null);
    showAuth(true);
  }
}
api.account?.().then(async (r) => {
  setAccount(r.compte);
  if (!r.compte && !r.skipped) return showAuth(true);
  // Double authentification : l'appli se verrouille à chaque ouverture tant que le code n'est pas donné
  const s = await api.settings?.().catch(() => null);
  // Le code n'est demandé qu'à la connexion au compte, sauf si « à chaque ouverture » est coché
  if (r.compte?.twoFactor && s?.lock2fa === true) openStep('lock');
}).catch(() => {});

// ---------- Données ----------
function renderAll() {
  renderPlatforms();
  renderHero();
  renderHome();
  renderChips();
  if (state.view === 'liste') renderList();
}
function applyLibrary({ items, sources }) {
  const keep = new Map(state.items.map((i) => [i.id, i]));
  state.items = items.map((i) => ({ ...i, details: i.details ?? keep.get(i.id)?.details ?? null, detailsAsked: keep.get(i.id)?.detailsAsked }));
  state.sources = sources;
  const selId = state.sel?.id;
  state.sel = state.items.find((i) => i.id === selId) ?? filterSort(games().filter((i) => i.installed), { sort: 'recents' })[0] ?? filterSort(games(), { sort: 'joues' })[0] ?? null;
}
async function load() {
  // Démarrage instantané : la dernière bibliothèque connue d'abord, le scan complet ensuite
  const cached = await api.cachedLibrary?.().catch(() => null);
  if (cached) { applyLibrary(cached); renderAll(); }
  applyLibrary(await api.scan());
  renderAll();
  if (state.sel && !state.sel.detailsAsked) select(state.sel);
  api.reco?.().then((r) => { state.recos = r ?? []; renderRecos(); }).catch(() => {});
  api.freeGames?.().then((f) => { state.free = f ?? []; renderFree(); }).catch(() => {});
  api.deals?.().then((d) => { state.deals = d ?? []; renderDeals(); }).catch(() => {});
  loadFriends();
  renderUpdates();
  api.news?.().then(renderNews).catch(() => {});
  // Actus, promos et jeux gratuits : remis à jour tout seuls (toutes les 30 min, quand la fenêtre est visible)
  setInterval(() => { if (document.hidden) return; api.news?.().then(renderNews).catch(() => {}); api.freeGames?.().then((f) => { state.free = f ?? []; renderFree(); }).catch(() => {}); }, 30 * 60_000);
  api.recap?.().then((r) => { if (r?.fresh) showRecap(r); else showWhatsNew(); }).catch(() => showWhatsNew()).finally(() => setTimeout(optiReady, 1500));
  api.collections?.().then((c) => { state.cols = c ?? {}; renderCollections(); }).catch(() => {});
}
api.onUpdate?.((lib) => { applyLibrary(lib); renderAll(); });
// Chaque minute : jeux ouverts + temps de jeu à jour (il monte pendant la partie)
api.onActive?.((ids, times) => {
  state.active = new Set(ids);
  for (const [id, t] of Object.entries(times ?? {})) { const it = state.items.find((i) => i.id === id); if (it) { it.minutes = t.minutes; it.lastPlayed = t.lastPlayed; } }
  renderHome(); renderHero();
  if (state.view === 'liste' && Object.keys(times ?? {}).length) renderList();
});
api.settings().then(showKeys);
api.boost?.().then((b) => { boostGames = b?.games ?? {}; }).catch(() => {});
say('Salut ! 👋 Dis-moi ce que tu veux : « lance Rocket League », « ferme Discord », « monte le son », « trie par taille »… Tu peux aussi activer « Hey History » en bas pour me parler.');
load().then(() => {
  renderStats().catch(() => {});
  // Aperçu : #vue=classement ou #sel=Nom
  const h = window.launcher ? '' : decodeURIComponent(location.hash.slice(1));
  if (h?.startsWith('vue=')) go(h.slice(4));
  else if (h?.startsWith('sel=')) select(state.items.find((i) => i.name === h.slice(4)) ?? state.sel);
  if (h?.includes('assistant')) openAssistant(true);
  if (h?.includes('compte')) showAuth(true);
  if (h?.includes('verif')) api.verify(state.items[0].id);
});
refreshMusic();
// Musique : vérifiée seulement quand la fenêtre est visible (rien ne tourne pour rien en arrière-plan)
setInterval(() => { if (!document.hidden) refreshMusic(); }, 8000);
const idle = () => document.body.classList.toggle('idle', document.hidden || !document.hasFocus());
addEventListener('blur', idle); addEventListener('focus', idle);
// Pendant une partie : plus aucune animation ni flou dans le launcher (toute la carte graphique pour le jeu)
api.onGaming?.((on) => document.body.classList.toggle('gaming', Boolean(on))); document.addEventListener('visibilitychange', () => { idle(); if (!document.hidden) refreshMusic(); });
setInterval(() => { if (document.hidden) return; if (state.view === 'stats') renderStats(); if (state.view === 'classement') renderRanking(); }, 60_000);

// ---------- Aperçu hors Electron (données d'exemple, images locales du dossier demo/) ----------
function demoApi() {
  let demoSettings = { autostart: true, gemini: true }; const demoNotes = {}; const demoTickets = [];
  const img = (n) => `demo/${n}`;
  const game = (id, name, source, minutes, days, gb, a) => ({ id, source, kind: 'game', name, installed: gb > 0, installDir: 'C:\\Jeux', size: gb * 1e9, minutes, lastPlayed: Date.now() - days * 86_400_000, art: a });
  const app = (name, category, minutes, icon) => ({ id: `reg:${name}`, source: 'pc', kind: 'app', category, name, installed: true, installDir: 'C:\\Apps', size: 3e8, minutes, lastPlayed: Date.now() - 3_600_000, art: {}, iconData: icon, uninstallCmd: 'x', brand: { Spotify: { color: '#1ed760', logo: 'brands/spotify.svg', bg: 'brands/bg/spotify.png' }, Discord: { color: '#5865f2', logo: 'brands/discord.svg', bg: 'brands/bg/discord.png' }, WinRAR: { color: '#6b3fa0', logo: null, bg: 'brands/bg/winrar.png' }, 'Avast Free Antivirus': { color: '#ff7800', logo: 'brands/avast.svg', bg: 'brands/bg/avast.png' }, 'Google Chrome': { color: '#4285f4', logo: 'brands/googlechrome.svg' }, 'OBS Studio': { color: '#302e31', logo: 'brands/obsstudio.svg' } }[name] ?? null });
  const items = [
    game('steam:271590', 'Grand Theft Auto V', 'steam', 25680, 0, 108.7, { cover: img('c1.jpg'), hero: img('h1.jpg'), logo: img('l1.png') }),
    game('epic:Fortnite', 'Fortnite', 'epic', 18720, 1, 40, { cover: img('c2.jpg'), hero: img('h2.jpg') }),
    Object.assign(game('roblox:player', 'Roblox', 'roblox', 3000, 2, 1, {}), { brand: { color: '#e2231a', logo: 'brands/roblox.svg' } }),
    game('reg:cod', 'Call of Duty', 'pc', 17040, 3, 120, { cover: img('c3.jpg') }),
    game('epic:rl', 'Rocket League', 'epic', 11880, 6, 25, { cover: img('c4.jpg') }),
    game('reg:valorant', 'VALORANT', 'riot', 10560, 2, 30, { hero: img('h2.jpg'), logo: img('l1.png') }),
    { ...game('steam:359550', 'Rainbow Six Siege', 'steam', 9600, 9, 60, { cover: img('c1.jpg') }), updatePending: true },
    app('Spotify', 'musique', 2418, img('i1.png')), app('Discord', 'discussion', 900, img('i2.png')), app('WinRAR', 'appli', 60, null), app('Avast Free Antivirus', 'appli', 30, null), app('Google Chrome', 'appli', 600, img('i3.png')), app('OBS Studio', 'video', 480, null),
  ];
  return {
    friends: async () => ({ ok: true, friends: [
      { id64: '76561198000000001', name: 'Max', avatar: null, online: true, status: 'En jeu', game: 'Rocket League', appid: '252950', lobby: '109775241000000000' },
      { id64: '76561198000000002', name: 'Léa', avatar: null, online: true, status: 'En jeu', game: 'Counter-Strike 2', appid: '730', lobby: null },
      { id64: '76561198000000003', name: 'Sam', avatar: null, online: true, status: 'En ligne', game: null },
      { id64: '76561198000000004', name: 'Zoé', avatar: null, online: false, status: 'Hors ligne', game: null }] }),
    friendAction: async () => ({ ok: true }), openDeal: async () => {},
    recap: async () => ({ fresh: true, minutes: 1260, change: 18, count: 5, top: [{ id: 'steam:271590', name: 'Grand Theft Auto V', minutes: 540 }, { id: 'epic:Fortnite', name: 'Fortnite', minutes: 380 }, { id: 'steam:252950', name: 'Rocket League', minutes: 200 }] }),
    news: async () => [{ appid: '252950', gid: '1', game: 'Rocket League', title: 'Saison 18 : nouvelle arène et Rocket Pass', text: 'La saison 18 arrive avec une arène inédite, de nouvelles voitures et le retour du mode Heatseeker.', at: Date.now() - 86_400_000, patch: false, image: img('h1.jpg') }, { appid: '730', gid: '2', game: 'Counter-Strike 2', title: 'Mise à jour du 24 septembre', text: 'Corrections de bugs sur Mirage, amélioration du netcode et nouvelles options pour la vidéo.', at: Date.now() - 2 * 86_400_000, patch: true, image: img('h2.jpg') }],
    gameNews: async () => [],
    gameHistory: async () => ({ total: 1260, daysPlayed: 14, avg: 90, streak: 3, best: { date: '2026-09-20', minutes: 240 }, days: Array.from({ length: 30 }, (_, n) => ({ date: new Date(Date.now() - (29 - n) * 86_400_000).toISOString().slice(0, 10), minutes: [0, 45, 120, 0, 0, 240, 60][n % 7] * (n > 10 ? 1 : 0.5) })) }), colorOf: async () => '#e5484d',
    collections: async () => ({ c1: { name: 'Avec les potes', items: ['epic:Fortnite', 'riot:valorant'] }, c2: { name: 'À finir', items: ['steam:271590'] } }), saveCollections: async (c) => c,
    pickGame: async () => ({ ok: true, name: 'Mon jeu' }), addGameFile: async () => ({ ok: true, name: 'Mon jeu' }),
    timeToBeat: async () => ({ main: 31.5, extra: 48, complete: 82 }),
    achievements: async () => ({ done: 45, total: 77, easy: [{ name: 'Bienvenue à Los Santos', desc: 'Termine la première mission', pct: 81.2, icon: null }, { name: 'Un peu de sport', desc: 'Joue au tennis', pct: 34.8, icon: null }], recent: [{ name: 'Braquage réussi', desc: 'Termine un braquage', done: true, pct: 22.1, icon: null }] }),
    captures: async () => [{ token: 'a', url: img('h1.jpg'), video: false }, { token: 'b', url: img('h2.jpg'), video: false }, { token: 'c', video: true }],
    hFriends: async () => ({ code: 'Alex#3F9A2C', moi: { week: 610, top: 'Rocket League' }, demandes: [{ id: 'z', pseudo: 'Zoé', code: 'Zoé#11AA22' }],
      amis: [{ id: 'm', pseudo: 'Max', online: true, playing: 'Grand Theft Auto V Enhanced — serveur FiveM RP très long', week: 840, top: 'FiveM', status: 'Soirée RP 🚓 on recrute des flics motivés ce soir', bench: 1420, join: { fivem: 'abc123' }, dispo: Date.now() + 75 * 60_000, color: '#f97316', frame: 'feu', nameFx: 'neon', banner: 'lave', bio: 'Flic le jour, braqueur la nuit. Serveur RP tous les soirs à 21 h.', favGame: 'FiveM', badges: ['rp', 'nuit', 'streamer'], links: { twitch: 'max_rp', discord: 'max.rp', youtube: 'MaxRP', tiktok: 'max.rp' }, since: Date.now() - 200 * 86_400_000 }, { id: 'l', pseudo: 'Léa', online: true, playing: null, week: 300, top: 'VALORANT', status: 'Dispo pour jouer' }, { id: 'k', pseudo: 'UnPseudoVraimentTrèsLongPourTester', online: true, playing: 'Rocket League', since: Date.now() - 5 * 60_000, week: 120, dnd: true, bench: 980 }, { id: 's', pseudo: 'Sam', online: false, playing: null, week: 95, top: 'Fortnite' }],
      groupes: [{ id: 'g1', name: 'Squad RL — les meilleurs du serveur', owner: true, members: [{ id: 'me', pseudo: 'Alex', online: true }, { id: 'm', pseudo: 'Max', online: true, playing: 'FiveM' }, { id: 'l', pseudo: 'Léa', online: true }, { id: 's', pseudo: 'Sam', online: false }, { id: 'a', pseudo: 'Alex', online: false }, { id: 'b', pseudo: 'Bob', online: true }, { id: 'c', pseudo: 'Chloé', online: false }, { id: 'd', pseudo: 'Dan', online: false }] }] }),
    notifs: async () => ({ unread: 3, list: [
      { id: 'n1', at: Date.now() - 60_000, kind: 'msg', cat: 'amis', icon: '💬', title: 'Max', body: 'T’es chaud pour une partie ce soir ? On lance le serveur RP vers 21 h', from: 'm', read: false },
      { id: 'n2', at: Date.now() - 4 * 60_000, kind: 'missed', cat: 'amis', icon: '📵', title: 'Appel manqué de Léa', body: 'Clique pour le rappeler.', from: 'l', read: false },
      { id: 'n3', at: Date.now() - 9 * 60_000, kind: 'invite', cat: 'amis', icon: '📨', title: 'Max t’invite', body: 'Rejoins sa partie de FiveM !', from: 'm', read: false },
      { id: 'n4', at: Date.now() - 3 * 3_600_000, kind: 'app', cat: 'appli', icon: '🔔', title: 'History Launcher v0.21.0 disponible', body: 'Clique pour mettre à jour maintenant (moins d’une minute).', read: true },
      { id: 'n5', at: Date.now() - 30 * 3_600_000, kind: 'share', cat: 'amis', icon: '💾', title: 'Sam t’envoie une sauvegarde', body: 'Minecraft · Monde survie (412 Ko)', read: true, done: 'saveget' }] }),
    chatSend: async (fid, text, cid) => ({ ok: true, id: cid, message: { id: cid, from: 'me', text, at: Date.now() } }), friendJoin: async () => ({ ok: true }), callStart: async () => ({ error: 'Aperçu : pas d’appel' }),
    notifsRead: async () => ({ unread: 0 }), notifsClear: async () => ({ list: [], unread: 0 }), notifsAct: async () => ({ ok: true }),
    chatThread: async () => ({ lu: Date.now() - 60_000, fil: [{ id: 'a1', from: 'm', text: 'Yo ! T’es là ?', at: Date.now() - 3_600_000 }, { id: 'a2', from: 'm', text: 'On lance le serveur RP vers 21 h', at: Date.now() - 3_590_000, reacts: { '🔥': ['me'] } }, { id: 'a3', from: 'me', text: 'Grave, j’arrive dans 10 min', at: Date.now() - 3_500_000, re: { id: 'a2', from: 'm', text: 'On lance le serveur RP vers 21 h' } }, { id: 'a4', from: 'm', text: 'Parfait 👌', at: Date.now() - 3_400_000, reacts: { '👍': ['me'], '😂': ['me'] } }, { id: 'a5', from: 'me', text: 'Je prends la voiture de patrouille', at: Date.now() - 120_000 }] }),
    chatDelete: async () => ({ ok: true }), groupDelete: async () => ({ ok: true }),
    chatRead: async () => ({ ok: true }), chatTyping: async () => ({ ok: true }), chatReact: async () => ({ ok: true }),
    schedList: async () => [{ id: 's1', key: 'g:g1', text: 'On lance la ranked, connectez-vous !', at: Date.now() + 3 * 3_600_000 }], schedAdd: async () => ({ ok: true }), schedDel: async () => ({ ok: true }),
    capturesRecent: async () => [], captureData: async () => null,
    optiPrepare: async () => ({ name: 'Rocket League', windows: true, gain: 12, base: { avg: 187, low1: 121, games: 6 }, history: [180, 176, 190, 184, 205, 211, 187, 214].map((avg, i) => ({ avg, boost: i >= 4 && i !== 6 })), checks: [{ id: 'close', level: 'act', label: 'Fermer 2 applis qui ralentissent le jeu', detail: 'Google Chrome, OneDrive · rouvertes à la fin de la partie', on: true, apps: ['chrome', 'onedrive'] }, { id: 'power', level: 'act', label: 'Mode « Performances élevées » pendant la partie', detail: 'Le processeur ne ralentit plus pour économiser · remis comme avant ensuite', on: true }, { id: 'priority', level: 'act', label: 'Priorité au jeu', detail: 'Le jeu passe devant les autres programmes', on: true }, { id: 'quiet', level: 'act', label: 'Couper les notifications Windows pendant la partie', detail: 'Plus de bulles qui font sortir du plein écran', on: true }, { id: 'perfbar', level: 'act', label: 'Mini-compteur de performances en jeu', detail: 'Tes FPS et le gain par rapport à tes parties d’avant · Ctrl+Alt+P pour le cacher', on: true }, { id: 'ram', level: 'ok', label: 'Mémoire OK (54 % utilisée)', detail: '' }, { id: 'driver', level: 'warn', label: 'Pilote graphique pas à jour', detail: 'Un pilote récent donne souvent plus de FPS · Mon PC' }] }),
    optiLaunch: async () => ({ ok: true }),
    hotkeysGet: async () => ({ shot: 'CommandOrControl+Alt+S', overlay: 'CommandOrControl+Alt+O', perfbar: 'CommandOrControl+Alt+P', toggle: 'CommandOrControl+Alt+H', palette: 'CommandOrControl+Alt+Space' }),
    tools: async () => ({ profile: { enabled: false, close: [], power: 'none' }, apps: [], saveDirs: [], backups: [], received: [], caches: [], perf: [], graphics: { need: 'benchmark' }, fps: false, canMove: false }),
    gameCare: async () => ({ crashes: [{ at: Date.now() - 86_400_000, cause: 'Pilote graphique NVIDIA', fix: 'Mets à jour (ou réinstalle proprement) le pilote NVIDIA, et baisse les réglages graphiques si ça recommence.', module: 'nvwgf2umx.dll' }], loads: [{ ms: 24000 }, { ms: 26000 }, { ms: 41000 }], with: ['a1'] }),
    gameWith: async () => ({ ok: true, with: ['a1'], apps: [{ id: 'a1', name: 'Discord' }, { id: 'a2', name: 'Spotify' }, { id: 'a3', name: 'OBS Studio' }] }),
    diskAlerts: async () => [{ drive: 'D:', free: 6.2e9, total: 1e12, critical: false, idle: [{ id: 'x1', name: 'Red Dead Redemption 2', size: 119e9 }, { id: 'x2', name: 'Call of Duty', size: 92e9 }] }],
    diskHealth: async () => [{ name: 'Samsung SSD 980 PRO 1TB', ssd: true, bus: 'NVMe', size: 1e12, wear: 6, temp: 41, hours: 3120, errors: 0, state: 'ok', notes: [] }, { name: 'WDC WD20EZRZ', ssd: false, bus: 'SATA', size: 2e12, wear: null, temp: 36, hours: 21000, errors: 2, state: 'warn', notes: ['2 erreur(s) de lecture / écriture non corrigée(s).'] }],
    netTest: async () => ({ ping: 18, jitter: 3, loss: 0, down: 412, up: 58, wifi: true, game: { label: 'dernier serveur FiveM', ms: 34 }, grade: 'Excellente', tips: ['Tu es en Wi-Fi : pour jouer en ligne, un câble Ethernet donne un ping plus bas et plus stable.'] }),
    pairStart: async () => ({ code: 'K7Q2-M9XP', ticket: 't' }), pairPoll: async () => ({ waiting: true }),
    groupThread: async () => ({ fil: [{ id: 'g1', from: 'm', text: 'Qui est chaud pour une ranked ce soir ?', at: Date.now() - 7_200_000 }, { id: 'g2', from: 'l', text: 'Moi ! 21 h ?', at: Date.now() - 7_100_000 }, { id: 'g3', from: 'l', text: 'Je ramène Sam aussi', at: Date.now() - 7_080_000 }, { id: 'g4', from: 'me', text: 'Parfait, je lance le serveur', at: Date.now() - 7_000_000 }] }),
    groupSend: async (gid, text, cid) => ({ ok: true, id: cid, message: { id: cid, from: 'me', text, at: Date.now() } }),
    events: async () => ({ soirees: [{ id: 'e1', game: 'Rocket League', at: Date.now() + 5 * 3_600_000, mine: true, organisateur: 'Alex', ma: 'oui', invites: [{ pseudo: 'Max', reponse: 'oui' }, { pseudo: 'Léa', reponse: null }] }, { id: 'e2', game: 'VALORANT', at: Date.now() + 26 * 3_600_000, mine: false, organisateur: 'Léa', ma: null, invites: [{ pseudo: 'Alex', reponse: null }] }] }),
    pc: async () => ({ cpu: { usage: 37, temp: null, name: 'AMD Ryzen 7 5800X' }, ram: { used: 11.2e9, total: 32e9 }, gpu: { name: 'NVIDIA GeForce RTX 3070', usage: 92, temp: 71, vramUsed: 6200, vramTotal: 8192 } }),
    boost: async () => ({ enabled: true, power: true, restore: true, heatAlerts: true, close: ['chrome'], apps: [{ id: 'chrome', label: 'Google Chrome' }, { id: 'edge', label: 'Microsoft Edge' }, { id: 'onedrive', label: 'OneDrive' }, { id: 'office', label: 'Word / Excel / PowerPoint' }] }),
    setBoost: async (b) => b,
    optiAuto: async () => ({ on: true }),
    optiScan: async () => ({ score: 58, label: 'Moyen', free: 84e9, disk: 512e9, recycle: 2.1e9, junk: [{ id: 'temp', group: 'systeme', label: 'Fichiers temporaires de Windows', bytes: 3.4e9 }, { id: 'inetcache', group: 'systeme', label: 'Cache Internet de Windows', bytes: 0.6e9 }, { id: 'chrome-Default', group: 'navigateurs', label: 'Cache de Google Chrome', bytes: 1.3e9, note: 'Mots de passe et historique gardés' }, { id: 'nv-install', group: 'pilotes', label: 'Restes d’installation NVIDIA', bytes: 1.9e9, note: 'Anciens pilotes décompressés' }, { id: 'steam-logs', group: 'jeux', label: 'Journaux de Steam', bytes: 0.2e9 }], orphans: [{ id: 'o1', label: 'Apex Legends', bytes: 12.4e9 }], startup: [{ name: 'Discord', enabled: true, heavy: true }, { name: 'Steam', enabled: true, heavy: true }, { name: 'Pilote tablette', enabled: true, heavy: false }], tweaks: [{ id: 'gamemode', label: 'Mode Jeu de Windows activé', help: 'Windows donne la priorité au jeu en cours.', on: true }, { id: 'dvr', label: 'Enregistrement en arrière-plan de la Xbox Game Bar coupé', help: 'Évite que Windows filme en continu pendant les parties (gain de FPS).', on: false }], }),
    optiRun: async () => ({ ok: true, freed: 20.8e9, tweaks: 1, score: 93 }), optiStartup: async () => ({ ok: true, startup: [] }), optiTweak: async () => ({ ok: true, tweaks: [] }), optiDeep: async () => ({ ok: true, freed: 6e9 }),
    cleanScan: async () => [{ id: 'temp', label: 'Fichiers temporaires de Windows', bytes: 3.4e9 }, { id: 'nvdx', label: 'Cache NVIDIA (DirectX)', bytes: 1.1e9, note: 'Recréé au prochain lancement des jeux' }, { id: 'discord', label: 'Cache de Discord', bytes: 420e6, note: 'Ferme Discord pour tout vider' }],
    cleanRun: async () => ({ ok: true, freed: 4.9e9 }),
    deals: async () => [{ appid: '1', name: 'Jeu en promo', pct: 75, price: '4,99€', before: '19,99€', image: img('h1.jpg') }],
    premiumGet: async () => ({ ia: false, opti: false, logged: true, code: 'AMI-7KQ2PX', trialUsed: false }), premiumBuy: async () => ({ ok: true }), premiumTrial: async () => ({ ok: true }), premiumRedeem: async () => ({ ok: true, pack: 'pack' }),
    version: async () => '0.57.3',
    storeSearch: async () => [{ name: 'Fortnite', src: 'epic', img: null, url: 'https://store.epicgames.com/fr/p/fortnite' }],
    scanDrives: async () => [{ letter: 'C', size: 1e12, used: 6.2e11, system: true }, { letter: 'D', size: 2e12, used: 9e11, system: false }],
    freeGames: async () => [{ name: 'Jeu gratuit', slug: 'jeu', image: img('h2.jpg'), now: true, until: Date.now() + 5 * 86_400_000 }, { name: 'Prochain jeu', slug: 'prochain', image: img('h1.jpg'), now: false, from: Date.now() + 5 * 86_400_000 }], openFree: async () => {},
    scan: async () => ({ items, sources: { steam: { label: 'Steam', color: '#66c0f4', logo: 'brands/steam.svg', bg: '#1b2838' }, epic: { label: 'Epic Games', color: '#e6e6e6', logo: 'brands/epicgames.svg', bg: '#2a2a2a' }, riot: { label: 'Riot', color: '#ff4655', logo: 'brands/riotgames.svg', bg: '#eb0029' }, roblox: { label: 'Roblox', color: '#e2231a', logo: 'brands/roblox.svg', bg: '#e2231a' }, pc: { label: 'PC', color: '#9aa0aa', logo: 'brands/windows.svg', bg: '#0078d4' } } }),
    gameUpdateProgress: async () => ({phase:'download',percent:42,bytes:420000000,total:1000000000,label:'Téléchargement · démonstration'}), gameUpdateDownloads: async () => true,
    action: async () => ({ ok: true }), setItem: async () => ({}), settings: async () => demoSettings, setSettings: async (s) => (demoSettings = { ...demoSettings, ...s }), notebook: async (id) => demoNotes[id] ?? {}, saveNotebook: async (id,note) => { demoNotes[id] = note; return { ok: true }; }, supportDiagnostic: async () => ({ version: '0.53.16', cpu: 'AMD Ryzen 7 7800X3D', gpu: 'NVIDIA GeForce RTX 4070', memoryGB: 32, health: 86, cpuTempMax: 71, gpuTempMax: 68 }), supportList: async () => ({ tickets: demoTickets }), supportSend: async (body) => { demoTickets.unshift({ ...body, at: Date.now(), status: 'received', reply: 'Demande de démonstration : aucun envoi réel.' }); return { ok: true }; }, win: () => {},
    details: async () => ({ developers: ['Rockstar North'], screenshots: [img('h1.jpg'), img('c2.jpg'), img('h2.jpg')], achievements: { done: 45, total: 77 } }),
    reco: async () => [1, 2, 3, 4, 5].map((n) => ({ name: `Jeu recommandé ${n}`, why: 'Même style que GTA V', steamId: String(n), art: { header: img(n % 2 ? 'h1.jpg' : 'h2.jpg') } })),
    stats: async () => ({ split: { jeux: 1814, applis: 454, musique: 151, autres: 101 }, top: items.map((i) => ({ name: i.name, minutes: i.minutes })), recent: { 'reg:valorant': 300, 'steam:271590': 240, 'epic:Fortnite': 120, 'epic:rl': 60 }, profile: 'Alex' }),
    nowPlaying: async () => ({ player: 'Spotify', artist: 'Bir Hakeim', title: 'Cherry Pie', playing: true, cover: img('c4.jpg'), duration: 192 }),
    mediaKey: async () => true, platformAccounts: async () => ({ steam: [{ id: '1', name: 'Alex', recent: true }, { id: '2', name: 'Petit frère' }], epic: [], chosen: { steam: '1', epic: null }, total: false }), setPlatformAccounts: async () => ({}),
    onVerify: (fn) => { demoVerify = fn; },
    verify: async (id) => {
      const name = items.find((i) => i.id === id)?.name ?? 'Jeu';
      demoVerify?.({ id, name, phase: 'start' });
      demoVerify?.({ id, name, phase: 'run', done: 1840, total: 3120, bytes: 64.2e9, totalBytes: 108.7e9, file: 'x64a.rpf' });
      if (location.hash.includes('fin')) demoVerify?.({ id, name, phase: 'done', canRepair: true, result: { mode: 'complet', ok: false, checked: 3117, missing: ['update/x64/dlcpacks/patchday27ng/dlc.rpf'], corrupt: ['x64a.rpf', 'common.rpf'], sizes: [] } });
      return {};
    },
    account: async () => (location.hash.includes('connecte') ? { compte: { id: 'me', pseudo: 'Alex', email: 'alex@exemple.fr', profile: { color: '#8b5cf6', bio: 'RP tous les soirs, main support', avatar: null, frameColor: '#22c55e', frame: 'galaxie', nameFx: 'degrade', banner: 'synthwave', badges: ['fondateur', 'rp'], favGame: 'Rocket League', links: { twitch: 'noam_tv' } } } } : { compte: null, skipped: true }),
    saveProfile: async (p) => ({ ok: true, compte: { id: 'me', pseudo: 'Alex', email: 'alex@exemple.fr', profile: { color: p.couleur, bio: p.bio, avatar: null } } }), register: async (b) => ({ ok: true, compte: { pseudo: b.pseudo, email: b.email } }), login: async () => ({ ok: false, error: 'E-mail ou mot de passe incorrect.' }), skipAccount: async () => ({}), setVoice: async () => ({}), ask: async (t) => ({ reply: `(aperçu) Je m’occupe de « ${t} ».`, action: 'none' }), openReco: async () => {},
  };
}

// ---------- 🎮 Manette : croix / stick = se déplacer, A = valider, B = retour, X = jouer, Y = menu du jeu,
// LB / RB = page précédente / suivante, Start = recherche. Ne tourne que si une manette est branchée. ----------
(() => {
  const NAV = ['accueil', 'jeux', 'applis', 'favoris', 'stats', 'classement', 'amis', 'pc', 'optimisation'];
  const prev = {}; let raf = null; let lastMove = 0;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const scope = () => [...document.querySelectorAll('dialog[open]')].at(-1) ?? document;
  const targets = () => [...scope().querySelectorAll('button:not([disabled]), [data-id], input, textarea, select, .side [data-view]')].filter((el) => visible(el) && !el.closest('[hidden]'));
  function focusEl(el) {
    if (!el) return;
    document.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus'));
    if (!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|A)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true }); el.classList.add('padfocus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  function move(dx, dy) {
    const list = targets(); const cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) return focusEl(list.find((el) => el.closest('main')) ?? list[0]);
    const a = cur.getBoundingClientRect(); const ax = a.left + a.width / 2; const ay = a.top + a.height / 2;
    let best = null; let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(); const bx = b.left + b.width / 2; const by = b.top + b.height / 2;
      const px = bx - ax; const py = by - ay;
      const along = dx ? px * dx : py * dy; const across = dx ? Math.abs(py) : Math.abs(px);
      if (along <= 4) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { focusEl(best); window.sfx?.play('nav'); }
  }
  const press = (i, pad) => { const b = pad.buttons[i]; const was = prev[`${pad.index}-${i}`]; prev[`${pad.index}-${i}`] = b?.pressed; return b?.pressed && !was; };
  function loop() {
    raf = null;
    if (document.hidden || !document.hasFocus() || ![...(navigator.getGamepads?.() ?? [])].some(Boolean)) return;
    if (state.gamepadOn === false) return;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const now = performance.now();
      const [lx = 0, ly = 0] = pad.axes;
      const dir = [pad.buttons[14]?.pressed || lx < -0.6 ? -1 : pad.buttons[15]?.pressed || lx > 0.6 ? 1 : 0, pad.buttons[12]?.pressed || ly < -0.6 ? -1 : pad.buttons[13]?.pressed || ly > 0.6 ? 1 : 0];
      if ((dir[0] || dir[1]) && now - lastMove > 170) { lastMove = now; move(dir[0], dir[0] ? 0 : dir[1]); }
      if (!dir[0] && !dir[1]) lastMove = 0;
      const el = document.activeElement;
      if (press(0, pad) && el && el !== document.body) el.click();
      if (press(1, pad)) { const dialog = scope(); if (!$('ctx').hidden) hideCtx(); else if (dialog !== document) { if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close(); } else go('accueil'); }
      if (scope() !== document) continue;
      if (press(2, pad) && el?.dataset?.id) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      if (press(3, pad) && el?.dataset?.id) { const r = el.getBoundingClientRect(); openCtx(state.items.find((x) => x.id === el.dataset.id), r.left, r.bottom); }
      if (press(4, pad) || press(5, pad)) { const i = NAV.indexOf(state.view); go(NAV[(Math.max(0, i) + (pad.buttons[5]?.pressed ? 1 : NAV.length - 1)) % NAV.length]); }
      if (press(9, pad)) openPalette();
    }
    raf = requestAnimationFrame(loop);
  }
  const resume = () => { if (!raf && !document.hidden && document.hasFocus() && [...(navigator.getGamepads?.() ?? [])].some(Boolean)) loop(); };
  $('gamepad').addEventListener('change', resume);
  document.addEventListener('visibilitychange', resume); addEventListener('focus', resume);
  resume();
  addEventListener('gamepadconnected', (e) => { toast(`🎮 Manette connectée : ${e.gamepad.id.split('(')[0].trim()}`); if (!raf) loop(); });
  addEventListener('gamepaddisconnected', () => { if (![...(navigator.getGamepads?.() ?? [])].some(Boolean) && raf) { cancelAnimationFrame(raf); clearTimeout(raf); raf = null; } });
})();

// ---------- Mon PC : santé des disques et test de connexion ----------
$('diskHealth').addEventListener('click', async (e) => {
  if (!e.target.closest('#diskHealthBtn')) return;
  $('diskHealth').innerHTML = '<p class="hint">Lecture des disques…</p>';
  const list = await api.diskHealth?.().catch(() => []) ?? [];
  const S = { ok: ['✅', 'Bon état'], warn: ['⚠', 'À surveiller'], bad: ['⛔', 'En danger'] };
  $('diskHealth').innerHTML = list.length ? `<div class="dhlist">${list.map((d) => `<div class="dh ${d.state}"><div class="dhtop"><b>${S[d.state][0]} ${esc(d.name)}</b><em>${S[d.state][1]}</em></div>
    <small>${d.ssd ? 'SSD' : 'Disque dur'}${d.bus ? ` · ${esc(d.bus)}` : ''}${d.size ? ` · ${gb(d.size)}` : ''}</small>
    <div class="dhstats">${d.wear != null ? `<span><b>${100 - d.wear} %</b>vie restante</span>` : ''}${d.temp != null ? `<span><b>${d.temp} °C</b>température</span>` : ''}${d.hours != null ? `<span><b>${Math.round(d.hours / 24).toLocaleString('fr-FR')} j</b>allumé</span>` : ''}<span><b>${d.errors}</b>erreur${d.errors > 1 ? 's' : ''}</span></div>
    ${d.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`).join('')}</div><p class="hint">Certaines valeurs (usure, température) ne sont données que par certains disques.</p>` : '<p class="hint">Aucune information disponible sur ce PC.</p>';
});
api.onNetProgress?.((p) => { const el = $('netTestOut'); if (el && el.dataset.running) el.innerHTML = `<p class="hint">${{ ping: '📶 Mesure du ping et des pertes (20 essais)…', down: '⬇ Mesure du débit descendant…', up: '⬆ Mesure du débit montant…' }[p.step] ?? '…'}</p>`; });
$('netTest').addEventListener('click', async (e) => {
  e.target.disabled = true;
  const out = $('netTestOut'); out.dataset.running = '1'; out.innerHTML = '<p class="hint">Démarrage du test…</p>';
  const r = await api.netTest?.().catch(() => null);
  delete out.dataset.running; e.target.disabled = false;
  if (!r) { out.innerHTML = '<p class="hint">Test impossible pour l’instant.</p>'; return; }
  const cls = { Excellente: 'ok', Bonne: 'ok', Moyenne: 'warn', Mauvaise: 'bad' }[r.grade];
  const v = (x, u) => (x == null ? '–' : `${x}${u}`);
  out.innerHTML = `<div class="nettest ${cls}"><div class="ntgrade"><small>Connexion</small><b>${esc(r.grade)}</b><em>${r.wifi == null ? '' : r.wifi ? '📶 Wi-Fi' : '🔌 Câble'}</em></div>
    <div class="scansum"><div><b>${v(r.ping, ' ms')}</b><small>ping</small></div><div class="${r.jitter >= 20 ? 'bad' : ''}"><b>±${v(r.jitter, ' ms')}</b><small>stabilité</small></div><div class="${r.loss > 0 ? 'bad' : ''}"><b>${v(r.loss, ' %')}</b><small>perdus</small></div><div><b>${v(r.down, ' Mb/s')}</b><small>réception</small></div><div><b>${v(r.up, ' Mb/s')}</b><small>envoi</small></div>${r.game ? `<div><b>${v(r.game.ms, ' ms')}</b><small>${esc(r.game.label)}</small></div>` : ''}</div>
    <ul class="nttips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
});

// Connexion par code : ce PC affiche un code, un PC déjà connecté le valide
let pairTimer = null;
function pairStop() { clearInterval(pairTimer); pairTimer = null; $('authPair').hidden = true; $('authForm').hidden = false; $('authPairBtn').hidden = false; }
$('pairBack').addEventListener('click', pairStop);
$('authPairBtn').addEventListener('click', async () => {
  const r = await api.pairStart?.().catch(() => null);
  if (!r?.code) return toast(r?.error ?? 'Impossible pour l’instant');
  $('authForm').hidden = true; $('authPairBtn').hidden = true; $('authPair').hidden = false;
  $('pairCode').textContent = r.code; $('pairHint').textContent = 'Valable 5 minutes.';
  clearInterval(pairTimer);
  pairTimer = setInterval(async () => {
    const p = await api.pairPoll?.(r.ticket).catch(() => null);
    if (p?.compte) { pairStop(); return loggedInUi(p, false); }
    if (p?.status === 410) { clearInterval(pairTimer); $('pairHint').textContent = 'Code expiré : clique sur Retour pour en demander un nouveau.'; }
  }, 2500);
});

// Paramètres › Compte : les comptes sont-ils bien gardés sur Supabase ?
async function renderCloudState() {
  const r = await api.cloudState?.().catch(() => null);
  const el = $('cloudState'); if (!el) return;
  const [icon, title, sub, cls] = !r || r.status === 0 ? ['⚠', 'Serveur injoignable', 'Impossible de vérifier la sauvegarde pour l’instant.', 'warn']
    : r.supabase ? ['✅', 'Comptes sauvegardés sur Supabase', `Ton compte, tes amis, tes messages et tes images sont gardés en ligne, même quand le serveur redémarre.`, 'ok']
      : ['⛔', 'Comptes non reliés à Supabase', 'Le serveur garde les comptes sur son disque : ils peuvent disparaître à une mise à jour. À régler côté serveur (Render › Environment).', 'bad'];
  el.className = `cloudstate ${cls}`;
  el.innerHTML = `<span>${icon}</span><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('button[data-pane="compte"]')) setTimeout(renderCloudState, 50); });
setTimeout(renderCloudState, 6000);

// Hors ligne : petite pastille en haut, et « De retour en ligne » quand ça revient
api.onNetState?.((d) => { $('netPill').hidden = d.online; if (d.online) toast('✅ De retour en ligne'); });
// La dernière page ouverte revient au démarrage (Amis, Mon PC…)
const LAST_VIEW_OK = ['accueil', 'jeux', 'applis', 'favoris', 'stats', 'classement', 'amis', 'pc'];
document.addEventListener('click', (e) => { const b = e.target.closest('#nav [data-view]'); if (b && LAST_VIEW_OK.includes(b.dataset.view)) { try { localStorage.setItem('hl-lastview', b.dataset.view); } catch { /* stockage bloqué */ } } });
setTimeout(() => {
  if (!window.launcher || state.view !== 'accueil') return;
  let v = null; try { v = localStorage.getItem('hl-lastview'); } catch { /* stockage bloqué */ }
  if (v && v !== 'accueil' && LAST_VIEW_OK.includes(v)) go(v);
}, 1500);
