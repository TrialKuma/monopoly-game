"""Generate one independent part per Pixal3D run, using the proven local runtime.

Default is CPU-only input/manifest/resource inspection. --run is required for
inference. The character laboratory is read-only; caches, reports and meshes
belong to this environment laboratory. Launch with its pixal-env Python -B.
"""
from pathlib import Path
from collections.abc import MutableMapping
from datetime import datetime, timezone
import argparse
import functools
import hashlib
import importlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
SHARED = Path('C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab').resolve()
EXP = SHARED / 'source/experimental'
CACHE = ROOT / 'art/harbor/pixal-cache'
REPORTS = ROOT / 'art/harbor/reports'
DEFAULT_OUTPUT = ROOT / 'art/harbor/source'


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def local_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Output must remain in this laboratory: ' + str(path))
    return path


def protect_shared_files():
    def protected(value):
        if isinstance(value, (str, bytes, os.PathLike)):
            return Path(os.fsdecode(value)).resolve().is_relative_to(SHARED)
        return False

    def audit(event, args):
        if event == 'open':
            path, mode, flags = args
            writing = any(x in (mode or '') for x in 'wax+') or bool(
                flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if writing and protected(path):
                raise PermissionError('Shared Pixal3D files are read-only: ' + str(path))
        elif event in ('os.remove', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.truncate', 'os.utime'):
            if protected(args[0]):
                raise PermissionError('Shared Pixal3D files are read-only: ' + str(args[0]))
        elif event in ('os.rename', 'os.link', 'os.symlink'):
            if any(protected(path) for path in args[:2]):
                raise PermissionError('Shared Pixal3D files are read-only')

    sys.addaudithook(audit)


def resource_snapshot():
    import psutil
    line = subprocess.check_output([
        'nvidia-smi', '--query-gpu=name,memory.total,memory.free,utilization.gpu',
        '--format=csv,noheader,nounits'], text=True).splitlines()[0]
    gpu, total, free, utilization = [x.strip() for x in line.split(',')]
    ram = psutil.virtual_memory()
    return {'gpu': gpu, 'total_physical_vram_gib': int(total) / 1024,
            'free_physical_vram_gib': int(free) / 1024,
            'gpu_utilization_percent': int(utilization),
            'total_ram_gib': ram.total / 2**30,
            'available_ram_gib': ram.available / 2**30}


def inspect_weights():
    records = []
    for name in ('Pixal3D', 'DINOv3'):
        folder = EXP / 'models' / name
        manifest = json.loads((folder / 'download-manifest.json').read_text('utf-8'))
        problems = [row['name'] for row in manifest['files']
                    if not (folder / row['name']).is_file()
                    or (folder / row['name']).stat().st_size != row['bytes']]
        records.append({'name': name, 'revision': manifest['revision'],
                        'ready': manifest['status'] == 'downloaded_size_verified' and not problems,
                        'missing_or_wrong_size': problems})
    naf = EXP / 'torch-cache/hub/checkpoints/naf_release.pth'
    naf_code = EXP / 'torch-cache/hub/valeoai_NAF_main/hubconf.py'
    return {'ready': all(x['ready'] for x in records) and naf.is_file() and naf_code.is_file(),
            'models': records, 'local_naf_weights': naf.is_file(), 'local_naf_code': naf_code.is_file(),
            'validation': 'Existing manifest and current sizes; large weights are not rehashed per part.'}


def inspect_part(row, args):
    from PIL import Image
    asset_id = row['asset_id']
    if not isinstance(asset_id, str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,79}', asset_id):
        raise ValueError('asset_id must use lowercase ASCII letters, digits, hyphens or underscores.')
    image = Path(row['image']).resolve()
    with Image.open(image) as picture:
        if picture.mode != 'RGBA':
            raise ValueError('Input must already be RGBA: ' + str(image))
        alpha = picture.getchannel('A')
        extrema, box = alpha.getextrema(), alpha.getbbox()
        if extrema[0] == 255 or extrema[1] <= 204 or box is None:
            raise ValueError('Input needs transparent background and a solid foreground mask: ' + str(image))
        size = list(picture.size)
    output_dir = local_path(row.get('output_dir', args.output_dir))
    stem = f'{asset_id}-pixal-{args.resolution}-{args.seed}'
    output = output_dir / (stem + '.glb')
    report = REPORTS / (stem + '.json')
    if output.exists() or report.exists():
        raise FileExistsError('Existing part/output report is preserved; choose another asset-id or seed: ' + stem)
    return {'asset_id': asset_id, 'input': str(image), 'input_sha256': sha(image),
            'input_size': size, 'alpha_bbox': list(box), 'alpha_extrema': list(extrema),
            'output': str(output), 'report': str(report)}


class RedirectedEnvironment(MutableMapping):
    """Keep the unmodified shared bootstrap from selecting shared write caches."""
    def __init__(self, forced):
        self.forced = forced

    def __getitem__(self, key):
        return os.environ[key]

    def __setitem__(self, key, value):
        os.environ[key] = self.forced.get(key, value)

    def __delitem__(self, key):
        del os.environ[key]

    def __iter__(self):
        return iter(os.environ)

    def __len__(self):
        return len(os.environ)


class BootstrapOS:
    def __init__(self, forced):
        self.environ = RedirectedEnvironment(forced)

    def __getattr__(self, name):
        return getattr(os, name)


def isolated_bootstrap():
    directories = {'HF_HOME': 'hf', 'HF_HUB_CACHE': 'hf/hub',
                   'HUGGINGFACE_HUB_CACHE': 'hf/hub', 'TORCH_HOME': 'torch',
                   'TRITON_CACHE_DIR': 'triton', 'CUDA_CACHE_PATH': 'cuda',
                   'PYTORCH_KERNEL_CACHE_PATH': 'torch-kernels',
                   'TORCH_EXTENSIONS_DIR': 'torch-extensions', 'NUMBA_CACHE_DIR': 'numba',
                   'XDG_CACHE_HOME': 'xdg', 'MPLCONFIGDIR': 'matplotlib',
                   'TEMP': 'tmp', 'TMP': 'tmp', 'TMPDIR': 'tmp'}
    forced = {key: str(CACHE / directory) for key, directory in directories.items()}
    for path in set(forced.values()):
        Path(path).mkdir(parents=True, exist_ok=True)
    flex_cache = CACHE / 'flex-gemm-autotune.json'
    if not flex_cache.exists() and (EXP / 'flex-gemm-autotune.json').is_file():
        shutil.copy2(EXP / 'flex-gemm-autotune.json', flex_cache)
    forced.update(FLEX_GEMM_AUTOTUNE_CACHE_PATH=str(flex_cache), HF_HUB_OFFLINE='1',
                  TRANSFORMERS_OFFLINE='1', PYTHONDONTWRITEBYTECODE='1')
    os.environ.update(forced)
    tempfile.tempdir = str(CACHE / 'tmp')
    adapter_path = SHARED / 'tools/run_pixal_local.py'
    spec = importlib.util.spec_from_file_location('pixal_shared_readonly_adapter', adapter_path)
    single = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = single
    spec.loader.exec_module(single)
    # No source edits: only this imported module's view of os.environ is redirected.
    single.os = BootstrapOS(forced)
    torch, natten, inference = single.bootstrap()
    # inference.py sets its own cache environment variable at import time. Reset
    # both that variable and the two package-level copies before any kernels run.
    os.environ.update(forced)
    for name in ('flex_gemm_ap', 'flex_gemm_ap.utils.autotuner'):
        importlib.import_module(name).AUTOTUNE_CACHE_PATH = str(flex_cache)
    return torch, natten, inference


def assert_memory(resources, args):
    if resources['free_physical_vram_gib'] < args.min_free_vram_gib:
        raise RuntimeError('Insufficient free physical VRAM; no inference started and no applications closed.')
    if resources['available_ram_gib'] < args.min_free_ram_gib:
        raise RuntimeError('Insufficient free system RAM; no inference started and no applications closed.')


def install_stage_logging(inference, torch, record):
    """Observe existing calls/metadata only; no tensor copies, casts or CUDA sync."""
    restorations = []
    wrapped_samplers = set()

    def tensor_metadata(value):
        if value is None:
            return None
        data = getattr(value, 'feats', value)
        result = {'shape': list(data.shape) if hasattr(data, 'shape') else None,
                  'dtype': str(data.dtype) if hasattr(data, 'dtype') else None,
                  'device': str(data.device) if hasattr(data, 'device') else None}
        coords = getattr(value, 'coords', None)
        if coords is not None:
            result.update(sparse_token_count=int(coords.shape[0]), coordinates_shape=list(coords.shape))
        return result

    def emit(stage, event, started=None, **details):
        row = {'stage': stage, 'event': event, 'utc': timestamp(), **details}
        if started is not None:
            row['wall_seconds_without_extra_cuda_sync'] = round(time.monotonic()-started, 4)
        try:
            import psutil
            memory = psutil.Process().memory_info()
            row['process_memory'] = {'rss_gib': memory.rss/2**30, 'vms_gib': memory.vms/2**30}
            row['resources'] = resource_snapshot()
            if torch.cuda.is_initialized():
                row['torch_memory'] = {
                    'allocated_gib': torch.cuda.memory_allocated()/2**30,
                    'reserved_gib': torch.cuda.memory_reserved()/2**30,
                    'peak_allocated_gib': torch.cuda.max_memory_allocated()/2**30}
        except Exception as exc:
            row['telemetry_error'] = repr(exc)
        try:
            record(row)
        except Exception as exc:
            # Diagnostics must not interrupt a successful numerical operation.
            print('PIXAL_STAGE_LOG_WARNING ' + repr(exc), flush=True)

    def wrap(owner, name, stage, is_sampler=False):
        original = getattr(owner, name)
        @functools.wraps(original)
        def observed(*args, **kwargs):
            label = str(kwargs.get('tqdm_desc', stage)) if is_sampler else stage
            details = {}
            if is_sampler:
                noise = args[1] if len(args)>1 else kwargs.get('noise')
                details['input_tensor'] = tensor_metadata(noise)
                details['steps'] = kwargs.get('steps')
                details['guidance_strength'] = kwargs.get('guidance_strength')
            emit(label, 'start', **details)
            started = time.monotonic()
            try:
                result = original(*args, **kwargs)
            except BaseException as exc:
                emit(label, 'failed', started, error=repr(exc))
                raise
            emit(label, 'end', started)
            return result
        setattr(owner, name, observed)
        restorations.append((owner, name, original))

    original_init = inference.init_pipeline
    @functools.wraps(original_init)
    def observed_init(*args, **kwargs):
        emit('pipeline_load', 'start')
        started = time.monotonic()
        pipeline = original_init(*args, **kwargs)
        emit('pipeline_load', 'end', started)
        for name in ('sparse_structure_sampler', 'shape_slat_sampler', 'tex_slat_sampler'):
            sampler = getattr(pipeline, name)
            if id(sampler) not in wrapped_samplers:
                wrapped_samplers.add(id(sampler))
                wrap(sampler, 'sample', name, is_sampler=True)
        for name in ('get_proj_cond_ss', 'get_proj_cond_shape', 'decode_latent'):
            if hasattr(pipeline, name):
                wrap(pipeline, name, name)
        return pipeline
    inference.init_pipeline = observed_init
    restorations.append((inference, 'init_pipeline', original_init))
    wrap(inference.o_voxel.postprocess, 'to_glb', 'glb_material_and_mesh_export')

    def restore():
        for owner, name, original in reversed(restorations):
            setattr(owner, name, original)
        restorations.clear()
    return restore


def run_part(part, args):
    report = dict(part, status='bootstrapping', started_utc=timestamp(), generation_started=False,
                  local_inference_only=True, resolution=args.resolution, seed=args.seed,
                  low_vram=True, strict_naf=True, texture_size=4096,
                  sampler_steps={'ss': 12, 'shape': 12, 'tex': 12},
                  native_checkpoint_dtypes_preserved=True, camera_fov_radians=args.fov,
                  input_method='one isolated-part RGBA image; no exact multiview reconstruction claimed',
                  source_adapter=str(SHARED / 'tools/run_pixal_local.py'),
                  source_adapter_sha256=sha(SHARED / 'tools/run_pixal_local.py'),
                  cache_directory=str(CACHE), shared_files_write_protected=True,
                  rig_or_animation_added=False)
    path = Path(part['report'])
    stage_path = path.with_suffix('.stages.jsonl')
    if stage_path.exists():
        raise FileExistsError('Preserving prior stage telemetry: ' + str(stage_path))
    report['stage_log'] = str(stage_path)
    report['stage_telemetry_scope'] = 'Boundary timing and tensor metadata only; no extra CUDA synchronization or numeric changes.'
    path.parent.mkdir(parents=True, exist_ok=True)
    Path(part['output']).parent.mkdir(parents=True, exist_ok=True)
    def save():
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    save()
    start, torch = time.monotonic(), None
    try:
        sys.path.insert(0, str(SHARED / 'tools'))
        from local_gpu_lock import LocalGpuLock
        # Same protocol and fixed path as the character laboratory. A busy lock
        # fails before importing Torch/loading models; it never closes another job.
        with LocalGpuLock('monopoly-harbor-pixal-20261023') as gpu_lock:
            report['gpu_lock'] = dict(gpu_lock.owner_info)
            save()
            assert_memory(resource_snapshot(), args)
            torch, natten, inference = isolated_bootstrap()
            resources = resource_snapshot()
            assert_memory(resources, args)
            cuda_free, cuda_total = torch.cuda.mem_get_info()
            if cuda_free / 2**30 < args.min_free_vram_gib:
                raise RuntimeError('CUDA available memory is below the requested startup guard.')
            torch.cuda.reset_peak_memory_stats()
            report.update(status='running', generation_started=True, resources_before=resources,
                          torch=torch.__version__, cuda=torch.version.cuda, natten=natten.__version__,
                          cuda_free_gib=cuda_free / 2**30, cuda_total_gib=cuda_total / 2**30)
            save()
            def record_stage(row):
                with stage_path.open('a', encoding='utf-8') as handle:
                    handle.write(json.dumps(row, ensure_ascii=False)+'\n')
                print('PIXAL_STAGE '+json.dumps(row, ensure_ascii=False), flush=True)
            restore_logging = install_stage_logging(inference, torch, record_stage)
            try:
                inference.run_inference(image_path=part['input'], output_path=part['output'],
                                        model_path=str(EXP / 'models/Pixal3D'), seed=args.seed,
                                        manual_fov=args.fov, low_vram=True, resolution=args.resolution)
            finally:
                restore_logging()
            output = Path(part['output'])
            if not output.is_file() or output.stat().st_size < 20:
                raise RuntimeError('Pixal3D returned without a usable GLB output.')
            report.update(status='generated_unrigged_part_candidate', output_bytes=output.stat().st_size,
                          output_sha256=sha(output), input_unchanged=sha(part['input']) == part['input_sha256'])
        report['gpu_lock']['status'] = 'released'
    except Exception as exc:
        busy = type(exc).__name__ == 'LocalGpuBusyError'
        report.update(status='gpu_busy' if busy else 'failed', error=repr(exc))
        if busy:
            report['gpu_lock_owner_at_failure'] = getattr(exc, 'owner', None)
        raise
    finally:
        report.update(seconds=round(time.monotonic() - start, 2), finished_utc=timestamp())
        if report.get('gpu_lock'):
            report['gpu_lock'].update(status='released', context_finished_utc=timestamp())
        if torch is not None and torch.cuda.is_initialized():
            report['peak_allocated_gib'] = round(torch.cuda.max_memory_allocated() / 2**30, 3)
        save()
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='CPU-only checks; the default.')
    mode.add_argument('--run', action='store_true', help='Explicitly start local GPU inference.')
    parser.add_argument('--asset-id')
    parser.add_argument('--image', type=Path)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--queue', type=Path, help='JSON array or {"assets": [{"asset_id": ..., "image": ...}]}')
    parser.add_argument('--resolution', type=int, choices=[1024, 1536], default=1024)
    parser.add_argument('--seed', type=int, default=9247)
    parser.add_argument('--fov', type=float, default=0.3490658504, help='Horizontal FOV radians; default 20 degrees.')
    parser.add_argument('--min-free-vram-gib', type=float, default=12.0,
                        help='Startup guard only; successful 1024 trial peaked at 14.23 GiB allocated.')
    parser.add_argument('--min-free-ram-gib', type=float, default=12.0)
    args = parser.parse_args()
    if not 0 < args.fov < 3.141592653589793:
        parser.error('--fov must lie between 0 and pi radians.')
    if args.queue:
        if args.asset_id or args.image:
            parser.error('--queue cannot be combined with --asset-id or --image.')
        data = json.loads(args.queue.read_text('utf-8'))
        rows = data['assets'] if isinstance(data, dict) else data
        if not isinstance(rows, list) or not rows:
            parser.error('The queue must contain at least one asset.')
    else:
        if not args.asset_id or not args.image:
            parser.error('Provide --asset-id and --image, or --queue.')
        rows = [{'asset_id': args.asset_id, 'image': str(args.image)}]
    protect_shared_files()
    weights = inspect_weights()
    parts = [inspect_part(row, args) for row in rows]
    if len({x['report'] for x in parts}) != len(parts):
        raise ValueError('Every queued part must have a distinct asset_id.')
    resources = resource_snapshot()
    preflight = {'status': 'checked_without_gpu_initialization', 'checked_utc': timestamp(),
                 'generation_started': False, 'weights': weights, 'resources': resources, 'parts': parts,
                 'configuration': {'resolution': args.resolution, 'seed': args.seed, 'low_vram': True,
                                   'strict_naf': True, 'texture_size': 4096, 'sampler_steps_each': 12,
                                   'min_free_vram_guard_gib': args.min_free_vram_gib,
                                   'min_free_ram_guard_gib': args.min_free_ram_gib},
                 'notes': ['No precision, view-count or texture-size downgrade occurs on failure.',
                           'Native 1536 is available but has not been proven to fit this GPU.',
                           'Queue mode starts a fresh sequential process per part, releasing model memory.',
                           'Each --run acquires the shared local_gpu_lock.py protocol before bootstrap; busy means stop, not takeover.']}
    REPORTS.mkdir(parents=True, exist_ok=True)
    preflight_path = REPORTS / ('preflight-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    preflight_path.write_text(json.dumps(preflight, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(preflight, ensure_ascii=False, indent=2), flush=True)
    if not args.run:
        return
    if not weights['ready']:
        raise RuntimeError('Required local weights are incomplete; inference did not start.')
    assert_memory(resources, args)
    if args.queue:
        for part in parts:
            command = [sys.executable, '-B', '-u', str(Path(__file__).resolve()), '--run',
                       '--asset-id', part['asset_id'], '--image', part['input'],
                       '--output-dir', str(Path(part['output']).parent),
                       '--resolution', str(args.resolution), '--seed', str(args.seed),
                       '--fov', str(args.fov), '--min-free-vram-gib', str(args.min_free_vram_gib),
                       '--min-free-ram-gib', str(args.min_free_ram_gib)]
            subprocess.run(command, check=True)
    else:
        run_part(parts[0], args)


if __name__ == '__main__':
    main()
