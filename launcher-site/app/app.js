// Appli History (téléphone, gratuite, sans store) : un scan du QR du launcher connecte le compte ET le PC.
// Le PC est piloté à travers le serveur History (marche en Wi-Fi comme en 4G) : jeux, températures, veille, extinction.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const tab = (k) => document.querySelector(`[data-tab="${k}"]`);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* navigation privée */ } } };
  let token = store.get('h.token'), pcId = store.get('h.pc'), me = null, cur = 'pc', chatWith = null, ticket2fa = null, pcs = [];
  const base = fetch('../api.json').then((r) => r.json()).then((j) => j.api);
  async function call(path, body) {
    const r = await fetch(`${await base}/api/compte/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('connexion')) { logout(); throw Error('Session expirée : rescanne le QR.'); }
    if (!r.ok && !j.need2fa) throw Error(j.error ?? 'Serveur injoignable');
    return j;
  }
  let toastT = 0;
  const toast = (t) => { $('toast').textContent = t; $('toast').hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, 2800); navigator.vibrate?.(30); };
  function logout() { token = null; store.set('h.token', null); $('app').hidden = $('tabs').hidden = $('pcPill').hidden = true; $('welcome').hidden = false; }

  // ---------- Connexion : QR du launcher (direct) ou e-mail ----------
  async function fromQr() {
    const code = new URLSearchParams(location.hash.slice(1)).get('qr'); if (!code) return false;
    history.replaceState(null, '', location.pathname);
    try { const r = await call('lien/qr/utiliser', { code }); token = r.token; pcId = r.pc || null; store.set('h.token', token); store.set('h.pc', pcId); toast('✅ Connecté à ton PC'); return true; }
    catch (err) { toast(err.message); return false; }
  }
  $('useMail').onclick = () => { $('loginForm').hidden = false; $('useMail').hidden = true; };
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; $('loginMsg').textContent = 'Connexion…';
    try {
      const r = ticket2fa ? await call('connexion/2fa', { ticket: ticket2fa, code: f.code.value }) : await call('connexion', { email: f.email.value, motDePasse: f.password.value });
      if (r.need2fa) { ticket2fa = r.ticket; $('cred').hidden = true; $('code2fa').hidden = false; $('loginMsg').textContent = 'Entre le code de ton appli d’authentification.'; return; }
      token = r.token; store.set('h.token', token); start();
    } catch (err) { $('loginMsg').textContent = err.message; }
  };

  // ---------- Onglets ----------
  $('tabs').onclick = (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };
  function go(k) { cur = k; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.go === k)); document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.dataset.tab !== k; }); render(); scrollTo(0, 0); }
  const render = () => ({ pc: pcView, amis, ticket, moi })[cur]?.().catch((err) => { tab(cur).innerHTML = `<div class="glass empty"><div class="big">⚠️</div><p>${esc(err.message)}</p></div>`; });

  // ---------- Mon PC ----------
  const gauge = (v, max, label, unit) => { const p = v == null ? 0 : Math.min(1, v / max), c = 2 * Math.PI * 30; return `<div class="gauge"><svg viewBox="0 0 74 74"><circle class="tr" cx="37" cy="37" r="30"/><circle class="v" cx="37" cy="37" r="30" stroke-dasharray="${(p * c).toFixed(1)} ${c.toFixed(1)}" style="stroke:${p > 0.85 ? 'var(--bad)' : p > 0.7 ? 'var(--warn)' : 'var(--accent)'}"/></svg><b>${v == null ? '–' : `${v}${unit}`}</b><small>${label}</small></div>`; };
  async function pcView() {
    pcs = (await call('pc')).pcs ?? [];
    const pc = pcs.find((p) => p.id === pcId) ?? pcs.sort((a, b) => b.at - a.at)[0];
    if (pc && pc.id !== pcId) { pcId = pc.id; store.set('h.pc', pcId); }
    $('pcPill').hidden = !pc; if (pc) { $('pcPill').textContent = pc.enLigne ? '● PC allumé' : '● PC éteint'; $('pcPill').className = `pill${pc.enLigne ? '' : ' off'}`; }
    if (!pc) { tab('pc').innerHTML = '<div class="glass empty"><div class="big">🖥</div><h2>Aucun PC relié</h2><p class="muted">Ouvre History Launcher sur ton PC › Paramètres › Téléphone et scanne le QR.</p></div>'; return; }
    const e = pc.etat ?? {}, off = !pc.enLigne;
    const firstArt = (e.jeux ?? []).find((g) => g.art)?.art; $('amb').style.backgroundImage = firstArt ? `url("${firstArt}")` : ''; $('amb').classList.toggle('art', Boolean(firstArt));
    tab('pc').innerHTML = `<div class="glass pccard"><div class="pchead"><b>🖥 ${esc(pc.nom)}</b>${e.sante != null ? `<span class="pill">Santé ${e.sante}/100</span>` : ''}</div>
      ${off ? '<p class="muted">Ton PC est éteint ou History Launcher est fermé. Allume-le : tout revient ici tout seul.</p>' : `<div class="gauges">${gauge(e.cpuT ?? e.cpu, e.cpuT != null ? 100 : 100, e.cpuT != null ? 'Processeur' : 'Processeur', e.cpuT != null ? '°' : '%')}${gauge(e.gpuT ?? e.gpu, 100, 'Carte graph.', e.gpuT != null ? '°' : '%')}${gauge(e.ram, 100, 'Mémoire', '%')}</div>`}
      ${e.jeu && !off ? `<div class="playing">🎮<b>${esc(e.jeu)}</b><button data-act="close">■ Fermer</button></div>` : ''}${e.msg && !off ? `<p class="muted">Dernière action : ${esc(e.msg)}</p>` : ''}</div>
      ${off ? '' : `<div class="quick"><button class="glass" data-act="shot"><span>📸</span>Capture</button><button class="glass" data-act="sleep"><span>🌙</span>Veille</button><button class="glass" data-act="shutdown"><span>⏻</span>Éteindre</button><button class="glass" data-act="cancel"><span>↩</span>Annuler</button></div>`}
      <div class="glass section"><h2>🎮 Mes jeux</h2><div class="games">${(e.jeux ?? []).map((g) => `<button class="game" data-game="${esc(g.id)}" style="${g.art ? `background-image:url('${esc(g.art)}')` : ''}">${g.h ? `<em>${g.h} h</em>` : ''}<span>${esc(g.name)}</span></button>`).join('') || '<p class="muted">Tes jeux installés apparaîtront ici.</p>'}</div></div>
      ${e.installer?.length ? `<div class="glass section"><h2>⬇ À installer</h2><div class="games">${e.installer.map((g) => `<button class="game" data-inst="${esc(g.id)}" style="${g.art ? `background-image:url('${esc(g.art)}')` : ''}"><span>${esc(g.name)}</span></button>`).join('')}</div></div>` : ''}
      ${e.notifs?.length ? `<div class="glass section"><h2>🔔 Sur ton PC</h2>${e.notifs.map((n) => `<div class="notif"><span>${esc(n.icon)}</span><div><b>${esc(n.title)}</b><small>${esc(n.body)}</small></div></div>`).join('')}</div>` : ''}`;
  }
  async function order(what, id = '') { try { await call('pc/ordre', { pc: pcId, do: what, id }); toast({ launch: '▶ Lancement sur le PC…', install: '⬇ Installation demandée', close: '■ Fermeture du jeu…', shot: '📸 Capture en cours…', sleep: '🌙 Le PC se met en veille', shutdown: '⏻ Extinction dans 60 s', cancel: '↩ Extinction annulée' }[what] ?? 'Envoyé'); setTimeout(render, 2500); } catch (err) { toast(err.message); } }
  function sheet(html) { $('sheetBox').innerHTML = html; $('sheet').hidden = false; }
  $('sheet').onclick = (e) => { if (e.target === $('sheet') || e.target.closest('[data-close]')) $('sheet').hidden = true; };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-game], [data-inst], [data-go-act]'); if (!t) return;
    const pc = pcs.find((p) => p.id === pcId), g = [...(pc?.etat?.jeux ?? []), ...(pc?.etat?.installer ?? [])].find((x) => x.id === (t.dataset.game ?? t.dataset.inst));
    if (t.dataset.game) return sheet(`<div class="art" style="${g?.art ? `background-image:url('${esc(g.art)}')` : ''}"></div><h2>${esc(g?.name)}</h2><button class="main" data-go-act="launch" data-id="${esc(g?.id)}">▶ Jouer sur mon PC</button><button data-close>Annuler</button>`);
    if (t.dataset.inst) return sheet(`<div class="art" style="${g?.art ? `background-image:url('${esc(g.art)}')` : ''}"></div><h2>${esc(g?.name)}</h2><p class="muted">Le téléchargement démarre sur ton PC (Steam ou Epic).</p><button class="main" data-go-act="install" data-id="${esc(g?.id)}">⬇ Installer sur mon PC</button><button data-close>Annuler</button>`);
    if (t.dataset.goAct) { $('sheet').hidden = true; return order(t.dataset.goAct, t.dataset.id); }
    const a = t.dataset.act;
    if (a === 'shutdown' || a === 'sleep') return sheet(`<h2>${a === 'shutdown' ? '⏻ Éteindre le PC ?' : '🌙 Mettre le PC en veille ?'}</h2><p class="muted">${a === 'shutdown' ? 'Il s’éteint dans 60 secondes : tu peux encore annuler.' : 'Les jeux ouverts restent en pause.'}</p><button class="${a === 'shutdown' ? 'red' : 'main'}" data-go-act="${a}">${a === 'shutdown' ? 'Éteindre' : 'Mettre en veille'}</button><button data-close>Annuler</button>`);
    order(a);
  });

  // ---------- Amis ----------
  async function amis() {
    const r = await call('amis'), list = (r.amis ?? []).sort((a, b) => (b.playing ? 2 : b.online ? 1 : 0) - (a.playing ? 2 : a.online ? 1 : 0));
    tab('amis').innerHTML = `<div class="glass section"><h2>👥 Amis · ${list.filter((a) => a.online).length} en ligne</h2>${list.map((a) => `<div class="friend"><span class="av">${esc(a.pseudo[0]?.toUpperCase())}<i class="${a.playing ? 'play' : a.online ? 'on' : ''}"></i></span><div><b>${esc(a.pseudo)}</b><small>${a.playing ? `🎮 Joue à ${esc(a.playing)}` : a.online ? 'En ligne' : 'Hors ligne'}</small></div><button data-chat="${esc(a.id)}" data-name="${esc(a.pseudo)}">💬</button></div>`).join('') || '<div class="empty"><div class="big">👋</div><p class="muted">Ajoute tes amis dans History Launcher avec leur code ami.</p></div>'}</div>
      ${r.demandes?.length ? `<div class="glass section"><h2>📨 ${r.demandes.length} demande${r.demandes.length > 1 ? 's' : ''} d’ami</h2><p class="muted">Accepte-les dans le launcher.</p></div>` : ''}`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-chat]'); if (b) openChat(b.dataset.chat, b.dataset.name); });
  async function openChat(id, name) { chatWith = id; $('chatName').textContent = name; $('chat').showModal(); await loadChat(); }
  async function loadChat() { if (!chatWith) return; const r = await call(`messages?avec=${encodeURIComponent(chatWith)}`).catch(() => ({ fil: [] })); $('chatLog').innerHTML = (r.fil ?? []).slice(-60).map((m) => `<p class="${m.from === chatWith ? '' : 'me'}">${esc(m.text || '📎 fichier')}</p>`).join('') || '<p class="muted">Dis bonjour 👋</p>'; $('chatLog').scrollTop = $('chatLog').scrollHeight; }
  $('chatBack').onclick = () => { chatWith = null; $('chat').close(); };
  $('chatForm').onsubmit = async (e) => { e.preventDefault(); const t = $('chatIn').value.trim(); if (!t || !chatWith) return; $('chatIn').value = ''; await call('messages', { to: chatWith, text: t, cid: crypto.randomUUID() }).catch((err) => toast(err.message)); loadChat(); };

  // ---------- Opti Pro ----------
  async function ticket() {
    const s = (await call('optipro')).session;
    if (!s) { tab('ticket').innerHTML = '<div class="glass empty"><div class="big">🚀</div><h2>Pas de ticket Opti Pro</h2><p class="muted">Ouvre-le dans History Launcher › Optimisation › Opti Pro : le technicien te répondra aussi ici.</p></div>'; return; }
    tab('ticket').innerHTML = `<div class="glass section"><h2>🚀 ${s.done ? 'Ton PC est prêt' : esc(s.steps?.[s.step] ?? 'Opti Pro')}</h2><div class="steps">${Array.from({ length: 7 }, (_, i) => `<i class="${i <= s.step || s.done ? 'on' : ''}"></i>`).join('')}</div>
      ${s.log.slice(-8).map((m) => `<div class="msg ${m.who === 'user' ? 'me' : ''}"><small>${m.who === 'user' ? 'Toi' : m.who === 'staff' ? 'Équipe History' : 'Technicien'}</small>${esc(m.text).replace(/\[\[faire:\w+\]\]/g, '⚡').replace(/\n/g, '<br>').slice(0, 1600)}</div>`).join('')}</div>
      ${s.closed ? '' : '<form id="tkForm" class="glass section"><input id="tkIn" maxlength="1500" placeholder="Écrire au technicien…"><button class="main">Envoyer</button><button type="button" id="tkNext">✅ J’ai fini cette étape</button></form>'}`;
    if (s.closed) return;
    $('tkForm').onsubmit = async (e) => { e.preventDefault(); const t = $('tkIn').value.trim(); if (!t) return; $('tkIn').value = ''; toast('Le technicien écrit…'); await call('optipro/action', { action: 'msg', text: t }).catch((err) => toast(err.message)); ticket(); };
    $('tkNext').onclick = () => sheet('<h2>Étape terminée ?</h2><button class="main" id="tkYes">Oui, étape suivante</button><button data-close>Pas encore</button>');
  }
  document.addEventListener('click', async (e) => { if (e.target.id === 'tkYes') { $('sheet').hidden = true; await call('optipro/action', { action: 'next' }).catch((err) => toast(err.message)); ticket(); } });

  // ---------- Moi ----------
  async function moi() {
    const p = await call('premium').catch(() => ({}));
    tab('moi').innerHTML = `<div class="glass section"><div class="friend"><span class="av">${esc(me?.pseudo?.[0]?.toUpperCase() ?? '?')}</span><div><b>${esc(me?.pseudo ?? 'Mon compte')}</b><small>${esc(me?.email ?? '')}</small></div></div>
      <p>${p.ia || p.opti ? `⭐ Premium : ${[p.ia && 'History IA', p.opti && 'Opti Pro'].filter(Boolean).join(' + ')}` : 'Pas de Premium : découvre-le dans le launcher.'}</p>${p.code ? `<p class="muted">Ton code ami : <b>${esc(p.code)}</b> (−20 % pour un ami)</p>` : ''}</div>
      <div class="glass section"><h2>Ce téléphone</h2><button id="notifOn" style="width:100%">🔔 Prévenir quand un ami lance un jeu</button><button id="out" class="red" style="width:100%;margin-top:8px">Se déconnecter</button></div>`;
    $('out').onclick = async () => { await call('deconnexion', {}).catch(() => {}); logout(); };
    $('notifOn').onclick = () => Notification.requestPermission?.().then((v) => toast(v === 'granted' ? '🔔 Activé (quand l’appli est ouverte)' : 'Refusé'));
  }

  // ---------- Rafraîchissement : PC toutes les 4 s quand on le regarde, amis toutes les 20 s ----------
  let playing = {};
  setInterval(() => { if (token && !document.hidden && cur === 'pc' && $('sheet').hidden) pcView().catch(() => {}); }, 4000);
  setInterval(async () => {
    if (!token || document.hidden) return;
    if (chatWith) return loadChat();
    const r = await call('amis').catch(() => null); if (!r) return;
    for (const a of r.amis ?? []) { if (a.playing && playing[a.id] !== undefined && playing[a.id] !== a.playing && Notification.permission === 'granted') navigator.serviceWorker?.ready.then((sw) => sw.showNotification(`${a.pseudo} joue à ${a.playing}`, { icon: 'icon-192.png' })); playing[a.id] = a.playing ?? null; }
    $('amisDot').hidden = !(r.demandes?.length);
    if (cur === 'amis') amis().catch(() => {});
  }, 20_000);

  let promptEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptEvt = e; $('install').hidden = false; });
  $('install').onclick = () => promptEvt?.prompt();
  navigator.serviceWorker?.register('sw.js').catch(() => {});

  async function start() {
    $('welcome').hidden = true; $('app').hidden = $('tabs').hidden = false;
    me = (await call('moi').catch(() => ({}))).compte ?? null; go('pc');
  }
  (async () => { await fromQr(); if (token) start(); else $('welcome').hidden = false; })();
})();
