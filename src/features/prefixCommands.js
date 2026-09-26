// Commandes rapides en « ! » : !clear 20 (ou !clear 20 @membre) efface les derniers messages du salon.
import { PermissionFlagsBits } from 'discord.js';

const CLEAR = /^!(?:clear|clean|purge)\s+(\d{1,3})(?:\s+<@!?(\d+)>)?\s*$/i;
const later = (message, ms) => setTimeout(() => message.delete().catch(() => {}), ms);

/** true si le message était une commande « ! » (traitée ici, le reste du bot l'ignore). */
export async function prefixCommand(message) {
  const m = message.content.trim().match(CLEAR);
  if (!m) return false;
  const reply = async (text) => later(await message.channel.send(text).catch(() => null) ?? { delete: async () => {} }, 5000);
  if (!message.member?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
    await reply(`❌ ${message.author}, il te faut la permission **Gérer les messages** pour utiliser \`!clear\`.`);
    return true;
  }
  if (!message.guild.members.me?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
    await reply('❌ Il me manque la permission **Gérer les messages** dans ce salon.');
    return true;
  }
  const amount = Math.min(100, Math.max(1, Number(m[1])));
  const target = m[2] ?? null;
  await message.delete().catch(() => {});
  // Sans membre : les N derniers messages ; avec un membre : ses N derniers parmi les 100 derniers
  const fetched = await message.channel.messages.fetch({ limit: target ? 100 : amount }).catch(() => null);
  const list = [...(fetched?.values() ?? [])].filter((x) => x.id !== message.id && (!target || x.author.id === target)).slice(0, amount);
  const deleted = list.length ? await message.channel.bulkDelete(list, true).catch(() => null) : null;
  const n = deleted?.size ?? 0;
  const old = list.length - n;
  await reply(`🧹 **${n}** message${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}${target ? ` de <@${target}>` : ''}.${old > 0 ? `\n-# ${old} ignoré${old > 1 ? 's' : ''} : Discord bloque les messages de plus de 14 jours.` : ''}`);
  return true;
}
