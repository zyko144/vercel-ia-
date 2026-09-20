/**
 * Prompts versionnés des assets du casino.
 *
 * Règles : un style de maison commun (noir profond, magenta, or, lumière rasante),
 * jamais de texte dans l'image (les titres sont ajoutés en HTML), jamais de marque existante.
 * Chaque asset garde son prompt : régénérer donne un résultat cohérent.
 */

export const STYLE = [
  'vibrant casino slot game key art, game splash art',
  'rich saturated colors, punchy contrast',
  'glossy 3d render, polished metal and gemstones',
  'dramatic rim lighting, volumetric god rays, magical glow',
  'centered hero subject, full bleed illustration',
  'highly detailed, crisp, 8k, trending game art',
].join(', ');

export const NEGATIVE = [
  'text, letters, words, numbers, typography, caption, watermark, signature, logo text',
  'ui, interface, frame, border, collage, multiple panels',
  'low quality, blurry, jpeg artifacts, noise, oversaturated',
  'deformed, extra fingers, mutated hands, disfigured face',
  'flat vector, clipart, childish cartoon',
].join(', ');

export type AssetSpec = {
  slug: string;
  kind: 'thumbnail' | 'background' | 'hero' | 'badge' | 'symbol' | 'banner';
  prompt: string;
  width: number;
  height: number;
  /** Rognage vers ce format après génération (le sujet reste centré). */
  aspect?: 'square' | 'portrait' | 'wide';
};

const thumb = (slug: string, subject: string): AssetSpec => ({
  slug: `game/${slug}`,
  kind: 'thumbnail',
  prompt: `${subject}, ${STYLE}`,
  width: 768,
  height: 768,
  aspect: 'square',
});

/** Vignettes des 50 jeux : chacune a son univers, aucune n'est une variante de couleur d'une autre. */
export const GAME_ART: Record<string, string> = {
  // --- Machines à sous ---
  'neon-fortune': 'a neon-lit slot machine cabinet in a rainy cyberpunk street at night, glowing pink neon seven symbol floating above the reels, wet asphalt reflections',
  'royal-vault': 'a colossal golden vault door of a royal treasury, crown resting on a velvet cushion, gold coins spilling from the opening, baroque ornaments',
  'diamond-rush': 'a crystal mine cavern, giant faceted blue diamond levitating, pickaxe and ore cart, sparkling dust in god rays',
  'cyber-samurai': 'a futuristic samurai helmet with glowing katana blades crossed behind it, neon circuits on black lacquer armor',
  'pharaohs-legacy': 'an ancient egyptian burial chamber, golden pharaoh mask, hieroglyph walls lit by torchlight, scarab amulets',
  'midnight-joker': 'a sinister jester mask with purple neon grin, playing cards fanned in the dark, confetti of glowing sparks',
  'dragon-crown': 'an eastern dragon coiled around a burning golden crown, embers and smoke, dark red temple background',
  'ocean-treasure': 'a sunken treasure chest on the ocean floor, glowing pearls and gold, shafts of turquoise light, fish silhouettes',
  'pirate-gold': 'a pirate captain hat on a barrel of gold doubloons, cutlass and old map, stormy sea behind, lantern glow',
  'cosmic-jackpot': 'a spinning galaxy shaped like a slot reel, planets as symbols, stardust and nebula in magenta and violet',
  'wild-west-gold': 'a desert saloon at dusk, revolver and sheriff star on a poker table, gold nuggets, dusty warm light',
  'mystic-forest': 'an enchanted forest clearing at night, glowing green runes on ancient trees, floating emerald orbs, fireflies',
  'inferno-coins': 'molten gold coins pouring out of a volcanic crack, fire and embers, obsidian rocks, intense orange glow',
  'golden-temple': 'a hidden jungle temple entrance made of gold, stone idols, vines and mist, warm sunbeams',
  'lunar-fortune': 'a silver crescent moon above a still lake, koi fish made of light, pale blue and silver palette, mystical fog',

  // --- Table ---
  'european-roulette': 'a luxury roulette wheel in polished mahogany and chrome, ivory ball in motion, green felt table, casino bokeh behind',
  'american-roulette': 'a roulette wheel seen from above with double zero, red and black pockets, gold fretwork, dramatic side light',
  blackjack: 'a blackjack table with an ace of spades and a king of hearts, stacks of casino chips, green felt, dealer shoe',
  baccarat: 'an elegant baccarat table in a private salon, two cards face down, gold chip stacks, velvet rope, chandelier bokeh',
  'three-card-poker': 'three playing cards fanned out mid-air above a poker table, chips flying, dramatic spotlight',
  'video-poker': 'a retro-futuristic video poker cabinet screen showing a royal flush, glowing buttons, chrome bezel',
  war: 'two playing cards clashing like swords with sparks between them, dark battlefield fog, red and gold',
  'red-or-black': 'a single casino chip split half red half black spinning in the air, sharp studio light on black',
  'higher-or-lower': 'two playing cards floating at different heights connected by a glowing arrow, dark studio background',
  'sic-bo': 'three dice tumbling inside a glass dome shaker, chinese gambling parlor lanterns in the background',

  // --- Dés ---
  dice: 'two glowing translucent casino dice mid-roll on black glass, cyan internal light, reflections',
  'double-dice': 'four casino dice stacked into a tower, blue glow, mirrored floor, dramatic rim light',
  'lucky-dice': 'a golden dice with a four-leaf clover pip, emerald light, luck charm aesthetic',
  'dice-duel': 'two dice facing each other like duelists, sparks between them, split red and blue lighting',
  'hi-lo-dice': 'a dice tower with arrows pointing up and down, neon violet lighting, dark casino floor',

  // --- Arcade / Risk ---
  mines: 'a dark mine shaft grid of metal plates, one open plate revealing a glowing blue gem, another with a dormant iron bomb, industrial steel',
  plinko: 'a vertical pegboard machine with a glowing pink ball bouncing down through metal pins, light trails, arcade cabinet',
  tower: 'a futuristic vault tower rising into darkness, glowing door panels on each floor, elevator light beam',
  wheel: 'a large prize wheel with metallic segments and a golden pointer, casino stage lighting, confetti',
  limbo: 'a glowing multiplier arrow piercing through a ceiling of dark glass, shards floating, violet energy',
  crash: 'a rocket trailing a bright curve of light steeply upward, the curve shattering at its peak, dark sky and embers',
  rocket: 'a chrome rocket launching from a casino floor, flames and smoke, golden sparks, dramatic low angle',
  ladder: 'a neon ladder climbing into darkness, each rung glowing brighter, futuristic tunnel',
  'color-crash': 'ribbons of colored light exploding outward from a single point, magenta cyan gold, dark background',
  multiplier: 'a glowing multiplier symbol made of molten gold, energy arcs around it, black background',

  // --- Rapides ---
  keno: 'twenty numbered casino balls in a transparent draw machine, gold and ivory spheres, soft studio light',
  'scratch-card': 'a golden scratch card partially scratched revealing glowing symbols, metallic shavings flying',
  'mystery-box': 'a black lacquer box with magenta light escaping from the gap under its lid, mysterious atmosphere',
  'treasure-chest': 'an old oak chest bursting with golden light and coins, iron fittings, dark stone floor',
  'pick-a-card': 'three face-down cards floating in a row, one glowing brighter, magician atmosphere, purple smoke',
  'bomb-finder': 'a grid of metal hatches on a dark floor, one open revealing a red warning light, industrial sci-fi',
  'safe-vault': 'a heavy bank safe door with a golden combination dial, spotlight on brushed steel',
  'lucky-envelope': 'a red and gold envelope glowing at the edges, gold coins slipping out, festive dark background',
  'jackpot-ladder': 'a staircase of glowing golden steps rising toward a giant jackpot orb, cinematic fog',
  'mystery-wheel': 'a wheel of fortune covered by dark smoke, only a few segments glowing, mysterious purple light',
};

