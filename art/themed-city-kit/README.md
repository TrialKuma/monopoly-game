# Native multiview regional houses

These assets supplement the authored regional building kit with one sparse feature residence per region. They are actual local Pixal3D multiview reconstructions, not procedural buildings labeled as AI output.

## Source and camera boundary

Root design boards and three independent RGBA views are retained under `art/regions/references`. `prepare_multiview_inputs.py` makes byte-identical copies of those single views. It does not crop, resize, mask, or modify pixels. Each immutable input bundle contains source hashes and framing measurements.

The three cameras use the official example orbit: front / right / back at 0 / 90 / 180 degrees and 20-degree horizontal FOV. They are **assumed cameras, not measured calibration**. The pictures are design references; slight reconstructed asymmetry is expected and requires visual review.

## Actual local inference

`tools/run_pixal_multiview.py` invokes the native `inference_mv.py` entry point and `Pixal3DMVImageTo3DPipeline.run_mv`, loading `pipeline_mv.json` and all four native `_mv` flow weights. Resolution 1024, seed 9247, native 12 / 12 / 12 sampling steps, average view fusion, original low-VRAM behavior, and original constructor checkpoint dtypes are preserved. No single-view montage substitute is used.

The streaming loader verifies every loaded tensor. A run_mv-aware single-use adapter releases completed sparse-structure and low-resolution stages. The optional projection-cache adapter calls only `torch.cuda.empty_cache()` after a complete native conditioner return; it preserves the returned object and all live tensor values. Each run snapshots the exact runner and adapter sources.

The shared local GPU lock serializes inference. CPU Blender previews use at most four threads and start only with sufficient available RAM. No user applications are closed. Native MV transient allocation reaches about 16.37 GiB on the 15.92 GiB RTX 5070 Ti; Windows WDDM shared memory allows completion. This is **not** an exclusive-dedicated-16-GB fit claim.

## Export and review

`tools/process_multiview_house.py` preserves the raw GLB, welds only coincident source vertices on a derivative, makes one conservative reduction from the raw source, retains generated UVs/materials, and fits the building uniformly within three units in height and footprint. The final asset is Y-up with its front facing +Z. Generated textures are retained at 2048 pixels; the dense source atlas visibly bleeds at 1024 on these residences. NORMAL and UV accessors are quantized with `KHR_mesh_quantization`, while positions and textures are preserved by that step.

The reviewed target is about 180,000 triangles. Early 90,000 / 120,000 reductions visibly damaged neural surfaces and are not approved outputs. These assets are intended for one or two sparse residences per map, rather than repeated across every lot. Modular upgrade floors and most surrounding buildings use the separately authored low-cost regional kit.

Each processing report remains pending until the **actual exported GLB** has been reimported and rendered from front, right, back, and left. Only reports with `status: ready_for_runtime` and `visual_review.status: passed` authorize integration. File existence alone is not approval. `tools/verify_multiview_house.py` checks actual hashes, embedded textures, source/runner provenance, bounds, static roots, and the four reviewed views.

Classic includes a documented local repair to two original neural defects at the front stone foundation and outer window corner. It uses 856 additional faces with neighboring source UV samples. It does not replace the building, cover it with a box, globally close openings, or modify the raw source. Fine neural foliage and stone-edge irregularities remain visible at close inspection.

Compact includes a 3,380-face local bridge across an original narrow rear-corner cavity, with neighboring plaster, timber and stone UV samples. Harbor includes 1,266 local faces at the original lantern-wall cavities and rear lower-window seam. Existing doors, window openings, roofs, balcony structures and source geometry remain intact. Small neural texture edges and chipped details remain documented in each visual review. Harbor's assumed-camera reconstruction contains two chimney stacks; it is not presented as an exact architectural survey.

The final `reports/approved-houses.json` manifest is produced by `tools/publish_verified_manifest.py` only after all five files pass their actual GLB and provenance checks. It records individual input images, camera assumptions, raw and final hashes, bounds, 2048 texture dimensions, local repairs, render views, measured native inference time and CUDA allocation. The complete AI body is used for the sparse feature residence; inserting upgrade floors into a fused neural roof is not claimed to preserve an unchanged AI body.

Raw neural outputs, caches, Blender intermediates and raw diagnostic renders remain local. Final GLBs live in `assets/models/regions-ai`; small provenance reports, exact tool snapshots and approved four-view renders stay beside this document.
