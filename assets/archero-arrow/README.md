# Archero 原版箭矢资源

来源：本机 `/Applications/弓箭传说.app/Wrapper/ProductName.app/Data/`。只读定向提取，使用已有 UnityPy 1.25.4 和 Blender 5.2.1；没有修改游戏包、桌面旧成果或项目运行代码。此目录保留提取存档；后续接入使用 `public/models/archero-arrow.glb` 副本，运行时代码位于 `src/arrow-projectiles.ts`。

## 已保存内容

- `models/Arrow_1001_01.glb`：箭矢实体，内嵌材质及 128×128 贴图，可供 Three.js 后续使用。
- `models/Arrow_1001_01.blend`：对应 Blender 源文件，贴图打包在文件内。
- `previews/`：top、side、oblique 三个方向的预览。
- `extracted/`：原始网格、材质、层级、组件 JSON、Shader 数据和 PNG 贴图。
- `reports/`：资源名称搜索、引用链、构建和验证结果。
- `scripts/`：定向提取、构建、回读验证脚本，复用本机已有 Python 环境。

## 确认依据

`globalgamemanagers` 的 ResourceManager 明确包含 `game/bulletmodels/1001_01`，指向 resources.assets 的 GameObject 49584。这是弹体模型资源，不是 UI 箭头。实体外观为白色箭头、黑色箭杆和红色尾羽。

| 资源 | 文件 | Path ID |
|---|---|---|
| 弹体模型根 1001_01 | resources.assets | 49584（Transform 199358） |
| child 实体节点 | resources.assets | 38305（Transform 210282） |
| MeshFilter / MeshRenderer | resources.assets | 261722 / 258631 |
| 网格 arrow01 | resources.assets | 6847 |
| 材质 eff_bow_02 | resources.assets | 142 |
| 贴图 eff_bow_02 | resources.assets | 3625 |
| Shader Custom/OutLine2 | resources.assets | 7248 |
| Bullet1001 脚本预制体 | resources.assets | 28921 |
| Bullet1001 脚本类型 | globalgamemanagers.assets | 8981 |
| 拖尾/阴影共用 Quad | unity default resources | 10210 |

`game/bullet/bullet1001` 指向只有 MonoBehaviour 的独立空节点，不直接包含网格。本次确认了箭矢模型本身及资源目录归属，尚未解码运行时配置来证明红弓所有等级/皮肤必定选择这一弹体；没有把名称关联当作完整的代码绑定证明。其他敌人箭矢与皮肤模型未批量导出。

## 坐标、材质与边界

实体 child 原始 Unity 位置 (0,0,0.527)，旋转 quaternion (0.7071068,0,0,0.7071068)，缩放约 (0.8,0.8,0.8)。导出保留原始根与子级变换，不居中、不新增持握校准。Unity 到 Blender 的坐标转换为 (-x,-z,y)，再由 Blender 正常导出 glTF。

源网格 144 顶点、70 三角形；GLB 因顶点属性拆分为 146 顶点、70 三角形。实体没有骨骼、BlendShape 或 AnimationClip；箭矢的飞行逻辑未提取、未制作替代动画。

GLB 材质使用贴图自发光以保留平涂外观，不复现 Custom/OutLine2 的描边。预制体另外包含 trail、shadow 节点，其 Unity 内置 Quad 已单独保存为 JSON 和原始二进制；原始材质、纹理、变换和 Shader 数据均保留。GLB 中这两个节点保留为空节点，不导出未经适配的拖尾/阴影效果。拖尾使用 Scroll 2 Layers Sine AlphaBlended，阴影使用 Legacy Particles/Alpha Blended，后续接入需单独适配。

## 验证

已用独立 Blender 进程打开 .blend 并重新导入 .glb，核对实体网格、70 三角形、实际材质纹理节点与 128×128 像素数据，生成三视图预览。结果见 reports/validation.json。后续已接入 Three.js 匀速飞行与接触回收，并通过桌面及移动浏览器验证；拖尾和阴影特效未接入。

素材来源于本机商业游戏资源，不属于项目已有 CC0 素材。
