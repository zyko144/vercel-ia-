import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type GenerateInput = {
  prompt: string;
  negative: string;
  width: number;
  height: number;
  seed: number;
};

export interface ImageProvider {
  name: string;
  available(): Promise<boolean>;
  generate(input: GenerateInput): Promise<Buffer>;
}

const ROOT = path.resolve(process.cwd(), '..');
const LOCAL_DIR = process.env.SD_DIR ?? path.join(ROOT, '.ai-local');

/**
 * Génération LOCALE (stable-diffusion.cpp, backend Vulkan).
 * Gratuite, illimitée, hors ligne — c'est le fournisseur par défaut.
 */
export const localProvider: ImageProvider = {
  name: 'local',
  async available() {
    try {
      await stat(path.join(LOCAL_DIR, 'sd', 'sd-cli.exe'));
      const model = await stat(path.join(LOCAL_DIR, 'models', modelFile()));
      return model.size > 1_000_000; // le modèle doit vraiment être là (plusieurs Go)
    } catch {
      return false;
    }
  },
  async generate({ prompt, negative, width, height, seed }) {
    const out = path.join(LOCAL_DIR, 'tmp', `${seed}-${Date.now()}.png`);
    await mkdir(path.dirname(out), { recursive: true });
    const args = [
      '-M', 'img_gen',
      '-m', path.join(LOCAL_DIR, 'models', modelFile()),
      '-p', prompt,
      '-n', negative,
      '-W', String(width),
      '-H', String(height),
      '--steps', process.env.SD_STEPS ?? '8',
      '--cfg-scale', process.env.SD_CFG ?? '2',
      '--sampling-method', process.env.SD_SAMPLER ?? 'dpm++2mv2',
      '--seed', String(seed),
      '--vae-tiling',
      '--backend', process.env.SD_BACKEND ?? 'vulkan0',
      '-o', out,
    ];
    const vae = path.join(LOCAL_DIR, 'models', 'sdxl-vae-fp16-fix.safetensors');
    if (await stat(vae).then(() => true).catch(() => false)) args.push('--vae', vae);

    await run(path.join(LOCAL_DIR, 'sd', 'sd-cli.exe'), args, { maxBuffer: 1024 * 1024 * 32, timeout: 15 * 60_000 });
    const buffer = await readFile(out);
    await rm(out, { force: true });
    return buffer;
  },
};

const modelFile = () => process.env.SD_MODEL ?? 'dreamshaper-xl-turbo.safetensors';

/** Repli sans clé ni installation (qualité moindre, filigrane rogné ensuite). */
export const pollinationsProvider: ImageProvider = {
  name: 'pollinations',
  async available() {
    return true;
  },
  async generate({ prompt, width, height, seed }) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`pollinations ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  },
};

/** Gemini / Imagen : nécessite une clé avec facturation activée. */
export const geminiProvider: ImageProvider = {
  name: 'gemini',
  async available() {
    return Boolean(process.env.GEMINI_API_KEY);
  },
  async generate({ prompt, width, height }) {
    const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: width > height ? '16:9' : width < height ? '3:4' : '1:1' } },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await response.json();
    const inline = data?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data: string } }) => part.inlineData)?.inlineData;
    if (!inline?.data) throw new Error(`gemini : pas d'image (${JSON.stringify(data).slice(0, 200)})`);
    return Buffer.from(inline.data, 'base64');
  },
};

const PROVIDERS: Record<string, ImageProvider> = {
  local: localProvider,
  pollinations: pollinationsProvider,
  gemini: geminiProvider,
};

/** Choisit le fournisseur demandé, ou le premier disponible (local d'abord). */
export async function pickProvider(requested?: string): Promise<ImageProvider> {
  if (requested && PROVIDERS[requested]) {
    const provider = PROVIDERS[requested];
    if (await provider.available()) return provider;
    throw new Error(`Le fournisseur « ${requested} » n'est pas disponible.`);
  }
  for (const provider of [localProvider, geminiProvider, pollinationsProvider]) {
    if (await provider.available()) return provider;
  }
  throw new Error('Aucun fournisseur d’images disponible.');
}
