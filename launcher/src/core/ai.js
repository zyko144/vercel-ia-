// L'IA du launcher (Gemini, la même que le bot History IA) :
//  - chercher sur internet les images officielles d'un jeu quand Steam, Epic et SteamGridDB n'ont rien ;
//  - recommander des jeux d'après ce qu'on joue ;
//  - l'assistant : comprendre une demande (« lance GTA », « vérifie Valorant ») et choisir l'action.
// Rien n'est inventé ni dessiné : chaque image proposée est vérifiée avant d'être affichée.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sameName, steamImages, steamMatch } from './art.js';

export const MODELS = { chat: process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite', search: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash' };
const TOKEN_SHAPE = /^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/;

/** La clé Gemini : celle des réglages, sinon celle du .env du bot (le launcher est dans le même dossier). */
export async function geminiKeyFromEnv(dir) {
  for (const file of [path.join(dir, '.env'), path.join(dir, '..', '.env')]) {
    const text = await readFile(file, 'utf8').catch(() => null);
    const line = text?.split(/\r?\n/).find((l) => /^\s*GEMINI_API_KEY\s*=/.test(l));
    const key = line?.split('=').slice(1).join('=').trim().split(/[;,\s]+/).find((k) => k && !TOKEN_SHAPE.test(k));
    if (key) return key;
  }
  return null;
}

export async function createAi(key) {
  if (!key) return null;
  // Chargé seulement si besoin : sans ce module, le launcher marche quand même (sans IA)
  const { GoogleGenAI } = await import('@google/genai').catch(() => ({}));
  if (!GoogleGenAI) return null;
  const ai = new GoogleGenAI({ apiKey: key });
  const ask = async ({ system, text, schema, web = false, model = MODELS.chat }) => {
    const r = await ai.interactions.create({
      model, system_instruction: system, input: text, store: false,
      generation_config: { thinking_level: 'minimal' },
      ...(web ? { tools: [{ type: 'google_search' }, { type: 'url_context' }] } : {}),
      ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}),
    });
    const out = String(r.output_text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return schema ? JSON.parse(out) : out;
  };
  /** Transcrit un enregistrement du micro (bouton micro de l'assistant). */
  const transcribe = async (base64, mime) => {
    const r = await ai.interactions.create({
      model: MODELS.chat, store: false, generation_config: { thinking_level: 'minimal' },
      system_instruction: 'Tu transcris exactement ce qui est dit, en français, sans rien ajouter.',
      input: [{ type: 'text', text: 'Transcris cet enregistrement.' }, { type: 'audio', mime_type: mime, data: base64 }],
    });
    return String(r.output_text ?? '').trim();
  };
  return { ask, transcribe };
}

// ===================== Images trouvées par l'IA =====================

const ART_SCHEMA = {
  type: 'object',
  properties: {
    steamAppId: { type: 'string' }, officialName: { type: 'string' },
    cover: { type: 'string' }, hero: { type: 'string' }, logo: { type: 'string' },
  },
  required: ['steamAppId', 'officialName', 'cover', 'hero', 'logo'],
};

/** Vérifie qu'une adresse est bien une image (https, type image, pas trop petite). */
export async function isImage(url, fetchImpl = fetch) {
  if (!/^https:\/\/[^\s"'<>]+$/.test(String(url ?? ''))) return false;
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-2047' }, signal: AbortSignal.timeout(8000) });
    const type = String(res.headers.get('content-type') ?? '');
    return (res.ok || res.status === 206) && /^image\//.test(type);
  } catch {
    return false;
  }
}

/**
 * L'IA cherche le jeu sur internet : son numéro Steam s'il y est (images officielles Steam, vérifiées par le nom),
 * sinon des images officielles (site de l'éditeur, SteamGridDB, magasin Epic…), chacune vérifiée.
 */
export async function aiFindArt(ai, name, fetchImpl = fetch) {
  if (!ai) return null;
  const found = await ai.ask({
    web: true, model: MODELS.search, schema: ART_SCHEMA,
    system: 'Tu cherches sur internet les images OFFICIELLES d’un jeu vidéo ou d’un logiciel. Tu ne donnes que des adresses réellement trouvées, jamais inventées. Vide si tu ne trouves pas.',
    text: `Élément : « ${name} ».
1. steamAppId : son numéro d'application Steam s'il est vendu sur Steam (vérifie sur store.steampowered.com), sinon "".
2. officialName : son nom officiel.
3. cover : adresse directe (https, .jpg/.png/.webp) d'une jaquette verticale officielle ; hero : une grande image horizontale ; logo : le logo détouré (png). "" si introuvable.
Sources conseillées : steamgriddb.com, le site officiel de l'éditeur, store.epicgames.com, igdb.com.`,
  }).catch(() => null);
  if (!found) return null;
  const out = { art: {}, steamId: null, via: 'ia' };
  // Numéro Steam : accepté seulement si Steam confirme que c'est bien ce jeu
  if (/^\d{1,8}$/.test(found.steamAppId ?? '')) {
    const confirmed = await steamMatch(found.officialName || name, fetchImpl);
    if (confirmed === found.steamAppId || (confirmed && sameName(found.officialName, name))) {
      out.steamId = confirmed;
      out.art = await steamImages(confirmed, fetchImpl);
      return out;
    }
  }
  for (const k of ['cover', 'hero', 'logo']) if (await isImage(found[k], fetchImpl)) out.art[k] = found[k];
  return Object.keys(out.art).length ? out : null;
}

// ===================== Recommandations =====================

export async function recommend(ai, played, owned) {
  if (!ai || !played.length) return [];
  const r = await ai.ask({
    schema: { type: 'object', properties: { games: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, why: { type: 'string' } }, required: ['name', 'why'] } } }, required: ['games'] },
    system: 'Tu es un expert en jeux vidéo. Tu recommandes des jeux PC qui existent vraiment et qui sont sur Steam.',
    text: `Jeux les plus joués : ${played.slice(0, 10).join(', ')}.\nDéjà possédés (ne pas les proposer) : ${owned.slice(0, 150).join(', ')}.\nPropose 8 jeux PC sur Steam que cette personne aimerait. « why » : une raison courte (6 mots max).`,
  }).catch(() => null);
  return (r?.games ?? []).slice(0, 8);
}

