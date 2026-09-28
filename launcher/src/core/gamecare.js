// Suivi des jeux sans rien modifier sur le PC : plantages expliqués, temps de démarrage, disques pleins,
// santé des disques, qualité de la connexion. Les fonctions « parse » et « verdict » sont pures (testées),
// les lectures Windows passent par PowerShell en lecture seule.
import { ps } from './pshost.js';

// ---------- Plantages : journal « Application » de Windows (événements 1000 / 1002), sans droits administrateur ----------
export const crashScript = (sinceMs) => String.raw`
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$since=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.round(Number(sinceMs) || 0)}).LocalDateTime
@(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1002; StartTime=$since} -MaxEvents 40 | ForEach-Object {
  $p=$_.Properties
  [pscustomobject]@{ id=$_.Id; at=[DateTimeOffset]::new($_.TimeCreated).ToUnixTimeMilliseconds(); app=[string]$p[0].Value; module=$(if($_.Id -eq 1000){[string]$p[3].Value}else{''}); code=$(if($_.Id -eq 1000){[string]$p[6].Value}else{''}); path=$(if($_.Id -eq 1000){[string]$p[10].Value}else{[string]$p[5].Value}) }
}) | ConvertTo-Json -Compress
`;

// Module qui a planté -> cause probable et solution, en mots simples
const CAUSES = [
  [/^(nvwgf2umx|nvwgf2um|nvd3dumx|nvoglv64|nvlddmkm|nvgpucomp64)/i, 'Pilote graphique NVIDIA', 'Mets à jour (ou réinstalle proprement) le pilote NVIDIA, et baisse les réglages graphiques si ça recommence.'],
  [/^(atiumd|atidxx|amdxc|aticfx|atio6axx|amdvlk)/i, 'Pilote graphique AMD', 'Mets à jour le pilote AMD (Adrenalin) ; si ça continue, réinstalle-le avec l’option « réinitialisation d’usine ».'],
  [/^(igd|igc|ig\d+icd)/i, 'Pilote graphique Intel', 'Mets à jour le pilote graphique Intel ; si ton PC a une carte graphique NVIDIA / AMD, vérifie que le jeu l’utilise bien.'],
  [/^(d3d11|d3d12|dxgi|d3d9|vulkan-1|opengl32)$/i, 'Rendu graphique (DirectX / Vulkan)', 'Mets à jour le pilote graphique et Windows ; baisse les graphismes ou change DirectX 12 ↔ 11 dans le jeu.'],
  [/^citizen|^gta-core|^gta5|^fivem|^adhesive/i, 'FiveM (mod, cache ou serveur)', 'Vide le cache de FiveM (dossier FiveM.app\\data\\cache), retire les mods ajoutés à la main, puis relance.'],
  [/^(ntdll|kernelbase|ucrtbase|msvcp\d+|vcruntime\d+|msvcr\d+)$/i, 'Erreur interne du jeu (mémoire, fichiers ou mod)', 'Vérifie les fichiers du jeu (clic droit › Vérifier les fichiers), retire les mods, et réinstalle les « Visual C++ Redistributable ».'],
  [/^(xinput|dinput8|steam_api|steamclient|eossdk|galaxy)/i, 'Composant de la plateforme (Steam / Epic / manette)', 'Relance Steam ou Epic, débranche les manettes inutiles, puis vérifie les fichiers du jeu.'],
  [/^(easyanticheat|eac|beclient|beservice|vgk|vgc)/i, 'Anti-triche', 'Répare l’anti-triche du jeu (dossier EasyAntiCheat / BattlEye → setup → Réparer) et relance le PC.'],
  [/^(discord_hook|gameoverlayrenderer|rtsshooks|obs-|graphics-hook|nvspcap|overlay)/i, 'Un overlay (Discord, Steam, RivaTuner, OBS…)', 'Coupe les overlays (Discord, Steam, MSI Afterburner) pour ce jeu et relance.'],
];
/** Cause probable d'un plantage à partir du module fautif (et du code d'erreur). */
export function crashCause({ module = '', code = '', hang = false } = {}) {
  if (hang) return { cause: 'Le jeu ne répondait plus (figé)', fix: 'Souvent le disque ou la mémoire saturés : ferme les applis lourdes, vérifie la place sur le disque et les fichiers du jeu.' };
  const m = String(module).toLowerCase().replace(/\.(dll|exe)$/, '');
  for (const [re, cause, fix] of CAUSES) if (re.test(m)) return { cause, fix };
  if (/^0xc0000005$/i.test(code)) return { cause: 'Accès mémoire refusé (souvent un mod ou un fichier abîmé)', fix: 'Vérifie les fichiers du jeu et retire les mods ; si plusieurs jeux plantent, teste la mémoire (profil XMP / overclocking).' };
  if (/^0xc0000409$/i.test(code)) return { cause: 'Le jeu s’est arrêté lui-même (erreur interne)', fix: 'Mets le jeu et le pilote graphique à jour, puis vérifie les fichiers du jeu.' };
  return { cause: m ? `Plantage dans ${module}` : 'Plantage du jeu', fix: 'Vérifie les fichiers du jeu, mets à jour le pilote graphique, et relance le PC si ça recommence.' };
}
/** Plantages d'un jeu (d'après son dossier / son exécutable) parmi les événements lus. */
export function crashesFor(json, { dir = '', exe = '' } = {}) {
  let list;
  try { list = typeof json === 'string' ? JSON.parse(json || '[]') : json; } catch { return []; }
  list = Array.isArray(list) ? list : list ? [list] : [];
  const d = String(dir).toLowerCase().replace(/[\\/]+$/, '');
  const e = String(exe).toLowerCase().split(/[\\/]/).pop();
  return list.filter((x) => {
    const p = String(x?.path ?? '').toLowerCase();
    const a = String(x?.app ?? '').toLowerCase();
    return (d && d.split('\\').filter(Boolean).length >= 2 && p.startsWith(`${d}\\`)) || (e && a === e);
  }).map((x) => ({ at: Number(x.at) || Date.now(), app: String(x.app), module: String(x.module ?? ''), code: String(x.code ?? ''), ...crashCause({ module: x.module, code: x.code, hang: Number(x.id) === 1002 }) }));
}
export async function readCrashes(sinceMs) {
  if (process.platform !== 'win32') return [];
  const out = await ps(crashScript(sinceMs), 30_000).catch(() => '');
  return String(out).trim() || '[]';
}

