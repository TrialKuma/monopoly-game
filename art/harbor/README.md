# 两张新地图的本机 AI 资产

这批资产使用本机 TencentARC/Pixal3D 实际推理。风格按本轮最终要求收敛为手机上易读的玩具建筑：相较原有模型适度增加层次，约多 50% 的复杂度；使用粗大轮廓、少量大窗和屋顶、柔和倒角，避免密集浮雕、花纹及细碎装饰。

最终流程：本轮 ImageGen 透明参考 → 原生精度 Pixal3D 1024 级联 → 一次保守减面、保留完整 AI 建筑及其生成 UV 与材质 → 新增独立铜制信号环/檐下挂灯 → 动画 GLB → 法线与 UV 存储量化 → 重新导入导出件渲染与验收。原始生成件保持不变。

建筑主体由真实神经推理生成。最终保留完整静态的原神经水轮、风车叶片和墙面，不在融合网格上强行拆动件；早期的切割和补面试验未用于交付。灯塔新增独立铜制信号环，温泉屋新增檐下挂灯轻摆，这些可动小件由 Blender 单独建模，来源在处理报告中记录。不能将整件 GLB 描述成 AI 直接生成的动画，也不宣称原水轮/风车叶片已经转动。

海港灯塔使用暖象牙白、蓝绿屋顶与克制的金色，搭配玻璃圆顶和侧面水轮；山间风车温泉使用奶油墙、木梁、红陶屋顶、四片宽叶风车和温泉池。两张参考的原始 ImageGen 提示词、透明设置和生成时间完整保存在 `references/promptset.json`。

## 文件位置

- `references/lighthouse-stylized.png`：海港灯塔的当前输入。
- `references/alpine-windmill-stylized.png`：山间风车温泉的当前输入。
- `source/`：未修改的 Pixal 原始输出，只在本机保留，不纳入 Git。
- `reports/`：输入/输出 SHA-256、推理摘要和整理报告。完整运行日志与权重装载记录只在本机保留。
- `tools/`：本项目推理入口及 Blender 整理脚本。
- `../../assets/models/harbor/`：游戏加载的优化 GLB。
- `renders/`：重新导入最终 GLB 后生成的真实模型图。
- `blender/`：可继续编辑的 Blender 中间文件，只在本机保留。

未采用的早期方向、原始大模型、Blender 中间文件、诊断图、编译缓存与大份日志由本目录 `.gitignore` 排除；游戏 GLB、最终参考、提示词、脚本和小份成功报告纳入版本管理。

## 现有环境

Python 位于 `C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/source/experimental/pixal-env/Scripts/python.exe`。共享的 Pixal3D、DINOv3、NAF 权重和代码保持只读。本项目只写自己的缓存、报告和输出，使用现有 `C:/Users/A/.codex/shared-resource-locks/pixal-gpu0.lock` 协议，同一时刻只有一项协作 GPU 推理。

实测环境为 RTX 5070 Ti 16 GiB、31.15 GiB 系统内存，PyTorch 2.10.0+cu130、CUDA 13.0、natten 0.21.6；后处理使用 Blender 5.2。灯塔推理用时 261.45 秒、峰值 GPU 分配 14.229 GiB；风车用时 232.81 秒、峰值 14.227 GiB。这里记录真实已完成的推理，不把启动脚本或可用环境当作模型完成证据。

`tools/run_pixal_parts_streaming.py` 复用 grande-loop 已成功运行的 streaming、parameter-empty 和 single-use lifetime 实现；来源与哈希见 `reports/runner-provenance.json`。原生 checkpoint dtype、1024 分辨率、12/12/12 步和 4096 原始纹理不变。游戏整理阶段才将纹理降至 1024 并减面。

本轮环境导入实测约占 0.77 GiB RAM，因此调用时使用显式 `--min-free-ram-gib 11.0` 启动门槛；不修改全局参数或模型精度，不关闭用户程序。运行前仍检查物理显存、内存及共享锁。启动门槛不代表峰值内存。

## 重现

下面是本轮成功生成使用的实际命令（项目根目录执行）：

```powershell
& 'C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/source/experimental/pixal-env/Scripts/python.exe' -B -u art/harbor/tools/run_pixal_parts_streaming.py --run --asset-id lighthouse-v01 --image art/harbor/references/lighthouse-stylized.png --loader-evidence art/harbor/reports/lighthouse/loader.jsonl --report-dir art/harbor/reports/lighthouse --parameter-empty --single-use-lifetime --min-free-ram-gib 11.0
& 'C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/source/experimental/pixal-env/Scripts/python.exe' -B -u art/harbor/tools/run_pixal_parts_streaming.py --run --asset-id alpine-windmill-v01 --image art/harbor/references/alpine-windmill-stylized.png --loader-evidence art/harbor/reports/alpine/loader.jsonl --report-dir art/harbor/reports/alpine --parameter-empty --single-use-lifetime --min-free-ram-gib 11.0
```

