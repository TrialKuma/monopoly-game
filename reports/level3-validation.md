# 三级建筑与温泉交付记录

日期：2026-10-25。五张地图的35栋三级建筑已重新构建并接入正式游戏，另重做10栋一级、二级温泉，共45件。沿用既有三视图的地域语言和 Blender 构件标准，本轮没有新生图或 AI 建模调用。

## 实际升级幅度

按最终 `art/blender-city/models/<map>/<family>_<level>/model.json` 的 `size[1]` 计算同族三级/二级高度比，不以各自自动取景的预览图判断大小。35栋的实际范围为 **1.458–2.679倍，即增加45.8%–167.9%**；20栋普通建筑为1.458–1.762倍，15栋大地块建筑为1.576–2.679倍。主楼、侧翼、完整屋冠与浴池院落一并重构，增长不只来自尖顶。

| 地图 | 7栋三级/二级高度范围 | 大酒店 / 摩天楼 | 金融建筑 | 满级温泉 |
| --- | --- | --- | --- | --- |
| 法式 classic | 1.479–2.452倍 | 五层宽中央宫殿、低翼楼、尖顶角塔 | 巨柱主殿、八向拱窗鼓座、大穹顶 | 通高玻璃浴殿、上下叠池、双圆池 |
| 京都 compact | 1.517–2.469倍 | 厚实天守主楼、宽退台主阁、低副殿 | 四面木格栅高主殿、双破风屋冠 | 三层浴场主楼、高阁、双层露天岩池与阶梯木桥 |
| 都市 expansion | 1.458–1.905倍 | 3/4/6层中央递增体量、加宽主塔、铜绿塔冠 | 四层大厅、五层双翼、穹顶与钟面 | 高玻璃浴殿、前院双池、两侧屋顶露天池与阶梯水景 |
| 海港 harbor | 1.467–2.392倍 | 五层中央会客宫殿、低翼楼、双瞭望塔 | 高山花交易厅、连续拱廊、完整高层侧窗 | 蓝色宽穹顶浴殿、上下叠池、双圆池 |
| 雪山 alpine | 1.517–2.679倍 | 山地城堡中央厅、全景屋顶套房、观景阳台 | 四层宽钟塔、石砌角柱、低翼楼 | 三层山地浴殿、屋顶客房、层叠石池与阶梯木桥 |

京都 `compact/villa_2` 接受基准保持不变：参考样板、生产模型、渲染及游戏预览相关16个已跟踪文件均与本轮开始时的 HEAD 字节一致。原始三级图片和指标保存在 `art/blender-city/reviews/level3-before/`。

## 最终验证

以下12项检查均通过：`check-blender-city`、`check-ownership-roofs`、`check-regional-scenery-budget`、`check-thermal-baths`、`check-thermal-lifecycle`、`check-landing-clearance`、`check-functional-landmarks`、`check-roof-snow`、`check-camera-follow`、`check-building-sightlines`、`check-model-loading`、`check-atmosphere-lifecycle`。

正式包的145栋可玩建筑、2件动态地标、25件远景和145张模型绑定预览通过检查；105种产权建筑的屋顶染色、产权转移、中立恢复及资源释放通过。普通/大型建筑分别保持50k/80k三角上限；五图外围景观为300,596–409,718三角、26–68次绘制，均在既定预算内。温泉水面元数据在正式包中保留，蒸汽生成与释放通过验证。

默认镜头遮挡以最终 [level3-building-sightlines.json](level3-building-sightlines.json) 为准：390×844，覆盖三个等级、342个地块等级组合、1,368种棋子姿态、24,624条射线。头部和胸部**中心遮挡为0**；仍有**7条边缘采样射线遮挡**，涉及海港2个地块、3种姿态，没有完全遮住采样目标。此结果不等于任意手动镜头下绝无遮挡。

## 竖屏实景证据

已在应用内浏览器以390×844完成五图展示、同尺度二三级对照、京都金融二三级切换、京都满级温泉和正式游戏局部跟随镜头检查。未发现横向溢出，控制台无警告或错误。

| 地图 | 游戏竖屏 | 同尺度升级对照 |
| --- | --- | --- |
| 法式 | [实景](level3-classic-game-portrait.jpg) | [对照](level3-classic-comparison.jpg) |
| 京都 | [实景](level3-compact-game-portrait.jpg) | [对照](level3-compact-comparison.jpg) |
| 都市 | [实景](level3-expansion-game-portrait.jpg) | [对照](level3-expansion-comparison.jpg) |
| 海港 | [实景](level3-harbor-game-portrait.jpg) | [对照](level3-harbor-comparison.jpg) |
| 雪山 | [实景](level3-alpine-game-portrait.jpg) | [对照](level3-alpine-comparison.jpg) |

补充：[京都金融](level3-compact-finance-portrait.jpg)、[京都温泉](level3-compact-onsen-portrait.jpg)、[正式游戏局部跟随](level3-local-camera-portrait.jpg)。这些是桌面浏览器的竖屏视口检查，**不是手机实机帧率测试**。

“落到自己的温泉地块获得收益”本轮仅讨论了提案，没有修改经济规则。剩余审美验收以用户实际游玩后的反馈为准。