// ---------- Temps de démarrage : du clic sur « Jouer » à l'apparition de la fenêtre du jeu ----------
export const windowScript = (dir) => String.raw`
$ErrorActionPreference='SilentlyContinue'
$d='${String(dir).replace(/'/g, "''")}'.ToLower()
@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path -and $_.Path.ToLower().StartsWith($d) }).Count
`;
/** Démarrage normal ou plus lent que d'habitude (médiane des 5 derniers). */
export function loadVerdict(history, ms) {
  const prev = (history ?? []).map((x) => x.ms).filter((x) => x > 0).slice(-5);
  if (prev.length < 3) return { slow: false, median: null };
  const s = [...prev].sort((a, b) => a - b);
  const median = s[Math.floor(s.length / 2)];
  return { slow: ms > median * 1.6 && ms - median > 15_000, median };
}

// ---------- Disques presque pleins : quels jeux libérer ----------
/** Disques en alerte (moins de 10 % ou de 15 Go libres), avec les gros jeux pas lancés depuis 3 mois. */
export function diskAlerts(drives, items, now = Date.now()) {
  const out = [];
  for (const d of drives ?? []) {
    if (!d?.total || d.free == null) continue;
    if (d.free / d.total >= 0.1 && d.free >= 15e9) continue;
    const letter = String(d.drive).slice(0, 2).toUpperCase();
    const idle = (items ?? []).filter((i) => i.kind === 'game' && i.installed && i.size > 2e9 && String(i.installDir ?? '').slice(0, 2).toUpperCase() === letter && now - (i.lastPlayed || 0) > 90 * 86_400_000)
      .sort((a, b) => b.size - a.size).slice(0, 5).map((i) => ({ id: i.id, name: i.name, size: i.size, lastPlayed: i.lastPlayed || null }));
    out.push({ drive: letter, free: d.free, total: d.total, critical: d.free < 5e9 || d.free / d.total < 0.04, idle });
  }
  return out;
}

