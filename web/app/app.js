// Tableau de bord public : connexion Discord, choix du serveur, réglages avec aperçus, tickets, premium.
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
  const shortDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const initials = (name) => String(name).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const icon = (src, name, cls = 'icon') => (src ? h('img', { class: cls, src, alt: '' }) : h('div', { class: cls, text: initials(name) }));
  const view = () => $('#view');
  function crumbs(...parts) {
    $('#crumbs').replaceChildren(...parts.flatMap((p, i) => [i ? h('span', { text: '›' }) : null, p.href ? h('a', { href: p.href, text: p.text }) : h('span', { text: p.text })]).filter(Boolean));
  }
  // Gras façon Discord (**texte**), sans HTML injecté
  function md(text) {
    const out = document.createDocumentFragment();
    String(text ?? '').split(/(\*\*[^*]+\*\*)/).forEach((part) => out.append(/^\*\*[^*]+\*\*$/.test(part) ? h('b', { text: part.slice(2, -2) }) : document.createTextNode(part)));
    return out;
  }
  const nowTime = () => `Aujourd’hui à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

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
    return m ? serverView(m[1], m[2] || 'vue') : serversView();
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
      h('p', { text: `Connecte-toi avec Discord pour gérer les serveurs où ${me.bot?.name ?? 'le bot'} est ajouté : tickets, sécurité, niveaux, accueil…` }),
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
    const cards = servers.map((s) => h('div', { class: `server${s.botIn ? ' on' : ''}` },
      h('div', { class: 'top-line' }, icon(s.icon, s.name), h('div', {}, h('b', { text: s.name }), h('small', { text: s.botIn ? `Offre ${s.plan}` : 'Le bot n’est pas encore sur ce serveur' }))),
      s.botIn ? h('a', { class: 'btn primary', href: `#serveur/${s.id}`, text: 'Gérer le serveur' }) : h('a', { class: 'btn', href: s.invite, target: '_blank', rel: 'noopener', text: 'Ajouter le bot' })));
    view().replaceChildren(
      h('div', { class: 'head' }, h('h1', { text: 'Choisis un serveur' }), h('p', { text: 'Les serveurs où tu as la permission « Gérer le serveur ».' })),
      cards.length ? h('div', { class: 'servers' }, cards) : h('div', { class: 'empty', text: 'Aucun serveur où tu peux gérer. Il faut la permission « Gérer le serveur ».' }),
    );
  }

  // ---------------- Menus ----------------
  const PREMIUM = {
    couleurs: { feature: 'branding', label: 'Couleurs du serveur', emoji: '🎨', desc: 'Ton nom et ta couleur sur les messages du bot',
      perks: ['Ton nom à la place de « AI Vercel » en bas des messages', 'La couleur de ton serveur sur tous les embeds', 'Ton logo sur les panneaux, tickets et annonces'] },
    voix: { feature: 'voices', label: 'Voix de l’IA', emoji: '🗣️', desc: 'Choisis comment l’IA parle en vocal',
      perks: ['Plusieurs voix au choix pour l’IA vocale', '600 min d’IA vocale par mois (illimité en Gardien)', 'Le narrateur des jeux avec la même voix'] },
    rapport: { feature: 'report', label: 'Rapport de la semaine', emoji: '📊', desc: 'Le résumé de ton serveur en MP',
      perks: ['Chaque dimanche à 20 h, en message privé', 'Messages, membres actifs, arrivées et départs', 'Sanctions et moments forts de la semaine'] },
    gardien: { feature: 'guard', label: 'Surveillance Gardien', emoji: '🛡️', desc: 'Protège ton staff en vocal',
      perks: ['Protège les membres du staff des insultes en vocal', 'Tes propres mots interdits en vocal', 'Avertissement, puis exclusion automatique au 3e'] },
  };
  const MODULE_DESC = {
    securite: 'Anti-raid, anti-spam, vérification', niveaux: 'XP, rôles, récompense du jour', boutique: 'Rôles à acheter avec les jetons',
    accueil: 'Carte de bienvenue et suggestions', vocal: 'Vocaux temporaires, radio 24/24', ia: 'Mémoire, traduction, FAQ',
  };

  // ---------------- Un serveur ----------------
  let data = null;
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
    const go = (k) => () => { location.hash = `#serveur/${id}/${k}`; };
    const item = (k, emoji, label, desc, extra = {}) => h('button', { class: `nav${k === page ? ' on' : ''}${extra.premium ? ' premium' : ''}`, onclick: go(k) },
      h('span', { class: 'ni', text: emoji }), h('span', { class: 'nt' }, h('b', { text: label }), desc ? h('small', { text: desc }) : null), extra.tag ?? h('span'));
    const unlocked = (feature) => data.plan.features[feature];
    const side = h('nav', { class: 'side' },
      h('div', { class: 'server-mini' }, icon(data.icon, data.name), h('div', {}, h('b', { text: data.name }), h('small', { text: `${data.members.toLocaleString('fr-FR')} membres · ${data.plan.trial ? 'Essai' : ''} ${data.plan.label}` }))),
      h('div', { class: 'group', text: 'Tableau de bord' }),
      item('vue', '🏠', 'Vue d’ensemble', 'État du serveur et des modules'),
      item('commandes', '⌨️', 'Commandes', 'Les 6 commandes du bot'),
      h('div', { class: 'group', text: 'Gestion' }),
      item('tickets', '🎫', 'Tickets', 'Panneau d’aide avec aperçu', { tag: data.tickets.open.length ? h('span', { class: 'tag count', text: data.tickets.open.length }) : null }),
      item('annonce', '📣', 'Annonces', 'Message mis en forme, avec aperçu'),
      item('classement', '🏆', 'Classement', 'Les membres les plus actifs'),
      item('sanctions', '⚖️', 'Sanctions', 'Derniers avertissements', { tag: data.sanctions.length ? h('span', { class: 'tag count', text: data.sanctions.length }) : null }),
      h('div', { class: 'group', text: 'Modules' }),
      ...Object.entries(data.sections).map(([k, s]) => item(k, s.emoji, s.label, MODULE_DESC[k])),
      h('div', { class: 'group gold', text: '★ Premium' }),
      item('premium', '⭐', 'Offre premium', data.plan.key === 'gratuit' ? 'Essai gratuit 7 jours' : 'Ton offre et ses avantages', { premium: true }),
      ...Object.entries(PREMIUM).map(([k, p]) => item(k, p.emoji, p.label, p.desc, { premium: true, tag: unlocked(p.feature) ? h('span', { class: 'tag open', text: '✓ Débloqué' }) : h('span', { class: 'tag lock', text: '🔒 Premium' }) })),
    );
    const panel = h('div', { class: 'panel' });
    view().replaceChildren(h('div', { class: 'layout' }, side, panel));
    const pages = { vue: overview, commandes: commandsPage, tickets: ticketsPage, annonce: announcePage, classement: leaderboardPage, sanctions: sanctionsPage, premium: premiumOffer };
    if (pages[page]) pages[page](panel);
    else if (data.sections[page]) sectionPage(panel, page);
    else if (PREMIUM[page]) premiumPage(panel, page);
    else overview(panel);
    window.scrollTo(0, 0);
  }
  async function reload() {
    data = await api('GET', `server?id=${data.id}`);
    route();
  }
  const pageHead = (emoji, title, text, gold = false) => h('div', { class: `page-head${gold ? ' gold' : ''}` }, h('div', { class: 'pi', text: emoji }), h('div', {}, h('h1', { text: title }), text ? h('p', { text }) : null));

  // ---------------- Aperçu Discord ----------------
  const botAv = () => (me.bot?.avatar ? h('img', { class: 'av', src: me.bot.avatar, alt: '' }) : h('div', { class: 'av', text: 'V' }));
  function dcMessage({ bot = true, author, content, embed, buttons = [], extra }) {
    return h('div', { class: 'msg' },
      bot ? botAv() : h('div', { class: 'av', text: initials(author) }),
      h('div', {},
        h('div', { class: 'who' }, bot ? (data?.premium.branding.name && data.plan.features.branding ? data.premium.branding.name : me.bot?.name ?? 'AI Vercel') : author, bot ? h('span', { class: 'app', text: 'APP' }) : null, h('time', { text: nowTime() })),
        content ? h('div', { class: 'txt' }, typeof content === 'string' ? md(content) : content) : null,
        embed ? embed : null,
        extra ?? null,
        buttons.length ? h('div', {}, buttons.map((b) => h('span', { class: `dbtn${b.grey ? ' grey' : ''}`, text: b.label }))) : null));
  }
  function dcEmbed({ color, title, text, fields, footer }) {
    const e = h('div', { class: 'embed' }, title ? h('div', { class: 'et' }, md(title)) : null, text ? h('div', { class: 'ed' }, md(text)) : null,
      fields ? h('div', { class: 'ef' }, fields.map(([k, v]) => h('div', {}, h('b', { text: k }), v))) : null,
      footer ? h('div', { class: 'foot', text: footer }) : null);
    e.style.setProperty('--ec', color);
    return e;
  }
  const previewBox = (...children) => h('div', { class: 'card sticky' }, h('div', { class: 'preview-label', text: 'Aperçu en direct' }), h('div', { class: 'dc' }, ...children));
  const footerName = () => (data.plan.features.branding && data.premium.branding.name ? `${data.premium.branding.name} · propulsé par AI Vercel` : data.name);

  // ---------------- Vue d'ensemble ----------------
  function overview(panel) {
    const p = data.plan;
    const bools = (key) => data.settings.filter((s) => s.section === key && s.type === 'bool');
    const active = (key) => bools(key).some((s) => (s.value ?? s.def) === true);
    panel.append(
      h('div', { class: 'card' },
        h('div', { class: 'banner' }, icon(data.icon, data.name), h('div', {}, h('h2', { text: data.name }), h('p', { class: 'sub', text: `${data.members.toLocaleString('fr-FR')} membres` })),
          p.key === 'gratuit' ? h('span', { class: 'pill', text: 'Offre gratuite' }) : h('span', { class: 'pill gold', text: p.trial ? `★ Essai ${p.label}` : `★ ${p.label}` })),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('small', { text: 'Tickets ouverts' }), h('b', { text: data.tickets.open.length })),
          h('div', { class: 'stat' }, h('small', { text: 'Panneaux de tickets' }), h('b', { text: data.tickets.panels.length })),
          h('div', { class: 'stat' }, h('small', { text: 'Sanctions récentes' }), h('b', { text: data.sanctions.length })),
          h('div', { class: 'stat' }, h('small', { text: 'Modules actifs' }), h('b', { text: `${Object.keys(data.sections).filter(active).length} / ${Object.keys(data.sections).length}` })))),
      h('div', { class: 'card' },
        h('h2', { text: 'Modules' }), h('p', { class: 'sub', text: 'Clique sur un module pour le régler. Tout est gratuit.' }),
        h('div', { class: 'tiles' },
          ...Object.entries(data.sections).map(([k, s]) => h('button', { class: 'tile', onclick: () => { location.hash = `#serveur/${data.id}/${k}`; } },
            h('div', { class: 'tt' }, h('span', { class: 'ti', text: s.emoji }), h('span', { class: `state ${active(k) ? 'on' : 'off'}`, text: active(k) ? 'Actif' : 'Inactif' })),
            h('b', { text: s.label }), h('p', { text: s.intro }))),
          h('button', { class: 'tile', onclick: () => { location.hash = `#serveur/${data.id}/tickets`; } }, h('div', { class: 'tt' }, h('span', { class: 'ti', text: '🎫' }), h('span', { class: `state ${data.tickets.panels.length ? 'on' : 'off'}`, text: data.tickets.panels.length ? 'Actif' : 'À créer' })), h('b', { text: 'Tickets' }), h('p', { text: 'Un panneau avec un bouton, un salon privé avec le staff.' })))),
      h('div', { class: 'card premium-card' },
        h('h2', { text: '★ Premium' }),
        h('p', { class: 'sub', text: p.key === 'gratuit' ? 'Débloque ces fonctions avec une offre, ou essaie-les gratuitement pendant 7 jours.' : p.trial ? `Essai en cours jusqu’au ${date(p.until)}.` : `Actif jusqu’au ${date(p.until)}.` }),
        h('div', { class: 'tiles' }, Object.entries(PREMIUM).map(([k, x]) => h('button', { class: 'tile gold', onclick: () => { location.hash = `#serveur/${data.id}/${k}`; } },
          h('div', { class: 'tt' }, h('span', { class: 'ti', text: x.emoji }), h('span', { class: `tag ${data.plan.features[x.feature] ? 'open' : 'lock'}`, text: data.plan.features[x.feature] ? '✓ Débloqué' : '🔒 Premium' })),
          h('b', { text: x.label }), h('p', { text: x.desc })))),
        p.key === 'gratuit' ? h('div', { class: 'row' }, trialButton(), h('a', { class: 'btn', href: `#serveur/${data.id}/premium`, text: 'Voir les offres' })) : null),
    );
  }
  function trialButton() {
    const p = data.plan;
    if (p.key !== 'gratuit' || p.trialUsed) return null;
    return h('button', {
      class: 'btn gold',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await api('POST', 'server/trial', { guildId: data.id }); toast(`Essai de ${p.trialDays} jours activé : tout le premium est débloqué.`); await reload(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
      },
    }, `★ Essai gratuit de ${p.trialDays} jours`);
  }

  // ---------------- Commandes ----------------
  const COMMANDS = [
    ['/ia', 'L’assistant IA', ['Poser une question, code, traduction', 'Parler à l’IA en vocal', 'Voir ou effacer ce que l’IA sait de toi']],
    ['/jeux', 'Tous les jeux', ['Loup-garou, Undercover, imposteur', 'Petit Bac, quiz, action ou vérité', 'Blind test, pendu musical']],
    ['/musique', 'Le lecteur de musique', ['Jouer un son ou une playlist', 'File d’attente, effets, paroles', 'Radio 24 h/24']],
    ['/sanction', 'La modération', ['Avertir, rendre muet, expulser, bannir', 'Casier et notes du staff', 'Nettoyer ou verrouiller un salon']],
    ['/serveur', 'Outils et premium', ['Profil, classement, boutique', 'Sondage, rappel, infos', 'Offre du serveur et parrainage']],
    ['/pannel', 'Les panneaux du staff', ['Tickets, annonces, vérification', 'Construire des salons', 'Bienvenue et sauvegarde']],
  ];
  function commandsPage(panel) {
    panel.append(pageHead('⌨️', 'Commandes', 'Chaque commande ouvre un panneau avec des boutons. Tu peux aussi simplement demander à l’IA en la mentionnant.'),
      h('div', { class: 'card' }, h('div', { class: 'cmds' }, COMMANDS.map(([c, t, list]) => h('div', { class: 'cmd' }, h('code', { text: c }), h('p', { text: t }), h('ul', {}, list.map((x) => h('li', { text: x }))))))),
      h('div', { class: 'split' },
        h('div', { class: 'card' }, h('h2', { text: 'Demander à l’IA' }), h('p', { class: 'sub', text: 'Écris par exemple « @bot lance un undercover » : l’IA répond avec un bouton « Lancer », et tes permissions sont vérifiées au clic.' })),
        previewBox(dcMessage({ bot: false, author: me.user.name, content: '@AI Vercel lance un undercover' }), dcMessage({ content: 'C’est parti, clique pour ouvrir la salle d’attente.', buttons: [{ label: 'Lancer : Undercover' }] }))));
  }

  // ---------------- Tickets et annonces (avec aperçu) ----------------
  function field(label, el, help) { return h('label', { class: 'field' }, h('span', { text: label }), el, help ? h('small', { text: help }) : null); }
  const textChannels = (name) => h('select', { name }, data.channels.filter((c) => c.type === 'text').map((c) => h('option', { value: c.id, text: `# ${c.name}` })));
  const optional = (name, list, prefix = '') => h('select', { name }, [h('option', { value: '', text: '— Aucun —' }), ...list.map((x) => h('option', { value: x.id, text: `${prefix}${x.name}` }))]);
  function swatches(def, onPick) {
    const input = h('input', { type: 'hidden', name: 'color', value: def });
    const box = h('div', { class: 'swatches' });
    for (const c of data.colors) {
      const s = h('button', { type: 'button', class: `swatch${c.key === def ? ' on' : ''}`, title: c.label, 'aria-label': c.label });
      s.style.background = c.hex;
      s.addEventListener('click', () => { input.value = c.key; box.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); s.classList.add('on'); onPick(); });
      box.append(s);
    }
    return h('div', {}, box, input);
  }
  function publishPage(panel, kind) {
    const isTicket = kind === 'ticket';
    const form = h('form', { class: 'fields' });
    const title = h('input', { type: 'text', name: 'title', maxlength: 256, required: true, value: isTicket ? '🎫 Besoin d’aide ?' : '📣 Annonce' });
    const message = h('textarea', { name: 'message', maxlength: 4000, required: true });
    message.value = isTicket ? 'Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff te répond au plus vite, en privé.' : 'Écris ton annonce ici.';
    const button = h('input', { type: 'text', name: 'button', maxlength: 80, value: 'Ouvrir un ticket' });
    const ping = isTicket ? null : h('select', { name: 'ping' }, [h('option', { value: '', text: 'Personne' }), h('option', { value: 'everyone', text: '@everyone' }), ...data.roles.map((r) => h('option', { value: r.id, text: `@${r.name}` }))]);
    const preview = h('div', { class: 'dc' });
    function refresh() {
      const color = data.colors.find((c) => c.key === form.color.value)?.hex ?? '#5865f2';
      const mention = ping?.value ? (ping.value === 'everyone' ? '@everyone' : `@${data.roles.find((r) => r.id === ping.value)?.name}`) : null;
      preview.replaceChildren(dcMessage({
        content: mention ? h('span', { class: 'mention', text: mention }) : null,
        embed: dcEmbed({ color, title: title.value, text: message.value, footer: footerName() }),
        buttons: isTicket ? [{ label: `🎫 ${button.value || 'Ouvrir un ticket'}` }] : [],
      }));
    }
    form.append(
      h('div', { class: 'grid2' }, field('Salon où publier', textChannels('channelId')), field('Couleur', swatches(isTicket ? 'cyan' : 'or', refresh))),
      field('Titre', title), field('Message', message),
    );
    if (isTicket) {
      form.append(
        h('div', { class: 'grid2' }, field('Texte du bouton', button), field('Rôle du staff', optional('staffRoleId', data.roles, '@'), 'Voit et gère les tickets. Vide : les admins.')),
        h('div', { class: 'grid2' },
          field('Catégorie des tickets', optional('categoryId', data.channels.filter((c) => c.type === 'category')), 'Vide : créée à la première ouverture.'),
          field('Salon des archives', optional('logChannelId', data.channels.filter((c) => c.type === 'text'), '# '), 'Reçoit la transcription à la fermeture.')),
        field('Message d’accueil dans le ticket', h('textarea', { name: 'welcome', maxlength: 1000 }), 'Envoyé dans le salon privé quand un membre ouvre un ticket.'),
        h('label', { class: 'switch' }, h('span', { class: 't' }, h('b', { text: 'Un seul ticket ouvert par membre' }), h('small', { text: 'Évite qu’un membre ouvre plusieurs tickets en même temps.' })), h('input', { type: 'checkbox', name: 'unique', checked: true })),
      );
    } else {
      form.append(field('Mentionner', ping, 'Qui est notifié quand l’annonce est publiée.'));
    }
    const submit = h('button', { class: 'btn primary big', type: 'submit', text: isTicket ? 'Publier le panneau de tickets' : 'Publier l’annonce' });
    form.append(h('div', { class: 'row' }, submit));
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const body = { guildId: data.id, kind, ...Object.fromEntries(f.entries()), unique: form.unique ? form.unique.checked : undefined };
      submit.disabled = true;
      try {
        await api('POST', 'server/publish', body);
        toast(isTicket ? 'Panneau de tickets publié.' : 'Annonce publiée.');
        if (isTicket) await reload();
      } catch (err) { toast(err.message, true); } finally { submit.disabled = false; }
    });
    refresh();
    panel.append(h('div', { class: 'split' }, h('div', { class: 'card' }, h('h2', { text: isTicket ? 'Créer un panneau' : 'Écrire l’annonce' }), form), h('div', { class: 'card sticky' }, h('div', { class: 'preview-label', text: 'Aperçu en direct' }), preview)));
  }
  function ticketsPage(panel) {
    const t = data.tickets;
    panel.append(pageHead('🎫', 'Tickets', 'Les membres cliquent sur le bouton : un salon privé s’ouvre avec le staff.'));
    publishPage(panel, 'ticket');
    panel.append(h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', { text: `Panneaux publiés (${t.panels.length})` }),
        t.panels.length ? h('div', { class: 'list' }, t.panels.map((p) => h('div', { class: 'item' }, h('span', { text: p.title }), h('small', { text: p.channel ? `# ${p.channel}` : 'salon supprimé' })))) : h('p', { class: 'sub', text: 'Aucun pour l’instant.' })),
      h('div', { class: 'card' }, h('h2', { text: `Tickets ouverts (${t.open.length})` }),
        t.open.length ? h('div', { class: 'list' }, t.open.map((o) => h('div', { class: 'item' }, h('span', { text: o.channel ? `# ${o.channel}` : 'Ticket' }), h('small', { text: o.user ?? '' })))) : h('p', { class: 'sub', text: 'Aucun ticket ouvert.' }))));
  }
  function announcePage(panel) {
    panel.append(pageHead('📣', 'Annonces', 'Un message mis en forme, publié par le bot dans le salon choisi.'));
    publishPage(panel, 'annonce');
  }

  // ---------------- Classement et sanctions ----------------
  const person = (u) => h('span', { class: 'who' }, u.avatar ? h('img', { src: u.avatar, alt: '' }) : h('span', { class: 'av', text: initials(u.name) }), h('b', { text: u.name }));
  function leaderboardPage(panel) {
    const list = data.leaderboard;
    const max = list[0]?.xp || 1;
    panel.append(pageHead('🏆', 'Classement', 'Les membres qui ont le plus d’XP (messages et vocal).'),
      h('div', { class: 'card' }, list.length ? h('div', { class: 'list' }, list.map((m, i) => h('div', { class: 'item' },
        h('span', { class: 'who' }, h('span', { class: `rank r${i + 1}`, text: i + 1 }), person(m.user)),
        h('div', {}, h('small', { text: `Niveau ${m.level} · ${m.xp.toLocaleString('fr-FR')} XP · ${m.messages.toLocaleString('fr-FR')} messages · ${Math.round(m.voiceMin / 60)} h de vocal` }), h('div', { class: 'bar' }, (() => { const b = h('i'); b.style.width = `${Math.max(4, (m.xp / max) * 100)}%`; return b; })())))))
        : h('p', { class: 'sub', text: 'Personne n’a encore d’XP. Active les niveaux dans le module « Niveaux et récompenses ».' })));
  }
  const KINDS = { manuel: 'Staff', 'insulte-vocal': 'Vocal', 'insulte-protege': 'Écrit', 'insulte-chef': 'Écrit' };
  function sanctionsPage(panel) {
    panel.append(pageHead('⚖️', 'Sanctions', 'Les derniers avertissements du serveur (staff, écrits, vocaux et automatiques). Pour sanctionner : /sanction dans Discord.'),
      h('div', { class: 'card' }, data.sanctions.length ? h('div', { class: 'list' }, data.sanctions.map((s) => h('div', { class: 'item' },
        person(s.user), h('small', { text: `${KINDS[s.kind] ?? (s.kind.startsWith('auto') ? 'Automatique' : 'Autre')} · ${s.reason || 'sans raison'} · ${shortDate(s.at)}` }))))
        : h('p', { class: 'sub', text: 'Aucune sanction pour l’instant.' })));
  }

  // ---------------- Modules (formulaire générique) ----------------
  function control(s, value) {
    const chanOpts = (type) => [h('option', { value: '', text: '— Aucun —' }), ...data.channels.filter((c) => c.type === type).map((c) => h('option', { value: c.id, text: type === 'text' ? `# ${c.name}` : c.name, selected: c.id === value }))];
    switch (s.type) {
      case 'int': return h('input', { type: 'number', min: s.min, max: s.max, value: value ?? s.def ?? '' });
      case 'text': return h('input', { type: 'text', maxlength: s.max ?? 300, value: value ?? s.def ?? '' });
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
  // Aperçus propres à certains modules
  const SECTION_PREVIEW = {
    accueil: (values) => {
      const text = String(values['welcome.message'] ?? '').replaceAll('{membre}', `@${me.user.name}`).replaceAll('{serveur}', data.name).replaceAll('{numero}', String(data.members + 1));
      return [dcMessage({ content: text, extra: h('div', { class: 'card-img' }, h('div', {}, h('b', { text: 'BIENVENUE' }), h('div', { text: me.user.name }), h('small', { text: `MEMBRE N°${data.members + 1} · ${data.name.toUpperCase()}` }))) })];
    },
    niveaux: () => [dcMessage({ embed: dcEmbed({ color: '#5ff0ff', title: `🎉 ${me.user.name} passe niveau 5 !`, text: 'Continue comme ça, le prochain rôle arrive bientôt.', footer: footerName() }) })],
    securite: (values) => [dcMessage({ embed: dcEmbed({ color: '#ed4245', title: '🚨 Raid détecté', text: `${values['antiRaid.joins'] ?? 8} arrivées en ${values['antiRaid.seconds'] ?? 15} secondes.\nLe serveur est protégé pendant 10 minutes.`, footer: 'Journal du serveur' }) })],
    boutique: () => [dcMessage({ embed: dcEmbed({ color: '#faa61a', title: '🛒 Boutique du serveur', text: 'Achète des rôles avec tes jetons.', fields: [['Rôle VIP', '5 000 jetons'], ['Rôle perso', '10 000 jetons']], footer: footerName() }), buttons: [{ label: 'Acheter' }, { label: 'Rôle personnalisé', grey: true }] })],
    vocal: () => [dcMessage({ embed: dcEmbed({ color: '#3ba55d', title: '➕ Ton salon est prêt', text: `Tu es chef de 🎮 Salon de ${me.user.name}. Renomme-le, limite les places ou verrouille-le.` }), buttons: [{ label: 'Renommer', grey: true }, { label: '🔒 Verrouiller', grey: true }] })],
    ia: () => [dcMessage({ bot: false, author: me.user.name, content: '@AI Vercel tu te rappelles à quoi je joue ?' }), dcMessage({ content: 'Évidemment 😏 Valorant, sous ton pseudo habituel. Une partie ce soir ?' })],
  };
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
    const current = () => Object.fromEntries(items.map((s) => [s.key, readControl(s, inputs.get(s.key))]));
    const bar = h('div', { class: 'savebar' }, h('span', { text: 'Aucun changement.' }), h('button', { class: 'btn primary', onclick: save, text: 'Enregistrer' }));
    const preview = h('div', { class: 'dc' });
    const refresh = () => { if (SECTION_PREVIEW[key]) preview.replaceChildren(...SECTION_PREVIEW[key](current())); };
    const card = h('div', { class: 'card' }, h('h2', { text: 'Réglages' }), h('div', { class: 'fields' }, fields));
    card.addEventListener('input', () => { bar.classList.add('dirty'); bar.firstChild.textContent = 'Changements non enregistrés.'; refresh(); });
    card.addEventListener('change', () => { bar.classList.add('dirty'); bar.firstChild.textContent = 'Changements non enregistrés.'; refresh(); });
    async function save(e) {
      panel.querySelectorAll('.field.bad').forEach((f) => { f.classList.remove('bad'); f.querySelector('.err')?.remove(); });
      e.target.disabled = true;
      try {
        await api('POST', 'server/settings', { guildId: data.id, changes: current() });
        toast('Réglages enregistrés.');
        bar.classList.remove('dirty');
        bar.firstChild.textContent = 'Enregistré. Les changements sont déjà actifs sur le serveur.';
        data = await api('GET', `server?id=${data.id}`);
      } catch (err) {
        toast(err.message, true);
        for (const [k, msg] of Object.entries(err.data?.errors ?? {})) {
          const f = panel.querySelector(`.field[data-key="${CSS.escape(k)}"]`);
          if (f) { f.classList.add('bad'); f.append(h('span', { class: 'err', text: msg })); }
        }
      } finally { e.target.disabled = false; }
    }
    refresh();
    panel.append(pageHead(sec.emoji, sec.label, sec.intro),
      SECTION_PREVIEW[key] ? h('div', { class: 'split' }, card, h('div', { class: 'card sticky' }, h('div', { class: 'preview-label', text: 'Aperçu dans Discord' }), preview)) : card,
      bar);
  }

  // ---------------- Premium ----------------
  function premiumOffer(panel) {
    const p = data.plan;
    const countdown = h('b');
    const tick = () => {
      if (!p.until) return;
      const left = Math.max(0, p.until - Date.now());
      countdown.textContent = left ? `${Math.floor(left / 86400000)} j ${Math.floor((left % 86400000) / 3600000)} h ${Math.floor((left % 3600000) / 60000)} min` : 'Terminé';
    };
    tick();
    const timer = setInterval(() => (document.body.contains(countdown) ? tick() : clearInterval(timer)), 30000);
    const rows = [
      ['Tous les modules gratuits', 'y', 'y', 'y'], ['Tickets, annonces, classement', 'y', 'y', 'y'],
      ['IA vocale', '60 min', '600 min', 'Illimitée'], ['Couleurs du serveur', 'n', 'y', 'y'], ['Voix de l’IA au choix', 'n', 'y', 'y'],
      ['Rapport de la semaine', 'n', 'y', 'y'], ['Surveillance Gardien', 'n', 'n', 'y'],
    ];
    const cell = (v) => h('td', { class: v === 'y' ? 'y' : v === 'n' ? 'n' : '', text: v === 'y' ? '✓' : v === 'n' ? '—' : v });
    panel.append(pageHead('⭐', 'Offre premium', 'Plus d’IA vocale et des options pour ton staff. Sans engagement, 31 jours à la fois.', true),
      h('div', { class: 'card premium-card' },
        h('h2', { text: p.key === 'gratuit' ? 'Ton serveur est en offre gratuite' : p.trial ? `Essai ${p.label} en cours` : `Offre ${p.label} active` }),
        h('p', { class: 'sub', text: p.key === 'gratuit'
          ? (p.trialUsed ? 'L’essai gratuit a déjà été utilisé. Prends une offre pour débloquer le premium.' : `Essaie tout le premium gratuitement pendant ${p.trialDays} jours, sans paiement. Ensuite, le serveur repasse en gratuit tout seul.`)
          : 'Tout le premium est débloqué jusqu’à la date de fin.' }),
        p.until ? h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('small', { text: 'Fin' }), h('b', { text: date(p.until) })), h('div', { class: 'stat' }, h('small', { text: 'Temps restant' }), countdown)) : null,
        h('div', { class: 'row' }, trialButton(), ...p.offers.map((o) => h('a', { class: `btn${o.key === 'veilleur' ? ' gold' : ''}`, href: o.pay, target: '_blank', rel: 'noopener', text: `${o.label} · ${o.price}` })))),
      h('div', { class: 'card' }, h('h2', { text: 'Comparer les offres' }),
        h('div', { class: 'table-wrap' }, h('table', { class: 'compare' },
          h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Gratuit' }), h('th', { class: 'gold', text: 'Veilleur · 4,99 €' }), h('th', { class: 'gold', text: 'Gardien · 9,99 €' }))),
          h('tbody', {}, rows.map(([label, ...v]) => h('tr', {}, h('td', { text: label }), ...v.map(cell))))))));
  }

  function premiumPage(panel, key) {
    const page = PREMIUM[key];
    const unlocked = data.plan.features[page.feature];
    const pr = data.premium;
    const preview = h('div', { class: 'dc' });
    let fields;
    let read;
    let refresh = () => {};
    if (page.feature === 'branding') {
      const name = h('input', { type: 'text', maxlength: 60, value: pr.branding.name, placeholder: data.name });
      const color = h('input', { type: 'color', value: pr.branding.color || '#5865f2' });
      fields = [field('Nom affiché sur les messages du bot', name, 'Remplace « AI Vercel » en bas des embeds.'), field('Couleur des embeds', color), h('p', { class: 'sub', text: 'Le logo se change dans Discord : /serveur › Cartes aux couleurs du serveur.' })];
      read = () => ({ name: name.value, color: color.value });
      refresh = () => preview.replaceChildren(dcMessage({ embed: dcEmbed({ color: color.value, title: '🎫 Besoin d’aide ?', text: 'Clique sur le bouton pour ouvrir un ticket.', footer: `${name.value || data.name} · propulsé par AI Vercel` }), buttons: [{ label: '🎫 Ouvrir un ticket' }] }));
    } else if (page.feature === 'voices') {
      const sel = h('select', {}, pr.voice.voices.map((v) => h('option', { value: v.key, text: `${v.key} · ${v.label}`, selected: v.key === pr.voice.current })));
      fields = [field('Voix de l’IA vocale', sel, 'Utilisée à la prochaine conversation vocale.')];
      read = () => ({ voice: sel.value });
      refresh = () => preview.replaceChildren(dcMessage({ embed: dcEmbed({ color: '#a58bff', title: '🗣️ Voix de l’IA', text: `L’IA vocale parlera avec la voix ${sel.value} (${pr.voice.voices.find((v) => v.key === sel.value)?.label ?? ''}).` }) }));
    } else if (page.feature === 'report') {
      const box = h('input', { type: 'checkbox', checked: pr.report });
      fields = [h('label', { class: 'switch' }, h('span', { class: 't' }, h('b', { text: 'Recevoir le rapport chaque dimanche à 20 h' }), h('small', { text: 'En message privé au propriétaire du serveur.' })), box)];
      read = () => ({ enabled: box.checked });
      refresh = () => preview.replaceChildren(dcMessage({ embed: dcEmbed({ color: '#f5c451', title: `📊 Ta semaine sur ${data.name}`, text: 'Voici ce qui s’est passé cette semaine.', fields: [['Messages', '4 812'], ['Membres actifs', '126'], ['Arrivées', '+38'], ['Sanctions', '5']], footer: 'Rapport de la semaine' }) }));
    } else {
      const ids = h('textarea', { placeholder: 'Un identifiant Discord par ligne' }); ids.value = pr.guard.protectedIds.join('\n');
      const words = h('textarea', { placeholder: 'Un mot par ligne' }); words.value = pr.guard.words.join('\n');
      fields = [field('Membres protégés', ids, 'Insultés en vocal : avertissement, puis exclusion au 3e.'), field('Mots interdits en vocal', words)];
      read = () => ({ protectedIds: ids.value, words: words.value });
      refresh = () => preview.replaceChildren(dcMessage({ content: h('span', { class: 'mention', text: '@Karim' }), embed: dcEmbed({ color: '#ed4245', title: '⚠️ Avertissement 2 / 3', text: 'Insulte en vocal envers un membre protégé.\nAu 3e avertissement : exclusion temporaire.', footer: 'Surveillance Gardien' }), buttons: [{ label: 'Contester', grey: true }] }));
    }
    const formCard = h('div', { class: 'card premium-card' }, h('h2', { text: 'Réglages' }), h('div', { class: 'fields' }, fields));
    formCard.addEventListener('input', refresh);
    formCard.addEventListener('change', refresh);
    refresh();
    panel.append(pageHead(page.emoji, page.label, page.desc, true));
    const content = h('div', { class: 'split' }, formCard, h('div', { class: 'card sticky' }, h('div', { class: 'preview-label', text: 'Aperçu dans Discord' }), preview));
    if (!unlocked) {
      const p = data.plan;
      panel.append(h('div', { class: 'locked-wrap' }, h('div', { class: 'blur', 'aria-hidden': 'true' }, content),
        h('div', { class: 'lock-overlay' }, h('div', { class: 'lock-box' },
          h('div', { class: 'lk', text: '🔒' }),
          h('h3', { text: 'Débloqué avec Premium' }),
          h('p', { text: `« ${page.label} » fait partie du premium. Dès que ton serveur a l’offre (ou l’essai), ce menu s’ouvre ici.` }),
          h('ul', { class: 'checks' }, page.perks.map((x) => h('li', { text: x }))),
          h('div', { class: 'row' }, trialButton(), h('a', { class: `btn${p.trialUsed ? ' gold' : ''}`, href: `#serveur/${data.id}/premium`, text: 'Voir les offres' }))))));
      return;
    }
    const btn = h('button', {
      class: 'btn gold',
      onclick: async () => {
        btn.disabled = true;
        try { await api('POST', 'server/premium', { guildId: data.id, feature: page.feature, data: read() }); toast('Enregistré.'); data = await api('GET', `server?id=${data.id}`); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
      },
    }, 'Enregistrer');
    formCard.append(h('ul', { class: 'checks' }, page.perks.map((x) => h('li', { text: x }))), h('div', { class: 'row' }, btn));
    panel.append(content);
  }

  start();
}());
