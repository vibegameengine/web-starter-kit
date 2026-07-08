#!/usr/bin/env python3
"""Create a generic quality-refinement autoloop plan from user feedback."""
import argparse, json, re
KEYWORDS = {
    'geometry': ['shape','silhouette','wireframe','landmark','proportion','does not fit','model behind'],
    'multiview_depth': ['side','back','top','depth','thickness','z-axis','edge-on'],
    'uv_texture': ['texture','uv','atlas','decal','stretched','not fill','not aligned'],
    'surface_coverage': ['side texture','back texture','whole model','surface','sidewall','closed surface'],
    'look_lighting': ['lighting','glow','material','color','too dark','too bright','look'],
    'animation': ['animation','motion','morph','spin','loop','speed','frame'],
    'export_truth': ['glb','export','runtime','mp4','sequence','viewer'],
    'orchestration': ['same issue','repeated','loop','skill','harmonization','handoff'],
}
SKILL_HINTS = {
    'geometry': ['texture-driven-mesh-fitting','landmark-fit-repair','contour-to-mesh'],
    'multiview_depth': ['orthographic-registration','multiview-constraint-solver','multiview-fit-loop'],
    'uv_texture': ['blender-uv-texturing','atlas-uv-fitting'],
    'surface_coverage': ['closed-surface-uv-coverage','blender-uv-texturing'],
    'look_lighting': ['reference-look-calibration','blender-materials','blender-lighting'],
    'animation': ['texture-state-animation','orbital-hud-motion','animation-quality-gate'],
    'export_truth': ['blender-export','animation-quality-gate'],
    'orchestration': ['blender-skill-harmonizer','quality-refinement-autoloop'],
}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--feedback', required=True)
    ap.add_argument('--artifact', default='')
    ap.add_argument('--out')
    args=ap.parse_args()
    text=(args.feedback+' '+args.artifact).lower()
    scores={k:sum(1 for kw in kws if kw in text) for k,kws in KEYWORDS.items()}
    ranked=[k for k,v in sorted(scores.items(), key=lambda kv: kv[1], reverse=True) if v]
    if not ranked: ranked=['orchestration']
    plan={
        'schema':'quality_refinement_autoloop_plan.v1',
        'feedback':args.feedback,
        'artifact':args.artifact,
        'primary_failure':ranked[0],
        'failure_dimensions':ranked,
        'candidate_skills':sorted({s for d in ranked for s in SKILL_HINTS[d]}),
        'phases':['freeze_baseline','capture_evidence','diagnose','decide_skill_gap','sanitize_lesson','patch_skill_if_needed','validate_skill','repair_product','release_prep_if_requested'],
        'hard_gates':['do_not_rebuild_before_skill_gap_decision','do_not_publish_project_specific_terms','run_validation_report_before_final']
    }
    txt=json.dumps(plan,indent=2)
    if args.out: open(args.out,'w').write(txt)
    print(txt)
if __name__=='__main__': main()
