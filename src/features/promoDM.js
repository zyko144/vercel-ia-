// Vidéos de présentation en MP : chaque membre des serveurs History (launcher + History Clips) et quelques
// personnes de DDV reçoivent un beau message (couverture, points forts, liens des vidéos), une seule fois.
// Boutons 1 à 5 ⭐ + commentaire facultatif : chaque note est envoyée en MP au chef.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { config } from '../config.js';
import { load, save } from '../storage.js';
import { HOME_GUILD } from './launcherServers.js';

const SITE = 'https://zyko144.github.io/vercel-ia-';
const DONE = 'promo-dm';
const RATINGS = 'promo-notes';
const DDV = ['681908406298083407', '923551925113323542', '855176142096039997', '1543726919168557087', '1242427559040253952', '1035337014620459028'];
const GUILDS = [HOME_GUILD, config.clips?.guildId].filter(Boolean);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function promoMessage(userId) {
  const launcher = new EmbedBuilder().setColor(0x2f8bff).setTitle('🚀 History Launcher · la vidéo').setURL(`${SITE}/#video`)
    .setDescription(['Tous tes jeux dans une seule appli : **Steam, Epic, Xbox, EA, FiveM, Roblox…**', '',
      '⚡ **Optimisation du PC** testée jeu par jeu, annulable en un clic',
      '📊 **Vrais FPS** en jeu (vert / orange / rouge) et overlay déplaçable',
      '🚗 **Rocket League en direct** : rang, MMR, victoires et séries',
      '👥 **Amis en direct** : qui joue à quoi, messages et appels', '',
      `▶ **[Regarder la présentation](${SITE}/#video)** · [Télécharger](${SITE})`].join('\n'))
    .setImage(`${SITE}/assets/accueil.webp`);
  const clips = new EmbedBuilder().setColor(0xffc233).setTitle('🎬 History Clips · la vidéo').setURL(`${SITE}/clips/#video`)
    .setDescription(['Ta dinguerie en jeu ? **F8** et les dernières secondes sont gardées en MP4.', '',
      '✂ **Découpe précise**, format vertical et lien web à partager',
      '📤 **Envoi sur Discord** en un clic, rangé par jeu',
      '🪶 **Léger** : tourne en fond sans gêner tes FPS', '',
      `▶ **[Regarder la présentation](${SITE}/clips/#video)** · [Télécharger](${SITE}/clips/)`].join('\n'))
    .setImage(`${SITE}/clips/home.webp`);
  const stars = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`promo:rate:${n}`).setLabel('⭐'.repeat(n)).setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)));
  return {
    content: `Salut <@${userId}> 👋\n# 🎥 Les vidéos de présentation sont sorties !\nDécouvre **History Launcher** et **History Clips** en vidéo 👇\n\n**Ton avis compte :** note les applis de 1 à 5 ⭐ avec les boutons en bas (commentaire facultatif).`,
    embeds: [launcher, clips], components: [stars], allowedMentions: { users: [userId] },
  };
}

/** Envoie le MP à tous les membres des serveurs History puis aux personnes de DDV (une fois chacun, doucement). */
export async function sendPromoDMs(client) {
  const done = new Set((await load(DONE, null)) ?? []);
  const ids = new Set();
  for (const gid of GUILDS) {
    const g = await client.guilds.fetch(gid).catch(() => null);
    if (!g) { console.warn('[vidéos MP] le bot n’est pas sur le serveur', gid); continue; }
    const members = await g.members.fetch().catch((err) => { console.warn(`[vidéos MP] membres de ${g.name} illisibles (active « Server Members Intent » dans le portail Discord) :`, err.message); return null; });
    for (const m of members?.values() ?? []) if (!m.user.bot) ids.add(m.id);
  }
  for (const id of DDV) ids.add(id);
  let sent = 0;
  for (const id of ids) {
    if (done.has(id)) continue;
    const user = await client.users.fetch(id).catch(() => null);
    const ok = user && await user.send(promoMessage(id)).then(() => true, () => false);
    done.add(id); await save(DONE, [...done]); // MP fermés : on ne réessaie pas
    if (ok) sent += 1;
    await wait(2500); // doucement : Discord n'aime pas les envois en rafale
  }
  if (sent) console.log(`🎥 Vidéos envoyées en MP à ${sent} membre(s)`);
}

/** Boutons ⭐ et commentaire : note gardée et envoyée en MP au chef. */
export async function onPromoInteraction(client, i) {
  if (i.isButton() && i.customId.startsWith('promo:rate:')) {
    const n = Number(i.customId.split(':')[2]);
    const modal = new ModalBuilder().setCustomId(`promo:note:${n}`).setTitle(`Ta note : ${'⭐'.repeat(n)}`)
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c').setLabel('Un commentaire ? (facultatif)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800)));
    return i.showModal(modal);
  }
  if (i.isModalSubmit() && i.customId.startsWith('promo:note:')) {
    const n = Math.min(5, Math.max(1, Number(i.customId.split(':')[2]) || 0));
    const comment = i.fields.getTextInputValue('c')?.trim() ?? '';
    const all = (await load(RATINGS, null)) ?? {};
    all[i.user.id] = { stars: n, comment, at: Date.now() };
    await save(RATINGS, all);
    await i.reply({ content: `Merci pour ta note ${'⭐'.repeat(n)} ! 🙏` }).catch(() => {});
    const owner = await client.users.fetch(config.ownerId).catch(() => null);
    await owner?.send(`📝 **Nouvelle note** de <@${i.user.id}> (${i.user.username}) : ${'⭐'.repeat(n)}${'☆'.repeat(5 - n)} **${n}/5**${comment ? `\n> ${comment.replace(/\n/g, '\n> ')}` : ''}`).catch(() => {});
    return true;
  }
  return false;
}
