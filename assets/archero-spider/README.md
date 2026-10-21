# 原作蜘蛛 3043_01

当前训练场资源：`public/models/archero-spider.glb`。
本机《弓箭传说》3.13.0，原始文件为 `/Applications/弓箭传说.app/Wrapper/ProductName.app/Data/resources.assets`。
提取目录：`/Users/racio/Desktop/ArcheroSpiderExtract/`。

引用链：GameObject 40641 (`3043_01`) → `rotate/Creatures_Tarantula_001` → SkinnedMeshRenderer 274135 → Mesh 6455 (`Creatures_Tarantula_001`) → Material 643 → Texture2D 3044。
模型为蓝色背部、紫色腿、大眼睛的蜘蛛；1004 顶点、1568 三角形、59 层级节点、39 蒙皮骨骼。

动画：Idle 11053 / 2.000s；Run 11056 / 0.533s；Hitted 11052 / 0.533s；Dead 11050 / 0.800s。动画路径全部匹配。
保留原贴图、权重、绑定姿态，60fps 烘焙，GLB 时间从零开始。运行时独立骨架克隆与适配父节点，沿用此前受击反馈、固定命中代理和瞄准高度计算。

定位边界：资源模型与蜘蛛外观、动画引用已核实。map_monster 中有 `3043` 对应 `Soldiers/3043.png`，但这不是章节归属证明。名为 `game_map_tiled_elevel_main2` 的包包含多种 HellLevel 地图，不能仅凭文件名当作第二章。本次没有独立确认“第二张地图”与该怪物的关卡配置映射，不将这一归属写成已证实。

验证：`node tools/training-monster-browser-check.mjs`，以及怪物训练场/受击反馈浏览器检查。原作完整 Blender、FBX、GLB 和预览保留在桌面提取目录。


### 蜘蛛骨骼绑定修正（2026-10-21）
原始逆绑定矩阵包含 2.54 倍缩放；Blender edit bones 不保留该缩放，旧导出错误地使用了单位缩放的 rest matrix，造成腿部变形。导出现在通过 animatedWorld × inverse(originalBindWorld) × blenderRestWorld 保留完整蒙皮矩阵；没有手工改腿或制作替代动画。已替换项目 GLB，重新导出桌面 blend/FBX。4 个动画各抽查 0、0.1、0.3 秒共 12 个姿态，顶点与原始 Unity LBS 计算误差均小于 0.00001；浏览器独立骨架、动画、纹理、桌面/移动端碰撞和命中验证通过，构建通过。运行时未调整碰撞半径或受击反馈参数。
