#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

def load(path):
    return json.load(open(path))

def item(id, stage, view, failure, delta, action, scope, group, blocked, gate):
    return {'id':id,'stage':stage,'view_scope':view,'failure':failure,'measured_delta':delta,'proposed_action':action,'write_scope':scope,'parallel_group':group,'blocked_by':blocked,'acceptance_gate':gate}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--fit-report', required=True)
    ap.add_argument('--texture-lighting-report')
    ap.add_argument('--out', required=True)
    ap.add_argument('--method-md')
    args=ap.parse_args()
    fit=load(args.fit_report)
    tex=load(args.texture_lighting_report) if args.texture_lighting_report else None
    q=[]
    # Source conflict heuristic using template bboxes.
    views=fit.get('views',{})
    conflict=None
    if 'side' in views and 'top' in views:
        sb=views['side'].get('reference_bbox'); tb=views['top'].get('reference_bbox')
        if sb and tb:
            side_ratio=sb[2]/sb[3]
            top_ratio=tb[3]/tb[2]
            if abs(side_ratio-top_ratio) > 0.25:
                conflict={'side_depth_height_ratio':side_ratio,'top_depth_width_ratio':top_ratio,'difference':abs(side_ratio-top_ratio)}
                q.append(item('R0-source-conflict','0-source-conflict',['side','top'],'Orthographic depth ratios conflict',conflict,'Choose canonical policy before final rigid-model fitting: front+side, front+top, or corrected templates.','project decision / reference manifest','sequential-root',[], 'canonical_policy_recorded'))
    # Geometry failures
    for v, rep in views.items():
        if not rep.get('pass_bbox_center_1p5pct', False) or not rep.get('pass_bbox_size_5pct', False):
            q.append(item(f'R2-{v}-bbox','2-geometry-fit',[v],'View bbox center/size does not pass',{'center_drift_px':rep.get('bbox_center_drift_px'),'size_ratio':rep.get('bbox_size_ratio'),'reference_bbox':rep.get('reference_bbox'),'render_bbox':rep.get('render_bbox')},f'Adjust {v}-affecting recipe parameters only after source-conflict gate. Prefer geometry/depth parameters over camera tricks.','Blender recipe/object transforms','geometry', ['R0-source-conflict'] if conflict else [], f'{v} pass_bbox_center_1p5pct && pass_bbox_size_5pct'))
    if tex:
        # Pick iter06 if present else first.
        for key, data in tex.items():
            tu=data.get('texture_usage',{})
            if tu.get('supplemental_maps_connected') is False:
                q.append(item(f'R4-{key}-supplemental-maps','4-texture',[key],'Supplemental maps not region-validated / disconnected',{'supplemental_maps_connected':False},'Classify emissive/bump/lightmap regions and connect only matching UV regions; otherwise bake explicit accent/height maps for the affected components.','texture atlas region files + material node setup','texture', ['R2-front-bbox'], 'no artifacts on structural component surfaces and texture validation overlay passes'))
            for ref, comp in data.get('lighting_vs_originals',{}).items():
                if comp.get('object_iou_bright_mask',0) < 0.75:
                    q.append(item(f'R5-{key}-look-{ref}','5-lighting-look',[key,ref],'Lighting/original look mismatch',{'object_iou_bright_mask':comp.get('object_iou_bright_mask'),'accent_hue_iou':comp.get('accent_hue_iou', comp.get('configured_hue_iou')), 'ref_hsv':comp.get('ref_color_stats',{}).get('mean_hsv'),'product_hsv':comp.get('product_color_stats',{}).get('mean_hsv')},'After geometry/UV pass, calibrate camera crop, accent/glow color, emission strength, saturation/value, and decorative context style against the reference/original.','materials, lights, camera/render settings','look', ['R2-front-bbox','R4-'+key+'-supplemental-maps'], 'reference look mask/color metrics pass'))
    root={'schema':'fit_repair_queue.v1','source_fit_report':args.fit_report,'source_texture_lighting_report':args.texture_lighting_report,'strategy':'sequential until source-conflict/front-geometry gates pass; texture/look may run in parallel after geometry locks','source_conflict':conflict,'repair_queue':q}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(root,indent=2),encoding='utf-8')
    if args.method_md:
        lines=['# Alignment Repair Method\n\n','Generated from validation reports.\n\n']
        lines.append(f"Strategy: {root['strategy']}\n\n")
        if conflict:
            lines.append('## Source conflict gate\n\n')
            lines.append(f"Side depth/height ratio `{conflict['side_depth_height_ratio']:.3f}` conflicts with top depth/width ratio `{conflict['top_depth_width_ratio']:.3f}`. Choose canonical policy before claiming final rigid fit.\n\n")
        lines.append('## Repair queue\n\n')
        for r in q:
            lines.append(f"### {r['id']}\n- Stage: {r['stage']}\n- Scope: {r['view_scope']}\n- Failure: {r['failure']}\n- Action: {r['proposed_action']}\n- Blocked by: {r['blocked_by']}\n- Gate: `{r['acceptance_gate']}`\n\n")
        Path(args.method_md).write_text(''.join(lines),encoding='utf-8')
    print(json.dumps({'items':len(q),'source_conflict':conflict is not None},indent=2))
if __name__=='__main__': main()
