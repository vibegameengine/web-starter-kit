#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path

def aspect(b):
    return float(b[2]) / max(float(b[3]), 1e-9)

def area(b):
    return float(b[2]) * float(b[3])

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--parts', required=True, help='source part_inventory.json')
    ap.add_argument('--regions', required=True, help='atlas_regions.json')
    ap.add_argument('--out', required=True)
    ap.add_argument('--max-candidates', type=int, default=5)
    args=ap.parse_args()
    parts=json.load(open(args.parts, encoding='utf-8')).get('parts', [])
    regs=json.load(open(args.regions, encoding='utf-8')).get('regions', [])
    # Ignore huge likely-composite regions by default but keep in candidates with penalty.
    reg_areas=[r.get('area', area(r['bbox_px'])) for r in regs] or [1]
    max_area=max(reg_areas)
    mappings=[]
    for p in parts:
        pb=p['bbox_px']; pa=aspect(pb); parea=area(pb)
        cand=[]
        for r in regs:
            rb=r['bbox_px']; ra=aspect(rb); rarea=area(rb)
            aspect_cost=abs(math.log(max(pa,1e-6)/max(ra,1e-6)))
            scale_cost=abs(math.log(max(parea,1)/max(rarea,1))) * 0.15
            composite_penalty=0.75 if rarea > 0.35*max_area else 0.0
            score=aspect_cost+scale_cost+composite_penalty
            cand.append({'region_index':r.get('index'), 'region_bbox_px':rb, 'region_uv_rect':r.get('uv_rect'), 'score':score, 'role_hint':r.get('role_hint','unclassified')})
        cand.sort(key=lambda c:c['score'])
        mappings.append({'part':p['name'], 'part_class':p.get('class','structural'), 'part_bbox_px':pb, 'candidates':cand[:args.max_candidates], 'selected_region_index':None, 'status':'needs_semantic_review'})
    out={'schema':'atlas_part_map_draft.v1','parts_source':args.parts,'regions_source':args.regions,'mappings':mappings,'notes':['Draft only: rename/lock selected_region_index before UV assignment.', 'Reject composite rosette/aura regions for individual structural meshes.']}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(json.dumps({'mappings':len(mappings),'out':args.out}, indent=2))
if __name__=='__main__': main()
