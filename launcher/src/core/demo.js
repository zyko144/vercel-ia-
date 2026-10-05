// Mode démonstration (LAUNCHER_DEMO=1) : bibliothèque, amis et PC d'exemple pour les captures qui montrent
// les nouveautés (annonces Discord, site). Jamais activé chez un utilisateur.
const cdn = (id) => ({ cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`, logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png`, header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` });
const H = 3_600_000;
const G = [
  ['359550', 'Tom Clancy’s Rainbow Six Siege', 6600, 2], ['252950', 'Rocket League', 17100, 20], ['271590', 'Grand Theft Auto V', 9200, 50],
  ['1172470', 'Apex Legends', 4300, 26], ['730', 'Counter-Strike 2', 12600, 5], ['1245620', 'ELDEN RING', 3100, 900], ['4000', 'Garry’s Mod', 1500, 5200], ['1091500', 'Cyberpunk 2077', 2200, 1100],
];
export function demoItems(now = Date.now()) {
  return G.map(([id, name, minutes, ago]) => ({
    id: `steam:${id}`, source: 'steam', kind: 'game', category: 'jeu', name, installed: true, installDir: `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${name}`,
    steamId: id, size: 40e9, steamTimes: { principal: { minutes, lastPlayed: now - ago * H } }, minutes, lastPlayed: now - ago * H, art: cdn(id), known: true,
  }));
}
export function demoFriends(now = Date.now()) {
  return {
    code: 'Alex#3F9A2C', demandes: [], moi: { week: 640, top: 'Rocket League' },
    amis: [
      { id: 'd1', pseudo: 'Max', code: 'Max#A1B2C3', online: true, playing: 'FiveM', join: { fivem: 'abc123' }, since: now - 42 * 60_000, week: 780, status: 'Soirée RP 🚓', bench: 1420 },
      { id: 'd2', pseudo: 'Zoé', code: 'Zoe#D4E5F6', online: true, playing: 'Rocket League', join: { steam: '252950' }, since: now - 12 * 60_000, week: 540, status: null, bench: 1180 },
      { id: 'd3', pseudo: 'Lucas', code: 'Lucas#778899', online: true, playing: null, week: 300, status: 'Dispo pour jouer', bench: 960 },
      { id: 'd4', pseudo: 'Inès', code: 'Ines#112233', online: false, playing: null, week: 90, status: null },
    ],
    groupes: [{ id: 'g1', name: 'Squad RL', owner: true, members: [{ id: 'me', pseudo: 'Alex', online: true, playing: null }, { id: 'd2', pseudo: 'Zoé', online: true, playing: 'Rocket League' }, { id: 'd3', pseudo: 'Lucas', online: true, playing: null }] }],
  };
}
export function demoBench(now = Date.now()) {
  const r = { v: 2, at: now - 3600_000, cpu: { threads: 16, single: { sha: 1960, zip: 71, nbody: 402, sort: 12.1, path: 1260 }, multi: { sha: 14800, zip: 520, nbody: 2950, sort: 88, path: 9100 }, sustain: { slices: [9400, 9350, 9310, 9280, 9300, 9270], stability: 98 } },
    ram: { gbps: 38.4, latency: 72 }, disk: { write: 3900, read: 5200, iopsR: 118000, iopsW: 9800, readSrc: 'jeu' }, gpu: { scenes: { geometry: 520, shader: 205, post: 390 }, renderer: 'NVIDIA GeForce RTX 4070' },
    scores: { cpu1: 1375, cpuN: 2164, ram: 1886, disk: 2389, gpu: 1789, total: 1871 }, tier: 'Monstre de jeu' };
  return [r, { ...r, at: now - 8 * 86_400_000, scores: { ...r.scores, total: 1720 } }];
}
/** Jours et sessions d'exemple (série de 9 jours, soirées surtout) pour les statistiques et les badges. */
export function demoActivity(now = Date.now()) {
  const days = {};
  const sessions = [];
  const ids = G.map((g) => `steam:${g[0]}`);
  for (let i = 0; i < 30; i++) {
    const t = now - i * 86_400_000;
    const h = Array(24).fill(0);
    if (i < 9 || i % 3 === 0) {
      [18, 19, 20, 21, 22, 23].forEach((k, j) => { h[k] = 20 + ((i * 7 + j * 13) % 40); });
      if (i % 4 === 0) h[14] = 35;
      const start = new Date(t).setHours(20, 5, 0, 0);
      sessions.push({ id: ids[i % ids.length], start, end: start + (90 + (i % 5) * 40) * 60_000 });
    }
    const jeux = h.reduce((a, b) => a + b, 0);
    days[new Date(t).toISOString().slice(0, 10)] = { jeux, applis: 30, h };
  }
  sessions.push({ id: ids[1], start: new Date(now - 5 * 86_400_000).setHours(2, 40, 0, 0), end: new Date(now - 5 * 86_400_000).setHours(7, 10, 0, 0) });
  return { days, sessions: sessions.sort((a, b) => a.start - b.start) };
}
/** Courbe d'exemple des dernières 24 h (une mesure toutes les 10 min). */
export function demoTemps(now = Date.now()) {
  return Array.from({ length: 144 }, (_, i) => {
    const h = new Date(now - (143 - i) * 600_000).getHours();
    const load = h >= 18 ? 55 + ((i * 17) % 30) : 8 + ((i * 7) % 12);
    return { t: now - (143 - i) * 600_000, cpu: load, gpuT: 38 + Math.round(load * 0.45), ram: 34 + Math.round(load / 3) };
  });
}
/** Résultat d'exemple de l'analyse pro (captures de démonstration uniquement). */
export function demoScan(now = Date.now()) {
  const G = 1e9;
  return {
    at: now - 20 * 60_000, elapsed: 17 * 60_000 + 42_000, files: 1_284_553, dirs: 212_048, bytes: 1_486 * G, denied: 3_214, emptyDirs: 8_120, score: 71, threats: 1,
    cats: [['jeux', '🎮', 'Fichiers de jeux', 612], ['videos', '🎬', 'Vidéos', 248], ['systeme', '⚙', 'Windows et programmes', 187], ['archives', '📦', 'Archives et images disque', 96], ['installeurs', '💿', 'Installateurs et programmes', 64], ['images', '🖼', 'Images', 38], ['musique', '🎵', 'Musique', 12], ['documents', '📄', 'Documents', 6], ['autres', '🗂', 'Autres', 223]].map(([id, icon, label, gb]) => ({ id, icon, label, files: Math.round(gb * 900), bytes: gb * G })),
    junk: [{ id: 'installer', icon: '💿', label: 'Installateurs déjà utilisés (Téléchargements, plus d’un mois)', files: 38, bytes: 11.4 * G }, { id: 'temp', icon: '🗑', label: 'Fichiers temporaires de plus de 7 jours', files: 18_420, bytes: 6.2 * G }, { id: 'dump', icon: '💥', label: 'Rapports de plantage (dumps)', files: 64, bytes: 3.1 * G }, { id: 'log', icon: '📜', label: 'Gros journaux (logs) anciens', files: 22, bytes: 1.4 * G }],
    junkBytes: 22.1 * G,
    duplicates: [{ size: 4.2 * G, paths: ['D:\\Vidéos\\Montage finale.mp4', 'C:\\Users\\Alex\\Desktop\\Montage finale (1).mp4'] }, { size: 1.9 * G, paths: ['C:\\Users\\Alex\\Downloads\\GTA5-mods.zip', 'D:\\Backup\\GTA5-mods.zip', 'E:\\Old\\GTA5-mods.zip'] }],
    dupWasted: 8 * G, hashed: { files: 4_812, bytes: 96 * G },
    suspects: [{ path: 'C:\\Users\\Alex\\AppData\\Roaming\\winupdt.exe', size: 2.1e6, reason: 'Programme caché dans un dossier temporaire ou à la racine d’AppData', defender: 'menace' }, { path: 'C:\\Users\\Alex\\Downloads\\skins_gratuits.pdf.exe', size: 840e3, reason: 'Double extension (ex. facture.pdf.exe) : technique classique des virus', defender: 'propre' }],
    largest: [{ path: 'D:\\SteamLibrary\\steamapps\\common\\Call of Duty\\data\\data.0101', size: 38 * G }, { path: 'C:\\hiberfil.sys', size: 25.6 * G }, { path: 'D:\\Vidéos\\Montage finale.mp4', size: 4.2 * G }],
    old: { files: 412, bytes: 57 * G }, events: demoEvents(),
  };
}
export function demoEvents() {
  return { power: 2, bsod: 1, disk: 0, whea: 0, gpu: 1, errors: 48, crashes: [{ name: 'FortniteClient-Win64-Shipping.exe', count: 4 }], score: 55,
    findings: [{ prio: 0, title: '1 écran bleu cette semaine', text: 'Souvent un pilote (carte graphique, réseau) ou la mémoire : mets à jour les pilotes et lance « Réparer Windows ».' }, { prio: 1, title: '2 arrêts brutaux du PC', text: 'Le PC s’est éteint sans passer par « Arrêter » : coupure de courant, surchauffe ou alimentation trop faible.' }, { prio: 1, title: '1 plantage du pilote graphique', text: 'Réinstalle le dernier pilote et vérifie la température de la carte.' }] };
}
export function demoWu(now = Date.now()) {
  const id = (n) => `6a1b2c3d-4e5f-4a6b-8c7d-00000000000${n}`;
  return {
    reboot: false,
    updates: [
      { id: id(1), title: '2026-09 Mise à jour cumulative pour Windows 11 Version 24H2 (KB5065431)', kb: 'KB5065431', size: 812e6, downloaded: false, reboot: true, optional: false, kind: 'securite' },
      { id: id(2), title: 'Mise à jour de la veille de sécurité pour Microsoft Defender Antivirus (KB2267602)', kb: 'KB2267602', size: 92e6, reboot: false, optional: false, kind: 'defender' },
      { id: id(3), title: 'Mise à jour cumulative de .NET Framework 3.5 et 4.8.1 (KB5064401)', kb: 'KB5064401', size: 74e6, reboot: true, optional: false, kind: 'dotnet' },
      { id: id(4), title: 'NVIDIA - Display - 32.0.15.7688', size: 712e6, reboot: false, optional: true, kind: 'pilote' },
    ],
    history: [{ title: 'Mise à jour cumulative pour Windows 11 (KB5063878)', date: new Date(now - 18 * 864e5).toISOString(), result: 'ok' }, { title: 'Microsoft Defender Antivirus (KB2267602)', date: new Date(now - 2 * 864e5).toISOString(), result: 'ok' }],
  };
}
/** Parties suivies d'exemple (FPS réels, goulot) pour la fenêtre « Outils du jeu ». */
export function demoPerf(now = Date.now()) {
  return Array.from({ length: 9 }, (_, i) => ({ at: now - (8 - i) * 3 * 86_400_000, minutes: 70 + ((i * 37) % 90), avg: 228 + ((i * 13) % 30) - (i < 3 ? 25 : 0), low1: 150 + ((i * 7) % 25), stutters: i % 3, cpuBound: 68, gpuAvg: 61 + (i % 5), coreMax: 94, bound: 'cpu' }));
}

/** Profils par jeu de la démo (captures de l'Optimisation). */
export const demoGameActs = () => [{ id: 'fivem-cache', game: 'FiveM', kind: 'clean', risk: 'safe', on: true, label: 'Cache des serveurs FiveM', help: 'Retéléchargé tout seul en rejoignant un serveur. Mods, plugins (ReShade détecté : gardé tel quel) et GTA V ne sont jamais touchés.', paths: ['C:\\Users\\Alex\\AppData\\Local\\FiveM\\FiveM.app\\data\\cache'], bytes: 3.1e9, files: 1843 }, { id: 'fivem-nui-storage', game: 'FiveM', kind: 'clean', risk: 'moderate', on: false, label: 'Données des menus des serveurs (NUI)', help: 'Certains serveurs y gardent tes réglages de menus : à vider seulement si un serveur bug.', paths: ['C:\\Users\\Alex\\AppData\\Local\\FiveM\\FiveM.app\\data\\nui-storage'], bytes: 0.2e9, files: 212 }, { id: 'fn-perf', game: 'Fortnite', kind: 'ini', risk: 'moderate', on: false, label: 'Mode de rendu « Performance »', help: 'Le mode officiel du jeu pour les PC modestes : beaucoup plus de FPS, graphismes simplifiés.', paths: ['%LOCALAPPDATA%\\FortniteGame\\Saved\\Config\\WindowsClient\\GameUserSettings.ini'] }, { id: 'fn-vsync', game: 'Fortnite', kind: 'ini', risk: 'safe', on: true, applied: true, label: 'Synchronisation verticale coupée', help: 'Moins de latence d’affichage.', paths: ['%LOCALAPPDATA%\\FortniteGame\\Saved\\Config\\WindowsClient\\GameUserSettings.ini'] }, { id: 'rl-blur', game: 'Rocket League', kind: 'ini', risk: 'safe', on: true, label: 'Flou de mouvement coupé', help: 'Image plus nette.', paths: ['Documents\\My Games\\Rocket League\\TAGame\\Config\\TASystemSettings.ini'] }];

// Mon PC › Stockage (démo) : vrais jeux de la bibliothèque de démo + fichiers et dossiers plausibles
export function demoStorage(items = [], now = Date.now()) {
  const D = 86_400_000, G = 1e9;
  const games = items.filter((i) => i.kind === 'game' && i.installed).slice(0, 8).map((i, n) => ({ path: `D:\\SteamLibrary\\steamapps\\common\\${i.name}`, name: i.name, kind: 'game', where: 'Jeu', id: i.id, size: [86, 64, 41, 23, 18, 12, 9, 6][n] * G, files: 4200, lastUsed: now - [5, 40, 250, 2, 400, 90, 20, 300][n] * D, icon: i.art?.icon ?? i.art?.cover ?? null }));
  const f = (name, kind, where, gb, days, root = 'C:\\Users\\Alex\\') => ({ path: `${root}${where === 'Téléchargements' ? 'Downloads\\' : where === 'Vidéos' ? 'Videos\\' : where === 'Bureau' ? 'Desktop\\' : ''}${name}`, name, kind, where, id: null, size: gb * G, files: kind === 'folder' ? 300 : 1, lastUsed: now - days * D, icon: null });
  const list = [...games,
    f('Clips 2025', 'folder', 'Vidéos', 38, 280), f('Montage anniversaire.mp4', 'video', 'Vidéos', 7.4, 410), f('Windows11_24H2.iso', 'archive', 'Téléchargements', 5.8, 330),
    f('Sauvegarde iPhone', 'folder', 'Dossier perso', 24, 200), f('NVIDIA_App_v11.exe', 'installer', 'Téléchargements', 0.6, 120), f('pack_textures_fivem.zip', 'archive', 'Téléchargements', 3.2, 190),
    f('Photos vacances', 'folder', 'Images', 9.1, 60), f('OBS records', 'folder', 'Disque D:', 31, 15, 'D:\\'), f('Ancien PC (copie)', 'folder', 'Disque D:', 120, 600, 'D:\\'),
    f('Projet Blender', 'folder', 'Documents', 4.3, 8), f('Spotify cache', 'folder', 'Dossier perso', 2.1, 1),
    { path: 'C:\\Program Files\\Adobe', name: 'Adobe', kind: 'protected', where: 'Programmes', id: null, size: 14 * G, files: 9000, lastUsed: now - 30 * D, icon: null }];
  return { at: now, volumes: [{ letter: 'C', size: 1000 * G, free: 182 * G }, { letter: 'D', size: 2000 * G, free: 640 * G }], items: list.sort((a, b) => b.size - a.size) };
}
