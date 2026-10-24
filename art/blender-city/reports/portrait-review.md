# 正式 Blender 资源竖屏验收

验收日期：2026-10-25（Asia/Shanghai）。验收者：制作助手，尚未替代用户美术验收。

资源为 `release.json` 的已发布版本，浏览器缓存版本 `20261024-blender-release2`。本次截图均从正式游戏页面采集，不是 Blender 离线渲染或概念图。

## 设备范围

在桌面应用内浏览器中设置 390 × 844 视口，遍历五张地图的演出预览、地块面板和建筑近看；另用 320 × 740 检查港湾大型建筑的旋转与控件布局。此处验证画面、响应式布局和交互，不声称完成手机硬件帧率、温升或触摸手感实测。模型包仍为每地区约 60–87 MiB，真实移动网络的首载时间未实测。

正式对局使用 `localhost:8876` 独立于用户常用 `127.0.0.1:8876` 的站点存储，测试港湾 30 回合模式的开局与一次玩家行动；用户常用站点的仓库仍为 200 金币，没有消耗。验收结束恢复浏览器视口，并刷新用户原建筑验收页到正式 Blender 版本。

## 画面检查

| 地图 | 检查结果 | 游戏截图 |
| --- | --- | --- |
| 经典环线 | 石材、板岩屋面、拱窗和铁艺阳台；一级小屋与三级住宅细节一致 | [整图](portrait/classic-390x844.jpg) / [一级](portrait/classic-small-lv1.jpg) / [三级](portrait/classic-small-lv3.jpg) |
| 紧凑冲突 | 青灰瓦片、木构格栅、绿色门帘；小屋屋面具有真实层次 | [整图](portrait/compact-390x844.jpg) / [一级](portrait/compact-small-lv1.jpg) |
| 都市大环线 | 红砖、浅色石材、铜绿屋面与金色冠饰；一级建筑窗框和门廊清晰 | [整图](portrait/expansion-390x844.jpg) / [一级](portrait/expansion-small-lv1.jpg) |
| 潮汐港湾 | 蓝色筒瓦、石材拱廊与屋顶露台；大小建筑设计一致 | [整图](portrait/harbor-390x844.jpg) / [一级](portrait/harbor-small-lv1.jpg) / [三级地标](portrait/harbor-large-lv3.jpg) |
| 云岭温泉 | 红瓦、木梁、绿色百叶窗和花箱；小屋没有退回简单方块 | [整图](portrait/alpine-390x844.jpg) / [一级](portrait/alpine-small-lv1.jpg) |

五图显示新模型与外围建筑，没有发现漏载或旧 AI 资源混入。棋盘距离下细节以轮廓、屋面和门窗层次为主，近看能辨认小构件。演出预览使用整图视角；较长的都市棋盘在竖屏中需要缩放查看最外缘，不等同于正式对局的默认局部镜头。

## 操作检查

- 建筑近看：打开、关闭、Lv.1/Lv.3 切换、向右旋转均正常。320 像素宽时大地块模型、等级切换、旋转缩放和关闭按钮完整可见：[窄屏截图](portrait/harbor-large-320x740-rotated.jpg)。
- 默认镜头：正式港湾对局为局部跟随；AI 行动时保持围绕玩家，玩家由第 1 格移动至第 7 格后镜头移至新位置：[行走前](portrait/harbor-follow-start.jpg) / [行走后](portrait/harbor-follow-after.jpg)。延迟、手势释放、整图切换与最大缩放路线另由 `check-camera-follow.mjs` 验证，7,524 帧检查通过。
- 购买面板：正文、预览入口与底部两按钮在 390 × 844 内显示；“暂不购买”在左，“购买”在右：[截图](portrait/harbor-purchase-confirm-right.jpg)。
- 升级演出：海港商会 Lv.1 → Lv.2 成功，棋盘换用对应等级模型，确认继续按钮可见：[截图](portrait/harbor-upgrade.jpg)。
- 浏览器记录的 error 日志为空。五张地图使用当前正式资源加载，结束后未留下原生确认框。

## 关联验证

完整来源、正式包与 UI 绑定、运行预算、落点避让、加载及缓存检查结果见 [runtime-validation.json](runtime-validation.json)。全部 145 栋棋盘建筑、2 件主景和 25 件远景的逐件来源与几何检查已通过；远景渲染复核见 [far-visual-review.json](far-visual-review.json)。本轮没有调用新的生图、Pixal3D 或其他 AI 建模服务。
