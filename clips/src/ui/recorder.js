// Replay : pour une durée D choisie (15 s à 2 min), deux enregistreurs décalés (un nouveau toutes les D, 2 gardés :
// deux encodages au lieu de trois, moins de mémoire). On sauvegarde le plus jeune qui a au moins D.
let D = 30_000;
let BITRATE = 12_000_000;
const MIME = ['video/webm;codecs=h264', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
let stream = null;
let recs = [];
let cycle = null;

function startOne() {
  const r = { mr: new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: BITRATE, audioBitsPerSecond: 192_000 }), chunks: [], at: Date.now() };
  r.mr.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
  r.mr.start(1000);
  recs.push(r);
  // On garde les deux plus récents ; le plus vieux (≥ 60 s) est jeté
  while (recs.length > 2) { const old = recs.shift(); if (old.mr.state !== 'inactive') old.mr.stop(); old.chunks = []; }
}

window.rec.onStart(async (id, o = {}) => {
  D = Math.max(15, Math.min(120, Number(o.seconds) || 30)) * 1000;
  const h = [720, 1080, 1440].includes(o.height) ? o.height : 1080;
  const fps = o.fps === 30 ? 30 : 60;
  BITRATE = Math.round((h === 1440 ? 20 : h === 1080 ? 12 : 6) * (fps === 60 ? 1 : 0.65) * 1_000_000);
  try {
    const video = { width: { max: Math.round((h * 16) / 9) }, height: { max: h }, frameRate: { ideal: fps, max: fps } };
    stream = await navigator.mediaDevices.getDisplayMedia({ video, audio: o.audio !== false })
      .catch(() => navigator.mediaDevices.getDisplayMedia({ video, audio: false }))
      // Repli : ancienne méthode d'Electron (sans geste de l'utilisateur)
      .catch(() => { const legacy = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: Math.round((h * 16) / 9), maxHeight: h, maxFrameRate: fps } };
        return navigator.mediaDevices.getUserMedia({ audio: o.audio === false ? false : { mandatory: { chromeMediaSource: 'desktop' } }, video: legacy }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: legacy })); });
    startOne();
    cycle = setInterval(startOne, D);
    window.rec.state('on');
  } catch (err) {
    window.rec.state(`error:${err?.message ?? err}`);
  }
});

window.rec.onSave(() => {
  const now = Date.now();
  const r = [...recs].reverse().find((x) => now - x.at >= D) ?? recs[0];
  if (!r || !r.chunks.length) return window.rec.state('empty');
  recs = recs.filter((x) => x !== r);
  r.mr.onstop = async () => {
    const blob = new Blob(r.chunks, { type: MIME });
    r.chunks = [];
    window.rec.clip(new Uint8Array(await blob.arrayBuffer()), MIME);
  };
  r.mr.stop();
  if (!recs.length) startOne();
});

window.rec.onStop(() => {
  clearInterval(cycle);
  for (const r of recs) if (r.mr.state !== 'inactive') r.mr.stop();
  recs = [];
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
});
