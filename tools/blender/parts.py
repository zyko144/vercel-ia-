# Composants du PC, un par un, pour Mon PC › Composants : chaque pièce modélisée seule puis rendue détourée
# (fond transparent + ombre au sol). Lancer : /tmp/bl/bin/python tools/blender/parts.py [pièces…] → launcher/src/ui/pc3d/<pièce>.png,
# puis python3 -c "from PIL import Image;import glob,os;[Image.open(f).save(f[:-3]+'webp',quality=86,method=6) or os.remove(f) for f in glob.glob('launcher/src/ui/pc3d/*.png')]"
import bpy, math, os, sys
from mathutils import Vector

UI = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'launcher', 'src', 'ui', 'pc3d'); os.makedirs(UI, exist_ok=True)
ONLY = sys.argv[1:]  # ex. « cpu gpu » pour ne refaire que ces pièces


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('SAMPLES', 128)); sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 900, 600; sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.3
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; sky = nt.nodes.new('ShaderNodeTexGradient'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, math.pi / 2, 0)  # studio : plus clair en haut, sombre en bas (reflets réalistes sur le métal)
    ramp.color_ramp.elements[0].color = (0.02, 0.025, 0.035, 1); ramp.color_ramp.elements[1].color = (0.75, 0.8, 0.9, 1)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], sky.inputs['Vector']); nt.links.new(sky.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], nt.nodes['Background'].inputs['Color']); nt.nodes['Background'].inputs['Strength'].default_value = 0.5
    return sc


