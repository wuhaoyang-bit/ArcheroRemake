# 红弓挂接修正

上一次接入使用了桌面持握展示场景的校准矩阵。这不是原版序列化挂接数据；它会改变武器随动画转动时的方向。已删除该矩阵，保留角色 `left` 挂点的位置。根据最新截图反馈，在 `RedBowGrip` 上绕导入弓的长轴（局部 Z）旋转 180°，让凹口／弓弦一侧朝向角色；位置为零、缩放为一。原始弓的网格、材质、动画和预制体内部变换保持不变。

## 读取的原版证据

直接只读检查本机 `弓箭传说.app/Wrapper/ProductName.app` 中的：

- `Data/resources.assets`：角色 1001_01、红弓 WeaponHand1001、相关 Transform。
- `Data/globalgamemanagers.assets`：MonoScript 类型引用。
- `Data/Managed/Metadata/global-metadata.dat`：IL2CPP v31 类型、字段、方法记录。
- `Frameworks/UnityFramework.framework/UnityFramework`：arm64 方法实现。通过代码生成模块 `Assembly-CSharp.dll` 的方法指针表与 metadata token 关联方法，并读取对应反汇编；不是仅搜索方法名称。

角色根 MonoBehaviour 563299 的脚本指针是 **外部文件 1 / Path ID 2115**，解析到 `BodyMask`，不是 resources.assets 内同 ID 的材质。

| 字段 / 节点 | 原始引用 |
|---|---|
| BodyMask.LeftWeapon | resources.assets GameObject 67223，名称 left；Transform 238230 |
| BodyMask.RightWeapon | GameObject 185410，名称 right；Transform 215650 |
| left 的父级 | Bip001 L Hand，Transform 254319 |
| leftweapon | left 的子节点；该节点不是 BodyMask.LeftWeapon 字段的引用目标 |
| WeaponHand1001 | GameObject 43731；根 Transform 195541 |
| child | Transform 210165；Unity 局部 rotation (0,1,0,0)，scale (2.54,2.54,2.54) |
| gong | Transform 210031；局部 position 0、rotation identity、scale 1；Mesh 6809 |

`WeaponBase.GetWeaponNode`（VA `0x409ca58`）根据武器挂接类别选择节点，默认分支读取 BodyMask 的 LeftWeapon（实例字段偏移 0x28）；类别 1 分支读取 RightWeapon（0x30），其他分支读取专用列表。没有使用名为 leftweapon 的子对象作为该默认分支目标。

两套创建路径均调用同一个选挂点方法，并在设置父节点后复位根节点局部 TRS：

| 流程 | 方法 / 关键调用 VA |
|---|---|
| 战斗 | EntityBase.<WeaponHandUpdate>g__createWeaponHand\|1627_0，入口 0x3700480 |
| 战斗设父级 | 0x370075c → Transform.set_parent |
| 战斗复位位置 / 缩放 / 旋转 | 0x37007b8 / 0x370080c / 0x3700868 |
| 装备展示 | CharUIHeroCtrl.<InitWeapon>g__createWeaponHand\|34_0，入口 0x25adce4 |
| 展示设父级 | 0x25ade3c → Transform.set_parent |
| 展示复位位置 / 缩放 / 旋转 | 0x25ade98 / 0x25adeec / 0x25adf48 |

因此不能将“按截图单独摆好的根矩阵”当作原版的局部装备姿态。原版创建代码采用根 identity。本项目额外的 180° 朝向修正是对当前导入资源的视觉适配，不能视为原版代码中存在该旋转；内部 child 的变换保持不变。

## 验证与边界

- 新增 `npm run test:bow-mount`：加载实际角色和红弓 GLB，在 Idle、Run、Attack 的多个时刻检查弓根与挂点原点重合，检查挂接矩阵只含绕长轴的 180° 旋转，输出正面/俯视/攻击预览。
- `npm run test:attack` 继续检查释放、回弹、打断与复位。
- 本地分析脚本、组件原始字节、原始 Transform、metadata/方法指针映射、反汇编和浏览器截图在 `analysis/bow-attachment/`；该目录按现有项目规则不纳入版本控制。
- 没有启动原版游戏抓取其运行时内存；加密的 weapon 配置入口未解码，不能声称已独立核实所有武器配置分支。上述 native 挂接流程与 BodyMask 字段引用有直接证据，left 的选择还结合了截图持弓手和当前角色姿势。角色动画与 GLB 沿用本项目已有导出，本次没有承诺逐像素复现原版相机和骨架播放。
- 上一次记录中“展示矩阵校准”的接入方式已废弃；桌面提取结果及原版应用均未修改。
