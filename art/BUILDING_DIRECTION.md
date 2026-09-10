# 第二轮建筑方向

2026-09-11，用户指出初版摩天楼不高、温泉庄园不豪华、特殊地块辨识度弱，要求先做效果图再建模。在看到新版目标图后，用户选择：**「保留造型，但更卡通一些」**。

`references/building-direction-v2.png` 是内置 imagegen 生成的卡通建筑目标图，**不是 Blender 渲染或游戏实机截图**。

## 建模取舍

- 摩天楼：细长主塔、层层退台、金色冠顶和尖塔，青绿玻璃配金属竖线。等级提升保留共同基座尺度，真实增加高度。
- 金融中心：错落双塔和金融大厅，与摩天楼拥有不同轮廓。
- 温泉庄园：多栋楼阁、层叠屋顶、露天汤池、假山瀑布、拱桥、松枫和园灯。按游戏的双格长条占地重新组织庭院，保留度假地的空间层次。
- 市政府／银行／城建／翻牌：分别靠穹顶钟楼、圆形金库门、塔吊钢架、巨牌亭顶识别。
- 机会／传送／冲刺／枢纽：分别用幸运转盘、双环传送门、箭头门架、交叉拱路。
- 卡通化通过饱满倒角、大色块、清晰的构件层次实现，避免写实细碎纹理压过建筑轮廓。

运行时按实际占地装配新的具名资产，不再为每个等级重新统一限高。普通街区建筑保留为比例参照。独立的「近看建筑」用于观察真实模型和各级形态，不改变对局状态。

## 生成方式与提示词

使用内置 imagegen，先生成六个建筑的概念板，再按用户反馈对同一张图做卡通化编辑。最终编辑提示词如下。

```text
Edit this architectural concept sheet. The user likes the architecture and silhouettes and explicitly requests: “保留造型，但更卡通一些” (keep the designs, make them more cartoon-like).
Preserve the exact SIX subjects, their composition and labels, the tall soaring Art Deco skyscraper with stepped crown/spire, the luxurious landscaped hot-spring estate with multiple pavilions/terraced pools/waterfalls, the domed city hall, round-vault bank, construction crane, and three-card pavilion. Keep full architectural luxury and visual upgrade appeal.
Restyle into gorgeous premium stylized 3D GAME ART, a charming collectible tabletop miniature. Stronger, slightly exaggerated silhouettes; confidently rounded bevels, smooth clean materials, crisp broad color areas, chunky gold window frames, clearly separated architecture layers, sculpted stylized pines and rounded red maple canopies. Simplify dense realistic filigree and photoreal textures into beautiful readable modeled accents. Warm cream walls, rich blue-green glass, cheerful terracotta/copper/brass highlights, jewel turquoise pools, dark blue-grey curved pavilion roofs. Give roofs tasteful exaggerated overhangs and soft sculpted ridges; make pool banks and garden paths rounded and inviting. Keep the skyscraper genuinely tall and slim, with the pinnacle five times the ordinary-building height; keep the resort convincingly expansive and luxurious. Do NOT reduce them to bland box houses or low-poly placeholders.
Use neutral warm studio light with soft contact shadows, sharper saturation and playful polished surfaces. No photo-real leaves, grunge, harsh black shadows, tiny repetitive 40-floor photographic grids, grain, or photographic blur. Crisp 3D illustration readable at game scale. The bank's large round safe, fan of giant cards, crane, and dome must retain extremely distinct silhouettes.
Keep existing exact Chinese labels. Expand framing very slightly so the whole skyscraper spire has margin at the top, and all parcels remain fully within image. No additional models, no game UI, no new text.
```
