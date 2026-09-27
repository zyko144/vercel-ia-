// Un seul score de santé du PC, le même partout (Mon PC et Optimisation) :
// matériel et sécurité (diagnostic) + entretien (optimisation) + stockage (analyse pro, si elle a été faite).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const healthLabel = (n) => (n >= 90 ? 'Excellent' : n >= 75 ? 'Bon' : n >= 55 ? 'Moyen' : 'À optimiser');

/** Combine les notes disponibles (pondérées) ; les parties absentes ne comptent pas. */
export function unifiedHealth({ diag = null, opti = null, storage = null, events = null } = {}) {
  const parts = [];
  if (diag != null) parts.push({ id: 'materiel', label: 'Matériel et sécurité', score: diag, weight: 0.5 });
  if (opti != null) parts.push({ id: 'entretien', label: 'Entretien et réglages', score: opti, weight: 0.3 });
  if (storage != null) parts.push({ id: 'stockage', label: 'Fichiers et stockage', score: storage, weight: 0.1 });
  if (events != null) parts.push({ id: 'stabilite', label: 'Stabilité de Windows', score: events, weight: 0.1 });
  if (!parts.length) return { score: null, label: 'Pas encore analysé', parts };
  const w = parts.reduce((n, p) => n + p.weight, 0);
  const score = Math.round(parts.reduce((n, p) => n + p.score * p.weight, 0) / w);
  return { score, label: healthLabel(score), parts: parts.map(({ weight, ...p }) => p) };
}

// Journal d'événements de Windows (7 derniers jours) : arrêts brutaux, écrans bleus, erreurs disque et matériel,
// applis qui plantent. Lisible sans droits administrateur.
export const EVENTS_PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$since=(Get-Date).AddDays(-7)
$sys=@(Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=$since} -MaxEvents 3000)
$app=@(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1002; StartTime=$since} -MaxEvents 2000)
$crash=@($app | ForEach-Object { if($_.Properties.Count -gt 0){ [string]$_.Properties[0].Value } } | Group-Object | Sort-Object Count -Descending | Select-Object -First 8 | ForEach-Object { @{ name=$_.Name; count=$_.Count } })
[pscustomobject]@{
  power=@($sys | Where-Object { $_.ProviderName -eq 'Microsoft-Windows-Kernel-Power' -and $_.Id -eq 41 }).Count
  bsod=@($sys | Where-Object { $_.Id -eq 1001 -and $_.ProviderName -match 'BugCheck|WER-SystemErrorReporting' }).Count
  disk=@($sys | Where-Object { $_.ProviderName -match '^(disk|Ntfs|stornvme|storahci|volmgr)$' }).Count
  whea=@($sys | Where-Object { $_.ProviderName -eq 'Microsoft-Windows-WHEA-Logger' }).Count
  gpu=@($sys | Where-Object { $_.ProviderName -match 'nvlddmkm|amdkmdag|Display' }).Count
  errors=$sys.Count
  crashes=$crash
} | ConvertTo-Json -Depth 4 -Compress
`;

export function parseEvents(json) {
  const d = typeof json === 'string' ? JSON.parse(json || '{}') : json ?? {};
  const n = (x) => Number(x) || 0;
  const crashes = (Array.isArray(d.crashes) ? d.crashes : d.crashes ? [d.crashes] : []).filter((c) => c?.name).map((c) => ({ name: String(c.name), count: n(c.count) }));
  const e = { power: n(d.power), bsod: n(d.bsod), disk: n(d.disk), whea: n(d.whea), gpu: n(d.gpu), errors: n(d.errors), crashes };
  const findings = [];
  if (e.bsod) findings.push({ prio: 0, title: `${e.bsod} écran${e.bsod > 1 ? 's' : ''} bleu${e.bsod > 1 ? 's' : ''} cette semaine`, text: 'Souvent un pilote (carte graphique, réseau) ou la mémoire : mets à jour les pilotes et lance « Réparer Windows ». Si ça continue, teste la mémoire (Diagnostic de mémoire Windows).' });
  if (e.power) findings.push({ prio: 1, title: `${e.power} arrêt${e.power > 1 ? 's' : ''} brutal${e.power > 1 ? 'aux' : ''} du PC`, text: 'Le PC s’est éteint sans passer par « Arrêter » : coupure de courant, surchauffe ou alimentation trop faible pour la carte graphique.' });
  if (e.whea) findings.push({ prio: 0, title: `${e.whea} erreur${e.whea > 1 ? 's' : ''} matérielle${e.whea > 1 ? 's' : ''} (WHEA)`, text: 'Le processeur ou la mémoire signale des erreurs : souvent un overclocking / profil XMP instable ou une surchauffe.' });
  if (e.disk) findings.push({ prio: 0, title: `${e.disk} erreur${e.disk > 1 ? 's' : ''} de disque`, text: 'Windows a eu du mal à lire ou écrire sur un disque : sauvegarde tes fichiers importants et vérifie le câble (disque SATA) ou la santé du disque.' });
  if (e.gpu) findings.push({ prio: 1, title: `${e.gpu} plantage${e.gpu > 1 ? 's' : ''} du pilote graphique`, text: 'Le pilote de la carte graphique a redémarré : réinstalle le dernier pilote, et vérifie la température de la carte.' });
  for (const c of crashes.filter((x) => x.count >= 3).slice(0, 3)) findings.push({ prio: 2, title: `${c.name} a planté ${c.count} fois`, text: 'Réinstalle ou mets à jour ce programme ; pour un jeu, vérifie ses fichiers (clic droit › Vérifier les fichiers).' });
  const score = Math.max(0, 100 - Math.min(40, e.bsod * 20) - Math.min(20, e.power * 5) - Math.min(30, e.whea * 10) - Math.min(30, e.disk * 5) - Math.min(15, e.gpu * 5) - Math.min(10, crashes.reduce((a, c) => a + c.count, 0)));
  return { ...e, findings, score };
}

export async function windowsEvents() {
  if (process.platform !== 'win32') return null;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', EVENTS_PS], { windowsHide: true, timeout: 120_000, maxBuffer: 4e6 }).catch(() => null);
  const out = String(r?.stdout ?? '').trim();
  try { return parseEvents(out.slice(out.indexOf('{'))); } catch { return null; }
}
