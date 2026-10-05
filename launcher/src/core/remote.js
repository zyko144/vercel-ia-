// Contrôle depuis le téléphone (même Wi-Fi) : voir le PC, lancer / installer un jeu, clips, notifications, ticket Opti Pro, veille / extinction, second écran et mode TV (?tv), protégée par un code à 6 chiffres.
import http from 'node:http';
import os from 'node:os';

export const REMOTE_PORT = 47800;
/** Adresse du PC sur le réseau local (Wi-Fi / Ethernet). */
export const lanAddress = () => Object.values(os.networkInterfaces()).flat().find((a) => a?.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(a.address))?.address ?? null;
export const newPin = () => String(Math.floor(100000 + Math.random() * 900000));

const PAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07060b"><title>History Launcher</title>
<style>body{margin:0;font:16px system-ui,sans-serif;background:#07060b;color:#f4f1f6;padding:18px}h1{font-size:20px;display:flex;justify-content:space-between;align-items:center}.c{background:#15131d;border:1px solid #2a2635;border-radius:16px;padding:14px;margin:12px 0}
button{width:100%;padding:14px;border:0;border-radius:12px;background:#2f8bff;color:#fff;font:600 16px system-ui;margin:6px 0}button.g2{background:#25222f}button.red{background:#c0392b}input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #2a2635;background:#0d0c12;color:#fff;font-size:20px;text-align:center;letter-spacing:6px}
.g{display:flex;gap:10px}.g div{flex:1;text-align:center}.g b{display:block;font-size:22px}small{color:#a39cab}.row{display:flex;gap:8px}.n{padding:8px 0;border-bottom:1px solid #2a2635}.n:last-child{border:0}
.clips{display:grid;grid-template-columns:1fr 1fr;gap:8px}.clips a{display:block;color:#fff;text-decoration:none;font-size:12px}.clips img,.clips video{width:100%;border-radius:10px;aspect-ratio:16/9;object-fit:cover;background:#000}
.big .g b{font-size:54px}.big .g small{font-size:18px}.tv .jeux{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.tv .jeux button{padding:40px 14px;font-size:22px}</style>
<h1>🚀 History <button class="g2" style="width:auto;padding:8px 12px;font-size:14px" onclick="big=!big;load()">📺 Second écran</button></h1><div id="app"></div><script>
const $=(h)=>document.getElementById('app').innerHTML=h,E=(t)=>String(t??'').replace(/[<>&"]/g,'');let code=localStorage.code||'',big=false,seen=localStorage.seen||'';
if(location.search.includes('tv'))document.body.classList.add('tv');
const api=(p,m='GET')=>fetch(p+(p.includes('?')?'&':'?')+'code='+code,{method:m}).then(r=>r.ok?r.json():Promise.reject(r.status));
function login(){$('<div class="c"><p>Entre le code affiché dans le launcher (Paramètres › Téléphone).</p><input id="k" inputmode="numeric" maxlength="6"><button onclick="code=k.value;localStorage.code=code;load()">Valider</button></div>')}
const act=(d,id='')=>api('/api/act?do='+d+'&id='+encodeURIComponent(id),'POST').then(r=>alert(r.msg||(r.ok?'✅ Fait':'Impossible')));
function load(){api('/api/etat').then(s=>{const stats='<div class="c g"><div><small>Processeur</small><b>'+E(s.cpu??'–')+'</b></div><div><small>Carte graphique</small><b>'+E(s.gpu??'–')+'</b></div><div><small>Mémoire</small><b>'+E(s.ram??'–')+'</b></div>'+(s.fps?'<div><small>FPS</small><b>'+E(s.fps)+'</b></div>':'')+'</div>'+(s.jeu?'<div class="c">🎮 En jeu : <b>'+E(s.jeu)+'</b></div>':'');
if(big){document.body.classList.add('big');return $(stats)}document.body.classList.remove('big');
const last=(s.notifs||[])[0];if(last&&last.id!==seen){seen=localStorage.seen=last.id;navigator.vibrate&&navigator.vibrate(200)}
$(stats+'<div class="c"><small>Lancer un jeu</small><div class="jeux">'+s.jeux.map(j=>'<button data-id="'+E(j.id)+'">▶ '+E(j.name)+'</button>').join('')+'</div></div>'
+(s.installer?.length?'<div class="c"><small>Installer à distance</small>'+s.installer.map(j=>'<button class="g2" data-inst="'+E(j.id)+'">⬇ '+E(j.name)+'</button>').join('')+'</div>':'')
+(s.ticket?'<div class="c"><small>🚀 Ticket Opti Pro · étape '+E(s.ticket.step)+'/7</small><p>'+E(s.ticket.last).slice(0,400)+'</p></div>':'')
+'<div class="c"><small>Notifications</small>'+((s.notifs||[]).map(n=>'<div class="n">'+E(n.icon)+' <b>'+E(n.title)+'</b><br><small>'+E(n.body)+'</small></div>').join('')||'<p><small>Rien de nouveau.</small></p>')+'</div>'
+'<div class="c"><small>Derniers clips et captures</small><div class="clips" id="clips"></div></div>'
+'<div class="c"><small>PC</small><div class="row"><button class="g2" onclick="confirm(\\'Mettre le PC en veille ?\\')&&act(\\'sleep\\')">🌙 Veille</button><button class="red" onclick="confirm(\\'Éteindre le PC dans 60 s ?\\')&&act(\\'shutdown\\')">⏻ Éteindre</button></div><button class="g2" onclick="act(\\'cancel\\')">Annuler l’extinction</button></div>');
document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>api('/api/lancer?id='+encodeURIComponent(b.dataset.id),'POST').then(()=>b.textContent='✅ Lancé'));
document.querySelectorAll('[data-inst]').forEach(b=>b.onclick=()=>act('install',b.dataset.inst));
api('/api/clips').then(l=>{document.getElementById('clips').innerHTML=l.map(c=>'<a href="/api/f?n='+encodeURIComponent(c.n)+'&code='+code+'" target="_blank">'+(c.img?'<img loading="lazy" src="/api/f?n='+encodeURIComponent(c.n)+'&code='+code+'">':'<video preload="metadata" src="/api/f?n='+encodeURIComponent(c.n)+'&code='+code+'#t=1"></video>')+E(c.n).slice(0,40)+'</a>').join('')||'<small>Aucun clip.</small>'}).catch(()=>{})}).catch(login)}
code?load():login();setInterval(()=>code&&!document.hidden&&load(),big?2000:10000);setInterval(()=>big&&code&&load(),2000)</script>`;

/** Serveur local. `state()` : état du PC ; `launch(id)` : lance un jeu. 5 mauvais codes = 1 minute bloquée. */
export function startRemote({ pin, state, launch, act = async () => ({ ok: false }), clips = async () => [], file = async () => null }) {
  let fails = 0; let lockedUntil = 0;
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    if (url.pathname === '/') return send(200, PAGE, 'text/html');
    if (Date.now() < lockedUntil) return send(429, { error: 'Trop d’essais' });
    if (url.searchParams.get('code') !== pin) { if (++fails >= 5) { fails = 0; lockedUntil = Date.now() + 60_000; } return send(401, { error: 'Code faux' }); }
    fails = 0;
    try {
      if (url.pathname === '/api/etat' && req.method === 'GET') return send(200, await state());
      if (url.pathname === '/api/lancer' && req.method === 'POST') return send(200, await launch(String(url.searchParams.get('id') ?? '')));
      if (url.pathname === '/api/act' && req.method === 'POST') return send(200, await act(String(url.searchParams.get('do') ?? ''), String(url.searchParams.get('id') ?? '')));
      if (url.pathname === '/api/clips') return send(200, await clips());
      if (url.pathname === '/api/f') { const f = await file(String(url.searchParams.get('n') ?? '')); if (!f) return send(404, { error: 'Introuvable' }); res.writeHead(200, { 'Content-Type': /\.png$/i.test(f) ? 'image/png' : 'video/mp4', 'Cache-Control': 'no-store' }); return (await import('node:fs')).createReadStream(f).pipe(res); }
    } catch { return send(500, { error: 'Erreur' }); }
    return send(404, { error: 'Inconnu' });
  });
  srv.listen(REMOTE_PORT, '0.0.0.0');
  srv.on('error', () => {});
  return srv;
}
