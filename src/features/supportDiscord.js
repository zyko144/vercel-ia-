import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { config } from '../config.js';
import { load } from '../storage.js';
import { profileOf } from './launcherAccounts.js';
import { isAllowed } from '../dashboard/auth.js';
import { mutateSupport, supportDetail, supportList, supportUpdate } from './launcherSupport.js';
let client; let running = false; const pending = new Set();
export async function supportIdentity(account, app = 'launcher') {
  const data = await load('launcher-comptes', {}); const linked = data?.accounts?.[account.id]?.discordId;
  const user = linked && client ? await client.users.fetch(linked).catch(() => null) : null;
  return { avatar: user?.displayAvatarURL({ extension:'png', size:128 }) ?? account.profile?.avatar ?? `https://zyko144.github.io/vercel-ia-/${app === 'clips' ? 'clips/logo.png' : 'assets/logo.png'}`, discordId: linked ?? null, displayName: user?.globalName ?? user?.username ?? account.pseudo };
}
export function supportEmbed(t) {
  const labels={received:'Reçue',investigating:'En cours',resolved:'Résolue'};
  const embed=new EmbedBuilder().setColor(t.status==='resolved'?0x36c995:0x619fff).setTitle(`${t.app==='clips'?'History Clips':'History Launcher'} · ${t.title}`.slice(0,256)).setDescription(t.description).setAuthor({name:t.displayName||t.name,...(t.avatar?{iconURL:t.avatar}:{})}).addFields({name:'Statut',value:labels[t.status]??t.status,inline:true},{name:'Compte',value:t.discordId?`Discord lié · ${t.discordId}`:'Compte History',inline:true}).setFooter({text:`Support privé · ${t.id}`});
  if(t.avatar)embed.setThumbnail(t.avatar);
  if(t.reply)embed.addFields({name:'Réponse de l’équipe',value:t.reply.slice(0,1024)});
  return embed;
}
async function deliver(id) {
  const t=await supportDetail(id);if(!t||!client)return;
  if (!t.avatar) {
    const account=(await load('launcher-comptes', {}))?.accounts?.[t.owner];
    const identity=await supportIdentity({id:t.owner,pseudo:t.name,profile:account?profileOf(account):{}},t.app);
    Object.assign(t,identity);await mutateSupport(all=>{if(all[id])Object.assign(all[id],identity);});
  }
  const owner=await client.users.fetch(config.ownerId); const dm=await owner.createDM();
  const components=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`support:reply:${id}`).setLabel('Répondre').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`support:resolve:${id}`).setLabel('Marquer résolue').setStyle(ButtonStyle.Success))];
  const payload={embeds:[supportEmbed(t)],components,allowedMentions:{parse:[]}};
  if(t.discordMessage) { const msg=await dm.messages.fetch(t.discordMessage);if(t.img)payload.embeds[0].setImage(msg.embeds[0]?.image?.url ?? null);await msg.edit(payload);await mutateSupport(all=>{if(all[id])all[id].discordSyncedAt=t.updatedAt;});return; }
  if(t.img) {const [header,data]=t.img.split(',');const ext=header.includes('png')?'png':header.includes('webp')?'webp':'jpg';payload.files=[{attachment:Buffer.from(data,'base64'),name:`capture.${ext}`}];payload.embeds[0].setImage(`attachment://capture.${ext}`);}
  const sent=await dm.send({...payload,nonce:id.replaceAll('-','').slice(0,25),enforceNonce:true});
  await mutateSupport(all=>{if(all[id]){all[id].discordMessage=sent.id;all[id].discordSyncedAt=t.updatedAt;}});
}
async function flush(){if(running||!client)return;running=true;try{for(const id of [...pending].slice(0,10)){try{await deliver(id);pending.delete(id);}catch{ /* The saved report remains accessible; retry on next tick. */ }}}finally{running=false;}}
export function queueSupport(id){pending.add(id);void flush();}
export function startSupportDiscord(c){if(client)return;client=c;const retry=async()=>{try{for(const t of await supportList())if(!t.discordMessage||(t.discordSyncedAt??0)<t.updatedAt)pending.add(t.id);await flush();}catch{}};void retry();setInterval(retry,60000).unref();}
export async function onSupportInteraction(interaction){
  const parts=String(interaction.customId??'').split(':');if(parts[0]!=='support')return false;
  if(!isAllowed(interaction.user.id)){await interaction.reply({content:'Accès réservé à l’équipe de support.',ephemeral:true});return true;}
  const id=parts[2];const t=await supportDetail(id);if(!t){await interaction.reply({content:'Demande introuvable.',ephemeral:true});return true;}
  if(parts[1]==='reply'){
    const modal=new ModalBuilder().setCustomId(`support:save:${id}`).setTitle('Répondre à la demande');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply').setLabel('Réponse visible sur le site et dans les apps').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true).setValue(t.reply||'')));
    await interaction.showModal(modal);
  }else if(parts[1]==='save'||parts[1]==='resolve'){
    await interaction.deferReply({ephemeral:true});
    try{await supportUpdate({id,status:parts[1]==='resolve'?'resolved':'investigating',reply:parts[1]==='save'?interaction.fields.getTextInputValue('reply'):t.reply});await interaction.editReply('Enregistré. La réponse et le statut sont synchronisés avec le site et les applications.');}
    catch{await interaction.editReply('Enregistrement impossible. Réessaie ; la demande reste disponible dans le centre Apps.');}
  }
  return true;
}
