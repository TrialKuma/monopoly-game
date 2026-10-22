"""Opt-in single-part entry point with bounded checkpoint source mappings.

All original input/resource/lock/sampling/export checks still run unchanged.
"""
from pathlib import Path
import argparse
import sys
import run_pixal_parts as original
from pixal_streaming_loader import install


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--loader-evidence', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--parameter-empty', action='store_true',
                        help='Opt-in validated parameter-only empty construction; preserves native target dtype.')
    parser.add_argument('--single-use-lifetime', action='store_true',
                        help='Retire only completed SS/LR models, then remaining models after whole run.')
    options, rest = parser.parse_known_args()
    if '--queue' in rest:
        raise ValueError('This opt-in entry point supports one isolated part per process.')
    options.loader_evidence = original.local_path(options.loader_evidence)
    options.report_dir = original.local_path(options.report_dir)
    original.REPORTS = options.report_dir
    bootstrap = original.isolated_bootstrap

    def with_loader():
        torch, natten, inference = bootstrap()
        install(original.EXP / 'models/Pixal3D', options.loader_evidence,
                parameter_empty=options.parameter_empty)
        if options.single_use_lifetime:
            from pixal_single_use_lifetime import wrap_init
            wrap_init(inference, options.loader_evidence.with_name('lifetime.jsonl'))
        return torch, natten, inference

    original.isolated_bootstrap = with_loader
    sys.argv = [sys.argv[0], *rest]
    original.main()


if __name__ == '__main__':
    main()
