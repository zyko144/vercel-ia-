import { HOME_BLOCKS, HOME_ACTIONS, cleanHome, cleanNotebook } from '../core/personal.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const check = (r) => { if (r?.error) throw new Error(r.error); return r; };
export function initPersonal(api, { items, card, go, toast }) {
  let home = cleanHome(); let saving = Promise.resolve(); let editing = false; let dragging = null;
  const blocks = document.createElement('div'); blocks.id = 'homeBlocks';
  $('view-accueil').insertBefore(blocks, $('hero'));
  blocks.before($('diskAlert'));
  const wrap = (id, nodes) => { const el = document.createElement('section'); el.dataset.homeBlock = id; nodes.forEach((n) => el.append(n)); blocks.append(el); };
  wrap('hero', [$('hero')]);
  wrap('top', [$('topGames').previousElementSibling, $('topGames')]);
  for (const [key, id] of Object.entries({ rediscover: 'rediscBlock', updates: 'updBlock', recommendations: 'recoBlock', news: 'newsBlock', deals: 'dealBlock', free: 'freeBlock' })) wrap(key, [$(id)]);
  $('view-accueil').querySelector('.homesep')?.remove();
  for (const key of ['pins', 'actions']) { const el = document.createElement('div'); el.id = `home-${key}`; wrap(key, [el]); }
  const editorPane = $('set-accueil'); const editorParent = editorPane.parentNode; const editorNext = editorPane.nextSibling;
  const layout = document.createElement('div'); layout.className = 'home-live-layout'; blocks.before(layout); layout.append(blocks);
  const side = document.createElement('aside'); side.className = 'home-live-editor'; side.hidden = true; layout.append(side);
  const liveStatus = document.createElement('span'); liveStatus.className = 'home-live-status'; liveStatus.setAttribute('role','status'); $('customizeHome').before(liveStatus);
  function status(message) { $('homeSaveStatus').textContent = message; liveStatus.textContent = message; }
  function setEditing(on) {
    editing = on; dragging = null; layout.classList.toggle('editing',on); side.hidden = !on;
    $('customizeHome').textContent = on ? '✓ Terminer' : 'Personnaliser l’accueil'; $('customizeHome').setAttribute('aria-pressed',String(on));
    if(on) { side.append(editorPane); editorPane.hidden = false; editor(); }
    else { editorParent.insertBefore(editorPane,editorNext); editorPane.hidden = true; }
    render();
    if(!on)blocks.querySelectorAll('[data-id][draggable]').forEach(el=>el.removeAttribute('draggable'));
  }
  function render() {
    if(dragging)return;
    for (const key of home.order) { const el = blocks.querySelector(`[data-home-block="${key}"]`); el.hidden = !editing && home.hidden.includes(key); el.classList.toggle('home-block-hidden',home.hidden.includes(key)); blocks.append(el); el.querySelector('.home-block-tools')?.remove(); if(editing) { const tools=document.createElement('div');tools.className='home-block-tools';tools.innerHTML=`<button type="button" class="btn home-grip" draggable="true" data-drag-block="${key}" aria-label="Déplacer ${esc(HOME_BLOCKS[key])}">⠿ ${esc(HOME_BLOCKS[key])}</button><button type="button" class="btn" data-toggle-block="${key}">${home.hidden.includes(key)?'Afficher':'Masquer'}</button>`;el.prepend(tools); } }
    const pinned = home.pins.map((id) => items().find((i) => i.id === id && !i.hidden)).filter(Boolean);
    $('home-pins').innerHTML = `<div class="row-head"><h2>Mes jeux épinglés</h2></div><div class="cards">${pinned.length ? pinned.map((i,n) => editing ? `<div class="home-pin-item" data-pin-id="${esc(i.id)}" draggable="true">${card(i)}<div class="home-pin-tools"><button class="btn" type="button" data-pin-move="${esc(i.id)}" data-dir="-1" aria-label="Avancer ${esc(i.name)}" ${n===0?'disabled':''}>←</button><button class="btn" type="button" data-pin-remove="${esc(i.id)}" aria-label="Désépingler ${esc(i.name)}">Retirer</button><button class="btn" type="button" data-pin-move="${esc(i.id)}" data-dir="1" aria-label="Reculer ${esc(i.name)}" ${n===pinned.length-1?'disabled':''}>→</button></div></div>` : card(i)).join('') : '<p class="hint">Glisse tes jeux ici ou choisis-les dans « Personnaliser l’accueil ».</p>'}</div>`;
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
    const snapshot = cleanHome(home); render(); status('Enregistrement…');
    saving = saving.catch(() => {}).then(() => api.setSettings({ home: snapshot })).then(check).then(() => { status('Accueil enregistré.'); }).catch((e) => { status(`${e.message} Modifie un réglage pour réessayer.`); });
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
  $('customizeHome').addEventListener('click', () => setEditing(!editing));
  $('openSettings').addEventListener('click', () => { if(editing)setEditing(false); });
  function movePin(id, target) {
    const pins=home.pins.filter(x=>x!==id); const at=pins.indexOf(target); pins.splice(at<0?pins.length:at,0,id);home.pins=pins;
    home.hidden=home.hidden.filter(x=>x!=='pins'); editor();saveHome();
  }
  blocks.addEventListener('click', e => {
    if(!editing)return;
    const b=e.target.closest('button');
    if(b?.dataset.toggleBlock) { const id=b.dataset.toggleBlock;home.hidden=home.hidden.includes(id)?home.hidden.filter(x=>x!==id):[...home.hidden,id];editor();saveHome(); }
    else if(b?.dataset.pinRemove) { home.pins=home.pins.filter(x=>x!==b.dataset.pinRemove);editor();saveHome(); }
    else if(b?.dataset.pinMove) { const i=home.pins.indexOf(b.dataset.pinMove),j=i+Number(b.dataset.dir);if(j>=0&&j<home.pins.length){[home.pins[i],home.pins[j]]=[home.pins[j],home.pins[i]];editor();saveHome();} }
    // During editing, a game click must never launch it or open its details.
    e.stopPropagation(); e.preventDefault();
  },true);
  blocks.addEventListener('pointerdown', e => { if(editing){const c=e.target.closest('[data-id]');if(c)c.draggable=true;} });
  blocks.addEventListener('dragstart', e => {
    if(!editing)return;
    const grip=e.target.closest('[data-drag-block]');const game=e.target.closest('[data-pin-id], [data-id]');
    if(grip)dragging={block:grip.dataset.dragBlock};
    else if(game){const id=game.dataset.pinId||game.dataset.id;if(!items().some(i=>i.id===id&&i.kind==='game'&&!i.hidden))return;dragging={game:id};}
    else return;
    e.stopPropagation();e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragging.block||dragging.game);
  });
  blocks.addEventListener('dragover', e => {
    if(!dragging)return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
    if(dragging.block){const target=e.target.closest('[data-home-block]');const source=[...blocks.children].find(x=>x.dataset.homeBlock===dragging.block);if(target&&target!==source){const r=target.getBoundingClientRect();blocks.insertBefore(source,e.clientY>r.top+r.height/2?target.nextSibling:target);}}
    else { blocks.querySelector('[data-home-block="pins"]').classList.add('home-drop-target');const target=e.target.closest('.home-pin-item');const source=[...$('home-pins').querySelectorAll('.home-pin-item')].find(x=>x.dataset.pinId===dragging.game);if(source&&target&&source!==target){const r=target.getBoundingClientRect();target.parentNode.insertBefore(source,e.clientX>r.left+r.width/2?target.nextSibling:target);} }
  });
  blocks.addEventListener('drop', e => {
    if(!dragging)return;e.preventDefault();e.stopPropagation();const drag=dragging;dragging=null;
    if(drag.block){home.order=[...blocks.children].map(x=>x.dataset.homeBlock);editor();saveHome();}
    else if(e.target.closest('[data-home-block="pins"]')){
      if(!home.pins.includes(drag.game)&&home.pins.length>=12){toast('12 jeux épinglés maximum.');render();return;}
      if(home.pins.includes(drag.game)){home.pins=[...$('home-pins').querySelectorAll('.home-pin-item')].map(x=>x.dataset.pinId);editor();saveHome();}
      else movePin(drag.game,e.target.closest('.home-pin-item')?.dataset.pinId);
    }else render();
    blocks.querySelector('.home-drop-target')?.classList.remove('home-drop-target');
  });
  blocks.addEventListener('dragend',()=>{dragging=null;blocks.querySelector('.home-drop-target')?.classList.remove('home-drop-target');render();});
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
