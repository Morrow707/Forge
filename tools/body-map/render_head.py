"""Render Z-Anatomy's head -- the muscles of the head, the skull under them, the eyes and the
outer ears -- front and back, orthographic, plus a CLASS pass (muscle / tendon / bone / eye /
ear as flat colours) that the finish uses to recolour each material into the figure's palette.

Usage: python render_head.py -- <blend> <outdir> <resolution> <samples>
Scripts embedded in the .blend stay disabled.
"""
import bpy, sys, math, mathutils, json, os

blend, outdir, res, samples = sys.argv[-4], sys.argv[-3], int(sys.argv[-2]), int(sys.argv[-1])
os.makedirs(outdir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend, use_scripts=False)
sc = bpy.context.scene


def unexclude(lc):
    lc.exclude = False
    lc.hide_viewport = False
    for c in lc.children:
        unexclude(c)


unexclude(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    c.hide_render = False

LANDMARK = ('j', 'i', 'g')
SKIP_MUSCLE = ('rectus', 'oblique', 'glossus', 'pterygoid', 'tendinous ring', 'Trochlea', 'tarsus', 'Levator palpebrae')
EYE = ('Sclera', 'Iris', 'Anterior segment of eyeball', 'Posterior segment of eyeball')
keep = set()
for o in bpy.data.collections['Muscles of head'].all_objects:
    if o.type == 'MESH' and o.name.split('.')[-1] not in LANDMARK and not any(s in o.name for s in SKIP_MUSCLE):
        keep.add(o.name)
for cname in ['Cranium', 'Mandible', 'Auricular region']:
    for o in bpy.data.collections[cname].all_objects:
        if o.type == 'MESH' and o.name.split('.')[-1] not in LANDMARK:
            keep.add(o.name)
for o in bpy.data.objects:
    if o.type == 'MESH' and (o.name.split('.')[0] in EYE or ('tooth' in o.name.lower() or 'incisor' in o.name.lower()
                                                           or 'canine' in o.name.lower() or 'premolar' in o.name.lower())):
        if o.name.split('.')[-1] not in LANDMARK:
            keep.add(o.name)

for o in bpy.data.objects:
    if o.type in ('MESH', 'CURVE', 'FONT', 'EMPTY'):
        o.hide_render = o.name not in keep
print('kept', len(keep))

dg = bpy.context.evaluated_depsgraph_get()
mn = mathutils.Vector((1e9, 1e9, 1e9))
mx = -mn
for n in keep:
    o = bpy.data.objects[n].evaluated_get(dg)
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector(map(min, mn, w))
        mx = mathutils.Vector(map(max, mx, w))
ctr = (mn + mx) / 2

# THE NECK MUSCLES THAT ATTACH TO THE SKULL. Added AFTER the bounds are taken, so the framing is
# still the head's. Without them the back view shows a bare band of occipital bone where the
# trapezius, splenius and the suboccipitals cover it on a body; the body tile's own labelled neck
# still draws over all of this wherever it reaches (head_render.place), so these only fill what
# would otherwise be bare skull.
NECK = ('Descending part of trapezius muscle', 'Splenius capitis muscle', 'Sternocleidomastoid muscle',
        'Longissimus capitis muscle', 'Obliquus superior capitis muscle', 'Obliquus inferior capitis muscle',
        'Rectus posterior major capitis muscle', 'Rectus posterior minor capitis muscle', 'Spinalis capitis muscle',
        'Semispinalis colli muscle')
# Z-Anatomy carries no semispinalis capitis, which is what covers the middle of the occiput on a
# body, so a band of occipital bone between the splenii stays visible from behind. That is the
# source's gap, not a choice; nothing is painted over it.
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.split('.')[0] in NECK and o.name.split('.')[-1] in ('l', 'r'):
        keep.add(o.name)
        o.hide_render = False
print('kept with neck', len(keep))
size = max(mx.x - mn.x, mx.z - mn.z) * 1.06
print('bounds', tuple(round(v, 4) for v in mn), tuple(round(v, 4) for v in mx))

cam_data = bpy.data.cameras.new('HeadCam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = size
cam_data.clip_end = 10
cam = bpy.data.objects.new('HeadCam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
r = sc.render
r.resolution_x = res
r.resolution_y = res
r.film_transparent = True
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
r.engine = 'CYCLES'
r.use_freestyle = False
r.use_compositing = False
r.use_sequencer = False
sc.cycles.device = 'CPU'


def aim(view):
    d = -1 if view == 'front' else 1
    cam.location = (ctr.x, ctr.y + d * 3, ctr.z)
    cam.rotation_euler = (math.radians(90), 0, 0 if view == 'front' else math.radians(180))


def classify(mat_name, obj_name):
    m = mat_name.lower()
    if obj_name.split('.')[0] in EYE or m in ('eye', 'iris', 'cornea'):
        return 'eye'
    if 'skin' in m:
        return 'ear'
    if any(k in m for k in ('bone', 'suture', 'cartilage', 'teeth', 'dentine', 'enamel')):
        return 'bone'
    if any(k in m for k in ('tendon', 'fascia', 'aponeuro', 'ligament')):
        return 'tendon'
    return 'muscle'


CLASS_RGB = {'muscle': (1, 0, 0), 'tendon': (0, 1, 0), 'bone': (0, 0, 1), 'eye': (1, 1, 0), 'ear': (1, 0, 1)}
seen = {}
for view in ('front', 'back'):
    aim(view)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    r.filepath = os.path.join(outdir, f'{view}.png')
    bpy.ops.render.render(write_still=True)
    print('wrote', r.filepath)

# class pass: every kept object's material slots swapped for flat emission by class
cmats = {}
for k, rgb in CLASS_RGB.items():
    m = bpy.data.materials.new('class_' + k)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*rgb, 1)
    e.inputs['Strength'].default_value = 1.0
    o_ = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o_.inputs[0])
    cmats[k] = m
for n in keep:
    o = bpy.data.objects[n]
    if o.type != 'MESH':
        continue
    for slot in o.material_slots:
        if slot.material is None:
            continue
        c = classify(slot.material.name, o.name)
        seen.setdefault(slot.material.name, c)
        slot.link = 'OBJECT'
        slot.material = cmats[c]
    if not o.material_slots:
        o.data.materials.append(cmats['muscle'])
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.world = None
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.cycles.pixel_filter_type = 'BOX'
sc.cycles.filter_width = 0.01
for view in ('front', 'back'):
    aim(view)
    r.filepath = os.path.join(outdir, f'{view}-class.png')
    bpy.ops.render.render(write_still=True)
    print('wrote', r.filepath)
# the HEAD's own box in pixels (the neck muscles above run past it and must not move the fit)
px = res / size
head_box = {'top': (ctr.z + size / 2 - mx.z) * px, 'bottom': (ctr.z + size / 2 - mn.z) * px,
            'width': (mx.x - mn.x) * px, 'cx': res / 2}
json.dump({'headBox': head_box, 'materials': seen, 'center': list(ctr), 'orthoScale': size, 'resolution': res,
           'kept': sorted(keep)}, open(os.path.join(outdir, 'render.json'), 'w'), indent=1)
print('done')
