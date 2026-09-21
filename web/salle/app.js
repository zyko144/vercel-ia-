// La salle de jeux Casinho : on s'y connecte (Activité Discord ou lien personnel),
// on choisit un jeu dans le hall, et chaque jeu (games/<jeu>.js) se joue en cliquant.
// Tout ce qui compte — solde, tirages, gains — est décidé par le serveur : la page
// affiche et envoie les clics.
import { $, esc, fmt, saved, toast } from './kit.js';

const params = new URLSearchParams(location.search);
const inDiscord = params.has('frame_id');
const tab = {
  get: (key) => { try { return sessionStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* sans stockage */ } },
};

let session = null;
let room = null;
let catalog = [];
let lobby = null;
let current = null; // { id, module, cleanup: [] }
let clockOffset = 0;

// ------------------------------------------------------------------ Le serveur
class SessionError extends Error {}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/salle/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await response.json(); } catch { /* réponse vide */ }
  if (response.status === 401) throw new SessionError(data.error || 'Session expirée : rouvre la salle depuis Discord.');
  if (data?.now) clockOffset = data.now - Date.now();
  if (data?.state?.now) clockOffset = data.state.now - Date.now();
  return { ok: response.ok, data };
}

function fatal(text) {
  $('app').innerHTML = `<div class="fatal"><div style="font-size:42px">🎰</div><p>${esc(text)}</p></div>`;
}

