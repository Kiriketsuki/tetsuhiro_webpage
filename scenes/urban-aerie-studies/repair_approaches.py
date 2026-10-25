"""Preview review: overlap all landings and path joins, expose the cottage dormer."""
from pathlib import Path
import json
import runpy
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent


def repair():
    api = runpy.run_path(str(ROOT / 'build_aeries.py'))
    common = bpy.data.collections['UA_Shared_Corrected_Island']
    scene = bpy.data.scenes['UA_A_Townhouse']
    if scene.get('Approaches_Repaired'):
        return {'status': 'already repaired'}
    mats = {key: bpy.data.materials['LP_SS_A_' + key] for key in ('grass', 'rock', 'rock_light', 'rock_dark', 'stone', 'metal')}
    mats['path'] = bpy.data.materials['SS_UA_Path_Sandy_Stone']
    old = bpy.data.objects['SS_UA_Connected_Island']
    new = api['island'](common, mats)
    old.data = new.data; bpy.data.objects.remove(new, do_unlink=True)
    for i, path in enumerate(api['PATHS']):
        old = bpy.data.objects['SS_UA_Connected_Path_' + str(i)]
        new = api['path_mesh']('UA_Replacement_Path', path, common, mats['path'])
        old.data = new.data; bpy.data.objects.remove(new, do_unlink=True)
    step = api['Batch']('UA_Lookout_Access_Step', common, [mats['stone']])
    step.box((8.55, -5.95, .50), (.55, 1.0, .18)); step.finish()
    repaired_corners = 0
    for label, yf in [('A_Townhouse', 1.6), ('B_Atelier', 1.6), ('C_Cottage', 1.5)]:
        ob = bpy.data.objects['SS_UA_' + label + '_Walls']
        for v in ob.data.vertices:
            if abs(abs(v.co.x + 3) - .725) > .001:
                continue
            for j in range(3):
                old_y, z = yf - .28 - j * .34, .8 - j * .15
                if abs(abs(v.co.y - old_y) - .19) < .001 and abs(abs(v.co.z - z) - .11) < .001:
                    v.co.y = yf - .22 - j * .34 + (v.co.y - old_y) * .46 / .38
                    repaired_corners += 1
                    break
        ob.data.update()
    # Make the small dormer project past the pitched surface.
    wall = bpy.data.objects['SS_UA_C_Cottage_Walls']
    for v in wall.data.vertices:
        if abs(v.co.x - (-2.05 - .6)) < .001 or abs(v.co.x - (-2.05 + .6)) < .001:
            if abs(v.co.y - (3.7 - .725)) < .001 or abs(v.co.y - (3.7 + .725)) < .001:
                if 7.5 < v.co.z < 9:
                    v.co.z += 1.1
    glazing = bpy.data.objects['SS_UA_C_Cottage_Glazing']
    for v in glazing.data.vertices:
        if -1.44 < v.co.x < -1.42 and 3.19 < v.co.y < 4.21 and 7.7 < v.co.z < 8.8:
            v.co.z += 1.1
    roof = bpy.data.objects['SS_UA_C_Cottage_Roof']
    for v in roof.data.vertices:
        if -2.8 < v.co.x < -.9 and 2.8 < v.co.y < 4.6 and 8.7 < v.co.z < 9.2:
            v.co.z += 1.1
    # Stair rails have real vertical supports, not floating diagonal lines.
    root = bpy.data.collections['UA_B_Atelier_House']
    rail = api['Batch']('UA_Atelier_Stair_Rail_Posts', root, [mats['metal']])
    for floor in range(2):
        x = -.20 if floor == 0 else -1.15
        y0, y1 = (1.35, 5.9) if floor == 0 else (5.9, 1.85)
        for side in (-1, 1):
            for t in (0, .5, 1):
                y = y0 + (y1 - y0) * t
                z = 1 + floor * 3.15 + t * 3.15
                rail.box((x + side * .42, y, z + .49), (.055, .055, 1.03))
    rail.finish()
    camera = bpy.data.objects['SS_UA_House']; camera.location.z = 20
    camera.rotation_euler = (Vector((-2.6, 4, 6.2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    report = json.loads((ROOT / 'build_report.json').read_text(encoding='utf-8'))
    report['island_topology'] = api['audit_island'](bpy.data.objects['SS_UA_Connected_Island'])
    report['approach_review'] = {'entry_step_corners_adjusted': repaired_corners,
                                 'path_joins': 'Entry/bridge/lookout approaches overlap their lowest steps.',
                                 'lookout': 'One additional grounded step meets the raised deck.'}
    for label in ('A_Townhouse', 'B_Atelier', 'C_Cottage'):
        bpy.data.scenes['UA_' + label]['Approaches_Repaired'] = True
    bpy.context.view_layer.update(); bpy.ops.wm.save_mainfile()
    (ROOT / 'build_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report['approach_review']


if __name__ == '__main__':
    result = repair()