def node_mat(name, color, rough, metal=0.0, emit=None, strength=0.0, aniso=0.0, grain=0.0, traces=False):
    """Matériau avec un peu de matière : grain de surface (rugosité qui varie), métal brossé, pistes de circuit imprimé."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if aniso: b.inputs['Anisotropic'].default_value = aniso
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if grain:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 140; n.inputs['Detail'].default_value = 6
        if aniso: mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 60); nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        else: nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = rough * (1 - grain); mr.inputs['To Max'].default_value = rough * (1 + grain)
        nt.links.new(n.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.05; nt.links.new(n.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    if traces:  # pistes cuivrées sous le vernis : Voronoï « distance au bord » en métrique Manhattan
        v = nt.nodes.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.distance = 'MANHATTAN'; v.inputs['Scale'].default_value = 22
        nt.links.new(tc.outputs['Object'], v.inputs['Vector'])
        r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = 0.0; r.color_ramp.elements[1].position = 0.035
        r.color_ramp.elements[0].color = tuple(min(1, c * 1.6 + 0.012) for c in color) + (1,); r.color_ramp.elements[1].color = (*color, 1)
        nt.links.new(v.outputs['Distance'], r.inputs['Fac']); nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15; bump.invert = True
        nt.links.new(r.outputs['Color'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        b.inputs['Coat Weight'].default_value = 0.6; b.inputs['Coat Roughness'].default_value = 0.15
    return m


def mats():
    return {
        'pcb': node_mat('pcb', (0.012, 0.045, 0.035), 0.4, traces=True), 'pcbdark': node_mat('pcbdark', (0.015, 0.016, 0.02), 0.4, traces=True),
        'gold': node_mat('gold', (1.0, 0.74, 0.32), 0.2, 1.0, grain=0.3), 'ihs': node_mat('ihs', (0.82, 0.83, 0.85), 0.16, 1.0, aniso=0.7, grain=0.4),
        'alu': node_mat('alu', (0.7, 0.72, 0.75), 0.26, 1.0, aniso=0.5, grain=0.4), 'black': node_mat('black', (0.02, 0.02, 0.024), 0.42, 0.3, grain=0.35),
        'shroud': node_mat('shroud', (0.05, 0.055, 0.062), 0.32, 0.75, grain=0.3), 'blade': node_mat('blade', (0.015, 0.015, 0.018), 0.5, grain=0.2),
        'chip': node_mat('chip', (0.025, 0.025, 0.028), 0.3, 0.1, grain=0.5), 'copper': node_mat('copper', (0.95, 0.48, 0.28), 0.22, 1.0, grain=0.3),
        'label': node_mat('label', (0.1, 0.105, 0.115), 0.5, grain=0.2), 'cap': node_mat('cap', (0.1, 0.1, 0.115), 0.3, 0.8, grain=0.3),
        'rgb': node_mat('rgb', (0.25, 0.05, 0.6), 0.35, emit=(0.45, 0.1, 1), strength=1.4), 'rgb2': node_mat('rgb2', (0.02, 0.35, 0.6), 0.35, emit=(0.0, 0.55, 1), strength=1.4),
        'print': node_mat('print', (0.75, 0.77, 0.8), 0.55), 'slot': node_mat('slot', (0.06, 0.06, 0.07), 0.5, grain=0.3), 'yellow': node_mat('yellow', (0.75, 0.6, 0.1), 0.4),
        'pcbblue': node_mat('pcbblue', (0.02, 0.05, 0.03), 0.4, traces=True), 'red': node_mat('red', (0.6, 0.02, 0.03), 0.3, 0.6, grain=0.3), 'ledred': node_mat('ledred', (0.8, 0.1, 0.1), 0.3, emit=(1, 0.08, 0.06), strength=1.6), 'white': node_mat('white', (0.85, 0.86, 0.88), 0.4),
        'led': node_mat('led', (0.8, 0.85, 0.9), 0.3, emit=(0.75, 0.85, 1), strength=1.6), 'mesh': node_mat('mesh', (0.03, 0.03, 0.035), 0.5, 0.6),
    }


def box(size, loc, m, bevel=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size; bpy.ops.object.transform_apply(scale=True)
    if bevel: mod = o.modifiers.new('b', 'BEVEL'); mod.width = bevel; mod.segments = 3; mod.limit_method = 'ANGLE'
    o.data.materials.append(m); bpy.ops.object.shade_smooth_by_angle() if bevel else None
    return o


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=48, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth_by_angle()
    if bevel: mod = o.modifiers.new('b', 'BEVEL'); mod.width = bevel; mod.segments = 3; mod.limit_method = 'ANGLE'
    return o


def text(body, loc, size, m, rot=(0, 0, 0), extrude=0.0, bold=True):
    """Inscription imprimée ou gravée (texte générique, sans marque)."""
    bpy.ops.object.text_add(location=loc, rotation=rot); t = bpy.context.object; t.data.body = body; t.data.size = size; t.data.extrude = extrude
    t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'; t.data.materials.append(m)
    if bold: t.data.offset = size * 0.012
    return t


def fan(M, loc, r, ring=None, blades=9, frame=False):
    """Ventilateur vu de face (axe Z) : anneau, moyeu avec autocollant, pales courbées."""
    if frame:
        for dx, dy, sx, sy in ((0, r, 2 * r, 0.06), (0, -r, 2 * r, 0.06), (r, 0, 0.06, 2 * r), (-r, 0, 0.06, 2 * r)): box((sx, sy, 0.12), (loc[0] + dx, loc[1] + dy, loc[2]), M['black'], 0.012)
    if ring: bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.95, minor_radius=r * 0.03, location=loc); bpy.context.object.data.materials.append(ring)
    cyl(r * 0.3, 0.06, (loc[0], loc[1], loc[2] + 0.02), M['cap'], bevel=0.008)
    cyl(r * 0.2, 0.002, (loc[0], loc[1], loc[2] + 0.051), M['label'])
    for k in range(blades):
        a = k * 2 * math.pi / blades
        box((r * 0.64, r * 0.3, 0.008), (loc[0] + math.cos(a) * r * 0.6, loc[1] + math.sin(a) * r * 0.6, loc[2]), M['blade'], r * 0.13, (0.45, 0, a + 0.15))


def shoot(sc, name, view=(1.0, -1.25, 0.95), lens=60, margin=1.35):
    """Caméra 3/4 cadrée sur la pièce, lumières de studio, ombre au sol (attrape-ombre), rendu détouré."""
    pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, radius = (lo + hi) / 2, (hi - lo).length / 2
    bpy.ops.mesh.primitive_plane_add(size=radius * 12, location=(centre.x, centre.y, lo.z - 0.001)); bpy.context.object.is_shadow_catcher = True
    d = Vector(view).normalized(); dist = radius * margin / math.tan(math.atan(18 / lens))
    bpy.ops.object.camera_add(location=centre + d * dist); cam = bpy.context.object; cam.data.lens = lens; sc.camera = cam
    cam.data.dof.use_dof = True; cam.data.dof.aperture_fstop = 11; cam.data.dof.focus_distance = dist
    bpy.ops.object.empty_add(location=centre); t = bpy.context.object
    c = cam.constraints.new('TRACK_TO'); c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    for off, e, col, size in (((1.0, -1.5, 2.4), 700, (1, .96, .92), 3.0), ((-2.4, 0.4, 1.2), 260, (.62, .74, 1), 2.0), ((0.4, 2.6, 0.9), 520, (1, .85, .7), 0.8)):
        bpy.ops.object.light_add(type='AREA', location=centre + Vector(off) * radius * 2.2); l = bpy.context.object
        l.data.energy = e * radius * radius; l.data.color = col; l.data.size = radius * size
        k = l.constraints.new('TRACK_TO'); k.target = t; k.track_axis = 'TRACK_NEGATIVE_Z'; k.up_axis = 'UP_Y'
    sc.render.filepath = os.path.join(UI, f'{name}.png'); bpy.ops.render.render(write_still=True)


def cpu(M, kind='am5'):
    """Processeur : AMD AM5 (capot à encoches), AMD AM4 (capot carré), Intel LGA1700/1851 (rectangulaire)."""
    intel = kind == 'intel'
    W, H = (1.2, 1.0) if intel else (1.0, 1.0)
    box((W, H, 0.05), (0, 0, 0.025), M['pcb' if not intel else 'pcbblue'], 0.006)
    box((0.05, 0.05, 0.003), (-W / 2 + 0.05, -H / 2 + 0.05, 0.051), M['gold'], 0)  # repère du coin
    for k in range(int(W / 0.06) - 3): box((0.022, 0.045, 0.014), (-W / 2 + 0.12 + k * 0.06, -H / 2 + 0.035, 0.057), M['cap'], 0.003); box((0.022, 0.045, 0.014), (-W / 2 + 0.12 + k * 0.06, H / 2 - 0.035, 0.057), M['cap'], 0.003)
    if kind == 'am5':  # capot « pieuvre » : corps central + 4 pattes, condensateurs visibles dans les encoches
        box((0.82, 0.56, 0.06), (0, 0, 0.08), M['ihs'], 0.03)
        for x in (-0.33, 0.33):
            for y in (-0.36, 0.36): box((0.16, 0.2, 0.06), (x, y, 0.08), M['ihs'], 0.03)
        for k in range(6):
            for y in (-0.37, 0.37): box((0.03, 0.05, 0.014), (-0.12 + k * 0.05, y, 0.057), M['cap'], 0.003)
        top, title, sub = 0.111, 'RYZEN', 'AM5  ·  8-CORE'
    elif kind == 'am4':
        box((0.84, 0.84, 0.03), (0, 0, 0.065), M['ihs'], 0.02); box((0.74, 0.74, 0.05), (0, 0, 0.1), M['ihs'], 0.06)
        top, title, sub = 0.1255, 'RYZEN', 'AM4  ·  6-CORE'
    else:
        box((0.96, 0.74, 0.03), (0, 0, 0.065), M['ihs'], 0.015); box((0.8, 0.7, 0.05), (0, 0, 0.1), M['ihs'], 0.03)
        for x in (-0.49, 0.49): box((0.04, 0.12, 0.03), (x, 0, 0.065), M['pcbblue'], 0)  # encoches latérales
        top, title, sub = 0.1255, 'INTEL CORE', 'LGA1700  ·  14 CORES'
    text(title, (0, 0.14, top), 0.11, M['chip']); text(sub, (0, 0.02, top), 0.045, M['chip'])
    text('2342SUS  ·  100-000000910', (0, -0.08, top), 0.03, M['chip']); text('DIFFUSED IN · MADE IN', (0, -0.15, top), 0.026, M['chip'])


def gpu(M, kind='rtx'):
    """Carte graphique : NVIDIA RTX (3 ventilateurs), GTX (2, plus courte), AMD Radeon (accents rouges), Intel Arc (2, lumière blanche)."""
    fans = 2 if kind in ('gtx', 'arc') else 3
    L = 2.0 if fans == 2 else 2.6
    accent = {'rtx': M['alu'], 'gtx': M['alu'], 'radeon': M['red'], 'arc': M['alu']}[kind]
    label = {'rtx': 'GEFORCE RTX', 'gtx': 'GEFORCE GTX', 'radeon': 'RADEON', 'arc': 'INTEL ARC'}[kind]
    box((L, 1.05, 0.36), (0, 0, 0.18), M['shroud'], 0.07)
    box((L + 0.02, 1.07, 0.025), (0, 0, -0.012), M['alu'], 0.012)
    step = (L - 0.3) / fans
    xs = [-L / 2 + 0.15 + step * (k + 0.5) for k in range(fans)]
    for k in range(fans - 1): box((0.06, 1.02, 0.014), ((xs[k] + xs[k + 1]) / 2, 0, 0.362), accent, 0.004, (0, 0, 0.35))
    if kind == 'radeon':
        for y in (-0.5, 0.5): box((L * 0.9, 0.02, 0.05), (0, y, 0.33), M['red'], 0.004)
    if kind != 'gtx': box((L * 0.8, 0.025, 0.06), (0.1, -0.53, 0.22), M['ledred' if kind == 'radeon' else 'led'], 0.005)
    text(label, (L / 2 - 0.55, -0.528, 0.11), 0.075, M['print'], (math.pi / 2, 0, 0))
    r = min(0.36, step / 2 - 0.03)
    for x in xs: cyl(r + 0.025, 0.02, (x, 0, 0.358), M['black'], bevel=0.005); fan(M, (x, 0, 0.375), r, None, blades=11 if kind != 'radeon' else 9)
    box((0.04, 1.0, 0.5), (-L / 2 - 0.03, 0, 0.17), M['alu'], 0.005)
    for k in range(4): box((0.012, 0.18, 0.12), (-L / 2 - 0.06, -0.32 + k * 0.21, 0.24), M['black'], 0.01)
    for k in range(20): box((0.012, 0.03, 0.06), (-L / 2 - 0.06, -0.35 + k * 0.035, 0.05), M['mesh'], 0)
    box((1.05, 0.06, 0.04), (-L / 2 + 0.75, -0.55, -0.005), M['pcb'], 0.003); box((1.0, 0.065, 0.026), (-L / 2 + 0.75, -0.55, -0.005), M['gold'], 0.002)
    box((0.3, 0.14, 0.1), (L / 2 - 0.55, 0.48, 0.4), M['black'], 0.015)
    for k in range(6): box((0.035, 0.035, 0.03), (L / 2 - 0.64 + k * 0.035, 0.48, 0.45), M['yellow'], 0)


def ram(M, kind='ddr5'):
    """Mémoire : DDR5 (RGB, encoche au centre), DDR4 (dissipateur crénelé, encoche décalée), SO-DIMM (PC portable)."""
    if kind == 'sodimm':
        for k, y in enumerate((-0.3, 0.3)):
            box((1.36, 0.6, 0.02), (0, y, 0.01 + k * 0.0), M['pcb'], 0.003)
            for j in range(4): box((0.24, 0.16, 0.025), (-0.45 + j * 0.3, y + 0.08, 0.035), M['chip'], 0.006)
            box((0.6, 0.16, 0.003), (0.25, y - 0.12, 0.022), M['label'], 0); text('8GB DDR5 SO-DIMM', (0.25, y - 0.12, 0.0245), 0.035, M['print'])
            box((1.3, 0.05, 0.021), (0, y - 0.28, 0.0105), M['gold'], 0)
        return
    ddr5 = kind == 'ddr5'
    for k, y in enumerate((-0.14, 0.14)):
        box((1.36, 0.035, 0.3), (0, y, 0.17), M['pcbdark'], 0.003)
        for j in range(8): box((0.12, 0.042, 0.09), (-0.55 + j * 0.157, y, 0.1), M['chip'], 0.006)
        box((1.42, 0.07, 0.28), (0, y, 0.22), M['black' if ddr5 else 'shroud'], 0.012)
        if ddr5:
            for j in range(3): box((0.36, 0.075, 0.012), (-0.35 + j * 0.35, y, 0.31 - j * 0.03), M['alu'], 0.003)
            box((1.4, 0.072, 0.07), (0, y, 0.39), M['rgb' if k else 'rgb2'], 0.025); box((1.42, 0.074, 0.012), (0, y, 0.35), M['black'], 0.004)
        else:
            for j in range(9): box((0.1, 0.07, 0.08 + (j % 2) * 0.05), (-0.62 + j * 0.155, y, 0.39 + (j % 2) * 0.025), M['red'], 0.01)  # crénelage
            box((1.3, 0.075, 0.02), (0, y, 0.18), M['red'], 0.003)
        text('DDR5  6000 MT/s' if ddr5 else 'DDR4  3200 MHz', (0.25, y - 0.0375, 0.24), 0.05, M['print'], (math.pi / 2, 0, 0))
        notch = 0.0 if ddr5 else -0.12
        box((0.66 + notch, 0.037, 0.03), (-0.35 + notch / 2, y, 0.015), M['gold'], 0); box((0.66 - notch, 0.037, 0.03), (0.35 + notch / 2, y, 0.015), M['gold'], 0)


def ssd(M, kind='nvme'):
    """Stockage : SSD NVMe M.2, SSD SATA 2,5 pouces, disque dur 3,5 pouces."""
    if kind == 'sata':
        box((1.4, 1.0, 0.1), (0, 0, 0.05), M['shroud'], 0.03)
        box((1.0, 0.7, 0.004), (0.05, 0, 0.102), M['label'], 0); text('SSD', (0.05, 0.12, 0.105), 0.16, M['print']); text('SATA III  ·  2.5"  ·  1TB', (0.05, -0.12, 0.105), 0.05, M['print'])
        box((0.04, 0.5, 0.05), (-0.72, 0, 0.04), M['black'], 0.005)
        for y in (-0.45, 0.45): cyl(0.03, 0.01, (0.55, y, 0.1), M['ihs'], verts=16)
        return
    if kind == 'hdd':
        box((1.6, 1.02, 0.26), (0, 0, 0.13), M['alu'], 0.03)
        cyl(0.42, 0.02, (0.15, 0, 0.265), M['ihs'])
        box((0.9, 0.6, 0.004), (-0.25, 0.08, 0.283), M['label'], 0); text('HDD', (-0.25, 0.2, 0.287), 0.12, M['print']); text('7200 RPM  ·  SATA  ·  2TB', (-0.25, -0.02, 0.287), 0.045, M['print'])
        for x in (-0.72, 0.72):
            for y in (-0.44, 0.44): cyl(0.03, 0.02, (x, y, 0.265), M['black'], verts=6)
        box((0.04, 0.5, 0.08), (-0.82, 0, 0.06), M['black'], 0.005)
        box((1.6, 1.0, 0.04), (0, 0, -0.02), M['pcb'], 0.004)
        return
    box((2.2, 0.62, 0.035), (0, 0, 0.018), M['pcb'], 0.004)
    box((0.12, 0.62, 0.036), (1.06, 0, 0.018), M['gold'], 0.002); box((0.13, 0.05, 0.04), (1.07, 0.16, 0.018), M['black'], 0)
    cyl(0.07, 0.036, (-1.1, 0, 0.018), M['gold'])
    box((0.42, 0.42, 0.035), (-0.6, 0, 0.055), M['chip'], 0.008); box((0.42, 0.42, 0.035), (-0.08, 0, 0.055), M['chip'], 0.008); box((0.28, 0.28, 0.03), (0.5, 0, 0.052), M['chip'], 0.008)
    for k in range(6): box((0.03, 0.05, 0.015), (0.75 + (k % 3) * 0.06, -0.2 + (k // 3) * 0.4, 0.043), M['cap'], 0.003)
    box((1.4, 0.52, 0.004), (-0.3, 0, 0.0745), M['label'], 0)
    text('NVMe  M.2  2280', (-0.3, 0.13, 0.0775), 0.075, M['print']); text('PCIe Gen4 x4  ·  1TB', (-0.3, 0.0, 0.0775), 0.05, M['print']); text('SSD', (-0.3, -0.13, 0.0775), 0.06, M['print'])


def battery(M):
    box((1.6, 0.62, 0.12), (0, 0, 0.06), M['black'], 0.02)
    for k in range(3): cyl(0.09, 0.48, (-0.5 + k * 0.5, 0, 0.065), M['shroud'], (0, math.pi / 2, 0), 32)
    box((1.2, 0.4, 0.004), (0, 0, 0.122), M['label'], 0); text('Li-ion  11.55V  ·  70Wh', (0, 0.06, 0.125), 0.06, M['print']); text('BATTERY PACK', (0, -0.07, 0.125), 0.045, M['print'])
    box((0.16, 0.12, 0.05), (0.85, 0.1, 0.06), M['white'], 0.01)


def board(M):
    box((2.44, 3.05, 0.04), (0, 0, 0.02), M['pcbdark'], 0.006)
    box((0.66, 0.66, 0.05), (-0.15, 0.55, 0.065), M['alu'], 0.01); box((0.5, 0.5, 0.02), (-0.15, 0.55, 0.095), M['chip'], 0.01)  # socket
    for (sx, sy, x, y) in ((1.1, 0.26, -0.25, 1.15), (0.26, 0.85, -0.9, 0.55)):
        box((sx, sy, 0.2), (x, y, 0.14), M['shroud'], 0.03)
        for j in range(int(max(sx, sy) / 0.06)): box((sx * 0.92 if sx > sy else 0.02, 0.02 if sx > sy else sy * 0.92, 0.04), (x + (0 if sx > sy else -sx / 2 + 0.03 + j * 0.06), y + (-sy / 2 + 0.03 + j * 0.06 if sx > sy else 0), 0.25), M['alu'], 0) if j * 0.06 < min(sx, sy) - 0.04 else None
    box((0.4, 0.75, 0.3), (-1.02, 1.12, 0.17), M['shroud'], 0.05); box((0.02, 0.6, 0.03), (-0.81, 1.12, 0.29), M['rgb'], 0.005)
    text('GAMING', (-0.81, 1.12, 0.2), 0.08, M['print'], (math.pi / 2, 0, math.pi / 2))
    for k in range(4): box((0.07, 1.4, 0.08), (0.55 + k * 0.1, 0.55, 0.08), M['slot'], 0.008); box((0.07, 0.05, 0.1), (0.55 + k * 0.1, -0.17, 0.09), M['print'], 0.006)
    box((0.12, 0.35, 0.12), (1.12, 0.55, 0.1), M['black'], 0.01)  # 24 broches
    for y in (-0.35, -0.95):
        box((1.75, 0.09, 0.1), (-0.25, y, 0.09), M['slot'], 0.008)
    box((1.7, 0.1, 0.11), (-0.25, -0.35, 0.095), M['alu'], 0.008)
    box((1.0, 0.3, 0.06), (-0.35, -0.66, 0.08), M['shroud'], 0.02); text('M.2', (-0.35, -0.66, 0.111), 0.07, M['print'])
    box((0.6, 0.6, 0.14), (0.6, -1.05, 0.1), M['shroud'], 0.05); box((0.42, 0.02, 0.02), (0.6, -0.75, 0.17), M['rgb'], 0.004)
    for k in range(4): box((0.1, 0.14, 0.1), (1.12, -0.4 - k * 0.17, 0.08), M['slot'], 0.008)  # SATA
    for k in range(8): cyl(0.035, 0.09, (0.3 + k * 0.07, 0.06, 0.085), M['cap'], verts=20)
    for k in range(5): cyl(0.05, 0.1, (-1.05 + k * 0.12, -1.32, 0.09), M['gold'], verts=20)  # audio
    box((0.3, 0.3, 0.025), (-0.7, -1.1, 0.05), M['chip'], 0.006)
    for x in (-1.12, 1.12):
        for y in (-1.42, 1.42): cyl(0.05, 0.042, (x, y, 0.021), M['gold'], verts=20)


def psu(M):
    box((1.5, 1.4, 0.86), (0, 0, 0.43), M['black'], 0.05)
    cyl(0.56, 0.012, (0, 0, 0.862), M['mesh'])
    for k in range(13): box((1.12, 0.014, 0.014), (0, -0.54 + k * 0.09, 0.874), M['black'], 0.003)
    fan(M, (0, 0, 0.83), 0.5, None, blades=9)
    box((0.006, 0.82, 0.42), (0.753, 0, 0.43), M['label'], 0)
    text('850W', (0.758, 0.16, 0.53), 0.14, M['print'], (math.pi / 2, 0, math.pi / 2)); text('80 PLUS GOLD', (0.758, 0.16, 0.4), 0.06, M['yellow'], (math.pi / 2, 0, math.pi / 2))
    text('FULLY MODULAR', (0.758, 0.16, 0.32), 0.045, M['print'], (math.pi / 2, 0, math.pi / 2))
    box((1.0, 0.012, 0.6), (0, -0.705, 0.43), M['shroud'], 0.01)
    for k in range(3):
        for j in range(4): box((0.15, 0.03, 0.1), (-0.3 + j * 0.2, -0.715, 0.27 + k * 0.15), M['black'], 0.012); box((0.1, 0.031, 0.05), (-0.3 + j * 0.2, -0.716, 0.27 + k * 0.15), M['slot'], 0)
    box((1.4, 0.012, 0.8), (0, 0.705, 0.43), M['mesh'], 0)
    box((0.18, 0.03, 0.12), (-0.45, 0.72, 0.62), M['black'], 0.01); box((0.24, 0.03, 0.16), (0.4, 0.72, 0.62), M['black'], 0.02)


def cooler(M):
    box((0.5, 0.5, 0.12), (0, 0, 0.06), M['copper'], 0.02); box((0.7, 0.18, 0.04), (0, 0, 0.13), M['alu'], 0.01)
    for k in range(6): cyl(0.035, 1.6, (-0.25 + k * 0.1, 0.06 * (k % 2) - 0.03, 0.9), M['copper'], verts=20)
    for k in range(46): box((1.1, 0.58, 0.01), (0, 0, 0.32 + k * 0.026), M['alu'], 0.002)
    box((1.12, 0.6, 0.06), (0, 0, 1.55), M['black'], 0.025)
    for k in range(6): cyl(0.04, 0.02, (-0.25 + k * 0.1, 0.06 * (k % 2) - 0.03, 1.59), M['ihs'], verts=20)
    bpy.ops.object.empty_add(location=(0, -0.36, 0.93)); fan_root = bpy.context.object
    before = set(bpy.context.scene.objects); fan(M, (0, 0, 0), 0.6, M['rgb'], frame=True)
    for o in set(bpy.context.scene.objects) - before - {fan_root}: o.parent = fan_root
    fan_root.rotation_euler = (math.pi / 2, 0, 0)


from functools import partial as P
PARTS = {
    'cpu-am5': (P(cpu, kind='am5'), (1.0, -1.1, 1.4)), 'cpu-am4': (P(cpu, kind='am4'), (1.0, -1.1, 1.4)), 'cpu-intel': (P(cpu, kind='intel'), (1.0, -1.1, 1.4)),
    'gpu-rtx': (P(gpu, kind='rtx'), (0.9, -1.4, 1.15)), 'gpu-gtx': (P(gpu, kind='gtx'), (0.9, -1.4, 1.15)), 'gpu-radeon': (P(gpu, kind='radeon'), (0.9, -1.4, 1.15)), 'gpu-arc': (P(gpu, kind='arc'), (0.9, -1.4, 1.15)),
    'ram-ddr5': (P(ram, kind='ddr5'), (0.9, -1.5, 0.9)), 'ram-ddr4': (P(ram, kind='ddr4'), (0.9, -1.5, 0.9)), 'ram-sodimm': (P(ram, kind='sodimm'), (0.8, -1.2, 1.4)),
    'disk-nvme': (P(ssd, kind='nvme'), (0.8, -1.3, 1.3)), 'disk-sata': (P(ssd, kind='sata'), (0.9, -1.3, 1.2)), 'disk-hdd': (P(ssd, kind='hdd'), (0.9, -1.3, 1.1)),
    'board': (board, (0.8, -1.2, 1.6)), 'psu': (psu, (1.15, -1.2, 0.85)), 'cooler': (cooler, (1.1, -1.4, 0.6)), 'battery': (battery, (0.8, -1.3, 1.2)),
}
for name, (build, view) in PARTS.items():
    if ONLY and name not in ONLY: continue
    sc = reset(); M = mats(); build(M); shoot(sc, name, view)
print('ok')
