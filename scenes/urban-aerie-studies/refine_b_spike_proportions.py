"""Local, topology-preserving proportion adjustment of the saved B2 island."""
from pathlib import Path
import bpy, bmesh, json, runpy

ROOT = Path(__file__).resolve().parent
OPT = runpy.run_path(str(ROOT / 'island_profile_options.py'))
NOISE = runpy.run_path(str(ROOT / 'refine_b_fractures.py'))['noise']
SCENE = 'Island_B_Spike_Proportions'
OUTPUT = ROOT / 'island_b_spike_proportions.blend'


def clamp(value):
    return max(0.0, min(1.0, value))


def depths(mesh):
    return dict(main=min(v.co.z for v in mesh.vertices if v.co.x < 4),
                overhang=min(v.co.z for v in mesh.vertices if v.co.x > 7))


def build():
    if OUTPUT.exists() or bpy.data.scenes.get(SCENE):
        raise RuntimeError('Proportion revision already exists; refusing overwrite.')
    source = bpy.data.scenes['Island_B_Fractured_Overhang']
    original = next(o for o in source.objects if o.type == 'MESH' and 'RimIndices' in o)
    source_hash = OPT['fingerprint'](original.data)
    cap_hash = OPT['cap_fingerprint'](original.data)
    scene = source.copy(); scene.name = SCENE
    scene.compositing_node_group = source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type == 'R_LAYERS': node.scene = scene
    body = original.copy(); body.data = original.data.copy()
    body.name = 'Island_B3_Connected_Terrain'
    old = original.users_collection[0]
    scene.collection.children.unlink(old)
    OPT['clone_collection'](old, scene.collection, original, body, 'B3_')
    mesh = body.data
    before = depths(mesh)
    fixed = {i for p in mesh.polygons if p.material_index not in {1, 2, 3} for i in p.vertices}
    changed = 0
    for v in mesh.vertices:
        x, y, z = v.co
        if v.index in fixed or z >= -3.0: continue
        # Transition occurs across the existing notch, keeping both masses attached.
        small = clamp((x - 2.0) / 6.0)
        factor = 1.35 * (1-small) + .70 * small
        new_z = -3.0 + (z + 3.0) * factor
        # A broad shallow angular end replaces the overhang's needle tip.
        # Piecewise planar noise keeps this clipped end irregular and faceted.
        floor = (-7.35 + .12*abs(x-11.3) + .10*abs(y-.8)
                 + .15*NOISE(x, y, 1.7, 94))
        if new_z < floor:
            new_z += (floor-new_z) * small
        v.co.z = new_z
        changed += 1
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for face in bm.faces: face.smooth = False
    bm.to_mesh(mesh); bm.free(); mesh.update()
    attribute = mesh.attributes['RockFacetValue']
    values = []
    for p in mesh.polygons:
        n = p.normal
        variation = (((p.index*668265263+374761393)&65535)/32767.5-1)*.065
        values.append(1+.24*(.83*n.x-.48*n.y+.27*n.z)+variation)
    attribute.data.foreach_set('value', values)
    assert OPT['cap_fingerprint'](mesh) == cap_hash, 'Grass/soil cap changed'
    assert OPT['fingerprint'](original.data) == source_hash, 'Source changed'
    report = OPT['API']['audit_island'](body)
    assert all(p.area > 1e-9 for p in mesh.polygons), 'Degenerate face'
    report.update(scene=scene.name, body=body.name, blend=str(OUTPUT),
                  before=before, after=depths(mesh), changed_vertices=changed,
                  cap_unchanged=True, source_unchanged=True,
                  all_faces_flat=all(not p.use_smooth for p in mesh.polygons),
                  description='Longer main mass; shorter overhang with broad angular clipped tip.')
    scene.camera = bpy.data.objects['Island_Options_Front']
    scene['IslandOption'] = report['description']
    windows = list(bpy.context.window_manager.windows)
    if windows: windows[0].scene = scene
    (ROOT/'island_b_spike_proportions_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)
    return report


def render():
    scene = bpy.data.scenes[SCENE]
    folder = ROOT/'renders'/'island-b-proportions'; folder.mkdir(exist_ok=True)
    output = []
    for name, camera in [('front', 'Island_Options_Front'),
                         ('three_quarter', 'Island_Options_ThreeQuarter'),
                         ('side', 'Island_Options_Side')]:
        scene.camera = bpy.data.objects[camera]
        scene.render.filepath = str(folder/f'B3_{name}.png')
        bpy.ops.render.render(write_still=True, scene=scene.name)
        output.append(scene.render.filepath)
    return output


if __name__ == '__main__': result = build()
