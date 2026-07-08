#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,math
from pathlib import Path

def load(p): return json.load(open(p))
def pts(data):
    out={}
    for item in data.get('landmarks',[]):
        key=(item.get('view','front'),item['name'])
        out[key]=item
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',required=True); ap.add_argument('--product',required=True); ap.add_argument('--out',required=True); ap.add_argument('--tolerance-px',type=float,default=12)
    args=ap.parse_args(); s=pts(load(args.source)); p=pts(load(args.product))
    rows=[]
    for key,sv in sorted(s.items()):
        pv=p.get(key)
        if not pv:
            rows.append({'view':key[0],'name':key[1],'status':'missing_product'})
            continue
        dx=pv['x']-sv['x']; dy=pv['y']-sv['y']; d=math.hypot(dx,dy)
        rows.append({'view':key[0],'name':key[1],'source':[sv['x'],sv['y']],'product':[pv['x'],pv['y']],'delta_px':[dx,dy],'distance_px':d,'pass':d<=args.tolerance_px,'proposed_action':f"move recipe/control point '{key[1]}' by {-dx:.2f},{-dy:.2f} px in {key[0]} view"})
    rep={'schema':'landmark_fit_report.v1','source':args.source,'product':args.product,'tolerance_px':args.tolerance_px,'all_pass':all(r.get('pass',False) for r in rows),'landmarks':rows}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True); Path(args.out).write_text(json.dumps(rep,indent=2),encoding='utf-8')
    print(json.dumps({'landmarks':len(rows),'all_pass':rep['all_pass']},indent=2))
if __name__=='__main__': main()
