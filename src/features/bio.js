// Le lien du site dans la bio du bot. La bio (« À propos de moi » sur son profil) est la
// description de l'application Discord : on y ajoute une ligne avec le lien, sans toucher au reste.
import { config } from '../config.js';

const MAX_LENGTH = 400; // limite de Discord pour la description d'une application

/**
 * Met le lien du site dans la bio, s'il n'y est pas déjà. Une ancienne ligne de site
 * (même libellé, autre adresse) est remplacée plutôt qu'ajoutée une deuxième fois.
 *
 * @param {import('discord.js').Client} client connecté
 * @param {{ url?: string, label?: string, tag?: string }} [options]
 */
export async function putSiteInBio(client, { url = config.site.url, label = '🌐 Le site', tag = 'bot' } = {}) {
  if (!url || !config.site.bio) return;
  try {
    const app = await client.application.fetch();
    const current = app.description ?? '';
    if (current.includes(url)) return;
    const line = `${label} : ${url}`;
    const kept = current.split('\n').filter((l) => !l.startsWith(label)).join('\n').trim();
    const room = MAX_LENGTH - line.length - 2;
    const base = kept.length > room ? `${kept.slice(0, Math.max(0, room - 1)).trimEnd()}…` : kept;
    await client.application.edit({ description: base ? `${base}\n\n${line}` : line });
    console.log(`🌐 [${tag}] lien du site ajouté dans la bio : ${url}`);
  } catch (err) {
    console.warn(`[bio ${tag}] impossible de mettre le lien du site :`, err.message);
  }
}
