// Presentation only: the existing launcher API owns persistence and publication.
export function initSettings(api) {
  const $ = (id) => document.getElementById(id);
  const settings = $('settings');
  // Moins de catégories : les petites sont rangées dans une plus grande (les anciens liens y mènent toujours)
  const MERGE = { sons: 'apparence', raccourcis: 'general', accueil: 'general', assistant: 'jeux', telephone: 'social', avis: 'aide', about: 'aide' };
  for (const [from, to] of Object.entries(MERGE)) {
    const src = settings.querySelector(`.setpane[data-pane="${from}"]`), dst = settings.querySelector(`.setpane[data-pane="${to}"]`);
    if (!src || !dst) continue;
    const sub = document.createElement('h3'); sub.className = 'setsub'; sub.id = `setsub-${from}`; sub.textContent = settings.querySelector(`.setnav [data-pane="${from}"] span:nth-child(2)`)?.textContent ?? '';
    dst.append(sub, ...[...src.children].filter((c) => !c.matches('.setintro')));
    settings.querySelector(`.setnav [data-pane="${from}"]`).hidden = true;
  }
  settings.querySelector('.setnav nav').append(settings.querySelector('.setnav [data-pane="aide"]')); // Aide sous « History & toi »
  const buttons = [...settings.querySelectorAll('.setnav [data-pane]')];
  const panes = [...settings.querySelectorAll('.setpane')];
  const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let active = 'general';
  function filterSettings() {
    const query = normalize($('settingsSearch').value.trim());
    const words = query.split(/\s+/).filter(Boolean);
    let matches = 0;
    for (const pane of panes) {
      let count = 0;
      for (const card of pane.querySelectorAll('.setcard')) {
        const text = normalize(`${pane.querySelector('.setintro').textContent} ${card.textContent}`);
        card.hidden = !!query && !words.every((word) => text.includes(word));
        if (!card.hidden) count++;
      }
      pane.hidden = query ? count === 0 : pane.dataset.pane !== active;
      if (!pane.hidden) matches += count;
    }
    for (const button of buttons) {
      const selected = !query && button.dataset.pane === active;
      button.classList.toggle('on', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    $('settingsClear').hidden = !query;
    $('settingsEmpty').hidden = matches !== 0;
    $('settingsResults').textContent = query ? `${matches} groupe${matches > 1 ? 's' : ''} de réglages trouvé${matches > 1 ? 's' : ''}` : 'Réglages enregistrés automatiquement, sauf l’aperçu du thème.';
    settings.querySelector('.setbody').scrollTop = 0;
  }
  for (const button of buttons) button.addEventListener('click', () => {
    active = MERGE[button.dataset.pane] ?? button.dataset.pane;
    $('settingsSearch').value = '';
    filterSettings();
    if (MERGE[button.dataset.pane]) $(`setsub-${button.dataset.pane}`)?.scrollIntoView({ block: 'start' });
    window.sfx?.play('nav');
  });
  $('settingsSearch').addEventListener('input', filterSettings);
  settings.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); $('settingsSearch').focus();
    }
  });
  $('settingsSearch').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape' && event.currentTarget.value) {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.value = ''; filterSettings();
    }
  });
  for (const id of ['settingsClear', 'settingsReset']) $(id).addEventListener('click', () => {
    $('settingsSearch').value = ''; filterSettings(); $('settingsSearch').focus();
  });
  initReview(api);
}

