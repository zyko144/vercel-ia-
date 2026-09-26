// L'arcade de History IA : connexion (Activité Discord ou lien personnel), salle commune du salon,
// et trois jeux multijoueurs. Le serveur décide de tout ; ici on affiche et on envoie les actions.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const params = new URLSearchParams(location.search);
const inDiscord = params.has('frame_id');

let session = null;
let room = null;
let guild = null;
let state = null;
let seq = 0;
let offset = 0;
let view = null; // ce qui est affiché : 'lobby' | 'dessin' | 'morpion' | 'puissance4' | 'fin'
let stopped = false;

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function api(path, { method = 'GET', body, query = {} } = {}) {
  const q = new URLSearchParams({ room, ...(guild ? { guild } : {}), ...query });
  const res = await fetch(`api/${path}?${q}`, {
    method, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { stopped = true; fatal(data.error || 'Session expirée.'); }
  return { ok: res.ok, data };
}
const send = async (body) => {
  const { ok, data } = await api('act', { method: 'POST', body });
  if (!ok && data.error) toast(data.error);
};
function fatal(text) {
  $('app').innerHTML = `<div class="fatal"><div style="font-size:46px">🏴‍☠️</div><p>${esc(text)}</p></div>`;
}
const nameOf = (id) => state?.players.find((p) => p.id === id)?.name ?? state?.game?.names?.[id] ?? 'Joueur';
const avatar = (id, cls = 'avatar') => (/^\d+$/.test(String(id)) ? `<img class="${cls}" src="avatar/${id}.png${guild ? `?g=${encodeURIComponent(guild)}` : ''}" alt="">` : `<span class="${cls} botav">🤖</span>`);

// ------------------------------------------------------------------ Connexion
async function login() {
  if (inDiscord) {
    const cfg = (await (await fetch('api/config')).json());
    const { DiscordSDK } = await import('./sdk.js');
    const sdk = new DiscordSDK(cfg.clientId);
    await sdk.ready();
    const { code } = await sdk.commands.authorize({ client_id: cfg.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
    const res = await fetch('api/discord', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connexion refusée.');
    await sdk.commands.authenticate({ access_token: data.access_token });
    session = data.session;
    room = sdk.channelId;
    guild = sdk.guildId;
    if (!room) throw new Error('Ouvre l’arcade depuis un salon du serveur.');
    return;
  }
  // Identifiants Discord uniquement (chiffres) : rien d'autre ne peut être glissé dans la page par le lien
  const id = (v) => (/^\d{5,25}$/.test(String(v ?? '')) ? String(v) : null);
  room = id(params.get('room'));
  guild = id(params.get('guild'));
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('s');
  if (fromHash) {
    try { sessionStorage.setItem('arcade', fromHash); } catch { /* sans stockage */ }
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  try { session = fromHash || sessionStorage.getItem('arcade'); } catch { session = fromHash; }
  if (!session || !room) throw new Error('Ouvre l’arcade depuis Discord : /jeux › Arcade.');
}

// ------------------------------------------------------------------ Boucle de mise à jour
async function loop() {
  while (!stopped) {
    try {
      const { ok, data } = await api('poll', { query: { since: seq, epoch: canvasState.epoch ?? '', ops: canvasState.ops.length } });
      if (!ok) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      seq = data.seq;
      offset = data.now - Date.now();
      state = data;
      render();
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function render() {
  const g = state.game;
  const kind = g ? g.kind : 'lobby';
  $('crew').innerHTML = state.players.map((p) => avatar(p.id).replace('<img', `<img title="${esc(p.name)}"`)).join('');
  $('home').hidden = kind === 'lobby';
  if (kind !== view) {
    view = kind;
    ({ lobby: mountLobby, dessin: mountDraw, morpion: mountDuel, puissance4: mountDuel, fin: mountEnd, duel: mountBoard, quiz: mountBoard, pendu: mountBoard, nombre: mountBoard, party: mountParty })[kind]?.();
  }
  ({ lobby: updateLobby, dessin: updateDraw, morpion: updateDuel, puissance4: updateDuel, fin: updateEnd, duel: updateNewDuel, quiz: updateQuiz, pendu: updatePendu, nombre: updateNombre, party: updateParty })[kind]?.();
  // Hors d'une partie de soirée (salle, fin, autre jeu) : ni extrait ni voix de l'IA
  if (kind !== 'party') { stopPartyAudio(); Sound.hush(); }
  updateChat();
  if ($('soloBox')) renderSolo($('soloBox'));
  if (!$('drawer').hidden) renderSolo($('drawerBody'));
  setBackground(kind === 'party' ? g.game : ['dessin', 'quiz', 'pendu', 'nombre', 'morpion', 'puissance4'].includes(kind) ? kind : null);
  $('premiumTag').hidden = !state.premium;
  $('premiumTag').textContent = state.premium ? `✨ ${state.premium}` : '';
  $('premiumTag').title = state.premium ? 'Serveur premium : gains de l’arcade ×2 et voix du narrateur au choix' : '';
  $('goldTag').textContent = state.gold === null || state.gold === undefined ? '' : `🪙 ${Number(state.gold).toLocaleString('fr-FR')}`;
}
$('home').onclick = () => send({ type: 'lobby' });
// Fond d'écran flouté du jeu en cours (images du dossier « fond jeu ») ; aucun fond si le jeu n'en a pas
let bgKey = null;
function setBackground(key) {
  if (key === bgKey) return;
  bgKey = key;
  const el = $('bg');
  if (!key) { el.classList.remove('on'); return; }
  const img = new Image();
  img.onload = () => { if (bgKey !== key) return; el.style.backgroundImage = `url("fond/${key}")`; el.classList.add('on'); };
  img.onerror = () => { if (bgKey === key) el.classList.remove('on'); };
  img.src = `fond/${key}`;
}

// ------------------------------------------------------------------ Salle
const TABS = {
  ensemble: { label: '🎉 Tous ensemble', games: [
    { id: 'dessin', emoji: '🎨', name: 'Dessine et devine', desc: 'Chacun son tour dessine un mot, les autres le devinent.', tag: '2 à 12', color: 'var(--rose)' },
    { id: 'quiz', emoji: '🧠', name: 'Quiz', desc: '10 questions de l’IA, la plus rapide marque double.', tag: '1 à 20', color: 'var(--royal)', theme: true },
    { id: 'pendu', emoji: '🪢', name: 'Pendu', desc: 'Tout le monde propose des lettres, 6 erreurs maximum.', tag: 'équipe', color: 'var(--amber)' },
    { id: 'nombre', emoji: '🔢', name: 'Devine le nombre', desc: 'Entre 1 et 1 000 : plus haut, plus bas… qui trouve ?', tag: 'équipe', color: 'var(--sea)' },
  ] },
  duels: { label: '⚔️ Duels', games: [
    { id: 'morpion', emoji: '❌', name: 'Morpion', desc: 'Trois symboles alignés.', tag: '2 joueurs', color: 'var(--blood)' },
    { id: 'puissance4', emoji: '🔴', name: 'Puissance 4', desc: 'Quatre jetons alignés.', tag: '2 joueurs', color: 'var(--sky)' },
    { id: 'duel', duel: 'navale', emoji: '🚢', name: 'Bataille navale', desc: 'Coule la flotte adverse, touché = tu rejoues.', tag: 'ou contre le bot', color: 'var(--sky)' },
    { id: 'duel', duel: 'abordage', emoji: '🏴‍☠️', name: 'Abordage', desc: 'Canons, bordées, réparations : coule son navire.', tag: 'ou contre le bot', color: 'var(--blood)' },
    { id: 'duel', duel: 'memory', emoji: '🃏', name: 'Memory', desc: 'Retrouve les paires de trésors.', tag: 'ou contre le bot', color: 'var(--emerald)' },
    { id: 'duel', duel: 'pfc', emoji: '✂️', name: 'Pierre-feuille-ciseaux', desc: 'Deux manches gagnantes.', tag: 'ou contre le bot', color: 'var(--amber)' },
    { id: 'duel', duel: 'allumettes', emoji: '🪵', name: 'Allumettes', desc: '1 à 3 par tour, ne prends pas la dernière.', tag: 'ou contre le bot', color: 'var(--gold)' },
    { id: 'duel', duel: 'rimes', emoji: '🎤', name: 'Duel de rimes', desc: 'Chacun écrit, l’IA désigne le gagnant.', tag: '2 joueurs', color: 'var(--rose)' },
  ] },
  taverne: { label: '🍺 Taverne et solo' },
  soiree: { label: '🎭 Soirée' },
};
// Les jeux de soirée : tout se joue ici (rôles secrets sur ton écran, extraits audio, réponses dans le chat)
const CHOICES = {
  rebus: [['tout', '🎲 Tout'], ['films', '🎬 Films'], ['disney', '🏰 Disney'], ['series', '📺 Séries'], ['anime', '🍥 Animés'], ['jeux', '🎮 Jeux vidéo'], ['rapfr', '🎤 Rap FR']],
  fans: [['tout', '🎲 Tout'], ['rapfr', '🇫🇷 Rap FR'], ['monde', '🌍 Monde']],
};
const PARTY = [
  ['🎭 Rôles secrets', [
    ['loupgarou', '🐺', 'Loup-garou', 'Ton rôle sur ton écran, nuits et votes', '5+', { bots: true }], ['imposteur', '🕵️', 'L’imposteur', 'Un mot secret, un intrus', '3+', { bots: true }],
    ['undercover', '🕶️', 'Undercover', 'Undercovers et Mister White', '4+', { bots: true }], ['histoire', '📖', 'Histoire interactive', 'L’IA raconte, vous décidez', '1+'],
  ]],
  ['📝 Mots et réflexion', [
    ['petitbac', '📝', 'Petit Bac', 'Une lettre, 5 catégories, l’IA vérifie', '1+'], ['rebus', '🧩', 'Rébus en emojis', 'Devinez le titre caché', '1+'],
    ['motscroises', '📰', 'Mots croisés de l’IA', '6 définitions', '1+', { theme: true }], ['quiditca', '🗨️', 'Qui a dit ça ?', 'Les vrais messages du serveur', '1+'],
    ['quizserveur', '🧭', 'Quiz du serveur', 'Sur le serveur et ses membres', '1+'], ['fans', '📊', 'Plus ou moins de fans', 'Quel artiste est le plus écouté ?', '1+'],
    ['chasse', '🗺️', 'Chasse au trésor', '3 énigmes, 3 morceaux de carte', '1+'], ['escape', '🗝️', 'Escape game', '3 salles, 10 minutes', '1+', { theme: true }],
    ['actionverite', '🎲', 'Action ou vérité', 'Défis validés par les autres', '2+'],
  ]],
  ['🎧 Musique et son', [
    ['blindtest', '🎧', 'Blind test', 'Rap FR, TikTok, 2010… 10 extraits', '1+'], ['devine', '🎬', 'Devine l’œuvre', 'Films, séries, animés, jeux', '1+'],
    ['blindperso', '🎁', 'Blind test perso', 'Chacun ajoute 2 sons : qui les a choisis ?', '2+'], ['pendumusical', '🎵', 'Pendu musical', 'Le titre lettre par lettre', '1+'], ['rappeur', '🎤', 'Devine le rappeur', 'La photo floutée se dévoile', '1+'],
    ['freestyle', '🎙️', 'Battle de freestyle', 'Au micro, l’IA juge', '2'],
  ]],
];
let lobbyTab = 'ensemble';
function mountLobby() {
  $('app').innerHTML = `
    <div class="hero rise"><h1>⚓ L’arcade du navire</h1><p>Tout le monde dans ce salon joue ensemble. Les victoires rapportent des pièces d’or sur le serveur.</p></div>
    <div class="tabs">${Object.entries(TABS).map(([k, t]) => `<button class="tab ${k === lobbyTab ? 'on' : ''}" data-tab="${k}">${t.label}</button>`).join('')}</div>
    <div class="lobby"><div id="tabBody"></div><div class="side">${sidePanels()}</div></div>`;
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { lobbyTab = b.dataset.tab; view = null; render(); }; });
  const body = $('tabBody');
  if (lobbyTab === 'taverne') { body.innerHTML = '<div id="soloBox"></div>'; renderSolo($('soloBox')); }
  else if (lobbyTab === 'soiree') {
    body.innerHTML = `<p class="hint">Tout se joue dans l’arcade : ton rôle secret s’affiche sur ton écran, les extraits passent dans ton navigateur, les réponses s’écrivent dans le chat.</p>
      ${PARTY.map(([title, list]) => `<h3 class="section">${title}</h3><div class="games small">${list.map(([id, e, n, d, tag, o = {}], i) => `
        <div class="game parchment rise" style="animation-delay:${i * 40}ms"><span class="tag" style="background:var(--royal)">${tag}</span><span class="emoji">${e}</span><h3>${n}</h3><p>${d}</p>
          ${o.theme ? '<input class="theme" placeholder="Thème (facultatif)" maxlength="60">' : ''}
          ${CHOICES[id] ? `<select class="choice">${CHOICES[id].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>` : ''}
          ${o.bots ? '<label class="bots"><input type="checkbox" class="withBots"> Compléter avec des bots</label>' : ''}
          <button data-party="${id}">Lancer</button></div>`).join('')}</div>`).join('')}`;
    document.querySelectorAll('[data-party]').forEach((b) => {
      const card = b.parentElement;
      b.onclick = () => send({ type: 'start', game: 'party', party: b.dataset.party, theme: card.querySelector('.theme')?.value || undefined, choice: card.querySelector('.choice')?.value || undefined, bots: card.querySelector('.withBots')?.checked || undefined });
    });
  } else {
    const list = TABS[lobbyTab].games;
    body.innerHTML = `<div class="games">${list.map((g, i) => `
      <div class="game parchment rise" style="animation-delay:${i * 60}ms">
        <span class="tag" style="background:${g.color}">${g.tag}</span>
        <span class="emoji">${g.emoji}</span><h3>${g.name}</h3><p>${g.desc}</p>
        ${g.theme ? '<input class="theme" placeholder="Thème (facultatif)" maxlength="60">' : ''}
        <button data-start="${g.id}" data-duel="${g.duel ?? ''}">Lancer</button>
      </div>`).join('')}</div>`;
    document.querySelectorAll('[data-start]').forEach((b) => {
      b.onclick = () => send({ type: 'start', game: b.dataset.start, duel: b.dataset.duel || undefined, theme: b.parentElement.querySelector('.theme')?.value || undefined });
    });
  }
  bindSay();
}
function sidePanels(scores = null, extra = '') {
  return `<div class="panel"><h3>👥 Équipage</h3><div class="players" id="players"></div></div>
    <div class="panel"><h3>💬 ${scores ? 'Propositions' : 'Discussion'}</h3><div class="chat" id="chat"></div>
    <form class="say" id="say"><input id="sayText" maxlength="80" autocomplete="off" placeholder="${scores ? 'Ta proposition…' : 'Écris un message…'}"><button>➤</button></form>${extra}</div>`;
}
function bindSay() {
  $('say').onsubmit = (e) => {
    e.preventDefault();
    const t = $('sayText').value.trim();
    if (!t) return;
    $('sayText').value = '';
    send({ type: 'chat', text: t });
  };
}
function updatePlayers(scores = null, g = null, answered = null) {
  const list = [...state.players];
  if (scores) list.sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  $('players').innerHTML = list.map((p) => `<div class="player ${g?.drawer === p.id ? 'drawing' : ''} ${g?.guessed?.includes(p.id) ? 'found' : ''}">${avatar(p.id)}<span>${esc(p.name)}${p.id === state.host ? ' 👑' : ''}${g?.drawer === p.id ? ' ✏️' : ''}${g?.guessed?.includes(p.id) ? ' ✅' : ''}${answered?.includes(p.id) ? ' <small class="done">✅ a répondu</small>' : ''}</span>${scores ? `<span class="pts">${scores[p.id] ?? 0}</span>` : ''}</div>`).join('');
}
function updateLobby() { updatePlayers(); }
let chatCount = 0;
function updateChat() {
  const box = $('chat');
  if (!box) return;
  const at = box.scrollTop + box.clientHeight >= box.scrollHeight - 10;
  box.innerHTML = state.chat.map((m) => (m.kind === 'msg' ? `<div class="${m.spec ? 'spec' : ''}">${m.spec ? '👀 ' : ''}<b>${esc(m.name)}</b> ${esc(m.text)}</div>` : `<div class="${m.kind}">${esc(m.text)}</div>`)).join('');
  if (at || state.chat.length !== chatCount) box.scrollTop = box.scrollHeight;
  chatCount = state.chat.length;
}

// ------------------------------------------------------------------ Dessine et devine
const COLORS = ['#2a1606', '#ffffff', '#8c1c13', '#e0433a', '#ff9f2e', '#f2c14e', '#3fbf6a', '#1f5f5a', '#1fb5b0', '#4aa8ff', '#7c6cff', '#ff5fa2', '#8a5a2b', '#9e9e9e'];
const SIZES = [3, 8, 18, 34];
const canvasState = { epoch: null, ops: [] };
const pen = { color: COLORS[0], size: 8, erase: false };
let ctx = null;
function mountDraw() {
  $('app').innerHTML = `
    <div class="draw">
      <div>
        <div class="bar"><div class="timer" id="timer">–</div><div class="hint" id="hint"></div><div class="timer" id="round"></div></div>
        <div class="progress"><i id="prog" style="width:100%"></i></div>
        <div class="board"><canvas id="cv" width="800" height="600"></canvas><div id="over" class="overlay" hidden></div></div>
        <div class="tools" id="tools" hidden>
          ${COLORS.map((c) => `<button class="swatch" data-c="${c}" style="background:${c}"></button>`).join('')}
          ${SIZES.map((s) => `<button class="size" data-s="${s}"><i style="width:${Math.max(4, s / 1.4)}px;height:${Math.max(4, s / 1.4)}px"></i></button>`).join('')}
          <button class="ghost small" id="erase">🧽 Gomme</button>
          <button class="ghost small" id="fill">🪣 Fond</button>
          <button class="ghost small" id="undo">↩️</button>
          <button class="ghost small" id="clear">🗑️</button>
        </div>
      </div>
      <div class="side">${sidePanels(true)}</div>
    </div>`;
  ctx = $('cv').getContext('2d');
  canvasState.epoch = null;
  canvasState.ops = [];
  document.querySelectorAll('.swatch').forEach((b) => { b.onclick = () => { pen.color = b.dataset.c; pen.erase = false; markTools(); }; });
  document.querySelectorAll('.size').forEach((b) => { b.onclick = () => { pen.size = Number(b.dataset.s); markTools(); }; });
  $('erase').onclick = () => { pen.erase = !pen.erase; markTools(); };
  $('fill').onclick = () => send({ type: 'fill', c: pen.color });
  $('undo').onclick = () => send({ type: 'undo' });
  $('clear').onclick = () => send({ type: 'clear' });
  markTools();
  bindDrawing();
  bindSay();
}
function markTools() {
  document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', !pen.erase && b.dataset.c === pen.color));
  document.querySelectorAll('.size').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === pen.size));
  $('erase').classList.toggle('on', pen.erase);
  $('erase').style.borderColor = pen.erase ? 'var(--gold)' : '';
}
let bg = '#f6ecd2';
function strokeOp(o) {
  if (o.pts.length === 1) {
    ctx.fillStyle = o.c;
    ctx.beginPath();
    ctx.arc(o.pts[0][0] * 800, o.pts[0][1] * 600, o.s / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = o.c;
  ctx.lineWidth = o.s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(o.pts[0][0] * 800, o.pts[0][1] * 600);
  for (const [x, y] of o.pts.slice(1)) ctx.lineTo(x * 800, y * 600);
  ctx.stroke();
}
function redraw() {
  const removed = new Set(canvasState.ops.filter((o) => o.undo).map((o) => o.undo));
  let start = 0;
  canvasState.ops.forEach((o, i) => { if (o.clear) start = i + 1; });
  bg = '#f6ecd2';
  for (const o of canvasState.ops.slice(start)) if (o.fill) bg = o.fill;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 600);
  for (const o of canvasState.ops.slice(start)) if (o.pts && !removed.has(o.id)) strokeOp(o);
}
function applyCanvas(c) {
  if (!c || !ctx) return;
  if (c.epoch !== canvasState.epoch || c.from === 0) { canvasState.epoch = c.epoch; canvasState.ops = []; }
  if (c.from !== canvasState.ops.length) return; // décalage : le prochain appel renverra tout
  const fresh = c.ops;
  canvasState.ops.push(...fresh);
  if (c.from === 0 || fresh.some((o) => o.undo || o.clear || o.fill)) redraw();
  else for (const o of fresh) if (o.pts) strokeOp(o);
}
function bindDrawing() {
  const cv = $('cv');
  let current = null;
  let pending = [];
  let last = null;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };
  const flush = () => {
    if (!current || !pending.length) return;
    const pts = last ? [last, ...pending] : pending;
    last = pending.at(-1);
    pending = [];
    send({ type: 'stroke', id: current, pts, c: pen.erase ? bg : pen.color, s: pen.erase ? Math.max(pen.size, 18) : pen.size });
  };
  cv.onpointerdown = (e) => {
    if (!cv.classList.contains('mine')) return;
    cv.setPointerCapture(e.pointerId);
    current = Math.random().toString(36).slice(2, 10);
    last = null;
    pending = [pos(e)];
    strokeOp({ pts: pending.slice(), c: pen.erase ? bg : pen.color, s: pen.erase ? Math.max(pen.size, 18) : pen.size });
  };
  cv.onpointermove = (e) => {
    if (!current) return;
    const p = pos(e);
    const prev = pending.at(-1) ?? last;
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.003) return;
    pending.push(p);
    if (prev) strokeOp({ pts: [prev, p], c: pen.erase ? bg : pen.color, s: pen.erase ? Math.max(pen.size, 18) : pen.size });
    if (pending.length >= 12) flush();
  };
  const up = () => { flush(); current = null; };
  cv.onpointerup = up;
  cv.onpointercancel = up;
  setInterval(flush, 90);
}
function updateDraw() {
  const g = state.game;
  const mine = g.drawer === state.me;
  applyCanvas(state.canvas);
  $('cv').classList.toggle('mine', mine && g.phase === 'draw');
  $('tools').hidden = !(mine && g.phase === 'draw');
  $('hint').textContent = g.phase === 'choose' ? (mine ? 'Choisis ton mot' : `${nameOf(g.drawer)} choisit un mot…`) : (g.word && (mine || g.phase === 'reveal') ? g.word.toUpperCase() : (g.hint ?? '').toUpperCase());
  $('round').textContent = `${g.round}/${g.rounds}`;
  const over = $('over');
  if (g.phase === 'choose' && mine) {
    over.hidden = false;
    over.innerHTML = `<h2>À toi de dessiner !</h2><div class="choices">${g.choices.map((w, i) => `<button data-w="${i}">${esc(w)}</button>`).join('')}</div>`;
    over.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => send({ type: 'choose', i: Number(b.dataset.w) }); });
  } else if (g.phase === 'choose') {
    over.hidden = false;
    over.innerHTML = `${avatar(g.drawer)}<h2>${esc(nameOf(g.drawer))} choisit un mot…</h2>`;
  } else if (g.phase === 'reveal') {
    over.hidden = false;
    over.innerHTML = `<h2>Le mot était</h2><div class="hint">${esc((g.word ?? '').toUpperCase())}</div><p>${g.guessed.length} joueur(s) ont trouvé</p>`;
  } else over.hidden = true;
  updatePlayers(g.scores, g);
  $('sayText').disabled = mine && g.phase === 'draw';
  $('sayText').placeholder = mine && g.phase === 'draw' ? 'Tu dessines !' : g.guessed.includes(state.me) ? 'Trouvé ! Tu peux discuter avec ceux qui ont trouvé.' : 'Ta proposition…';
}
setInterval(() => {
  const g = state?.game;
  if (!g?.endsAt || !$('timer')) return;
  const left = Math.max(0, Math.ceil((g.endsAt - (Date.now() + offset)) / 1000));
  $('timer').textContent = `${left}s`;
  $('timer').classList.toggle('low', left <= 10 && g.phase === 'draw');
  const total = g.phase === 'draw' ? 80 : g.phase === 'choose' ? 15 : 5;
  $('prog').style.width = `${Math.min(100, (left / total) * 100)}%`;
}, 250);

// ------------------------------------------------------------------ Morpion et puissance 4
function mountDuel() {
  $('app').innerHTML = `<div class="duel rise"><div class="seats" id="seats"></div><div id="plateau"></div><div class="status" id="status"></div><div class="row" id="actions"></div></div>
    <div style="max-width:640px;margin:16px auto 0" class="side">${sidePanels()}</div>`;
  bindSay();
}
function updateDuel() {
  const g = state.game;
  const marks = g.kind === 'morpion' ? ['❌', '⭕'] : ['🔴', '🟡'];
  const over = g.winner || g.draw;
  $('seats').innerHTML = g.seats.map((id, i) => `<div class="seat ${!over && g.turn === i && id ? 'turn' : ''}">${marks[i]} ${id ? `${avatar(id)} ${esc(nameOf(id))}` : '<i>place libre</i>'}</div>`).join('<b style="align-self:center">VS</b>');
  const myTurn = !over && g.seats[g.turn] === state.me && !g.seats.includes(null);
  if (g.kind === 'morpion') {
    $('plateau').innerHTML = `<div class="ttt">${g.board.map((v, i) => `<button data-i="${i}" class="${v === 0 ? 'x' : v === 1 ? 'o' : ''} ${g.line?.includes(i) ? 'win' : ''}" ${v !== null || !myTurn ? 'disabled' : ''}>${v === 0 ? '<span>✕</span>' : v === 1 ? '<span>◯</span>' : ''}</button>`).join('')}</div>`;
  } else {
    const win = new Set((g.line ?? []).map(([y, x]) => `${y}:${x}`));
    $('plateau').innerHTML = `<div class="p4">${g.grid.flatMap((row, y) => row.map((v, x) => `<div class="cell ${v === 0 ? 'r' : v === 1 ? 'j' : ''} ${g.last && g.last[0] === y && g.last[1] === x ? 'last' : ''} ${win.has(`${y}:${x}`) ? 'win' : ''}" data-i="${x}"></div>`)).join('')}</div>`;
  }
  $('plateau').querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { if (myTurn) send({ type: 'play', i: Number(b.dataset.i) }); }; });
  $('status').textContent = g.winner ? `🏆 ${nameOf(g.winner)} gagne !` : g.draw ? '🤝 Égalité !' : g.seats.includes(null) ? 'En attente d’un adversaire…' : myTurn ? 'À toi de jouer !' : `Au tour de ${nameOf(g.seats[g.turn])}`;
  const acts = [];
  if (g.seats.includes(null) && !g.seats.includes(state.me)) acts.push('<button id="sit">S’asseoir</button>');
  if (over) acts.push(`<button id="again">Revanche</button>`, '<button class="ghost" id="back">Changer de jeu</button>');
  $('actions').innerHTML = acts.join('');
  if ($('sit')) $('sit').onclick = () => send({ type: 'sit' });
  if ($('again')) $('again').onclick = () => send({ type: 'start', game: g.kind });
  if ($('back')) $('back').onclick = () => send({ type: 'lobby' });
  updatePlayers();
}

// ------------------------------------------------------------------ Fin de partie
function mountEnd() {
  const g = state.game;
  $('app').innerHTML = `<div class="podium parchment rise"><h2>${esc(g.title ?? '🏆 Fin de la partie')}</h2>${g.text ? `<p class="endtext">${md(g.text)}</p>` : ''}<ol id="podium"></ol><div class="row"><button id="again">Rejouer</button><button class="ghost" id="back">Changer de jeu</button></div></div>`;
  $('again').onclick = () => send(g.from === 'party' ? { type: 'start', game: 'party', party: g.party } : { type: 'start', game: g.from });
  $('back').onclick = () => send({ type: 'lobby' });
}
function updateEnd() {
  const medals = ['🥇', '🥈', '🥉'];
  $('podium').innerHTML = state.game.podium.map(([id, pts], i) => `<li>${medals[i] ?? `${i + 1}.`} ${avatar(id)} ${esc(nameOf(id))}<b>${pts} pts</b></li>`).join('');
}

// ------------------------------------------------------------------ Nouveaux jeux : duels, quiz, pendu, nombre
function mountBoard() {
  $('app').innerHTML = `<div class="duel rise"><div class="seats" id="seats"></div><div id="plateau"></div><div class="status" id="status"></div><div class="row" id="actions"></div></div>
    <div style="max-width:700px;margin:16px auto 0" class="side">${sidePanels()}</div>`;
  bindSay();
}
const who = (id) => (id === 'bot' ? '🤖 le bot' : esc(nameOf(id)));
const seat = (id, label, on) => `<div class="seat ${on ? 'turn' : ''}">${label} ${id ? `${id === 'bot' ? '🤖' : avatar(id)} ${who(id)}` : '<i>place libre</i>'}</div>`;
function duelActions(g) {
  const acts = [];
  if (g.phase === 'wait') {
    if (state.me !== g.a) acts.push('<button data-a="sit">Relever le défi</button>');
    else if (g.game !== 'rimes') acts.push('<button class="ghost" data-a="bot">Jouer contre le bot</button>');
  } else if (!g.over && g.you) acts.push('<button class="ghost" data-a="forfeit">🏳️ Abandonner</button>');
  if (g.over) acts.push(`<button data-a="again">Revanche</button>`, '<button class="ghost" data-a="back">Changer de jeu</button>');
  $('actions').innerHTML = acts.join('');
  $('actions').querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = () => (b.dataset.a === 'again' ? send({ type: 'start', game: 'duel', duel: g.game }) : b.dataset.a === 'back' ? send({ type: 'lobby' }) : send({ type: b.dataset.a }));
  });
}
function updateNewDuel() {
  const g = state.game;
  const myTurn = g.phase === 'play' && !g.over && g.turn === state.me;
  $('seats').innerHTML = seat(g.a, '🅰️', !g.over && g.turn === g.a && g.phase === 'play') + '<b style="align-self:center">VS</b>' + seat(g.b, '🅱️', !g.over && g.turn === g.b && g.phase === 'play');
  const P = $('plateau');
  const play = (arg) => send({ type: 'play', arg });
  if (g.phase === 'wait') P.innerHTML = `<div class="parchment waitbox"><h2>${esc(g.label)}</h2><p>${who(g.a)} attend un adversaire…</p></div>`;
  else if (g.game === 'navale') {
    const grid = (cells, click) => `<div class="sea ${click ? 'click' : ''}">${cells.map((c, i) => `<button data-i="${i}" class="${c}" ${click && !c ? '' : 'disabled'}>${c === 'hit' ? '💥' : c === 'miss' ? '🌊' : c === 'ship' ? '🚢' : ''}</button>`).join('')}</div>`;
    P.innerHTML = `<div class="seas"><div><h3>🎯 Mer adverse</h3>${grid(g.target, myTurn)}</div><div><h3>⛵ Ta flotte</h3>${grid(g.mine, false)}</div></div><p class="hint">${esc(g.last ?? 'Navires de 3, 2 et 2 cases. Touché : tu rejoues.')}</p>`;
    P.querySelectorAll('.sea.click [data-i]').forEach((b) => { b.onclick = () => play(Number(b.dataset.i)); });
  } else if (g.game === 'pfc') {
    const mine = g.you === 'a' ? g.picked.a : g.picked.b;
    P.innerHTML = `<div class="score">${who(g.a)} <b>${g.score?.[g.a] ?? 0}</b> · <b>${g.score?.[g.b] ?? 0}</b> ${who(g.b)}</div>
      <div class="rps">${[['pierre', '🪨'], ['feuille', '📄'], ['ciseaux', '✂️']].map(([k, e]) => `<button data-k="${k}" ${!g.you || mine || g.over ? 'disabled' : ''}>${e}<span>${k}</span></button>`).join('')}</div>
      <div class="log">${(g.log ?? []).map((l) => `<div>${esc(l.replace(/<@(\d+)>/g, (m, id) => nameOf(id)))}</div>`).join('')}</div>`;
    P.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => play(b.dataset.k); });
  } else if (g.game === 'allumettes') {
    P.innerHTML = `<div class="sticks">${'<i></i>'.repeat(g.left)}</div><p class="big">${g.left} allumette(s) · celui qui prend la dernière perd</p>
      <div class="row">${[1, 2, 3].map((n) => `<button data-n="${n}" ${!myTurn || n > g.left ? 'disabled' : ''}>Prendre ${n}</button>`).join('')}</div>
      <div class="log">${(g.log ?? []).map((l) => `<div>${esc(l.replace(/<@(\d+)>/g, (m, id) => nameOf(id)))}</div>`).join('')}</div>`;
    P.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => play(Number(b.dataset.n)); });
  } else if (g.game === 'memory') {
    P.innerHTML = `<div class="score">${who(g.a)} <b>${g.pairs?.[g.a] ?? 0}</b> · <b>${g.pairs?.[g.b] ?? 0}</b> ${who(g.b)}</div>
      <div class="memo">${g.cards.map((c, i) => `<button data-i="${i}" class="${c ? 'up' : ''} ${g.found.includes(i) ? 'found' : ''}" ${!myTurn || c ? 'disabled' : ''}>${c ?? '⚓'}</button>`).join('')}</div>`;
    P.querySelectorAll('.memo [data-i]').forEach((b) => { b.onclick = () => play(Number(b.dataset.i)); });
  } else if (g.game === 'abordage') {
    const bar = (id) => `<div class="hp"><span>${who(id)}</span><div class="hpbar"><i style="width:${(g.hp[id] / 30) * 100}%"></i></div><b>${g.hp[id]}/30</b></div>`;
    const foe = g.turn === g.a ? g.b : g.a;
    P.innerHTML = `<div class="ships">${bar(g.a)}${bar(g.b)}</div>
      <div class="row">${[['canon', '💣 Canon', 'sûr : 3-6'], ['bordee', '🔥 Bordée', 'risqué : 7-12'], ['reparer', `🔧 Réparer (${g.repairs[state.me] ?? 0})`, '+5'], ['aborder', '⚔️ Aborder', 'si coque ≤ 10']].map(([k, l, d]) => `<button data-k="${k}" ${!myTurn || (k === 'reparer' && !(g.repairs[state.me] > 0)) || (k === 'aborder' && g.hp[foe] > 10) ? 'disabled' : ''}>${l}<small>${d}</small></button>`).join('')}</div>
      <div class="log">${(g.log ?? []).map((l) => `<div>${esc(l.replace(/<@(\d+)>/g, (m, id) => nameOf(id)))}</div>`).join('')}</div>`;
    P.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => play(b.dataset.k); });
  } else if (g.game === 'rimes') {
    const sent = g.you === 'a' ? g.sent.a : g.sent.b;
    P.innerHTML = g.verdict
      ? `<div class="parchment"><h2>Thème : ${esc(g.theme)}</h2>${[g.a, g.b].map((id) => `<p><b>${who(id)} · ${g.verdict[id]}/10</b><br><i>${esc(g.texts[id] ?? '').replace(/\n/g, '<br>')}</i></p>`).join('')}<p>🎙️ ${esc(g.verdict.avis)}</p></div>`
      : `<div class="parchment"><h2>🎤 Thème : ${esc(g.theme)}</h2><p>2 à 4 lignes qui riment. L’IA note la rime, le flow et l’originalité.</p>
        ${g.you && !sent ? '<textarea id="rime" rows="4" maxlength="400" placeholder="Ta rime…"></textarea><button id="sendRime">Rendre ma rime</button>' : `<p>${sent ? '✅ Ta rime est rendue.' : ''} ${who(g.a)} ${g.sent.a ? '✅' : '✍️'} · ${who(g.b)} ${g.sent.b ? '✅' : '✍️'}</p>`}</div>`;
    if ($('sendRime')) $('sendRime').onclick = () => send({ type: 'rhyme', text: $('rime').value });
  }
  $('status').textContent = g.over ? (g.winner ? `🏆 ${g.winner === 'bot' ? 'Le bot' : nameOf(g.winner)} gagne !` : '🤝 Égalité !')
    : g.phase === 'wait' ? 'En attente d’un adversaire…' : g.game === 'pfc' || g.game === 'rimes' ? 'Chacun joue de son côté' : myTurn ? 'À toi de jouer !' : `Au tour de ${g.turn === 'bot' ? 'du bot' : nameOf(g.turn)}`;
  duelActions(g);
  updatePlayers();
}
function updateQuiz() {
  const g = state.game;
  $('seats').innerHTML = `<div class="seat">🧠 Quiz${g.theme ? ` · ${esc(g.theme)}` : ''} · question ${Math.max(1, g.n)}/${g.total || 10}</div>`;
  if (g.phase === 'loading' || !g.question) { $('plateau').innerHTML = '<div class="parchment waitbox"><h2>L’IA prépare les questions…</h2></div>'; $('status').textContent = ''; $('actions').innerHTML = ''; updatePlayers(g.scores); return; }
  const L = ['A', 'B', 'C', 'D'];
  $('plateau').innerHTML = `<div class="parchment"><h2>${esc(g.question)}</h2></div><div class="choices4">${g.choices.map((c, i) => `<button data-i="${i}" class="${g.right === i ? 'right' : g.right !== null && g.mine === i ? 'wrong' : g.mine === i ? 'mine' : ''}" ${g.mine !== null || g.phase !== 'question' ? 'disabled' : ''}><b>${L[i]}</b> ${esc(c)}</button>`).join('')}</div>`;
  $('plateau').querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => send({ type: 'answer', i: Number(b.dataset.i) }); });
  $('status').textContent = g.phase === 'question' ? `${g.answered} réponse(s)` : 'Réponse !';
  $('actions').innerHTML = '';
  updatePlayers(g.scores);
}
function updatePendu() {
  const g = state.game;
  const STAGES = ['', '|', '|—', '|—O', '|—O-|', '|—O-|-<', '💀'];
  $('seats').innerHTML = `<div class="seat">🪢 Pendu · ${g.misses.length}/${g.max} erreurs ${STAGES[g.misses.length] ?? ''}</div>`;
  $('plateau').innerHTML = `<div class="word">${g.masked.map((c) => `<span>${c === ' ' ? '&nbsp;' : c.toUpperCase()}</span>`).join('')}</div>
    <div class="keys">${'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `<button data-c="${c}" class="${g.found.includes(c) ? 'ok' : g.misses.includes(c) ? 'ko' : ''}" ${g.over || g.found.includes(c) || g.misses.includes(c) ? 'disabled' : ''}>${c.toUpperCase()}</button>`).join('')}</div>`;
  $('plateau').querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => send({ type: 'letter', letter: b.dataset.c }); });
  $('status').textContent = g.over ? (g.winner ? `🎉 ${nameOf(g.winner)} trouve : ${g.word.toUpperCase()}` : `💀 Le mot était ${g.word.toUpperCase()}`) : 'Tout le monde peut proposer une lettre';
  $('actions').innerHTML = g.over ? '<button id="again">Rejouer</button><button class="ghost" id="back">Changer de jeu</button>' : '';
  if ($('again')) { $('again').onclick = () => send({ type: 'start', game: 'pendu' }); $('back').onclick = () => send({ type: 'lobby' }); }
  updatePlayers();
}
function updateNombre() {
  const g = state.game;
  $('seats').innerHTML = `<div class="seat">🔢 Devine le nombre entre 1 et 1 000 · ${g.count} essai(s)</div>`;
  if (!$('nb')) {
    $('plateau').innerHTML = `<form class="say" id="nbForm" style="max-width:320px;margin:0 auto"><input id="nb" type="number" min="1" max="1000" placeholder="Ton nombre"><button>➤</button></form><div class="tries" id="tries"></div>`;
    $('nbForm').onsubmit = (e) => { e.preventDefault(); const n = Number($('nb').value); $('nb').value = ''; if (n) send({ type: 'guess', n }); };
  }
  $('tries').innerHTML = [...g.tries].reverse().map((t) => `<div class="try ${t.hint}"><b>${t.n}</b> ${t.hint === 'plus' ? '🔼 plus haut' : t.hint === 'moins' ? '🔽 plus bas' : '🎯 trouvé !'} <small>${esc(nameOf(t.who))}</small></div>`).join('');
  $('nb').disabled = g.over;
  $('status').textContent = g.over ? `🎉 ${nameOf(g.winner)} trouve ${g.secret} !` : '';
  $('actions').innerHTML = g.over ? '<button id="again">Rejouer</button><button class="ghost" id="back">Changer de jeu</button>' : '';
  if ($('again')) { $('again').onclick = () => send({ type: 'start', game: 'nombre' }); $('back').onclick = () => send({ type: 'lobby' }); }
  updatePlayers();
}

