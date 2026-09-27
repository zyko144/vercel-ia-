import { scamCheck } from '../core/friendsync.js';
// Interface du launcher : accueil (bannière, plus joués, applis, recommandations), bibliothèque, statistiques,
// assistant IA et lecteur de musique. Toutes les images sont les images officielles trouvées par le launcher.
import { filterSort } from '../core/sort.js';

const $ = (id) => document.getElementById(id);
let demoVerify = null; // aperçu hors Electron seulement
const api = window.launcher ?? demoApi(); // hors Electron (aperçu dans un navigateur) : données d'exemple
const state = { items: [], sources: {}, sel: null, active: new Set(), view: 'accueil', list: { sort: 'joues', kind: 'tout', source: 'tout', installed: 'tout', q: '' }, period: 'semaine', rank: 'tout', profile: 'Joueur', music: null, recos: [], free: [], deals: [], cols: {}, friends: null, hist: null, events: [], ftab: 'history', song: null, account: null };
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
  const inner = a.logo ? `<img class="logo" src="${esc(a.logo)}" alt="">`
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
  if (img.classList.contains('cov')) { img.parentElement.querySelector('.front')?.classList.add('show'); img.remove(); return; }
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

function renderHero() {
  const i = state.sel;
  const hero = $('hero');
  if (!i) { hero.innerHTML = '<h1 class="htitle">Ta bibliothèque se remplit…</h1>'; return; }
  const a = i.art ?? {};
  const bg = i.details?.background ?? a.hero ?? a.header ?? a.cover ?? null;
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
  const main = i.installed ? (isApp ? 'Ouvrir' : 'Jouer') : 'Installer';
  hero.innerHTML = `
    ${i.brand?.bg ? `<div class="hbg brandimg" style="background-image:url('${esc(i.brand.bg)}')"></div>` : i.brand && isApp ? `<div class="hbg brandbg" style="--b:${esc(i.brand.color)}"></div>` : bg ? `<div class="hbg" style="background-image:${url(bg)}"></div>` : `<div class="hbg blur" style="background-image:${a.icon || i.iconData ? url(a.icon ?? i.iconData) : 'none'}"></div>`}
    ${title}
    <div class="hbottom">
      <div class="playbtn"><button class="main" data-action="${i.installed ? 'launch' : 'install'}">${main}</button><button class="more" id="moreBtn" title="Plus d’actions">▾</button></div>
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
}

// Menu d'actions d'un jeu ou d'une appli : bouton ▾ du grand bandeau ET clic droit partout
function menuFor(i) {
  const isApp = i.kind !== 'game';
  const m = [];
  m.push(`<button data-action="${i.installed ? 'launch' : 'install'}" class="primary">${i.installed ? (isApp ? '▶ Ouvrir' : '▶ Jouer') : '⬇ Installer'}</button>`);
  if (state.active.has(i.id)) m.push('<button data-action="close">■ Fermer</button>');
  if (i.updatePending) m.push('<button data-action="update">⟳ Mettre à jour et jouer</button>');
  m.push('<hr>');
  m.push(`<button data-set="favorite">${i.favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>`);
  m.push('<button data-cols="1">📚 Collections…</button>');
  m.push('<button data-sheet="1">≡ Fiche complète</button>');
  if (i.installed && i.installDir) m.push('<button data-action="folder">📁 Ouvrir le dossier</button>');
  if (i.installed && ['steam', 'epic'].includes(i.source)) m.push('<button data-action="verify">✓ Vérifier les fichiers</button>');
  if (i.source === 'steam') m.push('<button data-action="store">🛈 Page du magasin</button>');
  if (i.kind === 'game') {
    const fin = Object.values(state.cols).find((c) => c.name === 'À finir');
    m.push(`<button data-tofinish="1">${fin?.items.includes(i.id) ? '🏁 Retirer de « À finir »' : '🏁 Ajouter à « À finir »'}</button>`);
    m.push('<button data-tools="1">🎛 Outils du jeu (profil, sauvegardes, FPS…)</button>');
    if (i.steamId) m.push('<button data-reqs="1">✅ Mon PC peut-il le faire tourner ?</button>');
    m.push('<button data-tips="1">🤖 Conseils de l’IA pour ce jeu</button>');
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
const ui = {
  confirm({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false, icon = '⚠️', list = [] }) {
    window.sfx?.play('pop');
    return new Promise((resolve) => {
      $('modalBox').innerHTML = `<div class="mhead"><span class="micon ${danger ? 'danger' : ''}">${esc(icon)}</span><h2>${esc(title)}</h2></div>
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
      $('modalBox').innerHTML = `<div class="mhead"><span class="micon">${esc(icon)}</span><h2>${esc(title)}</h2></div>
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
    ${art(i)}${icon ? `<img class="srcicon" src="${esc(icon)}" alt="">` : ''}
    ${live ? '<span class="badge live">En cours</span>' : !i.installed ? '<span class="badge">Non installé</span>' : i.updatePending ? '<span class="badge upd">Mise à jour</span>' : ''}
    <div class="meta"><b>${esc(i.name)}</b><small>${CLOCK}${hours(i.minutes)}</small></div></div>`;
}

function renderHome() {
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
  api.progress?.().then((p) => {
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
  $('news').innerHTML = (list ?? []).slice(0, 6).map((n) => `<div class="newscard" data-news="${esc(n.appid)}" data-gid="${esc(n.gid)}">
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
  if (state.view === 'amis' && state.ftab === 'steam') renderFriends();
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">👥</span><h2>Nouveau groupe</h2></div>
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🔗</span><h2>Lier ton compte Discord</h2></div>
    <p class="mtext">Sur le serveur Discord, tape la commande :</p><div class="codebox big"><b>/launcher lier code:${esc(r.code)}</b></div>
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
  const line = a.playing ? `Joue à ${esc(a.playing)}` : a.online ? (a.dnd ? 'Ne pas déranger' : a.status ? esc(a.status) : 'En ligne') : 'Hors ligne';
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
// Logos simplifiés des réseaux (SVG maison)
const LINK_ICONS = {
  discord: '<svg viewBox="0 0 24 24"><path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1a15.6 15.6 0 0 0-5.8 0l-.5-1a17 17 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8c-.6-.2-1.2-.5-1.8-.9l.4-.3a12.2 12.2 0 0 0 11.6 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7ZM8.5 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z"/></svg>',
  twitch: '<svg viewBox="0 0 24 24"><path d="M4.3 2 3 5.4v13.8h4.7V22h2.6l2.7-2.8h3.8l5.2-5.2V2H4.3Zm15.4 11.2-3 3h-4.7l-2.6 2.6v-2.6H5.4V3.9h14.3v9.3ZM16.8 7v5.3h-1.9V7h1.9Zm-5 0v5.3H9.9V7h1.9Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15V9l5.8 3-5.8 3Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M16.6 2h-3.4v13.5a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.3a6.3 6.3 0 1 0 5.4 6.2V8.7a8 8 0 0 0 4.6 1.5V6.8a4.6 4.6 0 0 1-4.6-4.8Z"/></svg>',
  steam: '<svg viewBox="0 0 24 24"><path d="M12 1.5A10.5 10.5 0 0 0 1.6 11l5.6 2.3a3 3 0 0 1 1.9-.5l2.5-3.6v-.1a4 4 0 1 1 4 4h-.1l-3.6 2.6a3 3 0 0 1-5.9.6l-4-1.7A10.5 10.5 0 1 0 12 1.5Zm-4.4 16 1.3.5a2.2 2.2 0 1 0 1.2-2.9l-1.3-.5a1.6 1.6 0 1 1-1.2 2.9Zm10.1-8.4a2.7 2.7 0 1 0-5.4 0 2.7 2.7 0 0 0 5.4 0Zm-4.7 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21.9 8c0-1.6-.4-3-1.6-4.2S17.6 2.1 16 2.1c-1.6-.1-6.4-.1-8 0-1.6 0-3 .4-4.2 1.6S2.1 6.4 2.1 8c-.1 1.6-.1 6.4 0 8 0 1.6.4 3 1.6 4.2s2.6 1.6 4.2 1.6c1.6.1 6.4.1 8 0 1.6 0 3-.4 4.2-1.6s1.6-2.6 1.6-4.2c.1-1.6.1-6.4 0-8Zm-2.1 9.7a3.3 3.3 0 0 1-1.8 1.8c-1.3.5-4.4.4-5.9.4s-4.6.1-5.9-.4a3.3 3.3 0 0 1-1.8-1.8c-.5-1.3-.4-4.4-.4-5.7s-.1-4.5.4-5.8a3.3 3.3 0 0 1 1.8-1.8c1.3-.5 4.4-.4 5.9-.4s4.6-.1 5.9.4a3.3 3.3 0 0 1 1.8 1.8c.5 1.3.4 4.4.4 5.8s.1 4.4-.4 5.7Z"/></svg>',
};
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
function profileCard(p, { live = null } = {}) {
  const col = /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : '#3b82f6';
  const ban = p.bannerData ?? safeBanner(p.bannerImg);
  const game = p.favGame ? state.items.find((i) => i.name.toLowerCase() === p.favGame.toLowerCase()) : null;
  const since = p.since ? new Date(p.since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null;
  const links = LINKS.filter(([k]) => p.links?.[k]);
  return `<div class="pc2" style="--pc:${col}">
    <div class="pc2ban ban-${esc(p.banner ?? 'nuit')}" ${ban ? `style="background-image:url('${esc(ban)}')"` : ''}></div>
    <div class="pc2main">
      <div class="pc2top">${p.avatarData ? `<span class="pav xl img ${p.frame ? `fr-${esc(p.frame)}` : ''}" style="background-image:url('${esc(p.avatarData)}');${/^#[0-9a-f]{6}$/i.test(p.frameColor ?? '') ? `--fc:${p.frameColor}` : ''}"></span>` : avatar(p, `xl ${p.frame ? `fr-${p.frame}` : ''}`)}
        ${live ? `<span class="pc2live ${live.cls}">${esc(live.text)}</span>` : ''}</div>
      <div class="pc2name nfx-${esc(p.nameFx ?? 'aucun')}">${esc(p.pseudo ?? '')}</div>
      <small class="pc2sub">${p.code ? esc(p.code) : ''}${since ? `${p.code ? ' · ' : ''}membre depuis ${esc(since)}` : ''}</small>
      ${p.bio ? `<p class="pc2bio">${esc(p.bio)}</p>` : ''}
      ${(p.badges ?? []).length ? `<div class="pc2badges">${p.badges.filter((b) => BADGES[b]).map((b) => `<span class="pbadge"><i>${BADGES[b][0]}</i>${esc(BADGES[b][1])}</span>`).join('')}</div>` : ''}
      <div class="pc2grid">
        ${p.favGame ? `<div class="pc2box fav">${game?.art?.cover ? `<img src="${esc(game.art.cover)}" alt="">` : '<span class="pc2ico">🎮</span>'}<div><small>Jeu préféré</small><b>${esc(p.favGame)}</b></div></div>` : ''}
        ${p.week ? `<div class="pc2box"><span class="pc2ico">⏱</span><div><small>Cette semaine</small><b>${hours(p.week)}</b></div></div>` : ''}
        ${p.bench ? `<div class="pc2box"><span class="pc2ico">🏁</span><div><small>Benchmark</small><b>${p.bench}</b></div></div>` : ''}
        ${p.top && p.top !== p.favGame ? `<div class="pc2box"><span class="pc2ico">🔥</span><div><small>Le plus joué (7 j)</small><b>${esc(p.top)}</b></div></div>` : ''}
      </div>
      ${links.length ? `<div class="pc2links">${links.map(([k, label]) => { const h = p.links[k]; const url = linkUrl(k, h); return `<button type="button" class="plink2 pl-${k}" ${url ? `data-plopen="${esc(k)}" data-plh="${esc(h)}" title="Ouvrir ${esc(label)}"` : `data-copytext="${esc(h)}" data-copied="${esc(label)} copié : ${esc(h)}" title="Copier le pseudo"`}><i class="plico">${LINK_ICONS[k]}</i><span><small>${esc(label)}</small><b>${esc(linkShown(k, h))}</b></span><em>${url ? '↗' : '⧉'}</em></button>`; }).join('')}</div>` : ''}
    </div></div>`;
}
/** Profil d'un ami (clic sur sa photo ou son nom). */
function openFriendProfile(id) {
  const f = (state.hist?.amis ?? []).find((a) => a.id === id);
  if (!f) return;
  const live = f.playing ? { cls: 'g', text: `Joue à ${f.playing}` } : f.online ? { cls: 'on', text: 'En ligne' } : { cls: 'off', text: 'Hors ligne' };
  $('modalBox').classList.add('wide', 'fp');
  $('modalBox').innerHTML = `${profileCard(f, { live })}<div class="row end"><button type="button" class="btn" data-hchat="${esc(f.id)}" data-name="${esc(f.pseudo)}" data-m="1">💬 Message</button>${f.online ? `<button type="button" class="btn" data-hcall="${esc(f.id)}" data-name="${esc(f.pseudo)}" data-m="1">📞 Appeler</button>` : ''}<button type="button" class="btn play" data-m="1" autofocus>Fermer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) setTimeout(() => $('modal').close(), 0); };
}
$('modal').addEventListener('close', () => $('modalBox').classList.remove('wide', 'fp'));
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
  };
  const files = { avatar: null, banner: null };
  const raw = Object.fromEntries(LINKS.map(([k]) => [k, d.links[k] ? (linkUrl(k, d.links[k]) ?? d.links[k]) : '']));
  const change = {};
  let tab = 'look';
  const gamesList = [...new Set(games().filter((i) => i.installed || i.minutes).sort((a, b) => b.minutes - a.minutes).map((i) => i.name))].slice(0, 60);
  $('modalBox').classList.add('wide');
  const paint = () => {
    $('peCard').innerHTML = profileCard(d);
    document.querySelectorAll('#modalBox [data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === tab));
    document.querySelectorAll('#modalBox .ptabpane').forEach((p) => { p.hidden = p.dataset.ptab !== tab; });
    document.querySelectorAll('#modalBox [data-pcol]').forEach((b) => b.classList.toggle('on', b.dataset.pcol === d.color));
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
  $('modalBox').innerHTML = `<div class="pedit2">
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
  const r = await api.optiReset?.().catch(() => null);
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
function chatHeader() {
  if (!chatWith) return;
  const f = state.hist?.amis?.find((a) => a.id === chatWith.id);
  $('chatWho').textContent = chatWith.name;
  $('chatAv').className = `pav ${f?.playing ? 'ingame' : f?.online ? 'on' : 'off'}`;
  setAv($('chatAv'), f ?? chatWith.name);
  if (f?.frame) $('chatAv').classList.add(`fr-${f.frame}`);
  $('chatWho').className = `nfx-${f?.nameFx ?? 'aucun'}`; $('chatWho').style.setProperty('--pc', f?.color ?? '#3b82f6');
  $('chatSub').textContent = `${f?.playing ? `Joue à ${f.playing}` : f?.online ? (f.status ? `En ligne · « ${f.status} »` : 'En ligne') : 'Hors ligne · il verra ton message à sa prochaine connexion'}${f?.bio ? ` — ${f.bio}` : ''}`;
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
function paintThread(key, { force = false } = {}) {
  const el = threadEl(key);
  if (!el) return;
  const fil = threads.get(key);
  const pend = [...pendingMsgs].filter(([, p]) => p.key === key);
  if (!fil && !pend.length) { el.innerHTML = '<div class="cload"><i></i><i></i><i></i></div>'; return; }
  const group = key.startsWith('g:');
  const members = group ? (state.groups ?? []).find((g) => `g:${g.id}` === key)?.members ?? [] : [];
  const nameOf = (id) => members.find((m) => m.id === id) ?? state.hist?.amis?.find((a) => a.id === id) ?? { pseudo: '?' };
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  let day = '';
  const list = fil ?? [];
  const html = list.map((m, i) => {
    const d = dayOf(m.at); const sep = d !== day ? `<div class="cday">${esc(d)}</div>` : ''; day = d;
    const them = m.from !== myId();
    const grouped = i > 0 && list[i - 1].from === m.from && m.at - list[i - 1].at < 120_000 && !sep;
    const who = group && them && !grouped ? nameOf(m.from) : null;
    return `${sep}<div class="cmsg ${them ? 'them' : 'me'} ${grouped ? 'grouped' : ''} ${who ? 'named' : ''}" data-mid="${esc(m.id ?? '')}">${who ? `<em class="cname">${avatar(who, 'xs')}${esc(who.pseudo)}</em>` : ''}<span>${esc(m.text)}</span>${them && scamCheck(m.text) ? `<em class="scam">⚠ ${esc(scamCheck(m.text))}</em>` : ''}<small>${new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>${!them && m.id ? `<button type="button" class="cdel" data-mdel="${esc(m.id)}" title="Supprimer le message">🗑</button>` : ''}</div>`;
  }).join('') + pend.map(([cid, p]) => `<div class="cmsg me ${p.failed ? 'failed' : 'sending'}" data-cid="${esc(cid)}"><span>${esc(p.text)}</span><small>${p.failed ? `⚠ ${esc(p.failed)} · <button type="button" class="linkbtn" data-mretry="${esc(cid)}">Réessayer</button> · <button type="button" class="linkbtn" data-mdrop="${esc(cid)}">Annuler</button>` : 'envoi…'}</small></div>`).join('');
  if (!force && el.dataset.html === html) return;
  el.dataset.html = html;
  const empty = group ? '<div class="cempty"><span class="cemo">👥</span><b>Discussion du groupe</b><small>Tout le groupe voit les messages ici. Dis bonjour 👋</small></div>' : `<div class="cempty">${avatar(state.hist?.amis?.find((a) => a.id === chatWith?.id) ?? chatWith?.name ?? '?', 'big')}<b>${esc(chatWith?.name ?? '')}</b><small>Pas encore de message : dis bonjour 👋</small></div>`;
  el.innerHTML = html || empty;
  if (atBottom || force) el.scrollTop = el.scrollHeight;
}
async function loadThread(key) {
  const [kind, id] = [key[0], key.slice(2)];
  const r = await (kind === 'f' ? api.chatThread(id) : api.groupThread?.(id))?.catch(() => null);
  if (!r?.fil) { if (!threads.has(key)) { const el = threadEl(key); if (el) el.innerHTML = `<p class="hint">${esc(r?.error ?? 'Impossible de charger la discussion.')} <button type="button" class="linkbtn" data-mreload="${esc(key)}">Réessayer</button></p>`; } return; }
  keepThread(key, r.fil);
  paintThread(key);
  if (key[0] === 'g') renderGroups(state.groups ?? []);
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
  renderGroups(state.groups ?? []);
  updateFriendsBadge();
}
const refreshChat = () => chatWith && loadThread(`f:${chatWith.id}`);
async function sendMsg(key, text, cid = newCid()) {
  pendingMsgs.set(cid, { key, text, failed: null });
  paintThread(key, { force: true });
  const id = key.slice(2);
  const r = await (key[0] === 'f' ? api.chatSend(id, text, cid) : api.groupSend(id, text, cid)).catch(() => null);
  if (!r || r.error || (r.status && r.status !== 200)) { pendingMsgs.set(cid, { key, text, failed: r?.error ?? 'Non envoyé' }); paintThread(key); return; }
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
  sendMsg(key, text);
}
$('chatForm').addEventListener('submit', (e) => { e.preventDefault(); if (chatWith) submitFrom($('chatText'), `f:${chatWith.id}`); });
$('gForm').addEventListener('submit', (e) => { e.preventDefault(); if (gOpen()) submitFrom($('gText'), `g:${gOpen()}`); });
for (const id of ['chatText', 'gText']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
  if (id === 'gText') $(id).addEventListener('input', (e) => { e.target.style.height = ''; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; });
}
// Supprimer, réessayer, annuler un message (discussion d'ami ou de groupe)
for (const fil of ['chatFil', 'gFil']) {
  $(fil).addEventListener('click', async (e) => {
    const key = fil === 'chatFil' ? (chatWith ? `f:${chatWith.id}` : null) : (gOpen() ? `g:${gOpen()}` : null);
    if (!key) return;
    const t = e.target.closest('[data-mdel],[data-mretry],[data-mdrop],[data-mreload]'); if (!t) return;
    if (t.dataset.mreload) return loadThread(key);
    if (t.dataset.mdrop) { pendingMsgs.delete(t.dataset.mdrop); return paintThread(key, { force: true }); }
    if (t.dataset.mretry) { const p = pendingMsgs.get(t.dataset.mretry); if (p) sendMsg(key, p.text, t.dataset.mretry); return; }
    const mid = t.dataset.mdel;
    if (!(await ui.confirm({ title: 'Supprimer ce message ?', text: key[0] === 'g' ? 'Il disparaît pour tout le groupe.' : 'Il disparaît aussi chez ton ami.', ok: 'Supprimer', danger: true, icon: '🗑' }))) return;
    const before = threads.get(key) ?? [];
    keepThread(key, before.filter((m) => m.id !== mid)); paintThread(key);
    const r = await (key[0] === 'f' ? api.chatDelete?.(key.slice(2), mid) : api.groupDelete?.(key.slice(2), mid))?.catch(() => null);
    if (!r?.ok) { keepThread(key, before); paintThread(key); return toast(r?.error ?? 'Suppression impossible pour l’instant'); }
    if (r.fil) { keepThread(key, r.fil); paintThread(key); }
  });
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
  const key = x.type === 'msg' || x.type === 'msgdel' ? `f:${x.from}` : `g:${x.gid}`;
  const fil = threads.get(key);
  if (x.type === 'msgdel' || x.type === 'gmsgdel') { if (fil) { keepThread(key, fil.filter((m) => m.id !== x.msg)); paintThread(key); } return false; }
  const m = { id: x.msg ?? x.id, from: x.from, text: x.text, at: x.sentAt ?? x.at };
  if (fil && !fil.some((y) => y.id === m.id)) keepThread(key, [...fil, m].sort((a, b) => a.at - b.at));
  if (threadEl(key)) { paintThread(key); if (!fil) loadThread(key); return false; }
  return true;
}
api.onSocial?.((d) => {
  let ding = false;
  for (const x of d.items ?? d.messages ?? []) {
    if (!['msg', 'gmsg', 'msgdel', 'gmsgdel'].includes(x.type)) continue;
    if (!applyLive(x)) continue;
    ding = true;
    if (x.type === 'msg') unread[x.from] = (unread[x.from] ?? 0) + 1; else gUnread[x.gid] = (gUnread[x.gid] ?? 0) + 1;
  }
  if (ding && document.hasFocus()) window.sfx?.play('notif');
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
setInterval(() => { if (state.view === 'amis' && state.ftab === 'history') loadHistory(); }, 60_000);
setInterval(() => { if (state.view === 'amis' && state.ftab === 'steam') loadFriends(); }, 60_000);

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
  if (d?.entry) { nc.list = [d.entry, ...nc.list.filter((x) => x.id !== d.entry.id)].slice(0, 150); $('bellBtn').classList.remove('ring'); void $('bellBtn').offsetWidth; $('bellBtn').classList.add('ring'); }
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
  applyTheme(c ?? THEMES.bleu);
}
$('themeSel').addEventListener('change', (e) => { themeName = e.target.value; api.setSettings({ theme: themeName }); if (themeName === 'auto') themeFor(state.sel); else applyTheme(THEMES[themeName]); });
$('dailyLimit').addEventListener('change', (e) => api.setSettings({ dailyLimit: Number(e.target.value) }).then(() => toast(Number(e.target.value) ? 'Limite enregistrée' : 'Pas de limite')));
$('breakEvery').addEventListener('change', (e) => api.setSettings({ breakEvery: Number(e.target.value) }));
api.settings?.().then((s) => {
  themeName = s?.theme ?? 'bleu';
  $('themeSel').value = themeName; $('dailyLimit').value = String(s?.dailyLimit ?? 0); $('breakEvery').value = String(s?.breakEvery ?? 0);
  if (themeName !== 'auto') applyTheme(THEMES[themeName] ?? THEMES.bleu);
}).catch(() => {});

// ---------- Manette (Xbox, PlayStation…) : navigation dans tout le launcher ----------
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
let padFocus = null;
let padPrev = [];
let padRepeat = 0;
const focusables = () => [...document.querySelectorAll(document.querySelector('dialog[open]') ? 'dialog[open] button, dialog[open] input, dialog[open] select' : '#nav button, .view.on [data-id], .view.on .btn, .view.on [data-free], .view.on [data-deal], .view.on [data-news], #hero .playbtn .main')].filter((el) => el.offsetParent && el.getBoundingClientRect().width > 0);
function padMove(dx, dy) {
  const list = focusables();
  if (!list.length) return;
  if (!padFocus || !list.includes(padFocus)) { setPadFocus(list.find((el) => el.closest('.view.on')) ?? list[0]); return; }
  const r = padFocus.getBoundingClientRect();
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  let best = null; let bestScore = Infinity;
  for (const el of list) {
    if (el === padFocus) continue;
    const q = el.getBoundingClientRect();
    const x = q.left + q.width / 2 - cx; const y = q.top + q.height / 2 - cy;
    const along = x * dx + y * dy;
    if (along <= 4) continue;
    const across = Math.abs(x * dy - y * dx);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) setPadFocus(best);
}
function setPadFocus(el) {
  padFocus?.classList.remove('padfocus');
  padFocus = el;
  el.classList.add('padfocus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  if (el.dataset.id && !el.closest('dialog')) { const item = state.items.find((i) => i.id === el.dataset.id); if (item && state.view === 'accueil') { state.sel = item; renderHero(); } }
}
function padPress(b) {
  const open = document.querySelector('dialog[open]');
  if (b === PAD.A && padFocus) { if (padFocus.dataset.id && state.sel?.id === padFocus.dataset.id && state.view === 'accueil' && state.sel.installed) return act('launch'); return padFocus.click(); }
  if (b === PAD.B) { if (open) return open.close(); if ($('aipop').classList.contains('open')) return openAssistant(false); return go('accueil'); }
  if (b === PAD.X && state.sel) return openSheet(state.sel);
  if (b === PAD.Y && state.sel) { const on = !state.sel.favorite; return api.setItem(state.sel.id, { favorite: on }).then(() => { state.sel.favorite = on; toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris'); }); }
  if (b === PAD.LB || b === PAD.RB) { const at = Math.max(0, VIEW_KEYS.indexOf(state.view === 'liste' ? ({ tout: 'bibliotheque', jeux: 'jeux', applis: 'applis', favoris: 'favoris' })[state.list.kind] ?? 'bibliotheque' : state.view)); go(VIEW_KEYS[(at + (b === PAD.RB ? 1 : -1) + VIEW_KEYS.length) % VIEW_KEYS.length]); padFocus = null; return; }
  if (b === PAD.MENU) return $('openSettings').click();
  if (b === PAD.VIEW) return openAssistant(true);
}
function padLoop() {
  const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
  if (pad) {
    const now = performance.now();
    const pressed = pad.buttons.map((x) => x.pressed);
    pressed.forEach((p, i) => { if (p && !padPrev[i] && ![PAD.UP, PAD.DOWN, PAD.LEFT, PAD.RIGHT].includes(i)) padPress(i); });
    const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    const dx = pressed[PAD.LEFT] || ax < -0.5 ? -1 : pressed[PAD.RIGHT] || ax > 0.5 ? 1 : 0;
    const dy = pressed[PAD.UP] || ay < -0.5 ? -1 : pressed[PAD.DOWN] || ay > 0.5 ? 1 : 0;
    if ((dx || dy) && now > padRepeat) { padMove(dx, dy); padRepeat = now + (padRepeat ? 180 : 320); } else if (!dx && !dy) padRepeat = 0;
    padPrev = pressed;
  }
  requestAnimationFrame(padLoop);
}
window.addEventListener('gamepadconnected', () => { document.body.classList.add('pad'); toast('🎮 Manette connectée : navigue avec la croix, A pour ouvrir'); if (!padFocus) padMove(0, 1); });
window.addEventListener('gamepaddisconnected', () => { if (![...(navigator.getGamepads?.() ?? [])].some(Boolean)) document.body.classList.remove('pad'); });
requestAnimationFrame(padLoop);

// ---------- Quoi de neuf (après chaque mise à jour) ----------
// Nouveautés par version : après une mise à jour, un court message avec l'essentiel (titres seulement)
const CHANGELOG = {
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
    ['🌐', 'Nouveau site du launcher', 'historylauncher.vercel.app : toutes les fonctions, l’analyse pro, Windows Update et le journal des versions. Paramètres › À propos › Site du launcher.', ['#openSettings', '.setnav [data-pane=about]']],
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
    ['🌐', 'Site du launcher', 'Toutes les fonctions expliquées avec des captures, et la dernière version à télécharger : historylauncher.vercel.app'],
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🧩</span><h2>Addons Garry’s Mod</h2></div>
    <div class="row"><input id="wsLink" class="wsin" placeholder="Colle le lien d’un addon du Workshop" value="${esc(found?.id ?? '')}"><button type="button" class="btn" id="wsGo">Voir</button></div>
    ${card}
    <p class="hint">Steam télécharge l’addon et le garde à jour ; il est disponible au prochain lancement de Garry’s Mod.</p>
    <b class="sub">Installés (${list.length})</b>
    <div class="wslist">${r?.error ? `<p class="hint">${esc(r.error)}</p>` : list.length ? list.slice(0, 60).map((a) => `<span>${a.where === 'workshop' ? '☁' : '📦'} ${esc(a.name)}</span>`).join('') : '<p class="hint">Aucun addon pour l’instant.</p>'}</div>
    <div class="row end"><button type="button" class="btn ghost" id="wsBrowse">Parcourir le Workshop</button><button type="button" class="btn" data-m="1">Fermer</button></div>`;
  if (!$('modal').open) $('modal').showModal();
  $('modalBox').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) return $('modal').close();
    if (b.id === 'wsBrowse') return api.gmodBrowse();
    if (b.id === 'wsGo') { const d = await api.gmodDetails($('wsLink').value); return openGmod(d?.error ? d : d); }
    if (b.dataset.gminst) { await api.gmodInstall(b.dataset.gminst); toast('Steam s’ouvre sur l’addon : clique sur « S’abonner » pour l’installer'); }
  };
}
// ---------- Outils du jeu : profil, sauvegardes, saccades, déplacement, performances ----------
let toolsFor = null;
async function openTools(item, tab = 'profil') {
  hideCtx();
  toolsFor = item;
  const d = await api.tools(item.id).catch(() => null);
  if (!d || d.error) return toast(d?.error ?? 'Impossible');
  const p = d.profile;
  const tabs = [['profil', '🎛 Profil'], ['graph', '🎚 Réglages conseillés'], ['saves', '💾 Sauvegardes'], ['shaders', '🧊 Saccades'], ...(d.canMove ? [['move', '📦 Déplacer']] : []), ['perf', '📈 Performances']];
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
      ${d.received?.length ? `<b class="sub">Reçues de tes amis</b><div class="flist">${d.received.map((x) => `<div><div><b>💾 ${esc(x.from)} · ${esc(x.name)}</b><small>${new Date(x.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · valable 24 h</small></div><button class="btn play sm" data-recv="${esc(x.id)}">Recevoir</button></div>`).join('')}</div>` : ''}
      <div class="row"><button class="btn" data-tact="share" ${d.saveDirs.length ? '' : 'disabled'}>📤 Envoyer ma sauvegarde à un ami</button></div>
      <b class="sub">Copies</b><div class="flist">${d.backups.length ? d.backups.map((b) => `<div><div><b>${new Date(b.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</b><small>${gb(b.bytes)}</small></div><button class="btn ghost sm" data-restore="${esc(b.id)}">Restaurer</button></div>`).join('') : '<p class="hint">Pas encore de copie.</p>'}</div>`,
    graph: graphicsHtml(d.graphics),
    shaders: `<p class="hint">Un cache de shaders abîmé ou trop vieux donne des saccades (surtout après une mise à jour du jeu ou du pilote). Il se recrée tout seul : les premières minutes peuvent saccader le temps qu’il se reconstruise.</p>
      <div class="checks">${d.caches.map((c) => `<label class="check"><input type="checkbox" data-cache="${esc(c.id)}" ${c.own ? 'checked' : ''}><span>${esc(c.label)}</span><em>${gb(c.bytes)}</em></label>`).join('')}</div>
      <div class="row"><button class="btn play" data-tact="shaders">🧊 Vider la sélection</button></div>`,
    move: d.canMove ? `<p class="hint">Actuellement dans <b>${esc(d.from)}</b>${d.size ? ` · ${gb(d.size)}` : ''}. Ferme Steam complètement avant de lancer le déplacement.</p>
      <div class="flist">${d.targets.length ? d.targets.map((t) => `<div><div><b>${esc(t.lib)}</b><small>${t.free != null ? `${gb(t.free)} libres` : ''}${d.size && t.free != null && t.free < d.size ? ' · pas assez de place' : ''}</small></div><button class="btn play sm" data-move="${esc(t.lib)}" ${d.size && t.free != null && t.free < d.size ? 'disabled' : ''}>Déplacer ici</button></div>`).join('') : '<p class="hint">Aucune autre bibliothèque Steam : crées-en une dans Steam › Paramètres › Stockage.</p>'}</div><div id="moveProg"></div>` : '',
    perf: `${perf.length ? `<div class="scansum">${recent ? `<div><b>${recent}</b><small>FPS moyens (7 jours)</small></div>` : ''}${older && recent ? `<div class="${recent < older * 0.9 ? 'bad' : ''}"><b>${recent >= older ? '+' : ''}${Math.round((100 * (recent - older)) / older)} %</b><small>vs le mois d’avant (${older} FPS)</small></div>` : ''}<div><b>${perf.length}</b><small>parties suivies</small></div></div>
      <div class="flist">${perf.slice(0, 20).map((x) => `<div><div><b>${new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${x.minutes} min</b><small>${x.avg ? `${x.avg} FPS moy. · 1 % low ${x.low1}${x.stutters ? ` · ${x.stutters} saccades` : ''}` : 'FPS non mesurés'}${x.bound ? ` · ${B[x.bound]}` : ''}${x.gpuAvg != null ? ` · carte graphique ${x.gpuAvg} %` : ''}${x.coreMax != null ? ` · cœur le plus chargé ${x.coreMax} %` : ''}</small></div></div>`).join('')}</div>`
      : `<p class="hint">Joue une partie de plus de 3 minutes : tes FPS (si la mesure est activée), la charge du processeur et de la carte graphique et le composant qui limite s’afficheront ici.</p>`}
      ${d.fps ? '' : '<div class="row"><button class="btn" data-tact="fps">📈 Activer la mesure des vrais FPS</button></div>'}`,
  };
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🎛</span><h2>${esc(item.name)}</h2></div>
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
    if (a === 'backup') { t.disabled = true; const r = await api.savesBackup(item.id); toast(r?.ok ? `💾 Copie faite (${gb(r.bytes)})` : r?.error ?? 'Impossible'); return openTools(item, 'saves'); }
    if (a === 'pick') { await api.savesPick(item.id); return openTools(item, 'saves'); }
    if (a === 'openSaves') return api.savesOpen();
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">📤</span><h2>Envoyer ma sauvegarde</h2></div>
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>${esc(item.name)}</h2></div><p class="hint">Comparaison avec ton PC…</p>`;
  if (!$('modal').open) $('modal').showModal();
  const r = await api.gameReqs(item.id);
  const row = (label, c, unit = ' Go') => (c?.need == null ? '' : `<div class="reqrow"><span>${label}</span><b>${Math.round(c.need * 10) / 10}${unit}</b><b>${c.have == null ? '?' : `${Math.round(c.have * 10) / 10}${unit}`}</b><em class="${c.ok ? 'ok' : c.ok === false ? 'bad' : ''}">${c.ok ? '✓' : c.ok === false ? '✗' : '?'}</em></div>`);
  const block = (title, v) => (v ? `<div class="reqblock"><h3>${title} ${v.pass === true ? '<span class="ok">● OK</span>' : v.pass === false ? '<span class="bad">● insuffisant</span>' : ''}</h3>
    <div class="reqrow head"><span></span><b>Demandé</b><b>Ton PC</b><em></em></div>${row('Mémoire', v.checks.ram)}${row('Place libre', v.checks.disk)}${row('Mémoire vidéo', v.checks.vram)}
    ${v.cpu ? `<small class="hint">Processeur demandé : ${esc(v.cpu)}</small>` : ''}${v.gpu ? `<small class="hint">Carte graphique demandée : ${esc(v.gpu)}</small>` : ''}</div>` : '');
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>${esc(item.name)} sur ton PC</h2></div>
    ${r?.error ? `<p class="hint">${esc(r.error)}</p>` : `${block('Minimum', r.min)}${block('Recommandé', r.rec)}
    <small class="hint">Ton PC : ${esc(r.mine.cpu ?? '?')} · ${esc(r.mine.gpu ?? '?')}</small>
    ${r.ai ? `<div class="reporttxt">🤖 ${esc(r.ai)}</div>` : ''}`}
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); };
}
async function openFivemServers() {
  hideCtx();
  $('modalBox').innerHTML = '<div class="mhead"><span class="micon">🌐</span><h2>Mes serveurs FiveM</h2></div><p class="hint">Chargement…</p>';
  if (!$('modal').open) $('modal').showModal();
  const r = await api.fivemServers?.().catch(() => null);
  const list = (r?.list ?? []).sort((a, b) => (b.fav - a.fav) || (b.minutes - a.minutes));
  const row = (x) => `<div class="fsrv">
      <button type="button" class="star ${x.fav ? 'on' : ''}" data-ffav="${esc(x.code)}" data-on="${x.fav ? '' : '1'}" title="${x.fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${x.fav ? '★' : '☆'}</button>
      <div class="fmeta"><b>${esc(x.name ?? x.code)}</b><small>${x.online === false ? '<span class="off">● Hors ligne</span>' : x.online ? `<span class="ok">● ${x.players}${x.max ? ` / ${x.max}` : ''} joueurs</span>` : '● ?'} · ${x.minutes ? `${hours(x.minutes)} de jeu` : 'pas encore joué'} · <code>${esc(x.code)}</code></small></div>
      <button type="button" class="btn play sm" data-fjoin="${esc(x.code)}">Rejoindre</button></div>`;
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🌐</span><h2>Mes serveurs FiveM</h2></div>
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✨</span><h2>${force ? 'Quoi de neuf' : 'Mise à jour installée'}${v ? ` · v${esc(v)}` : ''}</h2></div>
    <div class="wnew ${force ? '' : 'short'}">${list.map(([ic, t, d]) => `<div><span>${ic}</span><div><b>${esc(t)}</b>${force ? `<small>${esc(d)}</small>` : ''}</div></div>`).join('')}</div>
    <div class="row end"><button type="button" class="btn play" data-m="1">C’est parti</button></div>`;
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); };
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
const PAL_VIEWS = [['accueil', 'Accueil', '🏠'], ['bibliotheque', 'Bibliothèque', '📚'], ['jeux', 'Jeux', '🎮'], ['applis', 'Applications', '🧩'], ['favoris', 'Favoris', '★'], ['stats', 'Statistiques', '📊'], ['classement', 'Classement', '🏆'], ['amis', 'Amis', '👥'], ['pc', 'Mon PC', '🖥'], ['optimisation', 'Optimisation', '⚡']];
const PAL_ACTIONS = [
  ['Optimiser mon PC', '🚀', () => go('optimisation')],
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
  const entries = Object.entries(state.cols);
  $('collections').innerHTML = entries.map(([id, c]) => `<button data-col="${esc(id)}" class="${state.view === 'liste' && state.list.collection === id ? 'on' : ''}"><span class="pdot" style="background:#2f8bff">📚</span>${esc(c.name)}<em>${c.items.filter((x) => state.items.some((i) => i.id === x)).length}</em></button>`).join('') || '<small class="hint colempty">Range tes jeux : « Avec les potes », « À finir »…</small>';
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
  const p = await api.pc?.().catch(() => null);
  if (!p || state.view !== 'pc') return;
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
  pcTimer = setInterval(() => (state.view === 'pc' ? renderPc() : clearInterval(pcTimer)), 2500);
  const b = await api.boost?.().catch(() => null);
  if (!b) return;
  $('boostOn').checked = b.enabled; $('boostPower').checked = b.power; $('boostRestore').checked = b.restore; $('heatAlerts').checked = b.heatAlerts;
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
  $('pcComps').innerHTML = d.components.map((c) => `<div class="comp st-${c.status} ck-${esc(c.key ?? 'x')}">
    <div class="ch"><span>${c.icon}</span><div><small>${esc(c.title)}</small><b>${esc(c.name)}</b></div><em class="chip">${STATUS[c.status]}</em></div>
    <ul>${c.specs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${c.life?.pct != null ? `<div class="lifebar"><i style="width:${c.life.pct}%;background-position:${100 - c.life.pct}% 0"></i></div>` : ''}
    <div class="life">⏳ ${esc(c.life?.text ?? '')}</div></div>`).join('');
  $('pcAdvice').innerHTML = d.advice.length ? d.advice.map((a) => `<div class="adv p${a.prio}"><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small>${a.gain ? `<em>↗ ${esc(a.gain)}</em>` : ''}</div></div>`).join('') : '<div class="empty">Rien à améliorer d’urgent : ton PC est en forme 👌</div>';
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🌍</span><h2>Classement mondial des benchmarks</h2></div>
    ${r?.top ? `<p class="hint">${r.rang ? `Tu es ${r.rang}${r.rang === 1 ? 'er' : 'e'} sur ${r.total}.` : 'Fais un benchmark pour entrer dans le classement.'}</p><div class="ranklist2">${r.top.map((x, n) => `<div class="${x.moi ? 'me' : x.ami ? 'friend' : ''}"><span>${n + 1}</span><b>${esc(x.pseudo)}${x.ami ? ' 👥' : ''}</b><small>${esc([x.cpu, x.gpuName].filter(Boolean).join(' · '))}</small><em>${x.total}</em></div>`).join('')}</div>` : `<p class="hint">${esc(r?.error ?? 'Connecte-toi pour voir le classement.')}</p>`}
    <div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`;
  $('modal').showModal();
  $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); };
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
async function pcDiag(force) {
  pcProgress({ step: 'diag', pct: 20, label: 'Lecture des composants et de leur santé…' });
  const d = await api.pcDiag?.(force).catch((err) => ({ error: err.message }));
  pcProgress({ step: 'done' });
  renderDiag(d);
  return d;
}
function showReport(r, title = 'Rapport détaillé') {
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">📄</span><h2>${esc(title)}</h2></div><div class="reporttxt">${esc(r?.text ?? r?.error ?? 'Rapport indisponible.')}</div>
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
for (const [id, key] of [['boostOn', 'enabled'], ['boostPower', 'power'], ['boostRestore', 'restore'], ['heatAlerts', 'heatAlerts']]) {
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
  const cards = [];
  cards.push(catCard('', '↩', 'Un jeu bug depuis l’optimisation ?', 'Remets tous les réglages de Windows exactement comme avant ta première optimisation (FiveM, GTA V et les autres jeux retrouvent leur comportement normal). Tes fichiers ne sont pas touchés.', '',
    '<button class="btn play" id="optiReset" type="button">↩ Remettre Windows comme avant</button><p class="hint">Point de restauration créé avant. Windows demande l’autorisation administrateur, puis redémarre le PC.</p>', { count: 'réparer', open: [...o.tweaks, ...(state.sys ?? [])].some((t) => t.retired) }));
  for (const [key, icon, title, desc] of GROUPS) {
    const list = o.junk.filter((x) => x.group === key);
    if (!list.length) continue;
    cards.push(catCard(key, icon, title, desc, gb(list.reduce((n, x) => n + x.bytes, 0)), `<div class="checks">${list.map((x) => itemRow('junk', SHADERS.includes(x.id) ? { ...x, note: 'À vider seulement si un jeu saccade après une mise à jour du pilote : sinon les jeux saccadent le temps de le recréer' } : x, !SHADERS.includes(x.id))).join('')}</div>`, { count: `${list.length} élément${list.length > 1 ? 's' : ''}` }));
  }
  if (o.recycle > 0) cards.push(catCard('recycle', '♻', 'Corbeille', 'Fichiers déjà supprimés qui prennent encore de la place.', gb(o.recycle), '<p class="hint">Elle sera vidée définitivement.</p>'));
  cards.push(catCard('orphans', '🧩', 'Restes de jeux désinstallés', 'Dossiers de jeux Steam qui ne sont plus installés.', gb(orphanTotal),
    o.orphans.length ? `<div class="checks">${o.orphans.map((x) => itemRow('orphans', x, false)).join('')}</div><p class="hint">Décochés par défaut : coche ceux que tu veux supprimer.</p>` : '<p class="hint">Aucun reste trouvé 👍</p>', { checked: false, count: `${o.orphans.length} dossier${o.orphans.length > 1 ? 's' : ''}` }));
  cards.push(catCard('', '⏻', 'Démarrage de Windows', 'Moins d’applis au démarrage = PC prêt plus vite et plus de mémoire libre.', `${o.startup.filter((x) => x.enabled).length}`,
    `${o.startup.map((x) => `<label class="toggle small"><input type="checkbox" data-startup="${esc(x.name)}" ${x.enabled ? 'checked' : ''}><span></span>${esc(x.name)}${x.heavy ? ' <small class="warn">ralentit le démarrage</small>' : ''}</label>`).join('') || '<p class="hint">Aucune appli lancée au démarrage.</p>'}<p class="hint">Désactiver ne désinstalle rien (réversible ici ou dans le Gestionnaire des tâches).</p>`, { count: 'au démarrage', open: heavyOn.length > 0 }));
  cards.push(catCard('tweaks', '🎯', 'Réglages Windows pour les jeux', 'Réglages sûrs et réversibles qui donnent des FPS et de la réactivité.', `${o.tweaks.filter((t) => t.on).length}/${o.tweaks.length}`,
    o.tweaks.map((t) => `<label class="toggle small"><input type="checkbox" data-tweak="${esc(t.id)}" ${t.on ? 'checked' : ''}><span></span><div class="tlabel">${esc(t.label)}${t.optional ? ' <small class="opt">facultatif</small>' : ''}${t.retired ? ' <small class="warn">déconseillé : décoche-le</small>' : ''}<small class="hint">${esc(t.retired ?? t.help)}</small></div></label>`).join(''), { count: tweaksOff.length ? `${tweaksOff.length} à faire` : 'optimisés', open: tweaksOff.length > 0 }));
  // Place prise par chaque jeu installé (et ceux pas lancés depuis 6 mois)
  const games = state.items.filter((x) => x.kind === 'game' && x.installed && x.size > 0).sort((a, b) => b.size - a.size);
  const stale = games.filter((g) => !g.lastPlayed || Date.now() - g.lastPlayed > 182 * 86_400_000);
  if (games.length) {
    const maxG = games[0].size;
    cards.push(catCard('', '🎮', 'Place prise par tes jeux', stale.length ? `${stale.length} jeu${stale.length > 1 ? 'x' : ''} pas lancé${stale.length > 1 ? 's' : ''} depuis 6 mois (${gb(stale.reduce((n, g) => n + g.size, 0))}) : désinstalle-les pour faire de la place.` : 'Tous tes jeux installés ont servi ces 6 derniers mois.', gb(games.reduce((n, g) => n + g.size, 0)),
      `<div class="gamesize">${games.slice(0, 20).map((g) => { const old = stale.includes(g); return `<div class="${old ? 'stale' : ''}"><span>${esc(g.name)}</span><div class="t"><i style="width:${(100 * g.size) / maxG}%"></i></div><b>${gb(g.size)}</b><small>${g.lastPlayed ? `joué ${ago(g.lastPlayed).toLowerCase()}` : 'jamais lancé ici'}</small>${old ? `<button class="btn ghost sm" data-uninst="${esc(g.id)}">Désinstaller</button>` : '<span></span>'}</div>`; }).join('')}</div>`, { count: `${games.length} jeux`, open: stale.length > 0 }));
  }
  cards.push(catCard('', '🕘', 'Réglages sauvegardés', 'Avant chaque changement de réglages Windows, History garde une photo de tes réglages : reviens en arrière en un clic ou exporte le rapport avant / après.', '', '<div id="setHist"><p class="hint">Chargement…</p></div>', { count: 'historique' }));
  cards.push(catCard('', '⚙', 'Réglages système pro', 'Priorité aux jeux, planification GPU, alimentation, veille prolongée, télémétrie… Un point de restauration est créé avant. Demande l’autorisation administrateur.', state.sys ? `${state.sys.filter((t) => t.on).length}/${state.sys.length}` : '…',
    `<div id="sysTweaks">${sysTweaksHtml()}</div><div class="row"><button class="btn play" id="sysApply" type="button">Appliquer les réglages cochés</button></div><p class="hint">Chaque réglage est réversible : décoche puis applique pour revenir à la valeur de Windows.</p>`, { count: 'admin', open: Boolean(state.sys?.some((t) => !t.on)) }));
  cards.push(catCard('', '💽', 'Stockage : TRIM et défragmentation', 'TRIM de chaque SSD (garde leurs performances d’écriture) et défragmentation des disques durs, comme l’outil officiel de Windows.', '',
    '<button class="btn" id="optiStorage" type="button">Optimiser tous les disques</button>', { count: 'admin' }));
  cards.push(catCard('', '🩺', 'Réparer Windows (DISM + SFC)', 'Vérifie l’image de Windows et la répare depuis Windows Update, puis contrôle chaque fichier système un par un et remplace ceux qui sont abîmés.', '',
    '<button class="btn" id="optiRepair" type="button">Vérifier et réparer Windows</button><p class="hint">15 à 40 minutes. Utile après des plantages, écrans bleus ou erreurs bizarres.</p><div id="repairOut"></div>', { count: 'admin' }));
  cards.push(catCard('', '🛡', 'Nettoyage profond de Windows', 'Anciennes mises à jour, fichiers temporaires système, cache de distribution, TRIM du SSD, nettoyage des composants. Demande l’autorisation administrateur.', '',
    '<button class="btn" id="optiDeep" type="button">Lancer le nettoyage profond</button><p class="hint">Plusieurs minutes. Windows affiche une demande d’autorisation.</p>', { count: 'admin' }));
  $('optiBody').innerHTML = cards.join('');
  renderSetHist();
}
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
  return { junk: ids('junk'), orphans: ids('orphans'), recycle: Boolean(on('recycle')) && opti.recycle > 0, tweaks: on('tweaks') ? opti.tweaks.filter((t) => !t.on && !t.optional && !t.retired).map((t) => t.id) : [] };
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
  const pct = ((p.index + (p.status === 'fait' ? 1 : 0.5)) / p.total) * 100;
  showProgress(`<div class="oprog"><b>Optimisation en cours… ${Math.floor(pct)} %</b><span class="ofreed">${gb(p.freed)} libérés</span>
    <div class="gbar big"><i style="width:${pct}%"></i></div>
    <div class="olog">${runLog.map((r) => r && `<div class="ok">✓ ${esc(r.label)}${r.got ? ` <em>${gb(r.got)}</em>` : ''}</div>`).filter(Boolean).slice(-6).join('')}${p.status === 'en cours' ? `<div class="run"><i class="spin"></i> ${esc(p.label)}</div>` : ''}</div></div>`);
});
$('optiScan').addEventListener('click', optiScanUi);
$('optiRun').addEventListener('click', async () => {
  const plan = planFromUi();
  const list = [plan.junk.length && `${plan.junk.length} cache(s) et fichiers temporaires`, plan.recycle && 'la corbeille', plan.orphans.length && `${plan.orphans.length} reste(s) de jeux désinstallés`, plan.tweaks.length && `${plan.tweaks.length} réglage(s) Windows pour les jeux`].filter(Boolean);
  if (!list.length) return toast('Rien de coché à optimiser');
  if (!(await ui.confirm({ title: 'Lancer l’optimisation ?', text: 'Tes jeux installés, sauvegardes, mots de passe et fichiers perso ne sont pas touchés.', list, ok: '⚡ Optimiser', icon: '🚀' }))) return;
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
  if (r.fixed?.fixed) toast(r.fixed.reboot ? '✅ Réglages qui faisaient bugger les jeux corrigés : redémarre le PC' : '✅ Réglages qui faisaient bugger les jeux corrigés');
  await refreshHealth(true);
  let benchAfter = null;
  if (gain && benchBefore && !benchBefore.error) { showProgress('<div class="oprog"><b>Mesure après optimisation (≈ 10 s)…</b><div class="gbar big indet"><i></i></div></div>'); benchAfter = await api.benchQuick().catch(() => null); }
  const delta = benchAfter?.total && benchBefore?.total ? Math.round((100 * (benchAfter.total - benchBefore.total)) / benchBefore.total) : null;
  showProgress(`<div class="oprog done"><b>✅ Optimisation terminée</b><div class="odone"><div><b>${gb(r.freed)}</b><small>libérés</small></div><div><b>${r.tweaks}</b><small>réglage${r.tweaks > 1 ? 's' : ''} appliqué${r.tweaks > 1 ? 's' : ''}</small></div><div><b>${before} → ${r.score ?? '?'}</b><small>note d’entretien</small></div><div><b>${state.health?.score ?? '–'}</b><small>score de santé global</small></div>${delta != null ? `<div><b>${benchBefore.total} → ${benchAfter.total}</b><small>mini-benchmark (${delta >= 0 ? '+' : ''}${delta} %${Math.abs(delta) <= 2 ? ', dans la marge de mesure' : ''})</small></div>` : ''}</div><button class="btn ghost" data-closeprog="1">Fermer</button></div>`);
});
$('optiProgress').addEventListener('click', (e) => { if (e.target.closest('[data-closeprog]')) showProgress(null); });
$('optiBody').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.startup) { const r = await api.optiStartup(el.dataset.startup, el.checked); if (r?.ok) { opti.startup = r.startup; toast(el.checked ? `${el.dataset.startup} se lancera au démarrage` : `${el.dataset.startup} ne se lancera plus au démarrage`); } }
  if (el.dataset.tweak) { const r = await api.optiTweak(el.dataset.tweak, el.checked); if (r?.ok) { opti.tweaks = r.tweaks; toast('Réglage appliqué'); } }
  if (el.dataset.catcheck) el.closest('.ocat').classList.toggle('off', !el.checked);
});
$('optiBody').addEventListener('click', async (e) => {
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
    const r = await api.optiReset();
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
    e.target.disabled = true; e.target.textContent = 'Optimisation des disques…';
    const r = await api.optiStorage();
    e.target.disabled = false; e.target.textContent = 'Optimiser tous les disques';
    toast(r?.ok ? '✓ Disques optimisés (TRIM / défragmentation)' : 'Autorisation refusée');
    return;
  }
  if (e.target.id === 'optiRepair') {
    if (!(await ui.confirm({ title: 'Vérifier et réparer Windows ?', text: '15 à 40 minutes. Windows va demander l’autorisation administrateur. Tu peux continuer à utiliser le PC.', list: ['DISM : état de l’image de Windows, réparée depuis Windows Update si besoin', 'SFC : contrôle de chaque fichier système, remplacement de ceux qui sont abîmés'], ok: '🩺 Lancer', icon: '🩺' }))) return;
    e.target.disabled = true;
    $('repairOut').innerHTML = '<div class="gbar big indet"><i></i></div><small class="hint" id="repairStep">Démarrage…</small>';
    const r = await api.optiRepair();
    e.target.disabled = false;
    const H = { Healthy: 'saine', Repairable: 'abîmée mais réparable', NonRepairable: 'abîmée et non réparable' };
    const S = { ok: 'aucun fichier système abîmé', repare: 'fichiers abîmés trouvés et réparés', echec: 'fichiers abîmés que Windows n’a pas pu réparer', inconnu: 'contrôle terminé' };
    $('repairOut').innerHTML = r?.ok ? `<div class="adv ${r.sfc === 'echec' || r.health === 'NonRepairable' ? 'p0' : 'p3'}"><div><b>✅ Vérification terminée</b><small>Image de Windows : ${esc(H[r.health] ?? r.health ?? '?')}${r.dismFixed ? ' (réparée)' : ''} · SFC : ${esc(S[r.sfc] ?? r.sfc)}.</small></div></div>` : `<p class="hint">${esc(r?.error ?? 'Réparation impossible')}</p>`;
    return;
  }
  if (e.target.id === 'optiDeep') {
    if (!(await ui.confirm({ title: 'Nettoyage profond de Windows ?', text: 'Windows va demander l’autorisation administrateur. Ça peut prendre plusieurs minutes.', list: ['Fichiers temporaires de Windows', 'Anciennes mises à jour téléchargées', 'Cache d’optimisation de la distribution', 'Rapports d’erreur système', 'TRIM du SSD et nettoyage des composants Windows'], ok: '🛡 Lancer', icon: '🛡' }))) return;
    showProgress('<div class="oprog"><b>Nettoyage profond en cours…</b><div class="gbar big indet"><i></i></div><div class="hint">Accepte la demande d’autorisation de Windows. Ça peut prendre plusieurs minutes.</div></div>');
    const r = await api.optiDeep();
    showProgress(r?.ok ? `<div class="oprog done"><b>✅ Nettoyage profond terminé</b><div class="odone"><div><b>${r.freed != null ? gb(r.freed) : '—'}</b><small>libérés</small></div></div><button class="btn ghost" data-closeprog="1">Fermer</button></div>` : null);
    if (!r?.ok) toast('Nettoyage profond annulé');
  }
});
$('optiAuto').addEventListener('change', (e) => api.optiAuto?.(e.target.checked).then(() => toast(e.target.checked ? 'Optimisation automatique chaque semaine activée' : 'Optimisation automatique désactivée')));
function openOpti() {
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
  $('pcTop').innerHTML = list.length ? list.map((a) => `<div class="adv p${a.prio}"><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small>${a.gain ? `<em>↗ ${esc(a.gain)}</em>` : ''}</div></div>`).join('') : '<div class="empty">Rien d’urgent : ton PC est en forme 👌</div>';
}

