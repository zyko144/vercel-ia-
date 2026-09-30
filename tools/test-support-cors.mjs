import assert from 'node:assert/strict';
process.env.DISCORD_TOKEN='test-token';process.env.GEMINI_API_KEY='test-key';process.env.PORT='0';process.env.PUBLIC_URL='';process.env.RENDER_EXTERNAL_URL='';process.env.SITE_URL='';process.env.SUPABASE_URL='';
const {startHttpServer}=await import('../src/server.js');const server=startHttpServer(()=>({}));await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
try {
 for(const path of ['support','connexion','connexion/2fa','deconnexion']) {const r=await fetch(`${base}/api/compte/${path}`,{method:'OPTIONS',headers:{Origin:'https://zyko144.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type, authorization'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://zyko144.github.io');assert.match(r.headers.get('access-control-allow-headers'),/Authorization/);}
 const r=await fetch(`${base}/api/compte/support`,{method:'OPTIONS',headers:{Origin:'https://evil.example'}});assert.equal(r.headers.get('access-control-allow-origin'),null);
 const unrelated=await fetch(`${base}/api/compte/etat`,{method:'OPTIONS',headers:{Origin:'https://zyko144.github.io'}});assert.equal(unrelated.headers.get('access-control-allow-origin'),null);
 const actual=await fetch(`${base}/api/compte/support`,{headers:{Origin:'https://zyko144.github.io'}});assert.equal(actual.status,401);assert.equal(actual.headers.get('access-control-allow-origin'),'https://zyko144.github.io');
 console.log('✓ CORS support : sites autorisés, routes limitées, origine étrangère refusée, authentification conservée');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
