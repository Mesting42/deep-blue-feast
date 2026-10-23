# 美术素材与生成说明

鱼类、鳍部动画、地形实体、珊瑚 / 海草动态、技能、预警、图标与粒子由本项目 Canvas / SVG 代码绘制。四张环境插画使用内置 **image_gen** 工具生成，已随项目保存；正式运行不调用生成服务。

| 用途 | 部署资源 | 原始素材 |
| --- | --- | --- |
| 主菜单 | public/ocean-keyart.webp | art-source/ocean-keyart.png |
| 晨光珊瑚湾远景 | public/coral.webp | art-source/coral.png |
| 海藻沉船区远景 | public/kelp.webp | art-source/kelp.png |
| 深蓝裂谷远景 | public/rift.webp | art-source/rift.png |

原始 PNG 保留。部署资源通过 Sharp 以 quality 88 编码为 WebP，四张合计约 1.38 MB。这里只做格式压缩，没有把程序形状或临时占位图作为正式插画。环境远景不参与碰撞，三个游玩背景明确不含生物，以免误认成可捕食对象。

## 主菜单最终提示词

```text
Use case: illustration-story. Asset type: ultra-wide landscape key art for the main menu of an original browser ocean exploration and fish growth game titled 深蓝食界 (do NOT put any text in image). Primary request: a refined luminous hand-painted underwater coral bay in side view, polished painterly 2.5D game art, beautiful organic illustration rather than photorealism. Composition: widescreen landscape 16:9. Left 45 percent is spacious deep turquoise open water, calm darker middle left with subtle scattered particles to support legible menu text. On right center, a beautifully detailed small orange and cream reef fish swimming right across a shaft of pale morning sunlight, a loose school of tiny blue and gold fish, a sea turtle silhouette in distance. Lower right coral garden with orange branching coral, lavender sea fans, teal sea grass, scalloped rocks and creamy sandy seabed. A rocky coral arch on far right, distant underwater cliffs and lush marine layers, surface light near upper right. Depth gradient from rich ocean blue left to luminous aquamarine upper right. Rich precise natural textures, delicate caustics, clear clean edges, cinematic composition, serene sense of discovery. Avoid: any lettering, logos, watermark, interface, numbers, pixel art, overblown bloom, neon, flat generic vector illustration, scary teeth, visual clutter on left. High resolution finished game key art.
```

## 三个海域最终提示词模板

每个海域各调用一次内置 image_gen，使用以下模板，将 `{SCENE}` 替换为对应场景文字。四次调用均为新图生成，`transparent_background=false`，没有引用输入图片或使用 CLI 回退。

```text
Use case: stylized-concept. Asset type: final in-game noninteractive distant ocean background plate, wide landscape 16:9. Scene: {SCENE} Composition: side-on underwater vista, central 65 percent is unobstructed clear open water for gameplay, elaborate reef environmental detail only along bottom 22 percent and far sides. Distant structures softly atmospheric, foreground crisp edges at bottom. Natural sophisticated marine palette with strong depth. This is an environment-only backdrop, do NOT include any fish, creatures, animals, bubbles resembling targets, UI, text, numbers, logos, watermark, game characters, obstacles in central play area, neon or pixel art. No large solid black silhouettes. Fine organic illustration, production game quality.
```

晨光珊瑚湾：

```text
luminous morning coral bay. Warm ivory sand, orange and peach branching coral, purple sea fans, sea grass, sculpted limestone arches framing the extreme left and right edges, bright turquoise open water. Sunlight rippling at surface. High quality refined naturalistic hand painted 2.5D illustration with delicate caustics and precise painterly detail.
```

海藻沉船区：

```text
an atmospheric submerged ancient wooden shipwreck and kelp forest. Teal and sage water with shafts of muted golden surface light. Broken wooden hull low in bottom right, leaning mast at extreme right, distant rock shelves. Tall waving olive kelp framing left edge and bottom, muted ochre sand and mussel-covered rocks. Rich detailed refined 2.5D painterly marine illustration.
```

深蓝裂谷：

```text
a majestic deep blue ocean rift with enormous ancient geometric stone ruins. Indigo water, distant monumental broken pillars and archways framing far right, luminous cyan sea anemones and violet delicate corals at bottom edges. Small hydrothermal vents near lower corners. Gentle distant cold light. Refined detailed painterly 2.5D underwater concept art, mysterious and elegant not horror.
```
