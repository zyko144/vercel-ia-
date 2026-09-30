import { HOME_BLOCKS, HOME_ACTIONS, cleanHome, cleanNotebook } from '../core/personal.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const check = (r) => { if (r?.error) throw new Error(r.error); return r; };
export function initPersonal(api, { items, card, go, toast }) {
  let home = cleanHome(); let saving = Promise.resolve();
  const blocks = document.createElement('div'); blocks.id = 'homeBlocks';
  $('view-accueil').insertBefore(blocks, $('hero'));
  blocks.before($('diskAlert'));
  const wrap = (id, nodes) => { const el = document.createElement('section'); el.dataset.homeBlock = id; nodes.forEach((n) => el.append(n)); blocks.append(el); };
  wrap('hero', [$('hero')]);
  wrap('top', [$('topGames').previousElementSibling, $('topGames')]);
  for (const [key, id] of Object.entries({ rediscover: 'rediscBlock', updates: 'updBlock', recommendations: 'recoBlock', news: 'newsBlock', deals: 'dealBlock', free: 'freeBlock' })) wrap(key, [$(id)]);
  $('view-accueil').querySelector('.homesep')?.remove();
  for (const key of ['pins', 'actions']) { const el = document.createElement('div'); el.id = `home-${key}`; wrap(key, [el]); }
  function render() {
    for (const key of home.order) { const el = blocks.querySelector(`[data-home-block="${key}"]`); el.hidden = home.hidden.includes(key); blocks.append(el); }
    const pinned = home.pins.map((id) => items().find((i) => i.id === id && !i.hidden)).filter(Boolean);
    $('home-pins').innerHTML = `<div class="row-head"><h2>Mes jeux épinglés</h2></div><div class="cards">${pinned.length ? pinned.map((i) => card(i)).join('') : '<p class="hint">Épingle tes jeux depuis « Personnaliser l’accueil ».</p>'}</div>`;
    $('home-actions').innerHTML = `<div class="home-shortcuts">${home.actions.map((id) => `<button class="btn" data-go="${id}">${esc(HOME_ACTIONS[id])} ↗</button>`).join('')}</div>`;
  }
  function editor() {
    $('homeOrder').innerHTML = home.order.map((id, i) => `<div class="home-order-row"><span class="home-number">${String(i + 1).padStart(2, '0')}</span><label><input type="checkbox" data-block="${id}" ${home.hidden.includes(id) ? '' : 'checked'}>${esc(HOME_BLOCKS[id])}</label><button type="button" class="btn" data-move="${id}" data-dir="-1" aria-label="Monter ${esc(HOME_BLOCKS[id])}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn" data-move="${id}" data-dir="1" aria-label="Descendre ${esc(HOME_BLOCKS[id])}" ${i === home.order.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('');
    $('homeActionChoices').innerHTML = Object.entries(HOME_ACTIONS).map(([id, label]) => `<label><input type="checkbox" data-home-action="${id}" ${home.actions.includes(id) ? 'checked' : ''}>${esc(label)}</label>`).join('');
    gameChoices();
  }
  function gameChoices() {
    const q = $('homeGameSearch').value.trim().toLocaleLowerCase('fr');
    const list = items().filter((i) => i.kind === 'game' && !i.hidden && (!q || i.name.toLocaleLowerCase('fr').includes(q))).sort((a,b) => Number(home.pins.includes(b.id)) - Number(home.pins.includes(a.id)) || a.name.localeCompare(b.name)).slice(0, 40);
    $('homeGameChoices').innerHTML = list.length ? list.map((i) => `<label><input type="checkbox" data-pin="${esc(i.id)}" ${home.pins.includes(i.id) ? 'checked' : ''}>${esc(i.name)}</label>`).join('') : '<p class="hint">Aucun jeu trouvé.</p>';
  }
  function saveHome() {
    const snapshot = cleanHome(home); render(); $('homeSaveStatus').textContent = 'Enregistrement…';
    saving = saving.catch(() => {}).then(() => api.setSettings({ home: snapshot })).then(check).then(() => { $('homeSaveStatus').textContent = 'Accueil enregistré.'; }).catch((e) => { $('homeSaveStatus').textContent = `${e.message} Modifie un réglage pour réessayer.`; });
  }
  $('homeOrder').addEventListener('click', (e) => { const b = e.target.closest('[data-move]'); if (!b) return; const i = home.order.indexOf(b.dataset.move); const j = i + Number(b.dataset.dir); if (j < 0 || j >= home.order.length) return; [home.order[i],home.order[j]] = [home.order[j],home.order[i]]; editor(); saveHome(); $('homeOrder').querySelector(`[data-move="${b.dataset.move}"][data-dir="${b.dataset.dir}"]`)?.focus(); });
  $('set-accueil').addEventListener('change', (e) => {
    const t = e.target;
    const toggle = (list, id, on) => on ? [...new Set([...list,id])] : list.filter((x) => x !== id);
    if (t.dataset.block) home.hidden = toggle(home.hidden, t.dataset.block, !t.checked);
    else if (t.dataset.homeAction) home.actions = toggle(home.actions,t.dataset.homeAction,t.checked);
    else if (t.dataset.pin) { if (t.checked && home.pins.length >= 12) { t.checked = false; toast('12 jeux épinglés maximum.'); return; } home.pins = toggle(home.pins,t.dataset.pin,t.checked); }
    else return;
    saveHome();
  });
  $('homeGameSearch').addEventListener('input', gameChoices);
  function pane(id) { if (!$('settings').open) $('openSettings').click(); document.querySelector(`.setnav [data-pane="${id}"]`).click(); }
  $('customizeHome').addEventListener('click', () => { editor(); pane('accueil'); });
  document.querySelector('.setnav [data-pane="accueil"]').addEventListener('click', editor);
  api.settings().then((s) => { home = cleanHome(s.home); render(); editor(); }).catch(() => {});
  render(); editor();

  // Notebook reads happen only when opened. A generation prevents a slow read replacing another game.
  let noteId = null; let noteSession = 0; let noteBusy = false;
  const noteForm = $('notebookForm');
  async function notebook(id) {
    const game = items().find((i) => i.id === id); if (!game) return;
    const session = ++noteSession; noteId = id; noteForm.reset(); $('notebookTitle').textContent = game.name;
    $('notebookStatus').textContent = 'Chargement…'; $('notebookSave').disabled = true;
    if (!$('notebookDialog').open) $('notebookDialog').showModal();
    try { const note = check(await api.notebook(id)); if (session !== noteSession) return; for (const key of ['notes','build','commands','links']) noteForm.elements[key].value = note[key] ?? ''; $('notebookStatus').textContent = 'Enregistré sur ce PC · inclus dans la sauvegarde du compte.'; $('notebookSave').disabled = false; }
    catch { $('notebookStatus').textContent = 'Carnet indisponible. Ferme puis réessaie.'; }
  }
  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault(); if (noteBusy) return;
    try { const note = cleanNotebook(Object.fromEntries(new FormData(noteForm))); noteBusy = true; $('notebookSave').disabled = true; check(await api.saveNotebook(noteId,note)); $('notebookStatus').textContent = 'Carnet enregistré.'; }
    catch (err) { $('notebookStatus').textContent = err.message; }
    finally { noteBusy = false; $('notebookSave').disabled = false; }
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-notebook]'); if (b) notebook(b.dataset.notebook); });
  $('notebookDialog').addEventListener('close', () => { noteSession++; });
  $('notebookDialog').addEventListener('cancel', (e) => { if (noteBusy) e.preventDefault(); });

  let supportSession = 0; let diagnostic = {}; let capture = null; let busy = false; let uploading = false; let upload = 0;
  const labels = { received: 'Reçue', investigating: 'En cours', resolved: 'Résolue' };
  async function tickets() {
    $('supportTickets').textContent = 'Chargement…';
    try { const r = check(await api.supportList()); $('supportTickets').innerHTML = r.tickets?.length ? r.tickets.map((t) => `<article class="support-ticket"><span class="support-badge" data-status="${esc(t.status)}">${esc(labels[t.status] ?? t.status)}</span><h4>${esc(t.title)}</h4><small>${new Date(t.at).toLocaleDateString('fr-FR')}</small><p>${esc(t.description)}</p>${t.reply ? `<blockquote>${esc(t.reply)}</blockquote>` : '<p class="hint">L’équipe répondra ici.</p>'}</article>`).join('') : '<p class="hint">Aucune demande. On est là si tu en as besoin.</p>'; }
    catch (e) { $('supportTickets').textContent = e.message; }
  }
  $('refreshSupport').addEventListener('click', tickets);
  document.querySelector('.setnav [data-pane="aide"]').addEventListener('click', tickets);
  function removeCapture() { upload++; uploading = false; capture = null; $('supportFile').value = ''; $('supportPreview').removeAttribute('src'); $('supportPreview').hidden = true; $('supportRemove').hidden = true; $('supportSubmit').disabled = busy; }
  $('supportRemove').addEventListener('click', removeCapture);
  async function pick(file) {
    if (!file || busy) return;
    removeCapture(); const generation = upload; uploading = true; $('supportSubmit').disabled = true;
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10*1024*1024) throw new Error('Choisis un PNG, JPG ou WebP de moins de 10 Mo.');
      const bitmap = await createImageBitmap(file); let data;
      try { const ratio = Math.min(1,1280/Math.max(bitmap.width,bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*ratio)); canvas.height = Math.max(1,Math.round(bitmap.height*ratio)); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); for (const quality of [.82,.65,.45]) { data = canvas.toDataURL('image/jpeg',quality); if (data.length < 1800000) break; } }
      finally { bitmap.close(); }
      if (generation !== upload) return;
      if (data.length >= 1800000) throw new Error('Capture trop volumineuse. Choisis une image plus petite.');
      capture = data; $('supportPreview').src = data; $('supportPreview').hidden = false; $('supportRemove').hidden = false; $('supportStatus').textContent = 'Capture prête. Vérifie les informations visibles avant l’envoi.';
    } catch (e) { if (generation === upload) $('supportStatus').textContent = e.message; }
    finally { if (generation === upload) { uploading = false; $('supportSubmit').disabled = busy; } }
  }
  $('supportFile').addEventListener('change', (e) => pick(e.target.files[0]));
  for (const type of ['dragover','drop']) $('supportDrop').addEventListener(type, (e) => { e.preventDefault(); e.stopPropagation(); if (type === 'drop') pick(e.dataTransfer.files[0]); });
  $('newSupport').addEventListener('click', async () => {
    $('supportForm').reset(); removeCapture(); diagnostic = {}; $('supportDiagnostic').textContent = 'Lecture…'; $('supportStatus').textContent = ''; $('supportDialog').showModal();
    const session = ++supportSession;
    try { const d = check(await api.supportDiagnostic()); if (session !== supportSession || !$('supportDialog').open) return; diagnostic = d; $('supportDiagnostic').textContent = Object.entries(d).map(([k,v]) => `${k} : ${v}`).join('\n'); }
    catch { $('supportDiagnostic').textContent = 'Diagnostic indisponible. Tu peux envoyer ta description.'; }
  });
  $('supportForm').addEventListener('submit', async (e) => {
    e.preventDefault(); if (busy || uploading) return;
    const form = e.currentTarget; const body = Object.fromEntries(new FormData(form)); body.img = capture; body.diagnostic = $('supportInclude').checked ? diagnostic : {};
    busy = true; [...form.elements].forEach((el) => { el.disabled = true; }); $('supportStatus').textContent = 'Envoi…';
    try { check(await api.supportSend(body)); $('supportDialog').close(); toast('Signalement envoyé. Retrouve son suivi dans le centre d’aide.'); tickets(); }
    catch (e) { $('supportStatus').textContent = e.message; }
    finally { busy = false; [...form.elements].forEach((el) => { el.disabled = false; }); }
  });
  $('supportDialog').addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  $('supportDialog').addEventListener('close', () => { supportSession++; removeCapture(); });
  for (const dialog of [$('supportDialog'),$('notebookDialog')]) dialog.querySelector('[data-personal-close]').addEventListener('click', () => { if (dialog.id === 'supportDialog' ? !busy : !noteBusy) dialog.close(); });
  return { render, tour(id) { if (id === 'carnet') { const game = items().find((i) => i.kind === 'game'); if (game) notebook(game.id); else { go('jeux'); toast('Ajoute un jeu pour ouvrir son carnet depuis sa fiche.'); } } else pane(id); } };
}
