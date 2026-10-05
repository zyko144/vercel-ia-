# GIF « où cliquer dans le BIOS » par marque et par réglage (launcher-site/assets/bios/), à partir de BIOS_PATHS (core/oc.js).
# Usage : node -e "import('./launcher/src/core/oc.js').then(m=>console.log(JSON.stringify({p:m.BIOS_PATHS,t:m.BIOS_TASKS})))" > bios.json && python3 tools/bios-gifs.py bios.json
import json, sys
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); W, H = 640, 360
F = lambda s, b=False: ImageFont.truetype(f"assets/Inter-{'Bold' if b else 'Regular'}.ttf", s)
COL = {'msi': (225, 45, 57), 'asus': (201, 162, 39), 'gigabyte': (242, 140, 40), 'asrock': (47, 139, 255)}
for brand, b in d['p'].items():
    c = COL[brand]
    for task, path in b['tasks'].items():
        frames = []
        for step in range(len(path) + 2):
            im = Image.new('RGB', (W, H), (11, 11, 14)); g = ImageDraw.Draw(im)
            g.rectangle([0, 0, W, 44], fill=(18, 18, 22)); g.line([0, 44, W, 44], fill=c, width=3)
            g.text((16, 12), b['name'], font=F(18, True), fill=c); g.text((W - 16, 14), d['t'][task], font=F(15), fill=(220, 220, 220), anchor='ra')
            x = 16
            for t in b['tabs']:
                w = g.textlength(t, font=F(14)) + 20; hit = t in path[:max(1, step)]
                g.rounded_rectangle([x, 58, x + w, 86], 6, fill=c if hit else (26, 26, 31)); g.text((x + 10, 63), t, font=F(14, hit), fill=(0, 0, 0) if hit else (150, 150, 160)); x += w + 6
            for n, p in enumerate(path[:step]):
                y = 104 + n * 46; cur = n == step - 1 and step <= len(path)
                g.rounded_rectangle([16, y, W - 16, y + 38], 8, fill=(22, 22, 27), outline=c if cur else None, width=2)
                g.ellipse([26, y + 8, 48, y + 30], fill=c); g.text((37, y + 19), str(n + 1), font=F(13, True), fill=(0, 0, 0), anchor='mm'); g.text((60, y + 9), p, font=F(16, cur), fill=(235, 235, 235))
            if step == len(path) + 1: g.text((W // 2, H - 26), f"F10 : enregistrer et redémarrer  ·  entrer dans le BIOS : {b['enter']}", font=F(14, True), fill=c, anchor='mm')
            frames.append(im.convert('P', palette=Image.ADAPTIVE, colors=32))
        frames[0].save(f'launcher-site/assets/bios/{brand}-{task}.gif', save_all=True, append_images=frames[1:], duration=[900] * (len(frames) - 1) + [2600], loop=0, optimize=True)
print('ok')