// ---------- Santé des disques (lecture seule) ----------
export const DISK_HEALTH_PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
@(Get-PhysicalDisk | ForEach-Object {
  $r=$_ | Get-StorageReliabilityCounter
  [pscustomobject]@{ name=[string]$_.FriendlyName; media=[string]$_.MediaType; bus=[string]$_.BusType; size=[double]$_.Size; health=[string]$_.HealthStatus; wear=$r.Wear; temp=$r.Temperature; hours=$r.PowerOnHours; readErr=$r.ReadErrorsUncorrected; writeErr=$r.WriteErrorsUncorrected }
}) | ConvertTo-Json -Compress
`;
export function parseDiskHealth(json) {
  let list;
  try { list = typeof json === 'string' ? JSON.parse(json || '[]') : json; } catch { return []; }
  list = Array.isArray(list) ? list : list ? [list] : [];
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return list.filter((d) => d?.name).map((d) => {
    const wear = num(d.wear); const temp = num(d.temp); const errs = (num(d.readErr) ?? 0) + (num(d.writeErr) ?? 0);
    const health = String(d.health ?? '');
    const ssd = /ssd|nvme/i.test(`${d.media} ${d.bus}`);
    let state = 'ok'; const notes = [];
    if (/unhealthy|défaillant/i.test(health)) { state = 'bad'; notes.push('Windows signale ce disque comme défaillant : sauvegarde tes fichiers importants dès maintenant.'); }
    else if (/warning|avertissement/i.test(health)) { state = 'warn'; notes.push('Windows signale un problème sur ce disque : sauvegarde tes fichiers importants.'); }
    if (wear != null && wear >= 90) { state = 'bad'; notes.push(`Usure ${wear} % : ce SSD arrive en fin de vie, prévois de le remplacer.`); }
    else if (wear != null && wear >= 70) { if (state === 'ok') state = 'warn'; notes.push(`Usure ${wear} % : le SSD vieillit, garde une sauvegarde à jour.`); }
    if (errs > 0) { if (state === 'ok') state = 'warn'; notes.push(`${errs} erreur(s) de lecture / écriture non corrigée(s).`); }
    if (temp != null && temp >= 70) { if (state === 'ok') state = 'warn'; notes.push(`${temp} °C : le disque chauffe, vérifie qu’il est bien ventilé.`); }
    return { name: String(d.name), ssd, bus: String(d.bus ?? ''), size: num(d.size), health, wear, temp, hours: num(d.hours), errors: errs, state, notes };
  });
}
export async function diskHealth() {
  if (process.platform !== 'win32') return [];
  return parseDiskHealth(await ps(DISK_HEALTH_PS, 40_000).catch(() => '[]'));
}

// ---------- Connexion : ping, gigue, pertes, débit, Wi-Fi ou câble ----------
/** Résultat de « ping -n N » (Windows, français ou anglais) : temps de chaque réponse et pertes. */
export function parsePing(text) {
  const times = [...String(text).matchAll(/(?:temps|time)\s*[=<]\s*(\d+)\s*ms/gi)].map((m) => Number(m[1]));
  const sent = Number(String(text).match(/(?:envoyés|sent)\s*=\s*(\d+)/i)?.[1] ?? 0);
  const lost = Number(String(text).match(/(?:perdus|lost)\s*=\s*(\d+)/i)?.[1] ?? 0);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const jitter = times.length > 1 ? Math.round(times.slice(1).reduce((a, t, i) => a + Math.abs(t - times[i]), 0) / (times.length - 1)) : null;
  return { avg, min: times.length ? Math.min(...times) : null, max: times.length ? Math.max(...times) : null, jitter, loss: sent ? Math.round((100 * lost) / sent) : null, sent };
}
/** Conseil clair à partir des mesures. */
export function netAdvice({ ping = null, jitter = null, loss = null, down = null, up = null, wifi = null } = {}) {
  const tips = [];
  let grade = 'Excellente';
  const worse = (g) => { const order = ['Excellente', 'Bonne', 'Moyenne', 'Mauvaise']; if (order.indexOf(g) > order.indexOf(grade)) grade = g; };
  if (loss != null && loss >= 5) { worse('Mauvaise'); tips.push(`${loss} % de paquets perdus : c’est ça qui fait « téléporter » les joueurs. ${wifi ? 'Passe en câble Ethernet si tu peux.' : 'Redémarre la box et vérifie le câble.'}`); }
  else if (loss != null && loss > 0) { worse('Moyenne'); tips.push(`${loss} % de pertes : de petits à-coups possibles en ligne.`); }
  if (ping != null && ping >= 80) { worse('Mauvaise'); tips.push(`Ping de ${ping} ms : élevé pour jouer en ligne. Ferme les téléchargements (Steam, Windows Update) pendant tes parties.`); }
  else if (ping != null && ping >= 40) { worse('Moyenne'); tips.push(`Ping de ${ping} ms : correct, mais un câble ou une connexion fibre le baisserait.`); }
  if (jitter != null && jitter >= 20) { worse('Moyenne'); tips.push(`Ping instable (±${jitter} ms) : ${wifi ? 'le Wi-Fi en est souvent la cause, rapproche-toi de la box ou passe en câble.' : 'quelqu’un utilise beaucoup la connexion en même temps ?'}`); }
  if (down != null && down < 15) { worse('Moyenne'); tips.push(`Débit de ${down} Mb/s : les jeux mettront longtemps à se télécharger.`); }
  if (up != null && up < 3) tips.push(`Envoi à ${up} Mb/s : faible pour streamer ou partager des clips.`);
  if (wifi && !tips.some((t) => /câble/.test(t))) tips.push('Tu es en Wi-Fi : pour jouer en ligne, un câble Ethernet donne un ping plus bas et plus stable.');
  if (grade === 'Excellente' && ping != null && ping >= 20) grade = 'Bonne';
  if (!tips.length) tips.push('Connexion parfaite pour jouer en ligne 👍');
  return { grade, tips };
}
