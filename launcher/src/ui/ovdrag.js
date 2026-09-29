// Overlays en jeu : glisser à la souris (sans zone de glisser Windows, pour garder le survol et les boutons),
// taille − / + (gardée), et la fenêtre suit la taille de la carte.
const ovBox = document.querySelector('[data-drag]');
let ovZ = null;
function ovReport() { const r = ovBox.getBoundingClientRect(); window.launcher?.ovSize(Math.ceil(r.left * 2 + r.width), Math.ceil(r.top * 2 + r.height)); }
function ovZoom(z, save) {
  ovZ = Math.min(1.6, Math.max(0.7, Math.round(z * 10) / 10));
  ovBox.style.transformOrigin = '0 0'; ovBox.style.transform = ovZ === 1 ? '' : `scale(${ovZ})`;
  ovReport(); if (save) window.launcher?.ovZoom(ovZ);
}
window.ovInit = (z) => { if (ovZ == null) ovZoom(Number(z) || 1, false); };
for (const b of document.querySelectorAll('[data-z]')) b.addEventListener('click', () => ovZoom((ovZ ?? 1) + Number(b.dataset.z) * 0.1, true));
new ResizeObserver(ovReport).observe(ovBox);
let from = null;
ovBox.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return;
  from = [e.screenX, e.screenY]; ovBox.setPointerCapture(e.pointerId); window.launcher?.ovDrag('start');
});
ovBox.addEventListener('pointermove', (e) => { if (from) window.launcher?.ovDrag('move', e.screenX - from[0], e.screenY - from[1]); });
const ovEnd = () => { if (from) { from = null; window.launcher?.ovDrag('end'); } };
ovBox.addEventListener('pointerup', ovEnd); ovBox.addEventListener('pointercancel', ovEnd);
