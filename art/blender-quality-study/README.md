# 京都町屋结构重建样板

仅用于比较京都 `compact/villa_2` 的美术制作方式，**尚未由用户验收，未替换正式游戏资产**。本轮没有新增生图或 3D 模型推理。

## 查看

本地预览：`http://127.0.0.1:8876/art/blender-quality-study/comparison.html`。

- 左：原有正面、右侧、背面设计图。
- 中：当前游戏使用的 Pixal3D 处理版。
- 右：按同一设计重建的 Blender 样板，直接加载导出的 GLB。
- 两个模型均等比例统一到高度 3，保留各自宽深比例；镜头、方向光、环境光和实时阴影一致。离线图片不参与网页模型显示。

`kyoto-villa2/` 保存可编辑 `.blend`、构建脚本、`.glb`、导出元数据和重新导入 GLB 后的四面渲染。窗格、梁柱、瓦片和栏杆是实体构件；颜色保持干净，局部遮蔽仅用于表现构件接触处的深浅。

这是一栋样板，不代表整套地图已经完成。参考图的绘制光影、木纹、植物及部分轮廓仍有差别，侧檐在掠射角仍有细微颗粒；没有以面数、文件大小或导出成功代替美术验收。尚未进行完整地图的手机性能验证。

## 对当前 AI 版的来源核查

京都模型确由本机 Pixal3D 原生多视图推理生成，不是 Hunyuan 服务。可核对以下原始记录，未对它们做修改：

- `art/themed-city-kit/reports/compact-house-mv-v01/compact-house-mv-v01-pixal-mv-1024-9247.json`：`Pixal3DMVImageTo3DPipeline.run_mv`、1024、low-VRAM、12/12/12 步、三视图 average 融合、4K 原始纹理；相机标明 `assumed_standard_orbit_not_measured`。
- 同目录 `runner-source.py`：实际执行的原生推理入口。
- `art/full-ai-city/experiments/fidelity-20261024/kyoto-clean/compact/villa_2.json`：原模 968,825 面，发布版 44,948 面；记录原模和正式文件的完整哈希。
- `art/full-ai-city/experiments/fidelity-20261024/kyoto-fine45/renders/compact/villa_2/raw-front.png` 与 `kyoto-clean/renders/compact/villa_2/lod-front.png`：原模已偏离设计，后处理后细格又出现额外变形。尚不能精确分摊重网格、减面、重贴图各自造成的损失。

山地 `alpine-tower1-a003-single-front-23421/comparison.html` 展示的是三种未发布的 Pixal3D 原模实验；其中缺墙不能归因于后续移动端减面。没有同输入同预算的 Hunyuan 对照，也没有受控实验能够证明假定相机或 Windows 适配是生成缺陷的直接原因。

Pixal3D 官方说明其改进版本基于 TRELLIS.2：<https://github.com/TencentARC/Pixal3D>。这是模型来源说明，不构成本项目已达到官方演示质量的证据。
