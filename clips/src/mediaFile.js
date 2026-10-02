import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

// Chromium lit et cherche dans les clips via des requêtes Range.
export async function serveMedia(file, range, method = 'GET') {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response('Clip introuvable', { status: 404 });
  const size = info.size;
  const headers = { 'Content-Type': /\.png$/i.test(file) ? 'image/png' : /\.webm$/i.test(file) ? 'video/webm' : 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  let start = 0, end = size - 1, status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || (!m[1] && Number(m[2]) === 0)) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  const body = method === 'HEAD' || !size ? null : Readable.toWeb(createReadStream(file, { start, end }));
  return new Response(body, { status, headers });
}
