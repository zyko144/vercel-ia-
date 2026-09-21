/**
 * Décors de table du casino, générés en local par IA (Stable Diffusion, carte graphique).
 *
 *   node tools/make-casino-tables.mjs [table] [--seeds=3]
 *
 * Produit plusieurs essais par table dans .ai-local/tmp/tables/ pour choisir le
 * meilleur ; le décor retenu est ensuite recadré dans assets/casinho/tables/.
 * Rien de tout ça ne tourne sur Render : c'est une étape de fabrication.
 */
import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const LOCAL = path.resolve('.ai-local');
const OUT = path.join(LOCAL, 'tmp', 'tables');

const NEGATIVE = [
  'cartoon, anime, illustration, painting, 3d render, cgi',
  'text, letters, numbers, watermark, logo, signature',
  'playing cards, poker chips, dice, money',
  'deformed, mutated hands, extra fingers, bad anatomy, distorted face',
  'blurry, lowres, jpeg artifacts, oversaturated, overexposed',
].join(', ');

const LOOK = 'deep burgundy velvet felt, soft pink and magenta neon lights in the background, dark elegant luxury casino interior, shallow depth of field, warm rim light, cinematic lighting, sharp focus, highly detailed, 35mm film photo';

export const TABLES = {
  blackjack: `cinematic photo of an empty casino blackjack table seen from the player's seat, a professional croupier in a black vest and white shirt standing behind the table, looking at the camera with a slight smile, hands resting on the table edge, the felt table fills the lower half of the image, ${LOOK}`,
  des: `cinematic photo of a casino craps table, a smiling croupier in a black vest and white shirt standing behind the table holding a wooden stick, the burgundy felt table fills the lower third of the image, ${LOOK}`,
  machine: `cinematic photo of a row of luxury casino slot machines glowing with pink and magenta neon, one machine in the center in sharp focus with a large screen, polished chrome and dark wood, no people, ${LOOK}`,
  roulette: `cinematic photo of a luxury casino roulette table, a professional croupier in a black vest and white shirt standing behind a polished wooden roulette wheel, the betting layout fills the lower half of the image, ${LOOK}`,
};

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const seeds = Number(args.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 3);

await mkdir(OUT, { recursive: true });
for (const [name, prompt] of Object.entries(TABLES)) {
  if (only && only !== name) continue;
  for (let i = 0; i < seeds; i++) {
    const seed = 4200 + i * 97;
    const file = path.join(OUT, `${name}-${seed}.png`);
    if (await stat(file).then(() => true).catch(() => false)) {
      console.log(`  ${name} #${seed} — déjà là`);
      continue;
    }
    const started = Date.now();
    await run(
      path.join(LOCAL, 'sd', 'sd-cli.exe'),
      [
        '-M', 'img_gen',
        '-m', path.join(LOCAL, 'models', 'dreamshaper-xl-turbo.safetensors'),
        '--vae', path.join(LOCAL, 'models', 'sdxl-vae-fp16-fix.safetensors'),
        '-p', prompt,
        '-n', NEGATIVE,
        '-W', '1024', '-H', '576',
        '--steps', '8', '--cfg-scale', '2', '--sampling-method', 'dpm++2mv2',
        '--seed', String(seed),
        '--vae-tiling', '--backend', 'vulkan0',
        '-o', file,
      ],
      { maxBuffer: 1024 * 1024 * 32, timeout: 15 * 60_000 },
    );
    console.log(`  ${name} #${seed} — ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}
console.log(`Essais dans ${OUT}`);
