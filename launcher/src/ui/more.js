// 0.54 : Mon PC › Vérifs (contrôles, revente, tests, journal), débit + DNS, fiche de jeu enrichie, collections par genre.
export function initMore(api, h) {
  const { $, esc, toast, ui, setModal, state } = h;
  const more = (n, ...a) => api.more?.(n, ...a).catch((err) => ({ error: err.message })) ?? Promise.resolve(null);
  const modal = (html, wide = false) => { setModal(...(wide ? ['wide'] : [])); $('modalBox').innerHTML = `${html}<div class="row end"><button type="button" class="btn play" data-m="1">Fermer</button></div>`; $('modal').showModal(); $('modalBox').onclick = (e) => { if (e.target.closest('[data-m]')) $('modal').close(); }; };
  const euros = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;
  let pc = null;

  async function renderChecks(force) {
    const box = $('mvChecks');
    if (!box || (box.dataset.done && !force)) return;
    box.dataset.done = '1'; box.innerHTML = '<div class="empty">Lecture de l’écran, de la RAM, du BIOS, des pilotes et des disques…</div>';
    const r = await more('checks');
    if (!r?.list) { box.innerHTML = `<div class="empty">${esc(r?.error ?? 'Lecture impossible.')}</div>`; return; }
    const warn = r.list.filter((c) => c.level === 'warn');
    box.innerHTML = `<p class="hint">${warn.length ? `${warn.length} point${warn.length > 1 ? 's' : ''} à regarder` : '✓ Tout est bon'} · ${r.list.length} vérifications</p>`
      + r.list.sort((a, b) => (a.level === 'warn' ? 0 : 1) - (b.level === 'warn' ? 0 : 1)).map((c) => `<div class="mvck ${c.level}"><span>${c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : 'i'}</span><div><b>${esc(c.title)}</b><small>${esc(c.detail)}</small></div>${c.fix === 'clean' ? '<button type="button" class="btn sm" data-view="optimisation">Nettoyer</button>' : c.fix ? `<button type="button" class="btn sm" data-pcfix="${esc(c.fix)}">Corriger</button>` : ''}</div>`).join('');
  }

  async function renderPcExtra() {
    pc = await more('pc');
    if (!pc || pc.error) return;
    const age = [pc.cpuYear && `processeur de ${pc.cpuYear}`, pc.gpuYear && `carte graphique de ${pc.gpuYear}`].filter(Boolean).join(', ');
    $('mvNumbers').innerHTML = `<dl class="mvdl">
      ${age ? `<dt>Âge</dt><dd>${esc(age)}</dd>` : ''}
      <dt>Valeur de revente</dt><dd><b>${euros(pc.resale.low)} – ${euros(pc.resale.high)}</b> <small class="hint">estimation d’occasion</small></dd>
      <dt>Alimentation conseillée</dt><dd>${pc.psu.watts} W minimum${pc.psu.gpuW ? ` <small class="hint">(carte graphique ≈ ${pc.psu.gpuW} W)</small>` : ''}</dd>
      ${pc.screen ? `<dt>Écran idéal</dt><dd>${esc(pc.screen.res)} · ${esc(pc.screen.hz)}<small class="hint">${esc(pc.screen.why)}</small></dd>` : ''}
    </dl><div class="row"><button type="button" class="btn sm" id="mvSell">💶 Mode vente</button></div>`;
    const days = Object.entries(pc.tempDays ?? {});
    const max = Math.max(90, ...days.map(([, d]) => Math.max(d.cpu ?? 0, d.gpu ?? 0)));
    $('mvTemps').innerHTML = days.length ? `<div class="mvbars">${days.map(([k, d]) => `<i title="${esc(k)} · processeur ${d.cpu ?? '–'} °C · carte graphique ${d.gpu ?? '–'} °C"><b style="height:${((d.cpu ?? 0) / max) * 100}%"></b><em style="height:${((d.gpu ?? 0) / max) * 100}%"></em></i>`).join('')}</div><p class="hint"><b class="dotc">■</b> processeur <b class="dotg">■</b> carte graphique · maximum de chaque jour</p>` : '<div class="empty">Le maximum de chaque jour s’enregistre ici pendant 30 jours.</div>';
    $('mvDust').innerHTML = `${pc.dust ? `<b class="warnc">🧹 ${pc.dust === 'hot' ? 'Ton processeur chauffe plus qu’avant : dépoussière ton PC.' : 'Ça fait 6 mois : pense à dépoussiérer.'}</b>` : `<small class="hint">Dernier dépoussiérage noté : ${pc.dustAt ? new Date(pc.dustAt).toLocaleDateString('fr-FR') : 'jamais'}. Rappel tous les 6 mois, ou plus tôt si ça chauffe.</small>`} <button type="button" class="btn ghost sm" id="mvDustDone">J’ai dépoussiéré</button>`;
    const bat = pc.battery ?? [];
    $('mvPerf').innerHTML = [
      ...(pc.perf ?? []).flatMap((p) => [['driver', 'pilote'], ['os', 'Windows']].filter(([k]) => p[k]).map(([k, l]) => `<div class="mvline"><b>${esc(p.name)}</b> <span>${l} ${esc(p[k].from)} → ${esc(p[k].to)} : ${p[k].before} → ${p[k].after} FPS</span> <em class="${p[k].delta >= 0 ? 'ok' : 'bad'}">${p[k].delta >= 0 ? '+' : ''}${p[k].delta} %</em></div>`)),
      bat.length ? `<div class="mvline"><b>🔋 Batterie</b> <span>${bat.length > 1 ? `${Math.round(bat[0].full / 1000)} → ` : ''}${Math.round(bat.at(-1).full / 1000)} Wh sur ${Math.round(bat.at(-1).design / 1000)} Wh d’origine</span></div>` : '',
    ].join('') || '<div class="empty">Après quelques parties, tu verras ici si un nouveau pilote ou une mise à jour de Windows a changé tes FPS.</div>';
  }

  async function renderJournal() {
    const list = await more('journal');
    $('mvJournal').innerHTML = Array.isArray(list) && list.length ? list.map((j) => `<div class="mvline"><b>${j.at ? new Date(j.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</b> <span>${esc(j.label)} · ${j.n} changement${j.n > 1 ? 's' : ''}</span> <button type="button" class="btn ghost sm" data-mvundo="${j.i}">Annuler celle-ci</button></div>`).join('') : '<div class="empty">Aucune optimisation à annuler.</div>';
    const re = await more('reinstall');
    $('mvReinstall').innerHTML = Array.isArray(re) && re.length ? `<p class="hint">${re.length} jeu${re.length > 1 ? 'x' : ''} installé${re.length > 1 ? 's' : ''} avant (sauvegardé${re.length > 1 ? 's' : ''} avec ton compte) et absent${re.length > 1 ? 's' : ''} de ce PC :</p>${re.slice(0, 30).map((g) => `<div class="mvline"><b>${esc(g.name)}</b> <span>${esc(g.source ?? '')}</span>${g.canInstall ? ` <button type="button" class="btn sm" data-mvinst="${esc(g.id)}">⬇ Installer</button>` : ''}</div>`).join('')}` : '<div class="empty">Rien à réinstaller : tous tes jeux sont là.</div>';
  }

  function sellMode() {
    if (!pc) return;
    modal(`<div class="mhead"><span class="micon">💶</span><h2>Mode vente</h2></div>
      <p class="mtext">Valeur estimée de ton PC d’occasion : <b>${euros(pc.resale.low)} – ${euros(pc.resale.high)}</b>.</p>
      <dl class="mvdl">${pc.resale.parts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>≈ ${euros(v)}</dd>`).join('')}</dl>
      <ul class="mlist"><li>Sauvegarde tes jeux et ta bibliothèque avec ton compte History (Paramètres › Compte).</li><li>Déconnecte-toi de Steam, Epic, Discord et de ton navigateur.</li><li>Lance « Réinitialiser ce PC » en supprimant tout : l’acheteur reçoit un Windows propre.</li><li>Joins les captures de Mon PC (composants + benchmark) à ton annonce : ça rassure.</li></ul>
      <div class="row"><button type="button" class="btn" data-pcfix="recovery">Ouvrir « Réinitialiser ce PC »</button></div>`, true);
  }

  // Taux d'interrogation de la souris : nombre réel de positions reçues par seconde pendant que tu la bouges
  function mouseTest() {
    modal(`<div class="mhead"><span class="micon">🖱</span><h2>Test de la souris</h2></div><p class="mtext">Bouge ta souris en cercles rapides dans le cadre pendant 3 secondes.</p><div class="mvpad" id="mvPad"><b id="mvHz">–</b><small>Hz mesurés</small></div>`);
    const pad = $('mvPad'); let n = 0, t0 = 0, best = 0, win = [];
    const ev = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
    const on = (e) => {
      const now = performance.now(); if (!t0) t0 = now;
      const k = e.getCoalescedEvents?.().length || 1; n += k; win.push([now, k]); win = win.filter(([t]) => now - t < 250);
      best = Math.max(best, Math.round(win.reduce((s, [, c]) => s + c, 0) * 4));
      if (now - t0 > 3000) { pad.removeEventListener(ev, on); $('mvHz').textContent = best >= 900 ? `${best} (1000 Hz ✓)` : best >= 450 ? `${best} (500 Hz)` : `${best} (125 Hz : règle-la à 1000 Hz dans son logiciel)`; }
      else $('mvHz').textContent = best;
    };
    pad.addEventListener(ev, on);
  }

  async function stress(btn) {
    if (!(await ui.confirm({ title: 'Test de stabilité (10 min)', text: 'Le processeur tourne à 100 % pendant 10 minutes pendant qu’on surveille sa température et ses performances. Idéal après un overclock, un undervolt ou un changement de pâte thermique.', ok: 'Lancer', icon: '🔥' }))) return;
    btn.disabled = true;
    const r = await more('stress', 10);
    btn.disabled = false; btn.textContent = '🔥 Test de stabilité 10 min';
    if (!r || r.error) return toast(r?.error ?? 'Test impossible');
    modal(`<div class="mhead"><span class="micon">${r.ok ? '✅' : '⚠️'}</span><h2>${r.ok ? 'PC stable' : 'À surveiller'}</h2></div><p class="mtext">Performances tenues : ${r.stability ?? '–'} % · température max du processeur : ${r.max ?? '–'} °C.</p><p class="hint">${r.ok ? 'Aucune chute de performances ni surchauffe.' : r.max >= 95 ? 'Le processeur chauffe trop : dépoussiérage, pâte thermique ou ventirad à revoir.' : 'Les performances chutent sous charge : chauffe ou overclock trop poussé.'}</p>`);
  }
  api.onMore?.((p) => { const b = $('mvStress'); if (b?.disabled) b.textContent = `🔥 ${p.pct} %${p.temp ? ` · ${p.temp} °C` : ''}`; });

  async function speed(btn) {
    btn.disabled = true; btn.textContent = 'Mesure (≈ 15 s)…';
    const r = await more('speed');
    btn.disabled = false; btn.textContent = '🚀 Mesurer mon débit';
    $('mvSpeed').innerHTML = r?.down ? `<b>⬇ ${r.down} Mb/s</b> · <b>⬆ ${r.up ?? '–'} Mb/s</b> <small class="hint">${r.down >= 100 ? 'Largement assez pour jouer et streamer.' : r.down >= 20 ? 'Suffisant pour jouer ; les téléchargements de jeux seront lents.' : 'Faible : privilégie un câble Ethernet.'}</small>` : `<span class="bad">${esc(r?.error ?? 'Mesure impossible')}</span>`;
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'mvRecheck') return renderChecks(true);
    if (t.id === 'mvSell') return sellMode();
    if (t.id === 'mvDustDone') { await more('dustDone'); toast('Noté : prochain rappel dans 6 mois'); return renderPcExtra(); }
    if (t.id === 'mvMouse') return mouseTest();
    if (t.id === 'mvStress') return stress(t);
    if (t.id === 'mvMem') { const r = await more('memtest'); if (r?.ok) toast('Test mémoire ouvert : choisis « Redémarrer maintenant »'); return; }
    if (t.id === 'mvRestore') { const r = await more('restoreClean'); if (!r?.cancelled) toast(r?.ok ? '✓ Anciens points de restauration supprimés' : 'Autorisation refusée'); return; }
    if (t.id === 'mvSpeedBtn') return speed(t);
    if (t.dataset.mvdns) { const r = await more('dns', t.dataset.mvdns); if (!r?.cancelled) toast(r?.ok ? `✓ DNS ${t.dataset.mvdns === 'auto' ? 'automatique' : t.dataset.mvdns} appliqué` : 'Autorisation refusée'); return; }
    if (t.dataset.mvundo) { const r = await more('undoOne', Number(t.dataset.mvundo)); if (r?.ok) { toast('✓ Optimisation annulée'); renderJournal(); } return; }
    if (t.dataset.mvinst) { await api.action?.(t.dataset.mvinst, 'install'); toast('Installation lancée'); }
  });

  // Réseau : débit réel + DNS en 1 clic (réversible)
  const net = document.querySelector('#view-pc .pctab[data-pctab="reseau"]');
  net?.insertAdjacentHTML('beforeend', `<div class="panel"><h3>🚀 Débit et DNS</h3><div class="row"><button class="btn" type="button" id="mvSpeedBtn">🚀 Mesurer mon débit</button></div><div id="mvSpeed" class="hint"></div>
    <p class="hint">Appliquer un DNS (demande administrateur, réversible) :</p><div class="row">${['Cloudflare', 'Google', 'Quad9', 'OpenDNS'].map((n) => `<button class="btn sm" type="button" data-mvdns="${n}">${n}</button>`).join('')}<button class="btn ghost sm" type="button" data-mvdns="auto">↩ Automatique (box)</button></div></div>`);

  // Fiche de jeu : bande-annonce, avis Steam, versions, options de lancement, fusion, FPS selon le pilote
  async function sheetMore(i) {
    const box = $('sxMore'); if (!box) return;
    const m = await more('item', i.id);
    if (!m || m.error || $('sxMore') !== box) return;
    const names = [...new Set(state.items.filter((x) => x.kind === 'game' && x.id !== i.id).map((x) => x.name))].sort();
    const fps = [['driver', 'Pilote'], ['os', 'Windows']].filter(([k]) => m.fps?.[k]).map(([k, l]) => `${l} ${esc(m.fps[k].from)} → ${esc(m.fps[k].to)} : ${m.fps[k].before} → ${m.fps[k].after} FPS (${m.fps[k].delta >= 0 ? '+' : ''}${m.fps[k].delta} %)`);
    box.innerHTML = `${m.trailer ? `<video class="sxtrailer" src="${esc(m.trailer)}" controls muted preload="none" poster="${esc(i.details?.background ?? i.art?.hero ?? '')}"></video>` : ''}
      ${m.reviews ? `<p class="fine">⭐ Avis Steam : <b>${esc(m.reviews.label)}</b> · ${m.reviews.pct} % positifs sur ${m.reviews.total.toLocaleString('fr-FR')} avis</p>` : ''}
      ${fps.length ? `<p class="fine">📈 ${fps.join(' · ')}</p>` : ''}
      ${m.versions.length ? `<details class="sxver"><summary>🕓 Versions installées (${m.versions.length})</summary>${m.versions.slice().reverse().map((v) => `<div class="mvline"><b>${esc(v.v)}</b> <span>${new Date(v.at).toLocaleDateString('fr-FR')}</span></div>`).join('')}</details>` : ''}
      <details class="sxver"><summary>⚙ Options de lancement et fusion</summary>
        <label class="fine">Options de lancement (ex. -novid -high)</label><div class="row"><input class="minput" id="sxArgs" maxlength="300" value="${esc(m.args)}" placeholder="-novid -fullscreen"><button type="button" class="btn sm" id="sxArgsSave">Enregistrer</button></div>
        <label class="fine">Même jeu qu’une autre fiche (nom différent) ? Fusionner avec :</label><div class="row"><input class="minput" id="sxMerge" list="sxMergeList" value="${esc(m.mergeWith)}" placeholder="Nom de l’autre fiche"><datalist id="sxMergeList">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist><button type="button" class="btn sm" id="sxMergeSave">Fusionner</button></div>
      </details>`;
    $('sxArgsSave').onclick = async () => { await api.setItem?.(i.id, { args: $('sxArgs').value }); toast('✓ Options enregistrées (au prochain lancement)'); };
    $('sxMergeSave').onclick = async () => { await api.setItem?.(i.id, { mergeWith: $('sxMerge').value.trim() }); toast($('sxMerge').value.trim() ? '✓ Fiches fusionnées' : 'Fusion retirée'); };
  }

  // Collections automatiques par genre (d'après la fiche Steam des jeux)
  function genreCols() {
    const m = {};
    for (const i of state.items) if (i.kind === 'game') for (const g of i.details?.genres ?? []) (m[g] ??= []).push(i.id);
    return Object.fromEntries(Object.entries(m).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([g, v]) => [`g:${g}`, { name: g, items: v, auto: true }]));
  }

  // ---------- Opti Pro : chrono d'étape, simulateur BIOS, note, carte avant / après, plan d'upgrade ----------
  const STEP_MIN = [5, 5, 20, 45, 30, 15, 20];
  let bios = null, biosTask = 'xmp', biosTimer = null;
  function proBar(s) {
    const min = Math.max(0, Math.round((Date.now() - (s.stepAt ?? Date.now())) / 60000));
    const brand = s.step === 4 && bios?.brand ? bios.brand : null;
    return `<div class="prochrono">⏱ Étape commencée il y a ${min < 1 ? 'moins d’une minute' : `${min} min`} · ≈ ${STEP_MIN[s.step] ?? 15} min en général${s.step === 4 || s.step === 3 ? ' <button type="button" class="btn sm ghost" data-bsim="1">🎬 Où cliquer dans mon BIOS</button>' : ''}</div>${brand ? biosSim() : ''}`;
  }
  function biosSim() {
    const b = bios.paths[bios.brand], path = b.tasks[biosTask];
    return `<div class="biossim b-${bios.brand}"><div class="bshead"><b>${esc(b.name)}</b><span>Entrer : <kbd>${esc(b.enter)}</kbd> au démarrage · mode avancé <kbd>${esc(b.adv)}</kbd></span></div>
      <div class="bstabs">${b.tabs.map((t) => `<span class="${path.includes(t) ? 'hit' : ''}">${esc(t)}</span>`).join('')}</div>
      <div class="bspath">${path.map((p, n) => `<div class="bsrow" style="--d:${n * 0.9}s"><i>${n + 1}</i>${esc(p)}</div>`).join('')}</div>
      <div class="row">${Object.entries(bios.tasks).map(([k, l]) => `<button type="button" class="btn sm ${k === biosTask ? 'play' : 'ghost'}" data-btask="${k}">${esc(l)}</button>`).join('')}</div>
      <small class="hint">Repères de ta marque : les noms peuvent changer un peu selon la version du BIOS. Le technicien vérifie pour ton modèle exact.</small></div>`;
  }
  async function loadBios(s) {
    const { BIOS_PATHS, BIOS_TASKS, biosBrand } = await import('../core/oc.js');
    bios = { brand: biosBrand(s.board) ?? (s.board ? null : 'msi'), paths: BIOS_PATHS, tasks: BIOS_TASKS };
    if (!bios.brand) toast('Marque de carte mère non reconnue : demande au technicien où cliquer.');
    return bios.brand;
  }
  function proEnd(s) {
    if (!s?.done) return '';
    if (!s.rating) api.more?.('proDone');
    return `<div class="emb bot proend" style="--ec:#ffc439"><div class="emba"><img src="logo.png" alt="">⭐ Ton avis</div>
      ${s.rating ? `<p>Merci pour ta note ${'⭐'.repeat(s.rating.stars)}</p>` : `<p>Note le technicien :</p><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" title="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}</div><input class="minput" id="proNote" maxlength="300" placeholder="Un mot sur ton ticket (facultatif)">`}
      <div class="row"><button type="button" class="btn play" data-procard="${s.at ?? 0}">📸 Ma carte avant / après</button><button type="button" class="btn ghost" data-proupg="1">🛒 Plan d’upgrade</button></div>
      <small class="hint">🛠 Badge « PC optimisé par History » ajouté à ton profil · suivi automatique de ton PC chaque mois.</small></div>`;
  }
  async function proCard(at) {
    const r = await more('proCard', at);
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#0d1424'); bg.addColorStop(1, '#2a1240'); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    const logo = new Image(); logo.src = 'logo.png'; await logo.decode().catch(() => {});
    if (logo.naturalWidth) g.drawImage(logo, 60, 50, 72, 72);
    g.fillStyle = '#fff'; g.font = '800 46px system-ui, sans-serif'; g.fillText('Mon PC optimisé par History', 150, 102);
    g.fillStyle = '#9fb3d9'; g.font = '500 26px system-ui, sans-serif'; g.fillText(`Opti Pro · ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`, 150, 142);
    const block = (x, title, a, b, unit) => {
      g.fillStyle = '#ffffff12'; g.beginPath(); g.roundRect(x, 210, 500, 300, 28); g.fill();
      g.fillStyle = '#9fb3d9'; g.font = '600 28px system-ui, sans-serif'; g.fillText(title, x + 36, 262);
      g.fillStyle = '#ffffff80'; g.font = '700 70px system-ui, sans-serif'; g.fillText(a ?? '–', x + 36, 380);
      g.fillStyle = '#ffc439'; g.font = '800 96px system-ui, sans-serif'; g.fillText(`→ ${b ?? '–'}`, x + 170, 390);
      g.fillStyle = '#9fb3d9'; g.font = '500 26px system-ui, sans-serif'; g.fillText(unit, x + 36, 460);
      if (a && b) { const d = Math.round(((b - a) / a) * 100); g.fillStyle = d >= 0 ? '#4ade80' : '#f87171'; g.font = '800 34px system-ui, sans-serif'; g.fillText(`${d >= 0 ? '+' : ''}${d} %`, x + 340, 460); }
    };
    block(60, 'Santé du PC', r?.before, r?.after, 'score sur 100');
    block(640, r?.fps ? `FPS · ${r.fps.name}`.slice(0, 30) : 'FPS', r?.fps?.before, r?.fps?.after, r?.fps ? 'FPS moyens mesurés' : 'Joue une partie pour mesurer');
    g.fillStyle = '#ffffff70'; g.font = '500 22px system-ui, sans-serif'; g.fillText('History Launcher · mesures réelles sur ce PC', 60, 585);
    const png = c.toDataURL('image/png');
    modal(`<div class="mhead"><span class="micon">📸</span><h2>Ta carte avant / après</h2></div><img class="procardimg" src="${png}" alt=""><div class="row"><button type="button" class="btn play" id="pcCopy">📋 Copier l’image</button><a class="btn ghost" download="history-opti-pro.png" href="${png}">💾 Enregistrer</a></div>`, true);
    $('pcCopy').onclick = () => c.toBlob((b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => toast('✓ Image copiée : colle-la sur Discord'), () => toast('Copie impossible : utilise Enregistrer')));
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-bsim], [data-btask], [data-star], [data-procard], [data-proupg]'); if (!t) return;
    if (t.dataset.bsim) { if (bios?.brand) { bios.brand = null; } else if (!(await loadBios(h.pro() ?? {}))) return; return h.redraw(); }
    if (t.dataset.btask) { biosTask = t.dataset.btask; return h.redraw(); }
    if (t.dataset.star) { const r = await api.proAct?.('rate', `${t.dataset.star}|${$('proNote')?.value ?? ''}`).catch(() => null); if (r?.session) { toast('Merci pour ta note ⭐'); h.setPro(r.session); } return; }
    if (t.dataset.procard) return proCard(Number(t.dataset.procard));
    if (t.dataset.proupg) { document.querySelector('nav [data-view="pc"], [data-view="pc"]')?.click(); setTimeout(() => document.querySelector('#pcTabs [data-pctab="upgrade"]')?.click(), 50); }
  });

  // ---------- Mon PC › Composants : chaque pièce de TON PC, une par une (rendu Blender adapté : DDR4/DDR5, RTX/Radeon/Arc, Ryzen/Intel…) ----------
  let parts = [], cur = 0, timer = 0, seen = false;
  async function pc3d() {
    const box = $('pcShow'); if (!box) return;
    const { pcParts } = await import('../core/more.js');
    parts = pcParts(state.diag ?? {});
    if (!parts.length) { box.hidden = true; return; }
    box.hidden = false; cur = Math.min(cur, parts.length - 1);
    $('psThumbs').innerHTML = parts.map((p, i) => `<button type="button" data-ps="${i}" title="${esc(p.name)}"><img src="pc3d/${p.art}.webp" alt=""><small>${esc(p.type)}</small></button>`).join('');
    show(cur, 0);
    if (!seen) { seen = true; new IntersectionObserver(([e]) => (e.isIntersecting ? auto() : clearInterval(timer))).observe(box); box.addEventListener('mouseenter', () => clearInterval(timer)); box.addEventListener('mouseleave', auto); }
  }
  function auto() { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.hidden && $('pcShow')?.offsetParent) show(cur + 1, 1); }, 5000); }
  function show(i, dir) {
    cur = (i + parts.length) % parts.length; const p = parts[cur];
    $('psStage').innerHTML = `<div class="psimg ${dir > 0 ? 'in-r' : dir < 0 ? 'in-l' : ''}"><img src="pc3d/${p.art}.webp" alt="${esc(p.type)}"></div>
      <div class="psinfo ${dir ? 'in-up' : ''}"><small class="pstype">${esc(p.type)}</small>${p.brand ? `<b class="psbrand" style="--bc:${p.brand.color}">${esc(p.brand.name)}</b>` : ''}<h3>${esc(p.name)}</h3>
      <ul>${p.specs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="row"><button type="button" class="btn sm ghost" data-psgo="${esc(p.key)}">Voir l’état détaillé ↓</button><span class="hint">${cur + 1} / ${parts.length}</span></div></div>
      <button type="button" class="psnav l" data-psd="-1" aria-label="Précédent">‹</button><button type="button" class="psnav r" data-psd="1" aria-label="Suivant">›</button>`;
    document.querySelectorAll('#psThumbs [data-ps]').forEach((b) => b.classList.toggle('on', Number(b.dataset.ps) === cur));
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ps], [data-psd], [data-psgo]'); if (!t) return;
    if (t.dataset.psd) return show(cur + Number(t.dataset.psd), Number(t.dataset.psd));
    if (t.dataset.ps) return show(Number(t.dataset.ps), Number(t.dataset.ps) >= cur ? 1 : -1);
    const k = t.dataset.psgo, card = document.querySelector(`#pcComps .ck-${CSS.escape(k)}`);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
    else toast('Pas de détail mesurable pour cette pièce : Windows ne la lit pas.');
  });

  // ---------- Outils IA (assistant) : chaque outil ouvre une fenêtre, la réponse s'affiche en dessous ----------
  const TOOLS = [['erreur', '🧯', 'Expliquer une erreur', 'text'], ['capture', '📷', 'Lire une capture', 'image'], ['reglages', '🎛', 'Réglages graphiques', 'game'], ['guide', '📖', 'Question sur un jeu', 'game text'],
    ['crash', '💥', 'Pourquoi mon jeu plante', 'game'], ['patch', '📰', 'Patch notes en 3 lignes', 'game'], ['comparer', '⚖', 'Comparer 2 composants', 'ab'], ['panne', '🩺', 'Risque de panne', ''], ['arnaque', '🛡', 'Est-ce une arnaque ?', 'text']];
  $('aipop')?.querySelector('.chips')?.insertAdjacentHTML('beforebegin', `<div class="aitools">${TOOLS.map(([k, ic, l]) => `<button type="button" data-aitool="${k}" title="${esc(l)}">${ic} ${esc(l)}</button>`).join('')}</div>`);
  const shrink = (file) => new Promise((ok) => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85)); }; im.src = r.result; }; r.readAsDataURL(file); });
  async function aiTool(k) {
    const [, ic, label, need] = TOOLS.find((t) => t[0] === k);
    const games = state.items.filter((i) => i.kind === 'game' && (i.installed || i.minutes)).sort((a, b) => b.minutes - a.minutes);
    const beginner = await more('aiBeginner');
    modal(`<div class="mhead"><span class="micon">${ic}</span><h2>${esc(label)}</h2></div>
      ${need.includes('game') ? `<select class="minput" id="atGame">${games.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select>` : ''}
      ${need.includes('text') ? `<textarea class="minput" id="atText" rows="4" maxlength="3000" placeholder="${k === 'arnaque' ? 'Colle le message reçu…' : k === 'erreur' ? 'Colle le message d’erreur…' : 'Ta question…'}"></textarea>` : ''}
      ${need === 'image' ? '<input type="file" id="atFile" accept="image/png,image/jpeg,image/webp" class="minput"><input class="minput" id="atText" maxlength="300" placeholder="Ta question (facultatif)">' : ''}
      ${need === 'ab' ? '<div class="row"><input class="minput" id="atA" maxlength="80" placeholder="RTX 4070"><input class="minput" id="atB" maxlength="80" placeholder="RX 7800 XT"></div>' : ''}
      <div class="row"><button type="button" class="btn play" id="atGo">${ic} Demander à l’IA</button><label class="toggle"><input type="checkbox" id="atBeg" ${beginner ? 'checked' : ''}><span></span>Explique-moi comme à un débutant</label></div>
      <div id="atOut" class="reporttxt rich"></div><small class="hint">L’IA se souvient de ton PC, de tes jeux et de tes dernières questions. <button type="button" class="linkbtn" id="atForget">Effacer sa mémoire</button></small>`, true);
    $('atBeg').onchange = () => more('aiBeginner', $('atBeg').checked);
    $('atForget').onclick = () => more('aiForget').then(() => toast('Mémoire de l’IA effacée'));
    $('atGo').onclick = async () => {
      const x = { game: $('atGame')?.value, text: $('atText')?.value.trim() ?? '', a: $('atA')?.value.trim(), b: $('atB')?.value.trim() };
      if (need === 'image') { const f = $('atFile').files?.[0]; if (!f) return toast('Choisis une capture d’écran'); x.image = await shrink(f); }
      if ((need.includes('text') && need !== 'game text' && !x.text) || (need === 'ab' && (!x.a || !x.b))) return toast('Remplis le champ d’abord');
      $('atGo').disabled = true; $('atOut').innerHTML = '<div class="gbar indet"><i></i></div>';
      const r = await more('ai', k, x);
      $('atGo').disabled = false;
      $('atOut').innerHTML = r?.reply ? h.rich(r.reply) : `<p class="bad">${esc(r?.error ?? 'IA injoignable.')}</p>`;
    };
  }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-aitool]'); if (t) aiTool(t.dataset.aitool); });
  // Inviter un ami à jouer à CE jeu (il le lance en 1 clic en acceptant) · offrir un jeu Steam
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-invgame], [data-gift], [data-invto]'); if (!t) return;
    const g = state.sel;
    if (t.dataset.gift && g?.steamId) { await api.action?.(g.id, 'store'); return toast('Sur la page Steam : « Ajouter au panier » puis « Acheter comme cadeau » 🎁'); }
    if (t.dataset.invto) { const r = await api.friendInvite?.(t.dataset.invto, 'invite', t.dataset.game); $('modal').close(); return toast(r?.ok ? `Invitation à jouer à ${t.dataset.game} envoyée 📨` : r?.error ?? 'Impossible'); }
    const amis = (state.hist?.amis ?? []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    if (!g) return;
    modal(`<div class="mhead"><span class="micon">📨</span><h2>Inviter à jouer à ${esc(g.name)}</h2></div><p class="mtext">En acceptant, ton ami lance ${esc(g.name)} en 1 clic (s’il l’a installé).</p>
      <div class="invlist">${amis.map((a) => `<button type="button" class="btn ${a.online ? '' : 'ghost'}" data-invto="${esc(a.id)}" data-game="${esc(g.name)}">${a.online ? '🟢' : '⚪'} ${esc(a.pseudo)}${a.playing ? ` · joue à ${esc(a.playing)}` : ''}</button>`).join('') || '<p class="hint">Ajoute des amis History dans l’onglet Amis.</p>'}</div>`);
  });

  // ---------- Coéquipiers : annonces par jeu et rang (3 h), ajout en ami avec son code ----------
  async function lfg(q = '') {
    const r = await more('lfg', q);
    const games = [...new Set(state.items.filter((i) => i.kind === 'game' && i.installed).sort((a, b) => b.minutes - a.minutes).map((i) => i.name))];
    modal(`<div class="mhead"><span class="micon">🎯</span><h2>Trouver des coéquipiers</h2></div>
      ${r?.error ? `<p class="bad">${esc(r.error)}</p>` : ''}
      <div class="lfgform">${r?.moi ? `<p class="hint">Ton annonce : <b>${esc(r.moi.jeu)}</b>${r.moi.rang ? ` · ${esc(r.moi.rang)}` : ''} (encore ${Math.max(1, Math.round((r.moi.exp - Date.now()) / 60000))} min) <button type="button" class="linkbtn" data-lfgstop="1">Retirer</button></p>` : ''}
        <div class="row"><select class="minput" id="lfgGame">${games.map((g) => `<option>${esc(g)}</option>`).join('')}</select><input class="minput" id="lfgRank" maxlength="30" placeholder="Rang (ex. Platine 2)"></div>
        <div class="row"><input class="minput" id="lfgText" maxlength="140" placeholder="Ex. ranked ce soir, micro obligatoire"><button type="button" class="btn play" data-lfgpost="1">Publier (3 h)</button></div></div>
      <div class="row"><input class="minput" id="lfgQ" value="${esc(q)}" placeholder="Filtrer par jeu"><button type="button" class="btn sm" data-lfgq="1">Chercher</button></div>
      <div class="invlist">${(r?.annonces ?? []).map((a) => `<div class="lfgrow"><div><b>${esc(a.pseudo)}</b> · ${esc(a.jeu)}${a.rang ? ` <em>${esc(a.rang)}</em>` : ''}<small>${esc(a.texte ?? '')}</small></div>${a.ami ? '<span class="hint">déjà ami</span>' : a.code ? `<button type="button" class="btn sm" data-lfgadd="${esc(a.code)}">＋ Ajouter</button>` : ''}</div>`).join('') || '<p class="hint">Aucune annonce pour l’instant : publie la tienne, les joueurs History la verront.</p>'}</div>`, true);
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('#lfgBtn, [data-lfgpost], [data-lfgstop], [data-lfgq], [data-lfgadd]'); if (!t) return;
    if (t.dataset.lfgpost) { const r = await more('lfg', '', { jeu: $('lfgGame').value, rang: $('lfgRank').value, texte: $('lfgText').value }); if (r?.error) return toast(r.error); toast('🎯 Annonce publiée pour 3 h'); return lfg(); }
    if (t.dataset.lfgstop) { await more('lfg', '', { stop: true }); return lfg(); }
    if (t.dataset.lfgq) return lfg($('lfgQ').value.trim());
    if (t.dataset.lfgadd) { const r = await api.hFriendAdd?.(t.dataset.lfgadd); return toast(r?.error ?? 'Demande d’ami envoyée'); }
    lfg();
  });

  // Premium : promo de saison, stats ambassadeur
  function premExtras(p) {
    const b = $('premPromo'); if (b) { b.hidden = !p?.promo; if (p?.promo) b.innerHTML = `🔥 <b>${esc(p.promo.label)} : −${p.promo.pct} %</b> sur tous les packs jusqu’au ${new Date(p.promo.until).toLocaleDateString('fr-FR')}`; }
    const sp = $('pgSponsor'); if (sp && p?.parrain) sp.innerHTML = `👥 ${p.parrain.filleuls} filleul${p.parrain.filleuls > 1 ? 's' : ''}${p.parrain.ambassadeur ? ' · 🏅 Ambassadeur' : ''}${p.parrain.prochain ? ` · prochain palier à ${p.parrain.prochain.a} : ${esc(p.parrain.prochain.gain)}` : ''}`;
  }

  return {
    premExtras, proBar, proEnd, pc3d,
    verifs() { renderChecks(); renderPcExtra(); renderJournal(); },
    sheetMore, genreCols,
  };
}
