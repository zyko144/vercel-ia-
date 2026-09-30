// Bulle de message en haut à droite : visible par-dessus le jeu, on répond sans le quitter.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let cur = null; let typing = false; let sending = false; let generation=0; let closeTimer=null;
const fit = () => requestAnimationFrame(() => window.bubble.size($('b').offsetHeight + 20));
window.bubble.onData((d) => {
  if (!d) { generation++;clearTimeout(closeTimer);cur=null;$('b').hidden=true;typing=false;sending=false;$('rep').hidden=true;$('foot').hidden=true;$('txt').value='';$('txt').disabled=false;$('rep').querySelector('button').disabled=false;return; }
  const fresh = !cur || cur.key !== d.key || d.msgs.length > (cur.msgs?.length ?? 0);
  if(cur?.key!==d.key){generation++;clearTimeout(closeTimer);typing=false;sending=false;$('rep').querySelector('button').disabled=false;$('txt').value='';$('txt').disabled=false;$('rep').hidden=true;$('foot').hidden=true;$('hint').hidden=false;$('hint').textContent='Clique pour répondre sans quitter ton jeu';}
  cur = d;
  window.sfx?.set({ on: false, notif: d.sound !== false, vol: d.vol ?? 0.6 });
  if (fresh && !d.silent) window.sfx?.play('notif');
  $('b').hidden = false;
  $('b').style.setProperty('--c', d.color || '#3b82f6');
  const img = /^https:\/\//.test(d.avatar ?? '') ? d.avatar : null;
  $('av').style.backgroundImage = img ? `url("${img.replace(/"/g, '')}")` : '';
  $('av').textContent = img ? '' : (d.group ? '👥' : String(d.title ?? '?').trim()[0]?.toUpperCase() ?? '?');
  $('who').textContent = d.title;
  $('sub').textContent = d.group ? 'Discussion de groupe' : 'Message privé';
  $('msgs').innerHTML = d.msgs.slice(-3).map((m) => `<p>${d.group ? `<b>${esc(m.pseudo)}</b> ` : ''}${esc(m.text)}</p>`).join('');
  if (d.sent) { $('hint').textContent = '✓ Envoyé'; $('hint').hidden = false; }
  $('b').classList.remove('pop'); void $('b').offsetWidth; $('b').classList.add('pop');
  fit();
  if(d.openReply)void openReply();
});
async function openReply() {
  if (!cur) return;
  const key=cur.key;
  const opened=await window.bubble.open().catch(()=>false);if(!opened||cur?.key!==key)return;
  typing = true;
  $('rep').hidden = false; $('foot').hidden = false; $('hint').hidden = true;
  setTimeout(() => $('txt').focus(), 30);
  fit();
}
function closeAll() { generation++;clearTimeout(closeTimer);typing = false; $('rep').hidden = true; $('foot').hidden = true; $('hint').hidden = false; $('hint').textContent = 'Clique pour répondre sans quitter ton jeu'; window.bubble.close(); }
$('b').addEventListener('click', (e) => { if (e.target.closest('#x')) return closeAll(); if (e.target.closest('#app')) { window.bubble.app(); return closeAll(); } if (!e.target.closest('form')) openReply(); });
$('b').addEventListener('mouseenter', () => window.bubble.hover(true));
$('b').addEventListener('mouseleave', () => window.bubble.hover(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
$('rep').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('txt').value.trim();
  if (!text||sending||!cur) return;
  const key=cur.key,session=generation;sending=true;
  $('txt').disabled = true;$('rep').querySelector('button').disabled=true;
  const r = await window.bubble.reply(text,key).catch(() => null);
  if(session!==generation||cur?.key!==key)return;sending=false;$('rep').querySelector('button').disabled=false;
  $('txt').disabled = false;
  if (!r?.ok) { $('hint').hidden = false; $('hint').textContent = `⚠ ${r?.error ?? 'Non envoyé'}`; fit(); return; }
  $('txt').value = '';
  cur.msgs = [...cur.msgs, { pseudo: 'Toi', text, me: true }];
  $('msgs').insertAdjacentHTML('beforeend', `<p class="me">${esc(text)}</p>`);
  $('hint').hidden = false; $('hint').textContent = '✓ Envoyé';
  fit();
  closeTimer=setTimeout(closeAll, 900);
});

new ResizeObserver(fit).observe($('b'));
