"""One isolated official single-view comparison, never a formal MV asset."""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timezone
import argparse,hashlib,json,shutil,sys,threading,time

ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
EXPERIMENT=ART/'experiments/alpine-tower1-a003-single-front-23421'
sys.path.insert(0,str(ROOT/'art/harbor/tools'));sys.path.insert(0,str(Path(__file__).parent))
import run_pixal_parts as base
from prepare_triptych import evidence,atomic_json,sha

def read(path):return json.loads(Path(path).read_text('utf8'))
def now():return datetime.now(timezone.utc).isoformat()

def prepare_custom(experiment, single_input, expected_sha):
    """Freeze a separate reviewed single image without changing the original trial."""
    experiment=experiment.resolve();single_input=single_input.resolve()
    if not experiment.is_relative_to((ART/'experiments').resolve()):raise ValueError('Isolated experiment directory required')
    if experiment==EXPERIMENT.resolve():raise ValueError('Original single-front experiment is immutable')
    if not single_input.is_relative_to(experiment):raise ValueError('Experiment-local input required')
    if sha(single_input)!=expected_sha:raise ValueError('Reviewed single input changed')
    manifest=experiment/'manifest.json'
    if manifest.exists():
        row=read(manifest)
        if row.get('experimentOnly') is not True or row['singleInput']['sha256']!=expected_sha:raise ValueError('Different experiment manifest already exists')
        return row
    prior=read(EXPERIMENT/'manifest.json')
    for key in ('rawGLB','inferenceReport','inputManifest','reference'):assert sha(prior['baseline'][key]['path'])==prior['baseline'][key]['sha256']
    frozen=experiment/'inputs';frozen.mkdir(exist_ok=False)
    shutil.copy2(single_input,frozen/'single.png')
    shutil.copy2(prior['baseline']['reference']['path'],frozen/'reference-triptych.png')
    settings=dict(prior['sameSettings']);settings.update(inputPixelsExactlySameFront=False,reviewedSingleInputPixelsUnchanged=True)
    differences=dict(prior['differentSettings']);differences.update(
        conditioning='Official single pipeline.run with one separately generated front-right view versus preserved native run_mv baseline.',
        preprocessing='Official single preprocessing is unchanged. This new reference differs in viewpoint and generated design details; it is not a controlled identical-input comparison.',
        camera='Manual20-degree FOV retained as an experimental assumption; the generated view has no measured camera calibration.')
    row={'status':'prepared_not_generated','createdAt':now(),'experimentOnly':True,'formal147MultiviewRequirementUnchanged':True,
        'assetId':'alpine-tower1-single-three-quarter','baseline':prior['baseline'],'singleInput':evidence(frozen/'single.png'),
        'reviewedInput':evidence(single_input),'frozenReference':evidence(frozen/'reference-triptych.png'),
        'sameSettings':settings,'differentSettings':differences,'evaluation':prior['evaluation'],'timingPolicy':prior['timingPolicy'],
        'limitations':prior['limitations']+['The newly generated three-quarter image changes both viewpoint and some design details. The previous single-front visual rejection remains unchanged.'],
        'command':[sys.executable,'-B','-u',str(Path(__file__).resolve()),'--run','--experiment-dir',str(experiment),'--single-input',str(single_input),'--input-sha256',expected_sha,'--attempt','1']}
    metadata=single_input.with_suffix('.generation.json')
    if metadata.exists():row['referenceGeneration']=evidence(metadata)
    atomic_json(manifest,row);return row

