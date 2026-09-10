# 街区微缩模型

这套模型使用 Blender 5.2 原生网格与材质制作，没有引用外部素材或贴图。

- `../assets/models/city-kit.blend`：可编辑的完整模型库，含陈列底座、正交相机和摄影棚灯光。
- `../assets/models/city-kit.glb`：游戏使用的轻量资产，约 2.9 MB，不需要外部贴图或 Draco 解码器。
- `../assets/models/city-kit-manifest.json`：每个模型的实际尺寸。
- `build_city_kit.py`：完整、可重复执行的 Blender 建模源代码。

模型包含住宅、店铺、酒店、办公楼的 1–3 级建筑，以及市政府、银行、城建局、翻牌驿站、树木、路灯、喷泉、空地产待售标志，共 20 个根节点。建筑有统一的奶油灰泥、陶瓦、青绿玻璃和黄铜材质；住宅有百叶窗和烟囱，店铺有条纹遮阳棚，酒店有阳台和顶楼泳池，办公楼有楼层带和金属窗框。

在 Blender 中原点位于地面中心，Z 轴向上、正面朝 -Y。标准 glTF 导出后 Y 轴向上、正面朝 +Z。根节点在模型库中排成陈列网格，游戏克隆根节点后应重置其位置；几何子节点已经位于模型自身原点。不要把预览陈列底座作为游戏地块导出。

重新生成（PowerShell）：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python 'art/build_city_kit.py'
```

默认把 `city-kit-preview.png` 保存到本目录。可用环境变量 `CITY_PREVIEW_DIR` 指定其他预览输出目录。

## 第二轮地标与特殊建筑

用户选择“保留造型，但更卡通一些”后，新增两套独立资产。方向说明与 AI 概念图见 `BUILDING_DIRECTION.md`；概念图不属于游戏模型，也不是 Blender 实际渲染。

- `build_landmarks.py` → `landmarks.blend`、`landmarks.glb`、`landmarks-manifest.json`。摩天楼、金融中心、温泉庄园各三级，共 9 个根节点。摩天楼三级真实高度为 1.7 / 2.8 / 4.0，金融中心为 1.3 / 2.0 / 2.8，温泉为 0.7 / 1.0 / 1.35。
- `build_specials.py` → `specials.blend`、`specials.glb`、`specials-manifest.json`。包括市政府、银行金库、城建局、翻牌亭、机会转盘、传送门、冲刺门和岔路枢纽，共 8 个根节点。

新模型的根节点都位于地面中心，沿用 Z 向上、正面 -Y 的 Blender 坐标约定。游戏直接保留导出的真实尺度，不按等级重新限高。特殊建筑占地不超过 1.05 × 1.05；双格地标以 2.18 × 0.88 为基准，温泉庭院单独扩到约 2.62 × 0.95。

在项目根目录运行：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python 'art/build_landmarks.py'
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python 'art/build_specials.py'
```

模型使用原生网格与 PBR 材质，无外部贴图或压缩解码器依赖。`scene.js` 按地图和具体地块选择模型；建筑近看与棋盘共用同一份模型资产。
