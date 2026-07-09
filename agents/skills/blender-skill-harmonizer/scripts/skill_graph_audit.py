#!/usr/bin/env python3
from __future__ import annotations
import json, re, argparse
from pathlib import Path

def frontmatter(path: Path):
    txt=path.read_text(encoding='utf-8')
    if not txt.startswith('---'):
        return {}, txt
    parts=txt.split('---',2)
    meta={}
    for line in parts[1].splitlines():
        if ':' in line:
            k,v=line.split(':',1)
            meta[k.strip()]=v.strip().strip('"')
    return meta, parts[2]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--plugin-root', default='.')
    ap.add_argument('--out', required=True)
    args=ap.parse_args()
    root=Path(args.plugin_root)
    manifest=json.load(open(root/'manifest.json'))
    report={'schema':'blender_skill_graph_audit.v1','version':manifest.get('version'),'skills':[],'roles':{},'warnings':[],'harmonization_needed':False}
    names=set()
    for e in manifest.get('skills',[]):
        p=root/e['path']
        exists=p.exists()
        meta, body=frontmatter(p) if exists else ({},'')
        item={'name':e['name'],'role':e.get('role'),'path':e['path'],'exists':exists,'frontmatter_name':meta.get('name'),'description_mentions':[]}
        for other in manifest.get('skills',[]):
            if other['name'] != e['name'] and other['name'] in body:
                item['description_mentions'].append(other['name'])
        report['skills'].append(item)
        report['roles'].setdefault(e.get('role','unknown'),[]).append(e['name'])
        names.add(e['name'])
        if not exists:
            report['warnings'].append(f"Missing path for {e['name']}: {e['path']}")
        if exists and meta.get('name') and meta.get('name') != e['name']:
            report['warnings'].append(f"Manifest/frontmatter name mismatch: {e['name']} vs {meta.get('name')}")
    # Known overlap checks.
    overlap_sets=[
        ['reference-to-3d','wireframe-to-3d','mascot-logo-reconstruction','multiview-fit-loop','fit-repair-optimizer'],
        ['blender-uv-texturing','atlas-uv-fitting'],
        ['text-to-blender','blender-pro-workflow','mascot-logo-reconstruction','blender-skill-harmonizer'],
    ]
    for group in overlap_sets:
        present=[g for g in group if g in names]
        if len(present)>1:
            report['warnings'].append('Overlap group requires precedence/handoff rules: '+', '.join(present))
            report['harmonization_needed']=True
    if 'blender-skill-harmonizer' in names:
        report['harmonization_layer_present']=True
    else:
        report['harmonization_layer_present']=False
        report['harmonization_needed']=True
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'skills':len(report['skills']),'warnings':len(report['warnings']),'harmonization_needed':report['harmonization_needed'],'harmonization_layer_present':report['harmonization_layer_present']},indent=2))
if __name__=='__main__': main()
