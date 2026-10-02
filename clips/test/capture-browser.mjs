let start,stop,pending=Promise.resolve();
const result=document.getElementById('result');
window.rec={onStart:fn=>start=fn,onStop:fn=>stop=fn,state:s=>{result.textContent+='\n'+s;},chunk:(b,kind)=>{pending=pending.then(()=>fetch('/recorded?kind='+kind,{method:'POST',body:b})).then(r=>{if(!r.ok)throw Error('Écriture du replay refusée');});}};
await import('../src/ui/recorder.js');
document.getElementById('start').onclick=async()=>{
  document.getElementById('start').disabled=true;
  const audio=new AudioContext();await audio.resume();
  const tone=f=>{const o=audio.createOscillator(),d=audio.createMediaStreamDestination();o.frequency.value=f;o.connect(d);o.start();return d.stream;};
  const canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d'),video=canvas.captureStream(15),game=tone(440),mic=tone(880);
  video.addTrack(game.getAudioTracks()[0]);
  navigator.mediaDevices.getDisplayMedia=async()=>video;navigator.mediaDevices.getUserMedia=async()=>mic;
  let n=0;const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#2459cc':'#27bb89';ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.fillText('TEST SYNTHÉTIQUE '+n,20,60);},60);
  try{
    await start('test',{audio:true,mic:true,height:720,fps:30});await new Promise(r=>setTimeout(r,8000));stop();await pending;
    const r=await(await fetch('/finish-recording',{method:'POST'})).json();
    if(!r.ok)throw Error(JSON.stringify(r));
    result.textContent+='\nPASS — MediaRecorder → replay → MP4 : son du jeu et micro mesurés\n'+JSON.stringify(r);
  }catch(e){result.textContent+='\nFAIL: '+e.message;}
  finally{clearInterval(timer);stop();await audio.close();}
};
