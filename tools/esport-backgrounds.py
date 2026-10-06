"""Fonds des cartes e-sport : couleurs du club + logo en grand + motif du jeu (une image par équipe et par jeu).
   python3 tools/esport-backgrounds.py   → launcher/src/ui/esport/<id>-bg.jpg"""
import json, math, random, re
from PIL import Image, ImageDraw, ImageFilter
O = 'launcher/src/ui/esport'
W, H = 1280, 640
hexc = lambda c: tuple(int(c.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
mix = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def motif(game, dr, col):
    random.seed(game)
    if game == 'rl':  # terrain : alvéoles + ballon
        r = 44
        for y in range(-1, H // int(r * 1.5) + 2):
            for x in range(-1, W // int(r * 1.73) + 2):
                cx, cy = x * r * 1.732 + (r * 0.866 if y % 2 else 0), y * r * 1.5
                dr.polygon([(cx + r * math.cos(math.radians(60 * k + 30)), cy + r * math.sin(math.radians(60 * k + 30))) for k in range(6)], outline=col + (34,), width=2)
        dr.ellipse((140, 330, 320, 510), outline=col + (90,), width=6)
    elif game == 'r6':  # bandes de chantier + barricade
        for i in range(-10, 30): dr.polygon([(i * 90, H), (i * 90 + 45, H), (i * 90 + 45 + H * .6, 0), (i * 90 + H * .6, 0)], fill=col + (20,))
        for i in range(6): dr.rectangle((80 + i * 14, 120, 86 + i * 14, 520), fill=col + (40,))
    elif game == 'cs2':  # radar + viseur
        for k in range(1, 7): dr.ellipse((260 - k * 70, 320 - k * 70, 260 + k * 70, 320 + k * 70), outline=col + (40,), width=2)
        dr.line((0, 320, W, 320), fill=col + (45,), width=2); dr.line((260, 0, 260, H), fill=col + (45,), width=2)
        dr.pieslice((-160, -100, 680, 740), -40, -10, fill=col + (28,))
    elif game == 'val':  # éclats
        for _ in range(26):
            x, y, s = random.randint(0, W), random.randint(0, H), random.randint(30, 170)
            dr.polygon([(x, y), (x + s, y + s * .3), (x + s * .2, y + s)], fill=col + (random.randint(16, 44),))
    else:  # lol : cercles hextech
        for k, a in enumerate([70, 130, 200, 280, 370]): dr.ellipse((280 - a, 320 - a, 280 + a, 320 + a), outline=col + (45 - k * 5,), width=3 if k % 2 else 1)
        for t in range(12):
            g = math.radians(t * 30); dr.line((280 + 80 * math.cos(g), 320 + 80 * math.sin(g), 280 + 380 * math.cos(g), 320 + 380 * math.sin(g)), fill=col + (25,), width=2)

d = json.load(open('launcher/src/ui/esport.json'))
yy, xx = [y / H for y in range(H)], [x / W for x in range(W)]
diag = Image.new('L', (W, H)); diag.putdata([int(255 * max(0, 1 - (x * .7 + y * .5))) for y in yy for x in xx])  # clair en haut à gauche
for t in d['teams']:
    org = re.sub(r'[^a-z0-9]', '', t['name'].lower())
    a, b = hexc(t['colors'][0]), hexc(t['colors'][1])
    dark = mix(b, (0, 0, 0), .4)
    img = Image.composite(Image.new('RGB', (W, H), mix(a, dark, .25)), Image.new('RGB', (W, H), dark), diag).convert('RGBA')
    lay = Image.new('RGBA', (W, H)); motif(t['game'], ImageDraw.Draw(lay), mix(a, (255, 255, 255), .3)); img = Image.alpha_composite(img, lay)
    try:
        lg = Image.open(f'{O}/{org}-logo.png').convert('RGBA'); k = min(470 / lg.height, 620 / lg.width); lg = lg.resize((int(lg.width * k), int(lg.height * k)), Image.LANCZOS)
        g = Image.new('RGBA', (W, H)); g.paste(lg, (W - lg.width - 70, (H - lg.height) // 2), lg)
        glow = g.split()[3].filter(ImageFilter.GaussianBlur(55)).point(lambda v: int(v * .8))
        img = Image.alpha_composite(img, Image.merge('RGBA', [Image.new('L', (W, H), c) for c in a] + [glow]))
        g.putalpha(g.split()[3].point(lambda v: int(v * .6))); img = Image.alpha_composite(img, g)
    except FileNotFoundError: pass
    img.convert('RGB').save(f'{O}/{t["id"]}-bg.jpg', quality=78)
print(len(d['teams']), 'fonds')
