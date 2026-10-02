// Sert uniquement les fixtures et le code de Clips en local, avec le même lecteur Range que l’app.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Readable } from 'node:stream';
import { serveMedia } from '../src/mediaFile.js';
import { ReplayBuffer } from '../src/replay.js';
import { micMixArgs } from '../src/core.js';
const root = path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const fixture = process.argv[2];
const recorded = await mkdtemp(path.join(os.tmpdir(),'clips-browser-record-'));
const replay = new ReplayBuffer(path.join(recorded,'ring'),3);
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST' && url.pathname==='/recorded') {
      const chunks=[];let length=0;
      for await(const c of req){length+=c.length;if(length>10000000)throw Error('taille');chunks.push(c);}
      await replay.push(url.searchParams.get('kind'),Buffer.concat(chunks));res.end('ok');return;
    }
    if(req.method==='POST' && url.pathname==='/finish-recording') {
      const v=path.join(recorded,'video.webm'),m=path.join(recorded,'mic.webm'),out=path.join(recorded,'mixed.mp4');
      await replay.snapshot(v,m);await replay.close();
      execFileSync(process.env.FFMPEG_TEST_BIN,['-hide_banner','-loglevel','error',...micMixArgs(v,m,out,{videoAudio:true})],{windowsHide:true,timeout:30000});
      const pcm=execFileSync(process.env.FFMPEG_TEST_BIN,['-hide_banner','-loglevel','error','-i',out,'-map','0:a:0','-ac','1','-ar','48000','-f','f32le','pipe:1'],{windowsHide:true,timeout:30000,maxBuffer:4000000});
      const tone=f=>{let re=0,im=0,n=Math.min(48000,pcm.length/4);for(let i=0;i<n;i++){const x=pcm.readFloatLE(i*4);re+=x*Math.cos(2*Math.PI*f*i/48000);im+=x*Math.sin(2*Math.PI*f*i/48000);}return Math.hypot(re,im)/n;};
      const game=tone(440),mic=tone(880);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:game>0.015&&mic>0.015,game,mic,file:out}));return;
    }
    if(url.pathname==='/fixture.mp4'){
      const r=await serveMedia(fixture,req.headers.range,req.method);res.writeHead(r.status,Object.fromEntries(r.headers));
      if(!r.body)return res.end();const stream=Readable.fromWeb(r.body);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname.replace(/^\/clips/,'')));
    if(!file.startsWith(root+path.sep))throw Error('chemin');
    const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end();}
}).listen(8767,'127.0.0.1',()=>console.log('Tests Clips sur http://127.0.0.1:8767/clips/test/gallery-browser.html'));
