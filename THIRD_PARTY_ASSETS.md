# 角色素材

`public/models/rogue.glb` 使用 Kay Lousberg 制作的 KayKit Adventurers Character Pack 1.0 中的 `Rogue_Hooded.glb`。

- [官方素材仓库](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
- [原始模型](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb)
- 授权：CC0；随素材提供的说明保存在 [KAYKIT-LICENSE.txt](public/models/KAYKIT-LICENSE.txt)。

本项目仅保留 `Idle` 和 `Running_A` 两段动画，后者重命名为 `Run`，删除不再引用的动画数据并压实 GLB 二进制缓冲。网格、纹理和骨骼保持原素材；场景中隐藏挂载武器，没有接入战斗功能。

运行 `python3 tools/prepare-character.py` 可重建精简模型。若原始文件不存在，脚本从官方仓库下载并校验 SHA-256。完整原始模型保存于被 Git 忽略的 `analysis/source-assets/`；游戏运行仅加载精简模型。

| 文件 | SHA-256 |
| --- | --- |
| 原始 Rogue_Hooded.glb | `93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545` |
| 精简 rogue.glb | `04cf841ecee9ec284cbd46afc384cff24eab8c3c5521bfa65beae13250a4db71` |
