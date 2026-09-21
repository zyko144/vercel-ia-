// Table de roulette Casinho : on choisit un jeton, on clique sur le tapis pour le
// poser. La page tourne dans Discord (Activité) ou dans un navigateur (lien
// personnel donné par le bot). Tout ce qui compte — solde, tirage, gains — est
// décidé par le serveur : la page affiche l'état de la table et envoie les clics.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const inDiscord = params.has('frame_id');
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const dec = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const short = (n) => (n >= 1e6 ? `${dec(n / 1e6)}M` : n >= 1e3 ? `${dec(n / 1e3)}k` : String(n));
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Stockage du navigateur : pratique, jamais indispensable (il peut être bloqué).
const keep = (area) => ({
  get: (key) => { try { return window[area].getItem(key); } catch { return null; } },
  set: (key, value) => { try { window[area].setItem(key, value); } catch { /* sans stockage, tant pis */ } },
});
const local = keep('localStorage');
const tab = keep('sessionStorage');

// ------------------------------------------------------------------ Les règles
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const pocketColor = (n) => (n === 0 ? '#1f8a55' : RED.has(n) ? '#c21f43' : '#1a1016');
const traits = (n) => (n === 0 ? 'ZÉRO' : [RED.has(n) ? 'ROUGE' : 'NOIR', n % 2 ? 'IMPAIR' : 'PAIR', n <= 18 ? '1 – 18' : '19 – 36'].join(' · '));
const CHANCES = ['manque', 'pair', 'rouge', 'noir', 'impair', 'passe'];
const RULES = {
  rouge: ['Rouge', 2, 18], noir: ['Noir', 2, 18], pair: ['Pair', 2, 18], impair: ['Impair', 2, 18],
  manque: ['Manque (1 à 18)', 2, 18], passe: ['Passe (19 à 36)', 2, 18],
  douzaine1: ['1re douzaine (1 à 12)', 3, 12], douzaine2: ['2e douzaine (13 à 24)', 3, 12], douzaine3: ['3e douzaine (25 à 36)', 3, 12],
  colonne1: ['1re colonne (1, 4, 7… 34)', 3, 12], colonne2: ['2e colonne (2, 5, 8… 35)', 3, 12], colonne3: ['3e colonne (3, 6, 9… 36)', 3, 12],
};
const ruleOf = (spot) => (spot.startsWith('plein-') ? [`Numéro ${spot.slice(6)}`, 36, 1] : RULES[spot]);
const ALL_SPOTS = [...Array.from({ length: 37 }, (_, n) => `plein-${n}`), ...Object.keys(RULES)];

const CHIPS = [
  [10, '#ece7e2', '#3b2a33'], [20, '#f4c542', '#3b2a10'], [50, '#ff8a3d', '#fff'], [100, '#2a262c', '#fff'],
  [500, '#8e44ad', '#fff'], [1_000, '#d11f3c', '#fff'], [5_000, '#2f6fe0', '#fff'], [10_000, '#1f9a55', '#fff'],
  [50_000, '#8a5a2b', '#fff'], [100_000, '#ff3fa6', '#fff'], [500_000, '#18b6c4', '#fff'], [1_000_000, '#d4af37', '#2a1a00'],
].map(([value, color, ink]) => ({ value, color, ink }));
const chipStyle = (value) => CHIPS.find((c) => c.value === value) ?? CHIPS[5];

// ------------------------------------------------------------------ L'état
let session = null;
let room = null;
let state = null;
let chip = Number(local.get('roulette:jeton')) || 1_000;
let inflight = 0;
let clockOffset = 0;
let animatedRound = null;
let wheelDone = false;
let hideTimer = null;
let portrait = null;

const now = () => Date.now() + clockOffset;
const me = () => state?.players.find((p) => p.me) ?? null;
const available = () => (state ? (state.phase === 'mises' ? state.me.balance - state.me.onTable : state.me.balance) : 0);

