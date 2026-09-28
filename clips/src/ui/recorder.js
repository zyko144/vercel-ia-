// Replay : UN seul encodage vidéo, découpé en morceaux d'une seconde envoyés tout de suite au processus principal
// (qui les écrit sur le disque dans un tampon tournant). Rien n'est gardé en mémoire ici : quelques Mo au lieu de centaines.
const MIME = ['video/webm;codecs=h264,opus', 'video/webm;codecs=h264', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
let stream = null;
let mr = null;

window.rec.onStart(async (id, o = {}) => {
  const h = [720, 1080, 1440].includes(o.height) ? o.height : 1080;
  const fps = o.fps === 30 ? 30 : 60;
  const bitrate = Math.round((h === 1440 ? 16 : h === 1080 ? 10 : 5) * (fps === 60 ? 1 : 0.65) * 1_000_000);
  try {
    const video = { width: { max: Math.round((h * 16) / 9) }, height: { max: h }, frameRate: { ideal: fps, max: fps } };
    stream = await navigator.mediaDevices.getDisplayMedia({ video, audio: o.audio !== false })
      .catch(() => navigator.mediaDevices.getDisplayMedia({ video, audio: false }))
      // Repli : ancienne méthode d'Electron (sans geste de l'utilisateur)
      .catch(() => { const legacy = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: Math.round((h * 16) / 9), maxHeight: h, maxFrameRate: fps } };
        return navigator.mediaDevices.getUserMedia({ audio: o.audio === false ? false : { mandatory: { chromeMediaSource: 'desktop' } }, video: legacy }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: legacy })); });
    // Une image clé par seconde : on peut couper le replay à n'importe quelle seconde
    mr = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160_000, videoKeyFrameIntervalDuration: 1000 });
    mr.ondataavailable = async (e) => { if (e.data.size) window.rec.chunk(await e.data.arrayBuffer()); };
    mr.onerror = (e) => window.rec.state(`error:${e.error?.message ?? 'encodeur'}`);
    mr.start(1000);
    window.rec.state('on');
  } catch (err) {
    window.rec.state(`error:${err?.message ?? err}`);
  }
});

window.rec.onStop(() => {
  if (mr && mr.state !== 'inactive') mr.stop();
  mr = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
});
