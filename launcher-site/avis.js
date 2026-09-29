// Avis des joueurs en bas de page : bandeau qui défile (note, commentaire, capture) et formulaire pour noter.
// <section data-avis="launcher|clips"> ; l'adresse du serveur vient de api.json (changement d'hébergeur).
(() => {
  const box = document.querySelector('[data-avis]'); if (!box) return;
  const app = box.dataset.avis;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  let API = 'https://vercel-ia.onrender.com';
  const ready = fetch('https://zyko144.github.io/vercel-ia-/api.json').then((r) => r.json()).then((j) => { if (/^https:\/\//.test(j?.api)) API = j.api.replace(/\/+$/, ''); }).catch(() => {});
  const card = (r) => `<article class="avcard">${r.img ? `<img src="${esc(API + r.img)}" alt="" loading="lazy">` : ''}<div><b class="avst">${stars(r.stars)}</b>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}<small>${esc(r.name)} · ${new Date(r.at).toLocaleDateString('fr-FR')}</small></div></article>`;
  async function show() {
    await ready;
    const d = await fetch(`${API}/api/avis?app=${app}`).then((r) => r.json()).catch(() => null);
    box.querySelector('.avsum').innerHTML = d?.count ? `<b class="avst">${stars(Math.round(d.avg))}</b> <b>${String(d.avg).replace('.', ',')}/5</b> · ${d.count} avis` : 'Sois le premier à donner ton avis !';
    const items = d?.items ?? [];
    const row = box.querySelector('.avrow');
    row.innerHTML = items.length ? items.map(card).join('') + items.map(card).join('') : ''; // doublé : défilement sans coupure
    row.style.animationDuration = `${Math.max(20, items.length * 6)}s`;
  }
  let pick = 0;
  const pickers = box.querySelectorAll('.avpick button');
  pickers.forEach((b, i) => b.addEventListener('click', () => { pick = i + 1; pickers.forEach((x, j) => x.classList.toggle('on', j < pick)); }));
  box.querySelector('.avopen').addEventListener('click', () => { box.querySelector('.avform').hidden = false; });
  box.querySelector('.avform').addEventListener('submit', async (e) => {
    e.preventDefault(); await ready;
    const f = e.target; const msg = f.querySelector('.avmsg');
    if (!pick) { msg.textContent = 'Choisis une note.'; return; }
    const r = await fetch(`${API}/api/avis?app=${app}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stars: pick, name: f.name.value, comment: f.comment.value }) }).then((x) => x.json()).catch(() => ({ error: 'Serveur injoignable, réessaie dans une minute.' }));
    msg.textContent = r.ok ? 'Merci pour ton avis ! 🙏' : r.error;
    if (r.ok) { f.reset(); pick = 0; pickers.forEach((x) => x.classList.remove('on')); show(); }
  });
  show();
})();