def prepare():
    manifest=EXPERIMENT/'manifest.json'
    if manifest.exists():return read(manifest)
    source=ART/'source/alpine--tower_1-a003-pixal-mv-1024-23421.glb'
    assert sha(source)=='2a8658414e5e379410bf4871708d975466678f4c2db756eb0701d9f529365f30'
    report=ART/'reports/alpine--tower_1-a003/alpine--tower_1-a003-pixal-mv-1024-23421.json';baseline=read(report)
    inputs=ART/'inputs/alpine/tower_1/b80a19ec1ce6c82b';transforms=inputs/'transforms.json'
    front=inputs/'view00_azim000.png'
    assert baseline['seed']==23421 and baseline['view_count']==3
    assert next(v for v in baseline['input_views'] if Path(v['path']).name==front.name)['sha256']==sha(front)
    reference=ART/'references/alpine/tower_1.png'
    assert sha(reference)=='b80a19ec1ce6c82bfa1760c85544f1db372f3cbfbf24823e702912f6802dc587'
    EXPERIMENT.mkdir(parents=True,exist_ok=False)
    frozen=EXPERIMENT/'inputs';frozen.mkdir()
    for original,name in ((front,'front.png'),(reference,'reference-triptych.png'),(transforms,'mv-transforms.json')):
        shutil.copy2(original,frozen/name)
    config=base.EXP/'models/Pixal3D/pipeline.json';mvconfig=base.EXP/'models/Pixal3D/pipeline_mv.json'
    row={'status':'prepared_not_generated','createdAt':now(),'experimentOnly':True,'formal147MultiviewRequirementUnchanged':True,
        'baseline':{'rawGLB':evidence(source),'inferenceReport':evidence(report),'inputManifest':evidence(transforms),'front':evidence(front),
            'reference':evidence(reference),'sourceDiagnosis':evidence(ART/'reviews-rejected/alpine/tower_1/0bc46d6465a78e52/raw-1m/diagnosis.json'),
            'reportedProcessSeconds':baseline['seconds'],'peakAllocatedGiB':baseline['peak_allocated_gib']},
        'singleInput':evidence(frozen/'front.png'),'frozenReference':evidence(frozen/'reference-triptych.png'),
        'sameSettings':{'seed':23421,'shapeResolution':1024,'samplerSteps':{'ss':12,'shape':12,'tex':12},'rawTextureSize':4096,
            'nativeRawTriangleTarget':1000000,'lowVRAM':True,'manualHorizontalFovRadians':read(transforms)['camera_angle_x'],
            'inputPixelsExactlySameFront':True,'nativeCheckpointDtypesPreserved':True,'streamingAndSingleUseLifecycle':True},
        'differentSettings':{'conditioning':'Official single pipeline.run with one exact front versus native run_mv with three posed views fused by average',
            'singlePipelineConfig':evidence(config),'multiviewPipelineConfig':evidence(mvconfig),
            'weights':'Single and MV checkpoints differ; equal integer seed does not imply an equivalent random process.',
            'preprocessing':'Each official entrypoint retains its own preprocessing. Single preprocess_image may recenter/crop before conditioning; MV uses its official posed-view loader. Input file pixels are identical, not a claim of identical internal tensors.',
            'camera':'Single uses the same supplied20-degree manual FOV and official inferred distance; MV uses the recorded assumed orbit matrices. No new calibrated camera is claimed.'},
        'evaluation':['Original four-side geometry completeness with identical normalized framing','Front design agreement','Same mobile triangle/texture budget and postprocess comparison','Total generation and downstream processing wall time'],
        'timingPolicy':{'generation':'Separate process bootstrap/loading, native stage telemetry and4096 export; report total run_part wall time. Resource waits are separate attempts and excluded from inference comparison.',
            'baseline':'Use existing MV stage log; disclose any prior-source export replay or CPU load differences rather than treating total time as controlled hardware benchmark.',
            'postprocess':'Record CPU derivation, UV/field replay, render/review time separately. Do not compare only the fastest successful stage.'},
        'limitations':['One paired sample cannot prove overall single-view or multiview superiority.','Unseen single-view sides are inferred and may differ from the design.','This output is excluded from canonical candidates, approvals and release bundles.'],
        'command':[sys.executable,'-B','-u',str(Path(__file__).resolve()),'--run','--attempt','1']}
    atomic_json(manifest,row);return row

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');parser.add_argument('--attempt',type=int,default=1)
    parser.add_argument('--experiment-dir',type=Path);parser.add_argument('--single-input',type=Path);parser.add_argument('--input-sha256');args=parser.parse_args()
    custom=(args.experiment_dir,args.single_input,args.input_sha256)
    if any(custom) and not all(custom):parser.error('All three custom experiment arguments are required together')
    experiment=args.experiment_dir.resolve() if args.experiment_dir else EXPERIMENT
    manifest=prepare_custom(experiment,args.single_input,args.input_sha256) if all(custom) else prepare()
    if not args.run:print(json.dumps(manifest,ensure_ascii=False,indent=2));return
    for record in (manifest['singleInput'],manifest['baseline']['rawGLB'],manifest['baseline']['inferenceReport']):assert sha(record['path'])==record['sha256']
    attempt=experiment/('attempt-'+str(args.attempt).zfill(3));attempt.mkdir(parents=True,exist_ok=False)
    snapshots=attempt/'tools';snapshots.mkdir()
    for path in (Path(__file__),ROOT/'art/harbor/tools/run_pixal_parts.py',ROOT/'art/harbor/tools/pixal_streaming_loader.py',ROOT/'art/harbor/tools/pixal_single_use_lifetime.py',Path(__file__).with_name('native_memory_reservation.py')):
        shutil.copy2(path,snapshots/path.name)
    base.REPORTS=attempt/'reports';base.CACHE=ART/'cache'
    settings=manifest['sameSettings'];options=SimpleNamespace(resolution=1024,seed=23421,fov=settings['manualHorizontalFovRadians'],
        min_free_ram_gib=11.,min_free_vram_gib=12.,output_dir=attempt/'source')
    identity=manifest.get('assetId','alpine-tower1-single-front')
    part=base.inspect_part({'asset_id':identity,'image':manifest['singleInput']['path']},options)
    original_bootstrap=base.isolated_bootstrap;capture_finish=[]
    def bootstrap():
        from native_memory_reservation import assert_native_admission
        assert_native_admission() # run_part already owns the shared OS lock.
        torch,natten,inference=original_bootstrap()
        from pixal_streaming_loader import install
        from pixal_single_use_lifetime import wrap_init
        install(base.EXP/'models/Pixal3D',attempt/'loader.jsonl',parameter_empty=True)
        wrap_init(inference,attempt/'lifetime.jsonl')
        from native_mobile_export import install as capture
        capture_finish.append(capture(inference,torch,attempt,identity,Path(part['output']),{'captureOnly':True,'minDiskGiB':12,'experimentOnly':True,'viewCount':1}))
        return torch,natten,inference
    base.isolated_bootstrap=bootstrap;base.protect_shared_files()
    import psutil
    stop=threading.Event();telemetry=attempt/'resource-samples.jsonl'
    def monitor():
        process=psutil.Process()
        with telemetry.open('w',encoding='utf8') as file:
            while not stop.is_set():
                memory=process.memory_info();system=psutil.virtual_memory();swap=psutil.swap_memory()
                file.write(json.dumps({'time':now(),'processRSS':memory.rss,'processVMS':memory.vms,'availableRAM':system.available,'swapUsed':swap.used})+'\n');file.flush();stop.wait(5)
    thread=threading.Thread(target=monitor,daemon=True);thread.start()
    try:base.run_part(part,options)
    finally:
        stop.set();thread.join(timeout=6)
        if Path(part['report']).exists():
            result=read(part['report']);result.update(experimentOnly=True,view_count=1,pipeline_config='pipeline.json',native_entrypoint='inference.py:run_inference / Pixal3DImageTo3DPipeline.run',
                comparisonManifest=evidence(experiment/'manifest.json'),resourceTelemetry=evidence(telemetry),toolSnapshots=[evidence(p) for p in snapshots.iterdir()])
            if capture_finish:result['nativeFieldCapture']=capture_finish[0]()
            atomic_json(Path(part['report']),result)
            atomic_json(attempt/'result.json',{'status':result['status'],'generation_started':result['generation_started'],'inferenceReport':evidence(Path(part['report'])),'formalCandidate':False})
            print('SINGLE_EXPERIMENT_RESULT '+json.dumps(read(attempt/'result.json')),flush=True)

if __name__=='__main__':main()
