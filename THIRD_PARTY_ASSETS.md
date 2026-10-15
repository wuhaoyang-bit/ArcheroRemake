# 角色素材

## 当前角色：用户提供的 Archero 默认弓箭手

`public/models/archero-default.glb` 由用户桌面 `ArcHeroModel/Model/Archero_Default.blend` 转换。根据素材附带的 README 和 provenance.json，来源为本机《弓箭传说》初代国服 3.13.0 的 `Game/Models/1001_01`；弓来自 `Game/WeaponHand/WeaponHand101001`。这是用户提供的运行时资源还原文件，不属于下述 KayKit CC0 素材。

- 保留 4 个角色网格、1 个弓网格、63 个骨架节点、9,838 个三角面和 5 张内嵌贴图。
- 从 87 段动作中仅导出 `Idle`（1 秒）和 `Run`（约 0.666667 秒）；两段动作各有 189 条骨骼变换轨道。
- 保留源文件已有的 60 FPS 烘焙骨骼轨道，统一动画时间起点至 0 秒；未增加原始动作信息，也未重绘动作。
- 使用静态父节点统一本体高度至 3.25 单位，脚底对齐地面，保持 glTF +Z 为正面方向。尺寸测量排除弓，避免附件改变角色大小。
- 两段动画的 CharacterRoot 水平位置恒定，位置和方向继续由游戏控制器驱动；原有 Idle／Run 融合和 Run 倍速继续生效。
- 源文件包含普通 PBR 材质而非原作 Shader。弓为素材提供的参考装配，现于加载时绕手部挂点局部 Z 轴翻转 180°，修正前后握持方向。修正烘焙到弓的网格顶点和法线，保留尺寸、握持支点、蒙皮权重及手部动画；武器特殊缩放与拉弦变形仍未还原。
- 两段源动作的采样首尾并非完全相同；保留源动作，检查循环接缝位移小于片段内正常一帧的最大顶点位移。

GLB 自带贴图与骨骼动画，运行时无需 Blender、FBX 或网络素材下载。完整 Blender 文件、来源说明和导出报告保存在被忽略的 `analysis/`；桌面源文件未修改。

重建命令（Blender 5.2）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python tools/prepare-archero-character.py
```

默认读取本地 `analysis/source-assets/archero-default/Archero_Default.blend`。也可在命令最后添加 `-- --source /path/Archero_Default.blend`。脚本校验输入 SHA-256，仅在内存中精简动作，不保存源文件；输出至 `public/models/archero-default.glb`。

| 文件 | SHA-256 |
| --- | --- |
| 原始 Archero_Default.blend | `ed0285b942e3b6145c3ac513cc9b778070127ca5a882b9771005f0813bcde453` |
| 游戏 archero-default.glb | `45446846707b3a884ecd35c03fb770153602fc87af1e66f4ecb75fb94943b04b` |

## 历史角色：KayKit

此前的 `rogue.glb` 使用 Kay Lousberg 制作的 KayKit Adventurers Character Pack 1.0 中的 `Rogue_Hooded.glb`，授权 CC0，说明保留于 [KAYKIT-LICENSE.txt](public/models/KAYKIT-LICENSE.txt)。该模型已从当前运行资源移除，旧 GLB 仅在本地 `analysis/source-assets/rogue-previous-runtime.glb` 留档。

旧脚本 `tools/prepare-character.py` 仅用于重建历史 KayKit 资源；当前角色请使用上面的新脚本。
