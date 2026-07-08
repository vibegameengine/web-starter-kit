#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--radii', nargs='+', type=float, default=[0.82, 0.93])
    ap.add_argument('--markers', nargs='*', type=float, default=[0,90,180,270])
    ap.add_argument('--arc-break-deg', type=float, default=18)
    args=ap.parse_args()
    arcs=[]
    for i,r in enumerate(args.radii):
        arcs.append({'name':f'orbit_{i}_arc_a','radius_norm':r,'start_deg':args.arc_break_deg,'end_deg':180-args.arc_break_deg,'layer':'mid_orbit'})
        arcs.append({'name':f'orbit_{i}_arc_b','radius_norm':r,'start_deg':180+args.arc_break_deg,'end_deg':360-args.arc_break_deg,'layer':'mid_orbit'})
    markers=[{'angle_deg':a,'radius_norm':args.radii[-1],'role':'marker'} for a in args.markers]
    data={'schema':'orbit_layout_manifest.v1','arcs':arcs,'markers':markers,'rules':['subject stays dominant','animate opacity/dash phase before large rotations','keep HUD separate from base avatar']}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(data,indent=2),encoding='utf-8')
    print(args.out)
if __name__=='__main__': main()
