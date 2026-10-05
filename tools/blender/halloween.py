# Décor Halloween du launcher : citrouilles et araignée modélisées puis rendues en PNG transparents.
# Lancer : python halloween.py (module bpy) → launcher/src/ui/halloween/*.png
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'launcher', 'src', 'ui', 'halloween')
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = 48; s.cycles.use_denoising = True
    s.render.film_transparent = True; s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'RGBA'
    s.view_settings.view_transform = 'Filmic'; s.view_settings.look = 'Medium High Contrast'
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


def pumpkin(loc=(0, 0, 0), size=1.0, face=True, ribs=10, tilt=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1, location=loc)
    p = bpy.context.object
    for v in p.data.vertices:  # côtes + forme écrasée, creux en haut et en bas
        x, y, z = v.co; a = math.atan2(y, x); r = math.sqrt(x * x + y * y)
        rib = 1 - 0.12 * (0.5 + 0.5 * math.cos(a * ribs)) ** 0.6
        v.co.x, v.co.y = x * rib * 1.18, y * rib * 1.18
        v.co.z = z * 0.82 - 0.12 * (1 - r) * (1 if z > 0 else -0.6)
    p.scale = (size,) * 3; p.rotation_euler.z = tilt
    bpy.ops.object.shade_smooth()
    p.data.materials.append(mat('peau', (0.75, 0.16, 0.01), 0.5, sss=0.1))
    if face:  # visage creusé pour de vrai (booléen) + intérieur qui brille
        sol = p.modifiers.new('ep', 'SOLIDIFY'); sol.thickness = 0.09
        shapes = [[(-.58, .30), (-.16, .30), (-.36, .66)], [(.16, .30), (.58, .30), (.36, .66)], [(-.11, .02), (.11, .02), (0, .24)],
                  [(-.66, -.18), (-.42, -.2), (-.32, -.36), (-.16, -.22), (0, -.38), (.16, -.22), (.32, -.36), (.42, -.2), (.66, -.18), (.38, -.56), (0, -.64), (-.38, -.56)]]
        for sh in shapes:
            me = bpy.data.meshes.new('f'); bm = bmesh.new()
            vs = [bm.verts.new((x, -2.0, z)) for x, z in sh]; f = bm.faces.new(vs)
            r = bmesh.ops.extrude_face_region(bm, geom=[f]); bmesh.ops.translate(bm, vec=(0, 1.6, 0), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
            o = bpy.data.objects.new('cut', me); bpy.context.collection.objects.link(o)
            o.location = loc; o.scale = (size,) * 3; o.hide_render = True
            bo = p.modifiers.new('b', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = o; bo.solver = 'EXACT'
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8 * size, location=loc)
        inner = bpy.context.object; inner.scale = (1.05, 1.05, 0.7)
        inner.data.materials.append(mat('feu', (1, .55, .1), emit=(1, .42, .04), strength=9))
        bpy.ops.object.light_add(type='POINT', location=loc); bpy.context.object.data.energy = 80 * size; bpy.context.object.data.color = (1, .45, .08)
    # tige courbée
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.11 * size, depth=0.45 * size, location=(loc[0], loc[1], loc[2] + 0.85 * size))
    st = bpy.context.object; st.rotation_euler = (0.25, 0.2, 0); bpy.ops.object.shade_smooth()
    tp = st.modifiers.new('t', 'SIMPLE_DEFORM'); tp.deform_method = 'TAPER'; tp.factor = -0.45
    st.data.materials.append(mat('tige', (0.18, 0.13, 0.05), 0.8))
    return p


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


# 1) citrouille sculptée qui brille
reset(); pumpkin(); light((-3, -4, 4), 400); light((4, -2, 2), 150, (1, .5, .2)); camera((1.6, -5.2, 1.6), (0, 0, 0.1), 60)
render('pumpkin-lantern.png', (420, 420))
# 2) deux citrouilles (une sculptée, une simple) pour les coins
reset(); pumpkin((-0.7, 0, 0), 1.0); pumpkin((1.25, 0.6, -0.35), 0.62, face=False, ribs=8, tilt=0.6)
light((-3, -4, 4), 450); light((4, -3, 2), 200, (1, .55, .25)); camera((0.4, -6.5, 1.5), (0.2, 0, -0.05), 55)
render('pumpkins.png', (560, 400))
# 3) araignée vue de dessus (suspendue à son fil dans l'appli)
reset(); spider(); light((0, 0, 5), 500, (1, .9, .85)); light((-3, -3, 1), 120, (1, .4, .1)); camera((0, -0.3, 6), (0, -0.3, 0), 45)
render('spider.png', (240, 240))
