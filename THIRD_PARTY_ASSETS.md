# 角色素材

## 当前角色：用户提供的 Archero 默认弓箭手

`public/models/archero-default.glb` 由用户桌面 `ArcHeroModel/Model/Archero_Default.blend` 转换。根据素材附带的 README 和 provenance.json，来源为本机《弓箭传说》初代国服 3.13.0 的 `Game/Models/1001_01`；弓来自 `Game/WeaponHand/WeaponHand101001`。这是用户提供的运行时资源还原文件，不属于下述 KayKit CC0 素材。

- 保留 4 个角色网格、1 个弓网格、63 个骨架节点、9,838 个三角面和 5 张内嵌贴图。
- 从 87 段动作中导出 `Idle`（1 秒）、`Run`（约 0.666667 秒）、弓箭前摇 `AttackPrev`（约 0.533333 秒）和收招 `AttackEnd`（0.5 秒）；每段各有 189 条骨骼变换轨道。
- 保留源文件已有的 60 FPS 烘焙骨骼轨道，统一动画时间起点至 0 秒；未增加原始动作信息，也未重绘动作。
- 使用静态父节点统一本体高度至 3.25 单位，脚底对齐地面，保持 glTF +Z 为正面方向。尺寸测量排除弓，避免附件改变角色大小。
- 四段动画的 CharacterRoot 水平位置恒定，位置和方向继续由游戏控制器驱动；原有 Idle／Run 融合和 Run 倍速继续生效。
- 射箭按源 README 指定的 `AttackPrev → AttackEnd` 顺序循环播放。运行时保留两段全部采样，段间使用一个 60 FPS 采样间隔衔接，每轮约 1.05 秒；原速播放，不跟随 Run 倍速。这是当前实验播放安排，不宣称还原原作运行时攻速。
- 源文件包含普通 PBR 材质而非原作 Shader。按用户最新要求，运行时从角色场景中移除弓网格，并删除挂点/方向修正逻辑；实际显示 4 个角色网格。GLB 中保留原始弓资源，角色骨架与所有动画照常使用。
- Idle／Run 的采样首尾并非完全相同；保留源动作，检查循环接缝位移小于片段内正常一帧的最大顶点位移。本次扩充攻击资源后，这两段的骨骼采样数据与此前 GLB 一致。

GLB 自带贴图与骨骼动画，运行时无需 Blender、FBX 或网络素材下载。完整 Blender 文件、来源说明和导出报告保存在被忽略的 `analysis/`；桌面源文件未修改。

重建命令（Blender 5.2）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python tools/prepare-archero-character.py
```

默认读取本地 `analysis/source-assets/archero-default/Archero_Default.blend`。也可在命令最后添加 `-- --source /path/Archero_Default.blend`。脚本校验输入 SHA-256，仅在内存中精简动作，不保存源文件；输出至 `public/models/archero-default.glb`。

| 文件 | SHA-256 |
| --- | --- |
| 原始 Archero_Default.blend | `ed0285b942e3b6145c3ac513cc9b778070127ca5a882b9771005f0813bcde453` |
| 游戏 archero-default.glb | `1c07d25eed0c95c61bda62ea21a10de6cd79899bb0eb9a502087313d34126438` |

## 历史角色：KayKit

此前的 `rogue.glb` 使用 Kay Lousberg 制作的 KayKit Adventurers Character Pack 1.0 中的 `Rogue_Hooded.glb`，授权 CC0，说明保留于 [KAYKIT-LICENSE.txt](public/models/KAYKIT-LICENSE.txt)。该模型已从当前运行资源移除，旧 GLB 仅在本地 `analysis/source-assets/rogue-previous-runtime.glb` 留档。

旧脚本 `tools/prepare-character.py` 仅用于重建历史 KayKit 资源；当前角色请使用上面的新脚本。
