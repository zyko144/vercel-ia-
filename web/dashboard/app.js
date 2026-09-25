// Tableau de bord de l'IA : l'interface. Aucune donnée n'est insérée comme du HTML :
// tout passe par textContent, pour qu'un pseudo ou un message ne puisse jamais injecter de code.
'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Crée un élément : h('div', { class: 'card', on: { click } }, enfant, 'texte', [liste]). */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'on') for (const [event, fn] of Object.entries(value)) el.addEventListener(event, fn);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key in el && typeof value !== 'string') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, ...children);
    return el;
  }
  /** Ajoute des enfants (éléments, textes, listes imbriquées) ; null et false sont ignorés. */
  function append(el, ...children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs = {}, ...children) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    for (const child of children.flat()) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
  }

  const ICONS = {
    alerte: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    ok: 'M20 6 9 17l-5-5',
    info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  };
  const icon = (name) => s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: ICONS[name] }));

  // ===================== formats =====================
  const nf = new Intl.NumberFormat('fr-FR');
  const num = (n) => (n === null || n === undefined ? '—' : nf.format(n));
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  function ago(at) {
    if (!at) return '—';
    const sec = Math.round((at - Date.now()) / 1000);
    const abs = Math.abs(sec);
    if (abs < 60) return rtf.format(sec, 'second');
    if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
    return rtf.format(Math.round(sec / 86400), 'day');
  }
  function duree(seconds) {
    const s2 = Math.max(0, Math.round(seconds));
    const d = Math.floor(s2 / 86400);
    const hh = Math.floor((s2 % 86400) / 3600);
    const mm = Math.floor((s2 % 3600) / 60);
    if (d) return `${d} j ${hh} h`;
    if (hh) return `${hh} h ${mm} min`;
    return `${mm} min`;
  }
  const ms = (v) => (v === null || v === undefined ? '—' : v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : `${v} ms`);
  const heure = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateHeure = (at) => new Date(at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const minsec = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  // ===================== API =====================
  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data; }
  }
  async function call(method, path, body) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (method === 'POST') {
      init.headers['Content-Type'] = 'application/json';
      init.headers['X-Dashboard'] = '1';
      init.body = JSON.stringify(body ?? {});
    }
    let response;
    try {
      response = await fetch(`/dashboard/api/${path}`, init);
    } catch {
      throw new ApiError('Le bot ne répond pas. Il redémarre peut-être : réessaie dans un instant.', 0);
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== 'login') {
      montrer('login');
      throw new ApiError('Ta session a expiré, reconnecte-toi.', 401);
    }
    if (!response.ok) throw new ApiError(data.error ?? `Erreur ${response.status}`, response.status, data);
    return data;
  }
  const api = { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };

  // ===================== petits outils d'interface =====================
  function toast(message, bad = false) {
    const t = h('div', { class: `toast${bad ? ' bad' : ''}`, text: message });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), bad ? 6000 : 3500);
  }

  function confirmer({ titre, texte, bouton = 'Confirmer' }) {
    const dialog = $('#confirmation');
    $('#confirmation-titre').textContent = titre;
    $('#confirmation-texte').textContent = texte;
    $('#confirmation-oui').textContent = bouton;
    return new Promise((resolve) => {
      const fin = (v) => { dialog.close(); cleanup(); resolve(v); };
      const oui = () => fin(true);
      const non = () => fin(false);
      const cancel = (e) => { e.preventDefault(); fin(false); };
      function cleanup() {
        $('#confirmation-oui').removeEventListener('click', oui);
        $('#confirmation-non').removeEventListener('click', non);
        dialog.removeEventListener('cancel', cancel);
      }
      $('#confirmation-oui').addEventListener('click', oui);
      $('#confirmation-non').addEventListener('click', non);
      dialog.addEventListener('cancel', cancel);
      dialog.showModal();
      $('#confirmation-non').focus();
    });
  }

  const card = (titre, ...children) => h('section', { class: 'card' }, titre ? h('h2', { text: titre }) : null, ...children);
  const pill = (texte, etat) => h('span', { class: `pill ${etat ?? ''}`, text: texte });
  const vide = (titre, texte) => h('div', { class: 'empty' }, h('b', { text: titre }), texte);
  function personne(user) {
    const img = user?.avatar ? h('img', { src: user.avatar, alt: '', width: 28, height: 28, loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'ph', 'aria-hidden': 'true' });
    return h('span', { class: 'person' }, img, h('span', { text: user?.name ?? 'Inconnu' }));
  }
  function ligne(titre, sousTitre, droite) {
    return h('div', { class: 'row' }, h('div', { class: 'what' }, h('b', { text: titre }), sousTitre ? h('span', { text: sousTitre }) : null), droite);
  }
  async function action(bouton, fn) {
    bouton.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message, true);
    } finally {
      bouton.disabled = false;
    }
  }

  /** Histogramme SVG : barres des demandes, avec la part d'erreurs en rouge. */
  function histogramme(points, { etiquette }) {
    const W = 720;
    const H = 200;
    const pad = { l: 34, r: 8, t: 10, b: 24 };
    const max = Math.max(4, ...points.map((p) => p.a));
    const pas = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / pas) * pas;
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const bw = iw / points.length;
    const y = (v) => pad.t + ih - (v / top) * ih;
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Graphique de l’activité' });
    for (const v of [0, top / 2, top]) {
      svg.append(s('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
      svg.append(s('text', { class: 'axis', x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, num(v)));
    }
    points.forEach((p, i) => {
      const x = pad.l + i * bw + bw * 0.15;
      const w = bw * 0.7;
      if (p.a > 0) svg.append(s('rect', { class: 'bar', x, y: y(p.a), width: w, height: Math.max(1, y(0) - y(p.a)), rx: 2 }, s('title', {}, `${p.label} : ${p.a} demande(s), ${p.e} erreur(s)`)));
      if (p.e > 0) svg.append(s('rect', { class: 'bar-err', x, y: y(p.e), width: w, height: Math.max(1, y(0) - y(p.e)), rx: 2 }, s('title', {}, `${p.label} : ${p.e} erreur(s)`)));
      if (etiquette(i)) svg.append(s('text', { class: 'axis', x: x + w / 2, y: H - 6, 'text-anchor': 'middle' }, p.label));
    });
    return h('div', {}, svg, h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'a' }), 'Demandes'), h('span', {}, h('i', { class: 'e' }), 'Erreurs')));
  }

  function barres(items) {
    const max = Math.max(1, ...items.map((i) => i.n));
    return h('div', { class: 'bars' }, items.map((i) => {
      const fill = h('i');
      fill.style.width = `${(i.n / max) * 100}%`;
      return h('div', { class: 'hbar' }, h('span', { text: i.label }), h('span', { class: 'track' }, fill), h('span', { class: 'n', text: num(i.n) }));
    }));
  }

  // ===================== les vues =====================
  const PHASES = { setup: 'Préparation', wolves: 'Nuit · les loups', witch: 'Nuit · la sorcière', dawn: 'Aube', discussion: 'Débat', vote: 'Vote', hunter: 'Le chasseur tire' };
  const TAGS = {
    conversation: 'Conversations', commandes: 'Commandes', outils: 'Outils', 'clic droit': 'Clic droit',
    tâches: 'Jeux et modération', vocal: 'Surveillance vocale', images: 'Images', test: 'Tests d’ici', autre: 'Autre',
  };
  const ETAT_ALERTE = { critique: 'critique', attention: 'attention', info: 'info' };

  const VUES = {
    apercu: {
      titre: 'Vue d’ensemble',
      intro: 'L’état du bot et de l’IA en un coup d’œil. Ce qui demande ton attention apparaît en haut.',
      auto: 15000,
      async rendre(zone) {
        const d = await api.get('apercu');
        const ai = d.ai;
        majBadges({ conversations: ai.conversations, jeux: d.games });
        const tauxErreur = ai.today.requests ? Math.round((ai.today.errors / ai.today.requests) * 100) : 0;
        const alertes = d.alerts.length
          ? d.alerts.map((a) => h('div', { class: `alert ${ETAT_ALERTE[a.level] ?? 'info'}` }, icon(a.level === 'info' ? 'info' : 'alerte'), h('span', { text: a.text })))
          : [h('div', { class: 'alert ok' }, icon('ok'), h('span', { text: 'Tout va bien : rien à signaler.' }))];
        const kpi = (label, value, hint, bad) => h('div', { class: `card kpi${bad ? ' bad' : ''}` }, h('div', { class: 'label', text: label }), h('div', { class: 'value', text: value }), h('div', { class: 'hint', text: hint }));
        const services = [
          ['Discord', d.bot.ready ? `Connecté · ${d.bot.ping} ms` : 'Déconnecté', d.bot.ready ? 'ok' : 'bad'],
          ['IA', ai.paused ? 'En pause' : `Active · ${ai.model}`, ai.paused ? 'warn' : 'ok'],
          ['Recherche Google', ai.webSearch ? (ai.webSearchAvailable ? 'Activée' : 'Bloquée par le quota') : 'Coupée', ai.webSearch ? (ai.webSearchAvailable ? 'ok' : 'warn') : ''],
          ['Images', ai.imagesEnabled ? `Activées · ${ai.imagesToday} aujourd’hui` : 'Coupées', ai.imagesEnabled ? 'ok' : ''],
          ['Musique', d.music.nodes ? `${d.music.nodesOnline}/${d.music.nodes} serveurs audio en ligne` : 'Lecteur local', d.music.nodes && !d.music.nodesOnline ? 'warn' : 'ok'],
          ['IA vocale', d.voiceAi.enabled ? (d.voiceAi.busy ? 'En conversation' : `Prête · ${d.voiceAi.voice}`) : 'Pas de token', d.voiceAi.enabled ? 'ok' : ''],
          ['Casino', d.services.casino ? 'Casinho en ligne' : 'Pas de token', d.services.casino ? 'ok' : ''],
          ['Surveillance vocale', d.services.voiceGuard.enabled ? `Active · ${d.services.voiceGuard.checks} écoute(s), ${d.services.voiceGuard.insults} insulte(s)` : 'Coupée', d.services.voiceGuard.enabled ? 'ok' : ''],
          ['Stockage', d.services.storage, d.services.storage === 'Supabase' ? 'ok' : 'warn'],
        ];
        append(zone, [
          card('À surveiller', ...alertes),
          h('div', { class: 'grid cols-4' },
            kpi('Réponses de l’IA aujourd’hui', num(ai.today.requests), `${num(ai.last24.requests)} sur les dernières 24 h`),
            kpi('Erreurs aujourd’hui', num(ai.today.errors), ai.today.requests ? `${tauxErreur} % des demandes` : 'Aucune demande encore', tauxErreur > 20),
            kpi('Temps de réponse', ms(ai.latency.median), ai.latency.p95 ? `9 réponses sur 10 en moins de ${ms(ai.latency.p95)}` : 'Pas encore mesuré'),
            kpi('Conversations en mémoire', num(ai.conversations), 'Oubliées après 45 min sans message')),
          h('div', { class: 'grid cols-3-1' },
            card('Activité de l’IA sur 24 heures', h('p', { class: 'sub', text: 'Une barre par heure. En rouge, les demandes qui ont échoué.' }),
              histogramme(ai.hours.map((p) => ({ label: `${new Date(p.at).getHours()} h`, a: p.requests, e: p.errors })), { etiquette: (i) => i % 3 === 2 })),
            card('État des services', h('div', { class: 'rows' }, services.map(([nom, texte, etat]) => ligne(nom, null, pill(texte, etat)))))),
          h('div', { class: 'grid cols-2' },
            card('Serveurs', d.guilds.length
              ? h('div', { class: 'rows' }, d.guilds.map((g) => ligne(g.name, `${num(g.members)} membres · vocal : ${g.voice}`, null)))
              : vide('Aucun serveur', 'Le bot n’est encore sur aucun serveur.')),
            card('Le bot',
              h('div', { class: 'rows' },
                ligne('Tourne sur', d.services.instance?.startsWith('PC') ? 'Render est sans doute arrêté : le PC a pris le relais' : 'vercel-ia.onrender.com', h('span', { class: 'mono', text: d.services.instance ?? '—' })),
                ligne('En ligne depuis', null, h('span', { class: 'num', text: duree(d.bot.uptime) })),
                ligne('Mémoire utilisée', 'Render gratuit : 512 Mo au total', h('span', { class: 'num', text: `${d.bot.ramMb} Mo` })),
                ligne('Réactivité', 'Retard moyen de la boucle Node.js', h('span', { class: 'num', text: `${d.bot.loopMs} ms` })),
                ligne('Modèle de secours', 'Prend le relais si le principal sature', h('span', { class: 'mono', text: ai.fallback })),
                ligne('Site', null, d.services.site ? h('a', { href: d.services.site, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir' }) : h('span', { class: 'mute', text: 'pas d’adresse' }))),
              boutonRedemarrer(d))),
          card('Surveillance vocale : dernières écoutes',
            h('p', { class: 'sub', text: d.services.voiceGuard.enabled
              ? 'Ce que le bot a entendu dans son vocal et ce qu’il a décidé. Il n’entend que le salon vocal où il est, et rien pendant la musique jouée par Lavalink.'
              : 'Coupée : active-la dans IA › Réglages › Surveillance vocale.' }),
            d.services.voiceGuard.recent?.length
              ? h('div', { class: 'rows' }, d.services.voiceGuard.recent.map((e) => ligne(`« ${e.heard || '…'} »`, `${e.who} · ${ago(e.at)}`, pill(e.decision, /^INSULTE/.test(e.decision) ? 'bad' : /^ignoré/.test(e.decision) ? 'warn' : ''))))
              : vide('Rien entendu pour l’instant', 'Dès que quelqu’un parle dans le vocal du bot, ça apparaît ici.')),
          card('Raccourcis', h('div', { class: 'shortcuts' },
            [['#envoyer', '✉️', 'Écrire en tant que le bot', 'Message, annonce ou sondage'], ['#moderation', '🛡️', 'Modérer un membre', 'Muet, expulsion, bannissement'], ['#musique', '🎵', 'Lancer de la musique', 'Un titre ou un lien'],
              ['#rappels', '⏰', 'Programmer un rappel', 'Pour toi ou un membre'], ['#ia', '🧠', 'Régler l’IA', 'Modèle, consignes, pause'], ['#or', '🪙', 'Pièces d’or', 'Bourses et boutique']].map(([href, emoji, titre, sous]) =>
              h('a', { class: 'shortcut', href }, h('span', { class: 'emoji', 'aria-hidden': 'true', text: emoji }), h('b', { text: titre }), h('span', { text: sous }))))),
          card('Dernières actions sur le tableau de bord', d.recent.length
            ? h('div', { class: 'rows' }, d.recent.map((e) => ligne(e.action, `${e.user?.name ?? 'Système'} · ${ago(e.at)}${e.detail ? ` · ${e.detail}` : ''}`, null)))
            : vide('Rien pour l’instant', 'Les connexions et les modifications apparaîtront ici.')),
        ]);
      },
    },

    ia: {
      titre: 'IA',
      intro: 'À quoi sert l’IA, en combien de temps elle répond, et ses réglages. Les changements s’appliquent tout de suite, sans redémarrer.',
      async rendre(zone) {
        const d = await api.get('ia');
        const m = d.metrics;
        const usages = Object.entries(m.today.tags).map(([tag, n]) => ({ label: TAGS[tag] ?? tag, n })).sort((a, b) => b.n - a.n);
        append(zone, [
          h('div', { class: 'grid cols-3-1' },
            card('Les 14 derniers jours', h('p', { class: 'sub', text: 'Demandes par jour (réponses, commandes, jeux, images).' }),
              histogramme(m.days.map((p) => ({ label: p.day.slice(8, 10), a: p.requests, e: p.errors })), { etiquette: () => true })),
            card('Aujourd’hui, l’IA a servi à…', usages.length ? barres(usages) : vide('Pas encore de demande', 'Les usages apparaîtront au fil de la journée.'))),
          h('div', { class: 'grid cols-2' }, carteTest(), carteErreurs(m.errors)),
          carteReglages(d.settings),
        ]);
      },
    },

    conversations: {
      titre: 'Conversations',
      intro: 'L’IA se souvient de chaque conversation pendant 45 minutes, pour qu’on n’ait pas à tout répéter. Tu peux effacer cette mémoire. Le contenu des messages n’est jamais affiché ici.',
      auto: 20000,
      async rendre(zone) {
        const d = await api.get('conversations');
        majBadges({ conversations: d.conversations.length });
        const toutEffacer = h('button', { class: 'btn danger', type: 'button', text: 'Tout effacer', disabled: !d.conversations.length });
        toutEffacer.addEventListener('click', async () => {
          if (!await confirmer({ titre: 'Effacer toute la mémoire ?', texte: `L’IA oubliera les ${d.conversations.length} conversation(s) en cours. Les membres devront reformuler leur contexte.`, bouton: 'Tout effacer' })) return;
          action(toutEffacer, async () => {
            const r = await api.post('conversations/effacer', { tout: true });
            toast(`${r.count} conversation(s) effacée(s).`);
            rafraichir();
          });
        });
        append(zone, card(null,
          h('div', { class: 'actions' }, h('p', { class: 'sub', text: `${d.conversations.length} conversation(s) en mémoire.` }), h('span', { class: 'spacer' }), toutEffacer),
          d.conversations.length
            ? h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: 'Membre' }), h('th', { class: 'right', text: 'Échanges' }), h('th', { text: 'Dernier message' }), h('th', { text: 'Oubliée' }), h('th', { class: 'right', text: '' }))),
              h('tbody', {}, d.conversations.map((c) => {
                const b = h('button', { class: 'btn small', type: 'button', text: 'Effacer' });
                b.addEventListener('click', () => action(b, async () => {
                  await api.post('conversations/effacer', { key: c.key });
                  toast(`Conversation de ${c.user?.name ?? 'ce membre'} effacée.`);
                  rafraichir();
                }));
                return h('tr', {}, h('td', {}, personne(c.user)), h('td', { class: 'right num', text: num(c.exchanges) }), h('td', { text: ago(c.updatedAt) }), h('td', { text: ago(c.expiresAt) }), h('td', { class: 'right' }, b));
              }))))
            : vide('Aucune conversation en mémoire', 'Personne n’a parlé à l’IA dans les 45 dernières minutes.')));
      },
    },

    envoyer: {
      titre: 'Écrire en tant que le bot',
      intro: 'Poste un message, une annonce avec une belle carte, ou un sondage, dans n’importe quel salon. Personne n’est mentionné sauf si tu le choisis.',
      async rendre(zone) {
        const d = await serveurs(true);
        if (!d.guilds.length) return append(zone, aucunServeur());
        append(zone, h('div', { class: 'grid cols-2' }, carteMessage(d), h('div', { class: 'stack' }, carteSondage(d), carteAideEnvoi())));
      },
    },

    moderation: {
      titre: 'Modération',
      intro: 'Cherche un membre puis rends-le muet, expulse-le ou bannis-le. Le chef est protégé, et tout est noté dans le journal de sécurité et dans le journal d’audit Discord.',
      async rendre(zone) {
        const d = await serveurs(true);
        if (!d.guilds.length) return append(zone, aucunServeur());
        append(zone, carteMembres(d), h('div', { class: 'grid cols-2' }, carteNettoyer(d), carteDroits(d)));
      },
    },

    monserveur: {
      titre: 'Mon serveur',
      intro: 'Tout ce qui se règle par serveur : sécurité, niveaux, boutique, bienvenue, vocal et IA. Choisis une catégorie, modifie, enregistre.',
      etat: { section: 'securite' },
      async rendre(zone) {
        const g = await serveurs(true);
        if (!g.guilds.length) return append(zone, aucunServeur());
        const etat = VUES.monserveur.etat;
        const serveur = selectServeur(g.guilds, localStore('serveur'));
        const guild = () => g.guilds.find((x) => x.id === serveur.value);
        const d = await api.get(`serveur/reglages?${new URLSearchParams({ serveur: serveur.value })}`);
        serveur.addEventListener('change', () => { localStore('serveur', serveur.value); rafraichir(); });
        const onglets = h('div', { class: 'tabs', role: 'tablist' }, Object.entries(d.sections).map(([key, sec]) => {
          const b = h('button', { class: `tab${key === etat.section ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': key === etat.section ? 'true' : 'false', text: `${sec.emoji} ${sec.label}` });
          b.addEventListener('click', () => { etat.section = key; rafraichir(); });
          return b;
        }));
        const sec = d.sections[etat.section];
        const reglages = d.settings.filter((r) => r.section === etat.section);
        const initial = Object.fromEntries(reglages.map((r) => [r.key, r.value]));
        const valeurs = { ...initial };
        const erreurs = {};
        const pareil = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        const barre = h('div', { class: 'savebar', hidden: true });
        const compte = h('span');
        const annuler = h('button', { class: 'btn small', type: 'button', text: 'Annuler' });
        const enregistrer = h('button', { class: 'btn small primary', type: 'button', text: 'Enregistrer' });
        append(barre, compte, h('div', { class: 'actions' }, annuler, enregistrer));
        const blocs = {};
        const maj = () => {
          const n = Object.keys(valeurs).filter((k) => !pareil(valeurs[k], initial[k])).length;
          barre.hidden = !n;
          compte.textContent = `${n} changement(s) non enregistré(s)`;
          for (const [k, b] of Object.entries(blocs)) b.classList.toggle('changed', !pareil(valeurs[k], initial[k]));
        };
        const liste = (items, vide) => [h('option', { value: '', text: vide }), ...items.map((x) => h('option', { value: x.id, text: x.label }))];
        const form = h('div', {});
        for (const r of reglages) {
          const id = `cfg-${r.key.replace(/\W/g, '-')}`;
          let input;
          const gd = guild();
          if (r.type === 'bool') {
            const box = h('input', { type: 'checkbox', id, checked: Boolean(r.value) });
            box.addEventListener('change', () => { valeurs[r.key] = box.checked; maj(); });
            input = h('span', { class: 'switch' }, box, h('i'));
          } else if (['channel', 'voice', 'category', 'role'].includes(r.type)) {
            const items = r.type === 'channel' ? gd.channels.map((c) => ({ id: c.id, label: `# ${c.name}${c.category ? ` · ${c.category}` : ''}` }))
              : r.type === 'voice' ? gd.voices.map((c) => ({ id: c.id, label: `🔊 ${c.name}` }))
                : r.type === 'category' ? (gd.categories ?? []).map((c) => ({ id: c.id, label: `📁 ${c.name}` }))
                  : gd.roles.map((x) => ({ id: x.id, label: `@${x.name}` }));
            input = h('select', { id }, liste(items, '— aucun —'));
            input.value = r.value ?? '';
            input.addEventListener('change', () => { valeurs[r.key] = input.value || null; maj(); });
          } else if (r.type === 'choice') {
            input = h('select', { id }, r.options.map((o) => h('option', { value: o, text: o })));
            input.value = r.value ?? r.options[0];
            input.addEventListener('change', () => { valeurs[r.key] = input.value; maj(); });
          } else if (r.type === 'int') {
            input = h('input', { type: 'number', id, min: r.min, max: r.max, step: 1, value: r.value ?? '', inputmode: 'numeric' });
            input.addEventListener('input', () => { valeurs[r.key] = input.value === '' ? null : Number(input.value); maj(); });
          } else if (r.type === 'list') {
            input = h('textarea', { id, rows: 4, spellcheck: 'false' });
            input.value = (r.value ?? []).join('\n');
            input.addEventListener('input', () => { valeurs[r.key] = input.value.split('\n').map((x) => x.trim()).filter(Boolean); maj(); });
          } else {
            input = h('input', { type: 'text', id, value: r.value ?? '', maxlength: r.max ?? 300 });
            input.addEventListener('input', () => { valeurs[r.key] = input.value; maj(); });
          }
          const erreur = h('p', { class: 'error', hidden: true });
          erreurs[r.key] = erreur;
          const bloc = h('div', { class: 'field' },
            h('div', { class: 'top' }, h('label', { for: id, text: r.label }), r.type === 'bool' ? input : null),
            r.type === 'bool' ? null : input,
            r.help ? h('p', { class: 'help', text: r.help }) : null, erreur);
          blocs[r.key] = bloc;
          form.append(bloc);
        }
        annuler.addEventListener('click', () => rafraichir());
        enregistrer.addEventListener('click', () => action(enregistrer, async () => {
          for (const e of Object.values(erreurs)) e.hidden = true;
          const changes = Object.fromEntries(Object.keys(valeurs).filter((k) => !pareil(valeurs[k], initial[k])).map((k) => [k, valeurs[k]]));
          try {
            const r = await api.post('serveur/reglages', { guildId: serveur.value, changes });
            toast(r.changed.length ? `Enregistré (${r.changed.length}).` : 'Rien à changer.');
            rafraichir();
          } catch (err) {
            for (const [k, m] of Object.entries(err.data?.errors ?? {})) if (erreurs[k]) { erreurs[k].textContent = m; erreurs[k].hidden = false; }
            throw err;
          }
        }));
        append(zone, h('div', { class: 'stack' },
          card(null, h('div', { class: 'grid cols-2' }, champ('Serveur', serveur)), onglets),
          card(`${sec.emoji} ${sec.label}`, h('p', { class: 'sub', text: sec.intro }), form, barre)));
      },
    },

    sanctions: {
      titre: 'Sanctions et offres',
      intro: 'Tous les avertissements (écrits, vocaux et donnés par le staff), et l’offre de chaque serveur. Tu peux effacer une sanction donnée par erreur.',
      auto: 30000,
      async rendre(zone) {
        const [d, p] = await Promise.all([api.get('sanctions'), api.get('premium')]);
        const KINDS = { 'insulte-vocal': ['Vocal', 'bad'], 'insulte-protege': ['Écrit', 'warn'], 'insulte-chef': ['Écrit', 'warn'], manuel: ['Staff', 'info'] };
        append(zone, [
          card('Offre de chaque serveur', h('p', { class: 'sub', text: 'Pour activer une offre payée : dans Discord, /serveur › Activer une offre (chef).' }),
            h('div', { class: 'rows' }, p.servers.map((x) => ligne(x.name, x.until ? `${x.trial ? 'Essai' : 'Payé'} jusqu’au ${dateHeure(x.until)}` : x.trialUsed ? 'Essai déjà utilisé' : 'Essai gratuit disponible', pill(`${x.emoji} ${x.plan}`, x.plan === 'Gratuit' ? '' : 'ok'))))),
          card(`Paiements PayPal (${num(p.payments?.length ?? 0)})`, h('p', { class: 'sub', text: `Mode : ${p.paypal ?? '—'}. En automatique, l’offre s’active toute seule 31 jours après le paiement.` }),
            p.payments?.length
              ? h('div', { class: 'rows' }, p.payments.map((x) => ligne(`${x.amount} € · ${x.plan}`, `${x.guild} · ${dateHeure(x.at)}`, pill('Payé', 'ok'))))
              : vide('Aucun paiement', 'Les paiements PayPal vérifiés apparaîtront ici.')),
          card(`Historique des sanctions (${num(d.total)})`, d.sanctions.length
            ? h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: 'Quand' }), h('th', { text: 'Membre' }), h('th', { text: 'Type' }), h('th', { text: 'Raison' }), h('th', { text: 'Serveur' }), h('th', { class: 'right', text: '' }))),
              h('tbody', {}, d.sanctions.map((x) => {
                const b = h('button', { class: 'btn small', type: 'button', text: 'Effacer' });
                b.addEventListener('click', async () => {
                  if (!await confirmer({ titre: 'Effacer cette sanction ?', texte: `${x.user?.name ?? 'Ce membre'} aura un avertissement de moins.`, bouton: 'Effacer' })) return;
                  action(b, async () => { await api.post('sanctions/effacer', { guildId: x.guildId, userId: x.userId, at: x.at }); toast('Sanction effacée.'); rafraichir(); });
                });
                const [label, etat] = KINDS[x.kind] ?? (x.kind?.startsWith('auto') ? ['Auto', 'warn'] : ['Autre', '']);
                return h('tr', {}, h('td', { class: 'num', text: dateHeure(x.at) }), h('td', {}, personne(x.user)), h('td', {}, pill(label, etat)), h('td', { class: 'mute', text: x.reason ?? '—' }), h('td', { text: x.guild }), h('td', { class: 'right' }, b));
              }))))
            : vide('Aucune sanction', 'Les avertissements apparaîtront ici.')),
        ]);
      },
    },

    rappels: {
      titre: 'Rappels',
      intro: 'Les rappels en attente (créés avec /rappel ou d’ici). Le bot les envoie en MP, ou dans le salon choisi si les MP sont fermés.',
      garder: true,
      auto: 30000,
      async rendre(zone) {
        let liste = $('#rappels-liste', zone);
        if (!liste) {
          const d = await serveurs();
          liste = h('div', { id: 'rappels-liste' });
          append(zone, h('div', { class: 'stack' }, d.guilds.length ? carteNouveauRappel(d) : null, card('En attente', liste)));
        }
        const r = await api.get('rappels');
        liste.replaceChildren(r.reminders.length
          ? h('div', { class: 'rows' }, r.reminders.map((x) => {
            const b = h('button', { class: 'btn small', type: 'button', text: 'Supprimer' });
            b.addEventListener('click', () => action(b, async () => { await api.post('rappels/supprimer', { id: x.id }); toast('Rappel supprimé.'); rafraichir(); }));
            return h('div', { class: 'row' }, h('div', { class: 'what' }, h('b', { text: x.text }), h('span', {}, personne(x.user), ` · ${dateHeure(x.at)} (${ago(x.at)})${x.channel ? ` · #${x.channel}` : ''}`)), b);
          }))
          : vide('Aucun rappel en attente', 'Crée-en un ci-dessus, ou avec /rappel dans Discord.'));
      },
    },

    jeux: {
      titre: 'Jeux en cours',
      intro: 'Les parties de loup-garou et d’imposteur en cours sur tes serveurs. Tu peux en arrêter une si elle est bloquée.',
      auto: 10000,
      async rendre(zone) {
        const d = await api.get('jeux');
        majBadges({ jeux: d.games.length });
        if (!d.games.length) return append(zone, card(null, vide('Aucune partie en cours', 'Lance /jeu-loupgarou ou /jeu-imposteur dans Discord.')));
        return append(zone, h('div', { class: 'grid cols-2' }, d.games.map((g) => {
          const stop = h('button', { class: 'btn danger small', type: 'button', text: 'Arrêter la partie' });
          stop.addEventListener('click', async () => {
            if (!await confirmer({ titre: `Arrêter cette partie de ${g.kind.toLowerCase()} ?`, texte: 'Les joueurs verront « Partie arrêtée » avec tous les rôles révélés.', bouton: 'Arrêter' })) return;
            action(stop, async () => { await api.post('jeux/arreter', { id: g.id }); toast('Partie arrêtée.'); rafraichir(); });
          });
          return card(`${g.emoji} ${g.kind}`,
            h('p', { class: 'sub', text: `${g.server ?? 'Serveur'} · commencée ${ago(g.startedAt)}` }),
            h('div', { class: 'rows' },
              ligne('Étape', null, pill(PHASES[g.phase] ?? g.phase ?? '—', 'info')),
              ligne('Joueurs', null, h('span', { class: 'num', text: `${g.alive ?? '—'} en vie sur ${g.players ?? '—'}` })),
              ligne('Tour', null, h('span', { class: 'num', text: num(g.round) })),
              ligne('Narrateur vocal', null, pill(g.voice ? 'Oui' : 'Non', g.voice ? 'ok' : '')),
              g.test ? ligne('Partie de test', 'Des bots complètent la table', pill('Test', 'warn')) : null),
            h('div', { class: 'actions' }, stop));
        })));
      },
    },

    musique: {
      titre: 'Musique',
      intro: 'Lance un son, gère la file et le volume, et surveille les serveurs audio (Lavalink) qui lisent la musique.',
      auto: 8000,
      garder: true,
      async rendre(zone) {
        let lecteursZone = $('#musique-lecteurs', zone);
        if (!lecteursZone) {
          const g = await serveurs();
          lecteursZone = h('div', { id: 'musique-lecteurs' });
          append(zone, h('div', { class: 'stack' }, g.guilds.length ? carteJouer(g) : null, lecteursZone, h('div', { id: 'musique-serveurs' })));
        }
        const d = await api.get('musique');
        const lecteurs = d.players.filter((p) => p.current);
        // Ne pas redessiner sous la souris d'un réglage de volume en cours
        if (!lecteursZone.contains(document.activeElement) || document.activeElement.type !== 'range') {
          lecteursZone.replaceChildren(lecteurs.length
            ? h('div', { class: 'grid cols-2' }, lecteurs.map(carteLecteur))
            : card(null, vide('Rien ne joue en ce moment', 'Lance un son ci-dessus, avec /play, ou en écrivant un titre dans le salon jukebox.')));
        }
        $('#musique-serveurs', zone).replaceChildren(h('div', { class: 'grid cols-2' },
          card('Serveurs audio', d.nodes.length
            ? h('div', { class: 'rows' }, d.nodes.map((n) => ligne(n.name, n.connected ? `v${n.version ?? '?'} · ${n.players} lecteur(s)${n.cpu !== null ? ` · CPU ${Math.round(n.cpu * 100)} %` : ''}` : 'Injoignable',
              pill(!n.connected ? 'Hors ligne' : n.incompatible ? 'Refusé par Discord' : n.broken ? 'Problèmes de lecture' : 'En ligne', !n.connected || n.incompatible ? 'bad' : n.broken ? 'warn' : 'ok'))))
            : vide('Aucun serveur audio', 'La musique passe par le lecteur local.')),
          card('Derniers événements', d.events.length
            ? h('div', { class: 'rows' }, d.events.map((e) => ligne(e.text, dateHeure(e.at), null)))
            : vide('Rien à signaler', ''))));
      },
    },

    or: {
      titre: 'Pièces d’or',
      intro: 'L’économie pirate de chaque serveur : les bourses des membres, l’or en circulation, les objets de la boutique. Donne, retire, remets à zéro ou offre un effet. Les pièces ne s’achètent pas avec de l’argent.',
      garder: true,
      auto: 30000,
      async rendre(zone) {
        let bloc = $('#or-bloc', zone);
        if (!bloc) {
          const d = await serveurs();
          if (!d.guilds.length) return append(zone, card(null, vide('Aucun serveur', 'Le bot n’est sur aucun serveur.')));
          const choix = h('select', { id: 'or-serveur' }, d.guilds.map((g) => h('option', { value: g.id, text: g.name })));
          choix.addEventListener('change', () => rafraichir());
          bloc = h('div', { id: 'or-bloc' });
          append(zone, h('div', { class: 'stack' }, card(null, h('div', { class: 'grid cols-2' }, champ('Serveur', choix))), h('div', { class: 'grid cols-3-1' }, bloc, cartePieces())));
        }
        const guildId = $('#or-serveur').value;
        const d = await api.get(`or?serveur=${guildId}`);
        const EFFETS = { immunite: '🛡️', xp: '⚡', quotidien: '🎁' };
        const gerer = (p) => {
          const b = h('button', { class: 'btn small', type: 'button', text: 'Gérer' });
          b.addEventListener('click', () => { const c = $('#or-qui'); c.value = p.userId; c.focus(); });
          return b;
        };
        bloc.replaceChildren(h('div', { class: 'stack' },
          card('Trésor du serveur', h('div', { class: 'grid cols-4' },
            ligne('Or en circulation', null, h('b', { class: 'num', text: `🪙 ${num(d.total)}` })),
            ligne('Membres avec de l’or', null, h('b', { class: 'num', text: num(d.holders) })),
            ligne('Gagné en tout', null, h('b', { class: 'num', text: num(d.earned) })),
            ligne('Dépensé en tout', null, h('b', { class: 'num', text: num(d.spent) })))),
          card('Les plus riches', d.top.length
            ? h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Membre' }), h('th', { class: 'right', text: 'Niveau' }), h('th', { class: 'right', text: 'Pièces' }), h('th', { text: 'Effets' }), h('th', { class: 'right', text: '' }))),
              h('tbody', {}, d.top.map((p, i) => h('tr', {}, h('td', { class: 'num', text: i + 1 }), h('td', {}, personne(p.user)), h('td', { class: 'right num', text: p.level }), h('td', { class: 'right num', text: num(p.gold) }), h('td', { text: p.effects.map((e) => EFFETS[e]).join(' ') || '—' }), h('td', { class: 'right' }, gerer(p)))))))
            : vide('Personne n’a encore d’or', 'Les membres gagnent 200 pièces par niveau et la récompense du jour.')),
          card('Articles de la boutique', h('div', { class: 'rows' }, d.items.map((it) => ligne(`${it.emoji} ${it.name}`, null, h('span', { class: 'num', text: `🪙 ${num(it.price)}` })))))));
      },
    },

    journaux: {
      titre: 'Journaux',
      intro: 'Ce que le bot écrit dans sa console, en direct. Les clés et tokens sont masqués automatiquement.',
      auto: 5000,
      etat: { filtre: '', niveau: '', n: 300, auto: true },
      async rendre(zone) {
        const etat = VUES.journaux.etat;
        const q = new URLSearchParams({ n: etat.n, filtre: etat.filtre, niveau: etat.niveau });
        const d = await api.get(`journaux?${q}`);
        let boite = $('#logs', zone);
        if (!boite) {
          const filtre = h('input', { type: 'text', id: 'logs-filtre', placeholder: 'Filtrer (ex : lavalink, erreur, loup-garou)', value: etat.filtre, 'aria-label': 'Filtrer les journaux' });
          const niveau = h('select', { id: 'logs-niveau', 'aria-label': 'Niveau' },
            h('option', { value: '', text: 'Tout' }), h('option', { value: 'attention', text: 'Avertissements et erreurs' }), h('option', { value: 'erreur', text: 'Erreurs seulement' }));
          niveau.value = etat.niveau;
          const auto = h('label', { class: 'actions' }, h('span', { class: 'switch' }, h('input', { type: 'checkbox', id: 'logs-auto', checked: etat.auto }), h('i')), 'Suivre en direct');
          let attente;
          filtre.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(() => { etat.filtre = filtre.value; rafraichir(); }, 300); });
          niveau.addEventListener('change', () => { etat.niveau = niveau.value; rafraichir(); });
          $('input', auto).addEventListener('change', (e) => { etat.auto = e.target.checked; programmer(); });
          boite = h('div', { class: 'logs', id: 'logs', tabindex: '0', 'aria-label': 'Journaux du bot' });
          append(zone, card(null, h('div', { class: 'toolbar' }, filtre, niveau, auto), boite));
        }
        const enBas = boite.scrollHeight - boite.scrollTop - boite.clientHeight < 40;
        boite.replaceChildren(...(d.lines.length
          ? d.lines.map((l) => h('div', { class: l.level }, h('span', { class: 't', text: l.time }), h('span', { text: l.text })))
          : [h('div', {}, h('span', { class: 't', text: '' }), h('span', { text: 'Aucune ligne ne correspond.' }))]));
        if (enBas) boite.scrollTop = boite.scrollHeight;
      },
    },

    securite: {
      titre: 'Sécurité',
      intro: 'Qui est connecté, qui a accès, et tout ce qui a été fait depuis le tableau de bord.',
      auto: 30000,
      async rendre(zone) {
        const d = await api.get('securite');
        const fermerAutres = h('button', { class: 'btn danger', type: 'button', text: 'Fermer les autres sessions', disabled: d.sessions.length < 2 });
        fermerAutres.addEventListener('click', async () => {
          if (!await confirmer({ titre: 'Fermer les autres sessions ?', texte: 'Tous les autres appareils seront déconnectés. Le tien reste connecté.', bouton: 'Fermer' })) return;
          action(fermerAutres, async () => { const r = await api.post('securite/deconnecter', { toutes: true }); toast(`${r.count} session(s) fermée(s).`); rafraichir(); });
        });
        append(zone, [
          h('div', { class: 'grid cols-2' },
            card('Protections actives', h('div', { class: 'rows' },
              ligne('Connexion par lien à usage unique', 'Envoyé en MP ou par /admin dashboard, valable 10 minutes', pill('Actif', 'ok')),
              ligne('Session protégée', 'Cookie HttpOnly et SameSite strict, 2 h d’inactivité ou 12 h maximum', pill('Actif', 'ok')),
              ligne('Connexion chiffrée (HTTPS)', d.https ? 'Le cookie ne circule que chiffré' : 'Pas de HTTPS ici (normal en local)', pill(d.https ? 'Actif' : 'Local', d.https ? 'ok' : 'warn')),
              ligne('Requêtes vérifiées', 'Une autre page ne peut pas agir à ta place', pill('Actif', 'ok')),
              ligne('Tentatives limitées', '10 essais de connexion par quart d’heure et par adresse', pill('Actif', 'ok')),
              ligne('Secrets masqués', 'Clés et tokens jamais affichés, masqués dans les journaux', pill('Actif', 'ok')))),
            card('Comptes autorisés', h('p', { class: 'sub', text: 'Pour ajouter quelqu’un : variable DASHBOARD_ADMINS (identifiants Discord séparés par des virgules), puis redémarre le bot.' }),
              h('div', { class: 'rows' }, d.admins.map((a) => ligne(a.name, a.id, pill(a.owner ? 'Chef' : 'Admin', a.owner ? 'ok' : 'info')))))),
          card('Sessions ouvertes',
            h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: 'Compte' }), h('th', { text: 'Appareil' }), h('th', { text: 'Adresse' }), h('th', { text: 'Dernière activité' }), h('th', { text: 'Expire' }), h('th', { class: 'right', text: '' }))),
              h('tbody', {}, d.sessions.map((sess) => {
                const moi = sess.id === d.you;
                const b = moi ? pill('Cette session', 'ok') : h('button', { class: 'btn small', type: 'button', text: 'Fermer' });
                if (!moi) b.addEventListener('click', () => action(b, async () => { await api.post('securite/deconnecter', { id: sess.id }); toast('Session fermée.'); rafraichir(); }));
                return h('tr', {}, h('td', {}, personne(sess.user)), h('td', { class: 'mute', text: appareil(sess.agent) }), h('td', { class: 'mono', text: sess.ip }), h('td', { text: ago(sess.lastSeen) }), h('td', { text: ago(sess.expiresAt) }), h('td', { class: 'right' }, b));
              })))),
            h('div', { class: 'actions' }, fermerAutres)),
          card('Journal des actions', d.journal.length
            ? h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: 'Quand' }), h('th', { text: 'Qui' }), h('th', { text: 'Quoi' }), h('th', { text: 'Détail' }), h('th', { text: 'Adresse' }))),
              h('tbody', {}, d.journal.map((e) => h('tr', {}, h('td', { class: 'num', text: dateHeure(e.at) }), h('td', {}, personne(e.user)), h('td', { text: e.action }), h('td', { class: 'mute', text: e.detail || '—' }), h('td', { class: 'mono', text: e.ip ?? '—' }))))))
            : vide('Journal vide', 'Les connexions et modifications seront notées ici.')),
        ]);
      },
    },

    aide: {
      titre: 'Aide',
      intro: 'Comment marche le tableau de bord, section par section.',
      async rendre(zone) {
        const q = (titre, ...lignes) => card(titre, ...lignes.map((l) => h('p', { class: 'sub', text: l })));
        append(zone, h('div', { class: 'grid cols-2' },
          q('Se connecter', 'Dans Discord, tape /admin dashboard : le bot te donne un lien valable une fois, pendant 10 minutes. Tu peux aussi le recevoir en MP depuis la page de connexion.', 'Seuls le chef et les comptes de DASHBOARD_ADMINS peuvent se connecter.'),
          q('Vue d’ensemble', 'En haut, ce qui demande ton attention (erreurs, pause, serveurs audio injoignables…). Ensuite, les chiffres du jour et l’activité heure par heure.'),
          q('Réglages de l’IA', 'Changer de modèle, le niveau de réflexion, les limites anti-spam, ou ajouter des consignes (par exemple un événement du week-end). Tout s’applique immédiatement.', 'Après un changement de modèle, utilise « Tester l’IA » pour vérifier qu’il répond.'),
          q('Mettre l’IA en pause', 'Dans Réglages › Maintenance. Les membres reçoivent ton message de pause, toi tu peux continuer à tester. Les jeux et la musique continuent de marcher.'),
          q('Conversations', 'L’IA garde chaque conversation 45 minutes. Efface-la si quelqu’un veut repartir de zéro, ou si l’IA part dans une mauvaise direction.'),
          q('Écrire en tant que le bot', 'Choisis un serveur et un salon, écris ton message, ajoute si tu veux une carte (titre, couleur, image) : l’aperçu montre le rendu. Personne n’est mentionné sauf si tu choisis un rôle, @here ou @everyone.', 'Le sondage utilise les vrais sondages Discord (2 à 10 réponses).'),
          q('Modération', 'Cherche un membre par son pseudo (ou colle son identifiant pour un banni), mets une raison, puis Rendre muet, Expulser ou Bannir. Le chef ne peut jamais être sanctionné d’ici.', '« Ce que le bot peut faire » montre les permissions qui manquent au rôle du bot.'),
          q('Musique, rappels, pièces d’or', 'Lance un titre ou un lien dans le vocal de ton choix, règle le volume, retire des sons de la file. Programme un rappel pour toi ou un membre. Donne ou retire des jetons de Casinho.'),
          q('Priver quelqu’un d’IA', 'Dans IA › Réglages › « Personnes privées d’IA », colle un identifiant Discord par ligne. Les jeux et la musique restent ouverts pour eux.'),
          q('Render et PC en même temps', 'Avec Supabase configuré, une seule copie du bot répond : Render passe devant (bot et tableau de bord en ligne), le PC ne sert que le site en local et ne prend le relais que si Render s’arrête. Sans Supabase, les deux répondent et les boutons affichent « Unknown interaction ».'),
          q('Journaux', 'Utile quand quelque chose ne marche pas : filtre par mot (« lavalink », « gemini »…) ou affiche seulement les erreurs.'),
          q('Sécurité', 'Si tu as ouvert le tableau de bord sur un ordinateur qui n’est pas à toi, ferme la session depuis cette page.'),
          q('Les données', 'Les statistiques comptent les demandes, pas leur contenu. Rien de ce que les membres écrivent n’est affiché ou gardé ici.')));
      },
    },
  };

  function appareil(agent = '') {
    const nav = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Navigateur';
    const os = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iPhone' : /Mac OS/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : '';
    return os ? `${nav} · ${os}` : nav;
  }

  // ---------- formulaires d'action ----------
  let serveursCache = null;
  /** Serveurs, salons et rôles vus par le bot (gardés 1 minute). */
  async function serveurs(force = false) {
    if (!force && serveursCache && Date.now() - serveursCache.at < 60000) return serveursCache.data;
    const data = await api.get('serveurs');
    serveursCache = { at: Date.now(), data };
    return data;
  }
  let uid = 0;
  /** Un champ de formulaire : libellé, contrôle, aide. */
  function champ(label, input, aide) {
    const id = input.id || `champ-${++uid}`;
    const cible = input.matches?.('input, select, textarea') ? input : $('input, select, textarea', input);
    if (cible && !cible.id) cible.id = id;
    return h('div', { class: 'field plain' }, h('label', { for: cible?.id ?? id, text: label }), input, aide ? h('p', { class: 'help', text: aide }) : null);
  }
  function selectServeur(guilds, valeur) {
    const sel = h('select', {}, guilds.map((g) => h('option', { value: g.id, text: g.name })));
    if (valeur && guilds.some((g) => g.id === valeur)) sel.value = valeur;
    return sel;
  }
  /** Liste des salons d'un serveur, rangés par catégorie. */
  function remplirSalons(sel, liste, { vide, filtre } = {}) {
    const groupes = new Map();
    for (const c of liste.filter(filtre ?? (() => true))) {
      const g = c.category ?? 'Sans catégorie';
      if (!groupes.has(g)) groupes.set(g, []);
      groupes.get(g).push(c);
    }
    sel.replaceChildren();
    append(sel,
      vide ? h('option', { value: '', text: vide }) : null,
      ...[...groupes].map(([nom, salons]) => h('optgroup', { label: nom }, salons.map((c) => h('option', { value: c.id, text: `${c.voice ? '🔊' : '#'} ${c.name}${c.bot ? ' (le bot y est)' : ''}${c.people ? ` · ${c.people} pers.` : ''}` })))),
    );
  }
  /** Sélecteur serveur + salon relié : changer de serveur recharge les salons. */
  function choixSalon(d, { voix = false, vide = null, onServeur } = {}) {
    const serveur = selectServeur(d.guilds, localStore('serveur'));
    const salon = h('select', {});
    const maj = () => {
      const g = d.guilds.find((x) => x.id === serveur.value);
      localStore('serveur', serveur.value);
      if (voix) remplirSalons(salon, (g?.voices ?? []).map((c) => ({ ...c, voice: true })), { vide });
      else remplirSalons(salon, g?.channels ?? [], { vide, filtre: (c) => c.canSend });
      onServeur?.(g);
    };
    serveur.addEventListener('change', maj);
    maj();
    return { serveur, salon, guild: () => d.guilds.find((x) => x.id === serveur.value) };
  }
  function localStore(cle, valeur) {
    try {
      if (valeur === undefined) return localStorage.getItem(`dashboard-${cle}`);
      localStorage.setItem(`dashboard-${cle}`, valeur);
    } catch { /* stockage bloqué */ }
    return null;
  }
  const lienDiscord = (url, texte = 'Voir dans Discord') => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: texte });
  function succes(zone, texte, url) {
    zone.replaceChildren(h('div', { class: 'alert ok' }, icon('ok'), h('span', {}, texte, url ? ' · ' : null, url ? lienDiscord(url) : null)));
  }
  function echec(zone, err) {
    zone.replaceChildren(h('div', { class: 'alert critique' }, icon('alerte'), h('span', { text: err.message })));
  }
  /** Soumission d'un formulaire d'action : bouton bloqué pendant l'envoi, résultat affiché dessous. */
  function soumettre(form, bouton, retour, fn) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      action(bouton, async () => {
        try { await fn(); } catch (err) { echec(retour, err); }
      });
    });
  }
  const aucunServeur = () => card(null, vide('Le bot n’est sur aucun serveur', 'Invite-le d’abord sur ton serveur Discord.'));

  // ---------- Écrire ----------
  function carteMessage(d) {
    const retour = h('div', { 'aria-live': 'polite' });
    const ping = h('select', {});
    const { serveur, salon } = choixSalon(d, {
      onServeur: (g) => ping.replaceChildren(
        h('option', { value: 'aucune', text: 'Personne (conseillé)' }), h('option', { value: 'here', text: '@here (les membres en ligne)' }), h('option', { value: 'everyone', text: '@everyone (tout le monde)' }),
        ...(g?.roles ?? []).map((r) => h('option', { value: r.id, text: `@${r.name}` }))),
    });
    const texteMsg = h('textarea', { rows: 4, maxlength: 1800, placeholder: 'Salut tout le monde !' });
    const avecCarte = h('input', { type: 'checkbox' });
    const titre = h('input', { type: 'text', maxlength: 256, placeholder: '📣 Grande annonce' });
    const corps = h('textarea', { rows: 5, maxlength: 4000, placeholder: 'Le **markdown** de Discord marche : gras, _italique_, listes, liens…' });
    const couleur = h('input', { type: 'color', value: '#f2c46d', class: 'color' });
    const image = h('input', { type: 'text', inputmode: 'url', maxlength: 500, placeholder: 'https://… (facultatif)' });
    const bas = h('input', { type: 'text', maxlength: 200, placeholder: 'Facultatif' });
    const blocCarte = h('div', { class: 'sub-form', hidden: true }, champ('Titre', titre), champ('Texte', corps), h('div', { class: 'grid cols-2' }, champ('Couleur', couleur), champ('Bas de carte', bas)), champ('Image', image, 'Une adresse d’image publique en https.'));
    avecCarte.addEventListener('change', () => { blocCarte.hidden = !avecCarte.checked; apercu(); });

    // Aperçu façon Discord (texte brut : le markdown sera mis en forme par Discord)
    const apv = h('div', { class: 'dc-preview', 'aria-label': 'Aperçu' });
    function apercu() {
      const mention = ping.value === 'aucune' ? '' : ping.value === 'here' || ping.value === 'everyone' ? `@${ping.value} ` : `@${ping.selectedOptions[0]?.text.slice(1) ?? ''} `;
      const embed = avecCarte.checked && (titre.value || corps.value || image.value) ? h('div', { class: 'dc-embed' }, titre.value ? h('b', { text: titre.value }) : null, corps.value ? h('p', { text: corps.value }) : null, image.value ? h('span', { class: 'mute', text: '🖼️ image' }) : null, bas.value ? h('small', { text: bas.value }) : null) : null;
      if (embed) embed.style.borderLeftColor = couleur.value;
      apv.replaceChildren();
      append(apv, h('div', { class: 'dc-head' }, h('b', { class: 'bot-name', text: $('.brand .bot-name')?.textContent ?? 'Le bot' }), h('span', { class: 'dc-tag', text: 'APP' })),
        texteMsg.value || mention ? h('p', {}, mention ? h('span', { class: 'dc-mention', text: mention }) : null, texteMsg.value) : null, embed,
        !texteMsg.value && !embed ? h('p', { class: 'mute', text: 'L’aperçu de ton message apparaît ici.' }) : null);
    }
    for (const el of [texteMsg, titre, corps, couleur, image, bas]) el.addEventListener('input', apercu);
    ping.addEventListener('change', apercu);
    apercu();

    const bouton = h('button', { class: 'btn primary', type: 'submit', text: 'Envoyer' });
    const form = h('form', { class: 'stack', novalidate: true },
      h('div', { class: 'grid cols-2' }, champ('Serveur', serveur), champ('Salon', salon)),
      champ('Message', texteMsg),
      champ('Mentionner', ping, '@everyone et @here font sonner tout le serveur : à garder pour les vraies annonces.'),
      h('label', { class: 'actions' }, h('span', { class: 'switch' }, avecCarte, h('i')), 'Ajouter une carte (embed)'),
      blocCarte, h('div', { class: 'field plain' }, h('b', { text: 'Aperçu' }), apv),
      h('div', { class: 'actions' }, bouton), retour);
    soumettre(form, bouton, retour, async () => {
      if ((ping.value === 'everyone' || ping.value === 'here') && !await confirmer({ titre: `Mentionner @${ping.value} ?`, texte: 'Tout le monde recevra une notification.', bouton: 'Envoyer quand même' })) return;
      const r = await api.post('envoyer', {
        channelId: salon.value, content: texteMsg.value, ping: ping.value,
        embed: avecCarte.checked ? { title: titre.value, description: corps.value, color: couleur.value, image: image.value, footer: bas.value } : null,
      });
      succes(retour, 'Message envoyé.', r.url);
      texteMsg.value = '';
      apercu();
    });
    return card('Message ou annonce', form);
  }

  function carteSondage(d) {
    const retour = h('div', { 'aria-live': 'polite' });
    const { serveur, salon } = choixSalon(d);
    const question = h('input', { type: 'text', maxlength: 300, placeholder: 'On fait quoi samedi soir ?' });
    const reponses = h('textarea', { rows: 4, placeholder: 'Loup-garou\nBlind test\nSoirée casino' });
    const duree = h('select', {}, [[1, '1 heure'], [6, '6 heures'], [24, '1 jour'], [72, '3 jours'], [168, '1 semaine']].map(([v, t]) => h('option', { value: v, text: t })));
    duree.value = '24';
    const multiple = h('input', { type: 'checkbox' });
    const bouton = h('button', { class: 'btn primary', type: 'submit', text: 'Publier le sondage' });
    const form = h('form', { class: 'stack', novalidate: true },
      h('div', { class: 'grid cols-2' }, champ('Serveur', serveur), champ('Salon', salon)),
      champ('Question', question), champ('Réponses', reponses, 'Une par ligne, de 2 à 10 (55 caractères chacune).'),
      h('div', { class: 'grid cols-2' }, champ('Durée', duree), h('label', { class: 'actions' }, h('span', { class: 'switch' }, multiple, h('i')), 'Plusieurs choix')),
      h('div', { class: 'actions' }, bouton), retour);
    soumettre(form, bouton, retour, async () => {
      const r = await api.post('sondage', { channelId: salon.value, question: question.value, answers: reponses.value.split('\n'), hours: Number(duree.value), multiple: multiple.checked });
      succes(retour, 'Sondage publié.', r.url);
      question.value = '';
      reponses.value = '';
    });
    return card('Sondage', form);
  }

  function carteAideEnvoi() {
    return card('Bon à savoir', h('ul', { class: 'tips' },
      h('li', { text: 'Seuls les salons où le bot a le droit d’écrire apparaissent.' }),
      h('li', { text: 'Le markdown de Discord marche : **gras**, *italique*, > citation, liens.' }),
      h('li', { text: 'Chaque envoi est noté dans Sécurité › Journal des actions, avec le salon.' }),
      h('li', { text: 'Pour une annonce propre : coche « Ajouter une carte », mets un titre et une couleur.' })));
  }

  // ---------- Modération ----------
  function carteMembres(d) {
    const serveur = selectServeur(d.guilds, localStore('serveur'));
    serveur.addEventListener('change', () => { localStore('serveur', serveur.value); chercher(); });
    const recherche = h('input', { type: 'text', placeholder: 'Pseudo, nom ou identifiant Discord', autocomplete: 'off', spellcheck: 'false' });
    const raison = h('input', { type: 'text', maxlength: 300, placeholder: 'Ex : spam dans #général' });
    const resultats = h('div', { 'aria-live': 'polite' }, vide('Cherche un membre', 'Tape au moins 2 lettres de son pseudo, ou colle son identifiant pour un membre banni.'));
    let attente;
    let n = 0;
    async function chercher() {
      const q = recherche.value.trim();
      if (q.length < 2) return;
      const mon = ++n;
      try {
        const r = await api.get(`membres?${new URLSearchParams({ serveur: serveur.value, q })}`);
        if (mon !== n) return;
        resultats.replaceChildren(r.members.length ? h('div', { class: 'rows' }, r.members.map(ligneMembre)) : vide('Personne', 'Aucun membre ne correspond.'));
      } catch (err) {
        echec(resultats, err);
      }
    }
    recherche.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(chercher, 350); });

    function ligneMembre(m) {
      const sanction = async (act, extra = {}) => {
        if (['expulser', 'bannir'].includes(act) && !await confirmer({ titre: `${act === 'bannir' ? 'Bannir' : 'Expulser'} ${m.name} ?`, texte: `${act === 'bannir' ? 'Il ne pourra plus revenir tant qu’il n’est pas débanni.' : 'Il pourra revenir avec une invitation.'} Raison : ${raison.value || 'aucune'}`, bouton: act === 'bannir' ? 'Bannir' : 'Expulser' })) return;
        const r = await api.post('moderation', { guildId: serveur.value, userId: m.id, action: act, reason: raison.value, ...extra });
        toast(`${m.name} : ${r.detail}.`);
        chercher();
      };
      const bouton = (texte, fn, cls = '') => {
        const b = h('button', { class: `btn small ${cls}`, type: 'button', text: texte });
        b.addEventListener('click', () => action(b, fn));
        return b;
      };
      if (m.banned) return h('div', { class: 'row' }, h('div', { class: 'what' }, personne(m), h('span', { text: `Banni${m.reason ? ` · ${m.reason}` : ''}` })), bouton('Débannir', () => sanction('deban')));
      const duree = h('select', { class: 'mini', 'aria-label': 'Durée' }, [[10, '10 min'], [60, '1 h'], [360, '6 h'], [1440, '1 jour'], [10080, '1 semaine']].map(([v, t]) => h('option', { value: v, text: t })));
      const infos = [m.username !== m.name ? `@${m.username}` : null, m.topRole, m.bot ? 'bot' : null, m.mutedUntil ? `muet jusqu’à ${dateHeure(m.mutedUntil)}` : null].filter(Boolean).join(' · ');
      return h('div', { class: 'row wrap' },
        h('div', { class: 'what' }, personne(m), h('span', { text: infos || `arrivé ${ago(m.joinedAt)}` })),
        m.owner ? pill('Le chef · protégé', 'ok') : h('div', { class: 'actions' },
          m.mutedUntil ? bouton('Rendre la parole', () => sanction('demute')) : [duree, bouton('Rendre muet', () => sanction('mute', { minutes: Number(duree.value) }))],
          bouton('Expulser', () => sanction('expulser'), 'danger'), bouton('Bannir', () => sanction('bannir'), 'danger')));
    }
    return card('Membres', h('div', { class: 'grid cols-2' }, champ('Serveur', serveur), champ('Raison (visible dans le journal d’audit Discord)', raison)), champ('Chercher', recherche), resultats);
  }

  function carteNettoyer(d) {
    const retour = h('div', { 'aria-live': 'polite' });
    const { serveur, salon } = choixSalon(d);
    const nombre = h('input', { type: 'number', min: 1, max: 100, value: 10, inputmode: 'numeric' });
    const bouton = h('button', { class: 'btn danger', type: 'submit', text: 'Supprimer' });
    const form = h('form', { class: 'stack', novalidate: true }, h('div', { class: 'grid cols-2' }, champ('Serveur', serveur), champ('Salon', salon)), champ('Nombre de messages', nombre, 'Les plus récents, 100 au maximum. Discord ne permet pas de supprimer en masse ceux de plus de 14 jours.'), h('div', { class: 'actions' }, bouton), retour);
    soumettre(form, bouton, retour, async () => {
      if (!await confirmer({ titre: `Supprimer ${nombre.value} message(s) ?`, texte: `Les derniers messages de #${salon.selectedOptions[0]?.text.replace(/^# /, '') ?? ''} seront supprimés définitivement.`, bouton: 'Supprimer' })) return;
      const r = await api.post('nettoyer', { channelId: salon.value, count: Number(nombre.value) });
      succes(retour, `${r.count} message(s) supprimé(s).`);
    });
    return card('Nettoyer un salon', form);
  }

  function carteDroits(d) {
    return card('Ce que le bot peut faire', h('div', { class: 'rows' }, d.guilds.map((g) => ligne(g.name, null, h('div', { class: 'actions' },
      pill('Muet', g.perms.moderate ? 'ok' : 'bad'), pill('Expulser', g.perms.kick ? 'ok' : 'bad'), pill('Bannir', g.perms.ban ? 'ok' : 'bad'), pill('Messages', g.perms.manageMessages ? 'ok' : 'bad'))))),
    h('p', { class: 'sub', text: 'En rouge : donne la permission au rôle du bot dans Discord (Paramètres du serveur › Rôles), et place ce rôle au-dessus des membres à modérer.' }));
  }

  // ---------- Rappels ----------
  function carteNouveauRappel(d) {
    const retour = h('div', { 'aria-live': 'polite' });
    const { serveur, salon } = choixSalon(d);
    const pour = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Vide = pour toi, sinon un identifiant Discord', autocomplete: 'off' });
    const texteR = h('input', { type: 'text', maxlength: 500, placeholder: 'Lancer la soirée loup-garou' });
    const dans = h('select', {}, [[5, 'Dans 5 minutes'], [15, 'Dans 15 minutes'], [30, 'Dans 30 minutes'], [60, 'Dans 1 heure'], [180, 'Dans 3 heures'], [1440, 'Demain à la même heure'], [10080, 'Dans une semaine'], ['autre', 'Autre…']].map(([v, t]) => h('option', { value: v, text: t })));
    const minutes = h('input', { type: 'number', min: 1, max: 86400, value: 90, hidden: true, 'aria-label': 'Minutes' });
    dans.addEventListener('change', () => { minutes.hidden = dans.value !== 'autre'; });
    const bouton = h('button', { class: 'btn primary', type: 'submit', text: 'Créer le rappel' });
    const form = h('form', { class: 'stack', novalidate: true },
      h('div', { class: 'grid cols-2' }, champ('Rappel', texteR), champ('Quand', h('div', { class: 'stack tight' }, dans, minutes))),
      h('div', { class: 'grid cols-2' }, champ('Pour qui', pour), champ('Salon de secours', h('div', { class: 'stack tight' }, serveur, salon), 'Utilisé si la personne a fermé ses MP.')),
      h('div', { class: 'actions' }, bouton), retour);
    soumettre(form, bouton, retour, async () => {
      const r = await api.post('rappels/creer', { channelId: salon.value, text: texteR.value, userId: pour.value.trim(), minutes: dans.value === 'autre' ? Number(minutes.value) : Number(dans.value) });
      succes(retour, `Rappel prévu ${dateHeure(r.at)}.`);
      texteR.value = '';
      rafraichir({ silencieux: true });
    });
    return card('Nouveau rappel', form);
  }

  // ---------- Musique ----------
  function carteJouer(d) {
    const retour = h('div', { 'aria-live': 'polite' });
    const { serveur, salon } = choixSalon(d, { voix: true, vide: 'Le salon habituel du bot' });
    const recherche = h('input', { type: 'text', maxlength: 500, placeholder: 'Titre, artiste, ou lien Spotify / YouTube / Deezer / SoundCloud' });
    const ensuite = h('input', { type: 'checkbox' });
    const bouton = h('button', { class: 'btn primary', type: 'submit', text: 'Jouer' });
    const form = h('form', { class: 'stack', novalidate: true },
      h('div', { class: 'grid cols-2' }, champ('Serveur', serveur), champ('Salon vocal', salon)),
      champ('Quoi', recherche, 'Un lien de playlist ajoute toute la playlist.'),
      h('div', { class: 'actions' }, h('label', { class: 'actions' }, h('span', { class: 'switch' }, ensuite, h('i')), 'Jouer juste après le son en cours'), h('span', { class: 'spacer' }), bouton), retour);
    soumettre(form, bouton, retour, async () => {
      retour.replaceChildren(h('p', { class: 'sub', text: 'Je cherche…' }));
      const r = await api.post('musique/jouer', { guildId: serveur.value, voiceId: salon.value, query: recherche.value, next: ensuite.checked });
      succes(retour, `▶️ ${r.label} · dans 🔊 ${r.voice}`);
      recherche.value = '';
      rafraichir({ silencieux: true });
    });
    return card('Lancer de la musique', form);
  }

  function carteLecteur(p) {
    const post = (chemin, corps) => api.post(chemin, { guildId: p.guildId, ...corps }).then((r) => { if (r.detail) toast(r.detail); rafraichir({ silencieux: true }); });
    const bouton = (texte, fn, cls = '') => {
      const b = h('button', { class: `btn small ${cls}`, type: 'button', text: texte });
      b.addEventListener('click', () => action(b, fn));
      return b;
    };
    const barre = h('i');
    barre.style.width = p.current.duration ? `${Math.min(100, (p.position / p.current.duration) * 100)}%` : '0%';
    const volume = h('input', { type: 'range', min: 0, max: 100, step: 5, value: p.volume ?? 100, 'aria-label': 'Volume', class: 'range' });
    const volTexte = h('span', { class: 'num', text: `${p.volume ?? 100} %` });
    volume.addEventListener('input', () => { volTexte.textContent = `${volume.value} %`; });
    volume.addEventListener('change', () => action(volume, () => post('musique/file', { action: 'volume', volume: Number(volume.value) })));
    const BOUCLE = { off: 'Boucle : non', track: 'Boucle : ce son', queue: 'Boucle : la file' };
    return card(p.guild,
      h('p', { class: 'sub', text: `${p.current.artist ? `${p.current.title} · ${p.current.artist}` : p.current.title}${p.voice ? ` · 🔊 ${p.voice}` : ''}` }),
      h('div', { class: 'progress' }, barre),
      h('p', { class: 'sub num', text: `${minsec(p.position)} / ${p.current.live ? 'direct' : minsec(p.current.duration)}${p.filters.length ? ` · effets : ${p.filters.join(', ')}` : ''}` }),
      h('div', { class: 'actions' },
        bouton('⏮', () => post('musique/file', { action: 'precedent' })),
        bouton(p.paused ? '▶ Reprendre' : '⏸ Pause', () => post('musique/action', { action: 'pause' })),
        bouton('⏭ Passer', () => post('musique/action', { action: 'passer' })),
        bouton(BOUCLE[p.loop] ?? 'Boucle', () => post('musique/file', { action: 'boucle' })),
        bouton('Arrêter', () => post('musique/action', { action: 'arreter' }), 'danger')),
      h('div', { class: 'actions' }, h('span', { class: 'sub', text: 'Volume' }), volume, volTexte),
      h('h3', { class: 'group-title', text: `À suivre (${p.queue})` }),
      p.upcoming.length
        ? h('div', { class: 'rows' }, p.upcoming.map((t, i) => ligne(`${i + 1}. ${t.title}`, [t.artist, t.duration ? minsec(t.duration) : null].filter(Boolean).join(' · '), bouton('Retirer', () => post('musique/file', { action: 'retirer', position: i + 1 })))),
          p.queue > p.upcoming.length ? h('p', { class: 'sub', text: `… et ${p.queue - p.upcoming.length} de plus.` }) : null,
          h('div', { class: 'actions' }, bouton('Mélanger', () => post('musique/file', { action: 'melanger' })), bouton('Vider la file', () => post('musique/file', { action: 'vider' }), 'danger')))
        : h('p', { class: 'sub', text: 'La file est vide : le son en cours est le dernier.' }));
  }

  // ---------- Pièces d'or ----------
  function cartePieces() {
    const retour = h('div', { 'aria-live': 'polite' });
    const qui = h('input', { type: 'text', id: 'or-qui', inputmode: 'numeric', placeholder: 'Identifiant Discord du membre', autocomplete: 'off' });
    const combien = h('input', { type: 'number', min: 1, max: 10000000, value: 1000, inputmode: 'numeric' });
    const effet = h('select', {}, [['immunite', '🛡️ Immunité 24 h'], ['xp', '⚡ XP doublée 24 h'], ['quotidien', '🎁 Récompense doublée 7 jours']].map(([v, t]) => h('option', { value: v, text: t })));
    const envoyer = async (corps) => {
      const r = await api.post('or/pieces', { guildId: $('#or-serveur').value, userId: qui.value.trim(), ...corps });
      succes(retour, r.detail);
      rafraichir({ silencieux: true });
    };
    const donner = h('button', { class: 'btn primary', type: 'button', text: 'Donner' });
    const retirer = h('button', { class: 'btn', type: 'button', text: 'Retirer' });
    const offrir = h('button', { class: 'btn', type: 'button', text: 'Offrir l’effet' });
    const remise = h('button', { class: 'btn danger', type: 'button', text: 'Remettre à zéro' });
    const garde = (b, fn) => b.addEventListener('click', () => action(b, async () => { try { await fn(); } catch (err) { echec(retour, err); } }));
    garde(donner, () => envoyer({ amount: Number(combien.value) }));
    garde(retirer, () => envoyer({ amount: -Number(combien.value) }));
    garde(offrir, () => envoyer({ effet: effet.value }));
    garde(remise, async () => {
      if (!await confirmer({ titre: 'Remettre cette bourse à zéro ?', texte: 'Ses pièces d’or et ses effets en cours sont effacés sur ce serveur.', bouton: 'Remettre à zéro' })) return;
      await envoyer({ remise: true });
    });
    return card('Gérer une bourse', champ('Membre', qui, 'Clique sur « Gérer » dans le classement pour le remplir.'), champ('Pièces d’or', combien),
      h('div', { class: 'actions' }, donner, retirer), champ('Effet de la boutique', effet), h('div', { class: 'actions' }, offrir, h('span', { class: 'spacer' }), remise), retour);
  }

  function boutonRedemarrer(d) {
    const b = h('button', { class: 'btn small danger', type: 'button', text: 'Redémarrer le bot' });
    b.addEventListener('click', async () => {
      const pc = d.services.instance?.startsWith('PC');
      if (!await confirmer({ titre: 'Redémarrer le bot ?', texte: pc ? 'Le bot tourne sur ton PC : il va s’arrêter, relance demarrer.bat ensuite.' : 'Il sera hors ligne environ une minute, le temps que Render le relance. Les parties en cours seront perdues.', bouton: 'Redémarrer' })) return;
      action(b, async () => {
        await api.post('bot/redemarrer');
        toast('Redémarrage lancé. La page se reconnectera toute seule.');
      });
    });
    return h('div', { class: 'actions' }, b);
  }

  // ---------- Tester l'IA ----------
  function carteTest() {
    const zone = h('textarea', { id: 'test-question', rows: 3, maxlength: 1500, placeholder: 'Pose une question comme le ferait un membre…' });
    const bouton = h('button', { class: 'btn primary', type: 'submit', text: 'Envoyer' });
    const reponse = h('div', { 'aria-live': 'polite' });
    const form = h('form', { class: 'stack' }, h('label', { for: 'test-question', class: 'sub', text: 'L’IA répond avec sa vraie personnalité et les consignes du serveur. Rien n’est posté dans Discord.' }), zone, h('div', { class: 'actions' }, bouton));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!zone.value.trim()) return;
      action(bouton, async () => {
        reponse.replaceChildren(h('p', { class: 'sub', text: 'L’IA réfléchit…' }));
        try {
          const r = await api.post('ia/tester', { prompt: zone.value });
          reponse.replaceChildren(h('div', { class: 'answer', text: r.text || '(réponse vide)' }), h('p', { class: 'sub', text: `${r.model} · ${ms(r.ms)}` }));
        } catch (err) {
          reponse.replaceChildren(h('div', { class: 'alert critique' }, icon('alerte'), h('span', { text: err.message })));
        }
      });
    });
    return card('Tester l’IA', form, reponse);
  }

  function carteErreurs(erreurs) {
    return card('Dernières erreurs', erreurs.length
      ? h('div', { class: 'rows' }, erreurs.slice(0, 8).map((e) => ligne(TAGS[e.tag] ?? e.tag, `${dateHeure(e.at)} · ${e.detail}`, null)))
      : vide('Aucune erreur', 'Tout s’est bien passé.'));
  }

  // ---------- Réglages ----------
  function carteReglages(reglages) {
    const initial = Object.fromEntries(reglages.map((r) => [r.key, r.value]));
    const valeurs = { ...initial };
    const champs = {};
    const barre = h('div', { class: 'savebar', hidden: true });
    const compte = h('span');
    const annuler = h('button', { class: 'btn small', type: 'button', text: 'Annuler' });
    const enregistrer = h('button', { class: 'btn small primary', type: 'button', text: 'Enregistrer' });
    append(barre, compte, h('div', { class: 'actions' }, annuler, enregistrer));

    const pareil = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const modifies = () => Object.keys(valeurs).filter((k) => !pareil(valeurs[k], initial[k]));
    function maj() {
      const liste = modifies();
      barre.hidden = !liste.length;
      compte.textContent = `${liste.length} changement(s) non enregistré(s)`;
      for (const [key, champ] of Object.entries(champs)) champ.bloc.classList.toggle('changed', !pareil(valeurs[key], initial[key]));
    }

    const groupes = [...new Set(reglages.map((r) => r.group))];
    const form = h('div', {});
    for (const groupe of groupes) {
      form.append(h('h3', { class: 'group-title', text: groupe }));
      for (const r of reglages.filter((x) => x.group === groupe)) {
        const id = `reglage-${r.key}`;
        let input;
        if (r.type === 'bool') {
          const box = h('input', { type: 'checkbox', id, checked: Boolean(r.value) });
          box.addEventListener('change', async () => {
            if (r.key === 'paused' && box.checked && !await confirmer({ titre: 'Mettre l’IA en pause ?', texte: 'Les membres recevront le message de pause au lieu d’une réponse. Toi, tu pourras toujours tester. Pense à enregistrer.', bouton: 'Mettre en pause' })) {
              box.checked = false;
              return;
            }
            valeurs[r.key] = box.checked;
            maj();
          });
          input = h('span', { class: `switch${r.danger ? ' danger' : ''}` }, box, h('i'));
        } else if (r.options) {
          input = h('select', { id }, r.options.map((o) => h('option', { value: o, text: o })));
          input.value = r.value;
          input.addEventListener('change', () => { valeurs[r.key] = input.value; maj(); });
        } else if (r.type === 'int') {
          input = h('input', { type: 'number', id, min: r.min, max: r.max, step: 1, value: r.value, inputmode: 'numeric' });
          input.addEventListener('input', () => { valeurs[r.key] = input.value === '' ? null : Number(input.value); maj(); });
        } else if (r.type === 'ids') {
          input = h('textarea', { id, rows: 3, spellcheck: 'false', placeholder: 'Un identifiant Discord par ligne' });
          input.value = (r.value ?? []).join('\n');
          input.addEventListener('input', () => { valeurs[r.key] = input.value.split(/[\s,;]+/).filter(Boolean); maj(); });
        } else if (r.type === 'text' && (r.max ?? 0) > 200) {
          input = h('textarea', { id, rows: 4, maxlength: r.max });
          input.value = r.value ?? '';
          input.addEventListener('input', () => { valeurs[r.key] = input.value; maj(); });
        } else {
          input = h('input', { type: 'text', id, value: r.value ?? '', maxlength: r.max ?? 64, autocomplete: 'off', spellcheck: 'false' });
          input.addEventListener('input', () => { valeurs[r.key] = input.value; maj(); });
        }
        const erreur = h('p', { class: 'error', hidden: true });
        const bloc = h('div', { class: 'field' },
          h('div', { class: 'top' }, h('label', { for: id, text: r.label }), r.type === 'bool' ? input : null),
          r.type === 'bool' ? null : input,
          h('p', { class: 'help', text: r.help }),
          erreur);
        champs[r.key] = { bloc, erreur, input };
        form.append(bloc);
      }
    }

    annuler.addEventListener('click', () => { rafraichir(); });
    enregistrer.addEventListener('click', () => action(enregistrer, async () => {
      for (const c of Object.values(champs)) c.erreur.hidden = true;
      const changes = Object.fromEntries(modifies().map((k) => [k, valeurs[k]]));
      try {
        const r = await api.post('ia/reglages', { changes });
        toast(r.changed.length ? `Réglages enregistrés (${r.changed.length}).` : 'Rien à changer.');
        rafraichir();
      } catch (err) {
        for (const [key, message] of Object.entries(err.data?.errors ?? {})) {
          if (champs[key]) { champs[key].erreur.textContent = message; champs[key].erreur.hidden = false; }
        }
        throw err;
      }
    }));
    return card('Réglages', h('p', { class: 'sub', text: 'Chaque réglage est vérifié avant d’être appliqué, et chaque changement est noté dans le journal de sécurité.' }), form, barre);
  }

  // ===================== navigation =====================
  let vueActive = null;
  let minuterie = null;
  let derniereMaj = 0;

  function majBadges({ conversations, jeux }) {
    const set = (id, n) => { const b = $(id); if (!b || n === undefined) return; b.hidden = !n; b.textContent = n; };
    set('#badge-conversations', conversations);
    set('#badge-jeux', jeux);
  }

  function programmer() {
    clearInterval(minuterie);
    const vue = VUES[vueActive];
    if (!vue?.auto || (vueActive === 'journaux' && !VUES.journaux.etat.auto)) return;
    minuterie = setInterval(() => { if (!document.hidden) rafraichir({ silencieux: true }); }, vue.auto);
  }

  async function rafraichir({ silencieux = false } = {}) {
    const vue = VUES[vueActive];
    if (!vue) return;
    const zone = $('#contenu');
    // Les journaux gardent leur barre d'outils ; les réglages en cours d'édition ne sont pas écrasés.
    const garder = vueActive === 'journaux' || Boolean(vue.garder);
    if (silencieux && vueActive === 'ia') return;
    const cible = garder ? zone : h('div', { class: 'stack' });
    try {
      await vue.rendre(cible);
      if (!garder) zone.replaceChildren(cible);
      derniereMaj = Date.now();
      majHorloge();
    } catch (err) {
      if (err.status === 401) return;
      if (!silencieux) zone.replaceChildren(card(null, h('div', { class: 'alert critique' }, icon('alerte'), h('span', { text: err.message }))));
      else toast(err.message, true);
    }
  }

  function majHorloge() {
    $('#maj').textContent = derniereMaj ? `Mis à jour ${ago(derniereMaj)}` : '';
  }
  setInterval(majHorloge, 10000);

  function aller() {
    if (location.hash === '#casino') history.replaceState(null, '', '/dashboard#or');
    const nom = VUES[location.hash.slice(1)] ? location.hash.slice(1) : 'apercu';
    if (nom !== vueActive) $('#contenu').replaceChildren();
    vueActive = nom;
    const vue = VUES[nom];
    $('#titre-vue').textContent = vue.titre;
    $('#intro-vue').textContent = vue.intro;
    document.title = `${vue.titre} · Tableau de bord`;
    for (const a of $$('.nav a')) {
      if (a.dataset.vue === nom) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    rafraichir();
    programmer();
  }

  // ===================== écrans =====================
  function montrer(ecran) {
    $('#vue-login').hidden = ecran !== 'login';
    $('#vue-connexion').hidden = ecran !== 'connexion';
    $('#vue-app').hidden = ecran !== 'app';
    if (ecran !== 'app') clearInterval(minuterie);
  }

  function infosBot(bot) {
    for (const el of $$('.bot-name')) el.textContent = bot?.name ?? 'l’IA';
    for (const img of $$('img.bot-avatar')) {
      if (!bot?.avatar) continue;
      img.src = bot.avatar;
      img.hidden = false;
      img.referrerPolicy = 'no-referrer';
      const ph = img.nextElementSibling;
      if (ph?.classList.contains('bot-avatar-ph')) ph.hidden = true;
    }
  }

  function demarrerApp(moi) {
    $('#me-name').textContent = moi.user.name;
    if (moi.user.avatar) { $('#me-avatar').src = moi.user.avatar; $('#me-avatar').hidden = false; }
    montrer('app');
    if (!VUES[location.hash.slice(1)] && location.hash !== '#casino') history.replaceState(null, '', '/dashboard#apercu');
    aller();
  }

  // ---------- thème ----------
  const THEMES = ['systeme', 'clair', 'sombre'];
  function appliquerTheme(t) {
    if (t === 'clair') document.documentElement.dataset.theme = 'light';
    else if (t === 'sombre') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    const b = $('#bouton-theme');
    if (b) b.textContent = `Thème : ${t === 'systeme' ? 'auto' : t}`;
  }
  let theme = 'systeme';
  try { theme = localStorage.getItem('dashboard-theme') ?? 'systeme'; } catch { /* stockage bloqué */ }
  appliquerTheme(theme);

  document.addEventListener('DOMContentLoaded', async () => {
    appliquerTheme(theme);
    $('#bouton-theme').addEventListener('click', () => {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      try { localStorage.setItem('dashboard-theme', theme); } catch { /* stockage bloqué */ }
      appliquerTheme(theme);
    });
    $('#bouton-actualiser').addEventListener('click', () => rafraichir());
    addEventListener('hashchange', () => { if (!$('#vue-app').hidden) aller(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#vue-app').hidden && VUES[vueActive]?.auto) rafraichir({ silencieux: true }); });

    $('#bouton-logout').addEventListener('click', async (e) => {
      await action(e.currentTarget, async () => { await api.post('logout'); });
      location.replace('/dashboard');
    });

    // Demande d'un lien par MP.
    $('#form-lien').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#discord-id');
      const message = $('#lien-message');
      const id = input.value.trim();
      if (!/^\d{15,21}$/.test(id)) { message.textContent = 'Un identifiant Discord, c’est 17 à 20 chiffres.'; return; }
      action($('button', e.currentTarget), async () => {
        try {
          const r = await api.post('lien', { discordId: id });
          message.textContent = r.message;
        } catch (err) {
          message.textContent = err.message;
        }
      });
    });

    let moi;
    try {
      moi = await api.get('moi');
    } catch (err) {
      montrer('login');
      $('#lien-message').textContent = err.message;
      return;
    }
    infosBot(moi.bot);

    // Arrivée par un lien de connexion : le jeton est après le « # ». On le retire tout de
    // suite de la barre d'adresse (et de l'historique), puis on attend le clic.
    if (location.pathname.endsWith('/connexion')) {
      const jeton = location.hash.slice(1);
      history.replaceState(null, '', '/dashboard/connexion');
      montrer('connexion');
      const bouton = $('#bouton-connexion');
      if (!/^[A-Za-z0-9_-]{40,50}$/.test(jeton)) {
        bouton.disabled = true;
        $('#connexion-message').textContent = 'Ce lien est incomplet. Demande un nouveau lien avec /admin dashboard.';
        return;
      }
      bouton.addEventListener('click', () => action(bouton, async () => {
        try {
          await api.post('login', { jeton });
          const nouveau = await api.get('moi');
          history.replaceState(null, '', '/dashboard#apercu');
          demarrerApp(nouveau);
        } catch (err) {
          $('#connexion-message').textContent = err.message;
          bouton.disabled = true;
        }
      }));
      return;
    }

    if (moi.connecte) demarrerApp(moi);
    else montrer('login');
  });
})();
