// Met des paquets Opus bruts (ceux que Discord envoie) dans un fichier Ogg, sans rien décoder.
// Sert à la surveillance vocale : envoyer la voix à Gemini ne coûte presque rien au processeur,
// alors que décoder l'Opus en JavaScript (opusscript) peut bloquer le bot sur un petit serveur.

// CRC-32 des pages Ogg (polynôme 0x04C11DB7, non réfléchi)
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  CRC_TABLE[i] = r >>> 0;
}
function crc(buffer) {
  let c = 0;
  for (const byte of buffer) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ byte) & 0xff]) >>> 0;
  return c;
}

/** Une page Ogg contenant ces paquets (255 segments au maximum, soit bien plus que nos paquets de 20 ms). */
function page(packets, { serial, sequence, granule, first = false, last = false }) {
  const lacing = [];
  for (const packet of packets) {
    let size = packet.length;
    while (size >= 255) { lacing.push(255); size -= 255; }
    lacing.push(size);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0);
  header[4] = 0; // version
  header[5] = (first ? 0x02 : 0) | (last ? 0x04 : 0);
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt32LE(0, 22); // CRC, calculé plus bas
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);
  const out = Buffer.concat([header, ...packets]);
  out.writeUInt32LE(crc(out), 22);
  return out;
}

const SAMPLES_PER_PACKET = 960; // 20 ms à 48 kHz, comme les paquets de Discord
const PACKETS_PER_PAGE = 50; // une page par seconde

/**
 * @param {Buffer[]} packets paquets Opus de 20 ms (48 kHz)
 * @param {{ channels?: number }} [opts] Discord envoie de la stéréo
 * @returns {Buffer} un fichier .ogg (audio/ogg)
 */
export function opusToOgg(packets, { channels = 2 } = {}) {
  const serial = 0x56657263; // « Verc »
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0);
  head[8] = 1; // version
  head[9] = channels;
  head.writeUInt16LE(0, 10); // pre-skip
  head.writeUInt32LE(48_000, 12);
  head.writeInt16LE(0, 16); // gain
  head[18] = 0; // mono ou stéréo
  const vendor = Buffer.from('vercel-ia');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0);
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);

  const pages = [page([head], { serial, sequence: 0, granule: 0, first: true }), page([tags], { serial, sequence: 1, granule: 0 })];
  let sequence = 2;
  for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
    const chunk = packets.slice(i, i + PACKETS_PER_PAGE);
    pages.push(page(chunk, { serial, sequence: sequence++, granule: (i + chunk.length) * SAMPLES_PER_PACKET, last: i + PACKETS_PER_PAGE >= packets.length }));
  }
  return Buffer.concat(pages);
}
