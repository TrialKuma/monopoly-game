# 界面视觉改动报告（2026-11-10）

来源：11.10 23:16 用户说"好的，你改吧，可以让我看看你修改之后会改成什么样，记得留好报告和详细修改方案"。师爷（Cursor）从 11.10 23:16 改到 11.11 01:05。这份是报告，写改了什么、改完什么样、验证到什么程度。每一处的尺寸、颜色和没做的提案在同目录的 `ui-visual-2026-11-10-plan.md`。

所有改动都没有提交，也没有暂存。

## 结论

手机竖屏的对局画面改成了城市铺满全屏、信息和操作浮在上面；夜里浮层跟着变深色；金额统一成一套数字字体；全图视角的地名标签收成了归属色的小圆点；首页的城市不再被白雾盖住。另外修了道具商店的空图标和蔚蓝港湾全图的米色空带。

项目自带的 88 个测试脚本，改完以后 66 个通过、22 个不通过。这 22 个在去掉本轮改动的项目副本上同样不通过，不是这一轮造成的。中途有一个测试被这一轮的改动弄坏过，已经修好，下面有写。

横屏和电脑上的布局没有动。

## 改完什么样

每张图左边是改之前，右边是改之后，都是 390×844 的手机竖屏。

### 对局画面

![对局，跟随视角](ui-visual-2026-11-10/30-mid-local-comparison.jpg)

顶部原来的品牌栏、地图名、双方现金三层并成了一条浮着的信息条，底部的操作区和工具栏变成了浮着的托盘和三个小按钮。五个镜头按钮从横着压在城市顶上，改成了靠右竖排。

![对局，全图视角](ui-visual-2026-11-10/31-mid-overview-comparison.jpg)

全图视角下，有主的地块变成所有者颜色的圆点，功能格只留图标。点一下圆点会恢复成完整标签。

### 夜里

![夜间，跟随视角](ui-visual-2026-11-10/50-map-classic-night-local-comparison.jpg)

![夜间，全图视角](ui-visual-2026-11-10/51-map-classic-night-overview-comparison.jpg)

### 蔚蓝港湾

![蔚蓝港湾，全图视角](ui-visual-2026-11-10/51-map-harbor-overview-comparison.jpg)

左图海面下方那条米色空带是相机把近处的海面裁掉了，露出了网页底色。右图已经修好。

![蔚蓝港湾，跟随视角](ui-visual-2026-11-10/50-map-harbor-local-comparison.jpg)

### 另外两张地图的全图

![阿尔卑斯山镇，全图视角](ui-visual-2026-11-10/51-map-alpine-overview-comparison.jpg)

![曼哈顿大道，全图视角](ui-visual-2026-11-10/51-map-expansion-dusk-overview-comparison.jpg)

### 首页

![首页](ui-visual-2026-11-10/01-home-comparison.jpg)

### 弹窗和卡片

![买地弹窗](ui-visual-2026-11-10/37-offer-buy-comparison.jpg)

![收租](ui-visual-2026-11-10/41-drama-rent-comparison.jpg)

"继续"按钮从灰米色改成了青绿实色。金额从 Georgia 换成了新的数字字体。飘字从压在现金数字上移到了信息条下方。

![道具商店](ui-visual-2026-11-10/42-item-shop-comparison.jpg)

左图标题左边的淡紫色圆里是空的，右图是购物袋图标。

![终局](ui-visual-2026-11-10/60-finish-board-comparison.jpg)

![结算页](ui-visual-2026-11-10/61-finish-settlement-comparison.jpg)

结算页只换了数字字体，版式没有动。

### 其他状态（只有改后）

![对手回合、玩法演示、首页夜景](ui-visual-2026-11-10/90-other-states-1.jpg)

![小屏和机车双骰](ui-visual-2026-11-10/91-other-states-2.jpg)

![设置菜单、光照天气、背包](ui-visual-2026-11-10/92-menus.jpg)

## 改了哪些文件

| 文件 | 状态 | 改了什么 |
| --- | --- | --- |
| `match-hud.css` | 新增 | 这一轮几乎全部的样式都在这里：浮层布局、夜间配色、数字字体、全图标签、首页、"继续"按钮、窄屏规则 |
| `match-hud.js` | 新增 | 把场景的白天黑夜、局部或全图视角写到页面上，供样式判断；把回合进度同步给信息条里的那条短线 |
| `assets/fonts/bree-serif-latin-400.woff2` | 新增 | 数字字体，10 KB |
| `assets/fonts/bree-serif-OFL.txt` | 新增 | 这款字体的许可全文 |
| `index.html` | 改动 | 加了两行，引用上面的样式和脚本；把 `visual.css` 和 `scene.js` 后面的版本号改成了 `20261110-hud1`，让浏览器重新取这两个文件 |
| `visual.css` | 改动 | 第 29 到 33 行，修道具商店和翻牌事件的图标 |
| `scene.js` | 改动 | 加了七行，修全图视角近处地面被相机裁掉的问题 |
| `reports/ui-visual-2026-11-10/` | 新增 | 17 张对比图 |
| `reports/ui-visual-2026-11-10-report.md`、`-plan.md` | 新增 | 这份报告和修改方案 |

### 和工作区里别人没提交的改动的关系

改之前工作区里已经有一批没提交的改动，主要是小城相关的（`progression.js`、`town-*.js`、`game.js` 等）。这一轮碰到其中两个文件：

