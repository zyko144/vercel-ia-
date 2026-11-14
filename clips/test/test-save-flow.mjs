import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const source=main.slice(main.indexOf('async function saveClipWork(game)'),main.indexOf('/** Clip avec micro'));
for(const native of [false,true]){
 let resumeCopy;const copying=new Promise(r=>resumeCopy=r);let probes=0,active=0,maxActive=0;
 const pending=new Map(),events=[];
 const context={path,randomUUID:()=> 'fixture',st:{audio:true,mic:true,micVol:100,gameVol:100},recWin:{},recState:'on',
  replayBuffer:{tracks:{video:{files:[1,2]}},offsets:{game:0,mic:0},snapshot:async()=>({game:native,mic:true,duration:60})},
  safeName:x=>x,ROOT:()=>'/fixture',inGame:()=>false,fg:{game:'Test'},captureBackend:native?'native':'compatible',pendingClips:pending,
  notifyClip:(_label,phase='saving')=>events.push(phase),changed:()=>events.push(pending.size?'pending':'ready'),
  mkdir:()=>copying,probe:async()=>{probes++;maxActive=Math.max(maxActive,++active);await new Promise(r=>setImmediate(r));active--;return{audio:true,h264:true,dur:60,start:0};},
  nativeMixArgs:()=>[],runFfmpeg:async()=>{},withMic:async(_v,_m,_o,_vol,_g,known)=>assert.ok(known.video.h264&&known.mic.audio),
  toMp4:async()=>{},clean:async()=>{},clipName:()=> 'clip.mp4',rename:async()=>events.push('renamed'),saveSt:async()=>{},prune:async()=>{},rm:async()=>{},
 };
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.save=saveClipWork;',context);
 const saved=context.save('Test');
 assert.equal(pending.size,1,'carte visible avant la copie et la conversion');
 assert.deepEqual(events.slice(0,2),['saving','pending']);
 resumeCopy();assert.equal((await saved).ok,true);
 assert.equal(pending.size,0,'carte provisoire remplacée après succès');
 assert.equal(probes,native?4:3,'chaque piste analysée une seule fois, puis validation du résultat');
 assert.equal(maxActive,native?3:2,'analyses indépendantes en parallèle');
 assert.ok(events.indexOf('saved')>events.indexOf('renamed'),'confirmation après écriture du MP4');
}
console.log('✅ Bibliothèque : carte immédiate, analyses parallèles sans doublon, remplacement après sauvegarde');
