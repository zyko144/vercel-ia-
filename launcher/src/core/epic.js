// Epic Games : jeux installés (un .item JSON par jeu dans …\Data\Manifests) et jeux possédés
// (catalogue local du launcher, …\Data\Catalog\catcache.bin : du JSON en base64 avec les images officielles).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const pickImage = (images, ...types) => {
  for (const t of types) {
    const img = (images ?? []).find((i) => i.type === t && i.url);
    if (img) return img.url;
  }
  return null;
};

/** Images officielles Epic d'un élément du catalogue. */
export function epicArt(images) {
  return {
    cover: pickImage(images, 'DieselGameBoxTall', 'OfferImageTall', 'Thumbnail'),
    hero: pickImage(images, 'DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide', 'featuredMedia'),
    header: pickImage(images, 'DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide'),
    logo: pickImage(images, 'DieselGameBoxLogo', 'ProductLogo'),
  };
}

/** Le catalogue Epic : tous les jeux possédés, avec leurs images et leur fiche. */
export async function readEpicCatalog(catalogDir) {
  const raw = await readFile(path.join(catalogDir, 'catcache.bin'), 'utf8').catch(() => null);
  if (!raw) return [];
  let list;
  try { list = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')); } catch { return []; }
  return (Array.isArray(list) ? list : []).filter((c) => {
    const cats = (c.categories ?? []).map((x) => x.path);
    return c.title && !c.mainGameItem && cats.includes('games') && !cats.some((x) => /addons|digitalextras|engines|plugins/.test(x));
  }).map((c) => ({
    appName: c.releaseInfo?.[0]?.appId ?? null, namespace: c.namespace, catalogId: c.id, title: c.title,
    art: epicArt(c.keyImages),
    details: { description: String(c.description ?? '').slice(0, 600), developers: c.developer ? [c.developer] : [], genres: [], released: null, screenshots: [] },
  })).filter((c) => c.appName);
}

export async function scanEpic(manifestDir, catalogDir = null) {
  const catalog = catalogDir ? await readEpicCatalog(catalogDir) : [];
  const byApp = new Map(catalog.map((c) => [c.appName, c]));
  const items = [];
  for (const file of await readdir(manifestDir).catch(() => [])) {
    if (!file.endsWith('.item')) continue;
    let m;
    try { m = JSON.parse(await readFile(path.join(manifestDir, file), 'utf8')); } catch { continue; }
    if (!m.DisplayName || !m.AppName || m.bIsIncompleteInstall) continue;
    // Les modules (DLC, plugins Unreal) ne sont pas des jeux à part
    if ((m.AppCategories ?? []).some((c) => /plugins|engines|addons/i.test(c)) && !(m.AppCategories ?? []).includes('games')) continue;
    const key = `${m.CatalogNamespace}%3A${m.CatalogItemId}%3A${m.AppName}`;
    const cat = byApp.get(m.AppName);
    items.push({
      id: `epic:${m.AppName}`, source: 'epic', kind: 'game', name: m.DisplayName, installed: true,
      installDir: m.InstallLocation ?? '', manifest: path.join(manifestDir, file), exe: m.InstallLocation && m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : null,
      size: Number(m.InstallSize ?? 0), minutes: 0, lastPlayed: 0, art: cat?.art ?? {}, details: cat?.details ?? null, epicKey: key,
    });
  }
  // Jeux possédés mais pas installés
  const installed = new Set(items.map((i) => i.id));
  for (const c of catalog) {
    if (installed.has(`epic:${c.appName}`)) continue;
    items.push({
      id: `epic:${c.appName}`, source: 'epic', kind: 'game', name: c.title, installed: false, size: 0, minutes: 0, lastPlayed: 0,
      art: c.art, details: c.details, epicKey: `${c.namespace}%3A${c.catalogId}%3A${c.appName}`,
    });
  }
  return items;
}

export const epicActions = (key) => ({
  launch: `com.epicgames.launcher://apps/${key}?action=launch&silent=true`,
  install: `com.epicgames.launcher://apps/${key}?action=install`,
  verify: `com.epicgames.launcher://apps/${key}?action=verify`,
  // Epic ne propose pas de lien de désinstallation : on ouvre la bibliothèque du launcher
  uninstall: 'com.epicgames.launcher://store/library',
});
