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
    tâches: 'Jeux et modération', images: 'Images', test: 'Tests d’ici', autre: 'Autre',
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
                ligne('En ligne depuis', null, h('span', { class: 'num', text: duree(d.bot.uptime) })),
                ligne('Mémoire utilisée', 'Render gratuit : 512 Mo au total', h('span', { class: 'num', text: `${d.bot.ramMb} Mo` })),
                ligne('Réactivité', 'Retard moyen de la boucle Node.js', h('span', { class: 'num', text: `${d.bot.loopMs} ms` })),
                ligne('Modèle de secours', 'Prend le relais si le principal sature', h('span', { class: 'mono', text: ai.fallback })),
                ligne('Site', null, d.services.site ? h('a', { href: d.services.site, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir' }) : h('span', { class: 'mute', text: 'pas d’adresse' }))))),
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
      intro: 'Ce qui joue en vocal, et l’état des serveurs audio (Lavalink) qui lisent la musique.',
      auto: 8000,
      async rendre(zone) {
        const d = await api.get('musique');
        const lecteurs = d.players.filter((p) => p.current);
        append(zone, [
          lecteurs.length
            ? h('div', { class: 'grid cols-2' }, lecteurs.map((p) => {
              const barre = h('i');
              barre.style.width = p.current.duration ? `${Math.min(100, (p.position / p.current.duration) * 100)}%` : '0%';
              const bouton = (texte, act, danger) => {
                const b = h('button', { class: `btn small${danger ? ' danger' : ''}`, type: 'button', text: texte });
                b.addEventListener('click', () => action(b, async () => { await api.post('musique/action', { guildId: p.guildId, action: act }); rafraichir(); }));
                return b;
              };
              return card(p.guild,
                h('p', { class: 'sub', text: p.current.artist ? `${p.current.title} · ${p.current.artist}` : p.current.title }),
                h('div', { class: 'progress' }, barre),
                h('p', { class: 'sub num', text: `${minsec(p.position)} / ${p.current.live ? 'direct' : minsec(p.current.duration)} · ${p.queue} son(s) en attente${p.filters.length ? ` · effets : ${p.filters.join(', ')}` : ''}` }),
                h('div', { class: 'actions' }, bouton(p.paused ? 'Reprendre' : 'Pause', 'pause'), bouton('Passer', 'passer'), bouton('Arrêter', 'arreter', true), pill(p.paused ? 'En pause' : 'En lecture', p.paused ? 'warn' : 'ok')));
            }))
            : card(null, vide('Rien ne joue en ce moment', 'Lance un son avec /play dans Discord.')),
          h('div', { class: 'grid cols-2' },
            card('Serveurs audio', d.nodes.length
              ? h('div', { class: 'rows' }, d.nodes.map((n) => ligne(n.name, n.connected ? `v${n.version ?? '?'} · ${n.players} lecteur(s)${n.cpu !== null ? ` · CPU ${Math.round(n.cpu * 100)} %` : ''}` : 'Injoignable',
                pill(!n.connected ? 'Hors ligne' : n.incompatible ? 'Refusé par Discord' : n.broken ? 'Problèmes de lecture' : 'En ligne', !n.connected || n.incompatible ? 'bad' : n.broken ? 'warn' : 'ok'))))
              : vide('Aucun serveur audio', 'La musique passe par le lecteur local.')),
            card('Derniers événements', d.events.length
              ? h('div', { class: 'rows' }, d.events.map((e) => ligne(e.text, dateHeure(e.at), null)))
              : vide('Rien à signaler', ''))),
        ]);
      },
    },

    casino: {
      titre: 'Casino',
      intro: 'Les plus gros tas de jetons de Casinho. Les jetons sont fictifs : ils ne s’achètent pas et ne se retirent pas.',
      async rendre(zone) {
        const d = await api.get('casino');
        append(zone, card('Classement', !d.enabled ? h('p', { class: 'sub', text: 'Casinho n’a pas de token : le casino est éteint. Le classement ci-dessous vient des parties passées.' }) : null,
          d.top.length
            ? h('div', { class: 'table-wrap' }, h('table', {},
              h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Joueur' }), h('th', { class: 'right', text: 'Jetons' }))),
              h('tbody', {}, d.top.map((p, i) => h('tr', {}, h('td', { class: 'num', text: i + 1 }), h('td', {}, personne(p)), h('td', { class: 'right num', text: num(p.chips) }))))))
            : vide('Personne n’a encore joué', 'Le classement se remplit avec /casino.')));
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

    const modifies = () => Object.keys(valeurs).filter((k) => valeurs[k] !== initial[k]);
    function maj() {
      const liste = modifies();
      barre.hidden = !liste.length;
      compte.textContent = `${liste.length} changement(s) non enregistré(s)`;
      for (const [key, champ] of Object.entries(champs)) champ.bloc.classList.toggle('changed', valeurs[key] !== initial[key]);
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
    const garder = vueActive === 'journaux';
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
    if (!VUES[location.hash.slice(1)]) history.replaceState(null, '', '/dashboard#apercu');
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
