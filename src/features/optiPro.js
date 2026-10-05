// 🚀 Opti Pro : ticket guidé pas à pas, sur Discord (fil privé) ET dans le launcher, mêmes messages des deux côtés.
// L'IA répond toute seule à chaque étape à partir du VRAI matériel du client ; le staff peut intervenir dans le fil.
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from 'discord.js';
import { readFresh, writeNow } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { config } from '../config.js';
import { biosLink, ocAdvice, ocPlan, parseRam } from '../../launcher/src/core/oc.js';

const KEY = 'opti-pro';
const SALON = '🚀・opti-pro';
export const MCT = 'https://go.microsoft.com/fwlink/?linkid=2156295'; // outil de création de média Windows 11 (lien officiel Microsoft)
const LOGO = 'https://zyko144.github.io/vercel-ia-/assets/logo.png';
export const STEPS = [
  ['setup', '🎫 Ton setup', 0x619fff],
  ['valider', '✅ Validation', 0x36c995],
  ['usb', '💾 Clé USB bootable', 0x9b8cff, true],
  ['format', '🧹 Formatage propre', 0xf5a623, true],
  ['bios', '🧠 BIOS & overclocking', 0xff6b6b, true],
  ['final', '⚙️ Optimisation finale', 0x2ee07a],
  ['test', '🏁 Test & validation', 0xffc439],
];
const GUIDE = {
  valider: 'Valide la demande. Sections « ## » : « ## ✅ Demande validée » (1 phrase), « ## 🧭 Ton parcours » (pour CHAQUE étape suivante — clé USB, formatage, BIOS & overclocking, optimisation finale — dis « à faire » ou « tu peux passer » et pourquoi, d’après son PC et son besoin : formatage conseillé seulement si Windows est vieux, lent, plein de restes ou s’il le demande), « ## 🧠 Overclocking » (reprends le verdict calculé, explique simplement), « ## 🎯 Gains réalistes » (fourchette honnête, jamais garantie).',
  usb: 'Guide la création de la clé USB Windows 11 : clé de 8 Go minimum (elle sera effacée), outil officiel https://www.microsoft.com/fr-fr/software-download/windows11 (« Créer un support d’installation »), étapes de l’outil, puis la touche du menu de démarrage selon la marque de SA carte mère (MSI F11, ASUS F8, Gigabyte F12, ASRock F11, portables : F12/F9/Échap).',
  format: 'Guide le formatage propre : « ## 💾 Avant » (sauvegarder saves de jeux, documents, mots de passe du navigateur, télécharger le pilote réseau de SA carte mère sur une clé), « ## 🧹 Installation » (démarrer sur la clé, supprimer seulement les partitions du disque Windows, installer), « ## 🚚 Après » (dans l’ordre : pilotes chipset AMD/Intel du site officiel, pilote de SA carte graphique du site NVIDIA/AMD, Windows Update, puis History Launcher et tes jeux).',
  bios: 'Guide BIOS pour SON matériel, avec les noms EXACTS des menus pour la marque de SA carte mère. « ## 🔄 Mets à jour ton BIOS » (cherche sur le web la DERNIÈRE version stable du BIOS de CETTE carte mère sur le site du fabricant, donne son numéro et sa date, compare avec le BIOS actuel, donne le lien de la page officielle fourni TEL QUEL ; puis la méthode : fichier sur clé USB FAT32, outil M-Flash / EZ Flash / Q-Flash / Instant Flash selon la marque, ne jamais couper le courant pendant la mise à jour ; si déjà à jour, dis-le), « ## 🧠 Processeur » (suis le verdict : « recommandé » = overclocking pas à pas avec valeurs prudentes ; « BIOS seulement » = PBO / Curve Optimizer ou limites de puissance / undervolt, sans hausse de fréquence ; « déconseillé » = pas d’overclocking, explique quoi faire à la place), « ## 🧩 Mémoire » (Resizable BAR + Above 4G Decoding activés, XMP/EXPO, puis si la RAM le permet fréquence / timings ; si elle est limitée : Gear 1, double canal, Memory Context Restore), « ## 🧪 Stabilité » (OCCT 30 min, TestMem5, processeur sous 90 °C ; écran bleu = revenir au réglage d’avant ; « Load Optimized Defaults » remet tout). Jamais plus de 1,40 V sur Intel, jamais de tension manuelle sur les Ryzen X3D.',
  final: 'Réglages finaux pour jouer comme les pros. « ## ⚡ En 1 clic » (dans History Launcher › Optimisation › Opti Pro, étape 6, « ⚡ Tout optimiser » fait tout seul et réversible, avec un point de restauration : Mode Jeu, priorité aux jeux, alimentation performances, bridage d’énergie coupé, debloat — widgets, Copilot, applis sponsorisées, Bing —, confidentialité, touches rémanentes, nettoyage, réglages de ses jeux), « ## 🪟 À vérifier à la main » (écran réglé sur sa fréquence max dans Paramètres › Affichage › Affichage avancé, carte graphique « Hautes performances » pour chaque jeu dans Paramètres › Affichage › Graphiques, overlays Discord / Steam / NVIDIA coupés si inutiles, applis au démarrage), « ## 🟩 Carte graphique » (NVIDIA : mode faible latence activé, gestion de l’alimentation performances maximales, filtrage de texture haute performance, G-SYNC + limite FPS à écran − 3 ; AMD : Anti-Lag, FreeSync, Radeon Chill coupé), « ## 🎮 En jeu » (plein écran, NVIDIA Reflex activé, réglages qui coûtent le plus de FPS). Ne propose jamais de couper Windows Defender, les mises à jour ou des services système.',
  test: 'Dernière étape : tester ensemble. « ## 🏁 Mesurer » (même partie / même endroit qu’avant, compteur FPS du launcher Ctrl+Alt+P, noter FPS moyen et 1 % low, températures max processeur / carte graphique), « ## ✅ Checklist » (chaque réglage fait pendant le ticket, à cocher), « ## 📩 Envoie-moi » (demande-lui ses FPS avant / après et ses températures pour valider). Termine par « Clique sur 🚀 Terminé quand tout est bon ».',
};
const SYSTEM = 'Tu es le technicien Opti Pro de History : tu accompagnes un joueur pour optimiser son PC, comme un vrai technicien en ticket. Français, tutoiement, chaleureux et précis. Markdown pour Discord : titres « ## », listes numérotées courtes, valeurs en **gras**. 1700 caractères maximum. Utilise seulement le matériel fourni ; s’il manque une info importante, pose UNE question à la fin. N’invente jamais un chiffre mesuré ni un lien : donne seulement des liens de sites officiels. Ne propose jamais de couper Windows Defender, les mises à jour, ni de « nettoyeur de registre ». Sécurité d’abord pour le BIOS.';

