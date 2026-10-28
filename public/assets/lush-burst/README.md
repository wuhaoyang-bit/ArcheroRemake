# Lush 爆开与地面颜料运行时资源

来源：本地 `references/lush-splatoon` 中用户确认的试玩包及材质解析成果。
原演示：https://www.youtube.com/watch?v=1KEzBiwXDvw

- `scene.json/bin`：`hit-preview/source-match/` 的 Blender 还原动画；120 fps，145 帧，六层共 34 粒子；包含液体网格的逐帧形变。
- PNG：该项目原始粒子/噪声/法线纹理；Splat 01–03 为三种原始地面印迹。
- `Side_0…5.hdr`：地面材质原始 HDR 反射资源。
- WebGPU 实现：`src/lush-burst-effects.ts`，对应 `material-analysis/recovered/material_core.glsl` 与 `residue_core.glsl`。

原始参考和分析仍在 git 忽略目录；此处是游戏运行所需的独立资源副本，随网页构建发布。未加入原始地板、靶子纹理等无关资源。

已复用：几何形变、粒子变换及输入、噪声扰动、侵蚀、法线解码、三种液滩形状和 HDR。颜色按本游戏需求统一为黄色。
限制：Three 光照/色调映射与 UE 不同；粒子 DepthFade 尚未接入场景深度，UE 折射不在本实现中；不声称逐像素还原 UE。动画采用已确认还原版的固定随机采样，数量参数从原粒子中筛选，不额外随机发射新粒子。

地面材质风格调整：现已取消边缘专用褶皱法线、颜色倍率和 HDR 反光，改用与中心统一的表面着色；原始轮廓遮罩不变。`Side_*.hdr` 保留为来源资源，当前游戏材质不再加载或采样。
