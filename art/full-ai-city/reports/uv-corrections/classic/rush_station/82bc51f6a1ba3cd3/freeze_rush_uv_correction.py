"""Freeze and verify the explicit post-field, same-atlas stone UV correction."""
from pathlib import Path
import json,shutil,sys,copy
import numpy as np
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from prepare_triptych import ART,ROOT,sha,evidence,atomic_json
from neural_component import GLB

def main():
    work=ART/'work/rush-wall-uv-final';source_report=ART/'candidates/classic/rush_station.json';report=json.loads(source_report.read_text('utf8'));receipt_path=work/'rush_station.uv-correction.json';receipt=json.loads(receipt_path.read_text('utf8'));source=Path(report['processedCandidate']['path']);output=work/'rush_station.glb'
    assert sha(source)==receipt['source']['sha256']=='adae415cbb7ce3b5e03cc98910b753aa3e04f34e51502d6d5d5a74abc2f9a58e'
    assert sha(output)==receipt['output']['sha256']=='82bc51f6a1ba3cd36f671f1011b024a8c792214aefd4aeadff6b2d535863a724'
    a,b=GLB(source),GLB(output);pa=a.doc['meshes'][0]['primitives'][0];pb=b.doc['meshes'][0]['primitives'][0];ia=a.array(pa['indices']).reshape(-1,3);ib=b.array(pb['indices']).reshape(-1,3)
    assert len(ia)==len(ib)==receipt['triangles']
    for name in ('POSITION','NORMAL'):
        assert np.array_equal(a.array(pa['attributes'][name])[ia],b.array(pb['attributes'][name])[ib]),name
    assert a.image_hashes()==b.image_hashes();assert a.doc['materials']==b.doc['materials']
    ua=a.array(pa['attributes']['TEXCOORD_0'])[ia];ub=b.array(pb['attributes']['TEXCOORD_0'])[ib];changed=np.flatnonzero(np.any(ua!=ub,axis=(1,2)))
    assert sorted(changed.tolist())==sorted(row['targetTriangle'] for row in receipt['donorTriangleMapping'])
    for row in receipt['donorTriangleMapping']:assert np.array_equal(ub[row['targetTriangle']],ua[row['donorTriangle']])
    folder=ART/'reports/uv-corrections/classic/rush_station'/receipt['output']['sha256'][:16];folder.mkdir(parents=True,exist_ok=True)
    def freeze(path,name=None):
        target=folder/(name or path.name)
        if target.exists():assert sha(target)==sha(path),'Frozen evidence changed'
        else:shutil.copyfile(path,target)
        return evidence(target)
    frozen_source=freeze(source,'input-native-candidate.glb');frozen_report=freeze(source_report,'input-native-processing.json');frozen_receipt=freeze(receipt_path,'uv-correction-original.json');tool=freeze(ART/'tools/correct_rush_wall_uv.py','correct_rush_wall_uv.py');freeze_tool=freeze(Path(__file__),'freeze_rush_uv_correction.py');frozen_output=freeze(output,'rush_station.glb')
    frames=json.loads((work/'render-report.json').read_text('utf8'));assert frames['candidate']['sha256']==receipt['output']['sha256'];view_evidence=[]
    for item in frames['reviewImages']:
        path=Path(item['path']);assert sha(path)==item['sha256'];view_evidence.append(freeze(path,path.name.replace('final-','lod-')))
    assert len(view_evidence)==5
    proof={'status':'verified_post_native_uv_correction_pending_final_approval','sourceCandidate':frozen_source,'sourceProcessingReport':frozen_report,'receipt':frozen_receipt,'tool':tool,'verificationTool':freeze_tool,'output':frozen_output,'evidence':view_evidence,'verification':{'perTrianglePositionsExactlyPreserved':True,'perTriangleNormalsExactlyPreserved':True,'embeddedImagesExactlyPreserved':True,'materialsExactlyPreserved':True,'changedTriangleIdsExactlyMatchReceipt':True,'allReplacementUVsExactlyMatchRecordedOriginalDonor':True,'changedTriangles':len(changed),'changedUVLoops':int(np.count_nonzero(np.any(ua!=ub,axis=2))),'triangles':len(ia),'newTriangles':0,'originalRawUnchanged':True},'method':receipt['method'],'visualReview':{'status':'reviewed_for_derivative_processing','reviewer':'outskirts','notes':'Actual five final views reviewed; dark left stone-recess strip removed using adjacent intact original stone UVs. Original shallow side-wall faceting remains disclosed.'}}
    atomic_json(folder/'post-native-uv-correction.json',proof)
    final=copy.deepcopy(report);final['processedCandidate']=frozen_output;final['postNativeUVCorrection']={**proof,'proof':evidence(folder/'post-native-uv-correction.json')};final['renderedCandidate']={**frames,'views':[v['path'] for v in view_evidence]};final['textureOrigin']+=' After native sampling, the explicitly recorded 64-triangle local stone region reuses intact same-atlas stone UVs; embedded images remain byte-identical.';final['limitations'].append('Original shallow left stone-recess faceting remains; local source dark-color contamination corrected by documented same-building UV donor mapping.');final.pop('reviewSheet',None);final.pop('promotedFrom',None);final['status']='exported_pending_visual_review';atomic_json(folder/'rush_station.json',final)
    print(json.dumps({'report':evidence(folder/'rush_station.json'),'proof':evidence(folder/'post-native-uv-correction.json'),'candidate':frozen_output},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