// ------------------------------------------------------------------ Le serveur
class SessionError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/roulette/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await response.json(); } catch { /* réponse vide */ }
  if (response.status === 401) throw new SessionError(data.error || 'Session expirée : rouvre la table depuis Discord.');
  return { ok: response.ok, data };
}

/** Dans Discord : l'Activité demande qui joue, le serveur le vérifie auprès de Discord. */
async function loginDiscord() {
  setStatus('Connexion à Discord…');
  const { data: cfg } = await api('config');
  if (!cfg.clientId) throw new Error('Table pas encore configurée.');
  const { DiscordSDK } = await import('/roulette/sdk.js');
  const sdk = new DiscordSDK(cfg.clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: cfg.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
  const { ok, data } = await api('discord', { method: 'POST', body: { code } });
  if (!ok) throw new Error(data.error || 'Connexion refusée.');
  await sdk.commands.authenticate({ access_token: data.access_token });
  session = data.session;
  room = sdk.channelId;
  if (!room) throw new Error('Ouvre la table depuis un salon du serveur.');
}

/** Hors de Discord : le lien personnel porte la session (après le #, jamais envoyé au serveur). */
function loginLink() {
  room = params.get('room');
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('s');
  if (fromLink) {
    tab.set(`roulette:${room}`, fromLink);
    history.replaceState(null, '', location.pathname + location.search); // le jeton ne reste pas dans la barre d'adresse
  }
  session = fromLink || tab.get(`roulette:${room}`);
  if (!room || !session) throw new SessionError('Ouvre la table avec le bouton du casino dans Discord (`/casino` → Roulette).');
}

async function send(body) {
  inflight += 1;
  try {
    const { ok, data } = await api('action', { method: 'POST', body: { room, ...body } });
    if (!ok && data.error) toast(data.error);
    if (data.state) apply(data.state);
  } catch (err) {
    if (err instanceof SessionError) return fatal(err.message);
    toast('Connexion perdue. Réessaie.');
  } finally {
    inflight -= 1;
  }
}

async function poll() {
  try {
    if (!inflight) {
      const { ok, data } = await api(`state?room=${encodeURIComponent(room)}`);
      if (ok && !inflight) apply(data);
      else if (!ok) setStatus(data.error || 'Table indisponible.', true);
    }
  } catch (err) {
    if (err instanceof SessionError) return fatal(err.message);
    setStatus('Connexion perdue… nouvel essai', true);
  }
  setTimeout(poll, document.hidden ? 2500 : 900);
}

function apply(next) {
  state = next;
  clockOffset = next.now - Date.now();
  if (next.spin && next.round !== animatedRound && (next.phase === 'tirage' || next.phase === 'resultats')) {
    animatedRound = next.round;
    spinWheel(next.spin);
  }
  if (next.phase === 'mises') hideOverlay();
  render();
}

// ------------------------------------------------------------------ Le tapis
// Unités du tapis horizontal : le zéro, 12 colonnes de numéros, la colonne « 2 à 1 »,
// puis les douzaines et les chances sur deux bandes plus basses.
function logicalBox(spot) {
  if (spot === 'plein-0') return { x: 0, y: 0, w: 1, h: 3 };
  if (spot.startsWith('plein-')) {
    const n = Number(spot.slice(6));
    return { x: 1 + Math.floor((n - 1) / 3), y: 2 - ((n - 1) % 3), w: 1, h: 1 };
  }
  if (spot.startsWith('colonne')) return { x: 13, y: 3 - Number(spot.slice(7)), w: 1, h: 1 };
  if (spot.startsWith('douzaine')) return { x: 1 + (Number(spot.slice(8)) - 1) * 4, y: 3, w: 4, h: 0.8 };
  const i = CHANCES.indexOf(spot);
  return { x: 1 + i * 2, y: 3.8, w: 2, h: 0.8 };
}

/** À plat sur un écran large ; debout (le zéro en haut) sur un téléphone. */
function geometry(vertical) {
  if (!vertical) {
    const U = 64;
    const V = 66;
    return { width: 14 * U, height: 4.6 * V, vertical, box: (spot) => { const b = logicalBox(spot); return { x: b.x * U, y: b.y * V, w: b.w * U, h: b.h * V }; } };
  }
  const U = 70;
  const V = 44;
  return { width: 4.6 * U, height: 14 * V, vertical, box: (spot) => { const b = logicalBox(spot); return { x: (4.6 - b.y - b.h) * U, y: b.x * V, w: b.h * U, h: b.w * V }; } };
}

function choosePortrait() {
  const wrap = $('board').parentElement;
  const w = wrap.clientWidth || 1;
  const h = wrap.clientHeight || 1;
  const flat = Math.min(w / 896, h / 304);
  const upright = Math.min(w / 322, h / 616);
  return upright > flat * 1.15;
}

const isBand = (spot) => spot.startsWith('douzaine') || CHANCES.includes(spot);

/** Où poser la pile, et où pousser le libellé quand une pile est là. */
function anchors(spot, b, vertical) {
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (spot.startsWith('plein-') && spot !== 'plein-0') return { chip: { x: b.x + b.w * 0.58, y: b.y + b.h * 0.6 }, label: { x: b.x + b.w * 0.27, y: b.y + b.h * 0.28 } };
  if (spot === 'plein-0' || spot.startsWith('colonne')) {
    return vertical || spot.startsWith('colonne')
      ? { chip: { x: vertical ? b.x + b.w * 0.7 : c.x, y: vertical ? c.y : b.y + b.h * 0.62 }, label: { x: vertical ? b.x + b.w * 0.3 : c.x, y: vertical ? c.y : b.y + b.h * 0.24 } }
      : { chip: { x: c.x, y: b.y + b.h - 42 }, label: { x: c.x, y: b.y + 44 } };
  }
  // Douzaines et chances : la pile d'un côté, le libellé de l'autre.
  return vertical
    ? { chip: { x: c.x, y: b.y + b.h - 30 }, label: { x: c.x, y: b.y + (b.h - 44) / 2 } }
    : { chip: { x: b.x + b.w - 32, y: c.y }, label: { x: b.x + (b.w - 50) / 2, y: c.y } };
}

function labelSvg(spot, at, vertical, busy) {
  const rotate = vertical && isBand(spot) ? ` transform="rotate(-90 ${at.x} ${at.y})"` : '';
  const text = (content, size) =>
    `<text x="${at.x}" y="${at.y}" font-size="${size}" fill="#fff" text-anchor="middle" dominant-baseline="central"${rotate}>${content}</text>`;
  if (spot.startsWith('plein-')) return text(spot.slice(6), busy ? 17 : vertical ? 21 : 27);
  if (spot.startsWith('colonne')) return text('2:1', busy ? 13 : 17);
  if (spot === 'rouge' || spot === 'noir') {
    const s = busy ? 0.7 : 1;
    const [w, h] = vertical ? [14 * s, 24 * s] : [24 * s, 14 * s];
    return `<polygon points="${at.x},${at.y - h} ${at.x + w},${at.y} ${at.x},${at.y + h} ${at.x - w},${at.y}" fill="${spot === 'rouge' ? '#c21f43' : '#141014'}" stroke="#e6c47a" stroke-width="1.5"/>`;
  }
  const words = { manque: '1–18', passe: '19–36', pair: 'PAIR', impair: 'IMPAIR', douzaine1: '1–12', douzaine2: '13–24', douzaine3: '25–36' };
  return text(words[spot], busy ? 15 : 19);
}

function chipSvg(x, y, style, r, text, { faded = false, glow = false, layers = [style] } = {}) {
  const shown = layers.slice(-5);
  const inner = r - 3.2;
  const dash = ((2 * Math.PI * inner) / 12).toFixed(2);
  let out = `<g opacity="${faded ? 0.3 : 1}"><circle cx="${x + 1.5}" cy="${y + 4}" r="${r}" fill="rgba(0,0,0,0.45)"/>`;
  shown.forEach((layer, i) => {
    const cy = y + (shown.length - 1 - i) * 3;
    out += `<circle cx="${x}" cy="${cy}" r="${r}" fill="${layer.color}" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
      <circle cx="${x}" cy="${cy}" r="${inner}" fill="none" stroke="#fff" stroke-width="3.6" stroke-dasharray="${dash}" opacity="0.9"/>
      <circle cx="${x}" cy="${cy}" r="${r - 7}" fill="${layer.color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.8"/>`;
  });
  if (glow) out += `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="#49e08c" stroke-width="3.5"/>`;
  const top = shown.at(-1);
  out += `<text x="${x}" y="${y + 0.5}" font-size="${text.length > 3 ? 9.5 : 11.5}" fill="${top.ink}" text-anchor="middle" dominant-baseline="central">${text}</text></g>`;
  return out;
}

const OFFSETS = [[0, 0], [15, -5], [-15, 5], [8, 8], [-8, -8], [21, 3], [-21, -3], [0, -9], [12, 9], [-12, -9]];

function renderBoard() {
  if (!state) return;
  const vertical = choosePortrait();
  portrait = vertical;
  const g = geometry(vertical);
  const svg = $('board');
  svg.setAttribute('viewBox', `-10 -10 ${g.width + 20} ${g.height + 20}`);
  svg.classList.toggle('closed', state.phase !== 'mises');

  // Qui a des jetons où : les autres d'abord, les miens par-dessus.
  const bySpot = new Map();
  const players = [...state.players].sort((a, b) => Number(a.me) - Number(b.me));
  for (const player of players) {
    for (const [spot, values] of player.bets) {
      if (!values.length) continue;
      if (!bySpot.has(spot)) bySpot.set(spot, []);
      bySpot.get(spot).push({ player, values });
    }
  }
  const revealed = state.phase === 'resultats' && state.spin;
  const winning = new Set(revealed ? state.spin.winning : []);
  const pocketSpot = revealed ? `plein-${state.spin.pocket}` : null;

  let out = `<rect x="-10" y="-10" width="${g.width + 20}" height="${g.height + 20}" rx="16" fill="#0f3b2b" stroke="#e6c47a" stroke-width="3"/>`;
  let chipsLayer = '';
  const r = vertical ? 14 : 17;
  for (const spot of ALL_SPOTS) {
    const b = g.box(spot);
    const busy = bySpot.has(spot);
    const at = anchors(spot, b, vertical);
    const fill = spot.startsWith('plein-') ? pocketColor(Number(spot.slice(6))) : 'transparent';
    const lit = winning.has(spot)
      ? `<rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="4" fill="#ffe27a" fill-opacity="${spot === pocketSpot ? 0.4 : 0.16}" stroke="#ffe27a" stroke-width="${spot === pocketSpot ? 5 : 2.5}"/>`
      : '';
    out += `<g class="cell" data-spot="${spot}">
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill}" stroke="#e6c47a" stroke-width="1.4"/>
      ${lit}${labelSvg(spot, busy ? at.label : { x: b.x + b.w / 2, y: b.y + b.h / 2 }, vertical, busy)}
      <rect class="hit" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/>
    </g>`;
    if (!busy) continue;
    bySpot.get(spot).forEach(({ player, values }, i) => {
      const [dx, dy] = OFFSETS[i % OFFSETS.length];
      const layers = values.map((value) => (player.me ? chipStyle(value) : { color: player.color, ink: player.ink }));
      const amount = values.reduce((a, v) => a + v, 0);
      chipsLayer += chipSvg(at.chip.x + dx * (vertical ? 0.8 : 1), at.chip.y + dy * (vertical ? 0.6 : 1), layers.at(-1), r, short(amount), {
        layers,
        faded: revealed && !winning.has(spot),
        glow: revealed && winning.has(spot),
      });
    });
  }
  svg.innerHTML = `${out}<g pointer-events="none" font-family="'Noto Sans', sans-serif" font-weight="700">${chipsLayer}</g>`;
}

// ------------------------------------------------------------------ Le reste de l'écran
function setStatus(text, hot = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('hot', hot);
}

function statusText() {
  if (!state) return;
  const mine = state.me;
  if (state.phase === 'mises') {
    if (state.closesAt) return setStatus(`⏳ Dernier appel : la bille part dans ${Math.max(0, Math.ceil((state.closesAt - now()) / 1000))} s`, true);
    if (me()?.ready) return setStatus('✅ Prêt ! On attend que les autres lancent aussi…');
    if (mine.onTable) return setStatus(`Faites vos jeux · ${fmt(mine.onTable)} sur le tapis — appuie sur « Lancer » quand tu es prêt`);
    return setStatus('Faites vos jeux : choisis un jeton, puis clique sur le tapis');
  }
  if (state.phase === 'tirage' || !wheelDone) return setStatus('🎡 Rien ne va plus !', true);
  const result = me()?.result;
  const gain = result && !result.dropped ? ` · ${result.net > 0 ? `tu gagnes +${fmt(result.net)}` : result.net < 0 ? `tu perds ${fmt(-result.net)}` : 'tu récupères ta mise'}` : '';
  return setStatus(`La bille est sur le ${state.spin.pocket} (${traits(state.spin.pocket).toLowerCase()})${gain}`);
}

function renderHeader() {
  $('balance').textContent = fmt(available());
  $('ontable').textContent = fmt(state.me.onTable);
  $('history').innerHTML = state.history
    .map((n) => `<b style="background:${pocketColor(n)}">${n}</b>`)
    .join('');
}

function renderPlayers() {
  const revealed = state.phase === 'resultats' && wheelDone;
  const rows = state.players
    .filter((p) => p.total || p.result || p.me)
    .map((p) => {
      let right = p.total ? fmt(p.total) : '—';
      let tone = '';
      if (revealed && p.result && !p.result.dropped) {
        right = `${p.result.net > 0 ? '+' : ''}${fmt(p.result.net)}`;
        tone = p.result.net > 0 ? 'win' : p.result.net < 0 ? 'lose' : '';
      }
      return `<div class="player${p.me ? ' me' : ''}">
        <i style="background:${p.color}"></i>
        <span>${esc(p.name)}${p.me ? ' (toi)' : ''}${p.ready && state.phase === 'mises' ? ' <b class="ready">✓</b>' : ''}</span>
        <em class="${tone}">${right}</em></div>`;
    });
  $('players').innerHTML = rows.join('') || '<div class="empty">Personne à la table</div>';
}

function renderControls() {
  const open = state.phase === 'mises';
  const mine = me();
  const has = Boolean(state.me.onTable);
  $('undo').disabled = !open || !has;
  $('clear').disabled = !open || !has;
  $('double').disabled = !open || !has;
  $('rebet').disabled = !open || !state.me.canRebet;
  const spin = $('spin');
  spin.disabled = !open || !has || Boolean(mine?.ready);
  spin.classList.toggle('ready', Boolean(mine?.ready) && open);
  spin.textContent = mine?.ready && open ? 'Prêt ✓' : 'Lancer';
  const left = available();
  for (const button of $('rack').children) {
    const value = Number(button.dataset.value);
    button.classList.toggle('on', value === chip);
    button.disabled = open && value > left;
  }
}

function render() {
  if (!state) return;
  renderHeader();
  renderBoard();
  renderPlayers();
  renderControls();
  statusText();
  renderResult();
}

function buildRack() {
  $('rack').innerHTML = CHIPS.map(
    ({ value, color, ink }) =>
      `<button type="button" class="chip" role="radio" data-value="${value}" style="--c:${color};--ink:${ink}" aria-label="Jeton de ${fmt(value)}"><span>${short(value)}</span></button>`,
  ).join('');
  $('rack').addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button || button.disabled) return;
    chip = Number(button.dataset.value);
    local.set('roulette:jeton', String(chip));
    if (state) renderControls();
  });
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function fatal(text) {
  $('app').innerHTML = `<div class="fatal"><div style="font-size:40px">🎰</div><p>${esc(text)}</p></div>`;
  $('overlay').hidden = true;
}

