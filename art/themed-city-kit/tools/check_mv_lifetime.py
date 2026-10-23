"""CPU-only contract check for the MV model-retirement wrapper; no weights/GPU."""
import json
import torch
from pixal_mv_single_use_lifetime import install

KEYS=['sparse_structure_flow_model','sparse_structure_decoder','shape_slat_flow_model_512',
      'shape_slat_flow_model_1024','shape_slat_decoder','tex_slat_flow_model_1024','tex_slat_decoder']
class Trial:
    low_vram=True
    default_pipeline_type='1024_cascade'
    def __init__(self):self.models={key:torch.nn.Linear(1,1) for key in KEYS}
    def run(self,*args,**kwargs):raise AssertionError('MV must not call the instance single-view run wrapper')
    def sample_sparse_structure(self):return 'coords'
    def sample_shape_slat(self,cond,flow_model):return 'shape'
    @torch.no_grad()
    def run_mv(self,views,**kwargs):
        assert self.sample_sparse_structure()=='coords'
        assert 'sparse_structure_flow_model' not in self.models
        assert self.sample_shape_slat(None,self.models['shape_slat_flow_model_512'])=='shape'
        assert 'shape_slat_flow_model_512' not in self.models
        assert {'shape_slat_flow_model_1024','tex_slat_flow_model_1024','shape_slat_decoder','tex_slat_decoder'}==set(self.models)
        return {'mesh':'unchanged result','views':views}

rows=[];pipeline=Trial();original_single=pipeline.run.__func__;install(pipeline,rows.append)
result=pipeline.run_mv('three supplied views',pipeline_type='1024_cascade')
assert result=={'mesh':'unchanged result','views':'three supplied views'}
assert pipeline.run.__func__ is original_single
assert not pipeline.models
assert len([row for row in rows if row['event']=='models_retired_after_complete_return'])==3
try:pipeline.models['shape_slat_decoder'];raise AssertionError('Retired model access was allowed')
except RuntimeError:pass
try:pipeline.run_mv('reuse',pipeline_type='1024_cascade');raise AssertionError('Second run was allowed')
except RuntimeError:pass
assert not torch.cuda.is_initialized()
print(json.dumps({'status':'passed','gpu_initialized':False,'real_weights_loaded':False,
                  'checks':['run_mv entrypoint','unchanged single-view method','SS retirement','LR retirement',
                            'HR/decoder lifetime','returned result preserved','retired access rejected','second run rejected'],
                  'events':rows},indent=2))
