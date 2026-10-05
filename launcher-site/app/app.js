// Appli History sur téléphone (PWA, gratuite, sans store) : amis et messages, ticket Opti Pro, accès au PC, compte.
// Même compte que le launcher : jeton gardé sur ce téléphone, toutes les données viennent du serveur History.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const tab = (k) => document.querySelector(`[data-tab="${k}"]`);
  let token = localStorage.getItem('h.token'), me = null, ticket2fa = null, cur = 'amis', chatWith = null;
  const base = fetch('../api.json').then((r) => r.json()).then((j) => j.api);
  async function call(path, body) {
    const r = await fetch(`${await base}/api/compte/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'connexion') { logout(); throw Error('Session expirée'); }
    if (!r.ok && !j.need2fa) throw Error(j.error ?? 'Serveur injoignable');
    return j;
  }
  function logout() { token = null; localStorage.removeItem('h.token'); $('app').hidden = $('tabs').hidden = true; $('login').hidden = false; }

  // Connexion (avec la double authentification si elle est activée)
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; $('loginMsg').textContent = 'Connexion…';
    try {
      const r = ticket2fa ? await call('connexion/2fa', { ticket: ticket2fa, code: f.code.value }) : await call('connexion', { email: f.email.value, motDePasse: f.password.value, appareil: `telephone-${navigator.platform}`.slice(0, 40) });
      if (r.need2fa) { ticket2fa = r.ticket; $('cred').hidden = true; $('code2fa').hidden = false; $('code2fa').required = true; f.email.required = f.password.required = false; $('loginMsg').textContent = 'Entre le code de ton appli d’authentification.'; return; }
      token = r.token; localStorage.setItem('h.token', token); start();
    } catch (err) { $('loginMsg').textContent = err.message; }
  };

  // Onglets
  $('tabs').onclick = (e) => { const b = e.target.closest('[data-go]'); if (!b) return; cur = b.dataset.go; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.dataset.tab !== cur; }); render(); };
  const render = () => ({ amis, ticket, pc, compte })[cur]?.().catch((err) => { tab(cur).innerHTML = `<div class="c"><p class="muted">${esc(err.message)}</p></div>`; });

  async function amis() {
    const r = await call('amis'), list = (r.amis ?? []).sort((a, b) => (b.playing ? 2 : b.online ? 1 : 0) - (a.playing ? 2 : a.online ? 1 : 0));
    tab('amis').innerHTML = `<div class="c"><h2>👥 Amis · ${list.filter((a) => a.online).length} en ligne</h2>${list.map((a) => `<div class="f"><span class="av">${esc(a.pseudo[0]?.toUpperCase())}<i class="${a.playing ? 'play' : a.online ? 'on' : ''}"></i></span><div><b>${esc(a.pseudo)}</b><small>${a.playing ? `🎮 ${esc(a.playing)}` : a.online ? 'En ligne' : 'Hors ligne'}</small></div><button class="g" data-chat="${esc(a.id)}" data-name="${esc(a.pseudo)}">💬</button></div>`).join('') || '<p class="muted">Ajoute des amis dans History Launcher (onglet Amis, code ami).</p>'}</div>
      ${r.demandes?.length ? `<div class="c"><h2>📨 Demandes d’amis</h2><p class="muted">${r.demandes.length} en attente : accepte-les dans le launcher.</p></div>` : ''}`;
  }
  async function ticket() {
    const s = (await call('optipro')).session;
    if (!s) { tab('ticket').innerHTML = '<div class="c"><h2>🚀 Opti Pro</h2><p class="muted">Aucun ticket en cours. Ouvre-le dans History Launcher › Optimisation › Opti Pro (ou sur Discord avec /launcher opti).</p></div>'; return; }
    const steps = s.steps ?? [];
    tab('ticket').innerHTML = `<div class="c"><h2>🚀 ${s.done ? 'Ton PC est prêt' : `Étape ${s.step + 1}/7 · ${esc(steps[s.step] ?? '')}`}</h2><div class="bar"><i style="width:${Math.round((100 * (s.done ? 7 : s.step)) / 7)}%"></i></div>
      ${s.log.slice(-8).map((m) => `<div class="msg ${m.who === 'user' ? 'me' : 'bot'}"><small>${m.who === 'user' ? 'Toi' : m.who === 'staff' ? 'Équipe History' : 'Technicien'}</small>${esc(m.text).replace(/\[\[faire:\w+\]\]/g, '⚡').replace(/\n/g, '<br>').slice(0, 1500)}</div>`).join('')}</div>
      ${s.closed ? '' : '<div class="c"><form id="tkForm"><input id="tkIn" maxlength="1500" placeholder="Écrire au technicien…"><button>Envoyer</button></form><button class="g" id="tkNext">✅ Étape faite</button></div>'}`;
    if (s.closed) return;
    $('tkForm').onsubmit = async (e) => { e.preventDefault(); const t = $('tkIn').value.trim(); if (!t) return; $('tkIn').value = ''; e.target.querySelector('button').textContent = 'Le technicien écrit…'; await call('optipro/action', { action: 'msg', text: t }).catch((err) => alert(err.message)); ticket(); };
    $('tkNext').onclick = async () => { if (confirm('Étape terminée ?')) { await call('optipro/action', { action: 'next' }).catch((err) => alert(err.message)); ticket(); } };
  }
  async function pc() {
    const url = localStorage.getItem('h.pc') ?? '';
    tab('pc').innerHTML = `<div class="c"><h2>🖥 Mon PC</h2><p class="muted">Sur le même Wi-Fi que ton PC : températures, lancer ou installer un jeu, clips, veille, second écran. Dans le launcher : Paramètres › Téléphone, active-le et recopie l’adresse ici.</p>
      <input id="pcUrl" value="${esc(url)}" placeholder="http://192.168.1.20:47800" inputmode="url"><button id="pcGo">Ouvrir mon PC</button><button class="g" id="pcTv">📺 Mode TV / second écran</button></div>`;
    const go = (tv) => { const u = $('pcUrl').value.trim(); if (!/^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))[\d.]*:\d+\/?$/.test(u)) return alert('Adresse locale attendue, ex. http://192.168.1.20:47800'); localStorage.setItem('h.pc', u); location.href = u.replace(/\/?$/, tv ? '/?tv' : '/'); };
    $('pcGo').onclick = () => go(false); $('pcTv').onclick = () => go(true);
  }
  async function compte() {
    const p = await call('premium').catch(() => ({}));
    tab('compte').innerHTML = `<div class="c"><h2>👤 ${esc(me?.pseudo ?? 'Mon compte')}</h2><p class="muted">${esc(me?.email ?? '')}</p><p>${p.ia || p.opti ? `⭐ Premium : ${[p.ia && 'History IA', p.opti && 'Opti Pro'].filter(Boolean).join(' + ')}` : 'Pas de Premium pour l’instant.'}</p>${p.code ? `<p class="muted">Ton code ami : <b>${esc(p.code)}</b></p>` : ''}</div>
      <div class="c"><button class="g" id="notifOn">🔔 Activer les notifications (appli ouverte)</button><button class="g" id="out">Se déconnecter</button></div>`;
    $('out').onclick = async () => { await call('deconnexion', {}).catch(() => {}); logout(); };
    $('notifOn').onclick = () => Notification.requestPermission().then((v) => alert(v === 'granted' ? 'Notifications activées' : 'Refusé'));
  }

  // Discussion avec un ami
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-chat]'); if (b) openChat(b.dataset.chat, b.dataset.name); });
  async function openChat(id, name) { chatWith = id; $('chatName').textContent = name; $('chat').showModal(); await loadChat(); }
  async function loadChat() {
    if (!chatWith) return;
    const r = await call(`messages?avec=${encodeURIComponent(chatWith)}`).catch(() => ({ fil: [] }));
    $('chatLog').innerHTML = (r.fil ?? []).slice(-60).map((m) => `<p class="${m.from === chatWith ? '' : 'me'}">${esc(m.text || '📎 fichier')}</p>`).join('');
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
  }
  $('chatBack').onclick = () => { chatWith = null; $('chat').close(); };
  $('chatForm').onsubmit = async (e) => { e.preventDefault(); const t = $('chatIn').value.trim(); if (!t || !chatWith) return; $('chatIn').value = ''; await call('messages', { to: chatWith, text: t, cid: crypto.randomUUID() }).catch((err) => alert(err.message)); loadChat(); };

  // Tant que l'appli est ouverte : rafraîchissement, et notification quand un ami lance un jeu
  let playing = {};
  setInterval(async () => {
    if (!token || document.hidden) return;
    if (chatWith) return loadChat();
    const r = await call('amis').catch(() => null); if (!r) return;
    for (const a of r.amis ?? []) { if (a.playing && playing[a.id] !== a.playing && playing[a.id] !== undefined && Notification.permission === 'granted') navigator.serviceWorker?.ready.then((sw) => sw.showNotification(`${a.pseudo} joue à ${a.playing}`, { icon: 'icon-192.png' })); playing[a.id] = a.playing ?? null; }
    if (cur === 'amis') amis().catch(() => {});
  }, 20_000);

  // Installation (Android : bouton ; iPhone : Partager › Sur l'écran d'accueil)
  let promptEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptEvt = e; $('install').hidden = false; });
  $('install').onclick = () => promptEvt?.prompt();
  navigator.serviceWorker?.register('sw.js').catch(() => {});

  async function start() {
    $('login').hidden = true; $('app').hidden = $('tabs').hidden = false;
    me = (await call('moi').catch(() => ({}))).compte ?? null; render();
  }
  if (token) start(); else $('login').hidden = false;
})();
