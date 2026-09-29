// Serve launcher/ over HTTP, then open test/settings-browser.html.
// Uses the real markup/module; all publication calls are local mocks.
import { initSettings } from '../src/ui/settings.js';
const $ = (id) => document.getElementById(id);
const results = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  results.push(`✓ ${message}`);
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settled() {
  for (let i = 0; i < 200 && $('reviewForm').getAttribute('aria-busy') === 'true'; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert($('reviewForm').getAttribute('aria-busy') === 'false', 'Async operation settled');
}
try {
  const html = await (await fetch('../src/ui/index.html')).text();
  const source = new DOMParser().parseFromString(html, 'text/html');
  for (const id of ['settings', 'reviewDialog']) document.body.append(source.getElementById(id));
  const calls = [];
  let send = async () => ({ ok: true });
  initSettings({ review: (...args) => { calls.push(args); return send(); } });
  $('settings').showModal();
  const nav = (key) => document.querySelector(`.setnav [data-pane="${key}"]`).click();
  const search = (text) => { $('settingsSearch').value = text; $('settingsSearch').dispatchEvent(new Event('input')); };
  const rating = (n) => document.querySelector(`[name="rating"][value="${n}"]`).click();
  const submit = () => $('reviewForm').dispatchEvent(new Event('submit', { cancelable: true }));
  const open = () => { nav('avis'); $('openReview').click(); };
  const close = async () => { $('reviewDialog').close(); await tick(); };
  for (const button of document.querySelectorAll('.setnav [data-pane]')) {
    button.click();
    assert(document.querySelectorAll('.setpane:not([hidden])').length === 1 && !$(`set-${button.dataset.pane}`).hidden, `Navigation: ${button.dataset.pane}`);
  }
  nav('general'); $('autostart').checked = true;
  search('SECuRITE');
  assert(!$('set-compte').hidden && $('set-general').hidden, 'Search ignores case and accents');
  search('zzzzzzzz'); assert(!$('settingsEmpty').hidden, 'No-results message');
  $('settingsReset').click();
  assert(!$('set-general').hidden && $('autostart').checked, 'Reset preserves current category and control values');
  open(); submit();
  assert(calls.length === 0 && $('rvSend').disabled, 'Cannot submit without rating');
  rating(4); $('rvText').value = 'Mon avis de test'; $('rvText').dispatchEvent(new Event('input', { bubbles: true }));
  assert($('rvCount').textContent === '16 / 500' && !$('rvSend').disabled, 'Rating and character count');
  const canvas = Object.assign(document.createElement('canvas'), { width: 1500, height: 800 });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  async function pick(file) {
    const data = new DataTransfer(); data.items.add(file);
    $('rvImg').files = data.files; $('rvImg').dispatchEvent(new Event('change'));
    await settled();
  }
  await pick(new File([blob], 'capture.png', { type: 'image/png' }));
  assert(!$('rvPreview').hidden && $('rvFilename').textContent === 'capture.png', 'Valid image preview');
  const image = $('rvPreviewImage').src;
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  assert(bitmap.width === 1280 && bitmap.height < 1280, 'Image resized to the existing API limit'); bitmap.close();
  await pick(new File(['bad'], 'test.txt', { type: 'text/plain' }));
  assert(!$('rvError').hidden && $('rvPreviewImage').src === image, 'Invalid type keeps previous image');
  await pick(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
  assert($('rvError').textContent.includes('10 Mo'), 'Oversize file is rejected');
  await pick(new File(['not an image'], 'broken.png', { type: 'image/png' }));
  assert($('rvError').textContent.includes('illisible'), 'Corrupt image is rejected');
  $('rvRemove').click(); assert($('rvPreview').hidden && !$('rvSend').disabled, 'Image can be removed');
  await pick(new File([blob], 'capture.png', { type: 'image/png' }));
  send = async () => ({ error: 'Compte requis' }); submit(); await settled();
  assert($('rvError').textContent === 'Compte requis' && $('rvText').value === 'Mon avis de test' && !$('rvPreview').hidden, 'Server error preserves review for retry');
  assert(calls[0][0] === 4 && calls[0][1] === 'Mon avis de test' && calls[0][2].startsWith('data:image/jpeg;base64,'), 'Existing API receives rating, comment and image');
  send = async () => { throw new Error('Hors ligne'); }; submit(); await settled();
  assert($('rvError').textContent === 'Hors ligne' && !$('rvSend').disabled, 'Rejected request enables retry');
  let complete;
  send = () => new Promise((resolve) => { complete = resolve; });
  const before = calls.length; submit(); submit();
  assert(calls.length === before + 1 && $('rvSend').disabled, 'Double submit sends only once');
  const cancel = new Event('cancel', { cancelable: true }); $('reviewDialog').dispatchEvent(cancel);
  assert(cancel.defaultPrevented, 'Escape cannot discard an in-flight publication');
  complete({ ok: true }); await settled();
  assert(!$('reviewSuccess').hidden && $('reviewFields').hidden, 'Successful publication shows confirmation');
  await close(); open();
  assert(!$('reviewFields').hidden && $('reviewSuccess').hidden && $('rvText').value === '' && $('rvPreview').hidden && $('rvSend').disabled, 'Reopening starts a fresh review');
  // A slow decode from a closed form must never leak into a fresh review.
  const decode = window.createImageBitmap;
  let finishDecode;
  window.createImageBitmap = () => new Promise((resolve) => { finishDecode = resolve; });
  const data = new DataTransfer(); data.items.add(new File([blob], 'late.png', { type: 'image/png' }));
  $('rvImg').files = data.files; $('rvImg').dispatchEvent(new Event('change'));
  await close(); open();
  const late = await decode(blob); finishDecode(late); await tick();
  window.createImageBitmap = decode;
  assert($('rvPreview').hidden && $('reviewForm').getAttribute('aria-busy') === 'false', 'Stale image decoding cannot alter a reopened review');
  await close(); $('settings').close();
  $('results').textContent = `PASS — ${results.length} checks\n${results.join('\n')}`;
} catch (error) {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  $('results').textContent = `FAIL — ${error.message}\n${results.join('\n')}`;
  console.error(error);
}
