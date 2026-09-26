// Interface du launcher : accueil (bannière, plus joués, applis, recommandations), bibliothèque, statistiques,
// assistant IA et lecteur de musique. Toutes les images sont les images officielles trouvées par le launcher.
import { filterSort } from '../core/sort.js';

const $ = (id) => document.getElementById(id);
let demoVerify = null; // aperçu hors Electron seulement
const api = window.launcher ?? demoApi(); // hors Electron (aperçu dans un navigateur) : données d'exemple
const state = { items: [], sources: {}, sel: null, active: new Set(), view: 'accueil', list: { sort: 'joues', kind: 'tout', source: 'tout', installed: 'tout', q: '' }, period: 'semaine', rank: 'tout', profile: 'Joueur', music: null, recos: [], free: [], deals: [], cols: {}, friends: null, hist: null, events: [], ftab: 'history', song: null, account: null };

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

function toast(text) {
  const t = $('toast');
  t.textContent = text;
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
  if (i.source === 'fivem') m.push('<button data-fivem="1">🔗 Rejoindre un serveur…</button>');
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

// ---------- Amis Steam ----------
const FRIEND_HELP = {
  cle: 'Ajoute ta clé d’API Steam dans Paramètres pour voir tes amis (gratuit, 1 minute).',
  prive: 'Ta liste d’amis Steam est privée : Steam › Profil › Modifier › Confidentialité › « Liste d’amis » en Public.',
  compte: 'Aucun compte Steam trouvé sur ce PC. Choisis-le dans Paramètres › Comptes de jeu.',
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
function renderFriends() {
  const r = state.friends;
  if (!r) { $('friendsBody').innerHTML = '<div class="empty">Chargement…</div>'; return; }
  if (!r.ok) { $('friendsCount').textContent = ''; $('friendsBody').innerHTML = `<div class="empty">${esc(FRIEND_HELP[r.reason] ?? FRIEND_HELP.erreur)}</div>`; return; }
  const groups = [['En jeu', r.friends.filter((f) => f.game)], ['En ligne', r.friends.filter((f) => f.online && !f.game)], ['Hors ligne', r.friends.filter((f) => !f.online)]];
  $('friendsCount').textContent = `${r.friends.filter((f) => f.online).length} en ligne sur ${r.friends.length}`;
  const mine = (f) => f.appid && state.items.find((i) => i.steamId === f.appid && i.installed);
  $('friendsBody').innerHTML = groups.filter(([, l]) => l.length).map(([title, l]) => `
    <h3 class="fgroup">${title} <em>${l.length}</em></h3>
    <div class="friends">${l.map((f) => `
      <div class="friend ${f.game ? 'ingame' : f.online ? 'on' : ''}">
        ${f.avatar ? `<img src="${esc(f.avatar)}" alt="">` : `<span class="fav">${esc(f.name[0])}</span>`}
        <div class="finfo"><b>${esc(f.name)}</b><small>${f.game ? `Joue à ${esc(f.game)}` : esc(f.status)}</small></div>
        <div class="factions">
          ${f.game ? `<button class="btn play" data-friend="join" data-fid="${esc(f.id64)}" ${f.lobby ? '' : 'disabled title="Pas de partie ouverte à rejoindre"'}>Rejoindre</button>` : ''}
          ${f.game && !f.lobby && mine(f) ? `<button class="btn" data-id="${esc(mine(f).id)}" title="Lancer le même jeu">Lancer ${esc(f.game)}</button>` : ''}
          ${f.online ? `<button class="btn" data-friend="message" data-fid="${esc(f.id64)}">Message</button>` : ''}
          <button class="btn ghost" data-friend="profile" data-fid="${esc(f.id64)}" title="Profil Steam">Profil</button>
        </div>
      </div>`).join('')}</div>`).join('') || '<div class="empty">Aucun ami Steam pour l’instant.</div>';
}
// ---------- Amis History (comptes du launcher) et soirées jeu ----------
const needLogin = '<div class="empty">Connecte-toi à ton compte History pour ajouter des amis et organiser des soirées.<br><br><button class="btn play" data-login="1">Se connecter</button></div>';
async function loadHistory() {
  const [r, ev] = await Promise.all([api.hFriends?.().catch(() => null), api.events?.().catch(() => null)]);
  state.hist = r;
  state.events = ev?.soirees ?? [];
  renderHistory();
  const online = (r?.amis ?? []).filter((a) => a.online).length + (state.friends?.friends ?? []).filter((f) => f.online).length;
  $('friendsOnline').textContent = online || '';
}
function renderHistory() {
  const r = state.hist;
  if (!r || r.status === 401) { $('hFriends').innerHTML = needLogin; $('hRequests').innerHTML = ''; $('myCode').textContent = '—'; $('eventsList').innerHTML = ''; return; }
  if (r.error) { $('hFriends').innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  $('myCode').textContent = r.code;
  $('hRequests').innerHTML = r.demandes.length ? `<div class="reqbox"><b class="sub">Demandes d’ami</b>${r.demandes.map((d) => `
    <div class="hfriend"><div class="finfo"><b>${esc(d.pseudo)}</b><small>${esc(d.code)}</small></div><button class="btn play" data-hacc="${esc(d.id)}">Accepter</button><button class="btn" data-hrem="${esc(d.id)}">Refuser</button></div>`).join('')}</div>` : '';
  $('hFriends').innerHTML = r.amis.length ? r.amis.map((a) => `
    <div class="hfriend ${a.playing ? 'ingame' : a.online ? 'on' : ''}"><span class="dot"></span>
      <div class="finfo"><b>${esc(a.pseudo)}</b><small>${a.playing ? `Joue à ${esc(a.playing)}` : a.online ? 'En ligne' : 'Hors ligne'}${a.week ? ` · ${hours(a.week)} cette semaine` : ''}</small></div>
      <button class="btn ghost" data-hrem="${esc(a.id)}" data-name="${esc(a.pseudo)}" title="Retirer">✕</button></div>`).join('') : '<div class="empty">Pas encore d’amis : donne ton code à tes potes, ou ajoute le leur.</div>';
  renderEvents();
  $('eInvites').innerHTML = r.amis.length ? r.amis.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}">${esc(a.pseudo)}</label>`).join('') : '<small class="hint">Ajoute d’abord des amis.</small>';
  const list = games().filter((i) => i.installed || i.minutes).sort((a, b) => b.minutes - a.minutes);
  $('eGame').innerHTML = list.map((i) => `<option>${esc(i.name)}</option>`).join('');
  if (!$('eAt').value) { const d = new Date(Date.now() + 3_600_000); d.setMinutes(0, 0, 0); $('eAt').value = new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
}
function renderEvents() {
  const when = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  $('eventsList').innerHTML = state.events.length ? state.events.map((e) => {
    const yes = e.invites.filter((i) => i.reponse === 'oui').map((i) => i.pseudo);
    const live = e.at <= Date.now();
    return `<div class="eve"><b>${esc(e.game)}</b><span class="when">${live ? 'En cours' : esc(when(e.at))}</span>
      <span class="who">${e.mine ? 'Organisée par toi' : `Organisée par ${esc(e.organisateur)}`} · ${yes.length ? `${esc(yes.join(', '))} ${yes.length > 1 ? 'viennent' : 'vient'}` : 'Personne n’a encore répondu'}</span>
      <div class="acts">${e.mine ? `<button class="btn" data-ecancel="${esc(e.id)}">Annuler</button>` : `<button class="btn ${e.ma === 'oui' ? 'play' : ''}" data-eresp="${esc(e.id)}" data-r="oui">Je viens</button><button class="btn ${e.ma === 'non' ? 'play' : ''}" data-eresp="${esc(e.id)}" data-r="non">Pas dispo</button>`}
      ${state.items.some((i) => i.installed && i.name === e.game) ? `<button class="btn" data-id="${esc(state.items.find((i) => i.installed && i.name === e.game).id)}">Voir le jeu</button>` : ''}</div></div>`;
  }).join('') : '<div class="empty">Aucune soirée prévue.</div>';
}
function showFriendTab(tab) {
  state.ftab = tab;
  document.querySelectorAll('#friendTabs button').forEach((b) => b.classList.toggle('on', b.dataset.ftab === tab));
  $('fHistory').hidden = tab !== 'history';
  $('fSteam').hidden = tab !== 'steam';
  if (tab === 'history') { $('friendsCount').textContent = ''; loadHistory(); } else { renderFriends(); loadFriends(); }
}
$('copyCode').addEventListener('click', () => { navigator.clipboard?.writeText($('myCode').textContent); toast('Code copié'); });
$('addFriend').addEventListener('click', async () => {
  const code = $('addCode').value.trim();
  if (!code) return;
  const r = await api.hFriendAdd(code);
  toast(r?.amis ? 'Vous êtes maintenant amis !' : r?.envoye ? 'Demande envoyée' : r?.error ?? 'Impossible pour l’instant');
  if (r?.amis || r?.envoye) { $('addCode').value = ''; loadHistory(); }
});
$('eCreate').addEventListener('click', async () => {
  const invites = [...document.querySelectorAll('#eInvites input:checked')].map((i) => i.value);
  const r = await api.eventCreate({ jeu: $('eGame').value, at: new Date($('eAt').value).getTime(), invites });
  if (r?.soirees) { state.events = r.soirees; renderEvents(); $('eCreate').closest('details').open = false; toast('Invitations envoyées'); } else toast(r?.error ?? 'Impossible pour l’instant');
});
$('friendsRefresh').addEventListener('click', () => (state.ftab === 'history' ? loadHistory() : loadFriends(true)).then(() => toast('Amis actualisés')));
setInterval(() => { if (state.view === 'amis' && state.ftab === 'history') loadHistory(); }, 60_000);
setInterval(() => { if (state.view === 'amis' && state.ftab === 'steam') loadFriends(); }, 60_000);

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
// Mise à jour prête (version installée) : on propose de redémarrer tout de suite, sinon elle s'installe à la fermeture
api.onUpdate?.((u) => {
  if (u.state === 'download') toast(`⬆ Mise à jour v${u.version} en cours de téléchargement…`);
  if (u.state === 'ready') {
    ui.confirm({ title: `Mise à jour v${u.version} prête`, text: 'Redémarre le launcher pour l’installer (quelques secondes). Sinon, elle s’installera toute seule à la prochaine fermeture.', ok: '⬆ Redémarrer maintenant', cancel: 'Plus tard', icon: '⬆' })
      .then((yes) => { if (yes) api.installUpdate(); });
  }
});
$('openNews2').addEventListener('click', () => { $('settings').close(); showWhatsNew(true); });
$('openLog').addEventListener('click', () => api.openLog?.().then((r) => toast(r?.ok ? 'Journal ouvert : envoie-le si un bug revient' : 'Aucune erreur enregistrée 👍')));

// ---------- Recherche rapide (Ctrl+Espace, ou Ctrl+Alt+Espace depuis Windows) ----------
const PAL_VIEWS = [['accueil', 'Accueil', '🏠'], ['bibliotheque', 'Bibliothèque', '📚'], ['jeux', 'Jeux', '🎮'], ['applis', 'Applications', '🧩'], ['favoris', 'Favoris', '★'], ['stats', 'Statistiques', '📊'], ['classement', 'Classement', '🏆'], ['amis', 'Amis', '👥'], ['pc', 'Mon PC', '🖥'], ['optimisation', 'Optimisation', '⚡']];
const PAL_ACTIONS = [
  ['Optimiser mon PC', '🚀', () => { go('optimisation'); setTimeout(() => $('optiScan').click(), 300); }],
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
  clearInterval(pcTimer);
  pcTimer = setInterval(() => (state.view === 'pc' ? renderPc() : clearInterval(pcTimer)), 2500);
  const b = await api.boost?.().catch(() => null);
  if (!b) return;
  $('boostOn').checked = b.enabled; $('boostPower').checked = b.power; $('boostRestore').checked = b.restore; $('heatAlerts').checked = b.heatAlerts;
  $('boostApps').innerHTML = b.apps.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.id)}" ${b.close.includes(a.id) ? 'checked' : ''}>${esc(a.label)}</label>`).join('');
}
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
  $('ringNum').textContent = score ?? '–';
  $('ringNum').style.color = col;
  $('ringLabel').textContent = label ?? 'Pas encore analysé';
  $('optiBadge').textContent = score != null && score < 75 ? '!' : '';
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
const itemRow = (group, x, checked = true) => `<label class="check"><input type="checkbox" data-g="${group}" value="${esc(x.id)}" ${checked ? 'checked' : ''}><span>${esc(x.label)}${x.note ? ` <small class="hint">· ${esc(x.note)}</small>` : ''}</span><em>${gb(x.bytes)}</em></label>`;
function renderOpti() {
  const o = opti;
  setRing(o.score, o.label);
  const junkTotal = o.junk.reduce((n, x) => n + x.bytes, 0);
  const orphanTotal = o.orphans.reduce((n, x) => n + x.bytes, 0);
  const tweaksOff = o.tweaks.filter((t) => !t.on && !t.optional);
  const heavyOn = o.startup.filter((x) => x.enabled && x.heavy);
  $('optiSum').innerHTML = `
    <div><b>${gb(junkTotal + orphanTotal + o.recycle)}</b><small>à libérer</small></div>
    <div><b>${heavyOn.length}</b><small>appli${heavyOn.length > 1 ? 's' : ''} lourde${heavyOn.length > 1 ? 's' : ''} au démarrage</small></div>
    <div><b>${o.tweaks.filter((t) => t.on).length}/${o.tweaks.length}</b><small>réglages optimisés</small></div>
    ${o.free != null ? `<div><b>${gb(o.free)}</b><small>libres${o.disk ? ` sur ${gb(o.disk)}` : ''}</small></div>` : ''}`;
  $('optiRun').hidden = false;
  $('optiRun').classList.add('play'); $('optiScan').classList.remove('play');
  const cards = [];
  for (const [key, icon, title, desc] of GROUPS) {
    const list = o.junk.filter((x) => x.group === key);
    if (!list.length) continue;
    cards.push(catCard(key, icon, title, desc, gb(list.reduce((n, x) => n + x.bytes, 0)), `<div class="checks">${list.map((x) => itemRow('junk', x)).join('')}</div>`, { count: `${list.length} élément${list.length > 1 ? 's' : ''}` }));
  }
  if (o.recycle > 0) cards.push(catCard('recycle', '♻', 'Corbeille', 'Fichiers déjà supprimés qui prennent encore de la place.', gb(o.recycle), '<p class="hint">Elle sera vidée définitivement.</p>'));
  cards.push(catCard('orphans', '🧩', 'Restes de jeux désinstallés', 'Dossiers de jeux Steam qui ne sont plus installés.', gb(orphanTotal),
    o.orphans.length ? `<div class="checks">${o.orphans.map((x) => itemRow('orphans', x, false)).join('')}</div><p class="hint">Décochés par défaut : coche ceux que tu veux supprimer.</p>` : '<p class="hint">Aucun reste trouvé 👍</p>', { checked: false, count: `${o.orphans.length} dossier${o.orphans.length > 1 ? 's' : ''}` }));
  cards.push(catCard('', '⏻', 'Démarrage de Windows', 'Moins d’applis au démarrage = PC prêt plus vite et plus de mémoire libre.', `${o.startup.filter((x) => x.enabled).length}`,
    `${o.startup.map((x) => `<label class="toggle small"><input type="checkbox" data-startup="${esc(x.name)}" ${x.enabled ? 'checked' : ''}><span></span>${esc(x.name)}${x.heavy ? ' <small class="warn">ralentit le démarrage</small>' : ''}</label>`).join('') || '<p class="hint">Aucune appli lancée au démarrage.</p>'}<p class="hint">Désactiver ne désinstalle rien (réversible ici ou dans le Gestionnaire des tâches).</p>`, { count: 'au démarrage', open: heavyOn.length > 0 }));
  cards.push(catCard('tweaks', '🎯', 'Réglages Windows pour les jeux', 'Réglages sûrs et réversibles qui donnent des FPS et de la réactivité.', `${o.tweaks.filter((t) => t.on).length}/${o.tweaks.length}`,
    o.tweaks.map((t) => `<label class="toggle small"><input type="checkbox" data-tweak="${esc(t.id)}" ${t.on ? 'checked' : ''}><span></span><div class="tlabel">${esc(t.label)}${t.optional ? ' <small class="opt">facultatif</small>' : ''}<small class="hint">${esc(t.help)}</small></div></label>`).join(''), { count: tweaksOff.length ? `${tweaksOff.length} à faire` : 'optimisés', open: tweaksOff.length > 0 }));
  cards.push(catCard('', '🛡', 'Nettoyage profond de Windows', 'Anciennes mises à jour, fichiers temporaires système, cache de distribution, TRIM du SSD, nettoyage des composants. Demande l’autorisation administrateur.', '',
    '<button class="btn" id="optiDeep" type="button">Lancer le nettoyage profond</button><p class="hint">Plusieurs minutes. Windows affiche une demande d’autorisation.</p>', { count: 'admin' }));
  $('optiBody').innerHTML = cards.join('');
}
function planFromUi() {
  const on = (k) => document.querySelector(`[data-catcheck="${k}"]`)?.checked;
  const ids = (g) => [...document.querySelectorAll(`#optiBody input[data-g="${g}"]:checked`)].filter((i) => on(i.closest('.ocat')?.dataset.cat)).map((i) => i.value);
  return { junk: ids('junk'), orphans: ids('orphans'), recycle: Boolean(on('recycle')) && opti.recycle > 0, tweaks: on('tweaks') ? opti.tweaks.filter((t) => !t.on && !t.optional).map((t) => t.id) : [] };
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
  if (opti?.error) { toast(opti.error); opti = null; } else if (opti) renderOpti(); else toast('Analyse impossible pour l’instant');
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
  $('optiRun').disabled = true; $('optiScan').disabled = true;
  const r = await api.optiRun(plan).catch(() => null);
  $('optiRun').disabled = false; $('optiScan').disabled = false;
  if (!r?.ok) { showProgress(null); return ui.confirm({ title: 'L’optimisation s’est arrêtée', text: r?.error ? `Erreur : ${r.error}` : 'Réessaie dans un instant.', ok: 'OK', cancel: 'Fermer', icon: '⚠️' }); }
  if (r.scan) { opti = r.scan; renderOpti(); }
  showProgress(`<div class="oprog done"><b>✅ Optimisation terminée</b><div class="odone"><div><b>${gb(r.freed)}</b><small>libérés</small></div><div><b>${r.tweaks}</b><small>réglage${r.tweaks > 1 ? 's' : ''} appliqué${r.tweaks > 1 ? 's' : ''}</small></div><div><b>${before} → ${r.score ?? '?'}</b><small>score de santé</small></div></div><button class="btn ghost" data-closeprog="1">Fermer</button></div>`);
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
  if (!opti) setRing(null);
}

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
async function renderStats() {
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
  if (r.action === 'optimize') { go('optimisation'); setTimeout(async () => { await optiScanUi(); if (r.value === 'run' && opti && !opti.error) $('optiRun').click(); }, 300); }
  if (r.action === 'deep_clean') { go('optimisation'); setTimeout(async () => { if (!opti) await optiScanUi(); $('optiDeep')?.click(); }, 300); }
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
setInterval(tickProgress, 1000);

// ---------- Navigation ----------
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${name}`));
}
function go(view) {
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
    if (a.none) { if (a.none === 'cle' && i.source === 'steam') $('sxAch').innerHTML = '<p class="fine">🏆 Ajoute ta clé Steam dans Paramètres pour voir tes succès.</p>'; return; }
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
      <button class="btn" data-capdir="${esc(caps[0].token)}">Ouvrir le dossier</button>`;
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
  const r = await api.action(item.id, action);
  if (r?.ok) toast(labels[action]);
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
  if (t.dataset.fivem) {
    const code = await ui.prompt({ title: 'Rejoindre un serveur FiveM', text: 'Colle le lien ou le code du serveur (ex. cfx.re/join/abc123).', placeholder: 'cfx.re/join/…', ok: 'Rejoindre', icon: '🔗' });
    if (!code) return;
    const r = await api.fivemJoin(code);
    return toast(r?.ok ? 'Connexion au serveur…' : r?.error ?? 'Impossible');
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
  $('autostart').checked = Boolean(s.autostart);
  $('directLaunch').checked = s.directLaunch !== false;
  $('gameMode').checked = s.gameMode !== false;
  $('dealAlerts').checked = s.dealAlerts !== false;
  $('discordStatus').checked = s.discordStatus !== false;
  $('shareActivity').checked = s.shareActivity !== false;
  $('geminiState').textContent = s.gemini ? '✅ IA active.' : 'Pas de clé trouvée : l’assistant et la recherche d’images par l’IA sont en pause.';
  $('steamState').textContent = s.steamKey ? '✅ Clé enregistrée.' : 'Sans clé : jeux installés ou déjà joués seulement.';
  $('gridState').textContent = s.gridKey ? '✅ Clé enregistrée.' : 'Facultatif : l’IA cherche déjà les images manquantes.';
  $('aiState').textContent = s.gemini ? '● en ligne' : '● hors ligne';
  $('aiState').classList.toggle('on', Boolean(s.gemini));
}
async function loadAccounts() {
  const a = await api.platformAccounts?.().catch(() => null);
  if (!a) return;
  const opts = (list, chosen, empty) => (list.length ? list.map((x) => `<option value="${esc(x.id)}" ${x.id === chosen ? 'selected' : ''}>${esc(x.name)}${x.recent ? ' (dernier connecté)' : ''}</option>`).join('') : `<option value="">${empty}</option>`);
  $('accSteam').innerHTML = opts(a.steam, a.chosen.steam, 'Aucun compte Steam trouvé');
  $('accEpic').innerHTML = opts(a.epic, a.chosen.epic, 'Compte Epic de ce PC');
  $('totalTime').checked = a.total;
}
$('openSettings').addEventListener('click', () => { api.settings().then(showKeys); loadAccounts(); $('settings').showModal(); });
$('accSteam').addEventListener('change', (e) => e.target.value && api.setPlatformAccounts({ steam: e.target.value }).then(() => toast('Temps de jeu : compte Steam changé')));
$('accEpic').addEventListener('change', (e) => api.setPlatformAccounts({ epic: e.target.value || null }).then(() => toast('Compte Epic changé')));
$('totalTime').addEventListener('change', (e) => api.setPlatformAccounts({ total: e.target.checked }).then(() => toast(e.target.checked ? 'Temps total de tous les comptes' : 'Temps d’un seul compte')));
document.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); api.openLink?.(b.dataset.link); }));
$('autostart').addEventListener('change', (e) => api.setSettings({ autostart: e.target.checked }));
$('directLaunch').addEventListener('change', (e) => api.setSettings({ directLaunch: e.target.checked }));
$('gameMode').addEventListener('change', (e) => api.setSettings({ gameMode: e.target.checked }));
$('dealAlerts').addEventListener('change', (e) => api.setSettings({ dealAlerts: e.target.checked }));
$('discordStatus').addEventListener('change', (e) => api.setSettings({ discordStatus: e.target.checked }));
$('shareActivity').addEventListener('change', (e) => api.setSettings({ shareActivity: e.target.checked }));
$('saveKeys').addEventListener('click', async (e) => {
  e.stopPropagation();
  const patch = {};
  for (const id of ['steamKey', 'gridKey', 'geminiKey']) if ($(id).value.trim()) patch[id] = $(id).value.trim();
  if (!Object.keys(patch).length) return toast('Colle une clé d’abord');
  const s = await api.setSettings(patch);
  ['steamKey', 'gridKey', 'geminiKey'].forEach((id) => { $(id).value = ''; });
  showKeys(s);
  if (s.error) return toast(`Clé refusée : ${s.error}`);
  toast('Clés enregistrées');
  load();
});

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
  $('avatar').textContent = name[0]?.toUpperCase() ?? '?';
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
  if (!r.ok) { $('authErr').textContent = r.error ?? 'Erreur.'; return; }
  $('aPass').value = '';
  setAccount(r.compte);
  showAuth(false);
  toast(authMode === 'inscription' ? `Bienvenue ${r.compte.pseudo} ! 🎉` : `Content de te revoir, ${r.compte.pseudo} !`);
});
$('authSkip').addEventListener('click', async () => { await api.skipAccount?.(); showAuth(false); });
$('profileBtn').addEventListener('click', async () => {
  if (!state.account) return showAuth(true);
  if (!(await ui.confirm({ title: 'Se déconnecter ?', text: `Connecté en tant que ${state.account.pseudo} (${state.account.email}).`, ok: 'Se déconnecter', icon: '👤' }))) return;
  await api.logout();
  setAccount(null);
  showAuth(true);
});
api.account?.().then((r) => { setAccount(r.compte); if (!r.compte && !r.skipped) showAuth(true); }).catch(() => {});

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
say('Salut ! 👋 Dis-moi ce que tu veux : « lance Rocket League », « ferme Discord », « monte le son », « trie par taille »… Tu peux aussi activer « Hey History » en bas pour me parler.');
load().then(() => {
  renderStats().catch(() => {});
  // Aperçu : #vue=classement ou #sel=Nom
  const h = !window.launcher && decodeURIComponent(location.hash.slice(1));
  if (h?.startsWith('vue=')) go(h.slice(4));
  else if (h?.startsWith('sel=')) select(state.items.find((i) => i.name === h.slice(4)) ?? state.sel);
  if (h?.includes('assistant')) openAssistant(true);
  if (h?.includes('compte')) showAuth(true);
  if (h?.includes('verif')) api.verify(state.items[0].id);
});
refreshMusic();
setInterval(refreshMusic, 5000);
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
    hFriends: async () => ({ code: 'Noam#3F9A2C', moi: { week: 610, top: 'Rocket League' }, demandes: [{ id: 'z', pseudo: 'Zoé', code: 'Zoé#11AA22' }], amis: [{ id: 'm', pseudo: 'Max', online: true, playing: 'Rocket League', week: 840, top: 'Rocket League' }, { id: 'l', pseudo: 'Léa', online: true, playing: null, week: 300, top: 'VALORANT' }, { id: 's', pseudo: 'Sam', online: false, playing: null, week: 95, top: 'Fortnite' }] }),
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
    version: async () => '0.10.3',
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
    account: async () => ({ compte: null, skipped: true }), register: async (b) => ({ ok: true, compte: { pseudo: b.pseudo, email: b.email } }), login: async () => ({ ok: false, error: 'E-mail ou mot de passe incorrect.' }), skipAccount: async () => ({}), setVoice: async () => ({}), ask: async (t) => ({ reply: `(aperçu) Je m’occupe de « ${t} ».`, action: 'none' }), openReco: async () => {},
  };
}
