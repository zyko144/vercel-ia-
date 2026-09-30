import { readFile } from 'node:fs/promises';
import { parseVdf, pick } from './vdf.js';
export function updateCommand(item) {
  if(item.source !== 'steam' || !/^\d+$/.test(String(item.steamId))) throw new Error('Mise à jour non prise en charge pour ce jeu.');
  return [`steam://install/${item.steamId}`];
}
export function parseUpdateProgress(text, appId) {
  let depth=0;for(const token of String(text).match(/"(?:[^"\\]|\\.)*"|[{}]/g)??[]){if(token==='{')depth++;if(token==='}'&&--depth<0)throw new Error('Progression temporairement indisponible.');}
  if(depth!==0)throw new Error('Progression temporairement indisponible.');
  const state=pick(parseVdf(text),'AppState');
  if(!state || String(pick(state,'appid'))!==String(appId) || !/^\d+$/.test(String(pick(state,'StateFlags')))) throw new Error('Progression temporairement indisponible.');
  const flags=Number(pick(state,'StateFlags'));
  const n=k=>{const v=Number(pick(state,k));return Number.isFinite(v)&&v>=0?v:0;};
  const total=n('BytesToDownload'),done=Math.min(n('BytesDownloaded'),total),diskTotal=n('BytesToStage'),diskDone=Math.min(n('BytesStaged'),diskTotal);
  if(n('DownloadError'))return {phase:'error',percent:null,label:'Téléchargement interrompu. Ouvre les téléchargements pour voir le problème.'};
  if(flags===4)return {phase:'done',percent:100,label:'Mise à jour terminée. Le jeu est prêt, sans lancement automatique.'};
  if(total>0&&done<total)return {phase:'download',percent:Math.floor(done/total*100),bytes:done,total,label:'Téléchargement'};
  if(diskTotal>0&&diskDone<diskTotal)return {phase:'install',percent:Math.floor(diskDone/diskTotal*100),bytes:diskDone,total:diskTotal,label:'Installation des fichiers'};
  return {phase:'waiting',percent:null,label:total>0&&done===total?'Finalisation ou attente de la plateforme…':'En attente du téléchargement. Une confirmation peut être nécessaire dans la plateforme.'};
}
export async function readUpdateProgress(item) {
  updateCommand(item);
  if(!item.manifest)throw new Error('Suivi indisponible pour ce jeu.');
  return parseUpdateProgress(await readFile(item.manifest,'utf8'),item.steamId);
}
