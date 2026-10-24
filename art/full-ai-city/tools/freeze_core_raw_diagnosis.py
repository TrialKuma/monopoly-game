"""Freeze a reviewer-written raw surface diagnosis without approving an asset."""
from pathlib import Path
import argparse, hashlib, json, shutil
ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art/full-ai-city'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def record(path): return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}
def main():
    p = argparse.ArgumentParser()
    for name in ['map', 'asset', 'candidate-sha256', 'source-sha256', 'finding']: p.add_argument('--'+name, required=True)
    a = p.parse_args()
    source = ART/'work/core-review'/a.map/a.asset/('raw-'+a.source_sha256[:16])/'source-inspection.json'
    report = json.loads(source.read_text('utf8'))
    assert report['source']['sha256'] == a.source_sha256
    assert len(a.finding) > 30
    dest = ART/'reviews-rejected'/a.map/a.asset/a.candidate_sha256[:16]/'raw-1m'
    assert (dest.parent/'rejection.json').is_file()
    dest.mkdir(exist_ok=True)
    def copy(path):
        path = Path(path); target = dest/path.name
        if target.exists(): assert sha(target) == sha(path)
        else: shutil.copyfile(path, target)
        return record(target)
    report['actualSideViews']['views'] = [copy(v) for v in report['actualSideViews']['views']]
    report['additionalViews'] = [copy(v['path']) for v in report['additionalViews']]
    report['status'] = 'source_1m_visual_diagnosis_complete_decoder_attribution_pending'
    report['visualDiagnosis'] = {'reviewer': 'progression_design', 'finding': a.finding, 'decoderConclusion': 'Undetermined; pre-export decoder ROI review is separate. A defect in the native 1M export does not by itself establish a decoder defect.', 'sourceInspectionSha256': sha(source)}
    target = dest/'diagnosis.json'; data = (json.dumps(report, ensure_ascii=False, indent=2)+'\n').encode('utf8')
    if target.exists(): assert target.read_bytes() == data
    else: target.write_bytes(data)
    print(json.dumps(record(target), ensure_ascii=False))
if __name__ == '__main__': main()
