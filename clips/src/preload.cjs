// Pont sécurisé entre l'interface de History Clips et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (fn) => ipcRenderer.on(ch, (_e, v) => fn(v));

contextBridge.exposeInMainWorld('hc', {
  list: inv('clips:list'), open: inv('clips:open'), root: inv('clips:root'), copy: inv('clips:copy'), fav: inv('clips:fav'), rename: inv('clips:rename'),
  remove: inv('clips:delete'), trim: inv('clips:trim'), exportMp4: inv('clips:export'), discord: inv('clips:discord'), saveNow: inv('clips:save'), montage: inv('clips:montage'), repair: inv('clips:repair'), vertical: inv('clips:vertical'), link: inv('clips:link'), discordInvite: inv('app:discord'), launcher: inv('app:launcher'), art: inv('games:art'),
  account: inv('account:get'), connexion: inv('account:connexion'), inscription: inv('account:inscription'), twofa: inv('account:2fa'), forgot: inv('account:forgot'),
  logout: inv('account:logout'), skip: inv('account:skip'), friends: inv('account:friends'), servers: inv('account:servers'), pairStart: inv('account:pairStart'), pairPoll: inv('account:pairPoll'), linkLauncher: inv('account:launcher'),
  settings: inv('settings:get'), setSettings: inv('settings:set'), pickFolder: inv('settings:folder'), site: inv('app:site'),
  updGet: inv('update:get'), updCheck: inv('update:check'), updNow: inv('update:now'), updLater: inv('update:later'),
  win: (what) => ipcRenderer.send('win', what),
  onChanged: on('clips:changed'), onAccount: on('account:changed'), onUpdate: on('update:state'), onMax: on('win:max'), onFocus: on('win:focus'), onLinkLauncher: on('link:launcher'),
});
