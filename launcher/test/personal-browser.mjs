import {initPersonal} from '../src/ui/personal.js';
import {initSettings} from '../src/ui/settings.js';
const $=id=>document.getElementById(id), results=[];
const assert=(v,m)=>{if(!v)throw Error(m);results.push('✓ '+m);};
const tick=()=>new Promise(r=>setTimeout(r,0));
try {
 const doc=new DOMParser().parseFromString(await(await fetch('../src/ui/index.html')).text(),'text/html');
 for(const id of ['view-accueil','settings','reviewDialog','notebookDialog','supportDialog','openSettings'])document.body.append(doc.getElementById(id));
 $('openSettings').onclick=()=>$('settings').showModal();
 const writes=[],reports=[],notes={};let noteFail=false,sendFail=false,resolveSend;let noteRead=async id=>notes[id]??{};
 const api={settings:async()=>({}),setSettings:async s=>{writes.push(s);return s;},notebook:id=>noteRead(id),saveNotebook:async(id,n)=>{if(noteFail)throw Error('Disque indisponible');notes[id]=n;return{ok:true};},supportDiagnostic:async()=>({version:'test'}),supportList:async()=>({tickets:[]}),supportSend:async b=>{reports.push(b);if(sendFail)throw Error('Hors ligne');return new Promise(r=>resolveSend=r);}};
 const personal=initPersonal(api,{items:()=>[{id:'one',name:'Premier jeu',kind:'game'},{id:'two',name:'Second jeu',kind:'game'}],card:i=>`<p>${i.name}</p>`,go(){},toast(){}});initSettings(api);await tick();
 $('customizeHome').click();assert(!$('set-accueil').hidden,'Personnaliser ouvre le bon réglage');
 document.querySelector('[data-move="pins"][data-dir="-1"]').click();await tick();assert($('homeBlocks').firstElementChild.dataset.homeBlock==='pins','Ordre des blocs appliqué');
 document.querySelector('[data-block="news"]').click();await tick();assert(document.querySelector('[data-home-block="news"]').hidden,'Bloc masqué indépendamment des données');
 document.querySelector('[data-pin="one"]').click();await tick();assert($('home-pins').textContent.includes('Premier jeu'),'Jeu épinglé rendu');assert(writes.at(-1).home.pins.includes('one'),'Épinglage sauvegardé');
 personal.tour('carnet');await tick();const form=$('notebookForm');form.elements.notes.value='Mon texte';noteFail=true;form.dispatchEvent(new Event('submit',{cancelable:true}));await tick();assert(form.elements.notes.value==='Mon texte'&&$('notebookStatus').textContent.includes('indisponible'),'Erreur de sauvegarde conserve le carnet');
 noteFail=false;form.dispatchEvent(new Event('submit',{cancelable:true}));await tick();assert(notes.one.notes==='Mon texte','Carnet sauvegardé');$('notebookDialog').close();await tick();personal.tour('carnet');await tick();assert(form.elements.notes.value==='Mon texte','Carnet restauré à la réouverture');$('notebookDialog').close();await tick();
 let resolveRead;noteRead=()=>new Promise(r=>resolveRead=r);personal.tour('carnet');$('notebookDialog').close();await tick();resolveRead({notes:'ancien résultat'});await tick();assert(form.elements.notes.value==='','Lecture tardive ignorée après fermeture');
 $('newSupport').click();await tick();assert($('supportDiagnostic').textContent.includes('version : test'),'Diagnostic visible avant envoi');
 const drop=(file)=>{const dt=new DataTransfer();dt.items.add(file);$('supportDrop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));};
 drop(new File(['bad'],'bad.txt',{type:'text/plain'}));await tick();assert($('supportStatus').textContent.includes('PNG'),'Capture invalide refusée');
 const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));drop(new File([blob],'capture.png',{type:'image/png'}));
 for(let i=0;i<100&&$('supportPreview').hidden;i++)await new Promise(r=>setTimeout(r,10));assert(!$('supportPreview').hidden,'Aperçu de capture valide');$('supportRemove').click();assert($('supportPreview').hidden,'Capture retirée');
 const support=$('supportForm');support.elements.title.value='Un problème';support.elements.description.value='Description suffisamment détaillée';$('supportInclude').checked=false;sendFail=true;support.dispatchEvent(new Event('submit',{cancelable:true}));await tick();assert($('supportStatus').textContent==='Hors ligne'&&support.elements.description.value.length>10,'Erreur réseau conserve le signalement');assert(Object.keys(reports[0].diagnostic).length===0,'Diagnostic facultatif exclu');
 sendFail=false;support.dispatchEvent(new Event('submit',{cancelable:true}));support.dispatchEvent(new Event('submit',{cancelable:true}));await tick();assert(reports.length===2,'Double envoi bloqué');const cancel=new Event('cancel',{cancelable:true});$('supportDialog').dispatchEvent(cancel);assert(cancel.defaultPrevented,'Fermeture bloquée pendant envoi');resolveSend({ok:true});await tick();assert(!$('supportDialog').open,'Confirmation ferme le formulaire');
 $('settings').close();document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('view-accueil').hidden=true;$('openSettings').hidden=true;
 $('results').textContent=`PASS — ${results.length} checks\n`+results.join('\n');
}catch(e){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('results').textContent='FAIL: '+e.stack+'\n'+results.join('\n');}
