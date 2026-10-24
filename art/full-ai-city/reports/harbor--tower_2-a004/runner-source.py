"""Native local Pixal multiview, isolated caches, shared GPU lock and native dtype.

Uses the official inference_mv.py / pipeline_mv.json / *_mv checkpoints. A
separate RGBA image is supplied per posed view; no montage or single-view proxy.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,importlib,importlib.util,json,os,re,sys,time,shutil

ROOT=Path(__file__).resolve().parents[3]
ART=ROOT/'art/full-ai-city'
VERIFIED_ADAPTERS=ROOT/'art/themed-city-kit/tools'
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import run_pixal_parts as base
base.CACHE=ART/'pixal-cache'
sys.path.insert(0,str(VERIFIED_ADAPTERS))
from pixal_streaming_loader import install as install_streaming
from pixal_mv_single_use_lifetime import wrap_init as install_lifetime
from pixal_mv_projection_cache import install as install_projection_cache

def now():return datetime.now(timezone.utc).isoformat()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def local(path):
    path=Path(path).resolve()
    if not path.is_relative_to(ROOT):raise ValueError('Project-local path required: '+str(path))
    return path

def inspect_weights():
    model_root=base.EXP/'models/Pixal3D'
    config=json.loads((model_root/'pipeline_mv.json').read_text('utf-8'))
    rows=[]
    for name,stem in config['args']['models'].items():
        weight=model_root/(stem+'.safetensors');configuration=model_root/(stem+'.json')
        rows.append({'name':name,'checkpoint':str(weight),'bytes':weight.stat().st_size if weight.is_file() else None,
                     'ready':weight.is_file() and configuration.is_file()})
    return {'ready':all(row['ready'] for row in rows) and base.inspect_weights()['ready'],'models':rows,
            'config':str(model_root/'pipeline_mv.json'),'config_sha256':sha(model_root/'pipeline_mv.json')}

def inspect_views(directory):
    from PIL import Image
    manifest=directory/'transforms.json';meta=json.loads(manifest.read_text('utf-8'))
    if meta.get('assumed_cameras') is not True:raise ValueError('Explicit assumed-camera provenance required')
    if len(meta['frames'])!=3:raise ValueError('This validated trial requires exactly three independent views')
    records=[]
    for frame in meta['frames']:
        path=local(directory/frame['file_path'])
        with Image.open(path) as image:
            if image.mode!='RGBA' or image.width!=image.height:raise ValueError('Native MV trial requires square RGBA views')
            alpha=image.getchannel('A');box=alpha.getbbox()
            if not box or alpha.getextrema()[0]==255:raise ValueError('Native MV trial requires existing alpha masks')
            size=list(image.size)
        matrix=frame['transform_matrix']
        if len(matrix)!=4 or any(len(row)!=4 for row in matrix):raise ValueError('Expected 4x4 camera-to-world matrices')
        records.append({'path':str(path),'sha256':sha(path),'size':size,'alpha_bbox':list(box),'camera_to_world':matrix})
    if len({tuple(row['size']) for row in records})!=1:raise ValueError('View canvases must match')
    return {'input':str(manifest),'input_sha256':sha(manifest),'input_views':records,
            'assumed_cameras':True,'camera_calibration':meta['camera_calibration'],'source_board':meta.get('source_board'),
            'view_count':len(records),'camera_angle_x':meta['camera_angle_x'],'mesh_scale':meta['mesh_scale']}

def bootstrap_multiview():
    # Reuse only the proven Windows kernels, local NAF, shared frozen DINO and
    # redirected project caches. No shared upstream or weight file is modified.
    torch,natten,_single=base.isolated_bootstrap()
    path=base.EXP/'Pixal3D/inference_mv.py'
    spec=importlib.util.spec_from_file_location('monopoly_native_pixal_mv',path)
    inference=importlib.util.module_from_spec(spec);sys.modules[spec.name]=inference;spec.loader.exec_module(inference)
    for config in inference.IMAGE_COND_CONFIGS.values():config['model_name']=str(base.EXP/'models/DINOv3')
    cache=str(base.CACHE/'flex-gemm-autotune.json')
    os.environ['FLEX_GEMM_AUTOTUNE_CACHE_PATH']=cache
    for module in ['flex_gemm_ap','flex_gemm_ap.utils.autotuner']:importlib.import_module(module).AUTOTUNE_CACHE_PATH=cache
    return torch,natten,inference

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset-id',required=True)
    parser.add_argument('--seed',type=int,default=9247)
    parser.add_argument('--views-dir',type=Path)
    parser.add_argument('--run',action='store_true')
    parser.add_argument('--check-environment',action='store_true')
    parser.add_argument('--min-free-ram-gib',type=float,default=11.0)
    parser.add_argument('--min-free-vram-gib',type=float,default=12.0)
    args=parser.parse_args()
    if not re.fullmatch('[a-z][a-z0-9_-]{0,79}',args.asset_id):raise ValueError('Invalid asset identifier')
    if args.run and args.check_environment:raise ValueError('Select inference or import-only check')
    base.protect_shared_files()
    folder=ART/'reports'/args.asset_id;folder.mkdir(parents=True,exist_ok=True)
    stem=args.asset_id+'-pixal-mv-1024-'+str(args.seed)
    output=ART/'source'/(stem+'.glb')
    report_path=folder/((stem+'.json') if args.run else ('preflight-'+datetime.now().strftime('%Y%m%dT%H%M%S%f')+'.json'))
    if report_path.exists() or (args.run and output.exists()):raise FileExistsError('Existing raw/output report preserved; use a new asset id')
    shutil.copy2(Path(__file__),folder/'runner-source.py')
    shutil.copy2(VERIFIED_ADAPTERS/'pixal_mv_projection_cache.py',folder/'projection-cache-source.py')
    views=inspect_views(local(args.views_dir)) if args.views_dir else {}
    if args.run and not views:raise ValueError('--views-dir required for inference')
    report={'status':'checked_without_inference','started_utc':now(),'generation_started':False,
            'local_inference_only':True,'asset_id':args.asset_id,'weights':inspect_weights(),
            'resources_before':base.resource_snapshot(),'output':str(output),**views,
            'native_entrypoint':'inference_mv.py:run_inference / Pixal3DMVImageTo3DPipeline.run_mv',
            'resolution':1024,'seed':args.seed,'low_vram':True,'strict_naf':True,'texture_size':4096,
            'sampler_steps':{'ss':12,'shape':12,'tex':12},'native_checkpoint_dtypes_preserved':True,
            'pipeline_config':'pipeline_mv.json','multiview_fusion':'average','shared_files_write_protected':True,
            'cache_directory':str(base.CACHE),'runner_sha256':sha(Path(__file__)),
            'runner_source_snapshot':str(folder/'runner-source.py'),
            'post_projection_allocator_cleanup':'Release only unused CUDA cached blocks after complete native conditioner return',
            'projection_cache_adapter_sha256':sha(VERIFIED_ADAPTERS/'pixal_mv_projection_cache.py'),
            'lifetime_adapter_sha256':sha(VERIFIED_ADAPTERS/'pixal_mv_single_use_lifetime.py')}
    def save():report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    save();print('MV_PREFLIGHT '+json.dumps(report,ensure_ascii=False),flush=True)
    if not args.run and not args.check_environment:return
    if not report['weights']['ready']:raise RuntimeError('Local MV weight inventory incomplete')
    torch=None;started=time.monotonic()
    try:
        sys.path.insert(0,str(base.SHARED/'tools'))
        from local_gpu_lock import LocalGpuLock
        with LocalGpuLock('monopoly-native-multiview-'+args.asset_id) as gpu_lock:
            report['gpu_lock']=dict(gpu_lock.owner_info);save()
            from native_memory_reservation import assert_native_admission
            report['memory_reservation_admission']=assert_native_admission(gpu_lock.lock_path)
            guard=Path(__file__).with_name('native_memory_reservation.py')
            guard_snapshot=ART/'reports/tool-snapshots'/(sha(guard)+'-'+guard.name)
            guard_snapshot.parent.mkdir(parents=True,exist_ok=True)
            if not guard_snapshot.exists():shutil.copy2(guard,guard_snapshot)
            report['memory_reservation_tool']={'path':str(guard_snapshot),'sha256':sha(guard_snapshot)};save()
            base.assert_memory(base.resource_snapshot(),args)
            torch,natten,inference=bootstrap_multiview()
            base.assert_memory(base.resource_snapshot(),args)
            free,total=torch.cuda.mem_get_info()
            if free/2**30<args.min_free_vram_gib:raise RuntimeError('CUDA free memory below startup guard')
            report.update(torch=torch.__version__,natten=natten.__version__,cuda=torch.version.cuda,
                          cuda_free_gib=free/2**30,cuda_total_gib=total/2**30)
            if args.check_environment:
                report.update(status='native_mv_imports_passed_no_weights_loaded',run_mv_available=hasattr(inference.Pixal3DMVImageTo3DPipeline,'run_mv'))
                save();return
            from replay_native_mobile import serve_one
            replay_started=time.monotonic();replay_receipts=[]
            # Same verified one-shot exporter calls, bounded to three jobs and
            # 90 seconds before beginning another neural inference. Each call
            # releases its tensors and keeps its independent immutable receipt.
            for _ in range(3):
                if replay_receipts and time.monotonic()-replay_started>=90:break
                replay_receipt=serve_one(inference,torch,ART,args.asset_id)
                if not replay_receipt:break
                replay_receipts.append(replay_receipt)
                report['prior_source_export_replay']=replay_receipt
                report['prior_source_export_replays']=list(replay_receipts)
                report['prior_export_batch']={'maximumJobs':3,'softSecondsLimit':90,'elapsedSeconds':round(time.monotonic()-replay_started,3),'neuralModelSettingsChanged':False}
                save();base.assert_memory(base.resource_snapshot(),args)
            install_streaming(base.EXP/'models/Pixal3D',folder/'loader.jsonl',parameter_empty=True)
            install_lifetime(inference,folder/'lifetime.jsonl')
            restore_projection_cache=install_projection_cache(inference,torch,folder/'projection-cache.jsonl')
            stages=folder/'stages.jsonl'
            def record_stage(row):
                with stages.open('a',encoding='utf-8') as handle:handle.write(json.dumps(row,ensure_ascii=False)+'\n')
                print('PIXAL_MV_STAGE '+json.dumps(row,ensure_ascii=False),flush=True)
            restore=base.install_stage_logging(inference,torch,record_stage)
            mobile_finish=None
            mobile_request=None
            mobile_request_path=ART/'queue/native-mobile-export.request.json'
            if mobile_request_path.exists():
                mobile_request=json.loads(mobile_request_path.read_text('utf-8'))
                if mobile_request.get('status')=='requested':
                    mobile_request.update(status='claimed',jobId=args.asset_id,claimedAt=now())
                    mobile_request_path.write_text(json.dumps(mobile_request,ensure_ascii=False,indent=2),encoding='utf-8')
                else:mobile_request=None
            if mobile_request is None:
                policy_path=ART/'queue/native-export-policy.json'
                if policy_path.exists():
                    policy=json.loads(policy_path.read_text('utf-8'))
                    if policy.get('status')=='capture_enabled':
                        mobile_request={**policy,'captureOnly':True,'jobId':args.asset_id,'policySha256':sha(policy_path)}
            if mobile_request:
                from native_mobile_export import install as install_mobile_export
                mobile_finish=install_mobile_export(inference,torch,ART,args.asset_id,output,mobile_request)
                report['native_mobile_request']=mobile_request
            torch.cuda.reset_peak_memory_stats()
            report.update(status='running',generation_started=True);save()
            output.parent.mkdir(parents=True,exist_ok=True)
            try:
                inference.run_inference(views_dir=str(local(args.views_dir)),output_path=str(output),num_views=3,
                    model_path=str(base.EXP/'models/Pixal3D'),config_file='pipeline_mv.json',
                    seed=args.seed,low_vram=True,resolution=1024)
            finally:
                if mobile_finish:
                    report['native_mobile_export_receipt']=mobile_finish()
                restore()
                restore_projection_cache()
            if not output.is_file() or output.stat().st_size<20:raise RuntimeError('No usable neural output produced')
            report.update(status='generated_unrigged_part_candidate',output_bytes=output.stat().st_size,output_sha256=sha(output),
                          input_unchanged=sha(views['input'])==views['input_sha256'] and all(sha(row['path'])==row['sha256'] for row in views['input_views']))
    except Exception as exc:
        report.update(status='gpu_busy' if type(exc).__name__=='LocalGpuBusyError' else 'failed',error=repr(exc))
        if type(exc).__name__=='LocalGpuBusyError':report['resource_wait']={'generation_started':report['generation_started'],'owner':getattr(exc,'owner',None),'chargedAsInferenceFailure':False}
        raise
    finally:
        report.update(seconds=round(time.monotonic()-started,2),finished_utc=now())
        if report.get('gpu_lock'):report['gpu_lock']['status']='released'
        if torch is not None and torch.cuda.is_initialized():report['peak_allocated_gib']=round(torch.cuda.max_memory_allocated()/2**30,3)
        save();print('PIXAL_MV_REPORT '+json.dumps(report,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