// ------------------------------------------------------------------ Les clics sur le tapis
function place(spot) {
  if (state?.phase !== 'mises') return;
  const mine = me();
  if (chip > available()) return toast(`Il te reste ${fmt(available())} jetons : prends un plus petit jeton.`);
  // On montre le jeton tout de suite ; le serveur confirme (ou refuse) juste après.
  if (mine) {
    const entry = mine.bets.find(([key]) => key === spot);
    if (entry) entry[1].push(chip);
    else mine.bets.push([spot, [chip]]);
    mine.total += chip;
    mine.ready = false;
    state.me.onTable += chip;
    render();
  }
  send({ action: 'poser', spot, value: chip });
}

function remove(spot) {
  if (state?.phase !== 'mises') return;
  send({ action: 'retirer', spot });
}

function bindBoard() {
  const board = $('board');
  const spotAt = (event) => event.target.closest?.('[data-spot]')?.dataset.spot ?? null;
  let pressTimer = null;
  let longPress = false;
  board.addEventListener('click', (event) => {
    if (longPress) { longPress = false; return; }
    const spot = spotAt(event);
    if (spot) place(spot);
  });
  board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const spot = spotAt(event);
    if (spot) remove(spot);
  });
  // Sur téléphone : appui long pour retirer un jeton.
  board.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const spot = spotAt(event);
    if (!spot) return;
    pressTimer = setTimeout(() => { longPress = true; remove(spot); }, 550);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) board.addEventListener(type, () => clearTimeout(pressTimer));
  board.addEventListener('pointerover', (event) => {
    const spot = spotAt(event);
    if (!spot) return;
    const [label, pays, count] = ruleOf(spot);
    $('hint').textContent = `${label} · paie ×${pays} · ${count} numéro${count > 1 ? 's' : ''} sur 37`;
  });
  board.addEventListener('pointerleave', () => {
    $('hint').textContent = 'Choisis un jeton en bas, puis clique sur le tapis pour le poser · clic droit (ou appui long) pour le retirer';
  });
}

