// Replay : UN seul encodage vidéo, découpé en morceaux d'une seconde envoyés tout de suite au processus principal
// (qui les écrit sur le disque dans un tampon tournant). Rien n'est gardé en mémoire ici.
// Micro (option) : enregistré À PART, démarré au même instant, pour être une piste séparée dans le clip.
const MIME = ['video/webm;codecs=h264,opus', 'video/webm;codecs=h264', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
let streams = [];
let recs = [];

window.rec.onStart(async (id, o = {}) => {
  const h = [720, 1080, 1440].includes(o.height) ? o.height : 1080;
  const fps = o.fps === 30 ? 30 : 60;
  const bitrate = Math.round((h === 1440 ? 16 : h === 1080 ? 10 : 5) * (fps === 60 ? 1 : 0.65) * 1_000_000);
  try {
    const video = { width: { max: Math.round((h * 16) / 9) }, height: { max: h }, frameRate: { ideal: fps, max: fps } };
    const screen = await navigator.mediaDevices.getDisplayMedia({ video, audio: o.audio !== false })
      .catch(() => navigator.mediaDevices.getDisplayMedia({ video, audio: false }))
      // Repli : ancienne méthode d'Electron (sans geste de l'utilisateur)
      .catch(() => { const legacy = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: Math.round((h * 16) / 9), maxHeight: h, maxFrameRate: fps } };
        return navigator.mediaDevices.getUserMedia({ audio: o.audio === false ? false : { mandatory: { chromeMediaSource: 'desktop' } }, video: legacy }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: legacy })); });
    streams.push(screen);
    // Son du PC absent (Windows ne l'a pas donné avec l'image) : on le prend par l'autre méthode et on l'ajoute
    if (o.audio !== false && !screen.getAudioTracks().length) {
      const alt = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 16, maxHeight: 16 } } }).catch(() => null);
      const track = alt?.getAudioTracks()[0];
      alt?.getVideoTracks().forEach((t) => t.stop());
      if (track) screen.addTrack(track);
    }
    const mic = o.mic ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => null) : null;
    if (mic) streams.push(mic);
    // Une image clé par seconde : on peut couper le replay à n'importe quelle seconde
    const v = new MediaRecorder(screen, { mimeType: MIME, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160_000, videoKeyFrameIntervalDuration: 1000 });
    const m = mic ? new MediaRecorder(mic, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96_000 }) : null;
    for (const [r, kind] of [[v, 'video'], [m, 'mic']]) {
      if (!r) continue;
      r.ondataavailable = async (e) => { if (e.data.size) window.rec.chunk(await e.data.arrayBuffer(), kind); };
      r.onerror = (e) => window.rec.state(`error:${e.error?.message ?? 'encodeur'}`);
      recs.push(r);
    }
    for (const r of recs) r.start(1000); // même instant : les deux pistes restent calées
    window.rec.state(o.audio !== false && !screen.getAudioTracks().length ? 'on:noaudio' : o.mic && !mic ? 'on:nomic' : 'on');
  } catch (err) {
    window.rec.state(`error:${err?.message ?? err}`);
  }
});

window.rec.onStop(() => {
  for (const r of recs) if (r.state !== 'inactive') r.stop();
  recs = [];
  for (const s of streams) s.getTracks().forEach((t) => t.stop());
  streams = [];
});
