# 五地区 Blender 建筑

本轮以认可的京都住宅样板为精度标准，使用项目既有三视图重建全部建筑。没有新生图、Pixal3D 或其他 AI 推理调用。

## 范围与文件

- 5 张地图 × 29 个可玩建筑 = 145 件：住宅、商店、酒店、高级住宅、3 类大地块的各三级，以及 8 种公共设施。
- 灯塔、风车 2 件；转盘与工坊吊具为独立活动部件。
- 每张地图 5 个外围派生建筑，共 25 件；145 张游戏 UI 图来自实际导出模型。
- `reference-catalog.json` 冻结原有正、侧、背三视图的路径与 SHA；`regions/` 和 `design/` 保存建模实现与地域设计说明。
- `models/<map>/<asset>/source.blend` 是每件真实可编辑源；同目录 GLB、ORM 图和 `model.json` 对应导出成品。不同定向修订批次保留当时的脚本哈希，没有把旧成品的哈希改成最新源码哈希。
- `renders/` 保存从导出 GLB 重新载入后渲染的 PNG；对应 JSON 绑定实际 GLB 与 PNG 字节，不能用旧图代替新模型。
- `far/` 保存外围派生资产；`reports/storage-compression/` 保存逐件存储压缩误差。
- `release.json` 在完整发布完成后写入，列出全部正式包、预览图、可编辑源与来源。浏览器画面核验另见 `reports/portrait-review.md`。

## 制作原则

法式石材与板岩屋顶、京都木构和瓦片、纽约红砖与铜绿装饰艺术、海港拱廊与蓝色筒瓦、阿尔卑斯木梁与红瓦分别建模。一级小建筑同样具有门窗凹口、窗格、瓦面、基座和装饰，没有仅为大型地标提高精度。

近景通过删除遮挡结构、极细零件的微倒角和不可见底面控制开销，没有整体减面。玻璃、实体和植物/水面合并为少量材质；颜色保存在顶点，局部遮蔽与粗糙度/金属度使用 ORM 图，不烘焙方向光。京都 `villa_2` 保留认可样板的原几何。

`placement-corrections.json` 仅对个别低级建筑作整体等比缩放，让参考中不同轮廓的升级在棋盘上有明确增长，不拉伸某一轴。外围模型才进行受控简化，并验证轮廓边界和对应近景来源。

存储压缩保留位置、索引拓扑和 ORM 图字节，法线、UV 和颜色使用有误差上限的标准 glTF 量化；这不是无损压缩。京都样板保留 16 位顶点色。所有压缩后的模型重新渲染并更新预览绑定。

## 定向重建

在仓库根目录执行。所有 Blender 步骤使用 CPU，不调用生成服务。

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blender -b -t 3 --python art/blender-city/build.py -- --region compact --assets villa_1
node art/blender-city/compress_storage.mjs --apply --map=compact --color8
& $blender -b -t 3 --python art/blender-city/build.py -- --region compact --assets villa_1 --render-only
& $blender -b -t 3 --python art/blender-city/make_far.py -- --map compact --skip-existing
node art/blender-city/publish.mjs --check
node art/blender-city/publish.mjs --publish
node tests/check-blender-city.mjs
```

整图重建省略 `--assets`；重建后按同样范围重渲染。已压缩且来源未变的资产不会重复压缩，远景也只更新来源已变化的项目。正式发布必须五图全部通过预检，阶段检查可用 `publish.mjs --map=compact`，只写暂存包。

验收分别检查真实几何/来源、渲染画面和运行时预算。竖屏浏览器模拟不等于手机硬件帧率实测；“published”也不代表用户已经通过美术验收。

三级轮廓改版的同尺度对照页由 `node art/blender-city/review-level3.mjs` 生成，打开 `art/blender-city/level3-review.html`。每对图片根据导出渲染使用的正交范围恢复相同比例，避免分别填满画框掩盖真实体量差异。三级须保持至少 45% 的二级高度增长，并逐图检查塔冠、主副楼、屋顶与庭院轮廓；高度检查不能替代美术验收。

温泉建模在根对象写 `thermalPools`：作者坐标 `[x, y, z, 水面宽, 水面深]`，位置取实际水面中心。`fit()` 随建筑统一缩放、居中并转换为 glTF 的 `[x, 高度, -y, 宽, 深]`，发布器校验并保留。运行时以这些水面生成少量蒸汽，不从楼体包围盒猜位置。`check-thermal-baths.mjs` 对实际浴池做屋顶遮挡射线检查，`check-thermal-lifecycle.mjs` 检查升级和切图释放、隐藏、暂停及减少动态。
