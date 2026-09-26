// Interface du launcher : accueil (bannière, plus joués, applis, recommandations), bibliothèque, statistiques,
// assistant IA et lecteur de musique. Toutes les images sont les images officielles trouvées par le launcher.
import { filterSort } from '../core/sort.js';

const $ = (id) => document.getElementById(id);
let demoVerify = null; // aperçu hors Electron seulement
const api = window.launcher ?? demoApi(); // hors Electron (aperçu dans un navigateur) : données d'exemple
const state = { items: [], sources: {}, sel: null, active: new Set(), view: 'accueil', list: { sort: 'joues', kind: 'tout', source: 'tout', installed: 'tout', q: '' }, period: 'semaine', rank: 'tout', profile: 'Joueur', music: null, recos: [], free: [], deals: [], friends: null, song: null, account: null };

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
  const menu = [];
  if (i.installed && ['steam', 'epic'].includes(i.source)) menu.push('<button data-action="verify">✓ Vérifier les fichiers</button>');
  if (i.installed && i.installDir) menu.push('<button data-action="folder">📁 Ouvrir le dossier</button>');
  if (i.source === 'steam') menu.push('<button data-action="store">🛈 Page du magasin</button>');
  menu.push(`<button data-set="favorite">${i.favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>`);
  menu.push(`<button data-set="hidden">${i.hidden ? '◉ Afficher' : '◌ Masquer'}</button>`);
  menu.push('<button data-sheet="1">≡ Fiche complète</button>');
  if (i.installed && (i.uninstallCmd || ['steam', 'epic'].includes(i.source))) menu.push('<button data-action="uninstall" class="danger">🗑 Désinstaller</button>');
  const main = i.installed ? (isApp ? 'Ouvrir' : 'Jouer') : 'Installer';
  hero.innerHTML = `
    ${i.brand && isApp ? `<div class="hbg brandbg" style="--b:${esc(i.brand.color)}"></div>` : bg ? `<div class="hbg" style="background-image:${url(bg)}"></div>` : `<div class="hbg blur" style="background-image:${a.icon || i.iconData ? url(a.icon ?? i.iconData) : 'none'}"></div>`}
    ${title}
    <div class="hbottom">
      <div class="playbtn"><button class="main" data-action="${i.installed ? 'launch' : 'install'}">${main}</button><button class="more" id="moreBtn" title="Plus d’actions">▾</button><div class="menu" id="heroMenu">${menu.join('')}</div></div>
      <div class="hstat"><small>${CLOCK}${isApp ? 'Temps d’utilisation' : 'Temps de jeu'}</small><b>${hours(i.minutes)}</b></div>
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

function card(i, cls = 'gcard') {
  const live = state.active.has(i.id);
  const icon = srcIcon(i);
  return `<div class="${cls} ${i.installed ? '' : 'off'} ${state.sel?.id === i.id ? 'sel' : ''}" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))}">
    ${art(i)}${icon ? `<img class="srcicon" src="${esc(icon)}" alt="">` : ''}
    ${live ? '<span class="badge live">En cours</span>' : i.installed ? '' : '<span class="badge">Non installé</span>'}
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
  if (state.view === 'amis') renderFriends();
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
$('friendsRefresh').addEventListener('click', () => loadFriends(true).then(() => toast('Amis actualisés')));
setInterval(() => { if (state.view === 'amis') loadFriends(); }, 60_000);

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
let cleanItems = [];
function cleanSum() {
  const ids = [...document.querySelectorAll('#cleanList input:checked')].map((i) => i.value);
  const total = cleanItems.filter((c) => ids.includes(c.id)).reduce((n, c) => n + c.bytes, 0);
  $('cleanTotal').textContent = ids.length ? `${gb(total)} à libérer` : '';
  $('cleanRun').hidden = !ids.length;
}
$('cleanScan').addEventListener('click', async () => {
  $('cleanScan').textContent = 'Analyse…';
  cleanItems = (await api.cleanScan?.().catch(() => [])) ?? [];
  $('cleanScan').textContent = 'Analyser à nouveau';
  const found = cleanItems.filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  $('cleanList').innerHTML = found.length ? found.map((c) => `<label class="check"><input type="checkbox" value="${esc(c.id)}" checked><span>${esc(c.label)}${c.note ? ` <small class="hint">· ${esc(c.note)}</small>` : ''}</span><em>${gb(c.bytes)}</em></label>`).join('') : '<div class="empty">Rien à nettoyer, tout est propre.</div>';
  cleanSum();
});
$('cleanList').addEventListener('change', cleanSum);
$('cleanRun').addEventListener('click', async () => {
  const r = await api.cleanRun([...document.querySelectorAll('#cleanList input:checked')].map((i) => i.value));
  if (r?.ok) { toast(`${gb(r.freed)} libérés`); $('cleanScan').click(); }
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
const TITLES = { bibliotheque: 'Bibliothèque', jeux: 'Jeux', applis: 'Applications', favoris: 'Favoris' };
function renderList() {
  const list = filterSort(state.items, state.list);
  $('listTitle').textContent = state.list.q ? `Résultats pour « ${state.list.q} »` : state.list.source !== 'tout' ? state.sources[state.list.source]?.label ?? 'Plateforme' : TITLES[state.list.kind === 'tout' ? 'bibliotheque' : state.list.kind] ?? 'Bibliothèque';
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
    top && ['✓', `Vérifie les fichiers de ${top.name}`],
    ['🗑', 'Quel jeu je pourrais désinstaller ?'],
    ['🏆', 'Ouvre le classement'],
    ['⏱', 'Quel est mon jeu le plus joué ?'],
    ['♫', 'Qu’est-ce que j’écoute ?'],
    ['🔊', 'Monte le son'],
    ['⇅', 'Trie mes jeux par taille'],
  ].filter(Boolean);
  $('chips').innerHTML = chips.map(([ico, t]) => `<button data-ask="${esc(t)}"><i>${ico}</i>${esc(t)}</button>`).join('');
}
function applyReply(r) {
  if (!r) return;
  say(r.reply || 'D’accord.');
  const views = { jeux: 'jeux', applis: 'applis', favoris: 'favoris', stats: 'stats', classement: 'classement', bibliotheque: 'bibliotheque', accueil: 'accueil' };
  if (r.action === 'show') { if (r.value === 'parametres') $('openSettings').click(); else go(views[r.value] ?? 'bibliotheque'); }
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
  if (view in lists) { state.list.kind = lists[view]; state.list.source = 'tout'; showView('liste'); } else showView(view);
  renderPlatforms();
  if (state.view === 'liste') renderList();
  if (state.view === 'stats') renderStats();
  if (state.view === 'classement') renderRanking();
  if (state.view === 'amis') { renderFriends(); loadFriends(); }
  if (state.view === 'pc') openPc();
  $('main').scrollTop = 0;
}

function select(item) {
  if (!item) return;
  state.sel = item;
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
    <div class="acts"><button class="btn" data-close="1">Fermer</button></div>`;
  $('sheet').showModal();
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
  const t = e.target.closest('button, [data-id], [data-reco], [data-free], [data-deal]');
  if (!t) { $('heroMenu')?.classList.remove('on'); return; }
  if (t.id === 'moreBtn') { $('heroMenu').classList.toggle('on'); return; }
  $('heroMenu')?.classList.remove('on');
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.platform) {
    document.querySelectorAll('#nav button').forEach((b) => b.classList.remove('on'));
    state.list = { ...state.list, kind: 'tout', source: t.dataset.platform };
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
const VIEW_KEYS = ['accueil', 'bibliotheque', 'jeux', 'applis', 'favoris', 'stats', 'classement', 'amis', 'pc'];
function visibleItems() {
  return [...document.querySelectorAll(state.view === 'liste' ? '#grid [data-id]' : '#topGames [data-id], #topApps [data-id]')].map((el) => state.items.find((i) => i.id === el.dataset.id)).filter(Boolean);
}
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); return; }
  if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); openAssistant(true); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); $('openSettings').click(); return; }
  if (ctrl && /^[1-9]$/.test(e.key)) { e.preventDefault(); go(VIEW_KEYS[Number(e.key) - 1]); return; }
  if (ctrl && e.key.toLowerCase() === 'd' && state.sel) {
    e.preventDefault();
    const on = !state.sel.favorite;
    api.setItem(state.sel.id, { favorite: on }).then(() => { state.sel.favorite = on; renderHero(); toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris'); });
    return;
  }
  if (e.key === 'F5') { e.preventDefault(); toast('Recherche de nouveaux jeux…'); api.rescan?.().then((lib) => lib && applyLibrary(lib)); return; }
  if (typing || document.querySelector('dialog[open]')) return;
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
});
let recorder = null;
$('micBtn').addEventListener('click', async () => {
  if (recorder) { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      $('micBtn').classList.remove('rec');
      recorder = null;
      const buf = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer());
      const wait = say('🎙 …', 'wait');
      const r = await api.transcribe(buf, 'audio/webm').catch(() => ({ reply: 'Micro indisponible.' }));
      wait.remove();
      if (r.heard) say(`🎙 ${r.heard}`, 'me');
      applyReply(r);
    };
    recorder.start();
    $('micBtn').classList.add('rec');
    setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 8000);
  } catch {
    toast('Micro inaccessible : autorise-le dans Windows (Paramètres › Confidentialité › Microphone).');
  }
});

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
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authErr').textContent = '';
  $('authGo').disabled = true;
  const body = { pseudo: $('aPseudo').value.trim(), email: $('aEmail').value.trim(), motDePasse: $('aPass').value };
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
  if (!window.confirm(`Connecté en tant que ${state.account.pseudo} (${state.account.email}).\n\nSe déconnecter ?`)) return;
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
  applyLibrary(await api.scan());
  renderAll();
  if (state.sel && !state.sel.detailsAsked) select(state.sel);
  api.reco?.().then((r) => { state.recos = r ?? []; renderRecos(); }).catch(() => {});
  api.freeGames?.().then((f) => { state.free = f ?? []; renderFree(); }).catch(() => {});
  api.deals?.().then((d) => { state.deals = d ?? []; renderDeals(); }).catch(() => {});
  loadFriends();
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
  const app = (name, category, minutes, icon) => ({ id: `reg:${name}`, source: 'pc', kind: 'app', category, name, installed: true, installDir: 'C:\\Apps', size: 3e8, minutes, lastPlayed: Date.now() - 3_600_000, art: {}, iconData: icon, uninstallCmd: 'x', brand: { Spotify: { color: '#1ed760', logo: 'brands/spotify.svg' }, Discord: { color: '#5865f2', logo: 'brands/discord.svg' }, 'Google Chrome': { color: '#4285f4', logo: 'brands/googlechrome.svg' }, 'OBS Studio': { color: '#302e31', logo: 'brands/obsstudio.svg' } }[name] ?? null });
  const items = [
    game('steam:271590', 'Grand Theft Auto V', 'steam', 25680, 0, 108.7, { cover: img('c1.jpg'), hero: img('h1.jpg'), logo: img('l1.png') }),
    game('epic:Fortnite', 'Fortnite', 'epic', 18720, 1, 40, { cover: img('c2.jpg'), hero: img('h2.jpg') }),
    Object.assign(game('roblox:player', 'Roblox', 'roblox', 3000, 2, 1, {}), { brand: { color: '#e2231a', logo: 'brands/roblox.svg' } }),
    game('reg:cod', 'Call of Duty', 'pc', 17040, 3, 120, { cover: img('c3.jpg') }),
    game('epic:rl', 'Rocket League', 'epic', 11880, 6, 25, { cover: img('c4.jpg') }),
    game('reg:valorant', 'VALORANT', 'riot', 10560, 2, 30, { hero: img('h2.jpg'), logo: img('l1.png') }),
    game('steam:359550', 'Rainbow Six Siege', 'steam', 9600, 9, 60, { cover: img('c1.jpg') }),
    app('Spotify', 'musique', 2418, img('i1.png')), app('Discord', 'discussion', 900, img('i2.png')), app('Google Chrome', 'appli', 600, img('i3.png')), app('OBS Studio', 'video', 480, null),
  ];
  return {
    friends: async () => ({ ok: true, friends: [
      { id64: '76561198000000001', name: 'Max', avatar: null, online: true, status: 'En jeu', game: 'Rocket League', appid: '252950', lobby: '109775241000000000' },
      { id64: '76561198000000002', name: 'Léa', avatar: null, online: true, status: 'En jeu', game: 'Counter-Strike 2', appid: '730', lobby: null },
      { id64: '76561198000000003', name: 'Sam', avatar: null, online: true, status: 'En ligne', game: null },
      { id64: '76561198000000004', name: 'Zoé', avatar: null, online: false, status: 'Hors ligne', game: null }] }),
    friendAction: async () => ({ ok: true }), openDeal: async () => {},
    pc: async () => ({ cpu: { usage: 37, temp: null, name: 'AMD Ryzen 7 5800X' }, ram: { used: 11.2e9, total: 32e9 }, gpu: { name: 'NVIDIA GeForce RTX 3070', usage: 92, temp: 71, vramUsed: 6200, vramTotal: 8192 } }),
    boost: async () => ({ enabled: true, power: true, restore: true, heatAlerts: true, close: ['chrome'], apps: [{ id: 'chrome', label: 'Google Chrome' }, { id: 'edge', label: 'Microsoft Edge' }, { id: 'onedrive', label: 'OneDrive' }, { id: 'office', label: 'Word / Excel / PowerPoint' }] }),
    setBoost: async (b) => b, cleanScan: async () => [{ id: 'temp', label: 'Fichiers temporaires de Windows', bytes: 3.4e9 }, { id: 'nvdx', label: 'Cache NVIDIA (DirectX)', bytes: 1.1e9, note: 'Recréé au prochain lancement des jeux' }, { id: 'discord', label: 'Cache de Discord', bytes: 420e6, note: 'Ferme Discord pour tout vider' }],
    cleanRun: async () => ({ ok: true, freed: 4.9e9 }),
    deals: async () => [{ appid: '1', name: 'Jeu en promo', pct: 75, price: '4,99€', before: '19,99€', image: img('h1.jpg') }],
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
