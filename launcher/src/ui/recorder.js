// Replay : deux enregistreurs décalés de 30 s tournent en boucle (chacun repart toutes les 60 s). Au moment de
// sauvegarder, celui qui tourne depuis le plus longtemps contient toujours entre 30 et 60 dernières secondes.
const SEG = 30_000;
const MIME = ['video/webm;codecs=h264', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
let stream = null;
let recs = [];
let cycle = null;

function startOne() {
  const r = { mr: new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: 8_000_000 }), chunks: [], at: Date.now() };
  r.mr.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
  r.mr.start(1000);
  recs.push(r);
  // On garde les deux plus récents ; le plus vieux (≥ 60 s) est jeté
  while (recs.length > 2) { const old = recs.shift(); if (old.mr.state !== 'inactive') old.mr.stop(); old.chunks = []; }
}

window.rec.onStart(async (id) => {
  try {
    const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } };
    stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video }));
    startOne();
    cycle = setInterval(startOne, SEG);
    window.rec.state('on');
  } catch (err) {
    window.rec.state(`error:${err?.message ?? err}`);
  }
});

window.rec.onSave(() => {
  const r = recs[0];
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
