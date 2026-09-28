// Contrôle depuis le téléphone (même Wi-Fi) : une petite page pour voir le PC et lancer un jeu, protégée par un code à 6 chiffres.
import http from 'node:http';
import os from 'node:os';

export const REMOTE_PORT = 47800;
/** Adresse du PC sur le réseau local (Wi-Fi / Ethernet). */
export const lanAddress = () => Object.values(os.networkInterfaces()).flat().find((a) => a?.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(a.address))?.address ?? null;
export const newPin = () => String(Math.floor(100000 + Math.random() * 900000));

const PAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>History Launcher</title>
<style>body{margin:0;font:16px system-ui,sans-serif;background:#07060b;color:#f4f1f6;padding:18px}h1{font-size:20px}.c{background:#15131d;border:1px solid #2a2635;border-radius:16px;padding:14px;margin:12px 0}
button{width:100%;padding:14px;border:0;border-radius:12px;background:#2f8bff;color:#fff;font:600 16px system-ui;margin:6px 0}input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #2a2635;background:#0d0c12;color:#fff;font-size:20px;text-align:center;letter-spacing:6px}
.g{display:flex;gap:10px}.g div{flex:1;text-align:center}.g b{display:block;font-size:22px}small{color:#a39cab}</style>
<h1>🚀 History Launcher</h1><div id="app"></div><script>
const $=(h)=>document.getElementById('app').innerHTML=h;let code=localStorage.code||'';
const api=(p,m='GET')=>fetch(p+(p.includes('?')?'&':'?')+'code='+code,{method:m}).then(r=>r.ok?r.json():Promise.reject(r.status));
function login(){$('<div class="c"><p>Entre le code affiché dans le launcher (Paramètres › Général).</p><input id="k" inputmode="numeric" maxlength="6"><button onclick="code=k.value;localStorage.code=code;load()">Valider</button></div>')}
function load(){api('/api/etat').then(s=>{$('<div class="c g"><div><small>Processeur</small><b>'+(s.cpu??'–')+'</b></div><div><small>Carte graphique</small><b>'+(s.gpu??'–')+'</b></div><div><small>Mémoire</small><b>'+(s.ram??'–')+'</b></div></div>'+(s.jeu?'<div class="c">🎮 En jeu : <b>'+s.jeu+'</b></div>':'')+'<div class="c"><small>Lancer un jeu</small>'+s.jeux.map(j=>'<button data-id="'+j.id+'">'+j.name.replace(/[<>&]/g,'')+'</button>').join('')+'</div>');document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>api('/api/lancer?id='+encodeURIComponent(b.dataset.id),'POST').then(()=>b.textContent='✅ Lancé'))}).catch(login)}
code?load():login();setInterval(()=>code&&load(),10000)</script>`;

/** Serveur local. `state()` : état du PC ; `launch(id)` : lance un jeu. 5 mauvais codes = 1 minute bloquée. */
export function startRemote({ pin, state, launch }) {
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
    } catch { return send(500, { error: 'Erreur' }); }
    return send(404, { error: 'Inconnu' });
  });
  srv.listen(REMOTE_PORT, '0.0.0.0');
  srv.on('error', () => {});
  return srv;
}
