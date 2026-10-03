// Fonctions pures de History Clips (testées dans test/test-clips.mjs).
import path from 'node:path';

/** Nom de dossier Windows valide (caractères interdits retirés). */
export function safeName(name) {
  const s = String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? `${s}_` : s;
}
/** « Rocket League 2026-09-28 21-14-03.mp4 » */
export function clipName(game, ext, d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${safeName(game) || 'Clip'} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
}
export const isMedia = (f) => /\.(mp4|webm|png)$/i.test(f);

/** Nom lisible du jeu au premier plan : description du programme, sinon titre de la fenêtre, sinon nom du processus. */
export function gameLabel({ desc = '', title = '', proc = '' } = {}) {
  const bad = /^(explorer|history clips|electron|desktop|program manager)$/i;
  for (const v of [desc, title, proc]) { const s = String(v ?? '').trim(); if (s && !bad.test(s) && s.length <= 60) return s; }
  return 'Bureau';
}

/** Arguments ffmpeg : remise en MP4 (durée et avance rapide corrects), avec ou sans découpe. */
/** Réglages d'encodage H.264 : carte graphique (NVIDIA, Intel, AMD) si elle est là, sinon processeur. Toujours lisible partout. */
export function encArgs(enc = 'libx264') {
  if (enc === 'h264_nvenc') return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-pix_fmt', 'yuv420p'];
  if (enc === 'h264_qsv') return ['-c:v', 'h264_qsv', '-global_quality', '20'];
  if (enc === 'h264_amf') return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20', '-pix_fmt', 'yuv420p'];
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'];
}
/** Arguments ffmpeg : remise en MP4 (durée et avance rapide corrects), avec ou sans découpe. */
export function ffmpegArgs(src, out, { start = null, end = null, reencode = false, fixup = false, enc = 'libx264' } = {}) {
  // fixup : replay recollé (en-tête + dernières secondes) → début abîmé ignoré, horodatage propre
  const a = fixup ? ['-y', '-fflags', '+genpts+discardcorrupt', '-err_detect', 'ignore_err'] : ['-y'];
  if (start != null) a.push('-ss', String(Math.max(0, start)));
  a.push('-i', src);
  if (end != null) a.push('-t', String(Math.max(0.5, end - (start ?? 0))));
  a.push('-map', '0:v:0', '-map', '0:a:0?');
  if (reencode) a.push(...encArgs(enc), '-vf', 'setpts=PTS-STARTPTS', '-fps_mode', 'vfr');
  else a.push('-c:v', 'copy');
  a.push('-af', 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '256k', '-disposition:a:0', 'default', '-movflags', '+faststart', out);
  return a;
}
/** Jeu + micro audibles sur la piste par défaut ; micro isolé conservé pour le montage. */
export function micMixArgs(video, mic, out, { videoAudio, delta = 0, volume = 1, enc = 'libx264', copyVideo = false }) {
  const shift = delta >= 0 ? `adelay=${Math.round(delta * 1000)}:all=1` : `atrim=start=${(-delta).toFixed(3)},asetpts=PTS-STARTPTS`;
  const graph = (copyVideo ? '' : '[0:v:0]setpts=PTS-STARTPTS[v];') + `[1:a:0]asetpts=PTS-STARTPTS,${shift},volume=${volume}[m];` + (videoAudio ? '[m]asplit[m1][m2];[0:a:0]asetpts=PTS-STARTPTS[a];[a][m1]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]' : '[m]asplit[mix][m2]');
  return ['-y', '-fflags', '+genpts+discardcorrupt', '-i', video, '-fflags', '+genpts+discardcorrupt', '-i', mic, '-filter_complex', graph, '-map', copyVideo ? '0:v:0' : '[v]', '-map', '[mix]', '-map', '[m2]', ...(copyVideo ? ['-c:v', 'copy'] : encArgs(enc)), '-fps_mode', 'vfr', '-c:a', 'aac', '-b:a', '256k', '-disposition:a:0', 'default', '-disposition:a:1', '0', '-metadata:s:a:0', 'title=Jeu + micro', '-metadata:s:a:1', 'title=Micro seul', '-movflags', '+faststart', out];
}
/** Chemin de ffmpeg dans l'appli installée (hors de l'archive asar). */
export const unpacked = (p) => String(p ?? '').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

