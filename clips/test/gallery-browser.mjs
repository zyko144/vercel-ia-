const doc = new DOMParser().parseFromString(await (await fetch('../src/ui/index.html')).text(), 'text/html');
doc.querySelectorAll('script').forEach(e => e.remove());
document.body.replaceChildren(...doc.body.childNodes);
document.querySelectorAll('img[src="icon.png"]').forEach(e => e.src = '../src/ui/icon.png');
const $ = id => document.getElementById(id), results = [];
const assert = (ok,text) => { if(!ok)throw Error(text); results.push('✓ '+text); };
const wait = async fn => { for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Attente expirée'); };
let list = [{token:'one', name:'Clip de test',game:'Test',url:'/fixture.mp4',at:Date.now(),size:10000}], failDelete = true, removes = 0;
window.hc = {
  settings:async()=>({replay:false,seconds:30,height:1080,fps:60,audio:true,mic:true,hotClip:'F8',hotShot:'F9'}), account:async()=>({skipped:true}), list:async()=>list, art:async()=>({}), updGet:async()=>({state:'idle'}),
  remove:async()=>{removes++;assert(!$('vVideo').getAttribute('src'),'Lecteur libéré avant suppression'); if(failDelete)return{ok:false,error:'Fichier occupé (test)'};list=[];return{ok:true};},
  exportMp4:async()=>{throw Error('Disque indisponible (test)');}, repair:async()=>({ok:false,error:'Réparation simulée'}),
};
try{
  await import('../src/ui/app.js'); await wait(()=>document.querySelector('[data-t="one"]'));
  $('vVideo').muted=true; document.querySelector('[data-t="one"]').click();
  await wait(()=>$('vVideo').readyState>=2);
  assert(Number.isFinite($('vVideo').duration)&&$('vVideo').duration>1,'MP4 chargé et durée exploitable');
  await $('vVideo').play(); await wait(()=>$('vVideo').currentTime>0.1);assert(true,'Lecture réelle dans le navigateur');
  $('vVideo').currentTime=1;await wait(()=>!$('vVideo').seeking);assert($('vVideo').currentTime>=1,'Recherche dans le clip');
  $('vExport').click();await wait(()=>$('toast').textContent.includes('Export impossible'));assert(true,'Échec export traité sans bloquer l’interface');
  $('vDelete').click();document.querySelector('[data-to="yes"]').click();
  await wait(()=>$('toast').textContent.includes('Fichier occupé'));assert($('viewer').open&&document.querySelector('[data-t="one"]'),'Suppression refusée conserve la carte et le lecteur');
  failDelete=false;$('vDelete').click();const yes=document.querySelector('[data-to="yes"]');yes.click();yes.click();
  await wait(()=>!document.querySelector('[data-t="one"]'));
  assert(removes===2,'Un seul appel par confirmation, même au double clic');assert(!$('viewer').open,'Suppression réussie ferme le lecteur et rafraîchit la galerie');
  document.body.insertAdjacentHTML('beforeend','<pre id="testResult" style="position:fixed;top:80px;right:20px;z-index:99999;background:#151515;color:white;padding:20px"></pre>');
  $('testResult').textContent=`PASS — ${results.length} checks\n`+results.join('\n');
}catch(e){document.body.textContent='FAIL: '+e.stack+'\n'+results.join('\n');}
