// Les grosses applis seulement : c'est la liste qui décide ce qu'on affiche par défaut dans « Applications ».
// Chaque appli a sa couleur de marque (fond de sa carte) et, si on l'a, son logo officiel en vectoriel (net à toutes
// les tailles, fichiers dans ui/brands). Sinon on prend l'icône de l'appli en 256 px sur le même fond.
const B = (re, color, slug = null) => ({ re: new RegExp(`^(?:${re})(?![a-z0-9])`, 'i'), color, slug });

export const BRANDS = [
  // Musique
  B('spotify', '#1ed760', 'spotify'), B('deezer', '#a238ff', 'deezer'), B('apple music|itunes', '#fa243c', 'applemusic'),
  B('youtube music', '#ff0000', 'youtubemusic'), B('soundcloud', '#ff5500', 'soundcloud'), B('tidal', '#1a1a1a', 'tidal'),
  // Discussion
  B('discord', '#5865f2', 'discord'), B('whatsapp', '#25d366', 'whatsapp'), B('telegram', '#26a5e4', 'telegram'),
  B('teamspeak', '#4b69b6', 'teamspeak'), B('zoom', '#0b5cff', 'zoom'), B('microsoft teams', '#5059c9'), B('signal', '#3b45fd', 'signal'),
  // Plateformes de jeux
  B('steam', '#1b2838', 'steam'), B('epic games launcher', '#2a2a2a', 'epicgames'), B('ubisoft connect', '#0070ff', 'ubisoft'),
  B('ea app|ea desktop|origin', '#ff4747', 'ea'), B('battle\\.net', '#148eff', 'battledotnet'), B('riot client', '#eb0029', 'riotgames'),
  B('rockstar games launcher', '#fcaf17', 'rockstargames'), B('gog galaxy', '#86328a', 'gogdotcom'), B('xbox', '#107c10'),
  B('roblox studio', '#00a2ff', 'robloxstudio'), B('minecraft launcher', '#3c8527'), B('curseforge', '#f16436', 'curseforge'),
  // Navigateurs
  B('google chrome', '#4285f4', 'googlechrome'), B('mozilla firefox|firefox', '#ff7139', 'firefoxbrowser'), B('brave', '#fb542b', 'brave'),
  // Stream, capture, vidéo
  B('obs studio', '#302e31', 'obsstudio'), B('streamlabs', '#31c3a2', 'streamlabs'), B('nvidia app|geforce experience', '#76b900', 'nvidia'),
  B('twitch', '#9146ff', 'twitch'), B('vlc', '#ff8800', 'vlcmediaplayer'), B('netflix', '#e50914', 'netflix'), B('plex', '#ebaf00', 'plex'),
  // Création
  B('davinci resolve', '#233a51', 'davinciresolve'), B('blender', '#e87d0d', 'blender'), B('capcut', '#1a1a1a'),
  B('adobe photoshop|photoshop', '#31a8ff'), B('adobe premiere|premiere', '#9999ff'), B('adobe after effects|after effects', '#9999ff'),
  B('adobe creative cloud', '#da1f26'), B('audacity', '#0000cc', 'audacity'), B('fl studio', '#f68b1f'), B('figma', '#f24e1e', 'figma'),
  // Bureau
  B('microsoft office|microsoft 365|office', '#d83b01'), B('notion', '#2f2f2f', 'notion'), B('obsidian', '#7c3aed', 'obsidian'),
  // Entretien, sécurité
  B('ccleaner', '#cb2d29', 'ccleaner'), B('malwarebytes', '#0d3ecc', 'malwarebytes'), B('avast', '#ff7800', 'avast'),
  B('nordvpn', '#4687ff', 'nordvpn'), B('winrar', '#6b3fa0'),
  // Matériel gamer
  B('logitech g hub|lghub', '#00b8fc'), B('razer synapse', '#00c000', 'razer'), B('corsair icue|icue', '#2a2a2a', 'corsair'),
  B('steelseries gg', '#ff5200', 'steelseries'), B('msi afterburner', '#ff0000', 'msi'), B('wallpaper engine', '#1d6fd6'),
];

/** La marque d'une appli (null si ce n'est pas une grosse appli). */
export function brandOf(name) {
  const b = BRANDS.find((x) => x.re.test(String(name ?? '').trim()));
  return b ? { color: b.color, logo: b.slug ? `brands/${b.slug}.svg` : null } : null;
}
