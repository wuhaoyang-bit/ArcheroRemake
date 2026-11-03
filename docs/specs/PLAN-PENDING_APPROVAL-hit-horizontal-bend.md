<!--
NotebookLM 终审：合格（必须修改清单：无）
对话：d53b54ba-6544-4077-a344-bbe80eef4d71
送审源：13-PLAN-终审送审稿-已锁初值 · 终稿源：14-PLAN-PENDING_APPROVAL-终审合格
日期：2026-11-03
用户已锁：8.1A / 8.2A / 8.3B · hitBendMax=0.4 · 全部 HIT_DEFAULTS 初值已同意
未授权实现：须用户明确「按这个做」后才改游戏代码
-->

# PLAN-PENDING_APPROVAL：黄色史莱姆受击水平月牙弯曲

## 元数据

| 项 | 内容 |
|---|---|
| 功能 | 黄色史莱姆受击时在水平面（XZ）弯成月牙 ⊂；三拍：成 C → 方案 A 上半再转 → 过冲弹回 |
| 日期 | 2026-11-03 |
| 状态 | **PENDING_APPROVAL · 未授权实现**（选型与初值已锁；须用户回复含「按这个做」后才改游戏代码） |
| DIR notebook | `DIR-ArcheroRemake-20261103-Grok受击弯曲与击退读感`（`65086c62-9b8b-4185-b5c4-49e1620b6d4f`） |
| 审核对话 | `d53b54ba-6544-4077-a344-bbe80eef4d71` |
| 背景源 | 07 现状 · 09 坑检索 · 11 防发挥 · 13 送审稿 · 14 终审合格 |
| 预览 | `/Users/racio/trr-boards/knockback-force-feel/` |
| 选型页 | `/Users/racio/trr-boards/hit-bend-tech-choices/` |
| 用户已锁定 | **8.1A · 8.2A · 8.3B · hitBendMax 默认 0.4 u · 第 9 章初值全部同意** |

---

## 0. 已对齐结论（禁止偏离）

| 项 | 对齐内容 |
|---|---|
| 效果套件 | 三拍：**成 C → 上半后仰（方案 A）→ 过冲弹回** |
| C 形状 | 侧向 ⊂：内部朝迎箭；中段向击退弓出 |
| 3D 空间 | **水平面 XZ** |
| 范围 | **仅黄色史莱姆** |
| 与方向压缩 | **叠加** `hitDeformation`（mode=1）；不替换 |
| 载体 | body **直接写 `position.array`**（RoundedBox；禁止 MorphTarget） |
| 坐标系 | 高度用底座坐标 **`yBase = rest.y + 1.0`**（`body.position.y=1`，几何半高 1 → 脚≈0、顶≈2） |
| 脚钉 | `yBase ≤ hitBendFootLockY` → 水平位移 = 0；root 击退仍由 `HitResponse` |
| 剖面 | **8.1A** smoothstep（§8） |
| 腰线默认 | **8.2A** `HIT_DEFAULTS.hitBendWaistY = 0.5 * hitBendPeakY`（仅默认；运行时两滑条独立） |
| 幅度 | **8.3B** `hitBendMax` 单位 **u**，默认 **0.4** |
| 后仰公式 | **仅**沿 `outDir` 切向加算（禁止绕 Y 旋转顶点） |
| 弹回 | `import { spring } from './hit-response.ts'`；允许过冲 |
| 眼睛 | 对静止眼点做同一套水平弯，再叠现有 eye-hit（禁止每帧搜顶点） |
| 连击 | 每次命中重置 `bendAge` + 深拷贝 bend 参数与 `outDir` |
| 改参生效 | **仅下次命中** |
| 法线/包围体 | V1 **禁止**每帧 `computeVertexNormals` / `computeBoundingSphere` |
| 多实例 | 每史莱姆 **独立** geometry + `restPositions` |

---

## 1. 非目标

- 不改蜘蛛等其它怪物  
- 不用分层假脊柱、MorphTarget、GPU compute、新 npm 依赖  
- 不替换 `hit-deformation.ts`；不改 eye-hit 语义；不改击退曲线  
- 不把 2D 预览打进 Vite 构建；不改 `knockback-force-feel`  
- 不新增第 5 章未列面板字段（含 `tailLength`、`recomputeNormals`）  
- 不改 slimeInflation / burst 代码；弯曲只写 body 顶点，其后矩阵链照旧  

---

## 2. 技术绑定

