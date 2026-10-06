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
    box.dataset.done = '1'; box.innerHTML = '<div class="empty">On lit ton écran, ta RAM, ton BIOS, tes pilotes et tes disques…</div>';
    $('vfSum').innerHTML = '<b>…</b>'; $('vfTitle').textContent = 'Vérification de ton PC…';
    const r = await more('checks');
    if (!r?.list) { box.innerHTML = `<div class="empty">${esc(r?.error ?? 'Lecture impossible.')}</div>`; $('vfTitle').textContent = 'Vérifications indisponibles'; return; }
    const warn = r.list.filter((c) => c.level === 'warn'), good = r.list.filter((c) => c.level !== 'warn');
    $('vfSum').innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="100"/><circle cx="18" cy="18" r="15" pathLength="100" style="stroke-dasharray:${Math.round((good.length / r.list.length) * 100)} 100"/></svg><b>${good.length}<small>/${r.list.length}</small></b>`;
    $('vfTitle').textContent = warn.length ? `${warn.length} réglage${warn.length > 1 ? 's' : ''} à revoir` : 'Tout est bon sur ton PC 👌';
    box.innerHTML = (warn.length ? `<div class="vfcards">${warn.map((c) => `<div class="vfcard"><i>!</i><div><b>${esc(c.title)}</b><p>${esc(c.detail)}</p>${c.fix === 'clean' ? '<button type="button" class="btn sm" data-view="optimisation">Faire de la place</button>' : c.fix ? `<button type="button" class="btn sm" data-pcfix="${esc(c.fix)}">Régler maintenant</button>` : ''}</div></div>`).join('')}</div>` : '')
      + `<div class="vfok"><small>Déjà en ordre</small>${good.map((c) => `<span class="vfchip ${c.level}" title="${esc(c.detail)}">${c.level === 'ok' ? '✓' : 'i'} ${esc(c.title)}</span>`).join('')}</div>`;
  }

  async function renderPcExtra() {
    pc = await more('pc');
    if (!pc || pc.error) return;
    const age = [pc.cpuYear && `processeur de ${pc.cpuYear}`, pc.gpuYear && `carte graphique de ${pc.gpuYear}`].filter(Boolean).join(', ');
    const top = Math.max(1, ...pc.resale.parts.map((p) => p.price));
    $('mvNumbers').innerHTML = `<div class="vfval"><small>Prix de revente estimé</small><b>${euros(pc.resale.total)}</b><span>entre ${euros(pc.resale.low)} et ${euros(pc.resale.high)} selon l’état</span></div>
      <div class="vfparts">${pc.resale.parts.map((p) => `<div class="vfpart"><em>${esc(p.type)}</em><b>${esc(p.name)}</b><strong>${euros(p.price)}</strong><i style="--w:${Math.round((p.price / top) * 100)}%"></i></div>`).join('')}</div>
      <p class="hint">Prix moyens de l’occasion, pièce par pièce. Boîte d’origine et garantie font monter le prix.</p>
      <div class="vftiles">${age ? `<div><small>Âge</small><b>${esc(age)}</b></div>` : ''}<div><small>Alimentation conseillée</small><b>${pc.psu.watts} W minimum</b>${pc.psu.gpuW ? `<span>dont ≈ ${pc.psu.gpuW} W pour la carte graphique</span>` : ''}</div>${pc.screen ? `<div><small>Écran idéal</small><b>${esc(pc.screen.res)} · ${esc(pc.screen.hz)}</b><span>${esc(pc.screen.why)}</span></div>` : ''}</div>
      <div class="row"><button type="button" class="btn" id="mvSell">Préparer la vente</button></div>`;
    const days = Object.entries(pc.tempDays ?? {});
    const max = Math.max(90, ...days.map(([, d]) => Math.max(d.cpu ?? 0, d.gpu ?? 0)));
    $('mvTemps').innerHTML = days.length ? `<div class="mvbars">${days.map(([k, d]) => `<i title="${esc(k)} · processeur ${d.cpu ?? '–'} °C · carte graphique ${d.gpu ?? '–'} °C"><b style="height:${((d.cpu ?? 0) / max) * 100}%"></b><em style="height:${((d.gpu ?? 0) / max) * 100}%"></em></i>`).join('')}</div><p class="hint"><b class="dotc">■</b> processeur <b class="dotg">■</b> carte graphique · maximum de chaque jour</p>` : '<div class="empty">Le maximum de chaque jour s’enregistre ici pendant 30 jours.</div>';
    $('mvDust').innerHTML = `${pc.dust ? `<b class="warnc">🧹 ${pc.dust === 'hot' ? 'Ton processeur chauffe plus qu’avant : dépoussière ton PC.' : 'Ça fait 6 mois : pense à dépoussiérer.'}</b>` : `<small class="hint">Dernier dépoussiérage noté : ${pc.dustAt ? new Date(pc.dustAt).toLocaleDateString('fr-FR') : 'jamais'}. Rappel tous les 6 mois, ou plus tôt si ça chauffe.</small>`} <button type="button" class="btn ghost sm" id="mvDustDone">J’ai dépoussiéré</button>`;
    const bat = pc.battery ?? [];
    $('mvPerf').innerHTML = [
      ...(pc.perf ?? []).flatMap((p) => [['driver', 'pilote'], ['os', 'Windows']].filter(([k]) => p[k]).map(([k, l]) => `<div class="mvline"><b>${esc(p.name)}</b> <span>${l} ${esc(p[k].from)} → ${esc(p[k].to)} : ${p[k].before} → ${p[k].after} FPS</span> <em class="${p[k].delta >= 0 ? 'ok' : 'bad'}">${p[k].delta >= 0 ? '+' : ''}${p[k].delta} %</em></div>`)),
      bat.length ? `<div class="mvline"><b>Batterie</b> <span>${bat.length > 1 ? `${Math.round(bat[0].full / 1000)} → ` : ''}${Math.round(bat.at(-1).full / 1000)} Wh sur ${Math.round(bat.at(-1).design / 1000)} Wh d’origine</span></div>` : '',
    ].join('') || '<div class="empty">Après quelques parties, tu verras ici si un nouveau pilote ou une mise à jour de Windows a changé tes FPS.</div>';
  }

  async function renderJournal() {
    const list = await more('journal');
    $('mvJournal').innerHTML = Array.isArray(list) && list.length ? list.map((j) => `<div class="mvline"><b>${j.at ? new Date(j.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</b> <span>${esc(j.label)} · ${j.n} changement${j.n > 1 ? 's' : ''}</span> <button type="button" class="btn ghost sm" data-mvundo="${j.i}">Annuler celle-ci</button></div>`).join('') : '<div class="empty">Aucune optimisation à annuler.</div>';
    const re = await more('reinstall');
    $('mvReinstall').innerHTML = Array.isArray(re) && re.length ? `<p class="hint">${re.length} jeu${re.length > 1 ? 'x' : ''} installé${re.length > 1 ? 's' : ''} avant (sauvegardé${re.length > 1 ? 's' : ''} avec ton compte) et absent${re.length > 1 ? 's' : ''} de ce PC :</p>${re.slice(0, 30).map((g) => `<div class="mvline"><b>${esc(g.name)}</b> <span>${esc(g.source ?? '')}</span>${g.canInstall ? ` <button type="button" class="btn sm" data-mvinst="${esc(g.id)}">Installer</button>` : ''}</div>`).join('')}` : '<div class="empty">Rien à réinstaller : tous tes jeux sont là.</div>';
  }

  function sellMode() {
    if (!pc) return;
    const r = pc.resale, main = r.parts.filter((p) => p.type !== 'Le reste (estimé)');
    const ad = `PC gamer · ${main.map((p) => p.name).join(' · ')}\n\nPrix : ${euros(Math.round(r.total / 10) * 10)} (à débattre)\nWindows réinstallé propre, testé et nettoyé. Captures des performances sur demande.`;
    const steps = [['☁️', 'Sauvegarde ta bibliothèque', 'Paramètres › Compte : tes jeux, temps de jeu et réglages te suivent sur ton prochain PC.'], ['🔑', 'Déconnecte tes comptes', 'Steam, Epic, Discord, navigateur et mots de passe enregistrés.'], ['🧹', 'Réinitialise Windows', '« Supprimer tout » : l’acheteur reçoit un Windows propre, sans tes fichiers.'], ['📸', 'Montre les performances', 'Captures de Mon PC (composants + benchmark) dans l’annonce : ça rassure.']];
    modal(`<div class="sell"><div class="sellhead"><div><small>Prix conseillé</small><b>${euros(r.total)}</b><span>fourchette ${euros(r.low)} – ${euros(r.high)} selon l’état</span></div><span class="sellico">💶</span><button type="button" class="sellx" data-m="1" aria-label="Fermer">✕</button></div>
      <div class="sellgrid"><section><h3>Ton annonce, prête à coller</h3><pre id="sellAd">${esc(ad)}</pre><button type="button" class="btn" id="sellCopy">Copier l’annonce</button>
        <h3>Prix pièce par pièce</h3><div class="sellparts">${r.parts.map((p) => `<div><span>${esc(p.type)}</span><b>${esc(p.name)}</b><em>${euros(p.price)}</em></div>`).join('')}</div></section>
      <section><h3>Avant de vendre</h3><ol class="sellsteps">${steps.map(([i, t, d]) => `<li><i>${i}</i><div><b>${t}</b><small>${d}</small></div></li>`).join('')}</ol>
        <button type="button" class="btn play" data-pcfix="recovery">Ouvrir « Réinitialiser ce PC »</button></section></div>
      <div class="row end"><button type="button" class="btn ghost" data-m="1">Fermer</button></div></div>`, true);
    $('modalBox').classList.add('sellbox'); $('modalBox').querySelector(':scope > .row.end')?.remove();
    $('sellCopy').onclick = () => (api.copy ? api.copy(ad) : navigator.clipboard.writeText(ad)).then(() => toast('✓ Annonce copiée'), () => toast('Copie impossible'));
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
    btn.disabled = false; btn.querySelector('b').textContent = 'Stabilité';
    if (!r || r.error) return toast(r?.error ?? 'Test impossible');
    modal(`<div class="mhead"><span class="micon">${r.ok ? '✅' : '⚠️'}</span><h2>${r.ok ? 'PC stable' : 'À surveiller'}</h2></div><p class="mtext">Performances tenues : ${r.stability ?? '–'} % · température max du processeur : ${r.max ?? '–'} °C.</p><p class="hint">${r.ok ? 'Aucune chute de performances ni surchauffe.' : r.max >= 95 ? 'Le processeur chauffe trop : dépoussiérage, pâte thermique ou ventirad à revoir.' : 'Les performances chutent sous charge : chauffe ou overclock trop poussé.'}</p>`);
  }
  api.onMore?.((p) => { const b = $('mvStress'); if (b?.disabled) b.querySelector('b').textContent = `${p.pct} %${p.temp ? ` · ${p.temp} °C` : ''}`; });

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
  net?.insertAdjacentHTML('beforeend', `<div class="panel"><h3>Débit et DNS</h3><div class="row"><button class="btn" type="button" id="mvSpeedBtn">Mesurer mon débit</button></div><div id="mvSpeed" class="hint"></div>
    <p class="hint">Appliquer un DNS (demande administrateur, réversible) :</p><div class="row">${['Cloudflare', 'Google', 'Quad9', 'OpenDNS'].map((n) => `<button class="btn sm" type="button" data-mvdns="${n}">${n}</button>`).join('')}<button class="btn ghost sm" type="button" data-mvdns="auto">Automatique (box)</button></div></div>`);

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
      ${m.versions.length ? `<details class="sxver"><summary>Versions installées (${m.versions.length})</summary>${m.versions.slice().reverse().map((v) => `<div class="mvline"><b>${esc(v.v)}</b> <span>${new Date(v.at).toLocaleDateString('fr-FR')}</span></div>`).join('')}</details>` : ''}
      <details class="sxver"><summary>Options de lancement et fusion</summary>
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
    return `<div class="prochrono">⏱ Étape commencée il y a ${min < 1 ? 'moins d’une minute' : `${min} min`} · ≈ ${STEP_MIN[s.step] ?? 15} min en général${s.step === 4 || s.step === 3 ? ' <button type="button" class="btn sm ghost" data-bsim="1">Où cliquer dans mon BIOS</button>' : ''}</div>${brand ? biosSim() : ''}`;
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
  let rateAsked = 0;
  function proEnd(s) {
    if (!s?.done) return '';
    if (!s.rating) { api.more?.('proDone'); if (rateAsked !== s.id) { rateAsked = s.id; setTimeout(() => rateDialog(s), 400); } }
    return `<div class="proend"><div class="proendhead"><span>🚀</span><div><h3>Ton PC est prêt</h3><p>Opti Pro terminée${s.closedAt ? ` le ${new Date(s.closedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}${s.rating ? ` · ta note ${'★'.repeat(s.rating.stars)}` : ''}</p></div></div>
      <div class="proendacts">
        <button type="button" data-procard="${s.at ?? 0}"><i>📸</i><b>Ma carte avant / après</b><small>À partager sur Discord</small></button>
        <button type="button" data-proupg="1"><i>🛒</i><b>Plan d’upgrade</b><small>Ce qui ferait gagner le plus</small></button>
        <button type="button" data-proredo="1"><i>🔁</i><b>Refaire l’Opti Pro</b><small>Sans refaire ce qui est déjà validé</small></button>
        ${s.rating ? '' : '<button type="button" data-prorate="1"><i>⭐</i><b>Noter le technicien</b><small>30 secondes, ça nous aide</small></button>'}
      </div>
      <small class="hint">Badge « PC optimisé par History » ajouté à ton profil · suivi automatique de ton PC chaque mois.</small></div>`;
  }
  function rateDialog(s) {
    if ($('modal').open) return;
    const LBL = ['Touche une étoile', 'Décevant', 'Peut mieux faire', 'Correct', 'Très bien', 'Excellent !'];
    modal(`<div class="rate"><img src="logo.png" alt=""><h2>Ton PC est prêt 🚀</h2><p>Comment s’est passée ton Opti Pro ?</p>
      <div class="ratestars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-rs="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}</div><b class="ratelbl" id="rateLbl">${LBL[0]}</b>
      <textarea class="minput" id="rateNote" maxlength="300" rows="3" placeholder="Un mot pour le technicien (facultatif)"></textarea>
      <div class="row"><button type="button" class="btn ghost" data-m="1">Plus tard</button><button type="button" class="btn play" id="rateSend" disabled>Envoyer ma note</button></div></div>`);
    $('modalBox').classList.add('ratebox'); $('modalBox').querySelector(':scope > .row.end')?.remove();
    let n = 0; const stars = [...$('modalBox').querySelectorAll('[data-rs]')];
    const paint = (k) => stars.forEach((b, i) => b.classList.toggle('on', i < k));
    stars.forEach((b) => { b.onmouseenter = () => paint(+b.dataset.rs); b.onclick = () => { n = +b.dataset.rs; $('rateLbl').textContent = LBL[n]; $('rateSend').disabled = false; paint(n); }; });
    $('modalBox').querySelector('.ratestars').onmouseleave = () => paint(n);
    $('rateSend').onclick = async () => {
      $('rateSend').disabled = true;
      const r = await api.proAct?.('rate', `${n}|${$('rateNote').value}`).catch(() => null);
      if (!r?.session) { $('rateSend').disabled = false; return toast(r?.error ?? 'Envoi impossible, réessaie.'); }
      $('modal').close(); toast('Merci pour ta note ⭐'); h.setPro(r.session);
    };
  }
  async function proCard(at) {
    toast('Nouvelle mesure de ton PC…');
    const r = await more('proCard', at);
    const W = 1200, H = 630, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
    const F = (w, px) => { g.font = `${w} ${px}px "Segoe UI", system-ui, sans-serif`; };
    const txt = (t, x, y, col, w, px, al = 'left') => { F(w, px); g.fillStyle = col; g.textAlign = al; g.fillText(t, x, y); };
    const box = (x, y, w, hh, rad, fill) => { g.beginPath(); g.roundRect(x, y, w, hh, rad); g.fillStyle = fill; g.fill(); };
    g.fillStyle = '#0a0b10'; g.fillRect(0, 0, W, H);
    for (const [x, y, rr, col] of [[120, 0, 520, '#ff7a1a40'], [1150, 640, 560, '#7b3cff33']]) { const rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, col); rg.addColorStop(1, '#0000'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    g.strokeStyle = '#ffffff14'; g.lineWidth = 2; g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, 28); g.stroke();
    const logo = new Image(); logo.src = 'logo.png'; await logo.decode().catch(() => {});
    if (logo.naturalWidth) g.drawImage(logo, 56, 48, 64, 64);
    txt('PC optimisé par History', 138, 92, '#fff', 800, 40);
    txt(`Opti Pro · ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`, 140, 122, '#ffffff8c', 500, 22);
    box(W - 236, 58, 180, 46, 23, '#ff7a1a26'); txt('✓ OPTIMISÉ', W - 146, 89, '#ff9a3d', 800, 20, 'center');
    const delta = (a, b, pts) => {
      if (a == null || b == null) return ['', '#ffffff8c'];
      const d = pts ? b - a : Math.round(((b - a) / a) * 100);
      return d > 0 ? [`+${d}${pts ? ' points' : ' %'}`, '#4ade80'] : d < 0 ? [`${d}${pts ? ' points' : ' %'}`, '#f87171'] : ['Stable', '#ffffff8c'];
    };
    const pill = (x, [t, col]) => { if (!t) return; F(800, 20); const w = g.measureText(t).width + 32; box(x - w, 180, w, 38, 19, `${col}22`); txt(t, x - w / 2, 206, col, 800, 20, 'center'); };
    // Bloc santé : deux anneaux avant → après
    box(56, 160, 520, 360, 26, '#ffffff0b');
    txt('SANTÉ DU PC', 88, 206, '#ffffff8c', 700, 18);
    const ring = (cx, cy, rad, v, col, lw, label, big) => {
      g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = '#ffffff14'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      if (v != null) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * v) / 100); g.stroke(); }
      txt(v ?? '–', cx, cy + big * 0.35, big > 50 ? '#fff' : '#ffffffb0', 800, big, 'center');
      txt(label, cx, cy + rad + 40, '#ffffff8c', 600, 18, 'center');
    };
    ring(170, 350, 62, r?.before, '#ffffff55', 12, 'AVANT', 40);
    txt('→', 300, 366, '#ff9a3d', 700, 44, 'center');
    ring(440, 340, 92, r?.after, '#ff8a2a', 16, 'APRÈS', 64);
    pill(544, delta(r?.before, r?.after, true));
    // Bloc FPS : deux barres
    box(624, 160, 520, 360, 26, '#ffffff0b');
    txt(r?.fps ? `FPS · ${r.fps.name}`.slice(0, 28).toUpperCase() : 'FPS EN JEU', 656, 206, '#ffffff8c', 700, 18);
    if (r?.fps) {
      const max = Math.max(r.fps.before, r.fps.after) || 1;
      const bar = (y, label, v, fill) => {
        txt(label, 656, y - 14, '#ffffff8c', 600, 18);
        box(656, y, 456, 54, 14, '#ffffff10'); box(656, y, Math.max(60, (456 * v) / max), 54, 14, fill);
        txt(`${v} FPS`, 674, y + 37, '#fff', 800, 26);
      };
      const og = g.createLinearGradient(656, 0, 1112, 0); og.addColorStop(0, '#ff6a00'); og.addColorStop(1, '#ffb347');
      bar(300, 'AVANT', r.fps.before, '#ffffff30'); bar(420, 'APRÈS', r.fps.after, og);
      pill(1112, delta(r.fps.before, r.fps.after));
    } else txt('Joue une partie pour mesurer tes FPS', 656, 350, '#ffffff8c', 500, 22);
    txt('Mesures réelles sur ce PC · History Launcher', 56, 584, '#ffffff66', 500, 20);
    const png = c.toDataURL('image/png');
    modal(`<div class="mhead"><span class="micon">📸</span><h2>Ta carte avant / après</h2></div><img class="procardimg" src="${png}" alt="Carte avant / après de ton optimisation"><div class="procardbar"><small class="hint">Partage-la sur Discord : copie puis colle dans un salon.</small><button type="button" class="btn ghost" data-m="1">Fermer</button><button type="button" class="btn ghost" id="pcSave">Enregistrer</button><button type="button" class="btn play" id="pcCopy">Copier l’image</button></div>`, true);
    $('modalBox').classList.add('procardbox'); $('modalBox').querySelector(':scope > .row.end')?.remove();
    $('pcSave').onclick = () => Object.assign(document.createElement('a'), { href: png, download: 'history-opti-pro.png' }).click();
    $('pcCopy').onclick = () => (api.copyImage ? api.copyImage(png) : new Promise((ok, ko) => c.toBlob((b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(ok, ko)))).then(() => toast('✓ Image copiée : colle-la sur Discord'), () => toast('Copie impossible : utilise Enregistrer'));
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-bsim], [data-btask], [data-star], [data-procard], [data-proupg], [data-proredo], [data-prorate]'); if (!t) return;
    if (t.dataset.prorate) return rateDialog(h.pro() ?? {});
    if (t.dataset.proredo) {
      if (!(await ui.confirm({ title: 'Refaire l’Opti Pro ?', text: 'Un nouveau ticket s’ouvre avec seulement ce qui reste à faire : ce que tu as déjà validé n’apparaît plus, et rien n’est remis à zéro sur ton PC. Pas de clé USB ni de formatage cette fois.', ok: '🔁 Refaire', icon: '🔁' }))) return;
      t.disabled = true; const r = await api.proStart?.({ need: 'Refaire l’Opti Pro (suite de ma précédente)', cooling: '', redo: true }).catch(() => null); t.disabled = false;
      if (!r?.session) return toast(r?.error === 'login' ? 'Connecte-toi à ton compte History.' : r?.error === 'premium' ? 'L’Opti Pro est réservée au Pack Premium.' : r?.error ?? 'Serveur injoignable.');
      toast('🔁 Nouveau ticket ouvert'); return h.setPro(r.session);
    }
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
  // Un seul bouton « Outils » dans l'assistant : il ouvre une grille simple (plus de barre qui défile)
  $('aipop')?.querySelector('.panel-head .fold')?.insertAdjacentHTML('beforebegin', '<button type="button" class="aitoolsbtn" data-aitools="1" title="Outils IA">Outils</button>');
  const TOOL_DESC = { erreur: 'Colle un message d’erreur', capture: 'Une capture d’écran à lire', reglages: 'Les meilleurs réglages pour ton PC', guide: 'Une question sur un jeu', crash: 'Trouver la cause d’un plantage', patch: 'Les nouveautés résumées', comparer: 'Deux composants face à face', panne: 'L’état de santé de ton PC', arnaque: 'Vérifier un message louche' };
  const TOOL_GROUPS = [['🛠', 'Dépannage', ['erreur', 'crash', 'capture', 'panne']], ['🎮', 'Tes jeux', ['reglages', 'guide', 'patch']], ['🛡', 'Achat et sécurité', ['comparer', 'arnaque']]];
  function toolsGrid() {
    modal(`<div class="aitools2"><div class="aithead"><span>🧰</span><div><h2>Outils IA</h2><p>Choisis ce dont tu as besoin : l’IA répond pour ton PC et tes jeux.</p></div><button type="button" class="sellx" data-m="1" aria-label="Fermer">✕</button></div>
      ${TOOL_GROUPS.map(([gi, gl, ks]) => `<section><h3>${gi} ${gl}</h3><div class="aigrid">${ks.map((k) => TOOLS.find((t) => t[0] === k)).filter(Boolean).map(([k, ic, l]) => `<button type="button" data-aitool="${k}"><span>${ic}</span><div><b>${esc(l)}</b><small>${esc(TOOL_DESC[k])}</small></div><i>›</i></button>`).join('')}</div></section>`).join('')}</div>`, true);
    $('modalBox').classList.add('procardbox'); $('modalBox').querySelector(':scope > .row.end')?.remove();
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-aitools]')) toolsGrid(); });
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

  // Statistiques avancées + ce que Premium t'a apporté (vue Statistiques)
  async function renderAdv() {
    const box = $('advStats'); if (!box) return;
    const r = await more('stats'); if (!r?.adv) return;
    const p = h.prem?.() ?? {}, a = r.adv, g = r.gains ?? {}, D = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], max = Math.max(1, ...a.byDay);
    const locked = !(p.ia || p.opti);
    box.innerHTML = `<div class="panel ${locked ? 'advlock' : ''}"><h3>Statistiques avancées ${locked ? '<small class="hint">Premium</small>' : ''}</h3>
      <div class="advgrid"><div><small>Jour préféré</small><b>${D[a.topDay]}</b></div><div><small>Heure de pointe</small><b>${a.topHour} h</b></div><div><small>Session moyenne</small><b>${a.avg} min</b></div><div><small>Record</small><b>${a.longest ? `${Math.round(a.longest.minutes / 6) / 10} h` : '–'}</b><em>${esc(a.longest?.name ?? '')}</em></div><div><small>30 derniers jours</small><b>${a.month} h</b><em class="${a.trend >= 0 ? 'ok' : 'bad'}">${a.trend == null ? '' : `${a.trend >= 0 ? '+' : ''}${a.trend} %`}</em></div></div>
      <div class="advbars">${a.byDay.map((m, i) => `<i title="${D[i]} · ${Math.round(m / 60)} h"><b style="height:${(m / max) * 100}%"></b><small>${D[i][0].toUpperCase()}</small></i>`).join('')}</div>
      ${locked ? '<div class="advcta"><button type="button" class="btn premgo" data-view="premium">Débloquer avec ⭐ Premium</button></div>' : ''}</div>
      ${locked ? '' : `<div class="panel"><h3>Ce que Premium t’a apporté</h3><div class="advgrid"><div><small>Questions à l’IA</small><b>${g.ia ?? 0}</b></div><div><small>Optimisations</small><b>${g.optis ?? 0}</b></div><div><small>Place libérée</small><b>${((g.freed ?? 0) / 1e9).toFixed(1).replace('.', ',')} Go</b></div><div><small>Opti Pro</small><b>${g.pro ? '✓ PC optimisé' : '–'}</b></div></div></div>`}`;
  }
  document.querySelector('#view-stats')?.insertAdjacentHTML('beforeend', '<div id="advStats"></div>');

  // ---------- Confort : mode clair, daltoniens, animations réduites, langue, packs de sons, économiseur, focus, annuler ----------
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(`h.${k}`); localStorage.setItem(`h.${k}`, v); } catch { return null; } return v; };
  const root = document.documentElement;
  const applyPrefs = () => {
    root.dataset.mode = pref('light') === '1' ? 'light' : ''; root.dataset.cb = pref('cb') ?? ''; root.classList.toggle('lessmotion', pref('motion') === '0');
    window.sfx?.set({ pack: pref('pack') || 'verre' }); translate(pref('lang') || 'fr');
  };
  for (const [id, k, on] of [['lightMode', 'light', '1'], ['lessMotion', 'motion', '0'], ['saver', 'saver', '1']]) { const el = $(id); if (!el) continue; el.checked = pref(k) === on; el.addEventListener('change', () => { pref(k, el.checked ? on : ''); applyPrefs(); }); }
  for (const [id, k, d] of [['cbMode', 'cb', ''], ['langSel', 'lang', 'fr'], ['sfxPack', 'pack', 'verre']]) { const el = $(id); if (!el) continue; el.value = pref(k) ?? d; el.addEventListener('change', () => { pref(k, el.value); applyPrefs(); if (k === 'pack') window.sfx?.play('success'); }); }
  // Anglais complet : tout texte affiché (y compris ce qui apparaît ensuite) est traduit ; les nombres sont gardés à part.
  // Les traductions viennent du serveur (une seule fois pour tout le monde) et restent en mémoire sur ce PC.
  const EN = { Accueil: 'Home', Jeux: 'Games', Favoris: 'Favorites', Classement: 'Leaderboard', Amis: 'Friends', 'Mon PC': 'My PC', Optimisation: 'Optimization', Paramètres: 'Settings', Jouer: 'Play', Installer: 'Install', Ouvrir: 'Open' };
  let dict = {}; try { dict = { ...JSON.parse(localStorage.getItem('h.i18n.en') ?? '{}'), ...EN }; } catch { dict = { ...EN }; }
  const orig = new WeakMap(), pending = new Set();
  let lang = 'fr', trTimer = null, observer = null;
  const SKIP = 'script, style, textarea, input, code, kbd, [translate="no"], .chatlog, .msgs, .bubble, .fchat, .ctxhead';
  const keyOf = (t) => { const nums = []; return { key: t.replace(/\d+(?:[.,  ]\d+)*/g, (n) => `{${nums.push(n) - 1}}`), nums }; };
  const fill = (t, nums) => t.replace(/\{(\d+)\}/g, (m, i) => nums[i] ?? m);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function tr(text) { const t = text.trim(); if (!/\p{L}/u.test(t)) return null; const { key, nums } = keyOf(t); if (dict[key] != null) return text.replace(t, fill(dict[key], nums)); pending.add(key); return null; }
  function walk(el) {
    if (el.nodeType === 3) { if (el.parentElement?.closest(SKIP)) return; const src = orig.get(el) ?? el.nodeValue; const out = tr(src); if (out != null && out !== el.nodeValue) { orig.set(el, src); el.nodeValue = out; } return; }
    if (el.nodeType !== 1 || el.closest('[translate="no"]')) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (!v) continue; const src = el.dataset[`i18n${a.replace('-', '')}`] ?? v; const out = tr(src); if (out != null && out !== v) { el.dataset[`i18n${a.replace('-', '')}`] = src; el.setAttribute(a, out); } }
    if (!el.matches(SKIP)) for (const n of el.childNodes) walk(n);
  }
  async function flush() {
    trTimer = null; if (lang !== 'en' || !pending.size) return;
    const batch = [...pending].slice(0, 60); batch.forEach((k) => pending.delete(k));
    const r = await more('translate', batch); if (!r?.en) return;
    Object.assign(dict, r.en); try { localStorage.setItem('h.i18n.en', JSON.stringify(dict)); } catch { /* plein */ }
    walk(document.body); if (pending.size) trTimer = setTimeout(flush, 300);
  }
  const queue = () => { if (lang === 'en' && pending.size && !trTimer) trTimer = setTimeout(flush, 400); };
  function translate(l) {
    lang = l; root.lang = l;
    if (l === 'en') {
      walk(document.body); queue();
      observer ??= new MutationObserver((ms) => { if (lang !== 'en') return; for (const m of ms) { if (m.type === 'characterData') { if (!orig.has(m.target) || m.target.nodeValue !== tr(orig.get(m.target))) { orig.delete(m.target); walk(m.target); } } else m.addedNodes.forEach(walk); } queue(); });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else if (observer) {
      observer.disconnect(); observer = null;
      const back = (el) => { if (el.nodeType === 3) { if (orig.has(el)) { el.nodeValue = orig.get(el); orig.delete(el); } return; } if (el.nodeType !== 1) return; for (const a of ATTRS) { const k = `i18n${a.replace('-', '')}`; if (el.dataset?.[k]) { el.setAttribute(a, el.dataset[k]); delete el.dataset[k]; } } el.childNodes.forEach(back); };
      back(document.body);
    }
  }
  applyPrefs();
  // Mode focus (Ctrl+Maj+F) : menu et décor masqués, seulement le contenu
  document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { root.classList.toggle('focusmode'); toast(root.classList.contains('focusmode') ? '🎯 Mode focus (Ctrl+Maj+F pour quitter)' : 'Mode focus désactivé'); } });
  // Annuler la dernière action (favori, masquer, options, fusion) : Ctrl+Z ou le bouton du message
  let undo = null;
  if (api.setItem) { const set = api.setItem; api.setItem = async (id, patch) => { const it = state.items.find((i) => i.id === id); if (it) undo = { id, patch: Object.fromEntries(Object.keys(patch).map((k) => [k, it[k] ?? (k === 'favorite' || k === 'hidden' ? false : '')])) }; return set(id, patch); }; }
  document.addEventListener('keydown', async (e) => { if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z' && undo && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) { const u = undo; undo = null; await api.setItem(u.id, u.patch); undo = null; const it = state.items.find((i) => i.id === u.id); if (it) Object.assign(it, u.patch); toast('↩ Action annulée'); } });
  // Économiseur d'écran : après 10 min sans rien toucher (appli au premier plan), défilé des images de tes jeux ; un geste le ferme
  let idle = 0, saverEl = null;
  const wake = () => { idle = Date.now(); if (saverEl) { saverEl.remove(); saverEl = null; } };
  ['pointermove', 'keydown', 'wheel', 'pointerdown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
  wake();
  setInterval(() => {
    if (saverEl || pref('saver') !== '1' || document.hidden || Date.now() - idle < 600_000) return;
    const arts = state.items.filter((i) => i.kind === 'game' && (i.art?.hero || i.art?.header)).map((i) => [i.name, i.art.hero ?? i.art.header]); if (!arts.length) return;
    saverEl = document.createElement('div'); saverEl.className = 'saver'; document.body.append(saverEl);
    let k = 0; const show = () => { if (!saverEl) return; const [n, a] = arts[k++ % arts.length]; saverEl.innerHTML = `<div class="svimg" style="background-image:url('${String(a).replace(/["'\\\n<>]/g, '')}')"></div><b>${esc(n)}</b><small>${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>`; setTimeout(show, 8000); };
    show();
  }, 30_000);
  // Bande-annonce en fond du jeu sélectionné (option « Fond de l’appli ») : muette, en pause quand l'appli est cachée
  function heroTrailer(i, el) {
    if ($('bgMode')?.value !== 'trailer' || !i.details?.trailer || pref('motion') === '0') return;
    el.insertAdjacentHTML('beforeend', `<video class="htrailer" src="${esc(i.details.trailer)}" autoplay muted loop playsinline preload="auto"></video>`);
    const v = el.querySelector('.htrailer'); v.onerror = () => v.remove();
  }
  document.addEventListener('visibilitychange', () => document.querySelectorAll('.htrailer').forEach((v) => (document.hidden ? v.pause() : v.play().catch(() => {}))));

  // ---------- Accueil guidé (1re ouverture), astuce du jour, saisons, récap de l'année ----------
  const TIPS = ['Ctrl+K ouvre la recherche rapide : jeux, pages, réglages.', 'Clic droit sur un jeu : options de lancement, fusion de fiches, invitation d’un ami.', 'Mon PC › Vérifs repère un écran bridé en 60 Hz ou une RAM sans XMP en 10 secondes.', 'Ctrl+Alt+P affiche les FPS en jeu.', 'F7 dans History Clips pose un marqueur sur ton action du moment.', 'Ctrl+Z annule ta dernière action (favori, masquer, fusion).', 'Ctrl+Maj+F : mode focus, seulement le contenu.', 'Le filtre « Jamais lancés » de la bibliothèque montre les jeux qui t’attendent.', '« Hey History, lance Fortnite » marche aussi à la voix (History IA).', 'Ton code ami offre −20 % à un ami et 7 jours de Premium pour toi.'];
  const today = new Date(), dayN = Math.floor(today / 86400000), M = today.getMonth() + 1, D = today.getDate();
  function homeCards() {
    const home = document.querySelector('#view-accueil'); if (!home || $('homeExtras')) return;
    const cards = [];
    if (pref('tip') !== String(dayN)) cards.push(`<div class="hx tip"><b>Astuce du jour</b><span>${esc(TIPS[dayN % TIPS.length])}</span><button type="button" class="linkbtn" data-hx="tip">OK</button></div>`);
    if (M === 12 && D <= 24) cards.push(`<div class="hx advent"><b>Calendrier de l’Avent</b><div class="adv24">${Array.from({ length: 24 }, (_, k) => `<button type="button" data-advent="${k + 1}" class="${k + 1 < D ? 'past' : k + 1 === D ? 'now' : ''}" ${k + 1 > D ? 'disabled' : ''}>${k + 1}</button>`).join('')}</div></div>`);
    if (M === 12 || (M === 1 && D <= 15)) cards.push('<div class="hx wrap"><b>Ton année History</b><span>Tes heures, tes jeux préférés, ton record.</span><button type="button" class="btn sm play" data-hx="wrapped">Voir mon récap</button></div>');
    if (!cards.length) return;
    home.insertAdjacentHTML('afterbegin', `<div id="homeExtras">${cards.join('')}</div>`);
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-hx], [data-advent], [data-onb]'); if (!t) return;
    if (t.dataset.hx === 'tip') { pref('tip', String(dayN)); return t.closest('.hx').remove(); }
    if (t.dataset.advent) return modal(`<div class="mhead"><span class="micon">🎁</span><h2>Case ${t.dataset.advent}</h2></div><p class="mtext">${esc(TIPS[(Number(t.dataset.advent) * 7) % TIPS.length])}</p><p class="hint">Et regarde les jeux offerts du moment sur l’accueil 🎄</p>`);
    if (t.dataset.hx === 'wrapped') {
      const w = await more('wrapped'); if (!w) return;
      return modal(`<div class="wrapped"><small>TON ANNÉE ${w.year}</small><h2>${w.hours} h de jeu</h2><p>${w.days} jours joués${w.best ? ` · record le ${new Date(w.best.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} (${String(w.best.hours).replace('.', ',')} h)` : ''}</p><ol>${w.top.map((g) => `<li><b>${esc(g.name)}</b><span>${g.hours} h</span></li>`).join('') || '<li>Joue un peu pour remplir ton récap 🎮</li>'}</ol></div>`, true);
    }
    if (t.dataset.onb) { const n = Number(t.dataset.onb); if (n >= ONB.length) { pref('onboarded', '1'); return $('modal').close(); } return onboarding(n); }
  });
  const ONB = [['🎮', 'Tous tes jeux au même endroit', 'Steam, Epic, Riot, EA, GOG, Ubisoft, Xbox, FiveM… History les trouve tout seul. Clic droit sur un jeu pour tout le reste.'], ['🖥', 'Mon PC', 'La santé de ton PC, tes composants un par un, les vérifications et le benchmark.'], ['⚡', 'Optimisation', 'Nettoyage, réglages Windows pour jouer, et le ticket Opti Pro où un technicien IA te guide pas à pas.'], ['🤖', 'L’assistant', 'Le bouton en bas à droite : « lance Rocket League », outils IA, explication d’erreurs…']];
  function onboarding(n = 0) {
    const [ic, t, d] = ONB[n];
    setModal(); $('modalBox').innerHTML = `<div class="mhead"><span class="micon">${ic}</span><h2>${esc(t)}</h2></div><p class="mtext">${esc(d)}</p><div class="onbdots">${ONB.map((_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</div><div class="row end"><button type="button" class="btn ghost" data-onb="${ONB.length}">Passer</button><button type="button" class="btn play" data-onb="${n + 1}">${n === ONB.length - 1 ? 'C’est parti' : 'Suivant'}</button></div>`;
    $('modalBox').onclick = null; if (!$('modal').open) $('modal').showModal();
  }
  // Décor de saison (seulement pendant ces jours) : feux d'artifice, cœurs, soleil d'été ; anniversaire du compte
  const season = (M === 12 && D === 31) || (M === 1 && D <= 2) ? 'newyear' : M === 2 && D >= 10 && D <= 14 ? 'valentin' : M === 7 || M === 8 ? 'ete' : '';
  if (season && pref('motion') !== '0') document.body.insertAdjacentHTML('beforeend', `<div class="sdeco ${season}" aria-hidden="true">${Array.from({ length: 18 }, (_, k) => `<i style="--x:${(k * 53) % 100}%;--d:${(k % 6) * 1.3}s"></i>`).join('')}</div>`);
  setTimeout(async () => {
    homeCards();
    if (!pref('onboarded') && !(await api.demo?.().catch(() => null))) onboarding(0);
    const c = (await api.account?.().catch(() => null))?.compte;
    if (c?.createdAt) { const a = new Date(c.createdAt); const yrs = today.getFullYear() - a.getFullYear(); if (yrs > 0 && a.getMonth() === today.getMonth() && a.getDate() === D && pref('anniv') !== String(today.getFullYear())) { pref('anniv', String(today.getFullYear())); modal(`<div class="mhead"><span class="micon">🎂</span><h2>${yrs} an${yrs > 1 ? 's' : ''} avec History !</h2></div><p class="mtext">Merci d’être là depuis le ${a.toLocaleDateString('fr-FR')}, ${esc(c.pseudo)} 💛</p>`); } }
  }, 2500);

  // ---------- Sécurité & compte : appareils, PIN, contrôle parental, export, suppression, mot de passe fuité, mods ----------
  async function sessions(k, tout) {
    const r = await more('sessions', k, tout), box = $('secSessions'); if (!box) return;
    box.innerHTML = r?.sessions ? r.sessions.map((x) => `<div class="mvline"><b>${esc(x.app)}${x.actuelle ? ' · cet appareil' : ''}</b><span>connecté le ${new Date(x.at).toLocaleDateString('fr-FR')} · vu ${new Date(x.seen).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>${x.actuelle ? '' : `<button type="button" class="btn ghost sm" data-sesk="${esc(x.k)}">Déconnecter</button>`}</div>`).join('') : esc(r?.error ?? 'Indisponible.');
  }
  async function pinState() { const p = await more('pin', 'status'); if (!p || !$('pinSave')) return p; $('pinOld').hidden = !p.on; $('pinClear').hidden = !p.on; $('parental').checked = p.parental; $('parental').disabled = !p.on; return p; }
  const askPin = (title) => ui.prompt({ title, text: 'Entre le code PIN du launcher.', placeholder: '••••', ok: 'Valider', icon: '🔒' });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('#secRefresh, #secOthers, [data-sesk], #pinSave, #pinClear, #dataExport, #accDelete, [data-modscan]'); if (!t) return;
    if (t.id === 'secRefresh') return sessions();
    if (t.id === 'secOthers') { await sessions(null, true); return toast('Les autres appareils sont déconnectés'); }
    if (t.dataset.sesk) { await sessions(t.dataset.sesk); return toast('Appareil déconnecté'); }
    if (t.id === 'pinSave') { const r = await more('pin', 'set', $('pinOld').value, $('pinNew').value); toast(r?.ok ? '🔒 Code PIN enregistré' : r?.error ?? 'Impossible'); $('pinOld').value = $('pinNew').value = ''; return pinState(); }
    if (t.id === 'pinClear') { const r = await more('pin', 'clear', $('pinOld').value); toast(r?.ok ? 'Code PIN retiré' : r?.error ?? 'Impossible'); return pinState(); }
    if (t.id === 'dataExport') { const r = await more('export'); if (!r?.cancelled) toast(r?.ok ? '📦 Données exportées' : r?.error ?? 'Export impossible'); return; }
    if (t.id === 'accDelete') { const pw = await ui.prompt({ title: 'Supprimer mon compte', text: 'Ton mot de passe pour confirmer.', placeholder: 'Mot de passe', ok: 'Continuer', icon: '🗑' }); if (!pw) return; const r = await more('deleteAccount', pw); if (!r?.cancelled) toast(r?.ok ? 'Compte supprimé. Merci d’avoir utilisé History.' : r?.error ?? 'Impossible'); if (r?.ok) setTimeout(() => location.reload(), 1500); return; }
    if (t.dataset.modscan && state.sel) { toast('🛡 Analyse antivirus des mods… (quelques minutes)'); const r = await more('modscan', state.sel.id); return modal(`<div class="mhead"><span class="micon">${r?.threats?.length ? '🚨' : '🛡'}</span><h2>${r?.threats?.length ? 'Fichier dangereux trouvé' : r?.ok ? 'Aucune menace' : 'Analyse impossible'}</h2></div><p class="mtext">${r?.ok ? `Analysé par Windows Defender : ${esc(r.scanned.join(', '))}.${r.threats.length ? ` Menace dans : ${esc(r.threats.join(', '))}. Supprime ce mod puis lance Mon PC › Sécurité › Supprimer les menaces.` : ''}` : esc(r?.error ?? '')}</p>`); }
  });
  $('parental')?.addEventListener('change', async (e) => { const pin = await askPin('Contrôle parental'); const r = pin ? await more('pin', 'parental', pin, e.target.checked) : null; if (!r?.ok) { e.target.checked = !e.target.checked; if (pin) toast(r?.error ?? 'Code incorrect'); } else toast(e.target.checked ? '👪 Contrôle parental activé' : 'Contrôle parental désactivé'); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pane="compte"]')) { sessions(); pinState(); } });
  // QR de connexion directe (compte + ce PC), renouvelé toutes les 100 s tant que la page Téléphone est ouverte
  let qrTimer = 0;
  const phoneQr = async () => { if (!$('appQr') || $('set-telephone')?.hidden || !$('settings')?.open) return clearInterval(qrTimer); const r = await more('phoneQr'); if (r?.qr) { $('appQr').src = r.qr; $('appQr').hidden = false; $('appQrTxt').textContent = 'Valable 2 minutes, il se renouvelle tout seul.'; } else { $('appQr').hidden = true; $('appQrTxt').textContent = r?.error ?? 'QR indisponible.'; } };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pane="telephone"]')) { setTimeout(phoneQr, 100); clearInterval(qrTimer); qrTimer = setInterval(phoneQr, 100_000); } });
  api.settings?.().then((x) => { if ($('phoneOn')) $('phoneOn').checked = x?.phone !== false; }).catch(() => {});
  $('phoneOn')?.addEventListener('change', (e) => api.setSettings?.({ phone: e.target.checked }));
  // Verrou à l'ouverture si un code PIN existe
  pinState().then(async (p) => {
    if (!p?.on) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="pinlock" id="pinLock"><img src="logo.png" alt=""><b>History Launcher est verrouillé</b><form id="pinForm"><input class="minput" id="pinIn" type="password" inputmode="numeric" maxlength="8" autofocus placeholder="Code PIN"><button class="btn play">Déverrouiller</button></form><small id="pinErr"></small></div>');
    $('pinForm').onsubmit = async (e) => { e.preventDefault(); const r = await more('pin', 'check', $('pinIn').value); if (r?.ok) $('pinLock').remove(); else { $('pinErr').textContent = 'Code incorrect'; $('pinIn').value = ''; } };
  });
  // Contrôle parental : la limite bloque le lancement → le code PIN débloque 1 h
  if (api.action) { const act = api.action; api.action = async (id, a) => { const r = await act(id, a); if (a === 'launch' && /contrôle parental/.test(r?.error ?? '')) { const pin = await askPin('Limite de jeu du jour atteinte'); if (pin && (await more('pin', 'unlock', pin))?.ok) return act(id, a); } return r; }; }
  // Inscription / nouveau mot de passe : alerte si le mot de passe figure dans une fuite connue
  for (const [fn, key] of [['register', 'motDePasse'], ['resetPassword', 2]]) {
    const orig = api[fn]; if (!orig) continue;
    api[fn] = async (...a) => { const pw = key === 2 ? a[2] : a[0]?.[key]; const n = await more('pwned', pw).catch(() => 0); if (n > 0) toast(`⚠ Ce mot de passe apparaît dans ${Number(n).toLocaleString('fr-FR')} fuites de données : choisis-en un autre.`); return orig(...a); };
  }

  // ---------- Mon PC › Stockage ----------
  const ST_KINDS = { game: ['🎮', 'Jeux', '#ff8a2a'], app: ['🧩', 'Applis', '#8b5cf6'], protected: ['🧩', 'Applis', '#8b5cf6'], video: ['🎬', 'Vidéos', '#ef4444'], image: ['🖼', 'Images', '#22c55e'], music: ['🎵', 'Musique', '#ec4899'], archive: ['📦', 'Archives', '#eab308'], installer: ['💿', 'Installateurs', '#06b6d4'], doc: ['📄', 'Documents', '#60a5fa'], folder: ['📁', 'Dossiers', '#94a3b8'], file: ['🗂', 'Autres', '#64748b'] };
  const go = (b) => (b >= 1e12 ? `${(b / 1e12).toFixed(2).replace('.', ',')} To` : b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`);
  const ago = (t) => { if (!t) return 'jamais ouvert'; const d = Math.floor((Date.now() - t) / 86_400_000); return d < 1 ? 'utilisé aujourd’hui' : d < 31 ? `utilisé il y a ${d} j` : d < 365 ? `pas utilisé depuis ${Math.floor(d / 30)} mois` : `pas utilisé depuis ${(d / 365).toFixed(1).replace('.', ',').replace(',0', '')} an${d >= 730 ? 's' : ''}`; };
  let st = null, stKind = 'all', stShown = 120, stSel = new Set(), stMonths = 6;
  const stIcon = (x) => `<span class="sticon" style="--k:${ST_KINDS[x.kind][2]}">${x.icon ? `<img src="${esc(x.icon)}" alt="" onerror="this.remove()">` : ''}<em>${ST_KINDS[x.kind][0]}</em></span>`;
  async function storage(refresh = false) {
    if (st && !refresh) return drawStorage();
    $('stList').innerHTML = '<div class="stscan"><b id="stPct">0 %</b><span id="stCur">Mesure de tes disques…</span><i><u id="stBar"></u></i><small>Chaque dossier est mesuré pour de vrai : ça peut prendre quelques minutes la première fois.</small></div>';
    const r = await more('storage', refresh);
    if (r?.busy) return;
    if (!r?.items) { $('stList').innerHTML = `<div class="empty">${esc(r?.error ?? 'Analyse impossible.')}</div>`; return; }
    st = r; drawStorage();
  }
  api.onStorage?.((p) => { if ($('stPct')) { $('stPct').textContent = `${p.pct} %`; $('stCur').textContent = p.current; $('stBar').style.width = `${p.pct}%`; } });
  function drawStorage() {
    $('stDrives').innerHTML = st.volumes.map((v) => {
      const L = `${v.letter}:`, mine = st.items.filter((x) => x.path.toUpperCase().startsWith(L)), used = v.size - v.free;
      const by = {}; for (const x of mine) { const k = ST_KINDS[x.kind][1]; by[k] = (by[k] ?? 0) + x.size; }
      const known = Object.values(by).reduce((n, b) => n + b, 0);
      const segs = [...Object.entries(by).sort((a, b) => b[1] - a[1]), ['Windows et système', Math.max(0, used - known)]];
      const col = (k) => Object.values(ST_KINDS).find((x) => x[1] === k)?.[2] ?? '#475569';
      return `<div class="panel stdrive"><div class="stdhead"><span>🖴</span><div><b>${v.letter === 'C' ? 'Disque Windows' : 'Disque local'} (${L})</b><small>${go(v.free)} libres sur ${go(v.size)}</small></div><em class="${v.free / v.size < 0.1 ? 'bad' : ''}">${Math.round((used / v.size) * 100)} %</em></div>
        <div class="stbar">${segs.map(([k, b]) => `<i style="width:${(b / v.size) * 100}%;background:${col(k)}" title="${esc(k)} · ${go(b)}"></i>`).join('')}</div>
        <div class="stlegend">${segs.filter(([, b]) => b > v.size * 0.004).map(([k, b]) => `<span><i style="background:${col(k)}"></i>${esc(k)} <b>${go(b)}</b></span>`).join('')}</div></div>`;
    }).join('');
    const kinds = [...new Set(st.items.map((x) => ST_KINDS[x.kind][1]))];
    $('stChips').innerHTML = [['all', 'Tout'], ...kinds.map((k) => [k, k])].map(([k, l]) => `<button type="button" class="${stKind === k ? 'on' : ''}" data-stk="${esc(k)}">${esc(l)}</button>`).join('');
    const q = $('stSearch').value.trim().toLowerCase(), sort = $('stSort').value;
    const list = st.items.filter((x) => (stKind === 'all' || ST_KINDS[x.kind][1] === stKind) && (!q || `${x.name} ${x.path}`.toLowerCase().includes(q)))
      .sort(sort === 'old' ? (a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0) : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.size - a.size);
    const top = st.items[0]?.size || 1;
    $('stList').innerHTML = list.length ? `<div class="strows">${list.slice(0, stShown).map((x) => `<div class="strow">${stIcon(x)}<div class="stname"><b>${esc(x.name)}</b><small>${esc(x.where)} · ${esc(x.path)}</small></div><small class="stago ${(x.lastUsed ?? 0) < Date.now() - 180 * 86_400_000 ? 'old' : ''}">${ago(x.lastUsed)}</small><div class="stsize"><b>${go(x.size)}</b><i style="--w:${Math.max(2, (x.size / top) * 100)}%"></i></div><div class="stacts"><button type="button" class="btn ghost sm" data-stshow="${esc(x.path)}" title="Ouvrir l’emplacement">📂</button>${x.kind === 'protected' ? '<button type="button" class="btn ghost sm" data-pcfix="apps" title="Programme hors bibliothèque : désinstallation propre par Windows">Désinstaller…</button>' : `<button type="button" class="btn sm stdel" data-stdel="${esc(x.path)}">${x.kind === 'game' || x.kind === 'app' ? 'Désinstaller' : 'Supprimer'}</button>`}</div></div>`).join('')}</div>${list.length > stShown ? `<button type="button" class="btn ghost stmore" data-stmore="1">Afficher plus (${list.length - stShown})</button>` : ''}<p class="hint">Analyse du ${new Date(st.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · fichiers et dossiers vont dans la corbeille (récupérables), les jeux Steam / Epic se réinstallent depuis leur boutique.</p>` : '<div class="empty">Rien ne correspond.</div>';
  }
  async function stDelete(list) {
    const total = list.reduce((n, x) => n + x.size, 0), games = list.filter((x) => x.kind === 'game' || x.kind === 'app');
    if (!(await ui.confirm({ title: list.length > 1 ? `Supprimer ${list.length} éléments ?` : `${games.length ? 'Désinstaller' : 'Supprimer'} ${list[0].name} ?`, text: `${go(total)} libérés. ${games.length ? `${games.length} jeu${games.length > 1 ? 'x / applis' : ' / appli'} : désinstallé${games.length > 1 ? 's' : ''} (Steam / Epic : dossier supprimé, réinstallable). ` : ''}${list.length - games.length ? 'Fichiers et dossiers : envoyés à la corbeille, récupérables tant qu’elle n’est pas vidée.' : ''}`, list: list.slice(0, 8).map((x) => `${x.name} · ${go(x.size)}`), ok: '🗑 Supprimer', danger: true, icon: '🗑' }))) return false;
    const r = await more('storageDel', list.map((x) => x.path));
    const gone = new Set(list.map((x) => x.path)); for (const f of r?.failed ?? []) for (const x of list) if (x.name === f.name) gone.delete(x.path);
    st.items = st.items.filter((x) => !gone.has(x.path));
    toast(r?.ok ? `✓ ${r.ok} élément${r.ok > 1 ? 's' : ''} supprimé${r.ok > 1 ? 's' : ''}${r.freed ? ` · ${go(r.freed)} libérés` : ''}${r.failed?.length ? ` · ${r.failed.length} à finir` : ''}` : r?.failed?.[0]?.why ?? 'Suppression impossible');
    drawStorage(); return true;
  }
  function oldDialog() {
    if (!st) return toast('Lance d’abord l’analyse du stockage.');
    const draw = () => {
      const list = st.items.filter((x) => x.kind !== 'protected' && (x.lastUsed ?? 0) < Date.now() - stMonths * 30 * 86_400_000 && x.size > 0).sort((a, b) => b.size - a.size);
      const sel = list.filter((x) => stSel.has(x.path)), tot = sel.reduce((n, x) => n + x.size, 0);
      $('modalBox').querySelector('.stold').innerHTML = `<div class="stmonths">${[3, 6, 9, 12].map((m) => `<button type="button" class="${m === stMonths ? 'on' : ''}" data-stm="${m}">${m} mois</button>`).join('')}</div>
        <div class="stwarn"><b>Vérifie avant de supprimer</b><span>Ces éléments n’ont pas été ouverts ni modifiés depuis plus de ${stMonths} mois. Ça peut être des jeux morts ou de vieux téléchargements… mais aussi des photos ou des sauvegardes que tu gardes exprès. Décoche ce que tu veux garder.</span></div>
        ${list.length ? `<label class="stall"><input type="checkbox" data-stall="1" ${sel.length === list.length ? 'checked' : ''}> Tout sélectionner · ${list.length} élément${list.length > 1 ? 's' : ''}</label><div class="stoldlist">${list.map((x) => `<label class="strow">${`<input type="checkbox" data-stck="${esc(x.path)}" ${stSel.has(x.path) ? 'checked' : ''}>`}${stIcon(x)}<div class="stname"><b>${esc(x.name)}</b><small>${esc(x.where)} · ${ago(x.lastUsed)}</small></div><div class="stsize"><b>${go(x.size)}</b></div></label>`).join('')}</div>` : `<div class="empty">Rien d’inutilisé depuis ${stMonths} mois 👌</div>`}
        <div class="row end"><button type="button" class="btn ghost" data-m="1">Annuler</button><button type="button" class="btn dangerbtn" data-stgo="1" ${sel.length ? '' : 'disabled'}>Supprimer la sélection${tot ? ` · ${go(tot)}` : ''}</button></div>`;
    };
    stSel = new Set(); modal('<div class="mhead"><span class="micon">🕰</span><h2>Fichiers anciens</h2></div><div class="stold"></div>', true);
    $('modalBox').classList.add('procardbox'); $('modalBox').querySelector(':scope > .row.end')?.remove(); draw();
    $('modalBox').querySelector('.stold').addEventListener('click', async (e) => {
      const t = e.target.closest('[data-stm], [data-stgo]');
      if (t?.dataset.stm) { stMonths = Number(t.dataset.stm); stSel = new Set(); return draw(); }
      if (t?.dataset.stgo) { const list = st.items.filter((x) => stSel.has(x.path)); $('modal').close(); return stDelete(list); }
    });
    $('modalBox').querySelector('.stold').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.stall) { const all = [...$('modalBox').querySelectorAll('[data-stck]')].map((c) => c.dataset.stck); stSel = t.checked ? new Set(all) : new Set(); }
      else if (t.dataset.stck) t.checked ? stSel.add(t.dataset.stck) : stSel.delete(t.dataset.stck);
      draw();
    });
  }
  $('stSearch')?.addEventListener('input', () => st && drawStorage());
  $('stSort')?.addEventListener('change', () => st && drawStorage());
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-stk], [data-stshow], [data-stdel], [data-stmore], #stScan, #stOld'); if (!t) return;
    if (t.id === 'stScan') return storage(true);
    if (t.id === 'stOld') return oldDialog();
    if (t.dataset.stk) { stKind = t.dataset.stk; stShown = 120; return drawStorage(); }
    if (t.dataset.stmore) { stShown += 200; return drawStorage(); }
    if (t.dataset.stshow) return more('storageShow', t.dataset.stshow);
    if (t.dataset.stdel) { const x = st.items.find((i) => i.path === t.dataset.stdel); if (x) stDelete([x]); }
  });

  // Connexion par passkey : le navigateur s'ouvre, l'utilisateur valide, le launcher récupère la session
  $('authDev')?.addEventListener('click', async () => {
    const r = await more('devStart'); if (!r?.check) return toast(r?.error ?? 'Serveur injoignable.');
    $('authDevInfo').hidden = false; $('authDevInfo').innerHTML = `Valide dans la page qui vient de s’ouvrir (passkey, ou ton compte déjà connecté sur le téléphone). Code de vérification : <b>${esc(r.check)}</b>`;
    const w = await more('devWait'); $('authDevInfo').hidden = true;
    if (!w?.ok) return toast(w?.error ?? 'Connexion annulée');
    h.loggedIn?.(w);
  });

  // ---------- Thème e-sport (266) : pendant un grand tournoi d'un jeu de ta bibliothèque ----------
  function applyEsport(ev) {
    document.getElementById('esportBar')?.remove();
    if (!ev) { delete root.dataset.esport; return; }
    root.dataset.esport = ev.id; // seulement la bannière à la couleur du tournoi : les couleurs du thème choisi ne changent jamais
    const left = Math.max(0, Math.ceil((new Date(`${ev.end}T23:59:59`) - Date.now()) / 86_400_000));
    document.querySelector('#view-accueil')?.insertAdjacentHTML('afterbegin', `<div class="esportbar" id="esportBar" style="--e:${esc(ev.color)}"><span class="esdot"></span><div><b>${esc(ev.name)}</b><small>En cours · encore ${left} jour${left > 1 ? 's' : ''}</small></div><button type="button" class="btn sm" data-esurl="${esc(ev.url)}">Suivre la compétition</button><button type="button" class="esx" data-esoff="${esc(ev.id)}" aria-label="Masquer">✕</button></div>`);
  }
  window.historyEsport = applyEsport;
  let esData = null;
  const esLoad = async () => (esData ??= await more('esportData'));
  async function esport() {
    if (pref('esport') === '0') return applyEsport(null);
    const cal = await esLoad();
    const today = new Date().toISOString().slice(0, 10), names = state.items.map((i) => i.name.toLowerCase()).join('|');
    const has = (gid) => names.includes(cal?.games?.find((g) => g.id === gid)?.match ?? '§');
    applyEsport((cal?.events ?? []).find((e) => e.start <= today && today <= e.end && has(e.game) && pref(`esoff.${e.id}`) !== '1') ?? null);
  }
  setTimeout(esport, 4000); setInterval(esport, 6 * 3_600_000);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-esurl], [data-esoff]'); if (!t) return;
    if (t.dataset.esurl) return more('esportOpen', t.dataset.esurl);
    pref(`esoff.${t.dataset.esoff}`, '1'); applyEsport(null);
  });

  // ---------- Rubrique E-sport : équipes aux couleurs de leur club, jeux et calendrier ----------
  let esGame = 'all';
  const esFollow = () => { try { return JSON.parse(pref('esfollow') ?? '[]'); } catch { return []; } };
  const esSync = async () => { const d = await esLoad(); more('esportFollow', esFollow().map((id) => d.teams.find((t) => t.id === id)).filter(Boolean).map((t) => ({ nom: t.name, jeu: d.games.find((g) => g.id === t.game)?.name ?? '' }))); };
  setTimeout(esSync, 5000);
  const esDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const esState = (e) => { const t = new Date().toISOString().slice(0, 10); if (e.end < t) return ['fini', 'Terminé']; if (e.start <= t) return ['live', 'En cours']; const d = Math.ceil((new Date(`${e.start}T00:00:00`) - Date.now()) / 86_400_000); return ['soon', d <= 1 ? 'Demain' : `Dans ${d} jours`]; };
  const esArt = (g) => (g?.steam ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steam}/library_hero.jpg` : '');
  const esEvent = (e, g) => { const [k, l] = esState(e); return `<div class="esev es-${k}" data-esevent="${esc(e.id)}" style="--c:${esc(e.color)}"><i style="background-image:${[esSrv('event', e.name), esArt(g)].filter(Boolean).map((u) => `url('${esc(u)}')`).join(', ')}"></i><small>${esc(g?.name ?? '')}</small><b>${esc(e.name)}</b><span>${esDate(e.start)} – ${esDate(e.end)}</span><em>${k === 'live' ? '<u></u>' : ''}${l}</em>${k !== 'fini' ? `<button type="button" class="btn sm" data-esurl="${esc(e.url)}">Suivre</button>` : ''}</div>`; };
  // Images du club (facultatives) : esport/<club>-logo.png et esport/<club>-bg.jpg (club = nom sans espaces), sinon couleurs + sigle
  const esOrg = (t) => t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Ordre : image livrée avec le launcher, puis image trouvée par l'IA du serveur, puis couleurs et sigle
  const esSrv = (type, name) => (esData?.api ? `${esData.api}/api/compte/esport/img?type=${type}&nom=${encodeURIComponent(name)}` : '');
  const esImg = (t, g) => [`esport/${esOrg(t)}-bg.jpg`, `esport/${t.id}-bg.jpg`, esSrv('bg', t.name), esArt(g)].filter(Boolean).map((u) => `url('${esc(u)}')`).join(', ');
  const esLogo = (t) => `<img class="eslogo" src="esport/${esOrg(t)}-logo.png" data-alt="${esc(esSrv('logo', t.name))}" alt="">`;
  document.addEventListener('error', (e) => { const im = e.target; if (!im?.classList?.contains('eslogo') && !im?.classList?.contains('esface')) return; if (im.dataset.alt) { im.src = im.dataset.alt; im.dataset.alt = ''; } else im.remove(); }, true); // logo absent : on garde le sigle
  const esTeam = (t, g, fol) => `<button type="button" class="esteam" data-esteam="${esc(t.id)}" style="--ta:${esc(t.colors[0])};--tb:${esc(t.colors[1])}"><i style="background-image:${esImg(t, g)}"></i><strong>${esc(t.tag)}</strong>${esLogo(t)}<span><b>${esc(t.name)}</b><small>${esc(g?.name ?? '')} · ${esc(t.country)}</small></span>${fol ? '<em>★</em>' : ''}</button>`;
const ES_REG = { FR: 'Europe', DE: 'Europe', ES: 'Europe', DK: 'Europe', SE: 'Europe', UA: 'Europe', RU: 'Europe', TR: 'Europe', EU: 'Europe', BE: 'Europe', US: 'Amérique du Nord', CA: 'Amérique du Nord', BR: 'Amérique du Sud', SA: 'Moyen-Orient', MN: 'Asie', KR: 'Asie', CN: 'Asie', JP: 'Asie', SG: 'Asie' };
  let esLiveData = { matches: [] };
  // Pastille « EN DIRECT » à côté d'E-sport dans le menu quand une équipe suivie joue
  const esBadge = () => { const b = document.querySelector('.side [data-view="esport"]'); if (!b) return; const n = (esLiveData.matches ?? []).filter((m) => m.live).length; let el = b.querySelector('.eslivebadge'); if (!n) return el?.remove(); el ??= b.appendChild(Object.assign(document.createElement('em'), { className: 'eslivebadge' })); el.innerHTML = `<u></u>LIVE${n > 1 ? ` ${n}` : ''}`; el.title = esLiveData.matches.filter((m) => m.live).map((m) => `${m.team} vs ${m.opponent}`).join('\n'); };
  api.onEsportLive?.((d) => { esLiveData = d; esBadge(); if (state.view === 'esport') esportView(); });
  setTimeout(() => more('esportLive').then((d) => { if (d?.at) { esLiveData = d; esBadge(); } }), 8000);
  const esLiveHtml = (d) => { const now = Date.now(), ms = (esLiveData.matches ?? []).filter((m) => m.live || Date.parse(m.start) - now < 36 * 3_600_000).sort((a, b) => b.live - a.live || Date.parse(a.start) - Date.parse(b.start)); if (!ms.length) return ''; return `<h3 class="essub">Tes équipes en direct et bientôt</h3><div class="eslive">${ms.map((m) => { const t = d.teams.find((x) => x.name === m.team); return `<div class="eslivecard ${m.live ? 'on' : ''}" style="--ta:${esc(t?.colors[0] ?? '#ff4655')}"><em>${m.live ? '<u></u> EN DIRECT' : new Date(m.start).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</em><b>${esc(m.team)} <span>vs</span> ${esc(m.opponent)}</b><small>${esc(m.game)} · ${esc(m.event)}${m.score ? ` · ${esc(m.score)}` : ''}</small>${m.stream ? `<button type="button" class="btn sm play" data-esurl="${esc(m.stream)}">${/twitch/.test(m.stream) ? 'Regarder sur Twitch' : 'Regarder'}</button>` : ''}</div>`; }).join('')}</div>`; };
  async function esportView() {
    if (!esLiveData.at) more('esportLive').then((d) => { if (d?.at) { esLiveData = d; esBadge(); esportView(); } });
    const d = await esLoad(); const box = document.getElementById('esBody'); if (!box || !d?.teams) return;
    const fol = esFollow(), G = Object.fromEntries(d.games.map((g) => [g.id, g])), pick = (x) => esGame === 'all' || x.game === esGame, q = (document.getElementById('esSearch')?.value ?? '').trim().toLowerCase();
    const t0 = new Date().toISOString().slice(0, 10);
    const evs = d.events.filter((e) => pick(e) && e.end >= t0).sort((a, b) => a.start.localeCompare(b.start));
    const teams = d.teams.filter((x) => pick(x) && (!q || `${x.name} ${x.tag}`.toLowerCase().includes(q))).sort((a, b) => fol.includes(b.id) - fol.includes(a.id) || a.name.localeCompare(b.name));
    document.getElementById('esGames').innerHTML = [['all', 'Tous'], ...d.games.map((g) => [g.id, g.name])].map(([k, l]) => `<button type="button" class="${k === esGame ? 'on' : ''}" data-esgame="${k}">${esc(l)}</button>`).join('');
    const stars = (d.featured ?? []).map((n) => teams.find((t) => t.name === n) ?? (esGame === 'all' ? d.teams.find((t) => t.name === n) : null)).filter(Boolean);
    const hero = stars.map((t) => `<button type="button" class="esstar" data-esteam="${esc(t.id)}" style="--ta:${esc(t.colors[0])};--tb:${esc(t.colors[1])}"><i style="background-image:${esImg(t, G[t.game])}"></i>${esLogo(t)}<strong>${esc(t.tag)}</strong><span><b>${esc(t.name)}</b><small>${d.teams.filter((x) => x.name === t.name).map((x) => esc(G[x.game]?.name ?? '')).join(' · ')}</small></span></button>`).join('');
    box.innerHTML = `${esLiveHtml(d)}${hero && !q ? `<div class="esstars">${hero}</div>` : ''}<h3 class="essub">Calendrier</h3><div class="esevs">${evs.map((e) => esEvent(e, G[e.game])).join('') || '<div class="empty">Aucune compétition annoncée pour l’instant.</div>'}</div>
      ${teams.some((t) => fol.includes(t.id)) ? `<h3 class="essub">Tes équipes</h3><div class="esteams">${teams.filter((t) => fol.includes(t.id)).map((t) => esTeam(t, G[t.game], true)).join('')}</div>` : ''}
      ${(() => { const rest = teams.filter((t) => !fol.includes(t.id)); const by = (k) => rest.reduce((m, t) => ((m[k(t)] ??= []).push(t), m), {}); const groups = esGame === 'all' ? d.games.map((g) => [g.name, by((t) => t.game)[g.id] ?? [], g.color]) : Object.entries(by((t) => ES_REG[t.country] ?? 'Autres')).sort(([a], [b]) => a.localeCompare(b)).map(([r, l]) => [r, l, G[esGame]?.color]); return groups.filter(([, l]) => l.length).map(([n, l, c]) => `<div class="esgroup" style="--gc:${esc(c ?? '#888')}"><h3 class="essub"><i></i>${esc(n)} <small>${l.length} équipe${l.length > 1 ? 's' : ''}</small></h3><div class="esteams">${l.map((t) => esTeam(t, G[t.game], false)).join('')}</div></div>`).join('') || '<div class="empty">Aucune équipe ne correspond.</div>'; })()}
      <p class="hint">Liste des équipes et calendrier mis à jour depuis le site History.</p>`;
  }
  const esRow = (k, v) => (v ? `<div><small>${k}</small><b>${esc(v)}</b></div>` : '');
  const esLinks = (l = {}) => Object.entries({ site: 'Site officiel', twitter: 'X / Twitter', twitch: 'Twitch', youtube: 'YouTube' }).filter(([k]) => l[k]).map(([k, n]) => `<button type="button" class="btn sm ghost" data-esurl="${esc(l[k])}">${n}</button>`).join('');
  const esTitles = (ts = []) => (ts.length ? `<div class="estitles">${ts.map((x) => `<div><em>${esc(x.place)}</em><b>${esc(x.event)}</b><small>${esc(x.year)}</small></div>`).join('')}</div>` : '<div class="empty">Palmarès non trouvé.</div>');
  const esSrc = (d) => (d?.sources?.length ? `<p class="hint essrc">Sources : ${d.sources.map((x) => `<a href="#" data-esurl="${esc(x.url)}">${esc(x.title || new URL(x.url).hostname)}</a>`).join(' · ')}</p>` : '');
  const esWait = '<div class="esload"><i></i><span>L’IA lit les sites e-sport pour toi…</span></div>';
  let esCur = null;
  function esDlg(head, tabs) {
    modal(`<div class="esteamdlg" style="--ta:${esc(head.a)};--tb:${esc(head.b)}"><div class="estop"><i style="background-image:${head.img}"></i>${head.logo ?? ''}<strong>${esc(head.tag ?? '')}</strong><div><small>${esc(head.sub)}</small><h2>${esc(head.title)}</h2></div><button type="button" class="sellx" data-m="1" aria-label="Fermer">✕</button></div>
      <div class="estabs">${tabs.map(([k, l], i) => `<button type="button" class="${i ? '' : 'on'}" data-estab="${k}">${l}</button>`).join('')}</div><div class="esdlgbody" id="esTabBody">${esWait}</div></div>`, true);
    $('modalBox').classList.add('sellbox'); $('modalBox').querySelector(':scope > .row.end')?.remove();
  }
  async function esTeamOpen(id) {
    const d = await esLoad(), t = d.teams.find((x) => x.id === id); if (!t) return;
    const g = d.games.find((x) => x.id === t.game);
    esCur = { kind: 'team', t, g, data: null, tab: 'apercu' };
    esDlg({ a: t.colors[0], b: t.colors[1], img: esImg(t, g), logo: esLogo(t), tag: t.tag, sub: `${g?.name ?? ''} · ${t.country}`, title: t.name }, [['apercu', 'Aperçu'], ['effectif', 'Effectif'], ['matchs', 'Matchs'], ['actus', 'Actus'], ['calendrier', 'Calendrier']]);
    esCur.data = (await more('esportFiche', 'equipe', { nom: t.name, jeu: g?.name ?? '' })) ?? false;
    if (esCur?.t === t) esTab(esCur.tab);
  }
  async function esPlayerOpen(name) {
    const { t, g } = esCur ?? {}; if (!t) return;
    esCur = { kind: 'player', t, g, name, data: null, tab: 'joueur', back: t.id };
    esDlg({ a: t.colors[0], b: t.colors[1], img: esImg(t, g), logo: esLogo(t), tag: t.tag, sub: `${t.name} · ${g?.name ?? ''}`, title: name }, [['joueur', 'Profil'], ['parcours', 'Parcours'], ['reglages', 'Stats et réglages']]);
    esCur.data = (await more('esportFiche', 'joueur', { nom: name, equipe: t.name, jeu: g?.name ?? '' })) ?? false;
    if (esCur?.name === name) esTab(esCur.tab);
  }
  async function esEventOpen(id) {
    const d = await esLoad(), e = d.events.find((x) => x.id === id); if (!e) return;
    const g = d.games.find((x) => x.id === e.game);
    esCur = { kind: 'event', e, g, data: null, tab: 'tournoi' };
    esDlg({ a: e.color, b: '#0b0d14', img: [esSrv('event', e.name), esArt(g)].filter(Boolean).map((u) => `url('${esc(u)}')`).join(', '), sub: `${g?.name ?? ''} · ${esDate(e.start)} – ${esDate(e.end)}`, title: e.name }, [['tournoi', 'Infos'], ['equipes', 'Équipes'], ['matchs', 'Matchs']]);
    esCur.data = (await more('esportFiche', 'tournoi', { nom: e.name, jeu: g?.name ?? '' })) ?? false;
    if (esCur?.e === e) esTab(esCur.tab);
  }
  function esTab(tab) {
    const c = esCur, box = document.getElementById('esTabBody'); if (!c || !box) return;
    c.tab = tab; document.querySelectorAll('[data-estab]').forEach((b) => b.classList.toggle('on', b.dataset.estab === tab));
    const D = c.data;
    if (!D) { box.innerHTML = c.data === null ? esWait : '<div class="empty">Infos indisponibles pour le moment, réessaie plus tard.</div>'; return; }
    const fol = c.t && esFollow().includes(c.t.id);
    const H = {
      apercu: () => `<div class="row">${`<button type="button" class="btn ${fol ? 'ghost' : 'play'}" data-esfollow="${esc(c.t.id)}">${fol ? '★ Suivie' : '☆ Suivre cette équipe'}</button>`}${esLinks(D.team?.links)}</div>
        ${D.team?.about ? `<p class="esabout">${esc(D.team.about)}</p>` : ''}
        <div class="esfacts">${esRow('Fondée', D.team?.founded)}${esRow('Région', D.team?.region)}${esRow('Pays', D.team?.country)}${esRow('Coach', D.team?.coach)}${esRow('Manager', D.team?.manager)}${esRow('Gains', D.team?.earnings)}${esRow('Classement', D.team?.ranking)}</div>
        <h3 class="essub">Palmarès</h3>${esTitles(D.team?.titles)}`,
      effectif: () => `<div class="esroster">${(D.players ?? []).map((p) => `<button type="button" class="esplayer" data-esplayer="${esc(p.name)}"><span>${esc(p.name[0] ?? '?')}${esSrv('joueur', `${p.name} ${c.t.name}`) ? `<img class="esface" src="${esc(esSrv('joueur', `${p.name} ${c.t.name}`))}" alt="" loading="lazy">` : ''}</span><div><b>${esc(p.name)}</b><small>${esc([p.role, p.country].filter(Boolean).join(' · '))}</small>${p.realName || p.age ? `<em>${esc([p.realName, p.age && `${p.age} ans`].filter(Boolean).join(' · '))}</em>` : ''}${p.joined ? `<em>Depuis ${esc(p.joined)}</em>` : ''}</div><i>›</i></button>`).join('') || '<div class="empty">Effectif non trouvé.</div>'}</div>`,
      matchs: () => `${(D.upcoming ?? []).length ? `<h3 class="essub">À venir</h3><div class="esmatches">${D.upcoming.map((m) => `<div class="esmatch"><small>${esc(m.date)}</small><b>vs ${esc(m.opponent)}</b><span>${esc(m.event)}</span></div>`).join('')}</div>` : ''}
        <h3 class="essub">Derniers résultats</h3><div class="esmatches">${(D.results ?? []).map((m) => `<div class="esmatch ${m.win ? 'win' : 'loss'}"><small>${esc(m.date)}</small><b>vs ${esc(m.opponent)}</b><span>${esc(m.event)}</span><strong>${esc(m.score)}</strong></div>`).join('') || '<div class="empty">Pas de résultat trouvé.</div>'}</div>`,
      actus: () => `<div class="esnews">${(D.news ?? []).map((n) => `<button type="button" class="esnew" ${n.url ? `data-esurl="${esc(n.url)}"` : ''}>${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy">` : `<i style="background-image:${esImg(c.t, c.g)}"></i>`}<div><small>${n.date ? esc(n.date) : ''}</small><b>${esc(n.title)}</b><span>${esc(n.summary)}</span></div></button>`).join('') || '<div class="empty">Pas d’actualité trouvée.</div>'}</div>`,
      calendrier: () => { const t0 = new Date().toISOString().slice(0, 10); const evs = (esData?.events ?? []).filter((e) => e.game === c.t.game).sort((a, b) => (a.end < t0) - (b.end < t0) || a.start.localeCompare(b.start)); return `<div class="esevs">${evs.map((e) => esEvent(e, c.g)).join('') || '<div class="empty">Aucune compétition annoncée.</div>'}</div>`; },
      joueur: () => `<div class="esplayertop">${D.photo || esSrv('joueur', `${c.name} ${c.t.name}`) ? `<img class="esface" src="${esc(D.photo || esSrv('joueur', `${c.name} ${c.t.name}`))}" data-alt="${esc(D.photo ? esSrv('joueur', `${c.name} ${c.t.name}`) : '')}" alt="">` : ''}<span>${esc(c.name[0] ?? '?')}</span><div class="esfacts">${esRow('Vrai nom', D.realName)}${esRow('Né le', D.born)}${esRow('Âge', D.age && `${D.age} ans`)}${esRow('Pays', D.country)}${esRow('Rôle', D.role)}${esRow('Équipe', D.team)}</div></div>
        ${D.about ? `<p class="esabout">${esc(D.about)}</p>` : ''}<div class="row"><button type="button" class="btn ghost" data-esteam="${esc(c.back)}">‹ Retour à l’équipe</button>${esLinks(D.links)}</div>
        <h3 class="essub">Palmarès</h3>${esTitles(D.titles)}`,
      parcours: () => `<div class="eshist">${(D.history ?? []).map((x) => `<div><b>${esc(x.team)}</b><small>${esc(x.from)} → ${esc(x.to || 'aujourd’hui')}</small></div>`).join('') || '<div class="empty">Parcours non trouvé.</div>'}</div>`,
      reglages: () => `<h3 class="essub">Stats</h3><div class="esfacts">${(D.stats ?? []).map((x) => esRow(x.label, x.value)).join('') || '<div class="empty">Pas de stats trouvées.</div>'}</div><h3 class="essub">Réglages</h3><div class="esfacts">${(D.settings ?? []).map((x) => esRow(x.label, x.value)).join('') || '<div class="empty">Réglages non publiés.</div>'}</div>`,
      tournoi: () => `<div class="row"><button type="button" class="btn play" data-esurl="${esc(c.e.url)}">Regarder en direct</button></div><div class="esfacts">${esRow('Lieu', D.place)}${esRow('Dates', D.dates)}${esRow('Cashprize', D.prize)}${esRow('Statut', D.status)}${esRow('Vainqueur', D.winner)}</div>${D.format ? `<p class="esabout">${esc(D.format)}</p>` : ''}`,
      equipes: () => `<div class="esroster">${(D.teams ?? []).map((x) => { const tm = esData.teams.find((y) => y.game === c.e.game && y.name.toLowerCase() === x.name.toLowerCase()); return `<button type="button" class="esplayer" ${tm ? `data-esteam="${esc(tm.id)}"` : ''}><span>${esc(x.name[0] ?? '?')}</span><div><b>${esc(x.name)}</b><small>${esc(x.result)}</small></div>${tm ? '<i>›</i>' : ''}</button>`; }).join('') || '<div class="empty">Équipes non trouvées.</div>'}</div>`,
      matchs_e: () => '',
    };
    const k = c.kind === 'event' && tab === 'matchs' ? null : tab;
    box.innerHTML = (k ? H[k]() : `<div class="esmatches">${(D.matches ?? []).map((m) => `<div class="esmatch"><small>${esc(m.date)} · ${esc(m.stage)}</small><b>${esc(m.a)} vs ${esc(m.b)}</b><strong>${esc(m.score)}</strong></div>`).join('') || '<div class="empty">Pas de match trouvé.</div>'}</div>`) + esSrc(D);
  }
  document.getElementById('esSearch')?.addEventListener('input', () => esportView());
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-esgame], [data-esteam], [data-esfollow], [data-estab], [data-esplayer], [data-esevent]'); if (!t) return;
    if (t.dataset.estab) return esTab(t.dataset.estab);
    if (t.dataset.esplayer) return esPlayerOpen(t.dataset.esplayer);
    if (t.dataset.esevent && !e.target.closest('[data-esurl]')) return esEventOpen(t.dataset.esevent);
    if (t.dataset.esgame) { esGame = t.dataset.esgame; return esportView(); }
    if (t.dataset.esteam) return esTeamOpen(t.dataset.esteam);
    const f = esFollow(), id = t.dataset.esfollow; pref('esfollow', JSON.stringify(f.includes(id) ? f.filter((x) => x !== id) : [...f, id])); esSync();
    toast(f.includes(id) ? 'Équipe retirée' : '★ Équipe suivie'); esTab('apercu'); esportView();
  });

  return {
    heroTrailer, esportView, renderAdv, premExtras, proBar, proEnd, pc3d,
    verifs() { renderChecks(); renderPcExtra(); renderJournal(); },
    storage: () => storage(),
    sheetMore, genreCols,
  };
}
