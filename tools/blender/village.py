"""
Le village du site vitrine, fabriqué entièrement par script dans Blender (aucun modèle importé).

  python tools/blender/village.py --mode seq  --out /tmp/frames    (ouverture : la nuit tombe, 72 images)
  python tools/blender/village.py --mode loup --out /tmp/stills    (le loup qui hurle devant la lune)
  python tools/blender/village.py --mode aube --out /tmp/stills    (le jour se lève sur le village)

Il faut le module Blender pour Python : `pip install bpy` (Python 3.11).
Les images sont ensuite converties en WebP par tools/make-site-images.mjs.

Le brouillard est « peint » dans chaque matériau selon la distance à la caméra :
bien plus rapide qu'un vrai volume, et le compositeur n'est pas nécessaire.
"""
import argparse
import math
import os
import random
import sys

import bpy  # doit venir avant bmesh et mathutils
import bmesh
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
parser = argparse.ArgumentParser()
parser.add_argument('--mode', default='seq', choices=['seq', 'loup', 'aube'])
parser.add_argument('--out', default='/tmp/village')
parser.add_argument('--width', type=int, default=1280)
parser.add_argument('--height', type=int, default=720)
parser.add_argument('--frames', type=int, default=72)
parser.add_argument('--samples', type=int, default=24)
parser.add_argument('--only', default='', help='images à rendre, ex : 1,36,72 (pour essayer)')
args = parser.parse_args(argv)

random.seed(7)
os.makedirs(args.out, exist_ok=True)

# ============================== remise à zéro ==============================
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 3
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 1
scene.cycles.transmission_bounces = 1
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.frame_start = 1
scene.frame_end = args.frames

FOG_NIGHT = (0.02, 0.028, 0.075)
FOG_DUSK = (0.3, 0.15, 0.24)
FOG_DAWN = (0.85, 0.55, 0.42)

# ============================== terrain ==============================


WOLF_X, WOLF_Y = 4.5, -50.0  # le rocher du loup, au premier plan du dernier plan


def height(x, y):
    """Collines douces, le village sur une butte au centre, une crête à l'arrière."""
    hill = 3.2 * math.exp(-(x * x + y * y) / 520)
    ridge = 9 * math.exp(-((y - 70) ** 2) / 900) * (0.7 + 0.3 * math.sin(x / 13))
    waves = 0.9 * math.sin(x / 9.0) * math.cos(y / 11.0) + 0.45 * math.sin(x / 3.7 + y / 5.3)
    rock = 2.4 * math.exp(-((x - WOLF_X) ** 2 + (y - WOLF_Y) ** 2) / 10)  # le rocher du loup
    return hill + ridge + waves + rock


# ============================== matériaux ==============================


