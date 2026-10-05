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
  const d=t.diagnostic??{};const pc=[d.cpu&&`🧠 ${d.cpu}`,d.gpu&&`🎮 ${d.gpu}${d.driver?` · pilote ${d.driver}`:''}`,d.memoryGB&&`💾 ${d.memoryGB} Go de RAM${d.diskFreeGB!=null?` · ${d.diskFreeGB} Go libres sur C:`:''}`,d.windows&&`🪟 ${d.windows}${d.uptimeDays!=null?` · allumé depuis ${d.uptimeDays} j`:''}`,(d.cpuTempMax||d.gpuTempMax)&&`🌡️ Max 24 h : CPU ${d.cpuTempMax??'?'}°C · GPU ${d.gpuTempMax??'?'}°C`,d.health&&`❤️ Santé ${d.health}/100`,d.version&&`📦 Launcher ${d.version}`].filter(Boolean);
  if(pc.length)embed.addFields({name:'🖥️ Analyse du PC',value:pc.join('\n').slice(0,1024)});
  if(t.reply)embed.addFields({name:'Réponse de l’équipe',value:t.reply.slice(0,1024)});
  return embed;
}
async function deliver(id) {
  const t=await supportDetail(id);if(!t||!client)return;
  if(t.status==='resolved'){if(t.discordThread&&t.discordThread!=='fermé')await closeTicket(t);return;}
  if (!t.avatar) {
    const account=(await load('launcher-comptes', {}))?.accounts?.[t.owner];
    const identity=await supportIdentity({id:t.owner,pseudo:t.name,profile:account?profileOf(account):{}},t.app);
    Object.assign(t,identity);await mutateSupport(all=>{if(all[id])Object.assign(all[id],identity);});
  }
  // Chaque demande a son fil dans le salon privé #support-launcher du serveur History Launcher ET de DDV ; un message du chef dans un fil = la réponse
  const [home,ddv]=await supportChannels(); if(!home)return;
  const components=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`support:reply:${id}`).setLabel('Répondre').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`support:resolve:${id}`).setLabel('Marquer résolue').setStyle(ButtonStyle.Success))];
  const post=async(ch,msgId,nonce)=>{
    const payload={embeds:[supportEmbed(t)],components,allowedMentions:{parse:[]}};
    if(msgId){const msg=await ch.messages.fetch(msgId);if(t.img)payload.embeds[0].setImage(msg.embeds[0]?.image?.url ?? null);await msg.edit(payload);return null;}
    if(t.img){const [header,data]=t.img.split(',');const ext=header.includes('png')?'png':header.includes('webp')?'webp':'jpg';payload.files=[{attachment:Buffer.from(data,'base64'),name:`capture.${ext}`}];payload.embeds[0].setImage(`attachment://capture.${ext}`);}
    const sent=await ch.send({...payload,nonce,enforceNonce:true});
    const thread=await sent.startThread({name:`${t.displayName||t.name} · ${t.title}`.slice(0,100),autoArchiveDuration:10080}).catch(()=>null);
    await thread?.send({content:'✍️ Écris ta réponse ici : elle arrive tout de suite dans l’appli de la personne.',allowedMentions:{parse:[]}}).catch(()=>{});
    return {message:sent.id,thread:thread?.id??'aucun'};
  };
  const nonce=id.replaceAll('-','').slice(0,24);
  const main=await post(home,t.discordThread&&t.discordMessage,`h${nonce}`);
  const mirror=ddv?await post(ddv,t.discordMirror?.message,`d${nonce}`).catch(()=>null):null;
  await mutateSupport(all=>{if(all[id]){if(main){all[id].discordMessage=main.message;all[id].discordThread=main.thread;}if(mirror)all[id].discordMirror=mirror;all[id].discordSyncedAt=t.updatedAt;}});
}
// Demande résolue : le fil et le message disparaissent des 2 serveurs, la conversation part en MP au chef
async function closeTicket(t){
  const chans=await supportChannels();
  const lines=[`Demande ${t.id} · ${t.displayName||t.name} · ${t.title}`,'',t.description,'',`Réponse : ${t.reply||'—'}`,''];
  for(const [i,ref] of [[0,{message:t.discordMessage,thread:t.discordThread}],[1,t.discordMirror]]){
    const thread=ref?.thread&&ref.thread!=='aucun'?await client.channels.fetch(ref.thread).catch(()=>null):null;
    const msgs=thread?[...(await thread.messages.fetch({limit:100}).catch(()=>new Map())).values()].reverse():[];
    if(msgs.length)lines.push(`--- Fil ${thread.guild?.name??''} ---`,...msgs.filter((m)=>m.content).map((m)=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}] ${m.author.username} : ${m.content}`),'');
    await thread?.delete('Demande résolue').catch(()=>{});
    if(ref?.message)await chans[i]?.messages.delete(ref.message).catch(()=>{});
  }
  const owner=await client.users.fetch(config.ownerId).catch(()=>null);
  await owner?.send({content:`✅ Demande résolue : **${t.title}** (${t.displayName||t.name}). La conversation est jointe.`,files:[{attachment:Buffer.from(lines.join('\n')),name:`support-${t.id.slice(0,8)}.txt`}]}).catch(()=>{});
  await mutateSupport(all=>{if(all[t.id]){all[t.id].discordThread='fermé';all[t.id].discordMessage=null;all[t.id].discordMirror=null;all[t.id].discordSyncedAt=t.updatedAt;}});
}
async function flush(){if(running||!client)return;running=true;try{for(const id of [...pending].slice(0,10)){try{await deliver(id);pending.delete(id);}catch{ /* The saved report remains accessible; retry on next tick. */ }}}finally{running=false;}}
export function queueSupport(id){pending.add(id);void flush();}
const SUPPORT_SALON='🎫・support-launcher';
const DDV_SALON='1550190589255880784'; // un salon de DDV : sert à retrouver le serveur
let supportChs=null;
async function makeSupport(guild){
  if(!guild)return null;
  const { ChannelType, PermissionFlagsBits }=await import('discord.js');
  await guild.channels.fetch().catch(()=>{});
  return guild.channels.cache.find((c)=>c.name===SUPPORT_SALON)??await guild.channels.create({name:SUPPORT_SALON,type:ChannelType.GuildText,reason:'Demandes de support History Launcher',
    permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:config.ownerId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessagesInThreads]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.CreatePublicThreads,PermissionFlagsBits.SendMessagesInThreads,PermissionFlagsBits.ManageThreads]}]}).catch(()=>null);
}
async function supportChannels(){
  if(supportChs?.[0]&&supportChs[1])return supportChs;
  const { HOME_GUILD }=await import('./launcherServers.js');
  const home=await client.guilds.fetch(HOME_GUILD).catch(()=>null);
  const ddv=(await client.channels.fetch(DDV_SALON).catch(()=>null))?.guild??null;
  supportChs=[await makeSupport(home),ddv&&ddv.id!==home?.id?await makeSupport(ddv):null];
  return supportChs;
}
// Réponse écrite dans le fil d'une demande (par l'équipe) : enregistrée comme réponse, visible dans l'appli et sur le site
async function onThreadMessage(m){
  if(m.author.bot||!m.channel?.isThread?.()||!supportChs?.some((c)=>c?.id===m.channel.parentId)||!isAllowed(m.author.id)||!m.content.trim())return;
  const t=(await supportList()).find((x)=>x.discordThread===m.channel.id||x.discordMirror?.thread===m.channel.id);if(!t)return;
  await supportUpdate({id:t.id,status:t.status==='resolved'?'resolved':'investigating',reply:m.content.slice(0,2000)}).then(()=>m.react('✅')).catch(()=>m.react('⚠️').catch(()=>{}));
}
export function startSupportDiscord(c){if(client)return;client=c;c.on('messageCreate',(m)=>{onThreadMessage(m).catch(()=>{});});const retry=async()=>{try{await supportChannels();for(const t of await supportList()){if(!t.discordThread&&t.status==='resolved')continue;if(!t.discordThread||(!t.discordMirror&&t.status!=='resolved'&&supportChs?.[1])||(t.discordSyncedAt??0)<t.updatedAt)pending.add(t.id);}await flush();}catch{}};void retry();setInterval(retry,60000).unref();}
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
