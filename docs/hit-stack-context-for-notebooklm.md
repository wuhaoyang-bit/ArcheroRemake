# 07 · ArcheroRemake 项目基本情况与受击技术现状

**用途**：供 NotebookLM 审核 `docs/hit-horizontal-bend-plan.md`（黄色史莱姆受击水平月牙弯曲 PLAN）时作背景依据。  
**日期**：2026-11-03  
**参数快照来源**：`/Users/racio/Documents/ArcheroRemake/public/params.json`（version 1，训练场当前已保存值）  
**配套 Notebook**：`DIR-ArcheroRemake-20261103-Grok受击弯曲与击退读感`  
**配套预览**：`/Users/racio/trr-boards/knockback-force-feel/`（侧视 2D，未接入游戏构建）

---

## 1. 项目基本情况

### 1.1 是什么

**ArcheroRemake** 是用 **Three.js + WebGPU** 复刻《弓箭传说》（Archero）手感的网页原型，路径：`/Users/racio/Documents/ArcheroRemake`。

- 运行：`npm run dev` → `http://localhost:5173/`（Vite，`strictPort` 5173）
- 栈：TypeScript、Three.js `0.186.1`（`three/webgpu`）、Vite 8
- 目标平台：电脑浏览器 + 手机（HTTPS 5174）+ 可选 Android WebView APK
- 竖屏构图约 9:19.5；俯视倾斜正交相机

### 1.2 当前阶段在做什么

早期完成角色轮盘移动；后续在**怪物训练场**上叠战斗与受击反馈：

- 玩家弓箭水平飞行（XZ 无重力、不撞地）
- 训练假人／怪物（含**黄色史莱姆**、蜘蛛等）
- 一整套**受击反馈栈**（击退、压缩、亮边、眼睛、飞溅等）
- 史莱姆相关：鼓胀、撑爆 burst、液片／汁滴、眼睛物理等（与「普通箭命中反馈」并行存在）

当前讨论焦点：**普通箭命中后的「受力 → 击退 → 自己刹住」读感**，以及为此新增的**水平月牙弯曲**（PLAN 已写、**尚未授权实现**）。

### 1.3 黄色史莱姆模型（弯曲将作用的对象）

- 文件：`src/yellow-slime-model.ts`
- 身体：`RoundedBoxGeometry(2,2,2,6,.24)` 单 mesh，**无骨骼**
- 材质色约 `#ffdd32`
- `face` 组挂眼睛（`createSlimeEyes`）；眼睛高度相关参数含 `slimeEyeY ≈ 1.15`（当前保存值）
- PLAN 约定弯曲**仅史莱姆起步**，载体为 **body 顶点水平位移**，不改蜘蛛等

### 1.4 工程约定（审核 PLAN 时必须遵守）

- **未获用户明确「按这个做」前，禁止改游戏业务代码实现弯曲**
- 未写清的行为**不得擅自发明**；有歧义先问
- 调参以左侧面板 + `public/params.json` 为准；预览页应优先对齐**已保存 params**，而非仅 `HIT_DEFAULTS`
- NotebookLM 审核结论用于优化 PLAN；**人工批准后才实现**

---

## 2. 受击反馈总览（现有技术栈）

一次箭命中训练目标后，多条通道**从同一命中时刻并行启动**（同一 `HitResponse.age`），彼此独立开关与时长：

| 通道 | 主要模块 | 作用简述 |
|---|---|---|
| 根节点击退平移 | `hit-response.ts` | 水平位移，OutCubic 或手动折线减速 |
| 体积压缩／弹簧回弹 | `hit-response.ts` + `hit-deformation.ts` | 整体缩放或**沿箭方向压缩** |
| 白色亮边（rim） | `hit-response.ts` rim() | 命中后全身边缘发亮再淡出 |
| 眼睛受击（eye-hit） | `eye-hit-motion.ts` | 滞留 → 弹回 → 吸收；强度挂钩击退初速 |
| 液片飞溅 | splash sheets | 脚底大片液体，跟随敌人 |
| 跟随汁滴 | splash particles | 命中颗粒，独立于旧版 juice |
| 黄色汁液迸发（juice） | `juice-particles.ts` | 压缩开始回弹时水平盘状迸发；**当前保存为关** |
| 动画 | Hitted clip 等 | 击退期间 Run 被挡住，播受击动画 |
| 相机震动等 | cameraShake* | 爆炸／强反馈另线；与普通箭命中可并存于 params |

**尚不存在（即本 PLAN 要补的）：** 身体在水平面内弯成月牙 ⊂、脚钉地、上半后仰 follow-through。现有压缩是**轴向缩放**，不是弯曲。

---

## 3. 当前已保存参数下的受击技术细节

以下数值均来自 **2026-11-03 左右** 的 `public/params.json` `settings`，审核 PLAN 时以「游戏里实际在用的手感」为准。代码里的 `HIT_DEFAULTS` 可能更保守（例如默认击退距离 1.05u），**已与保存值分叉**。

### 3.1 击退（Knockback）