def fogged(name, color, rough=0.9, emission=None, strength=0.0, fog_start=30, fog_end=300):
    """Un matériau dont la couleur se noie dans le brouillard avec la distance."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    cam = nt.nodes.new('ShaderNodeCameraData')
    rng = nt.nodes.new('ShaderNodeMapRange')
    rng.inputs['From Min'].default_value = fog_start
    rng.inputs['From Max'].default_value = fog_end
    fog = nt.nodes.new('ShaderNodeEmission')
    fog.name = 'fog'
    fog.inputs['Color'].default_value = (*FOG_NIGHT, 1)
    fog.inputs['Strength'].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(cam.outputs['View Z Depth'], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], mix.inputs['Fac'])
    nt.links.new(bsdf.outputs['BSDF'], mix.inputs[1])
    nt.links.new(fog.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    FOGGED.append(mat)
    return mat


FOGGED = []


def emissive(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat, em


GRASS = fogged('herbe', (0.035, 0.06, 0.05), 1.0)
STONE = fogged('pierre', (0.16, 0.15, 0.17), 0.85)
WALL = fogged('mur', (0.2, 0.15, 0.12), 0.9)
WALL2 = fogged('mur clair', (0.27, 0.22, 0.18), 0.9)
ROOF = fogged('toit', (0.2, 0.06, 0.05), 0.7)
ROOF2 = fogged('toit ardoise', (0.07, 0.08, 0.12), 0.6)
PINE = fogged('sapin', (0.015, 0.04, 0.035), 1.0)
TRUNK = fogged('tronc', (0.08, 0.05, 0.03), 1.0)
WOLF = fogged('loup', (0.004, 0.004, 0.008), 1.0, fog_start=60, fog_end=400)
MOUNTAIN = fogged('montagne', (0.02, 0.025, 0.05), 1.0, fog_start=120, fog_end=700)

# ============================== objets ==============================


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    return link(obj)


def box(name, cx, cy, cz, sx, sy, sz, material, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    for dz in (0, sz):
        for dx, dy in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)):
            pts.append((cx + dx * c - dy * s, cy + dx * s + dy * c, cz + dz))
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_object(name, pts, faces, material)


def local(cx, cy, rot, dx, dy):
    c, s = math.cos(rot), math.sin(rot)
    return cx + dx * c - dy * s, cy + dx * s + dy * c


WINDOWS = []  # (matériau d'émission, image où la fenêtre s'allume)


def house(cx, cy, w, d, h, rot, roof_mat, wall_mat, light_at):
    base = height(cx, cy) - 0.3
    box('maison', cx, cy, base, w, d, h + 0.3, wall_mat, rot)
    # toit à deux pans
    rh = w * 0.55
    over = 0.25
    pts = []
    for dy in (-d / 2 - over, d / 2 + over):
        for dx, dz in ((-w / 2 - over, 0), (w / 2 + over, 0), (0, rh)):
            x, y = local(cx, cy, rot, dx, dy)
            pts.append((x, y, base + h + 0.3 + dz - 0.05))
    mesh_object('toit', pts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], roof_mat)
    # fenêtres éclairées (une par façade avant, parfois deux)
    mat, em = emissive('fenêtre', (1.0, 0.62, 0.25), 0.0)
    WINDOWS.append((em, light_at))
    for dx in ((-w / 4, w / 4) if w > 3 else (0,)):
        for side in (-1, 1):
            x, y = local(cx, cy, rot, dx, side * (d / 2 + 0.02))
            ww, wh = 0.55, 0.7
            zc = base + 0.3 + h * 0.55
            ex, ey = local(0, 0, rot, ww / 2, 0)
            mesh_object('vitre', [(x - ex, y - ey, zc - wh / 2), (x + ex, y + ey, zc - wh / 2), (x + ex, y + ey, zc + wh / 2), (x - ex, y - ey, zc + wh / 2)], [(0, 1, 2, 3)], mat)


def tower(cx, cy):
    base = height(cx, cy) - 0.3
    box('clocher', cx, cy, base, 2.6, 2.6, 9.5, WALL2)
    pts = [(cx - 1.6, cy - 1.6, base + 9.5), (cx + 1.6, cy - 1.6, base + 9.5), (cx + 1.6, cy + 1.6, base + 9.5), (cx - 1.6, cy + 1.6, base + 9.5), (cx, cy, base + 14.5)]
    mesh_object('flèche', pts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], ROOF2)
    mat, em = emissive('rosace', (1.0, 0.75, 0.35), 0.0)
    WINDOWS.append((em, 10))
    for side in (-1, 1):
        y = cy + side * 1.32
        mesh_object('rosace', [(cx - 0.45, y, base + 6.6), (cx + 0.45, y, base + 6.6), (cx + 0.45, y, base + 8.0), (cx - 0.45, y, base + 8.0)], [(0, 1, 2, 3)], mat)


def pine_mesh():
    bm = bmesh.new()
    for i, (r, z0, z1) in enumerate(((1.0, 0.6, 2.4), (0.8, 1.6, 3.2), (0.55, 2.5, 4.0))):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=7, radius1=r, radius2=0.02, depth=z1 - z0,
                              matrix=Matrix.Translation((0, 0, (z0 + z1) / 2)))
    mesh = bpy.data.meshes.new('sapin')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(PINE)
    return mesh


# ---- le sol
N = 160
SIZE = 320
verts, faces = [], []
for j in range(N + 1):
    for i in range(N + 1):
        x = -SIZE / 2 + SIZE * i / N
        y = -SIZE / 2 + SIZE * j / N + 40
        verts.append((x, y, height(x, y)))
for j in range(N):
    for i in range(N):
        a = j * (N + 1) + i
        faces.append((a, a + 1, a + N + 2, a + N + 1))
ground = mesh_object('sol', verts, faces, GRASS)
for poly in ground.data.polygons:
    poly.use_smooth = True

# ---- les montagnes au loin
for k in range(14):
    x = -330 + k * 50 + random.uniform(-12, 12)
    y = 195 + random.uniform(-10, 20)
    h = random.uniform(22, 42)
    r = random.uniform(45, 70)
    pts = [(x + r * math.cos(a * math.tau / 6), y + r * math.sin(a * math.tau / 6), 0) for a in range(6)] + [(x + random.uniform(-6, 6), y, h)]
    mesh_object('montagne', pts, [(i, (i + 1) % 6, 6) for i in range(6)], MOUNTAIN)

# ---- le village
tower(1.5, 4.0)
spots = []
for i in range(22):
    for _ in range(40):
        a = random.uniform(0, math.tau)
        r = random.uniform(5, 19)
        x, y = r * math.cos(a), r * math.sin(a) * 0.8 + 2
        if all((x - sx) ** 2 + (y - sy) ** 2 > 22 for sx, sy in spots) and (x - 1.5) ** 2 + (y - 4) ** 2 > 20:
            spots.append((x, y))
            w = random.uniform(2.6, 4.2)
            house(x, y, w, random.uniform(2.6, 3.6), random.uniform(2.2, 3.4), random.uniform(-0.5, 0.5) + (0.2 if x > 0 else -0.2),
                  ROOF if random.random() < 0.65 else ROOF2, WALL if random.random() < 0.6 else WALL2, light_at=12 + int(random.random() * 40))
            break

# ---- la forêt (copies liées : un seul maillage pour tous les sapins)
tree = pine_mesh()
placed = 0
while placed < 260:
    x = random.uniform(-110, 110)
    y = random.uniform(-40, 110)
    if x * x + (y - 2) ** 2 < 26 ** 2:
        continue
    # rien entre la caméra finale et le village, ni autour du loup
    if (x - WOLF_X) ** 2 + (y - WOLF_Y) ** 2 < 8 ** 2 or (abs(x) < 12 + (y + 70) * 0.25 and -75 < y < -18):
        continue
    obj = link(bpy.data.objects.new('sapin', tree))
    s = random.uniform(1.1, 2.3)
    obj.scale = (s, s, s * random.uniform(0.9, 1.3))
    obj.rotation_euler = (0, 0, random.uniform(0, math.tau))
    obj.location = (x, y, height(x, y) - 0.2)
    placed += 1

# ---- le loup qui hurle, sur son rocher (silhouette extrudée)
WOLF_OUTLINE = [
    (0.55, 0.0), (0.85, 0.0), (1.25, 0.02), (1.22, 0.12), (0.95, 0.16), (0.74, 0.3), (0.68, 0.55), (0.56, 0.85),
    (0.4, 1.12), (0.24, 1.4), (0.14, 1.6), (0.12, 1.72), (0.17, 1.93), (0.02, 1.8), (-0.1, 1.84), (-0.28, 2.02),
    (-0.4, 2.09), (-0.36, 1.98), (-0.22, 1.8), (-0.12, 1.58), (-0.1, 1.3), (-0.15, 1.0), (-0.13, 0.65), (-0.14, 0.08),
    (-0.24, 0.0), (0.0, 0.0), (0.03, 0.45), (0.18, 0.58), (0.3, 0.35), (0.3, 0.06), (0.42, 0.0),
]
bm = bmesh.new()
bverts = [bm.verts.new((x, 0, z)) for x, z in WOLF_OUTLINE]
edges = [bm.edges.new((bverts[i], bverts[(i + 1) % len(bverts)])) for i in range(len(bverts))]
bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
wolf_mesh = bpy.data.meshes.new('loup')
bm.to_mesh(wolf_mesh)
bm.free()
wolf = link(bpy.data.objects.new('loup', wolf_mesh))
wolf.data.materials.append(WOLF)
solid = wolf.modifiers.new('épaisseur', 'SOLIDIFY')
solid.thickness = 0.12
WOLF_SCALE = 1.15
WOLF_POS = Vector((WOLF_X, WOLF_Y, height(WOLF_X, WOLF_Y) - 0.1))
wolf.location = WOLF_POS
wolf.scale = (WOLF_SCALE,) * 3
wolf.rotation_euler = (0, 0, math.radians(-20.6))  # de profil face à la caméra finale, museau vers le village
WOLF_HEAD = WOLF_POS + Vector((0, 0, 2.05 * WOLF_SCALE))

# ============================== ciel, lune, lumières ==============================
world = bpy.data.worlds.new('ciel')
scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes.clear()
w_out = wn.nodes.new('ShaderNodeOutputWorld')
coord = wn.nodes.new('ShaderNodeTexCoord')
sep = wn.nodes.new('ShaderNodeSeparateXYZ')
wn.links.new(coord.outputs['Generated'], sep.inputs['Vector'])


def ramp(stops):
    node = wn.nodes.new('ShaderNodeValToRGB')
    els = node.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    wn.links.new(sep.outputs['Z'], node.inputs['Fac'])
    return node


# Z du vecteur direction : -1 (sol) à 1 (zénith), 0 à l'horizon. Le dégradé vit juste au-dessus.
SKIES = {
    'dusk': ramp([(0.0, (0.95, 0.42, 0.22)), (0.06, (0.62, 0.22, 0.3)), (0.2, (0.2, 0.1, 0.28)), (0.55, (0.05, 0.04, 0.14))]),
    'night': ramp([(0.0, (0.04, 0.055, 0.14)), (0.08, (0.018, 0.026, 0.075)), (0.5, (0.003, 0.005, 0.02))]),
    'dawn': ramp([(0.0, (1.0, 0.62, 0.35)), (0.05, (0.95, 0.5, 0.45)), (0.2, (0.42, 0.4, 0.62)), (0.6, (0.16, 0.22, 0.45))]),
}
mix_sky = wn.nodes.new('ShaderNodeMix')
mix_sky.data_type = 'RGBA'
wn.links.new(SKIES['dusk'].outputs['Color'], mix_sky.inputs[6])
wn.links.new(SKIES['night'].outputs['Color'], mix_sky.inputs[7])

# Étoiles : un Voronoï très fin sur la direction du regard.
vor = wn.nodes.new('ShaderNodeTexVoronoi')
vor.inputs['Scale'].default_value = 140
wn.links.new(coord.outputs['Generated'], vor.inputs['Vector'])
star_map = wn.nodes.new('ShaderNodeMapRange')
star_map.inputs['From Min'].default_value = 0.0
star_map.inputs['From Max'].default_value = 0.09
star_map.inputs['To Min'].default_value = 1.0
star_map.inputs['To Max'].default_value = 0.0
wn.links.new(vor.outputs['Distance'], star_map.inputs['Value'])
star_pow = wn.nodes.new('ShaderNodeMath')
star_pow.operation = 'POWER'
star_pow.inputs[1].default_value = 6
wn.links.new(star_map.outputs['Result'], star_pow.inputs[0])
star_amt = wn.nodes.new('ShaderNodeMath')
star_amt.operation = 'MULTIPLY'
star_amt.name = 'étoiles'
star_amt.inputs[1].default_value = 0.0
# une cellule sur trois seulement porte une étoile
pick = wn.nodes.new('ShaderNodeMath')
pick.operation = 'GREATER_THAN'
pick.inputs[1].default_value = 0.66
wn.links.new(vor.outputs['Color'], pick.inputs[0])
star_sel = wn.nodes.new('ShaderNodeMath')
star_sel.operation = 'MULTIPLY'
wn.links.new(star_pow.outputs['Value'], star_sel.inputs[0])
wn.links.new(pick.outputs['Value'], star_sel.inputs[1])
wn.links.new(star_sel.outputs['Value'], star_amt.inputs[0])
above = wn.nodes.new('ShaderNodeMath')  # pas d'étoiles sous l'horizon
above.operation = 'GREATER_THAN'
above.inputs[1].default_value = 0.03
wn.links.new(sep.outputs['Z'], above.inputs[0])
star_mask = wn.nodes.new('ShaderNodeMath')
star_mask.operation = 'MULTIPLY'
wn.links.new(star_amt.outputs['Value'], star_mask.inputs[0])
wn.links.new(above.outputs['Value'], star_mask.inputs[1])
add = wn.nodes.new('ShaderNodeMix')
add.data_type = 'RGBA'
add.blend_type = 'ADD'
add.inputs[0].default_value = 1.0
wn.links.new(mix_sky.outputs[2], add.inputs[6])
wn.links.new(star_mask.outputs['Value'], add.inputs[7])
bg = wn.nodes.new('ShaderNodeBackground')
bg.inputs['Strength'].default_value = 1.0
wn.links.new(add.outputs[2], bg.inputs['Color'])
wn.links.new(bg.outputs['Background'], w_out.inputs['Surface'])

# ---- la lune : un disque lumineux et un halo, toujours face à la caméra
moon_mat, moon_em = emissive('lune', (1.0, 0.95, 0.84), 2.6)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=15)
moon = bpy.context.active_object
moon.data.materials.append(moon_mat)
for poly in moon.data.polygons:
    poly.use_smooth = True
halo_mat = bpy.data.materials.new('halo')
halo_mat.use_nodes = True
hn = halo_mat.node_tree
hn.nodes.clear()
h_out = hn.nodes.new('ShaderNodeOutputMaterial')
h_tc = hn.nodes.new('ShaderNodeTexCoord')
h_grad = hn.nodes.new('ShaderNodeTexGradient')
h_grad.gradient_type = 'SPHERICAL'
h_map = hn.nodes.new('ShaderNodeMapping')
h_map.inputs['Scale'].default_value = (1.0, 1.0, 1.0)
hn.links.new(h_tc.outputs['Object'], h_map.inputs['Vector'])
hn.links.new(h_map.outputs['Vector'], h_grad.inputs['Vector'])
h_pow = hn.nodes.new('ShaderNodeMath')
h_pow.operation = 'POWER'
h_pow.inputs[1].default_value = 5.0
hn.links.new(h_grad.outputs['Fac'], h_pow.inputs[0])
h_em = hn.nodes.new('ShaderNodeEmission')
h_em.inputs['Color'].default_value = (0.75, 0.8, 1.0, 1)
h_em.inputs['Strength'].default_value = 0.5
h_tr = hn.nodes.new('ShaderNodeBsdfTransparent')
h_mix = hn.nodes.new('ShaderNodeMixShader')
hn.links.new(h_pow.outputs['Value'], h_mix.inputs['Fac'])
hn.links.new(h_tr.outputs['BSDF'], h_mix.inputs[1])
hn.links.new(h_em.outputs['Emission'], h_mix.inputs[2])
hn.links.new(h_mix.outputs['Shader'], h_out.inputs['Surface'])
bpy.ops.mesh.primitive_plane_add(size=2)
halo = bpy.context.active_object
halo.data.materials.append(halo_mat)
halo.scale = (70, 70, 1)
halo.parent = moon

moon_light = bpy.data.lights.new('clair de lune', 'SUN')
moon_light.color = (0.66, 0.74, 1.0)
moon_light.angle = math.radians(2)
moon_sun = link(bpy.data.objects.new('clair de lune', moon_light))
dusk_light = bpy.data.lights.new('couchant', 'SUN')
dusk_light.color = (1.0, 0.5, 0.3)
dusk_sun = link(bpy.data.objects.new('couchant', dusk_light))
dusk_sun.rotation_euler = (math.radians(84), 0, math.radians(-120))

# ---- la caméra
cam_data = bpy.data.cameras.new('caméra')
cam = link(bpy.data.objects.new('caméra', cam_data))
scene.camera = cam
target = link(bpy.data.objects.new('visée', None))
track = cam.constraints.new('TRACK_TO')
track.target = target
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'
halo_track = halo.constraints.new('TRACK_TO')
halo_track.target = cam
halo_track.track_axis = 'TRACK_Z'
halo_track.up_axis = 'UP_Y'


def place_moon(cam_pos, through, distance=420, drop=0.0):
    """La lune, dans l'alignement caméra -> point visé (le loup), à grande distance."""
    d = (through - cam_pos).normalized()
    pos = cam_pos + d * distance
    pos.z -= drop
    moon.location = pos
    aim = (cam_pos - pos).normalized()
    moon_sun.rotation_euler = (-aim).to_track_quat('-Z', 'Y').to_euler()
    return pos


