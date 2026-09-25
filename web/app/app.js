// Tableau de bord public : connexion Discord, choix du serveur, réglages, tickets, premium.
(function () {
  'use strict';

  // ---------------- Outils ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  async function api(method, path, body) {
    const res = await fetch(`/app/api/${path}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-App': '1' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `Erreur ${res.status}`); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  let toastTimer;
  function toast(text, bad = false) {
    const t = $('#toast');
    t.textContent = text;
    t.className = `toast${bad ? ' bad' : ''}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  const date = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const initials = (name) => String(name).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const icon = (src, name, cls = 'icon') => (src ? h('img', { class: cls, src, alt: '' }) : h('div', { class: cls, text: initials(name) }));
  const view = () => $('#view');
  function crumbs(...parts) {
    $('#crumbs').replaceChildren(...parts.flatMap((p, i) => [i ? h('span', { text: '›' }) : null, p.href ? h('a', { href: p.href, text: p.text }) : h('span', { text: p.text })]).filter(Boolean));
  }

  // ---------------- Démarrage ----------------
  let me = null;
  async function start() {
    me = await api('GET', 'me').catch(() => ({ connected: false }));
    if (me.bot) {
      $('#bot-name').textContent = me.bot.name;
      if (me.bot.avatar) { $('#bot-avatar').src = me.bot.avatar; $('#bot-avatar').hidden = false; $('#bot-mark').hidden = true; }
    }
    if (me.connected) {
      $('#me').replaceChildren(...[
        me.user.avatar ? h('img', { src: me.user.avatar, alt: '' }) : null,
        h('span', { class: 'name', text: me.user.name }),
        h('button', { class: 'btn small', onclick: logout, text: 'Déconnexion' }),
      ].filter(Boolean));
    }
    window.addEventListener('hashchange', route);
    route();
  }
  async function logout() {
    await api('POST', 'logout', {}).catch(() => {});
    location.href = '/app';
  }
  function route() {
    if (!me.connected) return loginView();
    const m = location.hash.match(/^#serveur\/(\d{15,21})(?:\/([a-z-]+))?$/);
    return m ? serverView(m[1], m[2] || 'accueil') : serversView();
  }

  // ---------------- Connexion ----------------
  const ERRORS = {
    config: 'La connexion Discord n’est pas encore configurée sur le bot (DISCORD_CLIENT_SECRET manquant).',
    etat: 'La connexion a expiré, recommence.',
    discord: 'Discord a refusé la connexion, réessaie.',
    trop: 'Trop d’essais, attends un quart d’heure.',
  };
  function loginView() {
    crumbs();
    const err = new URLSearchParams(location.search).get('erreur');
    view().replaceChildren(h('div', { class: 'login' },
      me.bot?.avatar ? h('img', { src: me.bot.avatar, alt: '' }) : h('div', { class: 'mark', text: 'V' }),
      h('h1', { text: 'Tableau de bord' }),
      h('p', { text: `Connecte-toi avec Discord pour gérer les serveurs où ${me.bot?.name ?? 'le bot'} est ajouté.` }),
      err && ERRORS[err] ? h('div', { class: 'error', text: ERRORS[err] }) : null,
      me.oauth === false && !err ? h('div', { class: 'error', text: ERRORS.config }) : null,
      h('a', { class: 'btn primary big', href: '/app/login' }, 'Se connecter avec Discord'),
      h('p', { class: 'note', text: 'On lit seulement ton nom et la liste de tes serveurs. Aucun mot de passe.' }),
    ));
  }

  // ---------------- Liste des serveurs ----------------
  async function serversView() {
    crumbs({ text: 'Mes serveurs' });
    view().replaceChildren(h('p', { class: 'loading', text: 'Chargement de tes serveurs…' }));
    const { servers } = await api('GET', 'servers');
    const cards = servers.map((s) => h(s.botIn ? 'a' : 'div', { class: `server${s.botIn ? ' on' : ''}`, href: s.botIn ? `#serveur/${s.id}` : null },
      icon(s.icon, s.name),
      h('div', { class: 'info' }, h('b', { text: s.name }), h('small', { text: s.botIn ? `Offre ${s.plan}` : 'Le bot n’est pas encore là' })),
      s.botIn ? h('span', { class: 'btn small primary', text: 'Gérer' }) : h('a', { class: 'btn small', href: s.invite, target: '_blank', rel: 'noopener', text: 'Ajouter' })));
    view().replaceChildren(
      h('div', { class: 'head' }, h('div', {}, h('h1', { text: 'Choisis un serveur' }), h('p', { text: 'Les serveurs où tu as la permission « Gérer le serveur ».' }))),
      cards.length ? h('div', { class: 'servers' }, cards) : h('div', { class: 'empty', text: 'Aucun serveur où tu peux gérer. Il faut la permission « Gérer le serveur ».' }),
    );
  }

  // ---------------- Un serveur ----------------
  let data = null;
  const PREMIUM_PAGES = {
    couleurs: { feature: 'branding', label: 'Couleurs du serveur', emoji: '🎨' },
    voix: { feature: 'voices', label: 'Voix de l’IA', emoji: '🗣️' },
    rapport: { feature: 'report', label: 'Rapport de la semaine', emoji: '📊' },
    gardien: { feature: 'guard', label: 'Surveillance Gardien', emoji: '🛡️' },
  };

  async function serverView(id, page) {
    if (!data || data.id !== id) {
      view().replaceChildren(h('p', { class: 'loading', text: 'Chargement du serveur…' }));
      try {
        data = await api('GET', `server?id=${id}`);
      } catch (err) {
        view().replaceChildren(h('div', { class: 'error', text: err.message }), h('a', { class: 'btn', href: '#', text: '← Mes serveurs' }));
        return;
      }
    }
    crumbs({ text: 'Mes serveurs', href: '#' }, { text: data.name });
    const nav = [
      ['group', 'Général'], ['accueil', '🏠 Vue d’ensemble'], ['tickets', '🎫 Tickets'], ['annonce', '📣 Annonce'],
      ['group', 'Modules'], ...Object.entries(data.sections).map(([k, s]) => [k, `${s.emoji} ${s.label}`]),
      ['group', 'Premium'], ...Object.entries(PREMIUM_PAGES).map(([k, p]) => [k, `${p.emoji} ${p.label}`, !data.plan.features[p.feature]]),
    ];
    const side = h('nav', { class: 'side' }, nav.map(([k, label, locked]) => (k === 'group'
      ? h('div', { class: 'group', text: label })
      : h('button', { class: k === page ? 'on' : null, onclick: () => { location.hash = `#serveur/${id}/${k}`; } }, label, locked ? h('span', { class: 'lock', text: 'Premium' }) : null))));
    const panel = h('div', { class: 'panel' });
    view().replaceChildren(h('div', { class: 'layout' }, side, panel));
    if (page === 'accueil') overview(panel);
    else if (page === 'tickets') ticketsPage(panel);
    else if (page === 'annonce') announcePage(panel);
    else if (data.sections[page]) sectionPage(panel, page);
    else if (PREMIUM_PAGES[page]) premiumPage(panel, page);
    else overview(panel);
  }
  async function reload() {
    data = await api('GET', `server?id=${data.id}`);
    route();
  }

  // Vue d'ensemble : offre, essai, paiement
  function overview(panel) {
    const p = data.plan;
    const status = p.key === 'gratuit' ? h('span', { class: 'pill', text: 'Gratuit' }) : h('span', { class: `pill ${p.trial ? 'gold' : 'ok'}`, text: p.trial ? `Essai ${p.label}` : p.label });
    const countdown = h('b', { class: 'countdown' });
    function tick() {
      if (!p.until) return;
      const left = Math.max(0, p.until - Date.now());
      const d = Math.floor(left / 86400000);
      const hrs = Math.floor((left % 86400000) / 3600000);
      const min = Math.floor((left % 3600000) / 60000);
      countdown.textContent = left ? `${d} j ${hrs} h ${min} min` : 'Terminé';
    }
    tick();
    const timer = setInterval(() => (document.body.contains(countdown) ? tick() : clearInterval(timer)), 30000);
    const actions = h('div', { class: 'row' });
    if (p.key === 'gratuit' && !p.trialUsed) {
      actions.append(h('button', {
        class: 'btn gold',
        onclick: async (e) => {
          e.target.disabled = true;
          try { await api('POST', 'server/trial', { guildId: data.id }); toast(`Essai de ${p.trialDays} jours activé : tout le premium est débloqué.`); await reload(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
        },
      }, `Essai gratuit de ${p.trialDays} jours`));
    }
    for (const o of p.offers) actions.append(h('a', { class: `btn${o.key === 'veilleur' ? ' primary' : ''}`, href: o.pay, target: '_blank', rel: 'noopener', text: `${o.label} · ${o.price}` }));
    panel.append(
      h('div', { class: 'card' },
        h('div', { class: 'banner' }, icon(data.icon, data.name), h('div', {}, h('h2', { text: data.name }), h('p', { class: 'sub', text: `${data.members.toLocaleString('fr-FR')} membres` })), status)),
      h('div', { class: 'card' },
        h('h2', { text: 'Offre du serveur' }),
        h('p', { class: 'sub', text: p.key === 'gratuit'
          ? (p.trialUsed ? 'L’essai gratuit a déjà été utilisé. Prends une offre pour débloquer le premium.' : `Toutes les fonctions gratuites sont ouvertes. L’essai de ${p.trialDays} jours débloque tout le premium, sans paiement.`)
          : p.trial ? 'Essai en cours : tout le premium est débloqué jusqu’à la date de fin. Ensuite, le serveur repasse en gratuit.' : 'Merci ! Le premium est actif jusqu’à la date de fin.' }),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('small', { text: 'Offre' }), h('b', { text: p.trial ? `${p.label} (essai)` : p.label })),
          p.until ? h('div', { class: 'stat' }, h('small', { text: 'Fin' }), h('b', { text: date(p.until) })) : null,
          p.until ? h('div', { class: 'stat' }, h('small', { text: 'Temps restant' }), countdown) : null,
          h('div', { class: 'stat' }, h('small', { text: 'IA vocale' }), h('b', { text: p.features.voiceMinutes === 'illimitée' ? 'Illimitée' : `${p.features.voiceMinutes} min / mois` }))),
        actions),
    );
  }

  // ---------------- Formulaire générique (réglages des modules) ----------------
  function control(s, value) {
    const chanOpts = (type) => [h('option', { value: '', text: '— Aucun —' }), ...data.channels.filter((c) => c.type === type).map((c) => h('option', { value: c.id, text: type === 'text' ? `# ${c.name}` : c.name, selected: c.id === value }))];
    switch (s.type) {
      case 'bool': return null;
      case 'int': return h('input', { type: 'number', min: s.min, max: s.max, value: value ?? s.def ?? '' });
      case 'text': return h('input', { type: 'text', maxlength: s.max ?? 300, value: value ?? '' });
      case 'choice': return h('select', {}, s.options.map((o) => h('option', { value: o, text: o, selected: o === (value ?? s.def) })));
      case 'channel': return h('select', {}, chanOpts('text'));
      case 'voice': return h('select', {}, chanOpts('voice'));
      case 'category': return h('select', {}, chanOpts('category'));
      case 'role': return h('select', {}, [h('option', { value: '', text: '— Aucun —' }), ...data.roles.map((r) => h('option', { value: r.id, text: `@${r.name}`, selected: r.id === value }))]);
      case 'list': { const t = h('textarea', {}); t.value = (value ?? s.def ?? []).join('\n'); return t; }
      default: return h('input', { type: 'text', value: value ?? '' });
    }
  }
  function readControl(s, el) {
    if (s.type === 'bool') return el.checked;
    if (s.type === 'int') return el.value === '' ? null : Number(el.value);
    if (s.type === 'list') return el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    return el.value === '' ? null : el.value;
  }
  function sectionPage(panel, key) {
    const sec = data.sections[key];
    const items = data.settings.filter((s) => s.section === key);
    const inputs = new Map();
    const fields = items.map((s) => {
      const value = s.value ?? (s.type === 'bool' ? s.def ?? false : null);
      if (s.type === 'bool') {
        const box = h('input', { type: 'checkbox', checked: Boolean(value) });
        inputs.set(s.key, box);
        return h('label', { class: 'switch' }, h('span', { class: 't' }, h('b', { text: s.label }), s.help ? h('small', { text: s.help }) : null), box);
      }
      const el = control(s, value);
      inputs.set(s.key, el);
      return h('label', { class: 'field', 'data-key': s.key }, h('span', { text: s.label }), el, s.help ? h('small', { text: s.help }) : null);
    });
    const bar = h('div', { class: 'savebar' }, h('span', { text: 'Les changements s’appliquent tout de suite sur le serveur.' }), h('button', { class: 'btn primary', onclick: save, text: 'Enregistrer' }));
    async function save(e) {
      const changes = {};
      for (const s of items) changes[s.key] = readControl(s, inputs.get(s.key));
      panel.querySelectorAll('.field.bad').forEach((f) => { f.classList.remove('bad'); f.querySelector('.err')?.remove(); });
      e.target.disabled = true;
      try {
        await api('POST', 'server/settings', { guildId: data.id, changes });
        toast('Réglages enregistrés.');
        data = await api('GET', `server?id=${data.id}`);
      } catch (err) {
        toast(err.message, true);
        for (const [k, msg] of Object.entries(err.data?.errors ?? {})) {
          const f = panel.querySelector(`.field[data-key="${CSS.escape(k)}"]`);
          if (f) { f.classList.add('bad'); f.append(h('span', { class: 'err', text: msg })); }
        }
      } finally { e.target.disabled = false; }
    }
    panel.append(h('div', { class: 'card' }, h('h2', { text: `${sec.emoji} ${sec.label}` }), h('p', { class: 'sub', text: sec.intro }), h('div', { class: 'fields' }, fields)), bar);
  }

  // ---------------- Tickets et annonces ----------------
  const colorSelect = (def) => h('select', { name: 'color' }, data.colors.map((c) => h('option', { value: c.key, text: c.label, selected: c.key === def })));
  const textChannels = (name) => h('select', { name }, data.channels.filter((c) => c.type === 'text').map((c) => h('option', { value: c.id, text: `# ${c.name}` })));
  const optional = (name, list, prefix = '') => h('select', { name }, [h('option', { value: '', text: '— Aucun —' }), ...list.map((x) => h('option', { value: x.id, text: `${prefix}${x.name}` }))]);
  function field(label, el, help) { return h('label', { class: 'field' }, h('span', { text: label }), el, help ? h('small', { text: help }) : null); }
  function publishForm(kind) {
    const form = h('form', { class: 'fields' });
    const title = h('input', { type: 'text', name: 'title', maxlength: 256, required: true, value: kind === 'ticket' ? '🎫 Besoin d’aide ?' : '' });
    const message = h('textarea', { name: 'message', maxlength: 4000, required: true });
    message.value = kind === 'ticket' ? 'Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff te répond au plus vite, en privé.' : '';
    form.append(
      h('div', { class: 'grid2' }, field('Salon où publier', textChannels('channelId')), field('Couleur', colorSelect(kind === 'ticket' ? 'cyan' : 'or'))),
      field('Titre', title), field('Message', message),
    );
    if (kind === 'ticket') {
      form.append(
        h('div', { class: 'grid2' },
          field('Texte du bouton', h('input', { type: 'text', name: 'button', maxlength: 80, value: 'Ouvrir un ticket' })),
          field('Rôle du staff', optional('staffRoleId', data.roles, '@'), 'Voit et gère les tickets. Vide : les admins.')),
        h('div', { class: 'grid2' },
          field('Catégorie des tickets', optional('categoryId', data.channels.filter((c) => c.type === 'category')), 'Vide : créée à la première ouverture.'),
          field('Salon des archives', optional('logChannelId', data.channels.filter((c) => c.type === 'text'), '# '), 'Reçoit la transcription à la fermeture.')),
        field('Message d’accueil dans le ticket', h('textarea', { name: 'welcome', maxlength: 1000 })),
        h('label', { class: 'switch' }, h('span', { class: 't' }, h('b', { text: 'Un seul ticket ouvert par membre' })), h('input', { type: 'checkbox', name: 'unique', checked: true })),
      );
    } else {
      form.append(field('Mentionner', h('select', { name: 'ping' }, [h('option', { value: '', text: 'Personne' }), h('option', { value: 'everyone', text: '@everyone' }), ...data.roles.map((r) => h('option', { value: r.id, text: `@${r.name}` }))])));
    }
    const submit = h('button', { class: 'btn primary', type: 'submit', text: kind === 'ticket' ? 'Publier le panneau de tickets' : 'Publier l’annonce' });
    form.append(h('div', { class: 'row' }, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const body = { guildId: data.id, kind, ...Object.fromEntries(f.entries()), unique: form.unique ? form.unique.checked : undefined };
      submit.disabled = true;
      try {
        await api('POST', 'server/publish', body);
        toast(kind === 'ticket' ? 'Panneau de tickets publié.' : 'Annonce publiée.');
        if (kind === 'ticket') await reload();
      } catch (err) { toast(err.message, true); } finally { submit.disabled = false; }
    });
    return form;
  }
  function ticketsPage(panel) {
    const t = data.tickets;
    panel.append(
      h('div', { class: 'card' }, h('h2', { text: '🎫 Créer un panneau de tickets' }), h('p', { class: 'sub', text: 'Les membres cliquent sur le bouton : un salon privé s’ouvre avec le staff.' }), publishForm('ticket')),
      h('div', { class: 'card' }, h('h2', { text: `Panneaux publiés (${t.panels.length})` }),
        t.panels.length ? h('div', { class: 'list' }, t.panels.map((p) => h('div', { class: 'item' }, h('span', { text: p.title }), h('small', { text: p.channel ? `# ${p.channel}` : 'salon supprimé' })))) : h('p', { class: 'sub', text: 'Aucun pour l’instant.' })),
      h('div', { class: 'card' }, h('h2', { text: `Tickets ouverts (${t.open.length})` }),
        t.open.length ? h('div', { class: 'list' }, t.open.map((o) => h('div', { class: 'item' }, h('span', { text: o.channel ? `# ${o.channel}` : 'Ticket' }), h('small', { text: o.user ?? '' })))) : h('p', { class: 'sub', text: 'Aucun ticket ouvert.' })),
    );
  }
  function announcePage(panel) {
    panel.append(h('div', { class: 'card' }, h('h2', { text: '📣 Publier une annonce' }), h('p', { class: 'sub', text: 'Un message mis en forme, publié par le bot dans le salon choisi.' }), publishForm('annonce')));
  }

  // ---------------- Premium ----------------
  function premiumPage(panel, key) {
    const page = PREMIUM_PAGES[key];
    const unlocked = data.plan.features[page.feature];
    const pr = data.premium;
    let fields;
    let read;
    if (page.feature === 'branding') {
      const name = h('input', { type: 'text', maxlength: 60, value: pr.branding.name });
      const color = h('input', { type: 'color', value: pr.branding.color || '#5865f2' });
      fields = [field('Nom affiché sur les messages du bot', name, 'Remplace « AI Vercel » en bas des embeds.'), field('Couleur des embeds', color), h('p', { class: 'sub', text: 'Le logo se change dans Discord : /serveur › Cartes aux couleurs du serveur.' })];
      read = () => ({ name: name.value, color: color.value });
    } else if (page.feature === 'voices') {
      const sel = h('select', {}, pr.voice.voices.map((v) => h('option', { value: v.key, text: `${v.key} · ${v.label}`, selected: v.key === pr.voice.current })));
      fields = [field('Voix de l’IA vocale', sel, 'Utilisée à la prochaine conversation vocale.')];
      read = () => ({ voice: sel.value });
    } else if (page.feature === 'report') {
      const box = h('input', { type: 'checkbox', checked: pr.report });
      fields = [h('label', { class: 'switch' }, h('span', { class: 't' }, h('b', { text: 'Recevoir le rapport chaque dimanche à 20 h' }), h('small', { text: 'En message privé au propriétaire : activité, membres, sanctions de la semaine.' })), box)];
      read = () => ({ enabled: box.checked });
    } else {
      const ids = h('textarea', {}); ids.value = pr.guard.protectedIds.join('\n');
      const words = h('textarea', {}); words.value = pr.guard.words.join('\n');
      fields = [field('Membres protégés (identifiants Discord, un par ligne)', ids, 'Insultés en vocal : avertissement, puis exclusion au 3e.'), field('Mots interdits en vocal (un par ligne)', words)];
      read = () => ({ protectedIds: ids.value, words: words.value });
    }
    const card = h('div', { class: `card${unlocked ? '' : ' locked'}` }, h('h2', { text: `${page.emoji} ${page.label}` }), h('div', { class: 'fields' }, fields));
    if (!unlocked) {
      const p = data.plan;
      card.append(h('div', { class: 'lockbox' },
        h('p', { text: 'Cette fonction fait partie du premium. Débloque-la pour y accéder : elle s’ouvre ici dès que l’offre est active.' }),
        !p.trialUsed ? h('a', { class: 'btn gold', href: `#serveur/${data.id}/accueil`, text: `Essai gratuit ${p.trialDays} jours` }) : null,
        h('a', { class: 'btn', href: p.offers[0].pay, target: '_blank', rel: 'noopener', text: 'Voir les offres' })));
      panel.append(card);
      return;
    }
    const btn = h('button', {
      class: 'btn primary',
      onclick: async () => {
        btn.disabled = true;
        try { await api('POST', 'server/premium', { guildId: data.id, feature: page.feature, data: read() }); toast('Enregistré.'); data = await api('GET', `server?id=${data.id}`); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
      },
    }, 'Enregistrer');
    card.append(h('div', { class: 'row' }, btn));
    panel.append(card);
  }

  start();
}());