| 键 | 当前值 | 含义 |
|---|---|---|
| `hitKnockEnabled` | **1** | 开 |
| `hitKnockTime` | **0.2 s** | 击退总时长 T |
| `hitKnockDistance` | **3 u** | 击退总距离 D（默认曾为 1.05，已调大） |
| `hitKnockCurveMode` | **1** | **手动折线**（非公式 OutCubic） |
| `hitKnockCurve` | 见下表 | 横轴时间进度 %，纵轴已完成位移比例 % |

手动曲线关键点（前重后轻，比纯 OutCubic 更「先甩出去」）：

| time% | progress% |
|---|---|
| 0 | 0 |
| 7.74 | 28.47 |
| 19.62 | 50.86 |
| 34.48 | 72.54 |
| 48.28 | 82.52 |
| 61.58 | 90.64 |
| 73.49 | 95.13 |
| 89.24 | 98.26 |
| 100 | 100 |

实现要点：

- 每帧位移 = `D * (progress(age) - progress(prev))`，沿击退水平方向
- 命中时**深拷贝曲线**，闪击中途改曲线不影响本次
- 撞墙裁剪当帧位移并标 `blocked`；时钟仍按曲线走完
- 公式模式（mode=0）为 `progress = 1-(1-q)³`，`q=t/T`；瞬时初速 `3D/T`
- 手动模式初速取曲线**首段斜率** × `D/T`，供 eye-hit 强度使用

**读感结论（已对齐）：** 位移曲线本身被认为够用；「自己跳一下」的读感更多来自**姿态／体积补偿变高／压缩与击退同时起步**，而不是缺一条刹车曲线。因此 PLAN **不重写击退曲线**，而是加**弯曲姿态**。

### 3.2 方向压缩（Directional Squash）

| 键 | 当前值 | 含义 |
|---|---|---|
| `hitSquashEnabled` | **1** | 开 |
| `hitSquashMode` | **1** | **沿命中方向压缩**（非整体等比缩放） |
| `hitSquashAmount` | **0.45** | 压缩量；方向模式下沿箭轴缩到约 55% |
| `hitSquashCompensation` | **1** | 垂轴体积补偿开 → 垂直方向约 **1.35×** 变高 |
| `hitCompressTime` | **0.1 s** | 压到目标用时 |
| `hitReleaseTime` | **0.1 s** | 开始弹簧回弹的时刻（自命中起算） |
| `hitSpringFrequency` | **5.2 Hz** | 回弹频率 |
| `hitSpringDamping` | **0.25** | 阻尼 |
| `hitSquashTime` | **2 s** | 缩放通道总寿命（末尾收束） |

实现：`hit-deformation.ts` 用 `R⁻¹ D R`，在局部把「沿箭」轴缩短、垂轴按补偿拉长；方向取**最近一次命中箭的水平方向**，不随怪转身改。

与击退关系：**压缩时钟与击退时钟从 t=0 并行**。体积补偿导致受击瞬间变高，是「主动后跳」误读的已知贡献因素之一。

**PLAN 约定：** 弯曲与方向压缩**叠加**；不替换、不关掉 `hitSquashMode=1`。

### 3.3 白色亮边（Rim）

| 键 | 当前值 |
|---|---|
| `hitRimEnabled` | **1** |
| `hitRimTime` | **0.16 s** |
| `hitRimFadeStart` | **0.08 s** |
| `hitRimStrength` | 1 |
| `hitRimBrightness` | 2 |
| `hitRimWidth` | 0.65 |

命中后保持亮度至 `FadeStart`，再二次方淡出。PLAN **不改 rim**。

### 3.4 眼睛受击（Eye-hit）

| 键 | 当前值 |
|---|---|
| `eyeHitEnabled` | **1** |
| `eyeHitPull` | 3 |
| `eyeHitPullTime` | 0.12 s |
| `eyeHitHoldTime` | 0.005 s |
| `eyeHitReturnTime` | 0.04 s |
| `eyeHitDepth` | 1.25 |
| `eyeHitAbsorbTime` | 0.075 s |
| `eyeHitRestoreSpeed` | 2 |
| `eyeHitMinimumStrength` | 0.45 |
| `eyeHitReferenceSpeed` | 12 |
| `eyeHitTetherEnabled` | 1（颈／根／尖 tether 系数另存） |

相位：pull → taut → return → absorb → restore；pull／return／absorb 各有 Progress 曲线。强度与 `knockInitialSpeed` 相关。

史莱姆另有眼睛挂点／形变／弹出等（`slimeEye*`），与 eye-hit 通道配合。当前 `slimeEyeY = 1.15`。

**PLAN 约定：** C 弧**峰值高度对齐眼睛挂点**；眼睛仍走**现有 eye-hit**，不为弯曲新做一套眼球滞后。

### 3.5 飞溅与汁液

| 键 | 当前值 | 备注 |
|---|---|---|
| `hitSplashSheetsEnabled` | **1** | 液片开 |
| `hitSplashParticlesEnabled` | **1** | 跟随汁滴开，count 33 |
| `juiceEnabled` | **0** | **旧版黄色汁液迸发关闭** |
| `monsterHitSpeed` | **2** | 训练场怪物受击相关速度倍率 |

