/**
 * Génération des assets du casino (images IA) — hors ligne, jamais pendant qu'un joueur attend.
 *
 *   npx tsx scripts/assets.ts                      # tout ce qui manque
 *   npx tsx scripts/assets.ts --only=game/mines    # un asset précis
 *   npx tsx scripts/assets.ts --only=game/ --drafts=3
 *   npx tsx scripts/assets.ts --force --provider=local
 *
 * Chaque image est générée, recadrée, optimisée (WebP + miniature + placeholder flou)
 * puis référencée dans src/ai/manifest.json avec son prompt, sa graine et son fournisseur.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { allAssets, NEGATIVE, type AssetSpec } from '../src/ai/prompts';
import { pickProvider } from '../src/ai/providers';

const args = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=') as [string, string]));
const ONLY = args.get('only');
const DRAFTS = Number(args.get('drafts') ?? 1);
const FORCE = args.has('force');
const PROVIDER = args.get('provider');

const OUT = path.join(process.cwd(), 'public', 'generated');
const MANIFEST = path.join(process.cwd(), 'src', 'ai', 'manifest.json');

type Entry = {
  slug: string;
  kind: string;
  path: string;
  thumb: string;
  lqip: string;
  width: number;
  height: number;
  provider: string;
  seed: number;
  prompt: string;
  hash: string;
  createdAt: string;
};

const readManifest = async (): Promise<Record<string, Entry>> => {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
};

/** Recadre (en gardant le centre), optimise et écrit les variantes. */
async function write(spec: AssetSpec, raw: Buffer, provider: string, seed: number) {
  const target =
    spec.aspect === 'wide' ? { width: 1536, height: 864 } : spec.aspect === 'portrait' ? { width: 768, height: 1024 } : { width: 1024, height: 1024 };

  let image = sharp(raw);
  const meta = await image.metadata();
  // Certains fournisseurs gratuits ajoutent un filigrane en bas : on retire la bande
  if (provider === 'pollinations' && meta.height) {
    image = image.extract({ left: 0, top: 0, width: meta.width ?? target.width, height: Math.floor(meta.height * 0.93) });
  }

  const file = path.join(OUT, `${spec.slug}.webp`);
  const thumbFile = path.join(OUT, `${spec.slug}@sm.webp`);
  await mkdir(path.dirname(file), { recursive: true });

  const full = await image.clone().resize(target.width, target.height, { fit: 'cover', position: 'centre' }).webp({ quality: 88 }).toBuffer();
  await writeFile(file, full);

  const thumb = await sharp(full).resize(Math.round(target.width / 2.4)).webp({ quality: 82 }).toBuffer();
  await writeFile(thumbFile, thumb);

  const tiny = await sharp(full).resize(20).blur(1.2).webp({ quality: 40 }).toBuffer();

  return {
    slug: spec.slug,
    kind: spec.kind,
    path: `/generated/${spec.slug}.webp`,
    thumb: `/generated/${spec.slug}@sm.webp`,
    lqip: `data:image/webp;base64,${tiny.toString('base64')}`,
    width: target.width,
    height: target.height,
    provider,
    seed,
    prompt: spec.prompt,
    hash: createHash('sha256').update(full).digest('hex').slice(0, 16),
    createdAt: new Date().toISOString(),
  } satisfies Entry;
}

async function main() {
  const provider = await pickProvider(PROVIDER);
  const manifest = await readManifest();
  const assets = allAssets().filter((asset) => (ONLY ? asset.slug.startsWith(ONLY) : true));
  const todo = assets.filter((asset) => FORCE || !manifest[asset.slug]);

  console.log(`Fournisseur : ${provider.name} · ${todo.length}/${assets.length} asset(s) à générer\n`);
  let done = 0;
  const started = Date.now();

  for (const spec of todo) {
    const seeds = Array.from({ length: DRAFTS }, (_, index) => Math.floor(Math.random() * 1e9) + index);
    let best: Entry | null = null;
    for (const [index, seed] of seeds.entries()) {
      const t = Date.now();
      try {
        const raw = await provider.generate({ prompt: spec.prompt, negative: NEGATIVE, width: spec.width, height: spec.height, seed });
        const entry = await write(index === 0 ? spec : { ...spec, slug: `${spec.slug}-draft${index}` }, raw, provider.name, seed);
        if (index === 0) best = entry;
        console.log(`  ✅ ${entry.slug} · ${Math.round((Date.now() - t) / 1000)} s`);
      } catch (error) {
        console.log(`  ❌ ${spec.slug} : ${(error as Error).message.slice(0, 120)}`);
      }
    }
    if (best) {
      manifest[spec.slug] = best;
      await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    done += 1;
    const elapsed = (Date.now() - started) / 1000;
    const eta = Math.round((elapsed / done) * (todo.length - done));
    console.log(`  (${done}/${todo.length} · ~${Math.floor(eta / 60)} min ${eta % 60} s restantes)\n`);
  }

  console.log(`Terminé : ${Object.keys(manifest).length} assets dans le manifeste.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