// ------------------------------------------------------------------ Son : musique de fond, voix de l'IA, extraits
// Tout passe par un seul AudioContext, débloqué au premier geste (Discord bloque le son automatique avant).
const Sound = (() => {
  const prefs = { music: 0.25, voice: 0.9, fx: 0.8 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('arcade-son') || '{}')); } catch { /* sans stockage */ }
  let ctx = null;
  let buses = null;
  let fx = null; // extrait en cours { src, node }
  let voiceBusy = 0;
  let voiceNode = null;
  let voiceTurn = 0; // chaque nouvelle phrase coupe la précédente : la voix suit toujours la partie
  let lastSaid = '';
  const saveP = () => { try { localStorage.setItem('arcade-son', JSON.stringify(prefs)); } catch { /* sans stockage */ } };
  const duck = () => {
    if (!buses) return;
    const target = prefs.music * (voiceBusy || fx ? 0.3 : 1);
    buses.music.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
  };
  function unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        buses = Object.fromEntries(['music', 'voice', 'fx'].map((k) => { const g = ctx.createGain(); g.gain.value = prefs[k]; g.connect(master); return [k, g]; }));
        startMusic();
      }
      if (ctx.state !== 'running') ctx.resume();
      $('unlock').hidden = true;
    } catch { /* pas de son possible */ }
  }
  // Musique de fond douce, jouée par le navigateur : accords lents de taverne et vagues
  function startMusic() {
    const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 207.65, 246.94]];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(buses.music);
    let i = 0;
    const play = () => {
      const t = ctx.currentTime;
      for (const f of CHORDS[i % CHORDS.length]) {
        for (const detune of [-4, 4]) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f / 2;
          o.detune.value = detune;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + 1.6);
          g.gain.linearRampToValueAtTime(0.035, t + 4.5);
          g.gain.linearRampToValueAtTime(0, t + 6.5);
          o.connect(g).connect(filter);
          o.start(t);
          o.stop(t + 6.6);
        }
      }
      // Une petite note de guitare de temps en temps
      if (i % 2 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = CHORDS[i % CHORDS.length][(i >> 1) % 3] * 2;
        g.gain.setValueAtTime(0.045, t + 2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        o.connect(g).connect(filter);
        o.start(t + 2);
        o.stop(t + 4.1);
      }
      i += 1;
    };
    play();
    setInterval(play, 5000);
    // Vagues : bruit filtré qui monte et descend
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.015;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(buses.music);
    src.start();
    lfo.start();
  }
  async function decode(res) {
    if (!res.ok) throw new Error(String(res.status));
    return ctx.decodeAudioData(await res.arrayBuffer());
  }
  // Extrait (blind test…) : un seul à la fois
  async function playFx(src) {
    if (!ctx || fx?.src === src) return;
    stopFx();
    const mine = { src, node: null };
    fx = mine;
    duck();
    try {
      const buf = await decode(await fetch(src));
      if (fx !== mine) return;
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(buses.fx);
      node.start();
      mine.node = node;
      node.onended = () => { if (fx === mine) { fx = { src, node: null, done: true }; duck(); } };
    } catch { if (fx === mine) fx = null; duck(); }
  }
  function stopFx() {
    try { fx?.node?.stop(); } catch { /* déjà fini */ }
    fx = null;
    duck();
  }
  // La voix de l'IA : les textes sont lus l'un après l'autre
  function say(text, key = text) {
    const t = String(text ?? '').trim();
    if (!t || key === lastSaid || prefs.voice <= 0) return;
    lastSaid = key;
    speakNow(t).catch(() => {});
  }
  function hush() {
    voiceTurn += 1;
    try { voiceNode?.stop(); } catch { /* déjà fini */ }
    voiceNode = null;
    try { speechSynthesis.cancel(); } catch { /* pas de voix du navigateur */ }
  }
  async function speakNow(text) {
    if (!ctx) return;
    hush();
    const turn = voiceTurn;
    voiceBusy += 1;
    duck();
    try {
      const res = await fetch(`api/tts?${new URLSearchParams({ room, ...(guild ? { guild } : {}) })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: JSON.stringify({ text }) });
      const buf = await decode(res);
      // Trop tard (la partie est passée à l'écran suivant) : on ne lit pas une phrase dépassée
      if (turn !== voiceTurn) return;
      await new Promise((resolve) => {
        const node = ctx.createBufferSource();
        node.buffer = buf;
        node.connect(buses.voice);
        node.onended = resolve;
        voiceNode = node;
        node.start();
      });
    } catch {
      if (turn !== voiceTurn) return;
      // Voix de l'IA indisponible : la voix du navigateur prend le relais
      await new Promise((resolve) => {
        try {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'fr-FR';
          u.volume = prefs.voice;
          u.onend = resolve;
          u.onerror = resolve;
          speechSynthesis.speak(u);
          setTimeout(resolve, 20_000);
        } catch { resolve(); }
      });
    } finally {
      voiceBusy -= 1;
      duck();
    }
  }
  function setVol(k, v) {
    prefs[k] = v;
    saveP();
    if (buses) { if (k === 'music') duck(); else buses[k].gain.setTargetAtTime(v, ctx.currentTime, 0.1); }
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, unlock, { capture: true });
  setTimeout(() => { if (!ctx || ctx.state !== 'running') $('unlock').hidden = false; }, 1500);
  $('unlock').onclick = unlock;
  $('soundBtn').onclick = () => { $('soundBox').hidden = !$('soundBox').hidden; };
  for (const [id, k] of [['volMusic', 'music'], ['volVoice', 'voice'], ['volFx', 'fx']]) {
    $(id).value = prefs[k];
    $(id).oninput = () => setVol(k, Number($(id).value));
  }
  // On quitte la page (Activité fermée) : plus un bruit
  window.addEventListener('pagehide', () => { hush(); stopFx(); try { ctx?.suspend(); } catch { /* déjà arrêté */ } });
  return { playFx, stopFx, say, hush: () => { hush(); lastSaid = ''; }, fxSrc: () => fx?.src ?? null, fxPlaying: () => Boolean(fx?.node) };
})();

// ------------------------------------------------------------------ Jeux de soirée (écrans décrits par le serveur)
const md = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/\n/g, '<br>');
let partySig = '';
let cardSig = '';
let rec = null; // enregistrement du micro en cours (freestyle)
function mountParty() {
  $('app').innerHTML = `<div class="duel rise party"><div class="seats" id="seats"></div><div id="roleCard"></div>
      <div class="pbar"><div class="timer" id="ptimer"></div><div class="progress"><i id="pprog" style="width:100%"></i></div></div>
      <div id="plateau"></div><div class="row" id="actions"></div></div>
    <div style="max-width:760px;margin:16px auto 0" class="side">${sidePanels(true)}</div>`;
  partySig = '';
  cardSig = '';
  bindSay();
}
function stopPartyAudio() { Sound.stopFx(); }
function block(b, i) {
  const k = `k${i}`;
  switch (b.t) {
    case 'text': return `<p class="pt ${b.cls ?? ''}">${md(b.text)}</p>`;
    case 'img': return `<img class="pimg ${b.cls ?? ''}" src="${esc(b.src)}" alt="">`;
    case 'audio': return `<div class="paudio"><button class="ghost" data-audio="${esc(b.src)}">🔁 Réécouter l’extrait</button></div>`;
    case 'feed': return `<div class="feed">${b.items.length ? b.items.map((x) => `<div class="fi ${x.note ?? ''}">${avatar(x.id)}<b>${esc(x.name)}</b><span>${md(x.text)}</span></div>`).join('') : '<p class="pt small">Pas encore d’indice.</p>'}</div>`;
    case 'who': return `<div class="whobox ${b.big ? 'big' : ''}">${avatar(b.id)}<div><b>${esc(b.name)}</b><div>${md(b.text ?? '')}</div></div></div>`;
    case 'word': return `<div class="word">${b.letters.map((c) => `<span>${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('')}</div>`;
    case 'keys': return `<div class="keys">${'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `<button data-letter="${c}" class="${b.ok.includes(c) ? 'ok' : b.ko.includes(c) ? 'ko' : ''}" ${b.lock || b.ok.includes(c) || b.ko.includes(c) ? 'disabled' : ''}>${c.toUpperCase()}</button>`).join('')}</div>`;
    case 'choices': {
      const L = ['A', 'B', 'C', 'D', 'E', 'F'];
      return `<div class="choices4">${b.options.map((c, j) => `<button data-pick="${j}" class="${b.right === j ? 'right' : b.right !== null && b.right !== undefined && b.mine === j ? 'wrong' : b.mine === j ? 'mine' : ''}" ${b.mine !== null || (b.right !== null && b.right !== undefined) ? 'disabled' : ''}><b>${L[j]}</b> ${esc(c)}</button>`).join('')}</div>`;
    }
    case 'buttons': return `<div class="row pbtns ${b.column ? 'col' : ''}">${b.items.map((x) => `<button data-btn="${esc(x.id)}" class="${x.cls ?? ''} ${b.chosen === x.id ? 'on' : ''}">${esc(x.label)}${b.tally?.[x.id] ? ` <small>· ${b.tally[x.id]}</small>` : ''}</button>`).join('')}</div>`;
    case 'input': return b.done ? '<p class="pt small">✅ Envoyé</p>' : `<form class="say pin" data-input><input data-k="${k}" maxlength="150" autocomplete="off" placeholder="${esc(b.ph ?? '')}"><button>${esc(b.button ?? '➤')}</button></form>`;
    case 'form': return b.done ? '<p class="pt big">✅ Grille rendue, attends les autres…</p>' : `<form class="pform" data-form>${b.fields.map((f, j) => `<label>${esc(f)}<input data-k="${k}-${j}" maxlength="40" autocomplete="off"></label>`).join('')}<button>${esc(b.button ?? 'Envoyer')}</button></form>`;
    case 'vote': return `<div class="pvote">${b.ids.map((id) => `<button data-vote="${id}" class="${b.mine === id ? 'on' : ''}" ${b.lock ? 'disabled' : ''}>${avatar(id)}<span>${esc(b.names?.[id] ?? nameOf(id))}</span>${b.voters?.[id]?.length ? `<i class="voters">${b.voters[id].map((v) => avatar(v.id).replace('<img', `<img title="${esc(v.name)}"`)).join('')}</i>` : ''}${b.counts?.[id] ? `<b>${b.counts[id]}</b>` : ''}</button>`).join('')}</div>`;
    case 'list': return `<ul class="plist">${b.items.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`;
    case 'grid': return `<div class="cross">${b.rows.map((row) => `<div>${row.map((c) => (c ? `<span class="cell ${c.key ? 'key' : ''}">${c.n ? `<i>${c.n}</i>` : ''}${esc(c.c)}</span>` : '<span class="cell void"></span>')).join('')}</div>`).join('')}</div>`;
    case 'duo': return `<div class="duo">${b.items.map((x) => `<div class="parchment">${x.img ? `<img src="${esc(x.img)}" alt="">` : ''}<h3>${esc(x.name)}</h3><p class="big">${esc(x.value)}</p></div>`).join('<b class="vs">VS</b>')}</div>`;
    case 'mic': return b.done ? '<p class="pt big">✅ Passage envoyé !</p>' : `<div class="pmic"><button id="micBtn" class="red">${rec ? '⏹️ Terminer' : `🎙️ Rapper au micro (${b.seconds} s)`}</button><p class="pt small" id="micState">${rec ? '🔴 Enregistrement…' : ''}</p>
      <form class="pform" data-input><textarea data-k="${k}" rows="4" maxlength="800" placeholder="${esc(b.ph ?? '')}"></textarea><button class="ghost">Envoyer le texte</button></form></div>`;
    default: return '';
  }
}
async function startMic(seconds) {
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const r = new MediaRecorder(stream);
    rec = r;
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      rec = null;
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      send({ type: 'audio', data, mime: blob.type });
      partySig = '';
    };
    r.start();
    setTimeout(() => { if (r.state === 'recording') r.stop(); }, seconds * 1000);
    partySig = '';
    render();
  } catch {
    toast('Micro indisponible : écris ton texte à la place.');
  }
}
function updateParty() {
  const g = state.game;
  const sc = g.screen ?? { blocks: [] };
  $('seats').innerHTML = `<div class="seat">${g.emoji} ${esc(g.name)}${sc.title ? ` · ${esc(sc.title)}` : ''}</div>${sc.sub ? `<div class="psub">${esc(sc.sub)}</div>` : ''}${g.spectator ? '<div class="specbar">👀 Tu es spectateur : la partie a commencé sans toi. Tu joueras à la prochaine !</div>' : ''}`;
  if ($('sayText')) $('sayText').placeholder = g.spectator ? 'Chat des spectateurs (les joueurs ne le voient pas)…' : 'Ta proposition…';
  const cs = JSON.stringify(g.card);
  if (cs !== cardSig) {
    cardSig = cs;
    const open = $('roleCard').querySelector('details')?.open ?? true;
    $('roleCard').innerHTML = g.card ? `<details class="rolecard c-${g.card.color ?? 'none'}" ${open ? 'open' : ''}><summary>${g.card.emoji} Ton rôle : <b>${esc(g.card.title)}</b> <small>(appuie pour cacher)</small></summary>
      <div class="rc">${g.card.img ? `<img src="${esc(g.card.img)}" alt="">` : ''}<p>${md(g.card.text ?? '')}</p></div></details>` : '';
  }
  const audioBlock = sc.blocks.find((b) => b.t === 'audio');
  const sig = JSON.stringify(sc.blocks) + (rec ? 'rec' : '');
  if (sig !== partySig) {
    partySig = sig;
    const P = $('plateau');
    const saved = {};
    P.querySelectorAll('[data-k]').forEach((el) => { saved[el.dataset.k] = el.value; });
    const focused = document.activeElement?.dataset?.k;
    P.innerHTML = sc.blocks.map(block).join('');
    P.querySelectorAll('[data-k]').forEach((el) => { if (saved[el.dataset.k]) el.value = saved[el.dataset.k]; if (el.dataset.k === focused) el.focus(); });
    P.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => send({ type: 'pick', i: Number(b.dataset.pick) }); });
    P.querySelectorAll('[data-btn]').forEach((b) => { b.onclick = () => send({ type: 'btn', id: b.dataset.btn }); });
    P.querySelectorAll('[data-vote]').forEach((b) => { b.onclick = () => send({ type: 'vote', id: b.dataset.vote }); });
    P.querySelectorAll('[data-letter]').forEach((b) => { b.onclick = () => send({ type: 'letter', letter: b.dataset.letter }); });
    P.querySelectorAll('[data-audio]').forEach((b) => { b.onclick = () => { Sound.stopFx(); Sound.playFx(b.dataset.audio); }; });
    P.querySelectorAll('[data-input]').forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); const el = f.querySelector('[data-k]'); const t = el.value.trim(); if (!t) return; el.value = ''; send({ type: 'answer', text: t }); }; });
    P.querySelectorAll('[data-form]').forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); send({ type: 'form', values: [...f.querySelectorAll('[data-k]')].map((el) => el.value.trim()) }); }; });
    const mic = sc.blocks.find((b) => b.t === 'mic');
    if ($('micBtn')) $('micBtn').onclick = () => startMic(mic?.seconds ?? 30);
  }
  if (audioBlock) Sound.playFx(audioBlock.src); else stopPartyAudio();
  // L'IA lit l'écran : le texte prévu pour la voix, sinon le récit (histoire, énigme, nuit…)
  const voice = sc.say ?? sc.blocks.find((b) => b.t === 'text' && b.cls === 'quote')?.text;
  if (!audioBlock && voice) Sound.say(voice, `${g.game}|${sc.title}|${voice}`);
  $('actions').innerHTML = state.me === state.host || state.me === g.host ? '<button class="ghost small" id="stopParty">⏹️ Arrêter la partie</button>' : '';
  if ($('stopParty')) $('stopParty').onclick = () => { if (confirm('Arrêter la partie pour tout le monde ?')) send({ type: 'lobby' }); };
  if (!g.fixed) { updatePlayers(g.scores, null, g.answered); return; }
  // Jeu à joueurs fixes : les joueurs de la partie (bots compris), puis les spectateurs arrivés en cours
  const row = (id, name, spectator = false) => `<div class="player ${spectator ? 'spectator' : ''}">${avatar(id)}<span>${esc(name)}${id === g.host ? ' 👑' : ''}${g.answered?.includes(id) ? ' <small class="done">✅ a répondu</small>' : ''}</span>${spectator ? '' : `<span class="pts">${g.scores[id] ?? 0}</span>`}</div>`;
  const specs = state.players.filter((p) => !g.players.includes(p.id));
  $('players').innerHTML = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0)).map((id) => row(id, nameOf(id))).join('')
    + (specs.length ? `<h4 class="spech">👀 Spectateurs</h4>${specs.map((p) => row(p.id, p.name, true)).join('')}` : '');
}
setInterval(() => {
  const g = state?.game;
  if (g?.kind !== 'party' || !$('ptimer')) return;
  const end = g.screen?.endsAt;
  if (!end) { $('ptimer').textContent = ''; $('pprog').style.width = '0%'; return; }
  const left = Math.max(0, Math.ceil((end - (Date.now() + offset)) / 1000));
  $('ptimer').textContent = `${left}s`;
  $('ptimer').classList.toggle('low', left <= 10);
  const bar = $('pprog');
  if (!bar.dataset.end || Number(bar.dataset.end) !== end) { bar.dataset.end = end; bar.dataset.total = Math.max(1, left); }
  bar.style.width = `${Math.min(100, (left / Number(bar.dataset.total)) * 100)}%`;
}, 250);