// ---------- Mon PC : onglets ----------
function pcTab(tab) {
  document.querySelectorAll('#pcTabs [data-pctab]').forEach((b) => b.classList.toggle('on', b.dataset.pctab === tab));
  document.querySelectorAll('#view-pc .pctab').forEach((el) => { el.hidden = el.dataset.pctab !== tab; });
  state.pcTab = tab;
  if (tab === 'securite' && !$('pcProcs').dataset.done) { $('pcProcs').dataset.done = '1'; renderProcs(); }
  if (tab === 'analyse' && !$('scanDrives').children.length) renderScanDrives();
}
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
api.onRepair?.((p) => { const el = document.getElementById('repairStep'); if (el) el.textContent = { 'dism-scan': 'DISM : vérification de l’image de Windows…', 'dism-repair': 'DISM : réparation depuis Windows Update…', sfc: 'SFC : contrôle de chaque fichier système…', done: 'Terminé' }[p.step] ?? '…'; });
api.onWu?.((p) => {
  $('wuLive').hidden = p.phase === 'done';
  if (p.phase === 'done') return;
  const pct = ((p.index - (p.phase === 'download' ? 1 : 0.5)) / Math.max(1, p.total)) * 100;
  $('wuLive').innerHTML = `<div class="oprog"><b>${p.phase === 'download' ? 'Téléchargement' : 'Installation'} ${p.index}/${p.total}</b><div class="gbar big"><i style="width:${pct}%"></i></div><small class="hint">${esc(p.title ?? '')}</small></div>`;
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
  const col = state.list.collection && state.cols[state.list.collection];
  // Une collection montre tous ses jeux (même non installés), sauf filtre choisi
  const list = col ? filterSort(state.items.filter((i) => col.items.includes(i.id)), { ...state.list, kind: 'tout', source: 'tout', installed: state.list.installed === 'tout' ? 'tous' : state.list.installed }) : filterSort(state.items, state.list);
  $('listTitle').textContent = col ? `📚 ${col.name}` : state.list.q ? `Résultats pour « ${state.list.q} »` : state.list.source !== 'tout' ? state.sources[state.list.source]?.label ?? 'Plateforme' : TITLES[state.list.kind === 'tout' ? 'bibliotheque' : state.list.kind] ?? 'Bibliothèque';
  $('count').textContent = `${list.length} élément${list.length > 1 ? 's' : ''}`;
  $('grid').innerHTML = list.length ? list.map((i) => card(i, 'gridcard')).join('') : '<div class="empty">Rien ici.</div>';
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
  $('sessions').innerHTML = p.sessions.length ? p.sessions.map((x) => `<div class="sess" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small>${new Date(x.start).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${hours(Math.max(1, (x.end - x.start) / 60_000))}</small></div>`).join('') : '<div class="empty">Tes prochaines parties apparaîtront ici.</div>';
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
  ].filter(Boolean);
  $('chips').innerHTML = chips.map(([ico, t]) => `<button data-ask="${esc(t)}"><i>${ico}</i>${esc(t)}</button>`).join('');
}
function applyReply(r) {
  if (!r) return;
  say(r.reply || 'D’accord.');
  const views = { jeux: 'jeux', applis: 'applis', favoris: 'favoris', stats: 'stats', classement: 'classement', bibliotheque: 'bibliotheque', accueil: 'accueil', amis: 'amis', pc: 'pc', optimisation: 'optimisation' };
  if (r.action === 'show') { if (r.value === 'parametres') $('openSettings').click(); else go(views[r.value] ?? 'bibliotheque'); }
  if (r.action === 'optimize') go('optimisation');
  if (r.action === 'deep_clean') go('optimisation');
  if (r.action === 'theme' && r.value) { themeName = r.value; $('themeSel').value = r.value; if (r.value === 'auto') themeFor(state.sel); else applyTheme(THEMES[r.value]); }
  if (r.action === 'fullscreen') toggleBig(true);
  if (r.action === 'recap') api.recap?.().then(showRecap);
  if (r.action === 'daily_limit') $('dailyLimit').value = String(r.value ?? 0);
  if (r.action === 'sort') { state.list.sort = r.value; $('sort').value = r.value; go('bibliotheque'); }
  if (r.action === 'search') { $('q').value = r.value; $('q').dispatchEvent(new Event('input')); }
  if (r.itemId && !['uninstall'].includes(r.action)) { const it = state.items.find((i) => i.id === r.itemId); if (it) select(it); }
  if (['music', 'volume'].includes(r.action)) setTimeout(refreshMusic, 800);
}
async function ask(text) {
  if (!text.trim()) return;
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
  if (view !== state.view) window.sfx?.play('nav');
  const lists = { bibliotheque: 'tout', jeux: 'jeux', applis: 'applis', favoris: 'favoris' };
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'ia') { openAssistant(true); document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view || (state.view === 'liste' && false))); return; }
  if (view in lists) { state.list.kind = lists[view]; state.list.source = 'tout'; state.list.collection = null; showView('liste'); } else showView(view);
  renderPlatforms();
  if (state.view === 'liste') renderList();
  if (state.view === 'stats') renderStats();
  if (state.view === 'classement') renderRanking();
  if (state.view === 'amis') showFriendTab(state.ftab);
  if (state.view === 'pc') openPc();
  if (state.view === 'optimisation') openOpti();
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
    <div id="sxHist"></div><div id="sxTime"></div><div id="sxPatch"></div><div id="sxAch"></div><div id="sxCaps"></div>
    <div class="acts"><button class="btn" data-close="1">Fermer</button></div>`;
  $('sheet').showModal();
  loadSheetExtras(i);
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
  const r = await api.repair(state.verifyItem);
  $('verifyDlg').close();
  toast(r.ok ? 'Réparation lancée en arrière-plan : seuls les fichiers abîmés sont re-téléchargés.' : `Impossible : ${r.error}`);
});

async function act(action) {
  const item = state.sel;
  if (!item) return;
  if (action === 'verify') { api.verify(item.id).then((r) => r?.error && toast(`Impossible : ${r.error}`)); return; }
  const labels = { launch: `Lancement de ${item.name}…`, install: `Installation de ${item.name}…`, verify: 'Vérification des fichiers lancée', uninstall: 'Désinstallation…', folder: 'Dossier ouvert', store: 'Page du magasin ouverte' };
  if (action === 'launch') window.sfx?.play('launch');
  const r = await api.action(item.id, action);
  if (r?.ok) toast(labels[action]);
  else if (action === 'launch') window.sfx?.play('error');
  else if (r?.error) toast(`Impossible : ${r.error}`);
}

// ---------- Événements ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-id], [data-reco], [data-free], [data-deal], [data-news]');
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
  if (t.dataset.upd) { const r = await api.action(t.dataset.upd, 'update'); return toast(r?.ok ? 'Steam fait la mise à jour puis lance le jeu' : r?.error ?? 'Impossible pour l’instant'); }
  if (t.dataset.news) return api.openNews(t.dataset.news, t.dataset.gid).then(() => toast('Article ouvert'));
  if (t.dataset.boostgame && state.sel) {
    const r = await api.setBoost({ game: { id: state.sel.id, mode: t.dataset.boostgame } });
    boostGames = r?.games ?? {};
    return toast(t.dataset.boostgame === 'on' ? `⚡ ${state.sel.name} sera toujours optimisé au lancement` : t.dataset.boostgame === 'off' ? `${state.sel.name} ne sera jamais optimisé` : 'Réglage par défaut remis');
  }
  if (t.dataset.gmod) return openGmod();
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
const VIEW_KEYS = ['accueil', 'bibliotheque', 'jeux', 'applis', 'favoris', 'stats', 'classement', 'amis', 'pc', 'optimisation'];
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
  if (ctrl && /^[0-9]$/.test(e.key)) { e.preventDefault(); go(VIEW_KEYS[e.key === '0' ? 9 : Number(e.key) - 1]); return; }
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
  $('gameMode').checked = s.gameMode !== false;
  $('dealAlerts').checked = s.dealAlerts !== false;
  $('widgetGame').checked = Boolean(s.widgetGame); $('gamePopups').checked = s.gamePopups === true; $('promoDm').checked = s.promoDm !== false;
  $('streamerAuto').checked = s.streamerAuto !== false; $('streamerOn').checked = Boolean(s.streamer);
  $('discordStatus').checked = s.discordStatus !== false;
  $('shareActivity').checked = s.shareActivity !== false;
  $('friendNotifs').checked = s.friendNotifs !== false;
  $('replay').checked = Boolean(s.replay);
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
  $('aiState').textContent = s.gemini ? '● en ligne' : '● hors ligne';
  $('aiState').classList.toggle('on', Boolean(s.gemini));
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
$('gameMode').addEventListener('change', (e) => api.setSettings({ gameMode: e.target.checked }));
$('dealAlerts').addEventListener('change', (e) => api.setSettings({ dealAlerts: e.target.checked }));
for (const [id, key] of [['widgetGame', 'widgetGame'], ['gamePopups', 'gamePopups'], ['promoDm', 'promoDm'], ['streamerAuto', 'streamerAuto'], ['streamerOn', 'streamer']]) $(id).addEventListener('change', (e) => api.setSettings({ [key]: e.target.checked }).then(() => api.streamer?.()).then((on) => { if (on != null) document.body.classList.toggle('streamer', Boolean(on)); }));
// Mode streamer : pseudos des amis floutés tant qu'un logiciel de live tourne (ou si le mode est forcé)
api.streamer?.().then((on) => document.body.classList.toggle('streamer', Boolean(on))).catch(() => {});
api.onStreamer?.((on) => { document.body.classList.toggle('streamer', Boolean(on)); if (on) toast('🔴 Mode streamer : notifications coupées, pseudos masqués'); });
$('discordStatus').addEventListener('change', (e) => api.setSettings({ discordStatus: e.target.checked }));
$('shareActivity').addEventListener('change', (e) => api.setSettings({ shareActivity: e.target.checked }));
$('friendNotifs').addEventListener('change', (e) => api.setSettings({ friendNotifs: e.target.checked }));
document.querySelectorAll('.setnav [data-pane]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.setnav [data-pane]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.setpane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.pane; });
  window.sfx?.play('nav');
}));
const sfxSave = () => { const c = { sfxOn: $('sfxOn').checked, sfxNotif: $('sfxNotif').checked, sfxVol: Number($('sfxVol').value) }; window.sfx?.set({ on: c.sfxOn, notif: c.sfxNotif, vol: c.sfxVol / 100 }); api.setSettings(c); };
['sfxOn', 'sfxNotif'].forEach((id) => $(id).addEventListener('change', sfxSave));
$('sfxVol').addEventListener('change', () => { sfxSave(); window.sfx?.play('success'); });
document.querySelectorAll('[data-sfxtry]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const was = window.sfx.get(); window.sfx.set({ on: true, notif: true }); window.sfx.play(b.dataset.sfxtry); window.sfx.set(was); }));
$('textScale').addEventListener('change', (e) => api.setSettings({ textScale: Number(e.target.value) }));
$('compact').addEventListener('change', (e) => { document.body.classList.toggle('compact', e.target.checked); api.setSettings({ compact: e.target.checked }); });
$('dnd').addEventListener('change', (e) => api.setSettings({ dnd: e.target.checked }).then(() => { window.sfx?.set({ notif: !e.target.checked && $('sfxNotif').checked }); toast(e.target.checked ? '⛔ Ne pas déranger activé' : 'Notifications réactivées'); }));
$('tournament').addEventListener('change', (e) => api.setSettings({ tournament: e.target.checked }).then(() => toast(e.target.checked ? '🏆 Mode tournoi : boost sur chaque partie, zéro notification' : 'Mode tournoi désactivé')));
$('libExport').addEventListener('click', async () => { const r = await api.libExport(); if (r?.ok) toast('📤 Bibliothèque exportée'); });
$('libImport').addEventListener('click', async () => { const r = await api.libImport(); if (r?.ok) { toast('📥 Bibliothèque importée'); api.settings().then(showKeys); } else if (r?.error) toast(r.error); });
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
$('replay').addEventListener('change', (e) => api.setSettings({ replay: e.target.checked }).then(() => toast(e.target.checked ? '🎬 Replay activé : Ctrl+Alt+R garde les 30 dernières secondes' : 'Replay désactivé')));

// Assistant : bulle en bas à droite, qui s'ouvre et se referme
function openAssistant(open = !$('aipop').classList.contains('open')) {
  $('aipop').classList.toggle('open', open);
  if (open) setTimeout(() => $('askInput').focus(), 50);
}
$('aifab').addEventListener('click', () => openAssistant());
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">💸</span><h2>Alertes de prix</h2></div>
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
  $('modalBox').innerHTML = `<div class="mhead"><span class="micon">🛡</span><h2>Double authentification</h2></div>
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
    $('modalBox').innerHTML = `<div class="mhead"><span class="micon">✅</span><h2>Double authentification activée</h2></div>
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
  ctx.innerHTML = `<div class="ctxhead">${esc(state.account.pseudo)}</div><button data-pact="edit">🎨 Personnaliser mon profil</button><button data-pact="friends">👥 Mes amis</button><hr><button class="danger" data-pact="logout">Se déconnecter</button>`;
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
  api.recap?.().then((r) => { if (r?.fresh) showRecap(r); else showWhatsNew(); }).catch(() => showWhatsNew());
  api.collections?.().then((c) => { state.cols = c ?? {}; renderCollections(); }).catch(() => {});
}
api.onUpdate?.((lib) => { applyLibrary(lib); renderAll(); });
api.onActive?.((ids) => { state.active = new Set(ids); renderHome(); renderHero(); });
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
addEventListener('blur', idle); addEventListener('focus', idle); document.addEventListener('visibilitychange', () => { idle(); if (!document.hidden) refreshMusic(); });
setInterval(() => { if (state.view === 'stats') renderStats(); if (state.view === 'classement') renderRanking(); }, 60_000);

// ---------- Aperçu hors Electron (données d'exemple, images locales du dossier demo/) ----------
function demoApi() {
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
    game('steam:359550', 'Rainbow Six Siege', 'steam', 9600, 9, 60, { cover: img('c1.jpg') }),
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
    hFriends: async () => ({ code: 'Noam#3F9A2C', moi: { week: 610, top: 'Rocket League' }, demandes: [{ id: 'z', pseudo: 'Zoé', code: 'Zoé#11AA22' }],
      amis: [{ id: 'm', pseudo: 'Max', online: true, playing: 'Grand Theft Auto V Enhanced — serveur FiveM RP très long', since: Date.now() - 42 * 60_000, week: 840, top: 'FiveM', status: 'Soirée RP 🚓 on recrute des flics motivés ce soir', bench: 1420, join: { fivem: 'abc123' }, color: '#f97316', frame: 'feu', nameFx: 'neon', banner: 'lave', bio: 'Flic le jour, braqueur la nuit. Serveur RP tous les soirs à 21 h.', favGame: 'FiveM', badges: ['rp', 'nuit', 'streamer'], links: { twitch: 'max_rp', discord: 'max.rp', youtube: 'MaxRP', tiktok: 'max.rp' }, since: Date.now() - 200 * 86_400_000 }, { id: 'l', pseudo: 'Léa', online: true, playing: null, week: 300, top: 'VALORANT', status: 'Dispo pour jouer' }, { id: 'k', pseudo: 'UnPseudoVraimentTrèsLongPourTester', online: true, playing: 'Rocket League', since: Date.now() - 5 * 60_000, week: 120, dnd: true, bench: 980 }, { id: 's', pseudo: 'Sam', online: false, playing: null, week: 95, top: 'Fortnite' }],
      groupes: [{ id: 'g1', name: 'Squad RL — les meilleurs du serveur', owner: true, members: [{ id: 'me', pseudo: 'Noam', online: true }, { id: 'm', pseudo: 'Max', online: true, playing: 'FiveM' }, { id: 'l', pseudo: 'Léa', online: true }, { id: 's', pseudo: 'Sam', online: false }, { id: 'a', pseudo: 'Alex', online: false }, { id: 'b', pseudo: 'Bob', online: true }, { id: 'c', pseudo: 'Chloé', online: false }, { id: 'd', pseudo: 'Dan', online: false }] }] }),
    notifs: async () => ({ unread: 3, list: [
      { id: 'n1', at: Date.now() - 60_000, kind: 'msg', cat: 'amis', icon: '💬', title: 'Max', body: 'T’es chaud pour une partie ce soir ? On lance le serveur RP vers 21 h', from: 'm', read: false },
      { id: 'n2', at: Date.now() - 4 * 60_000, kind: 'missed', cat: 'amis', icon: '📵', title: 'Appel manqué de Léa', body: 'Clique pour le rappeler.', from: 'l', read: false },
      { id: 'n3', at: Date.now() - 9 * 60_000, kind: 'invite', cat: 'amis', icon: '📨', title: 'Max t’invite', body: 'Rejoins sa partie de FiveM !', from: 'm', read: false },
      { id: 'n4', at: Date.now() - 3 * 3_600_000, kind: 'app', cat: 'appli', icon: '🔔', title: 'History Launcher v0.21.0 disponible', body: 'Clique pour mettre à jour maintenant (moins d’une minute).', read: true },
      { id: 'n5', at: Date.now() - 30 * 3_600_000, kind: 'share', cat: 'amis', icon: '💾', title: 'Sam t’envoie une sauvegarde', body: 'Minecraft · Monde survie (412 Ko)', read: true, done: 'saveget' }] }),
    chatSend: async (fid, text, cid) => ({ ok: true, id: cid, message: { id: cid, from: 'me', text, at: Date.now() } }), friendJoin: async () => ({ ok: true }), callStart: async () => ({ error: 'Aperçu : pas d’appel' }),
    notifsRead: async () => ({ unread: 0 }), notifsClear: async () => ({ list: [], unread: 0 }), notifsAct: async () => ({ ok: true }),
    chatThread: async () => ({ fil: [{ id: 'a1', from: 'm', text: 'Yo ! T’es là ?', at: Date.now() - 3_600_000 }, { id: 'a2', from: 'm', text: 'On lance le serveur RP vers 21 h', at: Date.now() - 3_590_000 }, { id: 'a3', from: 'me', text: 'Grave, j’arrive dans 10 min', at: Date.now() - 3_500_000 }] }),
    chatDelete: async () => ({ ok: true }), groupDelete: async () => ({ ok: true }),
    groupThread: async () => ({ fil: [{ id: 'g1', from: 'm', text: 'Qui est chaud pour une ranked ce soir ?', at: Date.now() - 7_200_000 }, { id: 'g2', from: 'l', text: 'Moi ! 21 h ?', at: Date.now() - 7_100_000 }, { id: 'g3', from: 'l', text: 'Je ramène Sam aussi', at: Date.now() - 7_080_000 }, { id: 'g4', from: 'me', text: 'Parfait, je lance le serveur', at: Date.now() - 7_000_000 }] }),
    groupSend: async (gid, text, cid) => ({ ok: true, id: cid, message: { id: cid, from: 'me', text, at: Date.now() } }),
    events: async () => ({ soirees: [{ id: 'e1', game: 'Rocket League', at: Date.now() + 5 * 3_600_000, mine: true, organisateur: 'Noam', ma: 'oui', invites: [{ pseudo: 'Max', reponse: 'oui' }, { pseudo: 'Léa', reponse: null }] }, { id: 'e2', game: 'VALORANT', at: Date.now() + 26 * 3_600_000, mine: false, organisateur: 'Léa', ma: null, invites: [{ pseudo: 'Noam', reponse: null }] }] }),
    pc: async () => ({ cpu: { usage: 37, temp: null, name: 'AMD Ryzen 7 5800X' }, ram: { used: 11.2e9, total: 32e9 }, gpu: { name: 'NVIDIA GeForce RTX 3070', usage: 92, temp: 71, vramUsed: 6200, vramTotal: 8192 } }),
    boost: async () => ({ enabled: true, power: true, restore: true, heatAlerts: true, close: ['chrome'], apps: [{ id: 'chrome', label: 'Google Chrome' }, { id: 'edge', label: 'Microsoft Edge' }, { id: 'onedrive', label: 'OneDrive' }, { id: 'office', label: 'Word / Excel / PowerPoint' }] }),
    setBoost: async (b) => b,
    optiAuto: async () => ({ on: true }),
    optiScan: async () => ({ score: 58, label: 'Moyen', free: 84e9, disk: 512e9, recycle: 2.1e9, junk: [{ id: 'temp', group: 'systeme', label: 'Fichiers temporaires de Windows', bytes: 3.4e9 }, { id: 'inetcache', group: 'systeme', label: 'Cache Internet de Windows', bytes: 0.6e9 }, { id: 'chrome-Default', group: 'navigateurs', label: 'Cache de Google Chrome', bytes: 1.3e9, note: 'Mots de passe et historique gardés' }, { id: 'nv-install', group: 'pilotes', label: 'Restes d’installation NVIDIA', bytes: 1.9e9, note: 'Anciens pilotes décompressés' }, { id: 'steam-logs', group: 'jeux', label: 'Journaux de Steam', bytes: 0.2e9 }], orphans: [{ id: 'o1', label: 'Apex Legends', bytes: 12.4e9 }], startup: [{ name: 'Discord', enabled: true, heavy: true }, { name: 'Steam', enabled: true, heavy: true }, { name: 'Pilote tablette', enabled: true, heavy: false }], tweaks: [{ id: 'gamemode', label: 'Mode Jeu de Windows activé', help: 'Windows donne la priorité au jeu en cours.', on: true }, { id: 'dvr', label: 'Enregistrement en arrière-plan de la Xbox Game Bar coupé', help: 'Évite que Windows filme en continu pendant les parties (gain de FPS).', on: false }] }),
    optiRun: async () => ({ ok: true, freed: 20.8e9, tweaks: 1, score: 93 }), optiStartup: async () => ({ ok: true, startup: [] }), optiTweak: async () => ({ ok: true, tweaks: [] }), optiDeep: async () => ({ ok: true, freed: 6e9 }),
    cleanScan: async () => [{ id: 'temp', label: 'Fichiers temporaires de Windows', bytes: 3.4e9 }, { id: 'nvdx', label: 'Cache NVIDIA (DirectX)', bytes: 1.1e9, note: 'Recréé au prochain lancement des jeux' }, { id: 'discord', label: 'Cache de Discord', bytes: 420e6, note: 'Ferme Discord pour tout vider' }],
    cleanRun: async () => ({ ok: true, freed: 4.9e9 }),
    deals: async () => [{ appid: '1', name: 'Jeu en promo', pct: 75, price: '4,99€', before: '19,99€', image: img('h1.jpg') }],
    version: async () => '0.24.0',
    scanDrives: async () => [{ letter: 'C', size: 1e12, used: 6.2e11, system: true }, { letter: 'D', size: 2e12, used: 9e11, system: false }],
    freeGames: async () => [{ name: 'Jeu gratuit', slug: 'jeu', image: img('h2.jpg'), now: true, until: Date.now() + 5 * 86_400_000 }, { name: 'Prochain jeu', slug: 'prochain', image: img('h1.jpg'), now: false, from: Date.now() + 5 * 86_400_000 }], openFree: async () => {},
    scan: async () => ({ items, sources: { steam: { label: 'Steam', color: '#66c0f4', logo: 'brands/steam.svg', bg: '#1b2838' }, epic: { label: 'Epic Games', color: '#e6e6e6', logo: 'brands/epicgames.svg', bg: '#2a2a2a' }, riot: { label: 'Riot', color: '#ff4655', logo: 'brands/riotgames.svg', bg: '#eb0029' }, roblox: { label: 'Roblox', color: '#e2231a', logo: 'brands/roblox.svg', bg: '#e2231a' }, pc: { label: 'PC', color: '#9aa0aa', logo: 'brands/windows.svg', bg: '#0078d4' } } }),
    action: async () => ({ ok: true }), setItem: async () => ({}), settings: async () => ({ autostart: true, gemini: true }), setSettings: async (s) => s, win: () => {},
    details: async () => ({ developers: ['Rockstar North'], screenshots: [img('h1.jpg'), img('c2.jpg'), img('h2.jpg')], achievements: { done: 45, total: 77 } }),
    reco: async () => [1, 2, 3, 4, 5].map((n) => ({ name: `Jeu recommandé ${n}`, why: 'Même style que GTA V', steamId: String(n), art: { header: img(n % 2 ? 'h1.jpg' : 'h2.jpg') } })),
    stats: async () => ({ split: { jeux: 1814, applis: 454, musique: 151, autres: 101 }, top: items.map((i) => ({ name: i.name, minutes: i.minutes })), recent: { 'reg:valorant': 300, 'steam:271590': 240, 'epic:Fortnite': 120, 'epic:rl': 60 }, profile: 'Noam' }),
    nowPlaying: async () => ({ player: 'Spotify', artist: 'Bir Hakeim', title: 'Cherry Pie', playing: true, cover: img('c4.jpg'), duration: 192 }),
    mediaKey: async () => true, platformAccounts: async () => ({ steam: [{ id: '1', name: 'Noam', recent: true }, { id: '2', name: 'Petit frère' }], epic: [], chosen: { steam: '1', epic: null }, total: false }), setPlatformAccounts: async () => ({}),
    onVerify: (fn) => { demoVerify = fn; },
    verify: async (id) => {
      const name = items.find((i) => i.id === id)?.name ?? 'Jeu';
      demoVerify?.({ id, name, phase: 'start' });
      demoVerify?.({ id, name, phase: 'run', done: 1840, total: 3120, bytes: 64.2e9, totalBytes: 108.7e9, file: 'x64a.rpf' });
      if (location.hash.includes('fin')) demoVerify?.({ id, name, phase: 'done', canRepair: true, result: { mode: 'complet', ok: false, checked: 3117, missing: ['update/x64/dlcpacks/patchday27ng/dlc.rpf'], corrupt: ['x64a.rpf', 'common.rpf'], sizes: [] } });
      return {};
    },
    account: async () => (location.hash.includes('connecte') ? { compte: { id: 'me', pseudo: 'Noam', email: 'noam@exemple.fr', profile: { color: '#8b5cf6', bio: 'RP tous les soirs, main support', avatar: null, frameColor: '#22c55e', frame: 'galaxie', nameFx: 'degrade', banner: 'synthwave', badges: ['fondateur', 'rp'], favGame: 'Rocket League', links: { twitch: 'noam_tv' } } } } : { compte: null, skipped: true }),
    saveProfile: async (p) => ({ ok: true, compte: { id: 'me', pseudo: 'Noam', email: 'noam@exemple.fr', profile: { color: p.couleur, bio: p.bio, avatar: null } } }), register: async (b) => ({ ok: true, compte: { pseudo: b.pseudo, email: b.email } }), login: async () => ({ ok: false, error: 'E-mail ou mot de passe incorrect.' }), skipAccount: async () => ({}), setVoice: async () => ({}), ask: async (t) => ({ reply: `(aperçu) Je m’occupe de « ${t} ».`, action: 'none' }), openReco: async () => {},
  };
}

// ---------- 🎮 Manette : croix / stick = se déplacer, A = valider, B = retour, X = jouer, Y = menu du jeu,
// LB / RB = page précédente / suivante, Start = recherche. Ne tourne que si une manette est branchée. ----------
(() => {
  const NAV = ['accueil', 'jeux', 'applis', 'favoris', 'stats', 'classement', 'amis', 'pc', 'optimisation'];
  const prev = {}; let raf = null; let lastMove = 0;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const scope = () => ($('modal').open ? $('modal') : $('settings').open ? $('settings') : document);
  const targets = () => [...scope().querySelectorAll('button:not([disabled]), [data-id], input, select, .side [data-view]')].filter((el) => visible(el) && !el.closest('[hidden]'));
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
    if (state.gamepadOn === false || !document.hasFocus()) { raf = setTimeout(loop, 500); return; }
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const now = performance.now();
      const [lx = 0, ly = 0] = pad.axes;
      const dir = [pad.buttons[14]?.pressed || lx < -0.6 ? -1 : pad.buttons[15]?.pressed || lx > 0.6 ? 1 : 0, pad.buttons[12]?.pressed || ly < -0.6 ? -1 : pad.buttons[13]?.pressed || ly > 0.6 ? 1 : 0];
      if ((dir[0] || dir[1]) && now - lastMove > 170) { lastMove = now; move(dir[0], dir[0] ? 0 : dir[1]); }
      if (!dir[0] && !dir[1]) lastMove = 0;
      const el = document.activeElement;
      if (press(0, pad) && el && el !== document.body) el.click();
      if (press(1, pad)) { if (!$('ctx').hidden) hideCtx(); else if ($('modal').open) $('modal').close(); else if ($('settings').open) $('settings').close(); else go('accueil'); }
      if (press(2, pad) && el?.dataset?.id) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      if (press(3, pad) && el?.dataset?.id) { const r = el.getBoundingClientRect(); openCtx(state.items.find((x) => x.id === el.dataset.id), r.left, r.bottom); }
      if (press(4, pad) || press(5, pad)) { const i = NAV.indexOf(state.view); go(NAV[(Math.max(0, i) + (pad.buttons[5]?.pressed ? 1 : NAV.length - 1)) % NAV.length]); }
      if (press(9, pad)) openPalette();
    }
    raf = requestAnimationFrame(loop);
  }
  addEventListener('gamepadconnected', (e) => { toast(`🎮 Manette connectée : ${e.gamepad.id.split('(')[0].trim()}`); if (!raf) loop(); });
  addEventListener('gamepaddisconnected', () => { if (![...(navigator.getGamepads?.() ?? [])].some(Boolean) && raf) { cancelAnimationFrame(raf); clearTimeout(raf); raf = null; } });
})();
