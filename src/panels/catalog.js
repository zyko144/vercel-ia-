// Le contenu des panneaux : chaque commande (/sanction, /jeux…) ouvre un panneau, et chaque action du
// menu réutilise une commande existante (« cmd ») ou une fonction dédiée (« run »).
// Les champs (« fields ») deviennent une fenêtre à remplir ; sans champ, l'action part directement.
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { FAN_THEMES } from '../games/fans.js';
import { BEAT_STYLES } from '../games/freestyle.js';
import { STORY_LENGTHS, STORY_THEMES } from '../games/histoire.js';
import { IMPOSTOR_THEMES } from '../games/imposteur.js';
import { REBUS_THEMES } from '../games/rebus.js';
import { FILTERS } from '../music/filters.js';
import { field as f } from './ui.js';

const choicesOf = (map) => Object.entries(map).map(([value, item]) => ({ label: item.label, value, emoji: item.emoji }));
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const reason = f.text('raison', 'Raison', { max: 400, ph: 'Visible dans le journal d’audit et en MP' });

export const PANELS = {
  // ===================== /sanction =====================
  sanction: {
    key: 'sanction', command: 'sanction', color: 0xff3355, emoji: '🛡️', title: 'Sanctions',
    intro: 'Choisis une action, remplis la fenêtre, c’est fait. Chaque sanction prévient le membre en MP et reste dans le journal d’audit.',
    perm: P.ModerateMembers,
    groups: [{
      label: 'Sanctionner',
      actions: [
        { id: 'warn', label: 'Avertir', emoji: '⚠️', desc: 'Un avertissement (compté)', cmd: 'warn', stamp: 'avertissement', fields: [f.user('membre', 'Membre', { req: true }), f.text('raison', 'Raison', { req: true, max: 400 })] },
        { id: 'mute', label: 'Rendre muet', emoji: '🔇', desc: 'Exclusion temporaire (10m, 1h, 1j…)', cmd: 'mute', stamp: 'sanction', fields: [f.user('membre', 'Membre', { req: true }), f.text('duree', 'Durée', { req: true, max: 30, ph: '10m, 1h, 1j (28 jours max)' }), reason] },
        { id: 'unmute', label: 'Rendre la parole', emoji: '🔊', desc: 'Fin de l’exclusion temporaire', cmd: 'unmute', fields: [f.user('membre', 'Membre', { req: true }), reason] },
        { id: 'kick', label: 'Expulser', emoji: '👢', desc: 'Il pourra revenir avec une invitation', cmd: 'kick', stamp: 'sanction', perm: P.KickMembers, fields: [f.user('membre', 'Membre', { req: true }), reason] },
        { id: 'ban', label: 'Bannir', emoji: '🔨', desc: 'Définitif jusqu’au débannissement', cmd: 'ban', stamp: 'sanction', perm: P.BanMembers, fields: [f.user('membre', 'Membre', { req: true }), reason, f.choice('messages', 'Supprimer ses messages', [
          { label: 'Ne rien supprimer', value: '0' }, { label: 'Dernière heure', value: '3600' }, { label: 'Dernières 24 h', value: '86400' }, { label: '7 derniers jours', value: '604800' },
        ])] },
        { id: 'unban', label: 'Débannir', emoji: '✅', desc: 'Avec l’identifiant du compte', cmd: 'unban', perm: P.BanMembers, fields: [f.text('id', 'Identifiant Discord', { req: true, max: 25, ph: 'Clic droit sur le compte › Copier l’identifiant' }), reason] },
        { id: 'warns', label: 'Voir ses avertissements', emoji: '📋', desc: 'Ou les effacer', cmd: 'warns', fields: [f.user('membre', 'Membre', { req: true }), f.bool('effacer', 'Effacer tous ses avertissements ?')] },
      ],
    }, {
      label: 'Salon',
      actions: [
        { id: 'clear', label: 'Supprimer des messages', emoji: '🧹', desc: '1 à 100, d’un membre ou de tous', cmd: 'clear', perm: P.ManageMessages, fields: [f.int('nombre', 'Combien de messages', { req: true, min: 1, top: 100, ph: '1 à 100' }), f.user('membre', 'Seulement ceux de ce membre')] },
        { id: 'slowmode', label: 'Mode lent', emoji: '🐢', desc: 'Temps entre deux messages', cmd: 'slowmode', perm: P.ManageChannels, fields: [f.int('secondes', 'Secondes (0 = désactivé)', { req: true, min: 0, top: 21600 }), f.channel('salon', 'Salon (vide = ici)', { types: TEXT })] },
        { id: 'lock', label: 'Verrouiller un salon', emoji: '🔒', desc: 'Plus personne ne peut écrire', cmd: 'lock', perm: P.ManageChannels, fields: [f.channel('salon', 'Salon (vide = ici)', { types: TEXT }), reason] },
        { id: 'unlock', label: 'Déverrouiller un salon', emoji: '🔓', cmd: 'unlock', perm: P.ManageChannels, fields: [f.channel('salon', 'Salon (vide = ici)', { types: TEXT })] },
      ],
    }],
  },

  // ===================== /jeux =====================
  jeux: {
    key: 'jeux', command: 'jeux', color: 0x3dff9a, emoji: '🎮', title: 'Jeux',
    intro: 'Tous les jeux sont dans l’arcade, une Activité Discord où tout le salon joue ensemble.',
    groups: [],
  },

  musique: {
    key: 'musique', command: 'musique', color: 0xff5fd2, emoji: '🎵', title: 'Musique',
    intro: 'Lance un son, gère la file, les effets, les playlists et la radio. Le bot joue dans son salon vocal.',
    groups: [{
      label: 'Lecture',
      actions: [
        { id: 'play', label: 'Jouer un son', emoji: '▶️', desc: 'Nom ou lien Spotify, YouTube, Deezer…', cmd: 'play', fields: [f.text('recherche', 'Titre, artiste ou lien', { req: true, max: 500 }), f.bool('suivant', 'Le jouer juste après le son en cours ?')] },
        { id: 'pause', label: 'Pause / reprendre', emoji: '⏯️', cmd: 'pause' },
        { id: 'skip', label: 'Passer', emoji: '⏭️', cmd: 'skip', fields: [f.int('nombre', 'Combien de sons (défaut 1)', { min: 1, top: 100 })] },
        { id: 'previous', label: 'Son précédent', emoji: '⏮️', cmd: 'previous' },
        { id: 'stop', label: 'Arrêter la musique', emoji: '⏹️', cmd: 'stop' },
        { id: 'nowplaying', label: 'Son en cours', emoji: '💿', cmd: 'nowplaying' },
        { id: 'queue', label: 'File d’attente', emoji: '📜', cmd: 'queue' },
        { id: 'volume', label: 'Volume', emoji: '🔊', cmd: 'volume', fields: [f.int('niveau', 'Volume (0 à 100)', { req: true, min: 0, top: 100 })] },
        { id: 'loop', label: 'Boucle', emoji: '🔁', cmd: 'loop', fields: [f.choice('mode', 'Mode', [{ label: 'Désactivée', value: 'off' }, { label: 'Ce son', value: 'track' }, { label: 'Toute la file', value: 'queue' }], { req: true })] },
        { id: 'shuffle', label: 'Mélanger la file', emoji: '🔀', cmd: 'shuffle' },
        { id: 'seek', label: 'Aller à un moment', emoji: '⏩', cmd: 'seek', fields: [f.text('temps', 'Moment', { req: true, max: 10, ph: '1:30 ou 90' })] },
        { id: 'remove', label: 'Retirer un son de la file', emoji: '➖', cmd: 'remove', fields: [f.int('position', 'Position', { req: true, min: 1, top: 10000 })] },
        { id: 'move', label: 'Déplacer un son', emoji: '↕️', cmd: 'move', fields: [f.int('de', 'Position actuelle', { req: true, min: 1, top: 10000 }), f.int('vers', 'Nouvelle position', { req: true, min: 1, top: 10000 })] },
        { id: 'clearqueue', label: 'Vider la file', emoji: '🗑️', cmd: 'clearqueue' },
        { id: 'filter', label: 'Effet audio', emoji: '🎛️', desc: '8D, bass boost, nightcore…', cmd: 'filter', fields: [f.choice('effet', 'Effet', [{ label: 'Enlever tous les effets', value: 'none', emoji: '❌' }, ...Object.entries(FILTERS).map(([value, x]) => ({ label: x.label, value, emoji: x.emoji }))].slice(0, 25), { req: true })] },
        { id: 'autoplay', label: 'Lecture auto', emoji: '♾️', desc: 'Enchaîne des sons du même style', cmd: 'autoplay' },
        { id: 'lyrics', label: 'Paroles', emoji: '📝', cmd: 'lyrics', fields: [f.text('recherche', 'Son (vide = celui en cours)', { max: 500 })] },
        { id: 'karaoke', label: 'Karaoké', emoji: '🎤', cmd: 'karaoke', fields: [f.text('recherche', 'Son (vide = celui en cours)', { max: 500 })] },
        { id: 'join', label: 'Venir dans mon vocal', emoji: '📥', cmd: 'join' },
        { id: 'leave', label: 'Renvoyer le bot chez lui', emoji: '📤', cmd: 'leave' },
      ],
    }, {
      label: 'Playlists, radio et partage',
      actions: [
        { id: 'radio', label: 'Radio non-stop', emoji: '📻', cmd: 'radio', fields: [f.text('style', 'Style (vide = top du moment)', { max: 100, ph: 'rap fr, chill, années 90…' })] },
        { id: 'radio-stop', label: 'Arrêter la radio', emoji: '📴', cmd: 'radio', fixed: { arreter: true } },
        { id: 'pl-jouer', label: 'Jouer une playlist (lien)', emoji: '💽', cmd: 'playlist', sub: 'jouer', fields: [f.text('lien', 'Lien de la playlist ou de l’album', { req: true, max: 500 }), f.bool('melanger', 'Mélanger ?')] },
        { id: 'pl-generer', label: 'Playlist créée par l’IA', emoji: '✨', cmd: 'playlist', sub: 'generer', fields: [f.text('ambiance', 'Ambiance', { req: true, max: 200, ph: 'Soirée rap FR, chill pour réviser…' }), f.int('nombre', 'Nombre de sons (5-25)', { min: 5, top: 25 })] },
        { id: 'pl-liste', label: 'Mes playlists', emoji: '📚', cmd: 'playlist', sub: 'liste' },
        { id: 'pl-lancer', label: 'Lancer une de mes playlists', emoji: '🚀', cmd: 'playlist', sub: 'lancer', fields: [f.text('nom', 'Nom de la playlist', { req: true, max: 50 }), f.bool('melanger', 'Mélanger ?')] },
        { id: 'pl-voir', label: 'Voir une de mes playlists', emoji: '👀', cmd: 'playlist', sub: 'voir', fields: [f.text('nom', 'Nom de la playlist', { req: true, max: 50 })] },
        { id: 'pl-creer', label: 'Créer une playlist', emoji: '🆕', cmd: 'playlist', sub: 'creer', fields: [f.text('nom', 'Nom', { req: true, max: 50 }), f.text('lien', 'Lien à importer (facultatif)', { max: 500 })] },
        { id: 'pl-ajouter', label: 'Ajouter des sons à une playlist', emoji: '➕', desc: 'Plusieurs sons : sépare par |', cmd: 'playlist', sub: 'ajouter', fields: [f.text('nom', 'Playlist', { req: true, max: 50 }), f.text('recherche', 'Sons (vide = le son en cours)', { max: 500 })] },
        { id: 'pl-file', label: 'Ajouter la file à une playlist', emoji: '📥', cmd: 'playlist', sub: 'ajouter-file', fields: [f.text('nom', 'Playlist', { req: true, max: 50 })] },
        { id: 'pl-importer', label: 'Importer dans une playlist', emoji: '📦', cmd: 'playlist', sub: 'importer', fields: [f.text('nom', 'Playlist', { req: true, max: 50 }), f.text('lien', 'Lien', { req: true, max: 500 })] },
        { id: 'pl-retirer', label: 'Retirer un son d’une playlist', emoji: '➖', cmd: 'playlist', sub: 'retirer', fields: [f.text('nom', 'Playlist', { req: true, max: 50 }), f.int('position', 'Numéro du son', { req: true, min: 1, top: 10000 })] },
        { id: 'pl-supprimer', label: 'Supprimer une playlist', emoji: '🗑️', cmd: 'playlist', sub: 'supprimer', fields: [f.text('nom', 'Playlist', { req: true, max: 50 })] },
        { id: 'topsons', label: 'Sons les plus écoutés', emoji: '🏅', cmd: 'topsons', fields: [f.choice('periode', 'Période', [{ label: 'Ce mois-ci', value: 'month' }, { label: 'Depuis le début', value: 'all' }]), f.user('membre', 'Le top de quelqu’un (vide = le serveur)')] },
        { id: 'spotify', label: 'Partager mon Spotify', emoji: '🟢', cmd: 'spotify', fields: [f.bool('suivre', 'Le bot joue la même chose en vocal ?')] },
        { id: 'spotify-stop', label: 'Arrêter le partage Spotify', emoji: '⛔', cmd: 'spotify', fixed: { arreter: true } },
        { id: 'direct', label: 'Diffuser le son de mon PC', emoji: '🔴', cmd: 'direct' },
        { id: 'direct-stop', label: 'Arrêter la diffusion', emoji: '⏹️', cmd: 'direct', fixed: { arreter: true } },
      ],
    }],
  },

  // ===================== /ia =====================
  ia: {
    key: 'ia', command: 'ia', color: 0xa58bff, emoji: '🧠', title: 'Intelligence artificielle',
    intro: 'Pose une question, crée une image, fais-toi aider pour du code ou parle à l’IA en vocal.',
    groups: [{
      label: 'Demander à l’IA',
      actions: [
        { id: 'ask', label: 'Poser une question', emoji: '💬', desc: 'Réponse visible que par toi', cmd: 'ask', fields: [f.para('question', 'Ta question', { req: true, max: 3000 }), f.file('fichier', 'Image, PDF ou fichier (facultatif)')] },
        { id: 'explique', label: 'Expliquer un sujet', emoji: '🎓', cmd: 'explique', fields: [f.para('sujet', 'Ce que tu veux comprendre', { req: true, max: 2000 }), f.choice('niveau', 'Niveau', [{ label: 'Ultra simple', value: 'simple' }, { label: 'Normal', value: 'normal' }, { label: 'Expert', value: 'expert' }])] },
        { id: 'code', label: 'Aide en code', emoji: '💻', cmd: 'code', fields: [f.para('demande', 'Ta demande (tu peux coller ton code)', { req: true, max: 4000 }), f.text('langage', 'Langage', { max: 40, ph: 'JavaScript, Python, Lua…' }), f.file('fichier', 'Fichier ou capture de l’erreur')] },
        { id: 'corriger', label: 'Corriger un texte', emoji: '✏️', cmd: 'corriger', fields: [f.para('texte', 'Le texte', { req: true, max: 4000 })] },
        { id: 'traduire', label: 'Traduire', emoji: '🌍', cmd: 'traduire', fields: [f.para('texte', 'Le texte', { req: true, max: 4000 }), f.text('langue', 'Langue voulue', { max: 50, ph: 'Vide : français (ou anglais si c’est déjà du français)' })] },
        { id: 'resume', label: 'Résumer le salon', emoji: '📰', desc: 'T’as raté quoi ?', cmd: 'resume-salon', fields: [f.int('messages', 'Messages à lire (10-100)', { min: 10, top: 100 })] },
        { id: 'image', label: 'Créer une image', emoji: '🎨', cmd: 'image', fields: [f.para('prompt', 'Décris l’image', { req: true, max: 2000 }), f.choice('format', 'Format', [
          { label: 'Carré (1:1)', value: '1:1' }, { label: 'Paysage (16:9)', value: '16:9' }, { label: 'Portrait / story (9:16)', value: '9:16' }, { label: 'Photo paysage (4:3)', value: '4:3' }, { label: 'Bannière (21:9)', value: '21:9' },
        ]), f.bool('pro', 'Qualité max (réservé au chef)')] },
        { id: 'modifier', label: 'Modifier une image', emoji: '🖌️', cmd: 'modifier-image', fields: [f.file('image', 'L’image', { req: true }), f.para('consigne', 'Ce qu’il faut changer', { req: true, max: 2000 }), f.file('image2', 'Deuxième image à combiner')] },
        { id: 'reset', label: 'Effacer ma conversation', emoji: '🧽', desc: 'Mémoire + fil privé : l’IA repart de zéro', cmd: 'clear' },
      ],
    }, {
      label: 'IA vocale',
      actions: [
        { id: 'vocal', label: 'Parler à l’IA en vocal', emoji: '🎙️', desc: 'Elle répond à voix haute', cmd: 'vocal' },
        { id: 'vocal-stop', label: 'Arrêter la conversation vocale', emoji: '⏹️', cmd: 'vocal', fixed: { arreter: true } },
      ],
    }],
  },

  // Les panneaux /serveur et /pannel ajoutent leurs actions dédiées (voir serveur.js, tickets.js, build.js)
  serveur: {
    key: 'serveur', command: 'serveur', color: 0x4db8ff, emoji: '🧭', title: 'Serveur',
    intro: 'Les outils du serveur : infos, rôles, messages, rappels, contact du chef, et l’offre premium.',
    groups: [{
      label: 'Outils',
      actions: [
        { id: 'userinfo', label: 'Infos sur un membre', emoji: '👤', cmd: 'userinfo', fields: [f.user('membre', 'Membre (vide = toi)')] },
        { id: 'serverinfo', label: 'Infos sur le serveur', emoji: '🏠', cmd: 'serverinfo' },
        { id: 'avatar', label: 'Photo de profil', emoji: '🖼️', cmd: 'avatar', fields: [f.user('membre', 'Membre (vide = toi)')] },
        { id: 'role', label: 'Donner / retirer un rôle', emoji: '🎭', cmd: 'role', perm: P.ManageRoles, fields: [f.choice('action', 'Action', [{ label: 'Ajouter', value: 'add', emoji: '➕' }, { label: 'Retirer', value: 'remove', emoji: '➖' }], { req: true }), f.user('membre', 'Membre', { req: true }), f.role('role', 'Rôle', { req: true })] },
        { id: 'say', label: 'Faire parler le bot', emoji: '📢', cmd: 'say', perm: P.ManageMessages, fields: [f.para('message', 'Le message', { req: true, max: 2000 }), f.channel('salon', 'Salon (vide = ici)', { types: TEXT })] },
        { id: 'sondage', label: 'Sondage', emoji: '📊', cmd: 'sondage', fields: [f.text('question', 'Question', { req: true, max: 300 }), f.para('choix', 'Choix, séparés par |', { req: true, max: 600, ph: 'Pizza | Sushi | Tacos' }), f.int('duree', 'Durée en heures (1-168)', { min: 1, top: 168 }), f.bool('multiple', 'Plusieurs réponses ?')] },
        { id: 'rappel', label: 'Me faire un rappel', emoji: '⏰', cmd: 'rappel', fields: [f.text('dans', 'Dans combien de temps', { req: true, max: 30, ph: '10m, 2h, 1h30, 3j' }), f.text('message', 'De quoi te rappeler', { req: true, max: 500 })] },
        { id: 'contacter', label: 'Contacter le chef', emoji: '📨', cmd: 'contacter-chef', fields: [f.para('message', 'Ton message', { req: true, max: 1500 })] },
        { id: 'tribunal', label: 'Tribunal des sons (juges)', emoji: '⚖️', cmd: 'tribunal', fields: [f.choice('action', 'Action', [
          { label: 'Publier le règlement', value: 'reglement', emoji: '📜' }, { label: 'État de la semaine', value: 'semaine', emoji: '📊' }, { label: 'Bilan animé (GIF)', value: 'bilan', emoji: '🏛️' },
          { label: 'Battle : le serveur vote 24 h', value: 'battle', emoji: '⚔️' }, { label: 'Clôturer la semaine', value: 'cloturer', emoji: '⚖️' },
        ])] },
        { id: 'aide', label: 'Aide : tout ce que fait le bot', emoji: '❓', cmd: 'aide' },
        { id: 'ping', label: 'Le bot va bien ?', emoji: '🏓', cmd: 'ping' },
      ],
    }],
  },

  pannel: {
    key: 'pannel', command: 'pannel', color: 0xffc94d, emoji: '🧩', title: 'Panneaux et construction',
    intro: 'Crée un panneau de tickets ou une annonce avec aperçu avant publication, ou construis des salons en un clic.',
    perm: P.ManageGuild,
    groups: [{ label: 'Créer', actions: [] }],
  },
};

/** Les noms des nouvelles commandes (un panneau chacune). */
export const PANEL_COMMANDS = Object.fromEntries(Object.values(PANELS).map((p) => [p.command, p.key]));

/** Ajoute des actions à un panneau (tickets, construction, premium… s'y inscrivent). */
export function addActions(panelKey, groupLabel, actions) {
  const panel = PANELS[panelKey];
  let group = panel.groups.find((g) => g.label === groupLabel);
  if (!group) panel.groups.push(group = { label: groupLabel, actions: [] });
  group.actions.push(...actions);
}

/** Retrouve une action. */
export function findAction(panelKey, actionId) {
  for (const group of PANELS[panelKey]?.groups ?? []) {
    const action = group.actions.find((a) => a.id === actionId);
    if (action) return action;
  }
  return null;
}