function bindActions() {
  $('undo').addEventListener('click', () => send({ action: 'annuler' }));
  $('clear').addEventListener('click', () => send({ action: 'effacer' }));
  $('double').addEventListener('click', () => send({ action: 'doubler' }));
  $('rebet').addEventListener('click', () => send({ action: 'remettre' }));
  $('spin').addEventListener('click', () => send({ action: 'lancer' }));
}

// ------------------------------------------------------------------ La roue
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const STEP = 360 / ORDER.length;
const angleFor = (n) => -(ORDER.indexOf(n) * STEP + STEP / 2);
const polar = (deg, radius) => [radius * Math.cos(((deg - 90) * Math.PI) / 180), radius * Math.sin(((deg - 90) * Math.PI) / 180)];

function buildWheel() {
  const R = 100;
  const inner = 62;
  const sectors = ORDER.map((n, i) => {
    const [x0, y0] = polar(i * STEP, R);
    const [x1, y1] = polar((i + 1) * STEP, R);
    const [x2, y2] = polar((i + 1) * STEP, inner);
    const [x3, y3] = polar(i * STEP, inner);
    const [tx, ty] = polar((i + 0.5) * STEP, 86);
    return `<path d="M${x3} ${y3} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 0 0 ${x3} ${y3} Z" fill="${pocketColor(n)}" stroke="#d9b56a" stroke-width="0.6"/>
      <text x="${tx}" y="${ty}" font-size="8" fill="#fff" text-anchor="middle" dominant-baseline="central" transform="rotate(${(i + 0.5) * STEP} ${tx} ${ty})">${n}</text>`;
  }).join('');
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = polar(i * 45, inner * 0.9);
    return `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="#e6c47a" stroke-width="3" stroke-linecap="round"/>`;
  }).join('');
  $('wheel').innerHTML = `
    <defs><radialGradient id="cone" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="#8a5a24"/><stop offset="100%" stop-color="#3b220b"/></radialGradient>
      <radialGradient id="ballShade" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#b9b3ac"/></radialGradient></defs>
    <circle r="110" fill="#3a1f0a" stroke="#d9b56a" stroke-width="3"/>
    <g id="wheel-rot" font-family="'Noto Sans', sans-serif" font-weight="700">${sectors}
      <circle r="${inner}" fill="url(#cone)" stroke="#d9b56a" stroke-width="1.5"/>${spokes}<circle r="10" fill="#e6c47a"/></g>
    <circle id="ball" r="5.5" fill="url(#ballShade)"/>`;
}