/** Fonds et bannières du site. */
export const SCENES: AssetSpec[] = [
  {
    slug: 'scene/casino-floor',
    kind: 'background',
    prompt: `wide interior of a luxury modern casino at night, rows of glowing slot machines receding into the distance, magenta and gold neon, polished dark floor with reflections, shallow depth of field, ${STYLE}`,
    width: 1536,
    height: 864,
    aspect: 'wide',
  },
  {
    slug: 'scene/hero-machine',
    kind: 'hero',
    prompt: `a single premium slot machine cabinet standing in the dark, screen glowing with a golden seven, chrome frame, magenta neon tubes, smoke at the base, spotlight from above, ${STYLE}`,
    width: 1024,
    height: 1024,
    aspect: 'square',
  },
  {
    slug: 'scene/jackpot',
    kind: 'banner',
    prompt: `an explosion of golden coins and light rays bursting from a vault, diamonds floating, dark blue background, celebratory, ${STYLE}`,
    width: 1536,
    height: 768,
    aspect: 'wide',
  },
  {
    slug: 'scene/vip',
    kind: 'background',
    prompt: `a private VIP casino lounge, velvet armchairs, a roulette table lit by a chandelier, gold and deep purple, cinematic, ${STYLE}`,
    width: 1536,
    height: 864,
    aspect: 'wide',
  },
];

/** Badges de niveau (illustrations, pas de simples pastilles). */
export const BADGES: AssetSpec[] = [
  ['novice', 'a simple iron shield badge with a single star, cold grey metal'],
  ['bronze', 'a bronze shield badge with laurel leaves, warm patina'],
  ['argent', 'a polished silver shield badge with engraved chevrons'],
  ['or', 'an ornate golden shield badge with a crown, rich engraving'],
  ['platine', 'a platinum shield badge with cyan gemstone inlay'],
  ['diamant', 'a crystal shield badge with a large blue diamond at its center, refracting light'],
  ['maitre', 'a dark violet shield badge with arcane runes glowing'],
  ['elite', 'a magenta shield badge with sharp wings and neon edge lighting'],
  ['legende', 'a legendary golden shield badge wrapped in flames and lightning'],
].map(([slug, subject]) => ({
  slug: `badge/${slug}`,
  kind: 'badge' as const,
  prompt: `${subject}, game achievement badge, 3d render, isolated on pure black background, centered, ${STYLE}`,
  width: 512,
  height: 512,
  aspect: 'square' as const,
}));

/** Tous les assets à générer. */
export function allAssets(): AssetSpec[] {
  const games = Object.entries(GAME_ART).map(([slug, subject]) => thumb(slug, subject));
  return [...games, ...SCENES, ...BADGES];
}

export const findAsset = (slug: string) => allAssets().find((asset) => asset.slug === slug);