// ===================== Assistant =====================

export const ACTIONS = ['launch', 'close', 'install', 'verify', 'uninstall', 'folder', 'store', 'show', 'sort', 'music', 'optimize', 'deep_clean', 'empty_bin', 'add_friend', 'accept_friends', 'friends_status', 'event', 'steam_join', 'steam_message', 'boost', 'tweak', 'startup_off', 'collection_add', 'unfavorite', 'theme', 'fullscreen', 'overlay', 'recap', 'daily_limit', 'disk_status', 'pc_status', 'none'];
const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    action: { type: 'string', enum: ACTIONS },
    target: { type: 'string' },
    value: { type: 'string' },
    extra: { type: 'string' },
  },
  required: ['reply', 'action', 'target', 'value', 'extra'],
};

/** Comprend une demande et choisit UNE action parmi la liste (le launcher l'exécute, avec confirmation si besoin). */
export async function assistant(ai, message, context) {
  if (!ai) return { reply: 'Ajoute ta clé Gemini dans les réglages pour me parler (ou lance-moi depuis le dossier du bot).', action: 'none', target: '', value: '' };
  return ai.ask({
    schema: ASSIST_SCHEMA,
    system: `Tu es « History », l'assistant du launcher de jeux History Launcher. Tu parles français, en tutoyant, en 1 à 3 phrases courtes et utiles.
La demande peut venir de la voix : elle peut contenir des fautes de reconnaissance (« rocket ligue » = Rocket League, « conteur strike » = Counter-Strike). Devine le jeu le plus proche dans la bibliothèque.
Actions possibles (une seule) :
- launch / close / install / verify / uninstall / folder / store : sur un jeu ou une appli (target = son nom EXACT dans la bibliothèque) ;
- show : afficher une vue (value = accueil | bibliotheque | jeux | applis | favoris | stats | classement | amis | pc | optimisation | parametres) ;
- sort : trier (value = joues | recents | nom | taille) ;
- music : lecteur (value = play | pause | next | previous) ;
- optimize : optimisation complète du PC (value = run) : PC lent, lag, manque de place, nettoyage ;
- deep_clean : nettoyage profond de Windows (admin) ; empty_bin : vider la corbeille ;
- add_friend : ajouter un ami History (value = son code ami exact, ex. Max#3F9A2C) ; accept_friends : accepter les demandes ; friends_status : dire qui est en ligne / qui joue ;
- event : organiser une soirée jeu (target = jeu, son jeu le plus joué s'il n'est pas précisé, value = date et heure ISO 8601 complète avec fuseau, extra = pseudos invités séparés par des virgules, vide = tous les amis) ;
- steam_join / steam_message : rejoindre la partie d'un ami Steam / lui écrire (target = son pseudo) ;
- boost : value = on | off ; tweak : réglage Windows (value = gamemode | dvr | background | ads | transparency | visualfx | mouse) ;
- startup_off : empêcher une appli de se lancer au démarrage (target = son nom) ;
- collection_add : ranger un jeu (target) dans une collection (value = nom de la collection) ; unfavorite : retirer des favoris (target) ;
- theme : value = bleu | violet | rouge | vert | orange | rose | auto ; fullscreen : mode grand écran ; overlay : infos par-dessus le jeu ; recap : résumé de la semaine ;
- daily_limit : limite de jeu par jour (value = minutes, 0 = aucune) ; disk_status : place libre ; pc_status : état du PC (processeur, carte graphique, températures) ;
- none : juste répondre (questions, conseils, statistiques, recommandations).
Laisse « extra » vide si tu ne t'en sers pas. Tu peux faire ces actions à la place de l'utilisateur : fais-le directement, sans lui demander de le faire lui-même.
Pour les questions (« à quoi je joue le plus », « quel jeu lancer ce soir », « combien d'heures sur X »), réponds avec les vrais chiffres de la bibliothèque.
N'invente jamais un jeu qui n'est pas dans la bibliothèque. Pour désinstaller, précise qu'une confirmation va s'afficher.`,
    text: `Date : ${new Date().toLocaleString('fr-FR')}\nBibliothèque (nom · source · installé · heures) :\n${context.items}\n\nMusique en cours : ${context.music || 'rien'}${context.extra ? `\n${context.extra}` : ''}\n\nDemande : ${message}`,
  });
}