/** Dans Discord : l'Activité demande qui joue, le serveur le vérifie auprès de Discord. */
async function loginDiscord(cfg) {
  const { DiscordSDK } = await import('/salle/sdk.js');
  const sdk = new DiscordSDK(cfg.clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: cfg.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
  const { ok, data } = await request('discord', { method: 'POST', body: { code } });
  if (!ok) throw new Error(data.error || 'Connexion refusée.');
  await sdk.commands.authenticate({ access_token: data.access_token });
  session = data.session;
  room = sdk.channelId;
  if (!room) throw new Error('Ouvre la salle depuis un salon du serveur.');
}

/** Hors de Discord : le lien personnel porte la session (après le #, jamais envoyé au serveur). */
function loginLink() {
  room = params.get('room');
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('s');
  if (fromLink) {
    tab.set(`salle:${room}`, fromLink);
    history.replaceState(null, '', location.pathname + location.search); // le jeton ne reste pas dans la barre d'adresse
  }
  session = fromLink || tab.get(`salle:${room}`);
  if (!room || !session) throw new SessionError('Ouvre la salle avec le bouton du casino dans Discord (`/casino` → 🎰 Salle de jeux).');
}

// ------------------------------------------------------------------ Ce que reçoit chaque jeu
function contextFor(id) {
  const cleanup = [];
  const ctx = {
    room,
    get me() { return lobby?.me; },
    now: () => Date.now() + clockOffset,
    /** L'état du jeu, vu par ce joueur. */
    async get() {
      const { ok, data } = await request(`${id}?room=${encodeURIComponent(room)}`);
      if (!ok) throw new Error(data.error || 'Jeu indisponible.');
      if (data.me?.balance !== undefined) ctx.balance(data.me.balance);
      return data;
    },
    /** Une action : renvoie la réponse, et le nouvel état du jeu (data.state). */
    async act(body) {
      try {
        const { ok, data } = await request(id, { method: 'POST', body: { room, ...body } });
        if (!ok && data.error) toast(data.error);
        if (data.state?.me?.balance !== undefined) ctx.balance(data.state.me.balance);
        return { ok, ...data };
      } catch (err) {
        if (err instanceof SessionError) fatal(err.message);
        else toast('Connexion perdue. Réessaie.');
        return { ok: false };
      }
    },
    /** Le solde affiché en haut. */
    balance(value) {
      $('balance').textContent = fmt(value);
      if (lobby) lobby.me.balance = value;
    },
    /** Répète `fn` toutes les `ms` tant qu'on reste dans ce jeu. */
    every(ms, fn) {
      let stopped = false;
      const loop = async () => {
        if (stopped) return;
        try { await fn(); } catch (err) { if (err instanceof SessionError) return fatal(err.message); }
        if (!stopped) timer = setTimeout(loop, typeof ms === 'function' ? ms() : ms);
      };
      let timer = setTimeout(loop, 0);
      cleanup.push(() => { stopped = true; clearTimeout(timer); });
    },
    later(ms, fn) {
      const timer = setTimeout(fn, ms);
      cleanup.push(() => clearTimeout(timer));
    },
    onLeave(fn) { cleanup.push(fn); },
    open: (game) => openGame(game),
  };
  return { ctx, cleanup };
}

// ------------------------------------------------------------------ Le hall
function renderLobby() {
  const tables = lobby?.tables ?? {};
  $('view').innerHTML = `
    <section class="lobby">
      <div class="lobby-head">
        <h1>Salle de jeux</h1>
        <p>Choisis ta table. Tu joues en cliquant : tes jetons, les cartes, les cases, la fusée…
        ${lobby?.present > 1 ? `<br><b>${lobby.present} joueurs</b> sont dans la salle en ce moment.` : ''}</p>
      </div>
      <div class="games">
        ${catalog.map((game) => `
          <button type="button" class="game-card" data-game="${game.id}">
            <span class="game-emoji">${game.emoji}</span>
            <span class="game-title">${esc(game.title)}</span>
            <span class="game-blurb">${esc(game.blurb)}</span>
            ${game.shared ? `<span class="badge">👥 ${tables[game.id] ? `${tables[game.id]} à la table` : 'Tout le salon'}</span>` : ''}
          </button>`).join('')}
      </div>
      <p class="fine">Jetons fictifs : ni achat, ni dépôt, ni retrait, aucun argent réel.</p>
    </section>`;
  $('view').querySelector('.games').addEventListener('click', (event) => {
    const card = event.target.closest('[data-game]');
    if (card) openGame(card.dataset.game);
  });
}

function showLobby() {
  leaveGame();
  $('back').hidden = true;
  $('where').textContent = 'Salle de jeux';
  document.body.dataset.game = '';
  renderLobby();
}

function leaveGame() {
  if (!current) return;
  for (const fn of current.cleanup) { try { fn(); } catch { /* rien à ranger */ } }
  current = null;
}

async function openGame(id) {
  const info = catalog.find((game) => game.id === id);
  if (!info) return showLobby();
  leaveGame();
  saved.set('salle:dernier', id);
  $('back').hidden = false;
  $('where').textContent = `${info.emoji} ${info.title}`;
  document.body.dataset.game = id;
  $('view').innerHTML = '<div class="loading">Ouverture de la table…</div>';
  const { ctx, cleanup } = contextFor(id);
  current = { id, cleanup };
  try {
    const module = await import(`/salle/games/${id}.js`);
    if (current?.id !== id) return;
    $('view').innerHTML = '';
    await module.mount($('view'), ctx);
  } catch (err) {
    if (err instanceof SessionError) return fatal(err.message);
    console.error(err);
    $('view').innerHTML = `<div class="loading">Impossible d’ouvrir ce jeu (${esc(err.message)}).</div>`;
  }
}

// ------------------------------------------------------------------ Partout dans la salle
async function refreshLobby() {
  const { ok, data } = await request(`salle?room=${encodeURIComponent(room)}`);
  if (!ok) return;
  lobby = data;
  $('balance').textContent = fmt(data.me.balance);
  $('gift').hidden = !data.daily?.available;
  if (!current) renderLobby();
  showDuelInvite(data.duels?.[0]);
}

let invited = null;
function showDuelInvite(duel) {
  const modal = $('modal');
  if (!duel) {
    if (invited) modal.hidden = true;
    invited = null;
    return;
  }
  if (invited === duel.id) return;
  invited = duel.id;
  modal.innerHTML = `<div class="modal-box">
    <div class="modal-emoji">⚔️</div>
    <p><b>${esc(duel.from)}</b> te défie en duel :<br><b>${fmt(duel.bet)} jetons</b> à pile ou face. Le gagnant prend tout.</p>
    <div class="modal-actions"><button type="button" class="primary" data-do="accepter">Accepter</button><button type="button" data-do="refuser">Refuser</button></div></div>`;
  modal.hidden = false;
  modal.onclick = async (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action) return;
    modal.hidden = true;
    const { ok, data } = await request('duel', { method: 'POST', body: { room, action, id: duel.id } });
    if (!ok) toast(data.error || 'Défi indisponible.');
    if (ok && action === 'accepter') openGame('duel');
    refreshLobby();
  };
}

async function claimGift() {
  const { ok, data } = await request('jetons-du-jour', { method: 'POST', body: { room } });
  if (ok) {
    toast(`🎁 +${fmt(data.amount)} jetons ! Série de ${data.streak} jour${data.streak > 1 ? 's' : ''}.`, 'good');
    $('balance').textContent = fmt(data.balance);
  } else toast(data.error || 'Indisponible.');
  refreshLobby();
}

// ------------------------------------------------------------------ Démarrage
async function boot() {
  try {
    const { data: cfg } = await request('config');
    catalog = cfg.games ?? [];
    if (inDiscord) {
      if (!cfg.activity) throw new Error('La salle n’est pas encore activée dans Discord. Utilise le bouton « Dans le navigateur ».');
      await loginDiscord(cfg);
    } else loginLink();
    $('back').addEventListener('click', showLobby);
    $('gift').addEventListener('click', claimGift);
    await refreshLobby();
    setInterval(() => refreshLobby().catch((err) => { if (err instanceof SessionError) fatal(err.message); }), 4000);
    const start = lobby?.start || params.get('jeu');
    if (start && catalog.some((game) => game.id === start)) openGame(start);
    else showLobby();
  } catch (err) {
    fatal(err.message);
  }
}

boot();
