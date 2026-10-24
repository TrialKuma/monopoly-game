"""Compare recorded timing only; no automatic visual or route conclusion."""
from pathlib import Path
import json,sys
from prepare_triptych import ART,atomic_json,evidence

experiment=ART/'experiments/alpine-tower1-a003-single-front-23421';manifest=json.loads((experiment/'manifest.json').read_text('utf8'))
attempts=[]
for path in sorted(experiment.glob('attempt-*/result.json')):
    result=json.loads(path.read_text('utf8'));report=json.loads(Path(result['inferenceReport']['path']).read_text('utf8'))
    attempts.append((path,result,report))
generated=[r for r in attempts if r[2]['generation_started']]
assert len(generated)==1 and generated[0][2]['status']=='generated_unrigged_part_candidate'
path,result,single=generated[0];multi=json.loads(Path(manifest['baseline']['inferenceReport']['path']).read_text('utf8'))
def stages(path):return [json.loads(line) for line in path.read_text('utf8').splitlines()]
multi_stage_path=Path(manifest['baseline']['inferenceReport']['path']).parent/'stages.jsonl';single_stage_path=Path(single['stage_log'])
def metrics(report,rows):
    ends=[{'stage':r['stage'],'seconds':r['wall_seconds_without_extra_cuda_sync']} for r in rows if r['event']=='end']
    return {'totalRunSeconds':report['seconds'],'peakAllocatedCUDAGiB':report['peak_allocated_gib'],
        'priorSourceExportSeconds':report.get('prior_export_batch',{}).get('elapsedSeconds',0),'stageEnds':ends,
        'sparseTokens':[{'stage':r['stage'],'count':r['input_tensor']['sparse_token_count']} for r in rows if r['event']=='start' and r.get('input_tensor',{}).get('sparse_token_count')],
        'sampledMinimumAvailableRAMGiB':min(r['resources']['available_ram_gib'] for r in rows if r.get('resources'))}
data={'status':'timing_recorded_visual_comparison_pending','experimentOnly':True,'manifest':evidence(experiment/'manifest.json'),
    'actualSingleInferenceAttempts':len(generated),'resourceWaitAttempts':sum(not r[2]['generation_started'] for r in attempts),
    'multiview':{'inference':manifest['baseline']['inferenceReport'],'raw':manifest['baseline']['rawGLB'],'stageLog':evidence(multi_stage_path),**metrics(multi,stages(multi_stage_path))},
    'single':{'inference':result['inferenceReport'],'raw':{'path':single['output'],'sha256':single['output_sha256'],'bytes':single['output_bytes']},'stageLog':evidence(single_stage_path),'fieldCapture':single['nativeFieldCapture'],**metrics(single,stages(single_stage_path))},
    'interpretation':'This measured single sample took longer total wall time and lower allocated CUDA peak. Different model checkpoints, generated sparse token counts, native preprocessing and concurrent CPU/system memory conditions prevent attributing that difference solely to view count. Quality and downstream repair cost remain unreviewed.',
    'formalQueueResumed':json.loads((experiment/'schedule.json').read_text('utf8')).get('rawQueueResumedPid') is not None}
atomic_json(experiment/'benchmark.json',data);print(json.dumps(data,ensure_ascii=False,indent=2))
