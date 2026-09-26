// Interface du launcher : grille 3D, fiche de l'élément sélectionné, thème qui suit ce qu'on regarde.
import { filterSort } from '../core/sort.js';

const $ = (id) => document.getElementById(id);
const api = window.launcher ?? demoApi(); // hors Electron (aperçu dans un navigateur) : données d'exemple
const state = { items: [], sources: {}, sel: null, active: new Set(), view: { sort: 'joues', kind: 'tout', source: 'tout', installed: 'tout', q: '' } };

// ---------- Formats ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hours = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.round(min / 60).toLocaleString('fr-FR')} h`);
const size = (b) => (!b ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1).replace('.', ',')} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`);
function ago(t) {
  if (!t) return 'jamais';
  const d = (Date.now() - t) / 86_400_000;
  if (d < 1 / 24) return 'à l’instant';
  if (d < 1) return `il y a ${Math.round(d * 24)} h`;
  if (d < 30) return `il y a ${Math.round(d)} j`;
  if (d < 365) return `il y a ${Math.round(d / 30)} mois`;
  return `il y a ${Math.round(d / 365)} an${d >= 730 ? 's' : ''}`;
}
// Couleur d'un élément : celle du launcher pour un jeu, celle de la marque ou de la catégorie pour une appli
const BRANDS = { spotify: '#1ed760', deezer: '#a238ff', discord: '#5865f2', 'obs studio': '#8f7cff', netflix: '#e50914', steam: '#66c0f4', twitch: '#9146ff', whatsapp: '#25d366', telegram: '#2aabee', vlc: '#ff8800' };
const CATEGORY_COLORS = { musique: '#b36bff', video: '#ff4d5e', discussion: '#7b86ff', appli: '#5fe0c8' };
const colorOf = (item) => (item.kind === 'game' ? state.sources[item.source]?.color : BRANDS[String(item.name).toLowerCase()] ?? CATEGORY_COLORS[item.category]) ?? '#9aa0aa';
const themeOf = (item) => (item?.kind === 'game' ? 'jeu' : ['musique', 'video', 'discussion'].includes(item?.category) ? item.category : 'appli');
const KIND_LABEL = { game: 'Jeu', app: 'Application', launcher: 'Launcher' };

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- Images (jaquette Steam, sinon icône de l'appli, sinon initiale) ----------
function face(item, big = false) {
  const cover = item.art?.cover;
  if (cover) {
    const fallback = item.art.header ?? '';
    return `<img src="${esc(cover)}" alt="" loading="${big ? 'eager' : 'lazy'}" data-fallback="${esc(fallback)}">`;
  }
  return `<div class="appface">${item.iconData ? `<img src="${esc(item.iconData)}" alt="">` : `<span class="letter">${esc((item.name ?? '?')[0].toUpperCase())}</span>`}</div>`;
}
// Jaquette absente sur Steam : on passe à l'image horizontale, puis à l'initiale
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.dataset.fallback) { img.src = img.dataset.fallback; img.dataset.fallback = ''; img.style.objectFit = 'cover'; }
  else img.replaceWith(Object.assign(document.createElement('div'), { className: 'appface', innerHTML: '<span class="letter">◆</span>' }));
}, true);

// ---------- Rendu ----------
function renderSources() {
  const counts = {};
  for (const i of state.items) if (!i.hidden) counts[i.source] = (counts[i.source] ?? 0) + 1;
  $('sources').innerHTML = [`<button data-source="tout" class="${state.view.source === 'tout' ? 'on' : ''}"><i>◈</i>Toutes<em>${state.items.filter((i) => !i.hidden).length}</em></button>`,
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button data-source="${esc(k)}" class="${state.view.source === k ? 'on' : ''}"><i><span class="dot" style="color:${esc(state.sources[k]?.color)};background:${esc(state.sources[k]?.color)}"></span></i>${esc(state.sources[k]?.label ?? k)}<em>${n}</em></button>`)].join('');
}

function renderGrid() {
  const list = filterSort(state.items, state.view);
  const titles = { joues: 'Les plus joués', recents: 'Joués récemment', nom: 'De A à Z', taille: 'Les plus lourds' };
  $('shelfTitle').textContent = state.view.q ? `Résultats pour « ${state.view.q} »` : titles[state.view.sort];
  $('count').textContent = `${list.length} élément${list.length > 1 ? 's' : ''}`;
  $('grid').innerHTML = list.length ? list.map((i, n) => `
    <div class="card ${i.installed ? '' : 'off'} ${state.sel?.id === i.id ? 'sel' : ''}" data-id="${esc(i.id)}" style="--c:${esc(colorOf(i))};animation-delay:${Math.min(n, 30) * 18}ms">
      <div class="face">${face(i)}</div>
      <span class="src"></span>${i.favorite ? '<span class="fav">★</span>' : ''}
      ${state.active.has(i.id) ? '<span class="live livebadge">En cours</span>' : ''}
      <div class="shade"><b>${esc(i.name)}</b><span>${i.minutes ? hours(i.minutes) : KIND_LABEL[i.kind] ?? ''}</span></div>
      <div class="shine"></div>
    </div>`).join('') : '<div class="empty">Rien ici. Change les filtres ou lance une recherche.</div>';
  if (!state.sel || !list.some((i) => i.id === state.sel.id)) select(list[0] ?? null, false);
}

