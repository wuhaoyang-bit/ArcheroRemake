# 角色素材

## 当前角色：用户提供的 Archero 默认弓箭手

`public/models/archero-default.glb` 由用户桌面 `ArcHeroModel/Model/Archero_Default.blend` 转换。根据素材附带的 README 和 provenance.json，来源为本机《弓箭传说》初代国服 3.13.0 的 `Game/Models/1001_01`；弓来自 `Game/WeaponHand/WeaponHand101001`。这是用户提供的运行时资源还原文件，不属于下述 KayKit CC0 素材。

- 保留 4 个角色网格、1 个弓网格、63 个骨架节点、9,838 个三角面和 5 张内嵌贴图。
- 从 87 段动作中导出 `Idle`（1 秒）、`Run`（约 0.666667 秒）、弓箭前摇 `AttackPrev`（约 0.533333 秒）和收招 `AttackEnd`（0.5 秒）；每段各有 189 条骨骼变换轨道。
- 保留源文件已有的 60 FPS 烘焙骨骼轨道，统一动画时间起点至 0 秒；未增加原始动作信息，也未重绘动作。
- 使用静态父节点统一本体高度至 3.25 单位，脚底对齐地面，保持 glTF +Z 为正面方向。尺寸测量排除弓，避免附件改变角色大小。
- 四段动画的 CharacterRoot 水平位置恒定，位置和方向继续由游戏控制器驱动；原有 Idle／Run 融合和 Run 倍速继续生效。
- 射箭按源 README 指定的 `AttackPrev → AttackEnd` 顺序循环播放。运行时保留两段全部采样，段间使用一个 60 FPS 采样间隔衔接，每轮约 1.05 秒；原速播放，不跟随 Run 倍速。这是当前实验播放安排，不宣称还原原作运行时攻速。
- 源文件包含普通 PBR 材质而非原作 Shader。运行时移除旧 Bow_WeaponHand101001 网格，接入下述独立红弓；角色骨架与全部原有动作继续使用。
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

## 当前武器：截图中的红色简约弓

`public/models/archero-red-bow.glb` 复制自本机 `/Users/racio/Desktop/ArcheroBowExtract/Model/RedBow_WeaponHand1001.glb`，SHA-256：`5adc20439eddfede4471a2e6a01b7299847aab843dcaf2f836727ff08f304e39`。原始来源为 `/Applications/弓箭传说.app/Wrapper/ProductName.app/Data/resources.assets`：预制体 WeaponHand1001（43731）、网格 gong（6809）、材质 WeaponHand1001（1322）、贴图（5164）。124 顶点、72 三角形，内嵌 128×128 贴图。

三个 Legacy 动画 weapon1001_prev（10787）、weapon1001_end（10786）、weapon1001_reset（10788）作用于 child/gong 的局部缩放，没有骨骼或 BlendShape。GLB 使用原曲线 240 Hz 采样加原始关键时刻，未创作新动作；材质使用纹理自发光近似平涂外观，不复刻专有 Shader。来源的详细证据及运行时检查边界保留在桌面提取目录 README。

运行时在 `src/bow.ts` 使用 `BodyMask.LeftWeapon` 对应的 `left` 挂点。已移除此前展示场景的校准矩阵，武器根节点采用零位移、单位旋转和单位缩放，保留预制体 child 的 180° Y 旋转与 2.54 缩放。原版 UI/战斗创建武器流程、BodyMask 字段引用与检查边界见 [挂接核查记录](docs/bow-attachment.md)。

原始蓄力曲线时域约 0.2833 秒，安排在角色释放点（0.55 秒）之前；释放回弹约 0.1167 秒，之后维持 reset 至当前攻击循环结束。两段武器曲线保持原速，角色原有骨骼轨道保持不变，循环衔接及打断使用同一混合器；Idle/Run 添加恒定复位轨道。没有独立弓弦对象或新增拉弦动画。

验证：`npm run test:attack` 回读真实 GLB 并在 WebGPU 中渲染角色，检查 124 顶点、释放/回弹关键缩放、打断复位及再次攻击。该素材来自本机商业游戏资源，不属于 KayKit CC0。

## 历史角色：KayKit

此前的 `rogue.glb` 使用 Kay Lousberg 制作的 KayKit Adventurers Character Pack 1.0 中的 `Rogue_Hooded.glb`，授权 CC0，说明保留于 [KAYKIT-LICENSE.txt](public/models/KAYKIT-LICENSE.txt)。该模型已从当前运行资源移除，旧 GLB 仅在本地 `analysis/source-assets/rogue-previous-runtime.glb` 留档。

旧脚本 `tools/prepare-character.py` 仅用于重建历史 KayKit 资源；当前角色请使用上面的新脚本。

## 原版箭矢（已接入）

原版 `game/bulletmodels/1001_01` 已定向提取到 [assets/archero-arrow](assets/archero-arrow/README.md)，包含 GLB、Blender、贴图、原始组件与验证记录。提取目录保留原始存档；运行时使用其副本 `public/models/archero-arrow.glb`，在释放点生成匀速箭矢。命中当前训练敌人的网格即隐藏并回收，对象池复用网格与材质，不添加命中特效。网格 resources.assets / 6847，材质 142，贴图 3625；此素材来自本机商业游戏，不属于 CC0。