function hideOverlay() {
  clearTimeout(hideTimer);
  $('overlay').hidden = true;
}

/** La roue tourne et s'arrête sur le numéro tiré par le serveur (on rejoint l'animation en cours si besoin). */
function spinWheel(spin) {
  const overlay = $('overlay');
  overlay.hidden = false;
  wheelDone = false;
  $('result').innerHTML = '';
  clearTimeout(hideTimer);
  const duration = spin.duration;
  const start = performance.now() - Math.min(spin.elapsed ?? 0, duration);
  const end = angleFor(spin.pocket);
  const from = end + 360 * 3; // la roue tourne dans un sens…
  const ballFrom = -360 * 5; // … la bille dans l'autre
  const rotor = $('wheel-rot');
  const ball = $('ball');
  const frame = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const e = 1 - (1 - p) ** 3;
    rotor.setAttribute('transform', `rotate(${from + (end - from) * e})`);
    // La bille roule sur le bord, puis tombe dans la case en rebondissant un peu.
    const depth = p < 0.72 ? 94 : p < 0.88 ? 94 - 20 * ((p - 0.72) / 0.16) + Math.sin(((p - 0.72) / 0.16) * Math.PI * 2) * 4 : 74;
    const [bx, by] = polar(ballFrom * (1 - e), depth);
    ball.setAttribute('cx', bx.toFixed(2));
    ball.setAttribute('cy', by.toFixed(2));
    if (p < 1) return requestAnimationFrame(frame);
    wheelDone = true;
    render();
    hideTimer = setTimeout(hideOverlay, 2500);
  };
  requestAnimationFrame(frame);
}

