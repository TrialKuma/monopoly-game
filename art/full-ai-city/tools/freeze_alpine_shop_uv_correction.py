"""Freeze a manually reviewed, exact-hash same-building UV derivative.

Does not promote a candidate or approve a model. The required note records the
actual visual review; exact geometry, material and original donor UVs are checked.
"""
from pathlib import Path
import argparse,copy,json,shutil,sys
import numpy as np
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from prepare_triptych import ART,ROOT,sha,evidence,atomic_json
from neural_component import GLB

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--note',required=True);a=cli.parse_args();assert len(a.note)>30
    work=ART/'work/alpine-shop1-wall-uv-fix-final';frames_path=ART/'work/alpine-shop1-wall-uv-fix-v2/renders/render-report.json'
    receipt_path=work/'shop_1.uv-correction.json';correction=json.loads(receipt_path.read_text('utf8'))
    source_report=ART/'candidates/alpine/shop_1.json';processing=json.loads(source_report.read_text('utf8'))
    source=Path(processing['processedCandidate']['path']);output=work/'shop_1.glb'
    assert sha(source)==correction['source']['sha256']=='00684765be64e20afa1e53d0747f1acb7e01a8cb6c7f42f88dee7c8a367208f0'
    assert sha(output)==correction['output']['sha256']=='39c73c4e74a700312642e3994b5aee6c0edaf292d341f38b8675f0b2d9c1f533'
    aa,bb=GLB(source),GLB(output);pa=aa.doc['meshes'][0]['primitives'][0];pb=bb.doc['meshes'][0]['primitives'][0];ia=aa.array(pa['indices']).reshape(-1,3);ib=bb.array(pb['indices']).reshape(-1,3)
    assert len(ia)==len(ib)==correction['triangles']==29991
    for name in ('POSITION','NORMAL'):assert np.array_equal(aa.array(pa['attributes'][name])[ia],bb.array(pb['attributes'][name])[ib]),name
    for name in ('materials','nodes','scenes','scene','animations'):assert aa.doc.get(name)==bb.doc.get(name),name
    assert aa.image_hashes()==bb.image_hashes()
    ua=aa.array(pa['attributes']['TEXCOORD_0'])[ia];ub=bb.array(pb['attributes']['TEXCOORD_0'])[ib];changed=np.flatnonzero(np.any(ua!=ub,axis=(1,2)));loops=int(np.count_nonzero(np.any(ua!=ub,axis=2)))
    assert sorted(changed.tolist())==sorted(row['targetTriangle'] for row in correction['donorTriangleMapping'])
    assert len(changed)==279 and len(changed)<len(ia)*.01 and loops==correction['originalUVLoopsChanged']==837
    for row in correction['donorTriangleMapping']:assert np.array_equal(ub[row['targetTriangle']],ua[row['donorTriangle']])
    folder=ART/'reports/uv-corrections/alpine/shop_1'/sha(output)[:16];folder.mkdir(parents=True,exist_ok=True)
    def freeze(path,name=None):
        target=folder/(name or path.name)
        if target.exists():assert sha(target)==sha(path),'Frozen evidence changed'
        else:shutil.copyfile(path,target)
        return evidence(target)
    fsource=freeze(source,'input-native-candidate.glb');freport=freeze(source_report,'input-native-processing.json');freceipt=freeze(receipt_path,'uv-correction-original.json');foutput=freeze(output,'shop_1.glb')
    tool=ART/'tools/correct_alpine_shop_wall_uv.py';assert sha(tool)==correction['tool']['sha256'];ftool=freeze(tool);fverify=freeze(Path(__file__))
    measure=ROOT/Path(correction['measurement']['path']);assert sha(measure)==correction['measurement']['sha256'];fmeasure=freeze(measure)
    extras=[fmeasure,freeze(ART/'work/alpine-shop1-wall-uv-measure/uniform-donors.json')]
    for name in ('measure_alpine_shop_wall.py','measure_shop1_thin_strip.py','probe_plaster_donors.py'):extras.append(freeze(ART/'work/core-review'/name))
    frames=json.loads(frames_path.read_text('utf8'));assert frames['candidate']['sha256']==sha(output)
    images=[]
    for row in frames['reviewImages']:
        path=Path(row['path']);assert sha(path)==row['sha256'];images.append(freeze(path))
    assert len(images)==5
    for row in frames['extraViews']:
        path=Path(row['path']);assert sha(path)==row['sha256'];extras.append(freeze(path))
    extras.append(freeze(frames_path));extras.append(freeze(Path(frames['tool']['path'])))
    proof={'status':'verified_post_native_uv_correction_pending_final_approval','sourceCandidate':fsource,'sourceProcessingReport':freport,'receipt':freceipt,'tool':ftool,'verificationTool':fverify,'output':foutput,'evidence':images,
      'verification':{'perTrianglePositionsExactlyPreserved':True,'perTriangleNormalsExactlyPreserved':True,'embeddedImagesExactlyPreserved':True,'materialsExactlyPreserved':True,'nodesScenesAnimationsExactlyPreserved':True,'changedTriangleIdsExactlyMatchReceipt':True,'allReplacementUVsExactlyMatchRecordedOriginalDonor':True,'changedTriangles':len(changed),'changedUVLoops':loops,'triangles':len(ia),'newTriangles':0,'originalRawUnchanged':True},
      'method':correction['method'],'visualReview':{'status':'reviewed_for_derivative_processing','reviewer':'progression_design','notes':a.note},'localMeasurement':correction['targetMeasurement'],'additionalEvidence':extras,
      'measurementCaveat':'Triangle fraction is 0.9303%; geometric face area fraction is 3.5279% including internal/double surfaces. Neither is a projected visible-wall area fraction.'}
    proof_path=folder/'post-native-uv-correction.json';atomic_json(proof_path,proof)
    final=copy.deepcopy(processing);final['processedCandidate']=foutput;final['postNativeUVCorrection']={**proof,'proof':evidence(proof_path)};final['renderedCandidate']={**frames,'views':[v['path'] for v in images]};final['textureOrigin']+=' Documented 279-triangle rear plaster UV correction reuses an intact same-building plaster donor; all embedded image bytes remain exact.'
    final['limitations'].append('Rear native awning-color ghost corrected only in the measured 279-face plaster band using original same-building donor UVs. Small original tile seams and the side lean-to variation remain disclosed.')
    final.pop('reviewSheet',None);final.pop('promotedFrom',None);final['status']='exported_pending_visual_review'
    target=folder/'shop_1.json';atomic_json(target,final);print(json.dumps({'report':evidence(target),'proof':evidence(proof_path),'candidate':foutput},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
