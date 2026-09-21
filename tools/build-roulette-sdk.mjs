/**
 * Prépare le kit des Activités Discord pour le navigateur : un seul fichier,
 * web/roulette/sdk.js, servi par le bot. Il est versionné : Render n'a rien à construire.
 *
 *   npm run build:roulette
 */
import { build } from 'esbuild';

await build({
  stdin: { contents: "export { DiscordSDK } from '@discord/embedded-app-sdk';", resolveDir: process.cwd() },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  platform: 'browser',
  outfile: 'web/roulette/sdk.js',
  legalComments: 'eof',
});
console.log('web/roulette/sdk.js prêt');
