"""Release unused allocator blocks after completed native MV conditioning.

The original callable runs unchanged and its exact return object is passed back.
No parameters, tensor contents, device placement, dtype, camera or sampler values
are modified. This targets WDDM cache pressure observed in the first native run.
"""
import functools, json
from datetime import datetime, timezone

def install(inference, torch, log_path):
    original_init = inference.init_pipeline
    restorations = []
    def record(row):
        row['utc'] = datetime.now(timezone.utc).isoformat()
        with log_path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(row) + '\n')
        print('PIXAL_MV_CACHE ' + json.dumps(row), flush=True)
    @functools.wraps(original_init)
    def init(*args, **kwargs):
        pipeline = original_init(*args, **kwargs)
        for name in ('get_proj_cond_ss', 'get_proj_cond_shape'):
            if not hasattr(pipeline, name):
                continue
            original = getattr(pipeline, name)
            def make_wrapper(call, stage):
                @functools.wraps(call)
                def completed(*call_args, **call_kwargs):
                    result = call(*call_args, **call_kwargs)
                    before = {'allocated_gib': torch.cuda.memory_allocated()/2**30,
                              'reserved_gib': torch.cuda.memory_reserved()/2**30}
                    torch.cuda.empty_cache()
                    after = {'allocated_gib': torch.cuda.memory_allocated()/2**30,
                             'reserved_gib': torch.cuda.memory_reserved()/2**30}
                    record({'stage': stage, 'boundary': 'complete_native_return',
                            'operation': 'torch.cuda.empty_cache', 'before': before,
                            'after': after, 'returned_original_object': True,
                            'tensor_value_operations': 0})
                    return result
                return completed
            setattr(pipeline, name, make_wrapper(original, name))
            restorations.append((pipeline, name, original))
        return pipeline
    inference.init_pipeline = init
    def restore():
        for owner, name, original in reversed(restorations):
            setattr(owner, name, original)
        inference.init_pipeline = original_init
    return restore
