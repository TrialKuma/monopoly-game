"""MV adaptation of the verified single-run 1024 Pixal lifetime policy.

Only complete SS and LR methods trigger early retirement. HR and both shape/tex
decoders keep their original lifetime until the whole run has returned. No .cpu,
sampler, weight, activation, or random-number operation is changed.
"""
import functools
import gc
import json
import weakref
from pathlib import Path


class RetiredModels(dict):
    def __init__(self, values):
        super().__init__(values)
        self.retired = set()

    def __getitem__(self, key):
        if key in self.retired:
            raise RuntimeError('Completed single-use Pixal model accessed again: ' + str(key))
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key in self.retired:
            raise RuntimeError('Completed single-use Pixal model accessed again: ' + str(key))
        return super().get(key, default)


def install(pipeline, emit):
    import torch
    if not pipeline.low_vram:
        raise ValueError('This lifetime policy only supports the proven low-VRAM path.')
    expected = {'sparse_structure_flow_model', 'sparse_structure_decoder',
                'shape_slat_flow_model_512', 'shape_slat_flow_model_1024',
                'shape_slat_decoder', 'tex_slat_flow_model_1024', 'tex_slat_decoder'}
    if set(pipeline.models) != expected:
        raise ValueError('Unexpected model inventory for the single-use 1024 policy.')
    pipeline.models = RetiredModels(pipeline.models)
    model_refs = {key: weakref.ref(value) for key, value in pipeline.models.items()}
    started = False

    def retire(keys, boundary):
        released = []
        for key in keys:
            model = pipeline.models.pop(key)
            # The original complete method has already executed .cpu().
            if any(value.device.type != 'cpu' for value in [*model.parameters(), *model.buffers()]):
                raise RuntimeError('Retirement attempted before CPU offload completed: ' + key)
            state_bytes = sum(value.numel()*value.element_size() for value in model.state_dict().values())
            pipeline.models.retired.add(key)
            released.append({'model': key, 'native_state_bytes': state_bytes})
            del model
        gc.collect()
        emit({'event': 'models_retired_after_complete_return', 'boundary': boundary,
              'released': released, 'remaining_models': list(pipeline.models),
              'weakref_alive': {key: value() is not None for key, value in model_refs.items()},
              'note': 'Caller argument temporaries may disappear immediately after this wrapper returns.'})

    original_ss = pipeline.sample_sparse_structure
    @functools.wraps(original_ss)
    def sparse_structure(*args, **kwargs):
        if torch.is_grad_enabled():
            raise RuntimeError('Single-use retirement requires the original no-grad run.')
        result = original_ss(*args, **kwargs)
        del args, kwargs
        retire(['sparse_structure_flow_model', 'sparse_structure_decoder'],
               'sample_sparse_structure returned, including decoder and CPU offload')
        return result

    original_lr = pipeline.sample_shape_slat
    @functools.wraps(original_lr)
    def shape_lr(*args, **kwargs):
        if torch.is_grad_enabled():
            raise RuntimeError('Single-use retirement requires the original no-grad run.')
        model = args[1] if len(args) > 1 else kwargs['flow_model']
        if model is not pipeline.models['shape_slat_flow_model_512']:
            raise RuntimeError('Only the exact 1024-path LR model may retire at this boundary.')
        del model
        result = original_lr(*args, **kwargs)
        del args, kwargs
        retire(['shape_slat_flow_model_512'],
               'sample_shape_slat returned, including denormalization and CPU offload')
        return result

    # The native MV entry calls super().run(), bypassing an instance run wrapper.
    # Wrap run_mv itself; its inherited cascade uses the same SS/LR boundaries.
    original_run = pipeline.run_mv
    @functools.wraps(original_run)
    def run_once(*args, **kwargs):
        nonlocal started
        if started:
            raise RuntimeError('This pipeline is single-use; create a new process for another part.')
        if kwargs.get('pipeline_type', pipeline.default_pipeline_type) != '1024_cascade':
            raise ValueError('Single-use lifetime policy only verified for explicit 1024_cascade.')
        started = True
        result = original_run(*args, **kwargs)
        # The entire original run frame has now died, including its persistent
        # flow_model_hr local. Decoders have completed both use sites.
        remaining = expected - {'sparse_structure_flow_model', 'sparse_structure_decoder',
                                'shape_slat_flow_model_512'}
        if set(pipeline.models) != remaining:
            raise RuntimeError('Unexpected models at the completed pipeline boundary.')
        retire(list(pipeline.models), 'entire original run returned with mesh/latent outputs')
        if any(value() is not None for value in model_refs.values()):
            raise RuntimeError('A completed model still has a strong reference after the whole run.')
        return result

    pipeline.sample_sparse_structure = sparse_structure
    pipeline.sample_shape_slat = shape_lr
    pipeline.run_mv = run_once
    emit({'event': 'single_use_policy_installed',
          'early_retirement': ['sparse_structure_flow_model', 'sparse_structure_decoder',
                               'shape_slat_flow_model_512'],
          'hr_and_decoders_kept_until_whole_run_returns': True,
          'wrapped_entrypoint': 'run_mv',
          'native_cascade_and_sampling_unchanged': True})


def wrap_init(inference, log_path):
    log_path = Path(log_path)
    if log_path.exists():
        raise FileExistsError('Preserving previous lifetime evidence: ' + str(log_path))
    log_path.parent.mkdir(parents=True, exist_ok=True)
    original = inference.init_pipeline
    def emit(row):
        import psutil
        row = {**row, 'rss_gib': psutil.Process().memory_info().rss/2**30,
               'available_ram_gib': psutil.virtual_memory().available/2**30}
        with log_path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(row, ensure_ascii=False)+'\n')
        print('PIXAL_LIFETIME '+json.dumps(row, ensure_ascii=False), flush=True)
    @functools.wraps(original)
    def initialized(*args, **kwargs):
        pipeline = original(*args, **kwargs)
        install(pipeline, emit)
        return pipeline
    inference.init_pipeline = initialized