def set_fog(color):
    for mat in FOGGED:
        mat.node_tree.nodes['fog'].inputs['Color'].default_value = (*color, 1)


def key(socket_owner, attr, frame, value):
    setattr(socket_owner, attr, value)
    socket_owner.keyframe_insert(attr, frame=frame)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    return t * t * (3 - 2 * t)


# ============================== les trois rendus ==============================
CAM_START = Vector((-18.0, -150.0, 40.0))
CAM_END = Vector((0.0, -62.0, height(0, -62) + 1.5))
LOOK_START = Vector((0.0, 30.0, 8.0))
LOOK_END = Vector((-3.0, 0.0, 7.6))

if args.mode == 'seq':
    cam_data.lens = 32
    F = args.frames
    # Toutes les valeurs sont posées image par image : pas d'interpolation surprise.
    for f in range(1, F + 1):
        t = (f - 1) / (F - 1)
        e = smooth(t)
        cam.location = CAM_START.lerp(CAM_END, e)
        cam.location.z += math.sin(t * math.pi) * 4
        cam.keyframe_insert('location', frame=f)
        target.location = LOOK_START.lerp(LOOK_END, e)
        target.keyframe_insert('location', frame=f)
        night = smooth(min(1.0, t * 1.5))
        key(mix_sky.inputs[0], 'default_value', f, night)
        key(star_amt.inputs[1], 'default_value', f, 6.0 * smooth(max(0.0, (t - 0.25) / 0.75)))
        key(dusk_light, 'energy', f, 2.2 * (1 - night))
        key(moon_light, 'energy', f, 0.1 + 0.65 * night)
        key(bg.inputs['Strength'], 'default_value', f, 1.0)
        fog = [lerp(a, b, night) for a, b in zip(FOG_DUSK, FOG_NIGHT)]
        for mat in FOGGED:
            key(mat.node_tree.nodes['fog'].inputs['Color'], 'default_value', f, (*fog, 1))
        # la lune se lève derrière le loup
        final = place_moon(CAM_END, WOLF_HEAD + Vector((0, 0, 0.6)))
        rise = smooth(min(1.0, t * 1.15))
        moon.location = final + Vector((0, 0, -230 * (1 - rise)))
        moon.keyframe_insert('location', frame=f)
        moon_sun.keyframe_insert('rotation_euler', frame=f)
        for em, at in WINDOWS:
            key(em.inputs['Strength'], 'default_value', f, 0.0 if f < at else min(9.0, (f - at + 1) * 3.0))
    frames = [int(x) for x in args.only.split(',')] if args.only else range(1, F + 1)
    for f in frames:
        scene.frame_set(f)
        scene.render.filepath = os.path.join(args.out, f'{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        print(f'image {f}/{F}', flush=True)

elif args.mode == 'loup':
    # Contre-plongée au téléobjectif : le loup en ombre chinoise devant une lune immense.
    # La lune est posée devant les montagnes (sinon elles la cachent) et réduite d'autant.
    cam_data.lens = 55
    offset = Vector((4.0, -12.0, 1.5 - WOLF_HEAD.z))  # 1,5 m du sol : on lève les yeux vers le loup
    cam.location = WOLF_HEAD + offset
    target.location = WOLF_HEAD + Vector((0.0, 0.0, -0.6))
    face = Vector((offset.x, offset.y, 0)).normalized()
    wolf.rotation_euler = (0, 0, math.atan2(face.x, -face.y))
    mix_sky.inputs[0].default_value = 1.0
    star_amt.inputs[1].default_value = 6.0
    dusk_light.energy = 0.0
    moon_light.energy = 0.7
    set_fog(FOG_NIGHT)
    place_moon(cam.location, WOLF_HEAD + Vector((-0.3, 0, 0.25)), distance=150)
    moon.scale = (0.4, 0.4, 0.4)
    for em, _ in WINDOWS:
        em.inputs['Strength'].default_value = 8.0
    scene.render.filepath = os.path.join(args.out, 'loup-lune.png')
    bpy.ops.render.render(write_still=True)

elif args.mode == 'aube':
    # Le jour se lève : même village, soleil rose à l'horizon, fenêtres éteintes.
    cam_data.lens = 30
    cam.location = Vector((-30.0, -46.0, 13.0))
    target.location = Vector((3.0, 4.0, 5.0))
    wn.links.new(SKIES['dawn'].outputs['Color'], mix_sky.inputs[7])
    mix_sky.inputs[0].default_value = 1.0
    star_amt.inputs[1].default_value = 0.0
    set_fog(FOG_DAWN)
    moon.hide_render = True
    halo.hide_render = True
    moon_light.energy = 0.4
    dusk_light.energy = 3.2
    dusk_light.color = (1.0, 0.62, 0.42)
    dusk_sun.rotation_euler = (math.radians(86), 0, math.radians(-28))
    for em, _ in WINDOWS:
        em.inputs['Strength'].default_value = 0.6
    scene.render.filepath = os.path.join(args.out, 'aube.png')
    bpy.ops.render.render(write_still=True)

print('terminé', flush=True)