function renderHero() {
  const i = state.sel;
  const hero = $('hero');
  if (!i) { hero.innerHTML = '<div></div><div><h1>Ta bibliothèque est vide</h1><p>Clique sur « Actualiser » pour rechercher tes jeux et tes applis.</p></div>'; return; }
  const src = state.sources[i.source]?.label ?? 'PC';
  const playing = state.active.has(i.id);
  const btn = (action, label, cls = '') => `<button class="btn ${cls}" data-action="${action}">${label}</button>`;
  const actions = [];
  if (i.installed) actions.push(btn('launch', i.kind === 'game' ? '▶ Jouer' : '▶ Ouvrir', 'play'));
  else if (i.source === 'steam') actions.push(btn('install', '⤓ Installer', 'play'));
  if (i.installed && ['steam', 'epic'].includes(i.source)) actions.push(btn('verify', '✓ Vérifier les fichiers'));
  if (i.installDir && i.installed) actions.push(btn('folder', '📁 Dossier'));
  if (i.source === 'steam') actions.push(btn('store', '🛈 Page Steam'));
  actions.push(`<button class="btn ${i.favorite ? 'on' : ''}" data-set="favorite">${i.favorite ? '★ Favori' : '☆ Favori'}</button>`);
  actions.push(`<button class="btn" data-set="hidden">${i.hidden ? '◉ Afficher' : '◌ Masquer'}</button>`);
  if (i.installed && (i.uninstallCmd || ['steam', 'epic'].includes(i.source))) actions.push(btn('uninstall', '🗑 Désinstaller', 'danger'));
  hero.innerHTML = `
    <div class="cover" style="--c:${esc(colorOf(i))}">${face(i, true)}</div>
    <div>
      <div class="kicker"><span class="dot" style="color:${esc(colorOf(i))};background:${esc(colorOf(i))}"></span>${esc(src)} · ${esc(KIND_LABEL[i.kind] ?? '')}${i.installed ? '' : ' · non installé'}${playing ? ' · <span class="live">En cours</span>' : ''}</div>
      <h1>${esc(i.name)}</h1>
      <div class="stats">
        <div class="stat"><b>${hours(i.minutes)}</b><span>${i.kind === 'game' ? 'de jeu' : 'd’utilisation'}</span></div>
        <div class="stat"><b>${ago(i.lastPlayed)}</b><span>dernière fois</span></div>
        <div class="stat"><b>${size(i.size)}</b><span>sur le disque</span></div>
        ${i.version ? `<div class="stat"><b>${esc(i.version)}</b><span>version</span></div>` : ''}
      </div>
      <div class="actions">${actions.join('')}</div>
    </div>`;
  hero.style.animation = 'none';
  void hero.offsetWidth; // relance l'animation d'apparition
  hero.style.animation = '';
}

function select(item, scroll = true) {
  state.sel = item;
  document.body.dataset.theme = themeOf(item);
  // Couleur du thème : celle du launcher du jeu (bleu Steam, rouge Riot…), celle de la catégorie pour les applis
  if (item?.kind === 'game') { document.body.style.setProperty('--accent', colorOf(item)); document.body.style.setProperty('--accent-2', shade(colorOf(item))); }
  else { document.body.style.removeProperty('--accent'); document.body.style.removeProperty('--accent-2'); }
  const bg = $('bgimg');
  const img = item?.art?.hero ?? item?.art?.cover ?? item?.iconData ?? null;
  bg.classList.toggle('on', Boolean(img));
  if (img) bg.style.backgroundImage = `url("${img.replace(/"/g, '%22')}")`;
  renderHero();
  document.querySelectorAll('.card.sel').forEach((c) => c.classList.remove('sel'));
  document.querySelector(`.card[data-id="${CSS.escape(item?.id ?? '')}"]`)?.classList.add('sel');
  if (scroll && item) $('hero').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function shade(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.45)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

// ---------- Interactions ----------
$('grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) select(state.items.find((i) => i.id === card.dataset.id));
});
$('grid').addEventListener('dblclick', (e) => {
  const card = e.target.closest('.card');
  const item = card && state.items.find((i) => i.id === card.dataset.id);
  if (item?.installed) act('launch');
});
// Inclinaison 3D des cartes sous la souris
$('grid').addEventListener('mousemove', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  card.style.transform = `translateY(-6px) rotateX(${(0.5 - y) * 14}deg) rotateY(${(x - 0.5) * 16}deg) scale(1.04)`;
  card.style.setProperty('--mx', `${x * 100}%`);
  card.style.setProperty('--my', `${y * 100}%`);
});
$('grid').addEventListener('mouseout', (e) => {
  const card = e.target.closest('.card');
  if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
});

