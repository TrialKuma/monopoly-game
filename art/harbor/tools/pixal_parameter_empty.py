"""Candidate parameter-only empty construction for Pixal; never a global meta device."""
from collections import Counter


def ordinary_tensors(model):
    """Enumerate tensor attributes outside registered parameters/buffers/modules."""
    import torch
    result = {}
    def visit(value, name):
        if isinstance(value, torch.Tensor):
            result[name] = value
        elif isinstance(value, (tuple, list)):
            for index, item in enumerate(value):
                visit(item, name + '[' + str(index) + ']')
        elif isinstance(value, dict):
            for key, item in value.items():
                visit(item, name + '.' + str(key))
    for module_name, module in model.named_modules():
        for key, value in vars(module).items():
            if key not in ('_parameters', '_buffers', '_modules'):
                visit(value, (module_name + '.' + key).lstrip('.'))
    return result


def construct_empty(factory, kwargs):
    from accelerate import init_empty_weights
    with init_empty_weights(include_buffers=False):
        model = factory(**kwargs)
    ordinary = ordinary_tensors(model)
    unexpected_meta = [key for key, value in ordinary.items() if value.is_meta]
    if unexpected_meta:
        raise ValueError('Ordinary tensor attributes became meta: ' + repr(unexpected_meta))
    state = model.state_dict()
    # Any meta buffer must be persistent/checkpoint-backed. Normal CPU buffers
    # retain their constructor values until the checkpoint copy overwrites them.
    unsupported_buffers = [key for key, value in model.named_buffers()
                           if value.is_meta and key not in state]
    if unsupported_buffers:
        raise ValueError('Nonpersistent meta buffer: ' + repr(unsupported_buffers))
    dtypes = Counter()
    for value in state.values():
        dtypes[str(value.dtype)] += value.numel()*value.element_size()
    info = {'target_dtype_bytes': dict(dtypes), 'target_state_bytes': sum(dtypes.values()),
            'state_tensor_count': len(state),
            'ordinary_tensor_count': len(ordinary),
            'ordinary_tensor_devices': {key: str(value.device) for key, value in ordinary.items()},
            'persistent_meta_buffers': [key for key, value in model.named_buffers() if value.is_meta]}
    return model, info


def materialize_native_cpu(model):
    """Allocate native target storage only, preserving non-meta buffers and aliases."""
    import torch
    allocated = {}
    for module in model.modules():
        for key, value in list(module._parameters.items()):
            if value is None or not value.is_meta:
                continue
            if id(value) not in allocated:
                allocated[id(value)] = torch.nn.Parameter(
                    torch.empty_like(value, device='cpu'), requires_grad=value.requires_grad)
            module._parameters[key] = allocated[id(value)]
        for key, value in list(module._buffers.items()):
            if value is None or not value.is_meta:
                continue
            if id(value) not in allocated:
                allocated[id(value)] = torch.empty_like(value, device='cpu')
            module._buffers[key] = allocated[id(value)]
    if any(value.is_meta for value in [*model.parameters(), *model.buffers(),
                                      *ordinary_tensors(model).values()]):
        raise ValueError('A tensor remains meta after materialization.')
    return model
