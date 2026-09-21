/**
 * Publie (ou met à jour) le guide du casino dans le salon des jeux, et l'épingle.
 *
 *   node tools/publier-guide-casino.mjs [--salon=<id>]
 *
 * Passe par l'API REST de Discord avec le token du bot Casinho : aucune connexion
 * au gateway, donc aucun conflit avec le bot qui tourne sur Render. Relancé, le
 * script modifie le message déjà épinglé au lieu d'en poster un deuxième.
 */
import 'dotenv/config';
import { config } from '../src/config.js';
import { guideButtons, guideEmbeds } from '../src/casinho/guide.js';

const CHANNEL = process.argv.find((arg) => arg.startsWith('--salon='))?.split('=')[1] ?? '1551202111092560062'; // 🃏・jeux
const API = 'https://discord.com/api/v10';
const headers = { Authorization: `Bot ${config.casinho.token}`, 'Content-Type': 'application/json' };

async function call(method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok && response.status !== 204) throw new Error(`${method} ${route} → ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

if (!config.casinho.token) throw new Error('TOKEN_CASINHO absent du .env');

const me = await call('GET', '/users/@me');
const payload = {
  embeds: guideEmbeds().map((embed) => embed.toJSON()),
  components: guideButtons().map((row) => row.toJSON()),
};

// Un guide déjà épinglé par le bot ? On le met à jour.
const pins = await call('GET', `/channels/${CHANNEL}/pins`);
const existing = pins.find((message) => message.author?.id === me.id && message.embeds?.[0]?.title === '🎰 Bienvenue au Casinho');

let message;
if (existing) {
  message = await call('PATCH', `/channels/${CHANNEL}/messages/${existing.id}`, payload);
  console.log(`Guide mis à jour : ${message.id}`);
} else {
  message = await call('POST', `/channels/${CHANNEL}/messages`, payload);
  await call('PUT', `/channels/${CHANNEL}/pins/${message.id}`);
  console.log(`Guide publié et épinglé : ${message.id}`);
}
console.log(`https://discord.com/channels/${config.casinho.guildId}/${CHANNEL}/${message.id}`);
