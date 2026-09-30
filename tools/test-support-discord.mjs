import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.DISCORD_TOKEN='test';process.env.GEMINI_API_KEY='test';process.env.OWNER_ID='111111111111111111';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_KEY='';process.env.STORAGE_DIR=mkdtempSync(join(tmpdir(),'support-discord-'));
const {writeNow}=await import('../src/storage.js');const {supportDetail}=await import('../src/features/launcherSupport.js');const {supportIdentity,startSupportDiscord,onSupportInteraction,supportEmbed}=await import('../src/features/supportDiscord.js');
const id='12345678-1234-1234-1234-123456789abc',sent=[],edited=[];
await writeNow('launcher-comptes',{accounts:{a:{discordId:'222222222222222222'}}});
await writeNow('launcher-support',{[id]:{id,owner:'a',name:'History',displayName:'Discord',avatar:'https://cdn.discordapp.com/embed/avatars/0.png',app:'clips',title:'Capture bloquée',description:'Le raccourci ne fonctionne plus.',status:'received',reply:'',at:1,updatedAt:1}});
const client={users:{fetch:async id=>id===process.env.OWNER_ID?{createDM:async()=>({send:async p=>{sent.push(p);return{id:'message'};},messages:{fetch:async()=>({embeds:[],edit:async p=>edited.push(p)})}})}:{username:'Discord',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'}}};
startSupportDiscord(client);
for(let i=0;i<100&&!(await supportDetail(id)).discordMessage;i++)await new Promise(r=>setTimeout(r,10));
assert.equal(sent.length,1);assert.equal(sent[0].allowedMentions.parse.length,0);assert.equal(sent[0].embeds[0].toJSON().author.icon_url,'https://cdn.discordapp.com/embed/avatars/0.png');assert.equal(sent[0].components[0].components.length,2);
assert.equal((await supportIdentity({id:'a',pseudo:'History',profile:{avatar:'https://example.com/app.png'}})).displayName,'Discord');assert.equal((await supportIdentity({id:'other',pseudo:'History',profile:{avatar:'https://example.com/app.png'}})).avatar,'https://example.com/app.png');
let refused;await onSupportInteraction({customId:`support:resolve:${id}`,user:{id:'333333333333333333'},reply:async p=>refused=p});assert.ok(refused.ephemeral);assert.equal((await supportDetail(id)).status,'received');
let modal;await onSupportInteraction({customId:`support:reply:${id}`,user:{id:process.env.OWNER_ID},showModal:async p=>modal=p});assert.equal(modal.toJSON().custom_id,`support:save:${id}`);
await onSupportInteraction({customId:`support:save:${id}`,user:{id:process.env.OWNER_ID},deferReply:async()=>{},fields:{getTextInputValue:()=> 'Essaie le nouveau raccourci.'},editReply:async()=>{}});assert.equal((await supportDetail(id)).reply,'Essaie le nouveau raccourci.');
await onSupportInteraction({customId:`support:resolve:${id}`,user:{id:process.env.OWNER_ID},deferReply:async()=>{},editReply:async()=>{}});assert.equal((await supportDetail(id)).status,'resolved');
console.log('✓ Discord simulé : MP propriétaire, photo, boutons, accès staff, réponse synchronisée et résolution');

assert.equal(readFileSync(new URL('../launcher/src/ui/quick-support.js',import.meta.url),'utf8'),readFileSync(new URL('../clips/src/ui/quick-support.js',import.meta.url),'utf8'));