function renderResult() {
  if ($('overlay').hidden || !wheelDone || !state.spin) return;
  const n = state.spin.pocket;
  const result = me()?.result;
  let gain = '';
  if (result && !result.dropped && state.phase === 'resultats') {
    gain = result.net > 0
      ? `<div class="gain win">+${fmt(result.net)} jetons</div>`
      : result.net < 0 ? `<div class="gain lose">−${fmt(-result.net)} jetons</div>` : '<div class="gain">Mise récupérée</div>';
  } else if (result?.dropped) gain = '<div class="gain lose">Solde insuffisant au lancement : tes jetons ne jouaient pas.</div>';
  $('result').innerHTML = `<div class="number" style="color:${n === 0 ? '#49e08c' : RED.has(n) ? '#ff5a77' : '#fff'}">${n}</div><div>${traits(n)}</div>${gain}`;
}

// ------------------------------------------------------------------ Démarrage
async function boot() {
  buildRack();
  buildWheel();
  bindBoard();
  bindActions();
  window.addEventListener('resize', () => {
    if (state && choosePortrait() !== portrait) renderBoard();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state) statusText(); });
  try {
    if (inDiscord) await loginDiscord();
    else loginLink();
  } catch (err) {
    return fatal(err.message);
  }
  setInterval(() => { if (state) statusText(); }, 250);
  poll();
}

boot();
