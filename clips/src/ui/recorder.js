// Les fragments arrivent dans l’ordre ; le processus principal reconstruit les clusters WebM.
let streams = [], recs = [], generation = 0;
function stopCapture() {
  for (const r of recs) if (r.state !== 'inactive') r.stop();
  recs = [];
  for (const s of streams) s.getTracks().forEach(t => t.stop());
  streams = [];
}
window.rec.onStart(async (id, o = {}) => {
  const gen = ++generation; stopCapture();
  const own = stream => {
    if (gen !== generation) { stream.getTracks().forEach(t => t.stop()); throw Error('Capture annulée'); }
    streams.push(stream); return stream;
  };
  const h = [720, 1080, 1440].includes(o.height) ? o.height : 1080, fps = o.fps === 30 ? 30 : 60;
  const bitrate = Math.round((h === 1440 ? 16 : h === 1080 ? 10 : 5) * (fps === 60 ? 1 : 0.65) * 1_000_000);
  try {
    const video = { width: { max: Math.round(h * 16 / 9) }, height: { max: h }, frameRate: { ideal: fps, max: fps } };
    const legacy = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: Math.round(h * 16 / 9), maxHeight: h, maxFrameRate: fps } };
    const screen = own(await navigator.mediaDevices.getDisplayMedia({ video, audio: o.audio !== false })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: o.audio === false ? false : { mandatory: { chromeMediaSource: 'desktop' } }, video: legacy }))
      .catch(() => navigator.mediaDevices.getDisplayMedia({ video, audio: false })));
    if (o.audio !== false && !screen.getAudioTracks().length) {
      const alt = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 16, maxHeight: 16 } } }).catch(() => null);
      if (alt) { own(alt); const track = alt.getAudioTracks()[0]; alt.getVideoTracks().forEach(t => t.stop()); if (track) screen.addTrack(track); }
    }
    const mic = o.mic ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => null) : null;
    if (mic) own(mic);
    if (gen !== generation) return;
    // Un profil h264 SEUL peut être annoncé compatible tout en supprimant l’audio.
    const types = screen.getAudioTracks().length ? ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus'] : ['video/webm;codecs=h264', 'video/webm;codecs=vp8'];
    const mimeType = types.find(m => MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw Error('Aucun encodeur compatible avec les pistes demandées.');
    const v = new MediaRecorder(screen, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160_000, videoKeyFrameIntervalDuration: 1000 });
    const m = mic?.getAudioTracks().length ? new MediaRecorder(mic, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96_000 }) : null;
    for (const [r, kind] of [[v, 'video'], [m, 'mic']]) {
      if (!r) continue;
      let pending = Promise.resolve();
      r.ondataavailable = e => {
        if (!e.data.size) return;
        pending = pending.then(async () => { const bytes = await e.data.arrayBuffer(); if (gen === generation) window.rec.chunk(bytes, kind); }).catch(err => { if (gen === generation) window.rec.state(`error:${err.message}`); });
      };
      r.onerror = e => { if (gen === generation) { window.rec.state(`error:${e.error?.message ?? 'encodeur'}`); generation++; stopCapture(); } };
      recs.push(r);
    }
    for (const stream of [screen, mic].filter(Boolean)) for (const track of stream.getTracks()) track.addEventListener('ended', () => {
      if (gen === generation) { window.rec.state('error:La capture ou le périphérique audio a été déconnecté. Relance le replay.'); generation++; stopCapture(); }
    });
    for (const r of recs) r.start(1000);
    window.rec.state(['on', o.audio !== false && !screen.getAudioTracks().length ? 'noaudio' : '', o.mic && !m ? 'nomic' : ''].filter(Boolean).join(':'));
  } catch (err) { if (gen === generation) { window.rec.state(`error:${err?.message ?? err}`); generation++; stopCapture(); } }
});
window.rec.onStop(() => { generation++; stopCapture(); });
