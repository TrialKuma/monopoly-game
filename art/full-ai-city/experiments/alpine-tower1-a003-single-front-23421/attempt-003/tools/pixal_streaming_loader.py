"""Process-local Pixal checkpoint loader; preserves native constructor dtypes.

The upstream source and checkpoints remain read-only. Default construction is
eager; the explicit parameter_empty option avoids temporary parameter storage
using separately audited parameter-only empty construction. Neither path uses
assign=True, lazy stage construction, or a precision change.
Each source tensor owns one short-lived mapping, so an entire FP32 checkpoint is
not retained while it is copied into the constructor's mixed-precision model.
"""
from pathlib import Path
from collections import Counter
import json
import time


def _snapshot():
    import psutil
    return {'rss_gib': psutil.Process().memory_info().rss / 2**30,
            'available_ram_gib': psutil.virtual_memory().available / 2**30}


def copy_checkpoint(model, checkpoint, emit=None):
    """Copy exact checkpoint keys into native target storage, checking every value."""
    import torch
    from safetensors import safe_open
    checkpoint = Path(checkpoint).resolve()
    # Direct copy is equivalent only for normal Module loading. Refuse custom
    # hooks or overrides rather than silently bypass their transformations.
    for name, module in model.named_modules():
        if type(module)._load_from_state_dict is not torch.nn.Module._load_from_state_dict:
            raise TypeError('Custom _load_from_state_dict is unsupported: ' + name)
        for attr in ('_load_state_dict_pre_hooks', '_load_state_dict_post_hooks',
                     '_state_dict_hooks', '_state_dict_pre_hooks'):
            if getattr(module, attr, None):
                raise TypeError('Custom state hook is unsupported: ' + name + '/' + attr)
    state = model.state_dict()
    if not all(isinstance(t, torch.Tensor) and t.device.type == 'cpu'
               and t.is_contiguous() for t in state.values()):
        raise TypeError('Expected ordinary contiguous CPU state tensors.')
    with safe_open(str(checkpoint), framework='pt', device='cpu') as source:
        source_keys = set(source.keys())
        target_keys = set(state)
        if source_keys != target_keys:
            raise ValueError('Checkpoint keys differ: missing=' + repr(sorted(target_keys-source_keys))
                             + ', unexpected=' + repr(sorted(source_keys-target_keys)))
        for key, target in state.items():
            if tuple(source.get_slice(key).get_shape()) != tuple(target.shape):
                raise ValueError('Checkpoint shape differs: ' + key)
    source_bytes = 0
    largest_source_bytes = 0
    source_dtypes, target_dtypes = Counter(), Counter()
    start = time.monotonic()
    with torch.no_grad():
        # Preserve state_dict order, including the upstream last-copy behavior
        # if a future model deliberately exposes aliased state tensors.
        for key, target in state.items():
            with safe_open(str(checkpoint), framework='pt', device='cpu') as source:
                value = source.get_tensor(key)
                byte_count = value.numel() * value.element_size()
                source_bytes += byte_count
                largest_source_bytes = max(largest_source_bytes, byte_count)
                source_dtypes[str(value.dtype)] += byte_count
                target_dtypes[str(target.dtype)] += target.numel()*target.element_size()
                expected_dtype = target.dtype
                expected_ptr = target.data_ptr()
                target.copy_(value)
                # The original loader casts while copying. Compare exactly in
                # that target dtype, in bounded chunks, including complex buffers.
                source_flat, target_flat = value.reshape(-1), target.reshape(-1)
                chunk_elements = max(1, (8 * 2**20) // target.element_size())
                for offset in range(0, target.numel(), chunk_elements):
                    expected = source_flat[offset:offset+chunk_elements].to(dtype=expected_dtype)
                    if not torch.equal(target_flat[offset:offset+chunk_elements], expected):
                        raise ValueError('Checkpoint value mismatch after native-dtype copy: ' + key)
                    del expected
                if target.dtype != expected_dtype or target.data_ptr() != expected_ptr:
                    raise AssertionError('Target storage/dtype changed: ' + key)
                # All tensor views must die before this mapping is closed.
                del source_flat, target_flat, value
    result = {'checkpoint': str(checkpoint), 'tensor_count': len(state),
              'checkpoint_tensor_bytes': source_bytes,
              'largest_individual_source_tensor_bytes': largest_source_bytes,
              'source_dtype_bytes': dict(source_dtypes), 'target_dtype_bytes': dict(target_dtypes),
              'exact_keys_shapes_verified': True, 'all_target_values_verified': True,
              'constructor_target_dtype_preserved': True, 'target_storage_preserved': True,
              'seconds': round(time.monotonic()-start, 4), **_snapshot()}
    if emit:
        emit({'event': 'checkpoint_copied', **result})
    return result


def install(model_root, log_path, parameter_empty=False):
    """Replace only the imported process's model factory; no source-file writes."""
    import pixal3d.models as models
    root = Path(model_root).resolve()
    log_path = Path(log_path).resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if log_path.exists():
        raise FileExistsError('Preserving previous loader evidence: ' + str(log_path))
    original = models.from_pretrained
    failures = {}

    def emit(row):
        mode = ('parameter_only_empty_native_dtype_single_tensor_mapping_v2'
                if parameter_empty else 'eager_native_dtype_single_tensor_mapping_v1')
        row = {'loader': mode, **row}
        with log_path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
        print('PIXAL_CHECKPOINT ' + json.dumps(row, ensure_ascii=False), flush=True)

    def streamed(path, **kwargs):
        base = Path(path)
        if not base.is_absolute():
            base = root / base
        base = base.resolve()
        if not base.is_relative_to(root):
            raise ValueError('Streaming loader only permits the verified local model root.')
        if str(base) in failures:
            # Pipeline.from_pretrained retries on Exception; do not reconstruct
            # an already-failed local model or accidentally try a remote model.
            raise RuntimeError('Previous local loader failure: ' + failures[str(base)])
        try:
            config = json.loads(Path(str(base)+'.json').read_text('utf-8'))
            checkpoint = Path(str(base)+'.safetensors')
            if not checkpoint.is_file():
                raise FileNotFoundError(checkpoint)
            emit({'event': 'constructor_start', 'checkpoint': str(checkpoint), **_snapshot()})
            constructor_info = {}
            if parameter_empty:
                from pixal_parameter_empty import construct_empty, materialize_native_cpu
                model, constructor_info = construct_empty(getattr(models, config['name']),
                                                           {**config['args'], **kwargs})
                materialize_native_cpu(model)
            else:
                model = getattr(models, config['name'])(**config['args'], **kwargs)
            emit({'event': 'constructor_end', 'checkpoint': str(checkpoint),
                  **constructor_info, **_snapshot()})
            copy_checkpoint(model, checkpoint, emit)
            return model
        except Exception as exc:
            failures[str(base)] = repr(exc)
            emit({'event': 'load_failed', 'checkpoint_base': str(base), 'error': repr(exc)})
            raise

    models.from_pretrained = streamed
    return lambda: setattr(models, 'from_pretrained', original)
