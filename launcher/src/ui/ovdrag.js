// Overlays en jeu : on les glisse à la souris (sans zone de glisser Windows, pour garder le survol et le bouton ⇄)
for (const box of document.querySelectorAll('[data-drag]')) {
  let from = null;
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    from = [e.screenX, e.screenY]; box.setPointerCapture(e.pointerId); window.launcher?.ovDrag('start');
  });
  box.addEventListener('pointermove', (e) => { if (from) window.launcher?.ovDrag('move', e.screenX - from[0], e.screenY - from[1]); });
  const end = () => { if (from) { from = null; window.launcher?.ovDrag('end'); } };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}
