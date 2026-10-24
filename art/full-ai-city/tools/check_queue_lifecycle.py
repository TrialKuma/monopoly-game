"""No-inference checks for reference revision, gating and preserved provenance."""
from pathlib import Path
import tempfile,json,sys
import run_raw_queue as q
from prepare_triptych import atomic_json,sha
def main():
    with tempfile.TemporaryDirectory(prefix='full-ai-queue-check-') as folder:
        q.ART=Path(folder);job={'region':'classic','asset':'shop_1','class':'core'}
        ref=q.ART/'references/classic/shop_1.png';ref.parent.mkdir(parents=True);ref.write_bytes(b'old image bytes')
        old=sha(ref);metadata=ref.with_suffix('.generation.json');atomic_json(metadata,{'status':'reference_ready_for_native_multiview','sha256':old})
        state={**job,'status':'raw_ready','inputSourceHash':old,'attempts':[{'id':'old-attempt'}],'rawGLB':{'path':'immutable-old.glb','sha256':'old-raw'},'inferenceReport':{'path':'immutable-old-report.json'}}
        q.save(job,state)
        unchanged=q.sync(job);assert unchanged['status']=='raw_ready' and unchanged['rawGLB']['sha256']=='old-raw'
        ref.write_bytes(b'new image bytes')
        gated=q.sync(job);assert gated['status']=='waiting_reference_metadata' and gated['rawGLB']['sha256']=='old-raw'
        atomic_json(metadata,{'status':'reference_reviewed_ready_for_panel_preprocess','sha256':sha(ref)})
        proof=q.ART/'inputs/new/reference.json';proof.parent.mkdir(parents=True);atomic_json(proof,{'immutable':True})
        q.prepare=lambda path:{'reference':str(proof),'viewsDir':str(proof.parent),'sourceSha256':sha(path)}
        revised=q.sync(job)
        assert revised['status']=='ready' and 'rawGLB' not in revised
        assert revised['revisions'][0]['rawGLB']['sha256']=='old-raw'
        assert revised['attempts'][0]['inputSourceHash']==old
        assert revised['inputSourceHash']==sha(ref)
        assert revised['generationMetadata']['sha256']==sha(metadata)
        print('PASS unchanged raw retained; metadata mismatch gated; reviewed alias accepted; changed image creates revision; old raw/attempt provenance preserved')
if __name__=='__main__':main()
