# 原作蓝色史莱姆 3100_01

运行资源：`public/models/archero-slime.glb`。
来自 `/Users/racio/Desktop/ArcheroMonsterExtract/Model/Monster_3100_01.glb`，本机 Archero 3.13.0。
来源与文件哈希见 `source-provenance.json`（保留提取批次的四只怪物对照信息，本项目只使用史莱姆）。

原资源文件 resources.assets：GameObject 145836，SkinnedMeshRenderer 274037，Mesh 6753，Material 653，Texture2D 4195，Animation 271918。
动画：Idle 11105 / 1.333s，Run 11106 / 1.333s，Hitted 11104 / 0.833s，Dead 11102 / 2s。
Run 的 `Slime Viking` 轨道在当前预制体无匹配对象，提取时未虚构节点；其余主要动作轨道完整匹配。

原贴图、权重与动画经 Blender 转为 GLB。运行时使用独立骨架克隆，放在额外的适配节点内，对齐地面并按原有碰撞范围缩放，不改写动画轨道。保持正 Z 朝前。
为保留已有受击调参，原作 Hitted 与外层整体缩放、亮边、击退、火花叠加；这是本项目的组合方案，不声称完整复现原作运行时的受击逻辑。
Dead 保留在资源中，没有新增血量或死亡机制。

运行时交互使用按 Idle 形态烘焙的静态命中网格，保持不受原作动画/外层缩放影响。瞄准高度随模型计算。
验证：`node tools/slime-browser-check.mjs`。
