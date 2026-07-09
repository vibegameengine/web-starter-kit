#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path

AXES = {
    'front': {'w':'X', 'h':'Z'},
    'back': {'w':'X', 'h':'Z'},
    'side': {'w':'Y', 'h':'Z'},
    'top': {'w':'X', 'h':'Y'},
}

def load_views(data):
    if 'views' in data:
        return data['views']
    # Accept multiview_fit_report-style records.
    out = {}
    for item in data.get('view_reports', data.get('reports', [])):
        v = item.get('view')
        rb = item.get('reference_bbox') or item.get('ref_bbox')
        if v and rb:
            out[v] = {'bbox': rb}
    for v in ['front','side','top','back']:
        if v in data and isinstance(data[v], dict):
            out[v] = data[v]
    return out

def dims_from_views(views):
    dims = {}
    for view, item in views.items():
        bbox = item.get('bbox') or item.get('reference_bbox') or item.get('body_bbox')
        if not bbox or view not in AXES:
            continue
        w, h = float(bbox[2]), float(bbox[3])
        for key, axis in AXES[view].items():
            dims.setdefault(axis, []).append({'view': view, 'value': w if key == 'w' else h})
    return dims

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input', required=True, help='JSON with views.{front,side,top,back}.bbox=[x,y,w,h]')
    ap.add_argument('--out', required=True)
    ap.add_argument('--tolerance', type=float, default=0.12, help='relative shared-axis mismatch tolerance')
    args=ap.parse_args()
    data=json.load(open(args.input, encoding='utf-8'))
    views=load_views(data)
    dims=dims_from_views(views)
    comparisons=[]; conflicts=[]
    for axis, rows in sorted(dims.items()):
        for i in range(len(rows)):
            for j in range(i+1, len(rows)):
                a,b=rows[i],rows[j]
                denom=max(a['value'], b['value'], 1e-9)
                rel=abs(a['value']-b['value'])/denom
                item={'axis':axis,'a':a,'b':b,'relative_delta':rel,'pass':rel<=args.tolerance}
                comparisons.append(item)
                if not item['pass']:
                    conflicts.append(item)
    # Determine useful ratios when available.
    ratios={}
    def val(axis, view):
        for r in dims.get(axis,[]):
            if r['view']==view: return r['value']
    if val('Y','side') and val('Z','side'):
        ratios['side_depth_height']=val('Y','side')/val('Z','side')
    if val('Y','top') and val('X','top'):
        ratios['top_depth_width']=val('Y','top')/val('X','top')
    policy='pass_all_views'
    if conflicts:
        # Favor front+side when top Y conflicts with side Y; this matches most mascot orthographic production flows.
        y_conflict=any(c['axis']=='Y' for c in conflicts)
        z_conflict=any(c['axis']=='Z' for c in conflicts)
        if y_conflict and not z_conflict:
            policy='front_side_canonical_or_correct_top_template'
        elif z_conflict:
            policy='corrected_templates_required'
        else:
            policy='choose_canonical_view_pair'
    report={'schema':'multiview_constraint_report.v1','tolerance':args.tolerance,'views_present':sorted(views.keys()),'dimensions_by_axis':dims,'ratios':ratios,'comparisons':comparisons,'conflicts':conflicts,'all_pass':not conflicts,'suggested_policy':policy}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'all_pass': report['all_pass'], 'conflicts': len(conflicts), 'suggested_policy': policy}, indent=2))
if __name__=='__main__': main()
