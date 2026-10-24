"""Isolated, non-publishable diagnostic of thin-surface preservation."""
from pathlib import Path
import sys
root = Path(r'H:\代码项目\monopoly')
tool = root/'art/full-ai-city/tools/process_lod.py'
sys.path.insert(0, str(tool.parent))
code = tool.read_text('utf-8')
code = code.replace("ROOT=Path(__file__).resolve().parents[3]", "ROOT=Path(r'H:\\代码项目\\monopoly')", 1)
needle = "    if args.voxel_size:\n        low.data.remesh_voxel_size=args.voxel_size"
replacement = """    if args.voxel_size:
        modifier=low.modifiers.new('Diagnostic source-derived thin shell','SOLIDIFY')
        modifier.thickness=.003
        modifier.offset=0
        modifier.use_even_offset=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        print('DIAGNOSTIC_THIN_SHELL',p.triangles(low),flush=True)
        low.data.remesh_voxel_size=args.voxel_size"""
if needle not in code:
    raise RuntimeError('Production implementation changed; review diagnostic injection')
code = code.replace(needle, replacement, 1)
exec(compile(code, str(tool), 'exec'), globals())