PLAN **不改** splash／juice。

### 3.6 其它并存系统（勿与普通箭弯曲混淆）

params 中还有大量 **burst（撑爆）**、**slimeInflation（鼓胀）**、**cameraShake**、颜料／液面等。它们是史莱姆玩法其它阶段；**本弯曲 PLAN 的非目标**包括：不预先改鼓胀／burst 与顶点弯曲的叠加顺序（若实现后穿模再单开一轮）。

---

## 4. 模块与数据流（现网）

概念顺序（普通箭命中训练反馈）：

```
命中 → HitResponse 快照（方向、曲线拷贝、age=0）
每帧：
  1) 根节点水平击退（knockProgress）
  2) 压缩量 → hitDeformation 矩阵（方向模式）→ 乘到模型
  3) rim 强度
  4) face／眼睛：eye-hit 偏移叠在挂点上
  5) splash／juice（若开启）按各自延迟发射
```

关键文件：

- `src/hit-response.ts` — 击退、压缩弹簧、rim
- `src/hit-deformation.ts` — 方向压缩矩阵
- `src/hit-feedback-config.ts` — HIT_DEFAULTS／LIMITS／控件文案
- `src/eye-hit-motion.ts` — 眼睛相位
- `src/training-feedback.ts` — 训练场把上述接到具体怪物
- `src/yellow-slime-model.ts` — 史莱姆 mesh
- `public/params.json` — 已保存手感真相源
- `tests/hit-feedback.test.ts` — 击退／反馈单测

侧栏分类：`hit`（受击 · 反馈与调试）；手动击退曲线编辑器仅在 `hitKnockCurveMode===1` 时显示。

---

## 5. 为何还要做「水平月牙弯曲」（与 PLAN 的衔接）

### 5.1 问题陈述

在现有参数下（D=3、T=0.2、手动前重曲线、方向压缩 0.45 + 补偿 1），击退速度曲线读起来可以，但整体仍容易像**自己向后跳**，而不是**被外力打弯再刹住**。

已有但仍不足的杠杆：手动曲线、方向压缩、rim、eye-hit。  
仍缺的可读线索（已在讨论中对齐）：

- 身体**弯／倾**与**脚钉地**
- 命中因果的**姿态时序**（先成 C，再上半后仰，再过冲弹回）
- 停止时的姿态标点

### 5.2 已对齐的解决方案（详见 PLAN 正文）

- 俯视 3D：**水平面（XZ）月牙 ⊂**，内部朝箭来侧
- 三拍：成 C → 方案 A 上半再转后仰 → 过冲弹回
- 仅黄色史莱姆；**整块 body 顶点弯曲**
- 与现有方向压缩**叠加**
- 脚层水平几乎不位移；根节点击退照旧
- 眼睛：峰值对齐眼高 + 现有 eye-hit

### 5.3 预览与游戏的空间差（审核时勿搞混）

| 预览 `knockback-force-feel` | 游戏 ArcheroRemake |
|---|---|
| 侧视 2D Canvas | 俯视 3D WebGPU |
| C 画在纸面竖直剖面 | C 必须画在**地面水平面**才可读 |
| 参数对齐游戏 squash／knock 量级 | 以本节 params 为准 |

**禁止**把 2D 侧视的竖直剖面弯曲直接搬进游戏当最终形态。

---

## 6. 给 NotebookLM 审核 PLAN 时的检查清单

审核 `hit-horizontal-bend-plan.md` 时，请核验：

1. **是否保留本节全部现有通道**（击退／方向压缩／rim／eye-hit／splash），弯曲只作叠加层。  
2. **是否误改** `hitKnockCurve`、`hitSquashMode`、eye-hit 曲线语义。  
3. **空间语义**：水平 ⊂、内部朝迎箭、脚钉、眼高峰值——与预览侧视的映射是否写死、无歧义。  
4. **范围**：仅史莱姆；蜘蛛等跳过。  
5. **载体**：顶点弯曲；否决分层假脊柱作为起步。  
6. **时序**：三拍 + 可调 follow delay；方案 **只做 A**，不做 B。  
7. **合成顺序**是否与现网 HitResponse／hitDeformation／face 挂点兼容。  
8. **授权门槛**：文档不得暗示「已批准开工」；须等用户「按这个做」。  
9. **参数**：拟定 `hitBend*` 键未写入 params 前不得当作已上线事实；默认值可引用预览，但须标明「拟定」。  
10. **连击重置**：若 PLAN 假设与现网「每次命中重置时钟」不一致，必须标成待确认，禁止静默发明。

---

## 7. 一句话现状摘要（便于检索）

ArcheroRemake 是 Three.js/WebGPU 俯视 Archero 训练原型；普通箭受击已具备**手动前重击退（D=3,T=0.2）+ 方向压缩 0.45（补偿变高）+ 短 rim + eye-hit + 液片／汁滴（juice 关）**；缺的是**水平月牙弯曲姿态**。弯曲 PLAN 已对齐设计、**未授权实现**；本文提供审核该 PLAN 所需的项目与参数事实。
