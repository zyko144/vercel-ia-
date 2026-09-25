// L'arcade d'AI Vercel : connexion (Activité Discord ou lien personnel), salle commune du salon,
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
const nameOf = (id) => state?.players.find((p) => p.id === id)?.name ?? 'Joueur';
const avatar = (id, cls = 'avatar') => `<img class="${cls}" src="avatar/${id}.png" alt="">`;

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
  room = params.get('room');
  guild = params.get('guild');
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
    ({ lobby: mountLobby, dessin: mountDraw, morpion: mountDuel, puissance4: mountDuel, fin: mountEnd })[kind]?.();
  }
  ({ lobby: updateLobby, dessin: updateDraw, morpion: updateDuel, puissance4: updateDuel, fin: updateEnd })[kind]?.();
  updateChat();
}
$('home').onclick = () => send({ type: 'lobby' });

// ------------------------------------------------------------------ Salle
const GAMES = [
  { id: 'dessin', emoji: '🎨', name: 'Dessine et devine', desc: 'Chacun son tour dessine un mot, les autres le devinent. Plus tu trouves vite, plus tu marques.', tag: '2 à 12', color: 'var(--rose)' },
  { id: 'morpion', emoji: '❌', name: 'Morpion', desc: 'Trois symboles alignés. Les autres regardent et prennent la place du perdant.', tag: '2 joueurs', color: 'var(--blood)' },
  { id: 'puissance4', emoji: '🔴', name: 'Puissance 4', desc: 'Quatre jetons alignés, en ligne, en colonne ou en diagonale.', tag: '2 joueurs', color: 'var(--sky)' },
];
function mountLobby() {
  $('app').innerHTML = `
    <div class="hero rise"><h1>⚓ L’arcade du navire</h1><p>Tout le monde dans ce salon joue ensemble. Choisis un jeu : les victoires rapportent des pièces d’or sur le serveur.</p></div>
    <div class="lobby">
      <div class="games">${GAMES.map((g, i) => `
        <div class="game parchment rise" style="animation-delay:${i * 80}ms">
          <span class="tag" style="background:${g.color}">${g.tag}</span>
          <span class="emoji">${g.emoji}</span><h3>${g.name}</h3><p>${g.desc}</p>
          <button data-start="${g.id}">Lancer</button>
        </div>`).join('')}</div>
      <div class="side">${sidePanels()}</div>
    </div>`;
  document.querySelectorAll('[data-start]').forEach((b) => { b.onclick = () => send({ type: 'start', game: b.dataset.start }); });
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
function updatePlayers(scores = null, g = null) {
  const list = [...state.players];
  if (scores) list.sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  $('players').innerHTML = list.map((p) => `<div class="player ${g?.drawer === p.id ? 'drawing' : ''} ${g?.guessed?.includes(p.id) ? 'found' : ''}">${avatar(p.id)}<span>${esc(p.name)}${p.id === state.host ? ' 👑' : ''}${g?.drawer === p.id ? ' ✏️' : ''}${g?.guessed?.includes(p.id) ? ' ✅' : ''}</span>${scores ? `<span class="pts">${scores[p.id] ?? 0}</span>` : ''}</div>`).join('');
}
function updateLobby() { updatePlayers(); }
let chatCount = 0;
function updateChat() {
  const box = $('chat');
  if (!box) return;
  const at = box.scrollTop + box.clientHeight >= box.scrollHeight - 10;
  box.innerHTML = state.chat.map((m) => (m.kind === 'msg' ? `<div><b>${esc(m.name)}</b> ${esc(m.text)}</div>` : `<div class="${m.kind}">${esc(m.text)}</div>`)).join('');
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
  $('app').innerHTML = `<div class="podium parchment rise"><h2>🏆 Fin de la partie</h2><ol id="podium"></ol><div class="row"><button id="again">Rejouer</button><button class="ghost" id="back">Changer de jeu</button></div></div>`;
  $('again').onclick = () => send({ type: 'start', game: g.from });
  $('back').onclick = () => send({ type: 'lobby' });
}
function updateEnd() {
  const medals = ['🥇', '🥈', '🥉'];
  $('podium').innerHTML = state.game.podium.map(([id, pts], i) => `<li>${medals[i] ?? `${i + 1}.`} ${avatar(id)} ${esc(nameOf(id))}<b>${pts} pts</b></li>`).join('');
}

// ------------------------------------------------------------------ Départ
login().then(loop).catch((err) => fatal(err.message || 'Impossible d’ouvrir l’arcade.'));
