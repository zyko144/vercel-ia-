// Images d'exemple du site (carte de bienvenue, carte de profil), dessinées par le vrai code du bot.
//   node tools/make-site-exemples.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'site-'));
process.env.SUPABASE_URL = '';
process.env.DISCORD_TOKEN ||= 'a.b.c';
process.env.GEMINI_API_KEY ||= 'x';
writeFileSync(path.join(process.env.STORAGE_DIR, 'niveaux.json'), JSON.stringify({ g1: { u1: { xp: 5400, messages: 1240, voiceMin: 720, streak: 12, weekWins: 2 }, u2: { xp: 9000 } } }));
const { default: sharp } = await import('sharp');
const { Collection } = await import('discord.js');
const av = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fd2"/><stop offset="1" stop-color="#5ff0ff"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="64" cy="50" r="24" fill="#0b0812" opacity=".85"/><ellipse cx="64" cy="120" rx="44" ry="36" fill="#0b0812" opacity=".85"/></svg>`)).png().toBuffer();
const user = { id: 'u1', username: 'lina', displayAvatarURL: () => `data:image/png;base64,${av.toString('base64')}` };
const member = { user, id: 'u1', displayName: 'Lina', guild: { id: 'g1', name: 'Les Veilleurs', memberCount: 1284 } };
const guild = { id: 'g1', name: 'Les Veilleurs', members: { cache: new Collection([['u1', member]]) } };
const { welcomeCard } = await import('../src/features/community.js');
const { profileCard } = await import('../src/features/levels.js');
const w = await welcomeCard(member);
const p = await profileCard(guild, user);
const buf = (a) => a.attachment ?? a;
await sharp(buf(w)).webp({ quality: 88 }).toFile('site/images/bienvenue.webp');
await sharp(buf(p.files?.[0] ?? p)).webp({ quality: 88 }).toFile('site/images/profil.webp');
console.log('ok');
process.exit(0);
