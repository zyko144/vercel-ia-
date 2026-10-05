# Décor Halloween du launcher : citrouilles et araignée modélisées puis rendues en PNG transparents.
# Lancer : python halloween.py (module bpy) → launcher/src/ui/halloween/*.png
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'launcher', 'src', 'ui', 'halloween')
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = 160; s.cycles.use_denoising = True
    s.render.film_transparent = True; s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'RGBA'
    s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'Medium High Contrast'
    w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.03, 0.02, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.4
    return s


def mat(name, color, rough=0.55, emit=None, strength=0.0, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    if sss: b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (1, .4, .1)
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    return m


def light(loc, energy, color=(1, .85, .7), size=3):
    l = bpy.data.lights.new('l', 'AREA'); l.energy = energy; l.color = color; l.size = size
    o = bpy.data.objects.new('l', l); bpy.context.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def camera(loc, target, lens=50):
    c = bpy.data.cameras.new('c'); c.lens = lens
    o = bpy.data.objects.new('c', c); bpy.context.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o


def skin_mat():
    """Peau réaliste : couleur irrégulière (bruit), sillons plus sombres, stries verticales en relief, aspect cireux."""
    m = bpy.data.materials.new('peau'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3.5; noise.inputs['Detail'].default_value = 8
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.55, 0.11, 0.003, 1); ramp.color_ramp.elements[1].color = (1.0, 0.36, 0.012, 1)
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[1].position = 0.7
    geo = N.new('ShaderNodeNewGeometry')
    groove = N.new('ShaderNodeValToRGB'); groove.color_ramp.elements[0].position = 0.46; groove.color_ramp.elements[1].position = 0.53
    groove.color_ramp.elements[0].color = (0.18, 0.05, 0.01, 1); groove.color_ramp.elements[1].color = (1, 1, 1, 1)
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    L.new(tc.outputs['Object'], noise.inputs['Vector']); L.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    L.new(geo.outputs['Pointiness'], groove.inputs['Fac'])
    L.new(ramp.outputs['Color'], mix.inputs[6]); L.new(groove.outputs['Color'], mix.inputs[7]); L.new(mix.outputs[2], b.inputs['Base Color'])
    # stries verticales fines (bruit étiré en hauteur) + petit grain
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (14, 14, 1.2)
    streak = N.new('ShaderNodeTexNoise'); streak.inputs['Scale'].default_value = 3; streak.inputs['Detail'].default_value = 4
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 120
    add = N.new('ShaderNodeMath'); add.operation = 'ADD'
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.05; bump.inputs['Distance'].default_value = 0.01
    L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], streak.inputs['Vector']); L.new(tc.outputs['Object'], fine.inputs['Vector'])
    L.new(streak.outputs['Fac'], add.inputs[0]); L.new(fine.outputs['Fac'], add.inputs[1]); L.new(add.outputs[0], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.42; b.inputs['Subsurface Weight'].default_value = 0.12; b.inputs['Subsurface Radius'].default_value = (1, .35, .08)
    b.inputs['Coat Weight'].default_value = 0.25; b.inputs['Coat Roughness'].default_value = 0.35
    return m


def stem_mat():
    m = bpy.data.materials.new('tige'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links; b = N['Principled BSDF']
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 12; noise.inputs['Detail'].default_value = 10
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.09, 0.08, 0.03, 1); ramp.color_ramp.elements[1].color = (0.36, 0.3, 0.14, 1)
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6
    L.new(noise.outputs['Fac'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color']); L.new(noise.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.85
    return m


def pumpkin(loc=(0, 0, 0), size=1.0, face=True, ribs=10, tilt=0.0, seed=0):
    import random; rnd = random.Random(seed); var = [1 + rnd.uniform(-0.05, 0.05) for _ in range(ribs)]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=160, ring_count=80, radius=1, location=loc)
    p = bpy.context.object
    for v in p.data.vertices:  # vrais quartiers : sillons étroits et profonds, quartiers bombés un peu inégaux, creux en haut
        x, y, z = v.co; a = math.atan2(y, x) % (2 * math.pi); r = math.sqrt(x * x + y * y)
        seg = a / (2 * math.pi) * ribs; k = int(seg) % ribs
        lobe = abs(math.sin(math.pi * seg)) ** 0.33 * var[k]
        f = (0.86 + 0.14 * lobe) * (1 + 0.04 * math.sin(a * 2 + seed))
        v.co.x, v.co.y = x * f * 1.12, y * f * 1.12
        v.co.z = z * 0.86 - 0.2 * (1 - r) ** 2 * (1 if z > 0 else -0.5)
    p.scale = (size,) * 3; p.rotation_euler.z = tilt
    bpy.ops.object.shade_smooth()
    p.data.materials.append(skin_mat())
    if face:  # visage creusé (booléen) : on voit la chair jaune sur l'épaisseur et l'intérieur qui brille
        flesh = mat('chair', (0.9, 0.45, 0.08), 0.6, emit=(1, .3, .02), strength=0.5)
        p.data.materials.append(flesh)
        sol = p.modifiers.new('ep', 'SOLIDIFY'); sol.thickness = 0.1; sol.material_offset = 1; sol.material_offset_rim = 1
        shapes = [[(-.56, .28), (-.16, .26), (-.33, .62)], [(.16, .26), (.56, .28), (.33, .62)], [(-.1, .0), (.1, .0), (0, .2)],
                  [(-.66, -.16), (-.44, -.2), (-.34, -.34), (-.18, -.22), (-.04, -.36), (.1, -.22), (.26, -.36), (.4, -.2), (.66, -.16), (.4, -.52), (0, -.6), (-.4, -.52)]]
        for sh in shapes:
            me = bpy.data.meshes.new('f'); bm = bmesh.new()
            vs = [bm.verts.new((x, -2.0, z)) for x, z in sh]; f = bm.faces.new(vs)
            r = bmesh.ops.extrude_face_region(bm, geom=[f]); bmesh.ops.translate(bm, vec=(0, 1.6, 0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
            o = bpy.data.objects.new('cut', me); bpy.context.collection.objects.link(o); o.data.materials.append(flesh)
            o.location = loc; o.scale = (size,) * 3; o.rotation_euler.z = tilt; o.hide_render = True
            bo = p.modifiers.new('b', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = o; bo.solver = 'EXACT'; bo.material_mode = 'TRANSFER'
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.75 * size, location=loc)
        inner = bpy.context.object; inner.scale = (1.05, 1.05, 0.65)
        inner.data.materials.append(mat('feu', (1, .55, .1), emit=(1, .26, .01), strength=2.2))
        bpy.ops.object.light_add(type='POINT', location=loc); bpy.context.object.data.energy = 70 * size; bpy.context.object.data.color = (1, .4, .05)
    # tige torsadée, côtelée et irrégulière
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.12 * size, depth=0.5 * size, location=(loc[0], loc[1], loc[2] + 0.82 * size))
    st = bpy.context.object; st.rotation_euler = (0.3, 0.15 + tilt * 0.2, tilt)
    for v in st.data.vertices:
        if v.index % 2: v.co.x *= 0.8; v.co.y *= 0.8
    sub = st.modifiers.new('s', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    tw = st.modifiers.new('tw', 'SIMPLE_DEFORM'); tw.deform_method = 'TWIST'; tw.angle = 0.9
    tp = st.modifiers.new('t', 'SIMPLE_DEFORM'); tp.deform_method = 'TAPER'; tp.factor = -0.35
    bd = st.modifiers.new('bd', 'SIMPLE_DEFORM'); bd.deform_method = 'BEND'; bd.angle = 0.6
    bpy.ops.object.shade_smooth(); st.data.materials.append(stem_mat())
    return p


def ground():  # le sol ne se voit pas, seule l'ombre des citrouilles reste (posées sur le bouton)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.78)); bpy.context.object.is_shadow_catcher = True


def spider():
    black = mat('noir', (0.015, 0.012, 0.012), 0.35)
    eye = mat('yeux', (1, .2, .05), emit=(1, .15, .02), strength=12)
    for loc, r in (((0, 0, 0), 0.55), ((0, -0.62, 0.05), 0.32)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24); o = bpy.context.object
        o.scale.y = 1.15; bpy.ops.object.shade_smooth(); o.data.materials.append(black)
    for x in (-0.11, 0.11):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(x, -0.9, 0.16)); bpy.context.object.data.materials.append(eye)
    for side in (-1, 1):  # 8 pattes à deux segments
        for i, a in enumerate((-0.9, -0.3, 0.3, 0.9)):
            ang = a + (math.pi / 2 if side > 0 else -math.pi / 2)
            knee = Vector((math.sin(ang) * 0.9 * side * side, -0.45 - math.cos(ang) * 0.6 + 0.2, 0.45))
            knee = Vector((side * 0.95, -0.9 + i * 0.55, 0.55)); foot = Vector((side * 1.5, -1.5 + i * 0.95, -0.35))
            start = Vector((side * 0.3, -0.5 + i * 0.12, 0))
            for p0, p1 in ((start, knee), (knee, foot)):
                d = p1 - p0
                bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.045, depth=d.length, location=(p0 + p1) / 2)
                c = bpy.context.object; c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.shade_smooth(); c.data.materials.append(black)


def render(name, res):
    s = bpy.context.scene; s.render.resolution_x, s.render.resolution_y = res; s.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


# Citrouilles posées sur le bouton History Clips : une sculptée qui brille, une simple, une petite
reset(); ground()
pumpkin((-0.55, 0, 0), 1.0, seed=1, tilt=0.15); pumpkin((1.35, 0.5, -0.33), 0.55, face=False, ribs=9, tilt=0.8, seed=2); pumpkin((-2.0, 0.7, -0.45), 0.4, face=False, ribs=8, tilt=2.0, seed=3)
light((-3, -4, 4), 260, (1, .8, .62), 4); light((4, 2, 3), 260, (1, .45, .15), 2); light((0, 4, 1.5), 220, (.55, .35, 1), 2)
camera((0.2, -7.2, 1.25), (-0.1, 0, -0.1), 58)
render('pumpkins.png', (900, 520))
# 3) araignée vue de dessus (suspendue à son fil dans l'appli)
reset(); spider(); light((0, 0, 5), 500, (1, .9, .85)); light((-3, -3, 1), 120, (1, .4, .1)); camera((0, -0.3, 6), (0, -0.3, 0), 45)
render('spider.png', (240, 240))