function initReview(api) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('reviewDialog');
  const form = $('reviewForm');
  const radios = [...form.querySelectorAll('[name="rating"]')];
  let image = null;
  let busy = false;
  let uploading = false;
  let session = 0;
  let upload = 0;
  const error = (message = '') => {
    $('rvError').textContent = message;
    $('rvError').hidden = !message;
  };
  function update() {
    const rating = Number(form.elements.rating.value);
    radios.forEach((radio) => radio.closest('label').classList.toggle('on', Number(radio.value) <= rating));
    $('rvRatingText').textContent = ['Choisis de 1 à 5 étoiles', 'Décevant', 'Peut mieux faire', 'Pas mal', 'Très bien', 'Excellent !'][rating];
    $('rvCount').textContent = `${$('rvText').value.length} / 500`;
    $('rvSend').disabled = !rating || busy || uploading;
    $('rvSend').textContent = busy ? 'Publication en cours…' : 'Publier mon avis ↗';
    form.setAttribute('aria-busy', String(busy || uploading));
    form.querySelectorAll('[data-review-close]').forEach((button) => { button.disabled = busy; });
    for (const input of [...radios, $('rvText'), $('rvImg'), $('rvRemove')]) input.disabled = busy;
  }
  function clearImage() {
    upload++;
    uploading = false; image = null;
    $('rvImg').value = '';
    $('rvPreviewImage').removeAttribute('src');
    $('rvPreview').hidden = true; $('rvPickHint').hidden = false; $('rvRemove').hidden = true;
    $('rvInfo').textContent = ''; $('rvDrop').classList.remove('has-image');
    update();
  }
  $('openReview').addEventListener('click', () => {
    session++; busy = false;
    form.reset(); clearImage(); error();
    $('reviewFields').hidden = false; $('reviewSuccess').hidden = true;
    dialog.setAttribute('aria-labelledby', 'reviewTitle');
    dialog.showModal(); radios[0].focus();
  });
  form.querySelectorAll('[data-review-close]').forEach((button) => button.addEventListener('click', () => {
    if (!busy) dialog.close();
  }));
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { session++; upload++; });
  form.addEventListener('input', update);
  $('rvRemove').addEventListener('click', () => { clearImage(); error(); $('rvImg').focus(); });
  async function pick(file) {
    if (!file || busy) return;
    const ticket = ++upload;
    const current = session;
    const stale = () => ticket !== upload || current !== session || !dialog.open;
    error();
    uploading = true; $('rvInfo').textContent = 'Préparation de la capture…'; update();
    let bitmap;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choisis une image PNG, JPG ou WebP.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Cette image dépasse 10 Mo. Choisis une capture plus légère.');
      bitmap = await createImageBitmap(file);
      if (stale()) return;
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bitmap.width * scale)), height: Math.max(1, Math.round(bitmap.height * scale)) });
      const context = canvas.getContext('2d');
      context.fillStyle = '#10141f'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let result;
      for (const quality of [0.82, 0.65, 0.45]) {
        result = canvas.toDataURL('image/jpeg', quality);
        if (result.length < 1_900_000) break;
      }
      if (result.length >= 1_900_000) throw new Error('Cette capture reste trop lourde. Essaie une image plus petite.');
      image = result;
      $('rvPreviewImage').src = image; $('rvFilename').textContent = file.name;
      $('rvPreview').hidden = false; $('rvPickHint').hidden = true; $('rvRemove').hidden = false;
      $('rvDrop').classList.add('has-image');
      $('rvInfo').textContent = '✓ Capture optimisée pour l’envoi';
    } catch (cause) {
      if (!stale()) {
        error(cause.name === 'InvalidStateError' ? 'Cette image est illisible. Essaie une autre capture.' : cause.message || 'Impossible de lire cette image.');
        $('rvInfo').textContent = image ? 'La capture précédente est conservée.' : '';
      }
    } finally {
      bitmap?.close();
      if (!stale()) { uploading = false; $('rvImg').value = ''; update(); }
    }
  }
  $('rvImg').addEventListener('change', () => pick($('rvImg').files[0]));
  $('rvDrop').addEventListener('dragover', (event) => { event.preventDefault(); if (!busy) $('rvDrop').classList.add('dragging'); });
  $('rvDrop').addEventListener('dragleave', (event) => { if (!$('rvDrop').contains(event.relatedTarget)) $('rvDrop').classList.remove('dragging'); });
  $('rvDrop').addEventListener('drop', (event) => {
    event.preventDefault(); $('rvDrop').classList.remove('dragging');
    if (busy) return;
    if (event.dataTransfer.files.length !== 1) return error('Ajoute une seule capture à ton avis.');
    pick(event.dataTransfer.files[0]);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || uploading || !form.elements.rating.value) return;
    busy = true; error(); update();
    const current = session;
    try {
      // In the browser preview, do not claim a review was published.
      if (!api.review) throw new Error('La publication est disponible dans l’application History Launcher, avec ton compte connecté.');
      const result = await api.review(Number(form.elements.rating.value), $('rvText').value, image);
      if (current !== session || !dialog.open) return;
      if (!result?.ok) throw new Error(result?.error || 'Impossible de publier pour le moment. Ton avis est conservé ici, réessaie.');
      $('reviewFields').hidden = true; $('reviewSuccess').hidden = false;
      const title = $('reviewSuccess').querySelector('h2'); title.id = 'reviewSuccessTitle';
      if (result.reward) title.insertAdjacentHTML('afterend', `<p>🎁 Merci : ${result.reward.days} jours de Pack Premium offerts sur ton compte.</p>`);
      dialog.setAttribute('aria-labelledby', title.id);
    } catch (cause) {
      if (current === session && dialog.open) error(cause.message || 'Connexion interrompue. Ton avis est conservé ici, réessaie.');
    } finally {
      if (current === session) {
        busy = false; update();
        if (!$('reviewSuccess').hidden) $('reviewSuccess').querySelector('button').focus();
      }
    }
  });
}
