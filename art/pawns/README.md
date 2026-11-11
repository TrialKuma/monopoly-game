# 棋子

两枚棋子：玩家是戴圆顶礼帽、举着金钥匙、提公文包的小房东（青绿），对手是戴报童帽、叉腰夹着蓝图卷的开发商（砖红）。配色跟顶栏里两边的颜色一致。

## 文件

- `build_pawns.py`：Blender Python 脚本，全部形状用代码生成，没有手工雕刻的部分。
- `pawns.blend`：脚本存下来的可编辑源文件，两枚棋子并排放着。
- `preview-front.png`、`preview-game.png`、`preview-back.png`：Cycles 渲染的三张预览，分别是正面、接近游戏镜头的俯角、背面。
- `../../assets/models/pawns/pawns.glb`：游戏读的文件，里面两个节点 `pawn_human` 和 `pawn_ai`，都在原点。

## 重新生成

在仓库根目录运行（Blender 5.2）：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -t 6 --python art/pawns/build_pawns.py -- --render
```

去掉 `-- --render` 就只导出模型、不渲染预览。渲染用 CPU，三张图合计约 40 秒。

改完模型以后，把 `scene-pawns.js` 里 `FILE` 的版本号、`scene.js` 里引用 `scene-pawns.js` 的版本号、`index.html` 里 `scene.js` 的版本号各升一次，浏览器才会取新文件。

## 约定

- 尺寸：底座半径 0.192，总高约 0.61（场景单位，一格是 1.45）。底面在 y = 0，脸朝 GLB 的 +Z。
- 颜色存在顶点色里，没有贴图。两个材质：`Pawn paint`（哑光）和 `Pawn brass`（金属），颜色都取自顶点色。
- 头向后仰 9 度，因为游戏镜头是从斜上方看的，不仰的话帽檐会把脸挡掉。
- 每枚约 9100 到 9600 个三角形，GLB 约 500 KB。

## 游戏里怎么用

`scene-pawns.js` 加载一次 GLB，全局共用。`scene.js` 的 `makePawn` 仍然先摆出原来的圆柱加球，`dressPawns` 在模型到了以后把它换掉；模型加载失败就保留圆柱加球。

棋子被建筑挡住时，建筑上会画出一个带奶油色描边的纯色剪影。做法是在画棋子本体之前，先用同样的几何体多画两遍（一遍描边、一遍填色），这两遍只在"前面已经有东西挡着"的像素上落笔；随后画本体，把看得见的部分盖回去。代码和说明在 `scene-pawns.js`。
