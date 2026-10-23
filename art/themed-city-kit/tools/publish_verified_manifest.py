"""Publish one manifest only after all five actual GLBs pass evidence checks."""
from pathlib import Path
from datetime import datetime,timezone
import json
from verify_multiview_house import verify

ROOT=Path(__file__).resolve().parents[3]
ART=ROOT/'art/themed-city-kit'
REGIONS=('alpine','classic','compact','harbor','expansion')

def main():
    assets=[]
    for region in REGIONS:
        name=region+'_house';checked=verify(name)
        report_path=ART/'reports'/f'{name}-processing.json'
        report=json.loads(report_path.read_text('utf-8'))
        inference=json.loads(Path(report['inference_report']['path']).read_text('utf-8'))
        manifest=json.loads(Path(inference['input']).read_text('utf-8'))
        assets.append({
            'region':region,'name':name,'status':'ready_for_runtime',
            'path':str(Path(report['output']['path']).relative_to(ROOT)).replace('\\','/'),
            'root_node':name,'static':True,'up_axis':'Y','front_axis':'+Z',
            'triangles':checked['triangles'],'bytes':checked['bytes'],'sha256':checked['sha256'],
            'bounds_gltf':report['bounds_gltf'],
            'textures':report['export_reimport_validation']['texture_sizes'],
            'geometry_origin':report['geometry_origin'],
            'local_topology_repair':report.get('local_topology_repair'),
            'visual_review':report['visual_review'],
            'source':report['source'],'source_board':report['source_board'],
            'source_single_views':manifest['source_views'],
            'inference_input_views':report['input_views'],
            'framing_height_spread_fraction':manifest['framing_height_spread_fraction'],
            'camera_calibration':'assumed_standard_orbit_not_measured',
            'azimuths_degrees':[0,90,180],'horizontal_fov_degrees':20,
            'native_pipeline':'Pixal3DMVImageTo3DPipeline.run_mv',
            'pipeline_config':'pipeline_mv.json','resolution':inference['resolution'],
            'seed':inference['seed'],'native_inference_seconds':inference['seconds'],
            'peak_cuda_allocated_gib':inference['peak_allocated_gib'],
            'gpu_lock_released':inference['gpu_lock']['status']=='released',
            'processing_report':str(report_path.relative_to(ROOT)).replace('\\','/'),
            'inference_report':str(Path(report['inference_report']['path']).relative_to(ROOT)).replace('\\','/'),
        })
    document={
        'status':'all_five_verified','created_at_utc':datetime.now(timezone.utc).isoformat(),
        'scope':'Five sparse feature residences supplementing the authored regional game kit',
        'input_origin':'AI design board plus three independently generated single-view RGBA images; byte-identical copies; no montage proxy',
        'camera_boundary':'Official assumed 0/90/180 degree orbit with 20 degree FOV; design images are not measured calibrated photographs',
        'gpu_memory_boundary':'RTX 5070 Ti has 15.92 GiB physical VRAM. Measured native MV peak allocation reaches approximately 16.37 GiB, requiring Windows WDDM shared-memory spill; not a dedicated-16-GB-only claim. No user programs were closed.',
        'processing_boundary':'Raw native GLBs untouched. One conservative reduction from source, original generated UVs/materials, 2048 texture derivatives. Local topology repairs are explicitly identified per asset. Normal/UV quantization uses KHR_mesh_quantization.',
        'runtime_scope':'Use one or two residences per map. Repeating approximately 180k-triangle meshes across dozens of lots is outside the validated scope. Gameplay upgrades and surrounding buildings use the separately authored modular kit.',
        'assets':assets,
    }
    out=ART/'reports/approved-houses.json'
    out.write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')
    capability_path=ART/'reports/pixal-multiview-capabilities.json'
    capability=json.loads(capability_path.read_text('utf-8'))
    capability['status']='native_multiview_five_assets_generated_and_verified'
    capability['final_assets_manifest']=str(out)
    capability['completed_assets']=[{k:a[k] for k in ('region','sha256','bytes','triangles','native_inference_seconds','peak_cuda_allocated_gib')} for a in assets]
    capability['projection_cache_cleanup']='After each complete native conditioner return, only unused CUDA allocator blocks are released. Returned object and live tensor values remain unchanged. This improves later-stage headroom but does not reduce the measured dense-projection peak below physical VRAM.'
    capability_path.write_text(json.dumps(capability,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':document['status'],'manifest':str(out),
        'assets':[{k:a[k] for k in ('region','sha256','bytes','triangles')} for a in assets]},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
