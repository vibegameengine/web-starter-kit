#!/usr/bin/env python3
"""Lightweight release-readiness checks for cc-blender-skill."""
import argparse, json, re
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo-root', required=True)
    ap.add_argument('--expected-version', required=True)
    ap.add_argument('--out')
    args=ap.parse_args()
    root=Path(args.repo_root)
    manifest=json.loads((root/'plugin/manifest.json').read_text())
    checks=[]
    def check(name, ok, detail=''):
        checks.append({'name':name,'ok':bool(ok),'detail':detail})
    check('manifest_version', manifest.get('version')==args.expected_version, manifest.get('version'))
    missing=[]
    for s in manifest.get('skills',[]):
        if not (root/'plugin'/s['path']).exists(): missing.append(s['path'])
    check('manifest_paths_exist', not missing, ', '.join(missing[:10]))
    for doc in ['README.md','plugin/README.md','CHANGELOG.md']:
        p=root/doc
        check(f'{doc}_mentions_version', args.expected_version in p.read_text(errors='ignore'), doc)
    report={'schema':'cc_blender_release_readiness.v1','expected_version':args.expected_version,'checks':checks,'passed':all(c['ok'] for c in checks)}
    txt=json.dumps(report,indent=2)
    if args.out: open(args.out,'w').write(txt)
    print(txt)
    raise SystemExit(0 if report['passed'] else 2)
if __name__=='__main__': main()
