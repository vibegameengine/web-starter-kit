#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

def bbox_nonblack(im, threshold=12):
    g=im.convert('L').point(lambda p: 255 if p>threshold else 0)
    return g.getbbox()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--images', nargs='+', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--names', nargs='*')
    args=ap.parse_args()
    rows=[]
    ref_size=None
    for i,p in enumerate(args.images):
        im=Image.open(p).convert('RGB')
        if ref_size is None: ref_size=im.size
        name=args.names[i] if args.names and i < len(args.names) else Path(p).stem
        bbox=bbox_nonblack(im)
        rows.append({'name':name,'path':p,'size':im.size,'nonblack_bbox':bbox})
    warnings=[]
    if len({tuple(r['size']) for r in rows})>1:
        warnings.append('States have different canvas sizes; register/crop before animation.')
    for a,b in zip(rows, rows[1:]+rows[:1]):
        if a['nonblack_bbox'] and b['nonblack_bbox']:
            # crude bbox delta check
            da=[abs(a['nonblack_bbox'][k]-b['nonblack_bbox'][k]) for k in range(4)]
            if max(da)>20:
                warnings.append(f"Large bbox drift {a['name']} -> {b['name']}: {da}; avoid direct full-image crossfade.")
    plan={'schema':'texture_transition_plan.v1','states':rows,'recommended_layers':['avatar_surface','face_features','glow_accents','aura_context','hud_orbits'],'transition_rules':{'avatar_surface':'hold or masked shimmer; no full-canvas crossfade unless registered','glow_accents':'emission pulse/traveling highlight','aura_context':'separate animated object/plane','hud_orbits':'independent orbital animation'},'warnings':warnings}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(plan, indent=2), encoding='utf-8')
    print(json.dumps({'states':len(rows),'warnings':len(warnings),'out':args.out},indent=2))
if __name__=='__main__': main()