export function specsOf(raw = {}) {
  const s = Object.fromEntries(['cpu', 'board', 'gpu', 'ramText', 'cooling', 'games', 'need', 'windows', 'biosVersion', 'biosDate'].map((k) => [k, String(raw[k] ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, k === 'need' || k === 'games' ? 800 : 160)]));
  s.ram = Array.isArray(raw.ram) ? raw.ram.slice(0, 8).map((m) => ({ speed: Number(m.speed) || null, configured: Number(m.configured) || null, type: /^DDR[345]$/.test(m.type) ? m.type : null, size: Number(m.size) || null })) : parseRam(s.ramText);
  s.laptop = raw.laptop === true || /portable|laptop/i.test(`${s.cooling} ${s.ramText}`);
  s.cpuTempMax = Number(raw.cpuTempMax) || null; s.gpuTempMax = Number(raw.gpuTempMax) || null; s.ramGb = Number(raw.ramGb) || null;
  s.plan = ocPlan({ cpu: s.cpu, board: s.board, ram: s.ram });
  s.advice = ocAdvice(s.plan, s);
  s.biosUrl = biosLink(s.board, s.cpu);
  return s;
}
export function facts(s) {
  const p = s.plan;
  return [`Processeur : ${s.cpu || '?'}`, `Carte mère : ${s.board || '?'} (chipset ${p.chip ?? '?'})`, `BIOS actuel : ${s.biosVersion || 'version inconnue (à lire dans le BIOS ou msinfo32)'}${s.biosDate ? ` du ${s.biosDate}` : ''}`, s.biosUrl && `Page officielle des BIOS de cette carte mère : ${s.biosUrl}`, `Carte graphique : ${s.gpu || '?'}`,
    `RAM : ${s.ramText || `${s.ramGb ?? '?'} Go`}${p.ramSticks ? ` · ${p.ramSticks} barrette(s) ${p.ramType ?? ''} à ${p.ramNow ?? '?'} MHz (prévue ${p.ramRated ?? '?'} MHz)` : ''}`,
    `Refroidissement / alim : ${s.cooling || '?'} · ${s.laptop ? 'PC portable' : 'PC fixe'}`, s.windows && `Windows : ${s.windows}`,
    (s.cpuTempMax || s.gpuTempMax) && `Températures max mesurées : processeur ${s.cpuTempMax ?? '?'} °C, carte graphique ${s.gpuTempMax ?? '?'} °C`,
    `Overclocking processeur possible : ${p.cpuOc} (${p.cpuHow.join(' ; ')})`, `VERDICT CALCULÉ overclocking : ${s.advice.cpu} — ${s.advice.why}`,
    `Pistes RAM : ${p.ramHow.join(' ; ') || 'déjà au maximum, resserrer les timings'}`, `Jeux : ${s.games || '?'}`, `Besoin : ${s.need || '?'}`].filter(Boolean).join('\n');
}
/** Texte envoyé à l'IA : matériel, étape en cours, 10 derniers messages, consigne. */
export function promptFor(t, kind, text = '') {
  const log = t.log.slice(-10).map((m) => `${m.who === 'bot' ? 'Technicien' : m.who === 'staff' ? 'Staff' : 'Client'} : ${m.text.slice(0, 600)}`).join('\n');
  const step = STEPS[t.step];
  const links = linksFor(t).map(([l, u]) => `${l.replace(/^\S+\s/, '')} : ${u}`).join('\n');
  return `MATÉRIEL DU CLIENT\n${facts(t.specs)}\n\nÉTAPE EN COURS : ${t.step + 1}/7 ${step[1]}\n${links ? `\nLIENS OFFICIELS DE L'ÉTAPE (à donner en Markdown [texte](lien) quand c'est utile, tels quels)\n${links}\n` : ''}\nCONVERSATION RÉCENTE\n${log || '—'}\n\nCONSIGNE\n${kind === 'msg' ? `Le client écrit : « ${text.slice(0, 1500)} ». Réponds-lui précisément pour l'étape en cours (dépannage, valeur exacte, quoi cliquer). Court.` : GUIDE[step[0]]}`;
}

