#!/usr/bin/env python3
"""Scan skill/docs files for task-specific terms before publishing a generic skill update."""
import argparse, json, os, re
from pathlib import Path
DEFAULT_EXTS={'.md','.py','.json','.yaml','.yml','.txt'}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--terms', nargs='*', default=[])
    ap.add_argument('--out')
    ap.add_argument('--allow', nargs='*', default=[])
    args=ap.parse_args()
    root=Path(args.root)
    terms=[t for t in args.terms if t]
    allow=set(args.allow)
    findings=[]
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in DEFAULT_EXTS: continue
        rel=str(p.relative_to(root))
        if rel in allow: continue
        try: txt=p.read_text(errors='ignore')
        except Exception: continue
        for term in terms:
            if re.search(re.escape(term), txt, re.I):
                findings.append({'file':rel,'term':term})
    report={'schema':'skill_sanitization_scan.v1','root':str(root),'terms':terms,'findings':findings,'passed':not findings}
    out=json.dumps(report,indent=2)
    if args.out: open(args.out,'w').write(out)
    print(out)
    raise SystemExit(0 if report['passed'] else 2)
if __name__=='__main__': main()
