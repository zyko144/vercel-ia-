/**
 * Essai local de la table de roulette cliquable, sans bot ni Discord : un petit
 * serveur qui ne sert que la table, et des liens personnels pour des joueurs d'essai.
 * Les jetons sont ceux du stockage local (data/), jamais ceux de Render.
 *
 *   node tools/roulette-local.mjs          puis ouvrir les liens affichés
 */
import http from 'node:http';

process.env.RENDER_EXTERNAL_URL = '';
process.env.PUBLIC_URL = 'http://localhost:4180';
process.env.SUPABASE_URL = ''; // jamais la vraie banque pendant un essai
const { handleRouletteWeb, createSession } = await import('../src/casinho/roulette-web.js');
const { grant, balance } = await import('../src/casinho/economy.js');

const ROOM = '100000000000000001';
const players = [
  { id: '900000000000000001', name: 'Essai-A' },
  { id: '900000000000000002', name: 'Essai-B' },
];
for (const player of players) {
  const have = await balance(player.id);
  if (have < 100_000) await grant(player.id, 1_000_000 - have);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!(await handleRouletteWeb(req, res, url))) {
      res.writeHead(404);
      res.end('introuvable');
    }
  })
  .listen(4180, () => {
    console.log('Table de roulette locale : http://localhost:4180/roulette/');
    for (const player of players) console.log(`  ${player.name} : http://localhost:4180/roulette/?room=${ROOM}#s=${createSession(player)}`);
  });