| 能力 | 绑定 | 用法 |
|---|---|---|
| three / RoundedBox | `three@0.186.1`；`RoundedBoxGeometry` addon | 已 non-indexed；**勿再** `toNonIndexed` |
| 弹簧 | `src/hit-response.ts` → `spring` | 唯一弹簧实现 |
| 三拍权重 | `trr-boards/knockback-force-feel/app.js` → `bendWeights` | 移植为 `calculateBendWeights` |
| 方向压缩 | `src/hit-deformation.ts` | 弯后再乘 |
| 击退 age | `HitResponse` | 命中重置对齐 |
| 模型 | `yellow-slime-model.ts` | 每实例独立 geo + `restPositions` |
| 接入 | `training-feedback.ts` | 仅史莱姆 |
| 面板 | `HIT_DEFAULTS` / `LIMITS` / `CONTROLS` + `main.ts` 受击分类 | 第 5 章全键 |
| 顶点协议 | [BufferAttribute.needsUpdate](https://threejs.org/docs/#api/en/core/BufferAttribute.needsUpdate)；[discourse #47232](https://discourse.threejs.org/t/animate-vertices-position-of-boxgeometry/47232)；[discourse #82030](https://discourse.threejs.org/t/updating-attributes-on-buffergeometry-for-webgpu/82030) | `DynamicDrawUsage`；原地改 array；`needsUpdate` |
| 禁 Morph | [GitHub #24243](https://github.com/mrdoob/three.js/issues/24243)；[discourse #70128](https://discourse.threejs.org/t/mesh-changes-position-when-trying-to-compute-morph-changes/70128) | — |

---

## 3. 数据流与合成顺序

```
命中（黄色史莱姆）
  → outDir = HitResponse.direction 的水平单位向量 (x, z)
  → bendAge = 0
  → bendSnap = 深拷贝当前全部 hitBend*（本次受击只读 bendSnap）

每帧：
  if 当前 hitBendEnabled === 0:          // 读当前设置，非 snap
      position.array.set(restPositions); needsUpdate = true; 跳过弯曲
  else if 非史莱姆:
      跳过弯曲
  else:
      belly, upper = calculateBendWeights(bendAge, bendSnap)
      对每个顶点:
          yBase = rest.y + 1.0
          w = profileSmoothstep(yBase, footLockY, peakY)   // §8.1A
          if yBase <= footLockY:
              horiz = 0
          else:
              horiz = hitBendMax * belly * w
              if yBase > waistY:
                  t = smooth01((yBase - waistY) / max(1e-6, bodyHeight - waistY))
                  horiz += hitBendMax * hitBendFollowAmount * upper * t
          position.xz = rest.xz + outDir.xz * horiz
          position.y = rest.y
      needsUpdate = true
      禁止 computeVertexNormals / computeBoundingSphere
      眼点：body 局部 pEyeRest = (0, slimeEyeY - 1.0, 0)
            用同一套 horiz 公式得 pEyeBent；face 跟 pEyeBent，再叠现有 eye-hit
      然后现有 hitDeformation 作用在 visual（不改其内部）
      root 平移仅 HitResponse
      bendAge += dt
```

防发明说明：

- 每帧从 `rest` 重算；`belly=upper=0` 时自然回 rest，禁止另写「弹簧平息超时」启发式  
- `hitBendEnabled===0` 时强制 `set(rest)`  

常量：`bodyHeight = 2`。

---

## 4. 实现步骤

### A — 配置挂载

新建 `src/hit-bend-config.ts`；并入 `hit-feedback-config.ts` 的 DEFAULTS / LIMITS / CONTROLS（第 5 章）。键为 `0/1` 或 `number`，禁止 boolean 字段类型。

### B — `hit-bend.ts`

- `smooth01` / `profileSmoothstep` / `calculateBendWeights` / `applyHorizontalBend`  
- 权重移植预览 `bendWeights`；弹簧只用 `hit-response.spring`  
- 高度一律 `yBase = rest.y + 1`  

### C — `yellow-slime-model.ts`

- `position.setUsage(DynamicDrawUsage)`  
- `restPositions = new Float32Array(position.array)`  
- **每个** `createYellowSlimeModel()` 新建 geometry（禁止多怪共享同一 `BufferGeometry`）  

### D — `training-feedback.ts`

- 命中快照 `bendSnap` + `outDir`；每帧按 §3  
- 非史莱姆不调用 bend  

### E — settings / controller / main

- 与其它 `hit*` 数值字段同一路径；文案标明下次命中生效  

### F — `tests/hit-bend.test.ts`

- 相位、过冲、脚锁 `yBase`、`enabled=0` 写回 rest、权重为 0 时等于 rest  

### G — 浏览器验收

- 训练场史莱姆俯视月牙；蜘蛛不变；压缩 / 击退 / eye-hit 仍在  

---

## 5. 调试面板参数（初值已同意）

| 键 | 单位 | LIMITS | 默认 | 文案 |
|---|---|---|---|---|
| `hitBendEnabled` | 0/1 | 0–1 step1 | **1** | 史莱姆水平弯曲 |
| `hitBendMax` | u | **0–1.5 step0.01** | **0.4** | 成 C 最大水平幅度 |
| `hitBendFormTime` | s | 0.02–0.5 step0.01 | **0.10** | 成 C 用时 |
| `hitBendFollowDelay` | s | 0–0.5 step0.01 | **0** | 后仰延迟 |
| `hitBendFollowTime` | s | 0.02–0.5 step0.01 | **0.12** | 后仰用时 |
| `hitBendFollowAmount` | 比例 | 0–2 step0.05 | **0.85** | 方案 A 后仰幅度 |
| `hitBendSpringFreq` | Hz | 0.5–12 step0.1 | **4.5** | 弹回频率 |
| `hitBendSpringDamp` | 比例 | 0.05–2 step0.05 | **0.28** | 弹回阻尼 |
| `hitBendFootLockY` | u（yBase） | 0–0.5 step0.01 | **0.10** | 脚锁高度 |
| `hitBendPeakY` | u（yBase） | 0.2–2 step0.01 | **1.15** | 峰值（对齐 slimeEyeY） |
| `hitBendWaistY` | u（yBase） | 0.1–2 step0.01 | **0.575** | 方案 A 腰线（=0.5×1.15） |

未获「按这个做」前不把这些键写入用户已保存的 `params.json`（接入后由面板保存产生）。

---

## 6. 验收清单

1. 俯视 ⊂，内部朝箭来侧  
2. 三拍可辨  
3. `yBase ≤ footLockY` 时水平 delta ≈ 0  
4. 仅史莱姆  
5. 压缩 / rim / 击退 / eye-hit 仍可用  
6. 连击重开时钟与方向  
7. `enabled=0` → 几何 = rest  
8. 单测通过；多史莱姆互不串改顶点  

---

## 7. 禁止清单（执行 AI 硬禁）

1. 禁止新库；弹簧只能 `hit-response.spring`  
2. 禁止 MorphTarget / GPU compute 起步  
3. 禁止用 `rest.y ∈ [-1,1]` 直接比 footLock；必须 `yBase = rest.y + 1`  
4. 禁止每帧 `computeVertexNormals` / `computeBoundingSphere`  
5. 禁止改 eye-hit / hitKnock 曲线语义  
6. 禁止多实例共享 geometry  
7. 禁止受击中途读面板；只用命中快照  
8. 禁止 `enabled=0` 残留弯曲；必须写回 rest  
9. 禁止新增未备案 UI 键  
10. 禁止改 2D 预览或打进游戏构建  
11. 禁止方案 A 用绕 Y 旋转顶点；只用 `outDir` 切向加算  
12. 禁止为 tail 加面板参数；`tail = 0.25 * bodyHeight = 0.5` 写死  

公开依据见 NotebookLM 源 `09` / `11`。

---

## 8. 第 8 章锁定（禁止再议）

### 8.1A — smoothstep 剖面

```
bodyHeight = 2
tail = 0.5   // 0.25 * bodyHeight，写死，无面板

profile(yBase):
  if yBase <= footLockY: return 0
  if yBase <= peakY: return smooth01((yBase - footLockY) / (peakY - footLockY))
  return 1 - smooth01((yBase - peakY) / tail)

水平 C: delta = outDir * (hitBendMax * belly * profile(yBase))
```

### 8.2A — 腰线默认

- `HIT_DEFAULTS.hitBendWaistY = 0.5 * HIT_DEFAULTS.hitBendPeakY`（当前 0.575）  
- 面板仍暴露两滑条；**运行时互不自动改写**  

### 8.3B — 世界单位 u

- `hitBendMax` 单位 u；默认 0.4；LIMITS 0–1.5 step 0.01  
- 禁止角度换算路径  

### 方案 A 上半切向

```
if yBase > waistY:
  t = smooth01((yBase - waistY) / max(1e-6, bodyHeight - waistY))
  delta += outDir * (hitBendMax * hitBendFollowAmount * upper * t)
```

---

## 9. 初值（用户已同意）

| 键 | HIT_DEFAULTS |
|---|---|
| `hitBendEnabled` | 1 |
| `hitBendMax` | **0.4** |
| `hitBendFormTime` | 0.10 |
| `hitBendFollowDelay` | 0 |
| `hitBendFollowTime` | 0.12 |
| `hitBendFollowAmount` | 0.85 |
| `hitBendSpringFreq` | 4.5 |
| `hitBendSpringDamp` | 0.28 |
| `hitBendFootLockY` | 0.10 |
| `hitBendPeakY` | 1.15 |
| `hitBendWaistY` | 0.575 |

获「按这个做」后，将上表写入 `HIT_DEFAULTS`（及对应 LIMITS/CONTROLS）。

---

## 10. 授权门槛

- 本文 ≠ 已开工；**本文件落盘不等于允许改游戏业务代码**  
- 实现中与本文冲突：停写，先问  
- 批准口令：用户回复须包含 **「按这个做」**  
- 执行 AI **不得**自行将本文件改名为 `PLAN-APPROVAL-*`  

---

## 终审结论

**合格。** 必须修改清单：无。  
8.1A / 8.2A / 8.3B 与 HIT_DEFAULTS 初值已完全锁定；无待定选型。  
本文仍为 `PENDING_APPROVAL`；须用户明确「按这个做」后方可开始游戏代码实现。