// Liens officiels utiles à chaque étape (boutons sur Discord et dans le launcher, donnés aussi à l'IA)
const NVIDIA = /nvidia|geforce|rtx|gtx/i, AMD = /radeon|\brx\s?\d/i;
export function linksFor(t) {
  const s = t.specs ?? {}, gpuNv = NVIDIA.test(s.gpu), gpuAmd = AMD.test(s.gpu), ryzen = /ryzen|amd/i.test(s.cpu);
  const gpu = [!gpuAmd && ['🟩 Pilote NVIDIA', 'https://www.nvidia.com/fr-fr/drivers/'], !gpuNv && ['🟥 Pilote AMD', 'https://www.amd.com/fr/support/download/drivers.html']];
  return ({
    usb: [['💾 Outil Microsoft (clé USB)', MCT], ['🪟 Page Windows 11', 'https://www.microsoft.com/fr-fr/software-download/windows11']],
    format: [/msi\.com/.test(s.biosUrl) && ['🧩 Pilotes de ta carte mère', s.biosUrl.replace(/#bios$/i, '#driver')], ryzen ? ['🔴 Pilotes chipset AMD', 'https://www.amd.com/fr/support/download/drivers.html'] : ['🔵 Pilotes chipset Intel', 'https://www.intel.fr/content/www/fr/fr/support/detect.html'], ...gpu, ['🧽 DDU (nettoyage pilote)', 'https://www.wagnardsoft.com/display-driver-uninstaller-ddu-']],
    bios: [s.biosUrl && ['🔄 Dernier BIOS de ta carte mère', s.biosUrl], ['🧪 OCCT (stabilité)', 'https://www.ocbase.com/download'], ['🧠 TestMem5 (RAM)', 'https://github.com/CoolCmd/TestMem5'], ['🌡 HWiNFO (températures)', 'https://www.hwinfo.com/download/'], ['🔍 CPU-Z', 'https://www.cpuid.com/softwares/cpu-z.html']],
    final: [...gpu, ['🖥 Test d’écran (Hz)', 'https://www.testufo.com/'], ['🌡 HWiNFO', 'https://www.hwinfo.com/download/']],
    test: [['📊 CapFrameX (FPS, 1 % low)', 'https://www.capframex.com/'], ['🧪 Cinebench', 'https://www.maxon.net/fr/downloads/cinebench-2024-downloads'], ['🌡 HWiNFO', 'https://www.hwinfo.com/download/'], ['🧪 OCCT', 'https://www.ocbase.com/download']],
  }[STEPS[t.step][0]] ?? []).filter(Boolean);
}
// ---------- stockage ----------
let queue = Promise.resolve();
function mutate(fn) { const r = queue.then(async () => { const all = structuredClone((await readFresh(KEY)) ?? {}); const v = await fn(all); await writeNow(KEY, all); return v; }); queue = r.catch(() => {}); return r; }
const all = async () => (await readFresh(KEY)) ?? {};
export async function sessionOf(accountId) { return Object.values(await all()).filter((t) => t.id && t.owner === accountId && !t.closed).sort((a, b) => b.at - a.at)[0] ?? null; }
const byThread = async (threadId) => Object.values(await all()).find((t) => t.thread === threadId) ?? null;

// ---------- IA ----------
let askImpl = async (content, web = false) => (await (await import('../ai/gemini.js')).chat({ system: SYSTEM, content, web, thinking: 'low', tag: 'opti-pro' })).text;
export function setAsk(fn) { askImpl = fn; } // tests
async function botSay(id, kind, text) {
  const t = (await all())[id]; if (!t) return null;
  const reply = await askImpl(promptFor(t, kind, text), STEPS[t.step][0] === 'bios' || /bios|pilote|driver|version|lien/i.test(text)).catch(() => null) || 'Je n’arrive pas à joindre l’IA pour le moment. Réessaie dans une minute, ou clique sur « 👤 Parler à un humain ».';
  return push(id, { who: 'bot', text: reply.slice(0, 3900) });
}
async function push(id, msg) {
  const t = await mutate((a) => { if (!a[id]) return null; a[id].log.push({ ...msg, step: a[id].step, at: Date.now() }); a[id].log = a[id].log.slice(-60); a[id].updatedAt = Date.now(); return a[id]; });
  if (t?.thread) await postThread(t, t.log.at(-1)).catch(() => {});
  return t;
}

// ---------- actions (communes Discord / appli) ----------
export async function startSession(account, raw, discordId = null) {
  const old = await sessionOf(account.id); if (old) return old;
  const id = randomUUID(); const specs = specsOf(raw);
  await mutate((a) => { a[id] = { id, owner: account.id, name: String(account.pseudo ?? '').slice(0, 40), discordId: discordId ?? account.discordId ?? null, thread: null, step: 1, specs, log: [], at: Date.now(), updatedAt: Date.now() }; });
  await push(id, { who: 'user', text: `Mon setup : ${specs.cpu} · ${specs.gpu} · ${specs.ramText || `${specs.ramGb ?? '?'} Go`}\n${specs.need}` });
  await openThread(id).catch(() => {});
  return botSay(id, 'step');
}
/** next | skip | done | human | close | msg */
export async function act(id, action, text = '', who = 'user') {
  const t = (await all())[id]; if (!t || t.closed) return { error: 'Ticket fermé. Ouvre une nouvelle demande Opti Pro.' };
  if (action === 'msg') { if (!String(text).trim()) return t; await push(id, { who, text: String(text).slice(0, 1500) }); return who === 'staff' ? (await all())[id] : botSay(id, 'msg', text); }
  if (action === 'human') { await callHuman(t); return push(id, { who: 'bot', text: '👤 Un membre de l’équipe est prévenu et va te répondre ici. En attendant, je reste là pour tes questions.' }); }
  if (action === 'close' || (action === 'done' && t.step === STEPS.length - 1)) {
    await push(id, { who: 'bot', text: action === 'done' ? '# Ton PC est prêt 🚀\nMerci pour ta confiance ! Toutes les étapes sont validées. Si un souci revient, rouvre un ticket Opti Pro.' : '🔒 Ticket fermé. Tu peux en rouvrir un quand tu veux.' });
    const r = await mutate((a) => { a[id].closed = true; a[id].done = action === 'done'; return a[id]; });
    await closeThread(r).catch(() => {}); return r;
  }
  if (['next', 'skip', 'skip2', 'done'].includes(action)) {
    if (t.step >= STEPS.length - 1) return t;
    const n = action === 'skip2' && STEPS[t.step + 2]?.[3] ? 2 : action === 'skip' && STEPS[t.step + 1]?.[3] ? 1 : 0;
    await mutate((a) => { a[id].step = Math.min(STEPS.length - 1, a[id].step + n + 1); });
    if (n) await push(id, { who: 'user', text: `⏭ Je passe : ${STEPS.slice(t.step + 1, t.step + 1 + n).map((x) => x[1]).join(', ')}.` });
    return botSay(id, 'step');
  }
  return { error: 'Action inconnue.' };
}

// ---------- Discord ----------
let client = null; let chan = null;
const isStaff = (id) => id === config.ownerId;
function embedFor(t, m) {
  const step = STEPS[m.step ?? t.step];
  const e = new EmbedBuilder().setColor(m.who === 'bot' ? step[2] : 0x2b2d31).setDescription(m.text.slice(0, 4000));
  if (m.who === 'bot') e.setAuthor({ name: `🚀 Opti Pro · Étape ${(m.step ?? t.step) + 1}/7 · ${step[1]}`, iconURL: LOGO }).setFooter({ text: `${STEPS.map((_, i) => (i <= (m.step ?? t.step) ? '🟩' : '⬛')).join('')}  ·  Technicien History` });
  else e.setAuthor({ name: `${m.who === 'staff' ? '🛠 Staff History' : `💬 ${t.name}`}${m.fromApp ? ' · depuis le launcher' : ''}` });
  return e;
}
function buttons(t) {
  const last = t.step >= STEPS.length - 1, next = STEPS[t.step + 1];
  const row = [new ButtonBuilder().setCustomId(`opro:${last ? 'done' : 'next'}:${t.id}`).setLabel(last ? '🚀 Terminé' : `✅ Fait · ${next[1]}`.slice(0, 80)).setStyle(ButtonStyle.Success)];
  if (next?.[3]) row.push(new ButtonBuilder().setCustomId(`opro:skip:${t.id}`).setLabel(`⏭ Passer ${next[1].slice(2).trim()}`.slice(0, 80)).setStyle(ButtonStyle.Secondary));
  if (next?.[3] && STEPS[t.step + 2]?.[3]) row.push(new ButtonBuilder().setCustomId(`opro:skip2:${t.id}`).setLabel(`⏭ Passer jusqu’à ${STEPS[t.step + 3][1].slice(2).trim()}`.slice(0, 80)).setStyle(ButtonStyle.Secondary));
  row.push(new ButtonBuilder().setCustomId(`opro:human:${t.id}`).setLabel('👤 Parler à un humain').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`opro:close:${t.id}`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger));
  const links = linksFor(t);
  return [new ActionRowBuilder().addComponents(row), ...(links.length ? [new ActionRowBuilder().addComponents(links.slice(0, 5).map(([l, u]) => new ButtonBuilder().setLabel(l).setURL(u).setStyle(ButtonStyle.Link)))] : [])];
}
async function postThread(t, m) {
  if (!client || !t.thread || m.fromDiscord) return;
  const th = await client.channels.fetch(t.thread).catch(() => null); if (!th) return;
  await th.send({ embeds: [embedFor(t, m)], components: m.who === 'bot' && !t.closed ? buttons(t) : [], allowedMentions: { parse: [] } });
}
async function salon() {
  if (chan) return chan;
  const { HOME_GUILD } = await import('./launcherServers.js');
  const g = await client?.guilds.fetch(HOME_GUILD).catch(() => null); if (!g) return null;
  await g.channels.fetch().catch(() => {});
  chan = g.channels.cache.find((c) => c.name === SALON) ?? await g.channels.create({ name: SALON, type: ChannelType.GuildText, topic: 'Opti Pro : ton PC optimisé pas à pas, avec l’IA et l’équipe History.', reason: 'Tickets Opti Pro',
    permissionOverwrites: [{ id: g.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.EmbedLinks] }] }).catch(() => null);
  if (chan && !(await chan.messages.fetch({ limit: 10 }).catch(() => new Map())).some?.((m) => m.author.id === client.user.id)) await chan.send(panel()).catch(() => {});
  return chan;
}
function panel() {
  const e = new EmbedBuilder().setColor(0xff9f43).setAuthor({ name: 'History · Opti Pro', iconURL: LOGO }).setTitle('🚀 Ton PC réglé comme un pro')
    .setDescription('Un ticket privé où notre technicien IA te guide **pas à pas**, d’après **ton vrai matériel** — et l’équipe peut intervenir à tout moment.\n\n**1.** 🎫 Ton setup et ton besoin\n**2.** ✅ Validation de ta demande\n**3.** 💾 Clé USB bootable *(facultatif)*\n**4.** 🧹 Formatage propre *(facultatif)*\n**5.** 🧠 BIOS & overclocking *(si ton matériel le permet)*\n**6.** ⚙️ Optimisation finale Windows, NVIDIA, énergie\n**7.** 🏁 Test & validation : ton PC est prêt 🚀')
    .addFields({ name: 'Inclus', value: '🧹 Formatage complet · ⚙️ Windows (services, confidentialité, latence, debloat) · 🟩 Panneau NVIDIA · 🌡 Températures & stabilité · 🧠 BIOS + overclocking processeur · 🧩 RAM (timings & fréquence) · 🔒 Processeur bloqué ? gains via le BIOS' })
    .setFooter({ text: 'Réservé à ⭐ Opti Pro · aussi dans History Launcher › Optimisation' });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('opro:open').setLabel('🚀 Ouvrir mon ticket Opti Pro').setStyle(ButtonStyle.Success))] };
}
async function openThread(id) {
  const t = (await all())[id]; const c = await salon();
  if (!t || t.thread || !c || !t.discordId) return;
  const member = await c.guild.members.fetch(t.discordId).catch(() => null); if (!member) return;
  const th = await c.threads.create({ name: `🚀 ${t.name || member.user.username} · Opti Pro`.slice(0, 100), type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 10080 });
  await th.members.add(t.discordId).catch(() => {});
  await mutate((a) => { a[id].thread = th.id; });
  await th.send({ content: `<@${t.discordId}> ton ticket Opti Pro est ouvert. Écris ici quand tu veux : je réponds tout de suite. Les mêmes messages sont dans History Launcher › Optimisation.`, allowedMentions: { users: [t.discordId] } });
  for (const m of t.log) await postThread({ ...t, thread: th.id }, m).catch(() => {});
}
async function closeThread(t) { const th = t?.thread && client ? await client.channels.fetch(t.thread).catch(() => null) : null; await th?.setLocked(true).catch(() => {}); await th?.setArchived(true).catch(() => {}); }
async function callHuman(t) {
  const owner = client ? await client.users.fetch(config.ownerId).catch(() => null) : null;
  await owner?.send({ content: `👤 **${t.name}** demande un humain dans son ticket Opti Pro (étape ${t.step + 1}/7 · ${STEPS[t.step][1]})${t.thread ? ` : <#${t.thread}>` : ' (depuis le launcher, sans Discord lié)'}.` }).catch(() => {});
}
async function accountFor(discordId) { const { accountByDiscord } = await import('./launcherAccounts.js'); return accountByDiscord(discordId); }
async function allowed(account, discordId) { if (isStaff(discordId)) return true; const { premiumOf } = await import('./launcherPremium.js'); return (await premiumOf(account)).opti; }
const lastSpecs = async (accountId) => ((await readFresh('opti-pro-specs')) ?? {})[accountId] ?? {};
async function mutateSpecs(accountId, raw) { const s = (await readFresh('opti-pro-specs')) ?? {}; s[accountId] = { cpu: raw.cpu, board: raw.board, gpu: raw.gpu, ramText: raw.ramText, cooling: raw.cooling }; await writeNow('opti-pro-specs', s); }

/** Boutons / fenêtre « opro:… ». Renvoie false si ce n'est pas pour nous. */
export async function onOptiProInteraction(interaction) {
  const [k, action, id] = String(interaction.customId ?? '').split(':'); if (k !== 'opro') return false;
  const eph = { flags: 64 };
  if (action === 'open' || action === 'form') {
    const account = await accountFor(interaction.user.id);
    if (!account) return interaction.reply({ content: '🔗 Lie d’abord ton compte History (`/launcher lier`) : ton ticket sera aussi dans ton launcher.', ...eph }), true;
    if (!(await allowed(account, interaction.user.id))) return interaction.reply({ content: '⭐ Le ticket Opti Pro est réservé à **Opti Pro** ou au **Pack Premium** (essai gratuit de 3 jours dans History Launcher › Premium).', ...eph }), true;
    const cur = await sessionOf(account.id);
    if (cur) { await openThread(cur.id).catch(() => {}); const t = await sessionOf(account.id); return interaction.reply({ content: t?.thread ? `🎫 Tu as déjà un ticket : <#${t.thread}>` : '🎫 Tu as déjà un ticket ouvert dans History Launcher › Optimisation.', ...eph }), true; }
    const p = await lastSpecs(account.id);
    const f = (cid, label, ph, v, style = TextInputStyle.Short) => { const i = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setPlaceholder(ph).setRequired(true).setMaxLength(style === TextInputStyle.Short ? 160 : 800); if (v) i.setValue(String(v).slice(0, 160)); return new ActionRowBuilder().addComponents(i); };
    await interaction.showModal(new ModalBuilder().setCustomId('opro:setup').setTitle('🚀 Ton setup Opti Pro').addComponents(
      f('cpu', 'Processeur / carte mère', 'Ryzen 5 7600 / MSI B650 Tomahawk', p.cpu ? `${p.cpu}${p.board ? ` / ${p.board}` : ''}` : ''),
      f('gpu', 'Carte graphique', 'RTX 4070', p.gpu),
      f('ram', 'RAM (barrettes, type, MHz)', '2x8 Go DDR4 3200', p.ramText),
      f('cooling', 'Refroidissement, alim, fixe ou portable', 'Watercooling 240 mm, 750 W, PC fixe', p.cooling),
      f('need', 'Tes jeux et ce que tu veux', 'Fortnite en 1080p 240 Hz, je veux des FPS stables…', '', TextInputStyle.Paragraph)));
    return true;
  }
  if (action === 'setup') {
    await interaction.deferReply(eph);
    const account = await accountFor(interaction.user.id); if (!account) return interaction.editReply('🔗 Lie d’abord ton compte History.'), true;
    if (!allowAttempt('opti-pro-open', account.id, 3, 3_600_000)) return interaction.editReply('⏳ Trois tickets par heure maximum.'), true;
    const v = (x) => interaction.fields.getTextInputValue(x); const [cpu, board = ''] = v('cpu').split('/').map((x) => x.trim());
    const raw = { cpu, board, gpu: v('gpu'), ramText: v('ram'), cooling: v('cooling'), need: v('need'), games: v('need') };
    await mutateSpecs(account.id, raw);
    const t = await startSession(account, raw, interaction.user.id);
    return interaction.editReply(t?.thread ? `✅ Ticket ouvert : <#${t.thread}> — le technicien t’a déjà répondu.` : '✅ Ticket ouvert dans History Launcher › Optimisation (je n’ai pas pu créer le fil : rejoins le serveur History).'), true;
  }
  const t = (await all())[id];
  if (!t) return interaction.reply({ content: 'Ticket introuvable.', ...eph }), true;
  if (interaction.user.id !== t.discordId && !isStaff(interaction.user.id)) return interaction.reply({ content: 'Ce ticket n’est pas le tien.', ...eph }), true;
  if (!allowAttempt('opti-pro-act', t.owner, 40, 3_600_000)) return interaction.reply({ content: '⏳ Doucement : réessaie dans quelques minutes.', ...eph }), true;
  await interaction.deferUpdate().catch(() => {});
  await interaction.message?.edit({ components: [] }).catch(() => {}); // un seul clic par étape
  await act(id, action);
  return true;
}
async function onMessage(m) {
  if (m.author.bot || !m.channel?.isThread?.() || m.channel.parentId !== chan?.id || !m.content.trim()) return;
  const t = await byThread(m.channel.id); if (!t || t.closed) return;
  const who = m.author.id === t.discordId ? 'user' : isStaff(m.author.id) ? 'staff' : null; if (!who) return;
  if (who === 'user' && !allowAttempt('opti-pro-act', t.owner, 40, 3_600_000)) return void m.react('⏳').catch(() => {});
  await m.channel.sendTyping().catch(() => {});
  await mutate((a) => { a[t.id].log.push({ who, text: m.content.slice(0, 1500), step: a[t.id].step, at: Date.now(), fromDiscord: true }); a[t.id].updatedAt = Date.now(); });
  if (who === 'user') await botSay(t.id, 'msg', m.content);
}
export function startOptiPro(c) { if (client) return; client = c; c.on('messageCreate', (m) => { onMessage(m).catch(() => {}); }); setTimeout(() => salon().catch(() => {}), 15_000).unref?.(); }

// ---------- API du launcher ----------
const view = (t) => t && { id: t.id, links: t.closed ? [] : linksFor(t), step: t.step, closed: Boolean(t.closed), done: Boolean(t.done), thread: Boolean(t.thread), advice: t.specs?.advice, steps: STEPS.map((s) => s[1]), log: t.log.map(({ who, text, step, at }) => ({ who, text, step, at })) };
export async function handleOptiProApi(req, res, url, account, { readJson, send }) {
  res.setHeader('Cache-Control', 'no-store');
  account = { ...account, discordId: (await (await import('./launcherAccounts.js')).findAccount(account.id))?.discordId ?? null };
  if (req.method === 'GET') return send(res, 200, { session: view(await sessionOf(account.id)) });
  if (!(await allowed(account, account.discordId))) return send(res, 403, { error: 'premium' });
  const b = await readJson(req);
  if (url.pathname.endsWith('/action')) {
    const cur = await sessionOf(account.id); if (!cur) return send(res, 404, { error: 'Aucun ticket ouvert.' });
    if (!allowAttempt('opti-pro-act', account.id, 40, 3_600_000)) return send(res, 429, { error: 'Doucement : réessaie dans quelques minutes.' });
    if (b.action === 'msg') { await mutate((a) => { a[cur.id].log.push({ who: 'user', text: String(b.text ?? '').slice(0, 1500), step: a[cur.id].step, at: Date.now(), fromApp: true }); }); const fresh = (await all())[cur.id]; await postThread(fresh, fresh.log.at(-1)).catch(() => {}); const r = await botSay(cur.id, 'msg', String(b.text ?? '')); return send(res, 200, { session: view(r) }); }
    const r = await act(cur.id, String(b.action ?? '')); return send(res, r?.error ? 400 : 200, r?.error ? r : { session: view(r) });
  }
  if (!allowAttempt('opti-pro-open', account.id, 3, 3_600_000)) return send(res, 429, { error: 'Trois tickets par heure maximum.' });
  await mutateSpecs(account.id, b.specs ?? {});
  return send(res, 200, { session: view(await startSession(account, b.specs ?? {})) });
}
