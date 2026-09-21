/**
 * Prépare le kit des Activités Discord pour le navigateur : un seul fichier,
 * web/salle/sdk.js, servi par le bot. Il est versionné : Render n'a rien à construire.
 *
 *   npm run build:salle
 */
import { build } from 'esbuild';

await build({
  stdin: { contents: "export { DiscordSDK } from '@discord/embedded-app-sdk';", resolveDir: process.cwd() },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  platform: 'browser',
  outfile: 'web/salle/sdk.js',
  legalComments: 'eof',
});
console.log('web/salle/sdk.js prêt');