- `index.html`：原来就有别人改过的版本号。师爷加了两行，另外把 `scene.js` 那一行的版本号从别人改的 `20261109-firework-camera` 换成了 `20261110-hud1`。版本号只是用来让浏览器不用旧缓存的，换成哪个值都可以，但这一行原来是别人改的，这里说明一下。
- `scene.js`：原来就有别人的改动。师爷只在摆相机的那个函数末尾加了七行，没有动别的地方。

其余没提交的改动一行都没有碰。

## 测试

跑的是项目自带的全部测试脚本：`tests/` 下的 `*.test.cjs`、`*.test.mjs`、`*-browser.cjs`、`check-*.mjs`，加上 `tools/portrait-smoke.cjs`，一共 88 个。`tests/` 里的几个 Python 脚本没有跑，这台电脑上没有可用的 Python。

| | 数量 |
| --- | --- |
| 通过 | 66 |
| 不通过 | 22 |
| 不通过的里面，在去掉本轮改动的副本上同样不通过 | 22 |

怎么确认不是这一轮造成的：师爷在临时目录里做了一份项目副本，去掉这一轮的全部改动（两个新文件、`index.html` 的两行、`visual.css` 和 `scene.js` 的修改），把这 22 个脚本在副本上再跑一遍，全部同样不通过。其中 21 个报的是同一个错。剩下一个是 `check-approval-portability.mjs`：它在项目里报的是美术审批记录引用了一个草稿模型文件（`art/full-ai-city/.../shop_1.glb`），和界面无关；在副本里因为副本没有 git 仓库，报的是另一个错，所以这一个没法在完全相同的条件下对比。

22 个不通过的脚本：

- 浏览器测试 10 个：`departure-flow`、`harbor-scene`、`harbor-town`、`item-shop`、`opening-compensation`、`progression`、`town-direct-interaction`、`town-district-scene`、`town-roads-storage`、`portrait-smoke`。
- 资源和场景检查 12 个：`check-ai-board-budget`、`check-ai-far-assets`、`check-ai-landmarks`、`check-approval-portability`、`check-building-sightlines`、`check-chance-scene-trigger`、`check-full-ai-city`、`check-functional-landmarks`、`check-harbor-paths`、`check-model-loading`、`check-ownership-frames`、`check-terrain-route-clearance`。

这些是改之前就存在的问题，师爷没有去修，也没有查它们各自的原因。

### 这一轮弄坏过又修好的一处

`tests/vehicle-dice-browser.cjs` 在副本上通过，在第一版改动上不通过。原因是 320 宽的屏幕上装备机车、选了双骰以后，托盘里放不下两颗骰子、"单骰、双骰"开关和掷骰子按钮，"双骰"被掷骰子按钮盖住点不到。已经在 `match-hud.css` 里加了窄屏规则，现在这个测试通过。

### 通过的浏览器测试

通过的有 13 个：`vehicle-dice`、`property-offer`、`municipal-cards`、`opening-coin`、`double-dice`、`dice-display`、`destination`、`settlement-card`、`pawn-ground-motion`、`harbor-projects`、`harbor-straight-streets`、`building-fireworks`、`town-expansion`。

## 没验证到的和已知不足

- **没有在真手机上看过。** 全部截图和测试都是电脑上的 Chrome 模拟手机。刘海安全区、磨砂效果在低端机上的流畅度、手指点小圆点的手感都没有验证。
- **原来就不通过的 10 个浏览器测试，后半段没有跑到。** 它们在中途的某一步就停了，停下之后那些对界面位置的检查这一次没有执行。也就是说 `departure-flow`、`opening-compensation`、`progression` 这几条流程后半段在新布局下有没有问题，测试没有给出答案。师爷用截图看过其中的掷硬币、终局、结算页和"我的城镇"入口，没看到问题。
- **黄昏和清晨是白天的配色。** 只有场景的夜晚程度超过 0.6 才换深色。曼哈顿大道的黄昏截图里浮层还是米白色。
- **平板竖屏没有变好。** 820×1180 用的还是手机布局拉宽，字显得小。原来就这样。
- **玩法演示的底部面板没有改**，还是贴底的不透明米色块。
- **棋子标签和地块名重叠**是原来就有的，这一轮没有处理，对比图里看得到（"你 · 08"压在"环城商会"上）。
- **翻牌事件的图标**和道具商店是同一个原因，应该一起好了，没有单独截图确认。
- **11.10 深夜另一个窗口做的 30 秒宣传片**（`work/promo/out/`）拍的是改之前的界面，买地和收租两段里的顶栏、底栏和现在不一样。

## 更正上一轮说错的一处

11.10 23:03 那一轮评审里，师爷说买地弹窗"购买 曦园?"用的是半角问号。这一轮在页面里查了这个字符，是全角问号（U+FF1F），只是标题的字距收得紧、字又粗，显得窄。上一轮是看错了，这一处不需要改。

## 怎么看、怎么撤回

看：像平时一样打开游戏，浏览器窗口调成手机竖屏的大小（或者用手机打开）。如果画面还是旧的，强制刷新一次。

撤回：在 `index.html` 里删掉引用 `match-hud.css` 和 `match-hud.js` 的两行，就回到原来的布局、配色和字体。道具商店图标和港湾海面的两处修正在 `visual.css` 和 `scene.js` 里，要一起撤的话见修改方案第五节。

## 截图和测试用的工具

都在项目外面的 `C:\Users\A\AppData\Local\Temp\mono-ui-review\`：一个只读的本地服务、三个截图脚本、一个逐个跑测试并记录结果的脚本、做副本的脚本，还有全部原始截图（改之前三十多张，改之后五十多张）。系统清理临时文件时这些会丢，报告里用到的对比图已经存进了 `reports/ui-visual-2026-11-10/`。
