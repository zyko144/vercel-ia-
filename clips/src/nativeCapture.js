import { spawn } from 'node:child_process';

// Desktop Duplication Windows + encodeur matériel ; aucun encodeur CPU continu en secours.
export function nativeCaptureArgs({ height = 1080, fps = 60, enc, width = 1920, sourceHeight = 1080, adapter = 0, output = 0 }) {
  if (!['h264_nvenc', 'h264_amf', 'h264_qsv'].includes(enc)) throw Error('Encodeur matériel indisponible');
  fps = fps === 30 ? 30 : 60;
  height = [720,1080,1440].includes(height) ? height : 1080;
  const scale = Math.min(1, height/sourceHeight, (height*16/9)/width);
  const w = Math.max(2, Math.floor(width*scale/2)*2), h = Math.max(2, Math.floor(sourceHeight*scale/2)*2);
  if (!Number.isInteger(adapter) || adapter < 0 || !Number.isInteger(output) || output < 0) throw Error('Écran de capture invalide');
  const rate = Math.round((h > 1080 ? 40 : h > 720 ? 24 : 12) * (fps === 60 ? 1 : .65));
  // Le transfert BGRA -> NV12 est nécessaire pour AMD/Intel et le redimensionnement.
  const direct = enc === 'h264_nvenc' && w === width && h === sourceHeight;
  const resize = w !== width || h !== sourceHeight;
  const filters = `ddagrab=output_idx=${output}:framerate=${fps}:draw_mouse=1` + (direct ? '' : ',hwdownload,format=bgra' + (resize ? `,scale=${w}:${h}:flags=bicubic` : '') + ',format=nv12');
  const encoder = enc === 'h264_nvenc' ? ['-preset','p3','-tune','hq','-rc','vbr','-cq','18'] : enc === 'h264_amf' ? ['-quality','balanced','-rc','vbr_peak'] : ['-preset','veryfast'];
  // Sur un pipe non seekable FFmpeg limite sinon les clusters à 32 Ko :
  // à 24 Mb/s cela produit près d'un fichier par image et sature les écritures du replay.
  return ['-hide_banner','-loglevel','warning','-stats_period','1','-progress','pipe:2','-nostats','-init_hw_device',`d3d11va=desktop:${adapter}`,'-filter_hw_device','desktop','-f','lavfi','-i',filters,'-an','-c:v',enc,...encoder,'-b:v',`${rate}M`,'-maxrate',`${rate*2}M`,'-bufsize',`${rate*2}M`,'-g',String(fps),'-bf','0','-fps_mode','cfr','-f','matroska','-cluster_time_limit','1000','-cluster_size_limit','16777216','-flush_packets','1','pipe:1'];
}
export function startNativeCapture(bin, options, onChunk, onFailure, spawnImpl = spawn) {
  const child = spawnImpl(bin, nativeCaptureArgs(options), { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let stopped = false, ready = false, error = '', resolveReady, rejectReady;
  const result = { startedAt: 0, stats: null, ready: new Promise((r,j) => { resolveReady=r; rejectReady=j; }), stop: () => { stopped=true; clearTimeout(timer); child.kill(); if (!ready) rejectReady(Error('Capture arrêtée')); } };
  const fail = e => { if (stopped) return; stopped=true; clearTimeout(timer); child.kill(); if (!ready) rejectReady(e); else onFailure(e); };
  const timer = setTimeout(() => fail(Error('Capture native sans image')), 10000);
  let progress = '', values = {}, previous = null, pendingBytes = 0;
  child.stderr.on('data', b => {
    progress += b.toString();
    const lines = progress.split(/\r?\n/); progress = lines.pop().slice(-2000);
    for (const line of lines) {
      const m = /^(frame|fps|dup_frames|drop_frames|out_time_us|speed|progress)=(.*)$/.exec(line);
      if (!m) { if (line) error=(error+line+'\n').slice(-2000); continue; }
      values[m[1]] = m[2];
      if (m[1] !== 'progress') continue;
      const now = Date.now(), frames = Number(values.frame), duplicates = Number(values.dup_frames) || 0;
      if (previous && now > previous.at && Number.isFinite(frames)) {
        const elapsed = (now - previous.at)/1000;
        result.stats = { fps: Math.max(0, (frames-previous.frames)/elapsed), duplicates: Math.max(0, duplicates-previous.duplicates), dropped: Number(values.drop_frames) || 0, pendingMB: pendingBytes/1048576 };
        options.onStats?.(result.stats);
      }
      previous = { at: now, frames, duplicates }; values = {};
    }
  });
  child.stdout.on('data', b => {
    if (stopped) return;
    if (!ready) { ready=true; result.startedAt=Date.now(); clearTimeout(timer); resolveReady(); }
    child.stdout.pause();
    pendingBytes += b.length;
    Promise.resolve().then(() => onChunk(b)).then(() => { pendingBytes -= b.length; if (!stopped) child.stdout.resume(); }).catch(fail);
  });
  child.on('error', fail);
  child.on('close', code => fail(Error(`Capture native interrompue (${code}) ${error.slice(-160)}`)));
  return result;
}
