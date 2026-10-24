"""Read actual receipts/stages without changing worker state or quality."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, statistics
from prepare_triptych import ART, atomic_json, evidence

def dt(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00'))

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--count', type=int, default=6)
    args = cli.parse_args()
    completed = []
    for path in ART.glob('reports/*/*pixal*.json'):
        report = json.loads(path.read_text('utf8'))
        if report.get('status') == 'generated_unrigged_part_candidate' and report.get('finished_utc'):
            completed.append((dt(report['finished_utc']), path, report))
    completed.sort()
    selected = completed[-args.count:]
    rows = []
    previous = None
    for _, path, report in selected:
        stage_path = path.parent / 'stages.jsonl'
        stages = [json.loads(line) for line in stage_path.read_text('utf8').splitlines()] if stage_path.exists() else []
        ends = [s for s in stages if s.get('event') == 'end']
        totals = {}
        for s in ends:
            totals[s['stage']] = totals.get(s['stage'], 0) + s['wall_seconds_without_extra_cuda_sync']
        prior = report.get('prior_export_batch', {}).get('elapsedSeconds', 0)
        loading = totals.get('pipeline_load', 0)
        export = totals.get('glb_material_and_mesh_export', 0)
        neural = sum(v for k, v in totals.items() if k not in ('pipeline_load', 'glb_material_and_mesh_export'))
        elapsed = (dt(report['finished_utc']) - dt(report['started_utc'])).total_seconds()
        row = dict(id=path.parent.name, report=evidence(path), stages=evidence(stage_path),
                   startedAt=report['started_utc'], finishedAt=report['finished_utc'],
                   workerSeconds=elapsed, priorReplaySeconds=prior, modelLoadSeconds=loading,
                   measuredNeuralConditioningSamplingDecodeSeconds=neural,
                   original4096GLBExportSeconds=export,
                   uninstrumentedWorkerSeconds=elapsed-prior-loading-neural-export,
                   stageTotalsSeconds=totals,
                   minimumObservedAvailableRAMGiB=min(s['resources']['available_ram_gib'] for s in stages),
                   priorReplayCount=len(report.get('prior_source_export_replays', [])))
        if previous:
            row['gapFromPreviousFinishedSeconds'] = (dt(row['startedAt'])-dt(previous['finishedAt'])).total_seconds()
        rows.append(row)
        previous = row
    start, end = dt(rows[0]['startedAt']), dt(rows[-1]['finishedAt'])
    attempts = []
    for path in ART.glob('queue/*/*.json'):
        state = json.loads(path.read_text('utf8'))
        for attempt in state.get('attempts', []):
            if start <= dt(attempt['startedAt']) <= end and attempt.get('retryableResourceWait'):
                attempts.append({'state': str(path), **attempt})
    total = (end-start).total_seconds()
    sums = {k: sum(r[k] for r in rows) for k in ('workerSeconds','priorReplaySeconds','modelLoadSeconds','measuredNeuralConditioningSamplingDecodeSeconds','original4096GLBExportSeconds','uninstrumentedWorkerSeconds')}
    gaps = sum(r.get('gapFromPreviousFinishedSeconds', 0) for r in rows)
    result = dict(createdAt=datetime.now(timezone.utc).isoformat(), completedJobs=len(rows), windowSeconds=total,
                  rows=rows, sumsSeconds=sums, interWorkerGapSeconds=gaps,
                  percentagesOfWindow={k:round(v/total*100,2) for k,v in sums.items()},
                  interWorkerGapPercent=round(gaps/total*100,2),
                  meanWorkerSeconds=statistics.mean(r['workerSeconds'] for r in rows),
                  meanWorkerExcludingPriorReplaysSeconds=statistics.mean(r['workerSeconds']-r['priorReplaySeconds'] for r in rows),
                  resourceGuardFailedAttempts=attempts,
                  limitations=['Stage durations do not add an extra CUDA synchronization; asynchronous work may be charged to a later stage.',
                               'The outer 11.5 GiB RAM guard currently sleeps without timestamped wait events. Inter-worker gaps bound possible guard time but include ordinary process exit, state hashing and startup; no gap is claimed to be entirely resource waiting.',
                               'Minimum available RAM is sampled only at stage boundaries. It does not establish CPU contention as the cause of inference duration differences.',
                               'These are successful-source throughput measurements, not visually approved asset throughput. Rejected sources and review work remain separate.'],
                  settingsChanged=False)
    output=ART/'reports/throughput'/('recent-'+end.strftime('%Y%m%dT%H%M%SZ')+'.json')
    atomic_json(output,result)
    print(json.dumps({'audit':evidence(output), **{k:v for k,v in result.items() if k not in ('rows','limitations')}},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
