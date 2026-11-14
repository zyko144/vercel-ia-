// Une perte DXGI au passage en plein écran ne doit pas condamner toute la session au mode compatible.
export function createCaptureRecovery(retry, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null, attempts = 0;
  return {
    failed() {
      if (timer !== null || attempts >= 3) return;
      const delay = [2000, 5000, 15000][attempts++];
      timer = schedule(() => { timer = null; retry(); }, delay);
    },
    reset() { if (timer !== null) cancel(timer); timer = null; attempts = 0; },
    stop() { if (timer !== null) cancel(timer); timer = null; },
  };
}