/** Accélérateur Electron valide : touche seule (F1-F24, Impr. écran…) ou n'importe quelle touche avec Ctrl/Alt/Maj. */
export function validAccel(accel) {
  const parts = String(accel ?? '').split('+'); const k = parts.pop(); const mods = parts;
  const KEY = /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Tab|Up|Down|Left|Right|PrintScreen|Insert|Delete|Home|End|PageUp|PageDown|num[0-9]|numdec|numadd|numsub|nummult|numdiv|Plus|[;=,\-./`'[\]\\])$/;
  return KEY.test(k) && mods.every((m) => ['CommandOrControl', 'Alt', 'Shift'].includes(m)) && new Set(mods).size === mods.length && (mods.length > 0 || !/^[A-Z0-9]$|^(Space|Tab)$/.test(k));
}

/** Ligne du veilleur de fenêtre active : « FG|hwnd|pid|plein écran|description|titre|processus|chemin ». */
export function parseFg(line) {
  const m = String(line ?? '').split('|');
  if (m[0] !== 'FG' || m.length < 8) return null;
  return { hwnd: m[1], pid: Number(m[2]), full: m[3] === '1', desc: m[4], title: m[5], proc: m[6], exe: m.slice(7).join('|') };
}
/** Nom à chercher sur Steam pour l'image du jeu (sans « (64-bit) », ® ou suffixes techniques). FiveM = GTA V. */
export function artTerm(name) {
  const s = String(name ?? '').replace(/\(.*?\)|[®™]|\bby\b.*$/gi, '').replace(/\s+/g, ' ').trim();
  if (/^(clip|clips|bureau|capture|captures|history clips|history launcher)$/i.test(s)) return '';
  return /fivem|gta ?v|grand theft auto v/i.test(s) ? 'Grand Theft Auto V' : s;
}
/** Le résultat Steam est-il bien ce jeu ? (noms comparés sans accents, espaces ni ponctuation) */
export function artMatch(term, name) {
  const n = (v) => String(v ?? '').normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const a = n(term); const b = n(name);
  return a.length >= 3 && b.length >= 3 && (a === b || b.startsWith(a) || a.startsWith(b));
}

/** Vidéo native inchangée, audio PC/micro synchronisés sur leur démarrage respectif. */
export function nativeMixArgs(video, audio, out, duration) {
  const args = ['-y','-i',video], graph = [];
  const shift = delta => delta >= 0 ? `adelay=${Math.round(delta*1000)}:all=1` : `atrim=start=${(-delta).toFixed(3)},asetpts=PTS-STARTPTS`;
  audio.forEach((a,i) => {
    args.push('-i',a.file);
    graph.push(`[${i+1}:a:0]asetpts=PTS-STARTPTS,${shift(a.delta)},volume=${a.volume ?? 1},apad` + (a.kind === 'mic' ? `,asplit[a${i}][mic]` : `[a${i}]`));
  });
  if (audio.length) {
    graph.push(`${audio.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]`);
    args.push('-filter_complex',graph.join(';'),'-map','0:v:0','-map','[mix]','-c:a','aac','-b:a','256k');
    if (audio.some(a => a.kind === 'mic')) args.push('-map','[mic]','-disposition:a:0','default','-disposition:a:1','0','-metadata:s:a:1','title=Micro seul');
  } else args.push('-map','0:v:0','-an');
  return [...args,'-c:v','copy','-t',String(duration),'-movflags','+faststart',out];
}