再次生成时使用新的 asset-id 和报告目录保留旧输出，不覆盖原始生成件。Blender 整理需要传入已成功的推理报告及参考图，脚本验证来源和哈希后才处理。单图不可见面由模型推断，不宣称精确多视图重建。动画属于后续对真实部件的人工处理，不宣称 Pixal 直接生成动画。

| 资产 | 输入 SHA-256 | 原始输出 SHA-256 |
| --- | --- | --- |
| 灯塔 | `ac390b75456e39da20b904a1c585efa554b9633ab29a15de126a68ccd5d22d21` | `8831cd805558f228343812840f8b14c03572092bb7c10595ec45dabcb180d705` |
| 风车 | `7a8f4f5481f0d531899ed212b691fee2b800651ceb5b0133488f05308d2116a3` | `88fba30f0f3a2473a90506d3a72ed63c09d21ea0148222698e8a3177efb82f17` |

成功推理摘要位于 `reports/lighthouse/lighthouse-v01-pixal-1024-9247.json` 与 `reports/alpine/alpine-windmill-v01-pixal-1024-9247.json`。

## 移动端整理约束

原件渲染确认轮廓及贴图完整。强减面和本轮试验的体素重拓扑会破坏表面，因此最终采用约 150,000 三角面的保守方案，保留原生成 UV 和纹理。为保留完整屋顶、窗台和台阶，允许单件最高 200,000 三角面、8 MiB；游戏每张新地图只加载其中一座 AI 地标。失败的重拓扑/重烘焙属于本机诊断，不是最终资产流程。

`tools/quantize_gltf_attributes.py` 保持位置、索引和贴图数据不变，仅将法线存为归一化字节、UV 存为归一化 16 位整数。游戏现有 GLTFLoader 支持 `KHR_mesh_quantization`，不引入外部解码器。每件整理报告记录输出哈希、角度与 UV 误差；它不修改神经推理精度。

## 最终交付与验证

| 游戏文件 | 三角面 | 字节 / MiB | 动画节点与片段 |
| --- | ---: | ---: | --- |
| `harbor_lighthouse.glb` | 151,614 | 6,409,660 / 6.11 | `harbor_lighthouse_beacon_signal` / `harbor_beacon_signal_idle`，12 秒转动 |
| `alpine_windmill.glb` | 150,082 | 6,215,268 / 5.93 | `alpine_hanging_lantern` / `alpine_lantern_sway`，8 秒、±7°轻摆 |

灯塔 glTF 边界尺寸为 3.000 × 2.811 × 2.905，温泉屋为 2.915 × 2.448 × 3.000（X/Y/Z，Y 向上，地面 Y=0）。运行时按地图中心空地统一缩放。两件纹理均为 1024；法线量化最大角误差低于 0.38°，UV 误差低于 0.008 个纹理像素。

- 灯塔最终 SHA-256：`95383db2c02d5e1af943ff1886081a486c3ce6663d5c4278a54e0c49d584038a`。
- 温泉屋最终 SHA-256：`cdeffde133a40f64584376649393869a9f6c03733cedfab1cedeaa3e1e306bdc`。

`reports/harbor_lighthouse-processing.json` 与 `reports/alpine_windmill-processing.json` 均为 `ready_for_runtime`，包含实际最终文件哈希、字节数、神经推理来源、动画来源、重新导入结果和已通过的视觉检查。`renders/` 保留最终四视图、灯塔信号环转动近景、挂灯相反摆动方向的真实模型渲染。原水轮与原风车叶片静止；新小件运动不移动建筑、墙面、支架和阳台。

静态整理使用 `tools/process_generated_model.py` 的 150,000 面、1024 纹理、180° yaw、JPEG 与 `--quantize` 配置；保留其静态 `.blend` 和处理报告后，分别使用 `tools/animate_lighthouse_beacon.py` 与 `tools/animate_alpine_windmill.py --config art/harbor/animation/alpine_windmill.json` 添加独立动画。静态副本和大原件仅本机保留。

`node tests/check-ai-landmarks.mjs` 已通过两件资产契约：GLB 结构、嵌入纹理、UV 覆盖、移动端预算、真实动画采样、来源哈希链、最终文件哈希与报告状态。游戏内移动端/桌面加载、实际 AnimationMixer 运动、暂停与减少动态、场景开关及迟到加载清理由集成检查覆盖。
