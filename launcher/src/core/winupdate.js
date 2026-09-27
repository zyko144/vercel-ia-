// Windows Update depuis le launcher : recherche des mises à jour (agent officiel Windows Update, sans droits
// administrateur), puis téléchargement et installation en administrateur avec l'avancement en direct.
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const win = process.platform === 'win32';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SEARCH_PS = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$s=New-Object -ComObject Microsoft.Update.Session
$q=$s.CreateUpdateSearcher()
$r=$q.Search("IsInstalled=0 and IsHidden=0")
$list=@(foreach($u in $r.Updates){ [pscustomobject]@{ id=$u.Identity.UpdateID; title=$u.Title; kb=(@($u.KBArticleIDs) -join ','); size=[int64]$u.MaxDownloadSize; cats=(@($u.Categories | ForEach-Object { $_.Name }) -join '|'); downloaded=[bool]$u.IsDownloaded; reboot=[int]$u.InstallationBehavior.RebootBehavior; severity=[string]$u.MsrcSeverity; auto=[bool]$u.AutoSelectOnWebSites; type=[int]$u.Type; date=$u.LastDeploymentChangeTime.ToString('o') } })
$n=$q.GetTotalHistoryCount(); $h=@()
if($n -gt 0){ $h=@(foreach($e in $q.QueryHistory(0,[Math]::Min(15,$n))){ [pscustomobject]@{ title=$e.Title; date=$e.Date.ToString('o'); result=[int]$e.ResultCode } }) }
[pscustomobject]@{ updates=$list; history=$h; reboot=[bool](New-Object -ComObject Microsoft.Update.SystemInfo).RebootRequired } | ConvertTo-Json -Depth 4 -Compress
`;

/** Type lisible d'une mise à jour, pour les ranger. */
export function kindOf(u) {
  const c = `${u.cats} ${u.title}`;
  if (u.type === 2 || /driver|pilote/i.test(c)) return 'pilote';
  if (/defender|antivirus|security intelligence|informations de sécurité/i.test(c)) return 'defender';
  if (/feature|fonctionnalité|version \d{2}h\d/i.test(c)) return 'version';
  if (/security|sécurité|cumulative|cumulatif|critical|critique/i.test(c) || u.severity) return 'securite';
  if (/\.net|framework/i.test(c)) return 'dotnet';
  return 'autre';
}
export const KINDS = { securite: ['🛡', 'Sécurité et cumulatives'], defender: ['🦠', 'Antivirus Microsoft Defender'], pilote: ['🖥', 'Pilotes'], dotnet: ['🧱', '.NET'], version: ['⬆', 'Nouvelle version de Windows'], autre: ['📦', 'Autres'] };

export function parseSearch(json) {
  const d = typeof json === 'string' ? JSON.parse(json || '{}') : json ?? {};
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const updates = arr(d.updates).filter((u) => GUID.test(String(u.id ?? ''))).map((u) => ({
    id: u.id, title: String(u.title ?? ''), kb: u.kb ? `KB${String(u.kb).split(',')[0]}` : null, size: Number(u.size) || 0,
    downloaded: Boolean(u.downloaded), reboot: Number(u.reboot) > 0, optional: !u.auto, kind: kindOf(u), date: u.date ?? null,
  })).sort((a, b) => a.optional - b.optional || Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind));
  const RESULT = { 2: 'ok', 3: 'ok', 4: 'echec', 5: 'annule' };
  const history = arr(d.history).map((h) => ({ title: String(h.title ?? ''), date: h.date, result: RESULT[h.result] ?? 'en cours' }));
  return { updates, history, reboot: Boolean(d.reboot) };
}

function ps(script, timeout) {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    let out = '';
    const t = setTimeout(() => p.kill(), timeout);
    p.stdout.on('data', (c) => { out += c; });
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', () => { clearTimeout(t); resolve(out.trim()); });
  });
}

export async function searchUpdates() {
  if (!win) return { error: 'Windows Update est disponible sur Windows seulement.' };
  const out = await ps(SEARCH_PS, 10 * 60_000); // la première recherche peut prendre quelques minutes
  if (!out) return { error: 'Windows Update ne répond pas. Vérifie ta connexion et réessaie.' };
  try { return parseSearch(out.slice(out.indexOf('{'))); } catch { return { error: 'Réponse de Windows Update illisible.' }; }
}

/** Script d'installation (administrateur) : seulement des identifiants de mise à jour valides, avancement écrit dans un fichier. */
export function installScript(ids, progressFile) {
  const safe = ids.filter((id) => GUID.test(id));
  if (!safe.length) throw new Error('Aucune mise à jour valide');
  const file = progressFile.replace(/'/g, "''");
  return String.raw`
$ErrorActionPreference='Continue'
$f='${file}'
function W($o){ $o | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath $f -Encoding UTF8 }
$ids=@(${safe.map((id) => `'${id}'`).join(',')})
$s=New-Object -ComObject Microsoft.Update.Session
$r=$s.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0")
$sel=@(foreach($u in $r.Updates){ if($ids -contains $u.Identity.UpdateID){ $u } })
$n=$sel.Count; $res=@(); $i=0
foreach($u in $sel){
  $i++
  if(-not $u.EulaAccepted){ $u.AcceptEula() }
  $c=New-Object -ComObject Microsoft.Update.UpdateColl; [void]$c.Add($u)
  W @{ phase='download'; index=$i; total=$n; title=$u.Title; results=$res }
  $d=$s.CreateUpdateDownloader(); $d.Updates=$c; $dr=$d.Download()
  W @{ phase='install'; index=$i; total=$n; title=$u.Title; results=$res }
  $in=$s.CreateUpdateInstaller(); $in.Updates=$c; $ir=$in.Install()
  $res+=@{ id=$u.Identity.UpdateID; title=$u.Title; code=[int]$ir.ResultCode; reboot=[bool]$ir.RebootRequired }
}
W @{ phase='done'; index=$n; total=$n; results=$res; reboot=[bool](New-Object -ComObject Microsoft.Update.SystemInfo).RebootRequired }
`;
}

/** Installe les mises à jour choisies en administrateur ; onProgress reçoit l'étape en cours toutes les secondes. */
export async function installUpdates(ids, onProgress = () => {}) {
  if (!win) return { ok: false, error: 'Windows seulement.' };
  const file = path.join(os.tmpdir(), `history-wu-${Date.now()}.json`);
  let script;
  try { script = installScript(ids, file); } catch (err) { return { ok: false, error: err.message }; }
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const outer = `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`;
  const poll = setInterval(async () => {
    const t = await readFile(file, 'utf8').catch(() => null);
    if (t) try { onProgress(JSON.parse(t.replace(/^﻿/, ''))); } catch { /* fichier en cours d'écriture */ }
  }, 1000);
  const code = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(-1));
    p.on('close', resolve);
  });
  clearInterval(poll);
  const t = await readFile(file, 'utf8').catch(() => null);
  await rm(file, { force: true }).catch(() => {});
  if (!t) return { ok: false, error: code === 0 ? 'Installation interrompue.' : 'Autorisation administrateur refusée.' };
  const last = JSON.parse(t.replace(/^﻿/, ''));
  const results = (Array.isArray(last.results) ? last.results : last.results ? [last.results] : []).map((x) => ({ ...x, ok: x.code === 2 || x.code === 3 }));
  return { ok: true, results, reboot: Boolean(last.reboot) };
}
