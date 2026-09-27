// Page du launcher : dernière version (lien direct vers l'installateur), capture 3D qui suit la souris,
// apparitions au défilement, barres animées, champ d'étoiles, consommation mesurée (mesures.json).
(() => {
  const REPO = 'zyko144/vercel-ia-';

  // Dernière version publiée : lien direct vers l'installateur .exe
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => {
      if (!rel) return;
      const exe = (rel.assets ?? []).find((a) => /\.exe$/i.test(a.name));
      const v = String(rel.tag_name ?? '').replace(/^v/, '');
      if (exe) document.querySelectorAll('.dl-link').forEach((a) => { a.href = exe.browser_download_url; });
      document.getElementById('verPill').textContent = `Version ${v} disponible`;
      if (exe) document.getElementById('dlSize').textContent = `v${v} · ${Math.round(exe.size / 1e6)} Mo`;
      const d = new Date(rel.published_at);
      document.getElementById('dlMeta').textContent = `Gratuit · Windows 10 et 11 · version ${v} du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    })
    .catch(() => {});

  // Journal des nouveautés : les 5 dernières versions publiées, avec la capture de la nouveauté
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((list) => {
      const box = document.getElementById('versions-list');
      if (!box || !Array.isArray(list)) return;
      box.innerHTML = list.filter((r) => !r.draft).map((rel) => {
        const lines = String(rel.body ?? '').split(/\r?\n/);
        const items = [];
        lines.forEach((l, i) => { if (/^# /.test(l) && i > 0) items.push({ t: l.slice(2), d: /^#|^$/.test(lines[i + 1] ?? '') ? '' : lines[i + 1] }); });
        const img = (rel.assets ?? []).find((a) => a.name === 'apercu.png');
        const v = String(rel.tag_name ?? '').replace(/^v/, '');
        return `<article class="glass vcard${img ? '' : ' noimg'}"><div><h3>Version ${esc(v)}</h3><time>${new Date(rel.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          <ul>${items.slice(0, 8).map((x) => `<li><b>${esc(x.t)}</b>${x.d ? `<span>${esc(x.d)}</span>` : ''}</li>`).join('')}</ul></div>
          ${img ? `<img src="${esc(img.browser_download_url)}" alt="Capture de la version ${esc(v)}" loading="lazy">` : ''}</article>`;
      }).join('') || '<div class="glass vcard"><p class="note">Aucune version publiée pour l’instant.</p></div>';
    })
    .catch(() => {});

  // Capture en 3D qui suit la souris
  const tilt = document.getElementById('tilt');
  if (tilt && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Une mise à jour par image affichée (pas à chaque mouvement de souris), pour rester fluide
    let pending = null;
    addEventListener('mousemove', (e) => {
      if (!pending) requestAnimationFrame(() => {
        const x = pending.clientX / innerWidth - 0.5;
        const y = pending.clientY / innerHeight - 0.5;
        tilt.style.transform = `rotateX(${10 - y * 10}deg) rotateY(${x * 14 - 4}deg) rotateZ(${x}deg)`;
        pending = null;
      });
      pending = e;
    }, { passive: true });
  }

  // Apparitions au défilement + barres du benchmark
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('in');
      en.target.querySelectorAll('[data-w]').forEach((i) => { i.style.width = `${i.dataset.w}%`; });
      io.unobserve(en.target);
    }
  }, { threshold: 0.15 });
  document.querySelectorAll('.rv').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });

  // Champ d'étoiles en profondeur (léger, s'arrête quand l'onglet est caché)
  const c = document.getElementById('stars');
  const ctx = c.getContext('2d');
  let stars = [];
  // Résolution plafonnée et moins d'étoiles : le champ d'étoiles ne doit jamais ralentir la page
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => {
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    stars = Array.from({ length: Math.min(140, Math.round(innerWidth / 10)) }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  };
  resize();
  addEventListener('resize', resize);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !still) requestAnimationFrame(frame); });
  function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2; const cy = c.height / 2;
    for (const s of stars) {
      if (!still) s.z -= 0.0012;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; }
      const px = cx + (s.x / s.z) * cx * 0.6; const py = cy + (s.y / s.z) * cy * 0.6;
      const r = (1 - s.z) * 2.2 * dpr;
      ctx.fillStyle = `rgba(${150 + (1 - s.z) * 105}, ${200 + (1 - s.z) * 55}, 255, ${(1 - s.z) * 0.9})`;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill();
    }
    if (!still && !document.hidden) requestAnimationFrame(frame);
  }
  frame();

  // Consommation : seulement des mesures réelles (fichier mesures.json), jamais de chiffres inventés
  fetch('/launcher/mesures.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
    const box = document.getElementById('conso');
    const rows = (m?.apps ?? []).filter((a) => a.ramMo > 0);
    if (!rows.length) {
      box.innerHTML = '<div class="empty">Mesures en cours sur PC Windows : le graphique s’affichera dès qu’elles seront publiées.</div>';
      return;
    }
    const max = Math.max(...rows.map((a) => a.ramMo));
    box.innerHTML = `<div class="bars">${rows.sort((a, b) => a.ramMo - b.ramMo).map((a) => `<div class="bar"><span>${a.nom}</span><div class="t"><i data-w="${(100 * a.ramMo) / max}"></i></div><em>${a.ramMo} Mo</em></div>`).join('')}</div>
      <p class="note">${m.pc ?? ''}${m.date ? ` · mesuré le ${m.date}` : ''}${rows.some((a) => a.cpu != null) ? ` · processeur au repos : ${rows.map((a) => `${a.nom} ${a.cpu} %`).join(', ')}` : ''}</p>`;
    io.observe(box.closest('.rv') ?? box);
    box.querySelectorAll('[data-w]').forEach((i) => requestAnimationFrame(() => { i.style.width = `${i.dataset.w}%`; }));
  }).catch(() => {});
})();