// ------------------------------------------------------------------ Taverne et jeux solo (chacun sa partie)
let soloTab = 'pile';
const SOLO = [['pile', '🪙 Pile ou face'], ['des', '🎲 Dés'], ['roue', '🎡 Roue'], ['machine', '🎰 Machine à sous'], ['blackjack', '🃏 Blackjack'], ['demineur', '💣 Démineur']];
let lastSoloAt = 0;
function renderSolo(box) {
  if (box.dataset.tab !== soloTab) {
    box.dataset.tab = soloTab;
    box.innerHTML = `<div class="tabs small">${SOLO.map(([k, l]) => `<button class="tab ${k === soloTab ? 'on' : ''}" data-solo="${k}">${l}</button>`).join('')}</div>
      <div class="parchment solo"><div id="soloCtl-${box.id}"></div><div class="soloOut" id="soloOut-${box.id}"></div></div>`;
    box.querySelectorAll('[data-solo]').forEach((b) => { b.onclick = () => { soloTab = b.dataset.solo; renderSolo(box); }; });
    const ctl = box.querySelector(`#soloCtl-${box.id}`);
    const bet = '<label class="bet">Mise <input type="number" min="10" max="10000" value="100" class="betIn"></label>';
    const act = (extra) => send({ type: 'solo', game: soloTab, bet: Number(ctl.querySelector('.betIn')?.value || 0), ...extra });
    if (soloTab === 'pile') ctl.innerHTML = `${bet}<div class="row"><button data-x="pile">Pile</button><button data-x="face">Face</button></div><p class="hint">Gagné : ×1,9</p>`;
    if (soloTab === 'des') ctl.innerHTML = `${bet}<div class="row"><button data-x="go">Lancer les dés contre le capitaine</button></div><p class="hint">Le plus haut gagne : ×1,9 · égalité : mise rendue</p>`;
    if (soloTab === 'roue') ctl.innerHTML = `${bet}<div class="row"><button data-x="go">Tourner la roue</button></div><div class="wheel" id="wheel-${box.id}"></div>`;
    if (soloTab === 'machine') ctl.innerHTML = `${bet}<div class="row"><button data-x="go">Tirer le levier</button></div><p class="hint">Trois 🏴‍☠️ = ×100 · deux pareils = ×1,5</p>`;
    if (soloTab === 'blackjack') ctl.innerHTML = `${bet}<div class="row"><button data-x="new">Nouvelle main</button><button data-x="hit" class="ghost">Tirer</button><button data-x="stand" class="ghost">Rester</button><button data-x="double" class="ghost">Doubler</button></div>`;
    if (soloTab === 'demineur') ctl.innerHTML = `<div class="row"><button data-x="facile">Facile</button><button data-x="moyen">Moyen</button><button data-x="difficile">Difficile</button></div><p class="hint">Clic : découvrir · clic droit ou appui long : drapeau</p>`;
    ctl.querySelectorAll('[data-x]').forEach((b) => {
      b.onclick = () => {
        const x = b.dataset.x;
        if (soloTab === 'pile') return act({ side: x });
        if (soloTab === 'blackjack') return act({ action: x });
        if (soloTab === 'demineur') return send({ type: 'solo', game: 'demineur', action: 'new', level: x });
        return act({});
      };
    });
  }
  const out = box.querySelector(`#soloOut-${box.id}`);
  const s = state.solo;
  if (!s || s.game !== soloTab) { out.innerHTML = ''; return; }
  const res = (s2) => (s2.win === undefined ? '' : `<p class="res ${s2.win > s2.bet ? 'up' : s2.win === s2.bet ? '' : 'down'}">${s2.win > s2.bet ? `🎉 +🪙 ${(s2.win - s2.bet).toLocaleString('fr-FR')}` : s2.win === s2.bet ? '🤝 Mise rendue' : `💀 -🪙 ${(s2.bet - s2.win).toLocaleString('fr-FR')}`} · bourse 🪙 ${Number(s2.balance ?? 0).toLocaleString('fr-FR')}</p>`);
  const fresh = s.at && s.at !== lastSoloAt;
  if (fresh) lastSoloAt = s.at;
  if (s.game === 'pile') out.innerHTML = `<div class="coin ${fresh ? 'flip' : ''}">${s.got === 'pile' ? '🪙' : '👑'}</div><p class="big">${s.got.toUpperCase()}</p>${res(s)}`;
  if (s.game === 'des') { const D = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; out.innerHTML = `<div class="dice ${fresh ? 'roll' : ''}"><div>Toi<br>${s.mine.map((n) => D[n - 1]).join(' ')}</div><div>Capitaine<br>${s.cap.map((n) => D[n - 1]).join(' ')}</div></div>${res(s)}`; }
  if (s.game === 'roue') {
    const n = s.wheel.length;
    const colors = ['#8c1c13', '#e2c992', '#1f5f5a', '#3b2412', '#f2c14e', '#e2c992', '#7c6cff', '#3b2412', '#1fb5b0', '#e2c992', '#ff9f2e', '#8c1c13'];
    const grad = s.wheel.map((m, i) => `${colors[i % colors.length]} ${(i / n) * 360}deg ${((i + 1) / n) * 360}deg`).join(', ');
    const w = box.querySelector(`#wheel-${box.id}`);
    if (w && fresh) {
      w.innerHTML = `<div class="disc" style="background:conic-gradient(${grad})">${s.wheel.map((m, i) => `<span style="transform:rotate(${(i + 0.5) * (360 / n)}deg) translateY(-92px)">×${String(m).replace('.', ',')}</span>`).join('')}</div><div class="pin">▼</div>`;
      const disc = w.querySelector('.disc');
      disc.style.transform = 'rotate(0deg)';
      requestAnimationFrame(() => { disc.style.transition = 'transform 3s cubic-bezier(.15,.8,.2,1)'; disc.style.transform = `rotate(${1440 - (s.index + 0.5) * (360 / n)}deg)`; });
      out.innerHTML = '';
      setTimeout(() => { out.innerHTML = `<p class="big">×${String(s.mult).replace('.', ',')}</p>${res(s)}`; }, 3100);
    }
  }
  if (s.game === 'machine') out.innerHTML = `<div class="reels ${fresh ? 'spin' : ''}">${s.line.map((e, i) => `<span style="animation-delay:${i * 0.25}s">${e}</span>`).join('')}</div>${res(s)}`;
  if (s.game === 'blackjack') out.innerHTML = `<div class="cards"><div>Le capitaine ${s.dealerValue ?? ''}<br>${s.dealer.map((c) => `<span class="card ${/[♥♦]/.test(c) ? 'red' : ''}">${c === '?' ? '🂠' : c}</span>`).join('')}</div><div>Toi ${s.handValue}<br>${s.hand.map((c) => `<span class="card ${/[♥♦]/.test(c) ? 'red' : ''}">${c}</span>`).join('')}</div></div>${s.done ? res(s) : ''}`;
  if (s.game === 'demineur') {
    const N = ['', '1', '2', '3', '4', '5', '6', '7', '8'];
    out.innerHTML = `<div class="mines" style="grid-template-columns:repeat(${s.size},1fr)">${s.cells.map((c, i) => `<button data-i="${i}" class="${c === null ? '' : c === -1 ? 'boom' : `open n${c}`} ${s.flags.includes(i) && c === null ? 'flag' : ''}" ${s.over ? 'disabled' : ''}>${c === -1 ? '💣' : c === null ? (s.flags.includes(i) ? '🚩' : '') : N[c]}</button>`).join('')}</div>
      <p class="big">${s.over ? (s.won ? '🎉 Gagné !' : '💥 Boum !') : `${s.mines} mines`}</p>`;
    out.querySelectorAll('[data-i]').forEach((b) => {
      b.onclick = () => send({ type: 'solo', game: 'demineur', action: 'open', i: Number(b.dataset.i) });
      b.oncontextmenu = (e) => { e.preventDefault(); send({ type: 'solo', game: 'demineur', action: 'flag', i: Number(b.dataset.i) }); };
      let t;
      b.ontouchstart = () => { t = setTimeout(() => { t = null; send({ type: 'solo', game: 'demineur', action: 'flag', i: Number(b.dataset.i) }); }, 450); };
      b.ontouchend = (e) => { if (t) clearTimeout(t); else e.preventDefault(); };
    });
  }
}
$('soloBtn').onclick = () => { const d = $('drawer'); d.hidden = !d.hidden; if (!d.hidden) { $('drawerBody').dataset.tab = ''; renderSolo($('drawerBody')); } };
$('drawerClose').onclick = () => { $('drawer').hidden = true; };

// ------------------------------------------------------------------ Départ
login().then(loop).catch((err) => fatal(err.message || 'Impossible d’ouvrir l’arcade.'));
