#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--frames', nargs='+', required=True)
    ap.add_argument('--out-image', required=True)
    ap.add_argument('--out-report', required=True)
    ap.add_argument('--cols', type=int, default=4)
    args=ap.parse_args()
    imgs=[Image.open(p).convert('RGB') for p in args.frames]
    thumbs=[]; stats=[]
    W=320; H=320
    prev=None
    for p,img in zip(args.frames,imgs):
        th=img.copy(); th.thumbnail((W,H), Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(W,H),(0,0,0)); canvas.paste(th,((W-th.width)//2,(H-th.height)//2))
        d=ImageDraw.Draw(canvas); d.text((8,8),Path(p).name,fill=(255,255,0))
        thumbs.append(canvas)
        if prev is not None:
            diff=ImageChops.difference(prev,img.resize(prev.size))
            mean=sum(ImageStat.Stat(diff).mean)/3
            stats.append({'from':Path(args.frames[len(stats)]).name,'to':Path(p).name,'mean_rgb_diff':mean})
        prev=img
    cols=args.cols; rows=math.ceil(len(thumbs)/cols)
    sheet=Image.new('RGB',(cols*W,rows*H),(0,0,0))
    for i,th in enumerate(thumbs): sheet.paste(th,((i%cols)*W,(i//cols)*H))
    Path(args.out_image).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out_image)
    report={'schema':'animation_contact_sheet_report.v1','frames':args.frames,'frame_diff':stats,'warnings':[]}
    if stats:
        mx=max(s['mean_rgb_diff'] for s in stats)
        if mx>45: report['warnings'].append(f'High frame-to-frame visual jump: {mx:.2f}')
    Path(args.out_report).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'frames':len(args.frames),'warnings':len(report['warnings']),'sheet':args.out_image},indent=2))
if __name__=='__main__': main()