async function act(action) {
  const item = state.sel;
  if (!item) return;
  const labels = { launch: `Lancement de ${item.name}…`, install: `Installation de ${item.name} dans Steam…`, verify: 'Vérification des fichiers lancée', uninstall: 'Désinstallation…', folder: 'Dossier ouvert', store: 'Page Steam ouverte' };
  if (action === 'store') return api.action(item.id, 'store').then(() => toast(labels.store));
  const r = await api.action(item.id, action);
  if (r?.ok) toast(labels[action]);
  else if (r?.error) toast(`Impossible : ${r.error}`);
}
$('hero').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !state.sel) return;
  if (b.dataset.action) return act(b.dataset.action);
  if (b.dataset.set) {
    const key = b.dataset.set;
    const value = !state.sel[key];
    await api.setItem(state.sel.id, { [key]: value });
    state.sel[key] = value;
    toast(key === 'favorite' ? (value ? 'Ajouté aux favoris' : 'Retiré des favoris') : value ? 'Masqué (visible dans « Masqués »)' : 'De nouveau visible');
    renderSources();
    renderGrid();
    renderHero();
  }
});

const setView = (patch) => { Object.assign(state.view, patch); renderSources(); renderGrid(); };
$('kinds').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#kinds button').forEach((x) => x.classList.toggle('on', x === b));
  setView({ kind: b.dataset.kind });
});
$('sources').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView({ source: b.dataset.source }); });
$('installed').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#installed button').forEach((x) => x.classList.toggle('on', x === b));
  setView({ installed: b.dataset.inst });
});
$('sort').addEventListener('change', (e) => setView({ sort: e.target.value }));
$('q').addEventListener('input', (e) => setView({ q: e.target.value.trim() }));
document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => api.win(b.dataset.win)));
$('autostart').addEventListener('change', (e) => api.setSettings({ autostart: e.target.checked }).then(() => toast(e.target.checked ? 'S’ouvrira au démarrage du PC' : 'Ne s’ouvrira plus au démarrage')));
$('rescan').addEventListener('click', () => load(true));
// Raccourcis : Ctrl+F pour chercher, Entrée pour lancer
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && document.activeElement !== $('q'))) { e.preventDefault(); $('q').focus(); }
  if (e.key === 'Enter' && document.activeElement !== $('q') && state.sel?.installed) act('launch');
});

api.onActive?.((ids) => {
  state.active = new Set(ids);
  for (const i of state.items) if (state.active.has(i.id)) { i.minutes += 1; i.lastPlayed = Date.now(); }
  renderGrid();
  renderHero();
});

async function load(again = false) {
  if (again) toast('Recherche des jeux et applis…');
  const { items, sources } = await api.scan();
  state.items = items;
  state.sources = sources;
  renderSources();
  renderGrid();
  if (again) toast(`${items.length} éléments trouvés`);
  // Aperçu : #sel=Nom pour ouvrir directement un élément
  const wanted = !window.launcher && decodeURIComponent(location.hash.replace(/^#sel=/, ''));
  if (wanted) select(state.items.find((i) => i.name === wanted) ?? state.sel, false);
}

api.settings().then((s) => { $('autostart').checked = Boolean(s.autostart); });
load();

// ---------- Aperçu hors Electron ----------
function demoApi() {
  const steam = (id, name, minutes, days, gb) => ({ id: `steam:${id}`, source: 'steam', kind: 'game', name, installed: gb > 0, installDir: 'C:\\Steam', size: gb * 1e9, minutes, lastPlayed: Date.now() - days * 86_400_000, steamId: String(id),
    art: { cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`, header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` } });
  const app = (name, category, minutes, source = 'pc', kind = 'app') => ({ id: `reg:${name}`, source, kind, category, name, installed: true, installDir: 'C:\\Apps', size: 3e8, minutes, lastPlayed: Date.now() - 3_600_000, art: {}, uninstallCmd: 'x' });
  const items = [steam(730, 'Counter-Strike 2', 12000, 0.2, 35), steam(1086940, "Baldur's Gate 3", 4300, 3, 150), steam(1245620, 'ELDEN RING', 6100, 12, 60), steam(271590, 'Grand Theft Auto V', 900, 400, 0), steam(1091500, 'Cyberpunk 2077', 2500, 40, 70), steam(252490, 'Rust', 800, 90, 30),
    app('Spotify', 'musique', 20000), app('Discord', 'discussion', 15000), app('VALORANT', 'jeu', 7000, 'riot', 'game'), app('OBS Studio', 'video', 600), app('Deezer', 'musique', 300)];
  return {
    scan: async () => ({ items, sources: { steam: { label: 'Steam', color: '#66c0f4' }, riot: { label: 'Riot', color: '#ff4655' }, pc: { label: 'PC', color: '#9aa0aa' } } }),
    action: async () => ({ ok: true }), setItem: async () => ({}), settings: async () => ({ autostart: true }), setSettings: async (s) => s, win: () => {},
  };
}
