# 产权和道具更新验收（2026-10-25）

## 实机页面检查

通过浏览器操作实际游戏，使用独立 `localhost:8876` 存档，不改用户 `127.0.0.1:8876` 仓库。

- 390×844：五张地图住宅产权配色、功能建筑、棋子与操作条。纽约平屋顶发现仅边沿变色后，补齐 39 块屋顶可见面并复验。
- 390×844：冬季屋顶积雪为白色，仍可见双方色带。
- 390×844 / 320×740：背包内容和按钮无横向溢出；卡牌目标取消后数量、使用次数不变。
- 实际翻牌三选一进入背包，没有立刻执行效果；随后可选择使用或关闭保留。
- 使用护盾后 4 张变 3 张，继续事件后其他卡显示“本回合已使用卡牌”。事件演出期间背包入口禁用。
- 正式新局没有继承演示卡；敌方行动、事件确认、回到玩家掷骰和空背包正常。
- 五图 WebGL / 页面错误日志为空。

截图位于 `reports/items-v1/`。检查使用桌面浏览器的手机尺寸模拟，不代表物理手机 GPU 帧率测试。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| `tests/card-inventory.test.cjs` | 34 项，存包、取消、条件、重复点击、会话切换、全部 12 卡效果、AI、命定骰后继续行动 |
| `tests/progression-game.test.cjs` | 15 项，入场、仓库、固定回合、退出及结算 |
| `tests/chance-presentation.test.cjs` | 19 项 |
| `tests/rest-recovery.test.cjs` | 18 项 |
| `tools/economy-check.cjs` | 26 项 |
| `tests/check-ownership-roofs.mjs` | 五图 105 个住宅 / 大地产等级版本，换主、无主、材质和资源隔离；纽约 39 块平屋顶 |
| `tests/check-functional-landmarks.mjs` | 40 栋功能结构；160 项尺寸检查、90 项资源检查、3,078 条落点射线、1,026 条手机镜头视线 |
| `tests/check-landing-clearance.mjs` | 9,234 项 |
| `tests/check-camera-follow.mjs` | 7,524 帧 |
| `tests/check-city-weather.mjs` | 20 项 |
| `tests/check-atmosphere-lifecycle.mjs` | 7 项 |
| `tests/check-model-loading.mjs` | 8 项 |

产权着色不增加三角面；功能结构每栋增加 1 次绘制，传送门 2 次，每地区八类合计约 15–17k 三角面。未重跑 AI 建模或更换已验收的 Blender GLB。

## 暂未开放的部分

局外卡牌商店、携带扣费和兑换券尚未启用。设计建议见 `items-v1-design.md`；当前只实现来源记录与一次性携带接入口，未更改既有仓库经济。
