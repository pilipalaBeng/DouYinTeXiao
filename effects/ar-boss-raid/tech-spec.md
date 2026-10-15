# ar-boss-raid · 平台能力核实结论 + 技术架构与性能预算（tech-architect / 柯桥良）

> 核实方式（不是拍脑袋）：本机**像塑 MCP 正在运行**（`xiangsu-mcp-manager` @ `http://127.0.0.1:17320/mcp`，health=ok，在线实例 1 个）。直接拉取了 MCP 的 **28 个工具全清单**，并通读了像塑内置工作区（`D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\McpTool\resources\`）下的 `skills/`（ability + routing + workflow）、`rules/`（general / scene-common / scene-game / validation）与 `workspace/APJS/*.d.ts`（引擎脚本类型定义）。**下列判定均标注依据与置信度；无法确证的标「待实测」并给实测方法，没有编造。**

---

## 0. 结论速览（TL;DR）

1. **摄像头背景**：**能做，且是平台默认底**。像塑里即「摄像头透传」，它是**平台底层**，不占图层预算；规则明确禁止用整屏背景图/整屏蒙层盖住它。→ **6 层预算里没有「摄像头层」。**
2. **瞄准方式（v2 · 链路已跑通；真机手感待验）**：**AR 空间锚定 + 屏幕正中固定准星 + 转手机瞄准 = 唯一主案**。官方对象 **`AR Plane`（configId `PlaneAR`）** 一键搭出 AR 场景，**自动创建 `AR Camera` + `DeviceTracker` 组件**（`trackingMode` 当前 = `World`，6DoF 全 3D 世界跟踪）；Boss 为 **3D 版 `Image` 对象（`ImageEntity`）**，锚定在真实 3D 世界坐标。命中判定 = `arCamera.worldToViewportPoint(worldPos)` 归一化视口容差 **0.17**（见 §2.7）。**手指拖准星（v1）已弃用；手搓陀螺仪 `@alpha` 方案（v1）已弃用。**
   - ⚠️ **口径（防误读，同 §2.5）**：这里的"**已跑通**"**仅指**——① 对象/组件**可搭**（`AR Plane` 自动建 `AR Camera`+`DeviceTracker`，编辑器实测）；② 判定式**归一化已实测**（`vp.y≈0.522`，`implement-plan §10c`）。**"转手机把 Boss 转进准星"的玩法手感依赖真机 SLAM，尚未验证**（`node-plan §7 待实测清单` #3 真机验证、#8 跟手性；**#8 明写"PC 预览无 SLAM，不作手感判据"**）。**不得把"已跑通"当手感已验证引用。**
3. **连续射击（按住持续开火）= 能做**，触摸 API 完整（phase / touchId / touchCount）；**v2 语义：`TouchData.position` 仍存在，但只用于「按下/抬起」判定开火，不再用于瞄准定位**。
4. **准星 = 固定屏幕正中**（v2 **不可拖拽**）；玩家转动手机改变 AR 相机朝向 → Boss 在屏幕上相对滑动以进入准星。
5. **动态血条 UI = 能做**，TypeScript 脚本（APJS）运行时改数值 + 2D Image/Text，官方支持。
6. **读取用户好友列表 = 不能做**（平台无任何社交/好友 API）。**头像来源 = 双轨（v2.1，见 §9）**：**轨 A = 预设 6 选 1 像素头像**（本轮实现 / 默认兜底 / 12 张资产已产出）；**轨 B = 摄像头取像**（`APJS.CaptureFrameHelper.captureCameraOutput`，**API 存在性已核；运行时行为未验**）。**旧稿「相册选图 `Image Picker (Head)`」已废止**（本版编辑器不支持，实测报 `Unknown scene object config id`；APJS 无 picker API）。
7. **分享/结算图 = 部分能做**：抖音特效的「分享」是宿主（抖音 App）行为，特效内可做**结算画面**，但**不能**由特效直接调用分享 SDK 或生成外部分享链接（待实测确认宿主暴露程度）。
8. **触发方式 = 定为 2 种**：① 触摸按下/抬起（射击）② 人脸事件（张嘴/眨眼，触发「重击」）。**AR 相机朝向（转手机）属操控输入、不占触发额度**；人脸**挂点**算载体、同样不占额度。
9. **包体（中值口径 · ⚠️ 非结论）**：估算 **总包体 ≈ 1.45 MB**（贴图 ≈0.275 + **53 个序列帧文件** ≈0.83 + **26 个音频资产** ≈0.349），**余量仅 ≈1.4 倍**。**最坏口径 ≈2.10–3.00 MB，会破 2MB 红线**（三档表见 §3.2；**唯一判定依据 = 首批导出 1 张最复杂序列帧读 `artifactFileSize` ≤ 26.8 KB**，见 §3.2.1）。旧稿"≈0.2–0.4 MB / 余量 5–10 倍"**作废**（只算 9 张静态贴图 + 4 个音效，**漏了 53 个序列帧文件**）。**前提 = 必须开纹理压缩 + `Max Resolution=Size512`**，否则约 90 张 512×512 未压缩 = **≈90 MiB（爆红线 ≈45 倍）**。

---

## 1. 平台能力核实（逐项：能做 / 不能做 / 降级替代 + 依据 + 置信度）

| 能力 | 结论 | 依据（可复核） | 置信度 |
|---|---|---|---|
| **手机摄像头实时画面作背景** | ✅ 能做（平台默认底层） | `rules/scene-common.md`「摄像头与背景」：**默认使用摄像头透传作为底层背景**；AR 玩法**禁止**整屏背景/蒙层覆盖摄像头 | 高（官方规则原文） |
| **AR 场景（官方对象）** | ✅ **已实测**：`AR Plane`（configId `PlaneAR`）一键搭 AR 场景，**自动创建 `AR Camera` + `DeviceTracker`** | 本机像塑实测（主程序验证） | 高（**实测**） |
| **DeviceTracker 跟踪模式** | ✅ `trackingMode` ∈ **{ `World`(默认，6DoF 全 3D 世界跟踪)、`Surface`(地面平面)、`Ceiling`(天花板)、`Orientation`(仅水平朝向 3DoF，更省性能) }** | 本机像塑实测 | 高（**实测**） |
| **3D `Image` 对象（世界锚定 Boss）** | ✅ `ImageEntity`（3D 版 Image），可 `getWorldPosition()`；配合 `arCamera.worldToViewportPoint` 做归一化命中判定 | 本机像塑实测 | 高（**实测**） |
| **世界/SLAM 平面跟踪** | ⚠️ 运行时存在；**真机有 SLAM（转动即时响应）；PC 预览无 SLAM（约 4s 收敛）** | `APJS_runtime.d.ts` 有 `getSlamInfo()`；`AR Plane`/`DeviceTracker` 实测可挂 | 中（PC 预览行为已实测，真机待验） |
| ~~**设备姿态/高度传感器（GyroSensorAgent 等）**~~ | ❌ **用户脚本层不存在**（2026-10-14 运行期探测 11 项全负：`GyroSensorAgent`/`RotationSensorAgent`/`AccelerometerAgent`/`Gyroscope`/`SensorAgent`/`buildGyroSensorAgent` 全 `undefined`；`DeviceTracker` 仅 `_rtti/_typedRtti`；`AlgorithmManager.getSlamInfo` 亦 `undefined`） | 本机像塑运行期探测（`SensorProbe`） | **高（实测）** → 「下蹲改变高度躲避」不可实现，**整条砍**（game-design §14.3） |
| **3D 世界锚定对象能否被脚本驱动位置** | ✅ **能**：`Transform.setWorldPosition(Vector3f)` 写入后回读恒等（实测误差 0），预览中对象确实位移；AR 追踪**不覆写**脚本写入 | 本机像塑运行期实测（`updateFly` 的 write→readback 对照） | **高（实测）** → 飞行怪可做（game-design §14.2） |
| **陀螺仪 / 设备运动用于瞄准** | ❌ **v2 不采用**（改由官方 `DeviceTracker` 承担设备朝向）；`GyroSensorAgent` 等仍为 `@alpha`，无需触碰 | `APJS_runtime.d.ts`：`buildGyroSensorAgent` 等均 `@alpha` | 高（**已弃用**） |
| **触摸点击/长按/多点触控射击** | ✅ 能做，完全支持（v2 语义：只判「按下/抬起」开火，不定位准星） | `skills/ability/Touch/SKILL.md`：`APJS.EventType.Touch`，`TouchData{phase,position,force,touchId,touchCount}`，`TouchPhase.Began/Moved/Ended/Canceled` | 高 |
| **准星固定屏幕正中** | ✅ 能做（v2 主案；准星不再跟随任何输入） | 常驻 `Crosshair`（Screen Image，居中），不接 Touch | 高 |
| ~~准星跟随（手指/拖拽）~~ | ❌ **v1 旧口径，已弃用** | 原「Drag / Follow Finger Pattern」+ `ScreenTransform.anchoredPosition` | — |
| ~~准星跟随（陀螺仪 / 转头）~~ | ❌ **v1 旧口径，已弃用**（v2 瞄准由 `DeviceTracker` 承担） | 原 `HeadTracker` `face.yaw/roll/pitch` | — |
| **动态血条 UI（运行时改数值）** | ✅ 能做 | 脚本体系：`edit_by_dsl(add_script/edit_script)` + TypeScript(APJS)；UI 走 `Screen Image`/`2D Text`（`skills/ability/ScreenTransform/SKILL.md`）。引擎另有 `Tween`、`Text2D` | 高 |
| **脚本可用范围** | ✅ **TypeScript（APJS 全局，无需 import）** | `rules/general.md`：脚本只能用 `edit_by_dsl(add_script)` 创建；APJS 类型经全局 `APJS.*` 使用；编译校验 `run_otsc_check` | 高 |
| **读取用户好友列表** | ❌ **不能做** | 通读 `APJS/*.d.ts`、`skills/`、`rules/`、`knowledge/`：**无任何社交/通讯录/好友 API 符号**。（全文 grep `friend\|social\|contact` 的 21 处命中**均为误命中**——物理"碰撞接触"与 C++ `friend` 关键字；**无一为社交 API**） | 高（**缺失即证据**） |
| ~~**相册选图（替代路径）**~~ | ❌ **已废止** | **本版编辑器不支持**：实测报 `Unknown scene object config id`；**APJS 无 picker API**（全量核过声明文件）。知识库中 `Image Picker (Head)` 的描述**不适用于本版本** | — **改用 → §9 双轨**（轨 A 预设 / 轨 B 摄像头取像） |
| **抖音头像直接读取** | ❌ 不能（无 API） | 同上，无用户身份/头像 API | 中高 |
| **二维码/口令传参、外部数据注入** | ❌ 不能 | 特效运行态封闭，无网络输入/深链注入能力暴露 | 中高 |
| **分享 / 生成可分享结算图** | ⚠️ 部分：结算画面可做；**分享动作属宿主** | 特效内可做结算 UI；无「分享 SDK / 外部分享链接」API 暴露 | 中（**待实测**） |
| **序列帧动画** | ✅ 能做 | 内置 `Texture Sequence`（可配播放速度/循环）+ `AnimatedTexture`（`fps/playMode/loopCount`） | 高 |
| **粒子特效** | ✅ 能做 | `skills/ability/VFX/SKILL.md`：**10 个内置 VFX 模板**（Basic/Physics/Fire/Rain/Snow/Explosion/Firework/Fog/Lightning/Turbulence）+ `ParticleEmitter2D` | 高 |
| **相机震动 / 打击感** | ✅ 能做 | 同上「Camera Shake」「Game Juice Combo」 | 高 |
| **3D 骨骼 / 实时物理 / 服务器下发** | ❌ 不做（项目宪法平台边界） | `AGENTS.md` 第二节；且 2D 场景不必引入 | — |

### 「不能做」的三条，各配降级替代（强制）

| 不能做 | 降级替代方案 | 落地方式 |
|---|---|---|
| **读好友列表** | **双轨头像（v2.1，见 §9）**：**轨 A** = 预设 6 选 1 像素头像（默认兜底）；**轨 B** = 摄像头取像——把 Boss 头部对准"想贴上去的人"，抓 AR 画面 → 运行时纹理贴到 Boss 头部挂点 | **轨 A 本轮实现**；**轨 B 待真机验证**（API 存在性已核，运行时行为未验）；**轨 A 永远是兜底**（轨 B 失败不阻断玩法） |
| ~~陀螺仪精确瞄准~~ | **v2 改由官方 `DeviceTracker` 承担设备朝向与锚定（已实测"可挂"；真机 SLAM 手感待验）**；**不手搓 `GyroSensorAgent`（@alpha）** | `AR Plane` 自动创建 `AR Camera` + `DeviceTracker`；`trackingMode=World` |
| **特效内直接分享** | 只做**结算画面**（含「长按保存/分享」提示文案），分享交给抖音宿主；不伪造分享按钮 | 结算页 CTA 走平台录制入口，不新造外部分享链路 |

### 待实测项（附实测方法，MCP 可跑）

| 待实测 | 方法（可执行） |
|---|---|
| **AR 相机真机跟手性（SLAM）** | 真机预览：转动手机看 Boss 是否**实时滑入准星**；**PC 预览无 SLAM（约 4s 收敛），不作手感判据** |
| `getSlamInfo().planeDetected` / `DeviceTracker` 模式切换是否可用 | 最小脚本打印 `trackingMode` 与 `planeDetected` → 真机验证（`World`/`Surface`/`Ceiling`/`Orientation` 切换） |
| 宿主是否暴露分享/保存能力 | 在预览录制流程里观察可用事件；查最新官方文档（规则可能随时变化） |
| **摄像头取像（轨 B）真机行为** | 见 §9 与 `node-plan §7` 待实测清单第 10 项：① 取到的是**原始画面**还是**最终合成输出**（是否含自身 Boss/HUD）② 竖屏下方向/长宽比 ③ `CLIENT_STATE_PREVIEW` 与真机 `capture` 下可否调用 ④ 返回纹理是**引用还是拷贝**（"定格"是否成立） |

> ✅ **已闭合（2026-10-14 实测）**：① **设备姿态/高度传感器不存在**（脚本层无任何入口）→ 砍吐火球 + 下蹲躲避；② **3D 世界锚定 Transform 可被脚本 `setWorldPosition` 驱动**（write→readback 误差 0，AR 追踪不覆写）→ 飞行怪按 `sin` 位移实现可行。**两条均已从"待实测"转为"已实测"，见 §1 能力表。**

---

## 2. 工程架构

### 2.1 分层图（**图层 ≤6 硬约束**；摄像头不占层）

> **v2 结构变化（AR 空间锚定）**：Boss 不再是屏幕空间 2D 贴图，而是**锚定在真实物理空间 3D 坐标**的 `ImageEntity`。为此场景新增一条 **AR 追踪链**（`AR Camera` + `DeviceTracker`，归入 `ARTracking` 组）；Boss 归 3D 世界渲染，准星/HUD 仍归 2D 屏幕渲染。**AR 追踪链是「结构层/相机载体」，不是渲染图层，不计入 6 层**（与摄像头透传同理）。

```
┌───────────────────────────────────────────────────────┐
│ [平台底层 · 不计入 6 层] 摄像头透传 / 真实环境画面        │  ← 平台默认，禁止整屏覆盖
├───────────────────────────────────────────────────────┤
│ [AR 追踪链 · 结构层 · 不计入 6 层]                       │  ← v2 新增
│   ARTracking 组  └─ AR Camera ── DeviceTracker(World)  │  AR 相机渲染 3D 世界；DeviceTracker 供 6DoF 朝向
├───────────────────────────────────────────────────────┤
│ L6  状态页层   READY / WIN / LOSE / RESET               │  独立父对象，统一承载遮罩+面板+CTA
├───────────────────────────────────────────────────────┤
│ L5  HUD 层     血条(底+条) / 阶段提示 / 连击             │  2D Text + Screen Image（屏幕空间）
├───────────────────────────────────────────────────────┤
│ L4  命中反馈层  命中粒子 / 伤害弹字 / 屏幕震动            │  VFX + 2D Text + Camera Shake
├───────────────────────────────────────────────────────┤
│ L3  武器层      枪贴图 / 准星（固定屏幕正中）/ 枪口闪光    │  2D Screen Image（屏幕空间，**不接 Touch**）
├───────────────────────────────────────────────────────┤
│ L2  Boss 主体层  3D ImageEntity（世界锚定）/ 头像挂点      │  命中判定主体；随 AR 相机朝向在屏幕滑动
├───────────────────────────────────────────────────────┤
│ L1  氛围装饰层   少量环境粒子/装饰（可空，可延后）          │  禁止整屏；仅局部
└───────────────────────────────────────────────────────┘
```

层级顺序遵循官方 `rules/scene-common.md`（底部摄像头 < 背景装饰 < 运动对象 < 命中反馈/HUD/弹窗）。
> **两套坐标体系必须分清**：L2 Boss 走 **3D 世界坐标**（`getWorldPosition()`，由 `AR Camera` 渲染）；L3–L6 走 **2D 屏幕坐标**（`ScreenTransform`）。**跨体系换算唯一入口 = `arCamera.worldToViewportPoint(worldPos)`**（见 §2.7）；除此之外不得在 2D/3D 之间手算坐标。

### 2.2 6 层分配方案（为什么这样合层）

| 层 | 名称 | 承载内容 | 渲染组/坐标体系 | 为什么必须这样合 |
|---|---|---|---|---|
| L1 | 氛围装饰层 | 局部粒子/装饰（**可留空**） | 3D/2D 装饰 | AR 玩法禁整屏背景，故只允许局部装饰；**留空也不违规**，给预算留头 |
| L2 | Boss 主体层 | Boss 身体（3D `ImageEntity` 世界锚定）+ **头部头像挂点** | **3D 世界坐标**（`AR Camera` 渲染）；头像走 **§9 双轨**（轨 A 预设贴图 / 轨 B **运行时纹理**——仍挂在同一 `Image` 组件上） | 身体与头像**必须同层/同一载体**：头像要跟 3D 身体刚性对齐；拆层会出现头像漂移 |
| L3 | 武器层 | 枪 + **准星（固定屏幕正中）** + 枪口闪光 | 2D `ScreenTransform`（屏幕空间，**准星不接 Touch**） | v2 准星固定不动，枪/闪光只需与准星同锚点对齐；三者合层便于统一缩放与居中 |
| L4 | 命中特效层 | 命中粒子 + 伤害弹字 + 震动 | VFX + `2D Text` + Camera | 全部由「命中事件」同帧触发，合层便于统一生命周期/回收 |
| L5 | HUD 层 | 血条（底图+填充）+ 阶段/连击提示 | 2D `2D Text` + `Screen Image` | 血条底与填充必须同层（同锚点对齐）；HUD 与 L4 分离是因为触发器不同（HUD 常显，L4 瞬时） |
| L6 | 状态页层 | READY / WIN / LOSE / RESET | 独立父对象 | 官方 `rules/scene-game.md`「状态页使用独立父对象」；独立层便于整页显隐与重置 |

> **必须合层的两处**：① Boss 身体+头像（避免漂移）② 枪+准星+闪光（与固定准星同锚点）。**必须拆开的**：HUD 与状态页（生命周期不同）。
> **AR 追踪链（`ARTracking` 组 / `AR Camera` / `DeviceTracker`）不计入 6 层**：它是相机与追踪载体（结构层），不是被渲染的图层；去掉它 3D Boss 无处安放。摄像头透传同理不占层。

### 2.3 目录树（遵守宪法 `effects/<slug>/`）

```
DouYinTeXiao/
├── AGENTS.md
├── shared/
│   ├── db16.gpl / db16.png            # DB16 调色板（跨特效复用）
│   └── placeholders/                  # 通用占位素材
└── effects/ar-boss-raid/
    ├── README.md
    ├── brief.json                     # 需求沉淀（含用户原话）
    ├── compliance.md                  # 本特效合规自检
    ├── node-plan.md                   # 场景/节点结构
    ├── storyboard.md                  # 分镜与验收
    ├── submit-checklist.md            # 导出与提审清单
    └── assets/
        ├── PLACEHOLDERS.md
        ├── boss/  gun/  crosshair/  fx/  ui/  audio/
        └── SOURCES.md                 # 素材来源/授权记录（合规必备）
```

### 2.4 命名规范

- 文件/资源：**英文小写 + 下划线**，禁中文/空格。如 `boss_body_idle.png`、`hp_fill.png`、`sfx_hit.mp3`。
- 序列帧：`anim_001.png` 起，**单动作 ≤24 帧**（`AGENTS.md` :55 ＝"**一个动作 clip**"上限，**非全特效总帧数**；多状态角色按动作分别计数）；**一个动作一个目录** `anm_<action>/`。
- 脚本（例外：脚本类名/变量走英文）：`BossRaidController`、`ShootHandler`。
- 场景对象：对象/资源 key 默认中文（官方规则），脚本/DSL command 走英文。

### 2.5 数据驱动：Boss 参数用配置文件还是节点参数？

**建议：脚本「序列化属性 + 常量」为主，不引入 JSON。（避免过度工程）**

| 方案 | 适用 | 结论 |
|---|---|---|
| `@serializeProperty` + 脚本常量（推荐） | 单 Boss、参数有限（HP/阶段/伤害/节奏） | ✅ 一体，Inspector 可直接调，最低维护成本 |
| JSON 资源（`add_builtin_resource("JSON")`，知识库确认存在） | 多 Boss / 多套数值需策划独立配 | ⚠️ 到那一步再说，现在不建 |

> 单 Boss 玩法用 JSON 属于伪需求；除非策划明确要多 Boss 配置，否则**不引入**。

### 2.6 状态机（Boss × 流程）

```
游戏流程(GameState):  READY ──touch/开拍──> FIGHTING ──HP<=0──> WIN
                          │                     └──timeout/HP>0且回合耗尽──> LOSE
                          └── (开拍/录制事件 → RESET 回 READY) ──┘

Boss 状态(BossState): IDLE ──受击──> HURT(短) ──回到──> IDLE
                            └──HP<=50% 首次──> ENRAGE(改变节奏)
                            └──HP<=0──> DEFEATED
```
- 官方要求：`rules/general.md`「编写脚本时维持好状态概念与切换（开始/命中/结束）」，`scene-game.md`「开拍/录制开始 → 先恢复初始状态再启动本轮」。
- 状态切换必须显式声明「哪些对象保留/隐藏/恢复」。
- **v2 输入语义**：`FIGHTING` 期间，**触摸「按下」= 开始连续开火、触摸「抬起」= 停火**（不再有「拖准星」在状态机里的位置）；**转手机改变 AR 相机朝向不改变任何状态**，它只是持续改变 Boss 投影位置（属操控输入）。

### 2.7 AR 命中判定（v2 · 唯一公式 · 公式已实测；真机手感待验）

> ⚠️ **口径同 §0**：**"已实测"指判定式本身**（归一化已验，`vp.y≈0.522`）；**不代表"转手机瞄准"的手感已验证** —— 那依赖真机 SLAM，见 `node-plan §7 待实测清单` #3/#8（#8：PC 预览**不作手感判据**）。

**唯一判定链**（三处细节必须一致，任何一处改口径即为 bug）：

```
worldPos = bossTransform.getWorldPosition()          // Boss 3D 世界坐标
vp       = arCamera.worldToViewportPoint(worldPos)   // 归一化视口坐标，原点左下角，z = 到相机距离
if (vp.z <= 0) → 未命中（Boss 在相机身后）
dx = |vp.x - 0.5| ; dy = |vp.y - 0.5|                 // 屏幕正中的归一化坐标 = (0.5, 0.5)
命中 ⟺ dx ≤ 0.17 && dy ≤ 0.17                        // 准星容差 0.17（x/y 同值）
```

- **`worldToViewportPoint` 返回归一化视口坐标**（不是像素）：原点**左下角** `(0,0)`、右上角 `(1,1)`、**正中 = `(0.5, 0.5)`**；`z` 为到相机距离（>0 表示在相机前方）。**实测数据**：`worldPos=(-81.865, 0, -197.076)` → `vp=(x, 0.522, ~122)`。`vp.y≈0.522`（在 0–1 之间 ⇒ 证实是归一化、非像素）；`vp.z≈122>0`（⇒ 证实 Boss 在相机前方）。
- **为什么容差取 0.17**：0.17 ≈ 屏幕短边的 ±17%（≈准星视觉半径 + Boss 判定半径），与 `game-design-doc §五`、`vfx-spec §6.5` 同源。**容差只在 `game-design-doc §五` 定义一次，本文只引用不重定义。**
- **命中频率闸门**：`fireOneShot` 内部 **250ms 闸门**（严格 4 发/秒），见 §2.4 与 `implement-plan §2.0.2`。
- **`vp.z <= 0` 必须判**：玩家把手机转过去（Boss 转到身后）时 `worldToViewportPoint` 的 `z` 会 ≤0，若漏判会得到镜像的错误命中。

> ⚠️ **PC 预览 vs 真机的判定手感差异（必须知道，否则会误判为 bug）**：**真机有 SLAM**，转动手机 → Boss 实时滑入准星；**PC 预览无 SLAM**，AR 相机会用约 **4 秒**缓慢收敛，Boss 才滑向准星。故 **PC 预览里测命中必须长按开火 ≥7 秒**；**2 秒内的开火必然全 miss，这是无 SLAM 的预期行为、非缺陷**。详细说明见 `README.md §八` 与 `submit-checklist.md` 的验收注记。

### 2.8 相机口径与尺寸换算（v2 · 引擎事实，供美术/动画换算尺寸用）

**本项目有两套相机、两套坐标口径，混用即错**：

| 相机 | 渲染对象 | 尺寸受什么支配 | FOV 能不能设/读 |
|---|---|---|---|
| **AR 相机**（`TargetTrackingCameraJS` + `Camera`；编辑器显示名 "AR Camera"） | **L2 Boss（3D 世界锚定）** | 3D 世界单位 + 设备真实相机投影 | **不能设、不能读、不固定**（见下） |
| **普通 `Camera`**（非 AR，透视） | 若走 3D 非 AR 内容 | `fov`（**默认 60°、竖直**、[0,180]）+ 公式 | 场景值，可设可读 |
| **2D 正交伴生相机**（`Screen Image` 自动创建） | **L3 准星/枪、L4 弹字、L5 HUD** | `orthoHeight`（**半高**，世界单位，[0,99]）× 2 ；`pixelsPerUnit`（**默认 32**） | FOV 不适用 |

**① AR 相机 FOV 不可设、不可读、不固定（★ 关键）**
- `component_schemas.json` / `type_registry.json`：`TargetTrackingCameraJS`（`displayName="AR Camera"`）**`properties` 为空** → **无任何可调属性，包括 FOV**。
- curated 原文：该组件 "**keeps the camera's projection aligned with the device's real camera feed each frame**" → 其投影**每帧对齐设备真实相机**。
- ⇒ **FOV 由物理相机决定、随机型变化、运行时不固定、且无 API 可读**。另：`AR Plane` 会"**Automatically adds an AR Camera with Device Tracker**（World tracking mode）"。
- **推论（写进硬约束）**：**不得用固定 FOV 把"占屏比例"换算成"米"** —— AR 相机上这个换算无引擎依据。

**② 普通 Camera 的可用数值**
- `fov` 默认 **60**、范围 [0,180]、**竖直 FOV**（属性名 `physicalFovy` 即 "fovy"，仅 PERSPECTIVE 有效）；`CameraFovType { Custom, Physical }`，**原生默认 `Custom`**（用存储的 `fov`）。
- 公式（`skills/ability/Camera/SKILL.md:49`）：`visible_height = 2·D·tan(fov/2)`；`visible_width = visible_height × aspect`；**scale-invariant**。
- ⚠️ **两个可被悄悄改的坑**：① `physicalFovy = true` 会让 `fov` 失效；② 官方 curated 备注 —— **某些内置组件（如 Foot Tracker）创建时会 `disable physicalFovy`**。故**不得假定 `fov` 永远是你设的值**。
- ⚠️ **aspect 随机型变** → 横向占屏比例不稳；`fov` 为竖直，**竖直方向换算才稳**。

**③ 2D/屏幕层（L3/L4/L5）口径**
- `视高(world) = orthoHeight × 2`（`orthoHeight` = **半高**）；`对象世界高(world) = 像素 / pixelsPerUnit`。官方例：720×1280 元素 @ PPU 32 → 22.5 × 40 world units。

**④「1 world unit = ? 米」——平台未声明**
- 全文扫描 `skills/` + `rules/` + `knowledge/`：**无任何 world-unit↔米 的换算声明**（"meter/m" 仅出现在一个无关 tokenizer 词表）。AR 路由文档（`skills/routing/ar-routing.md`）把"尺度"列为**手工调整项**（"**尺度调整**，让虚拟对象和真实画面更一致"），非由真实单位推导。
- **唯一可能的真实尺度线索**：`getSlamInfo()`（`planeTransform` / `depths` / `depthRangeMin` / `depthRangeMax`）——**单位未文档化且需真机实测**，**不得进 v2 设计**。
- **裁定**：**一律用「占屏比例」表达尺寸**（与 §2.7 的归一化视口 `(0.5,0.5)` + 容差 `0.17` 同口径）。**可执行锚点**：**使 Boss 初始投影 ≈128–192 逻辑像素**（见 §6-10）。
- **若美术确需"米"作观感软参考**：只能写成 **"本项目声明 1 world unit ≡ 1 m"的项目约定**，并标为**假设**（假设变了结论要重估）。软参考值（fov=60、D=1.5、occupancy 10–15%）：`H = 1.7321 × occupancy` → **≈0.17–0.26 world unit**。**此值不适用于 AR 相机**（其上 FOV 是设备的）。

**⑤ L4 命中特效的坐标口径（v2 裁定）**
- **裁定：L4 命中粒子（`hit_spark`）与伤害弹字 = 屏幕口径（2D 屏幕空间），不随 Boss 距离缩放。** 依据：① §2.7 命中必然发生在**屏幕中心 ±0.17** 内 → "贴住命中点"与"放屏幕中心/命中帧投影点"视觉等价；② 世界口径会引入 **透视缩放 shimmer**（§6-10 已登记的固有代价），且远端字不可读、近端出画；屏幕口径**天然恒定**，与 PX 口径一致；③ L3/L5 已是屏幕空间，L4 同属可**只保留 L2 一套 3D 口径**。
- **落地**：锚点 = 屏幕中心（或命中帧 `worldToViewportPoint(worldPos)` 投影点，`vp.z>0` 已判）；颗粒按**屏幕口径（PPU=32 体系）**换算。
- **代价（如实登记）**：近大远小的 Boss 上叠恒定尺寸特效，**远距离时特效率显偏大**。可接受（比 shimmer 便宜）。
- ⚠️ **本文不改 `vfx-spec` / `art-spec` 的正文**；若二者已写"世界口径"，按本条收敛，由对应 owner 回填。

**⑥ 震屏口径（v2 裁定 · 收口 doc-sync 在 `node-plan §1.2` 的挂起项）**
- **【原 v2.0 裁定 · ⚠️ 已被下方"作用点收敛（v2.2）"覆盖 —— 仅作历史留存，勿据此实现】** **L2 Boss 的抖动 = 在 Boss 自己的世界空间做"加法位移"**（叠加到 `BossRoot`；与 `node-plan §2` 第 89 行的"摆动/抖动/击退 加法合成链"、`animation-spec §3.3` 的 `HURT` `shakeOffset` **同一节点同一条链**）。**v2.2 起该路（路①）已被上游删除**（`shakeOffset` 通道 + `vfx-spec` V6），改为单点 `ContentRoot` —— **且该删除是条件性的，见下条。**
- **【原 v2.0 裁定 · ⚠️ 同上已被覆盖】** **`ContentRoot` 的 2D 震动原设计"只服务 L3/L5、幅度减半"** —— **v2.2 起 `ContentRoot` 已成为全项目唯一作用点，"只服务 L3/L5"与"幅度减半"均已作废**（原"不要指望父子传导"的告诫现升级为下方 🔴 条的核心争议）。
- **否决"给 `AR Camera` 加平移"**：`TargetTrackingCameraJS` 官方语义 = "**keeps the camera's projection aligned with the device's real camera feed each frame**" → **叠加的偏移会被每帧覆写**，且破坏虚拟↔真实注册；其 `properties` 为空，也无偏移可写。
- **幅度（FOV 无关口径）**：`世界幅度 = Boss世界高 × k`，**k ≈ 0.4%（普通）～3%（暴怒）**（≈128 逻辑像素投影下的 0.5–4 屏幕 px）；**单帧 ≤3% · 只平移 · 不旋转 · 新震覆盖不叠加**。
- **不加隔离节点**：抖动 ≤4 屏幕 px ≈ 容差 `0.17` 的 **≈0.4%** → 对 §2.7 命中判定无实质影响；增设"防抖动命中隔离节点"属过度工程（若真机实测有影响再引入，P2）。
- **★ 写入者归属（单一写入者原则 · 拍板）**：**一个 Transform 只能有一个脚本写入者。**
  - **`BossRoot.position` 的加法合成链由 `BossAnimPlayer` 独占**（`animation-spec §8.3`）⇒ **任何脚本都不得直写 `BossRoot.position`**；**`ContentRoot` 由 `CameraShake` 独占**（写 `ScreenTransform.anchoredPosition`）。
  - **两脚本不互相持有、不互相调用**（守 `implement-plan §2.0.1`）⇒ **⛔ 否决"`CameraShake` 作唯一震动所有者 + `BossAnimPlayer` 暴露 shake 接口"**（会造出运行时相互依赖，并破坏"新震覆盖不叠加"语义）。
  - **★ 幅度单一权威，且不靠"接口"**：幅度表 = **纯常量模块** `constants/ShakeAmp.ts`（只有 `const`、**无逻辑、无副作用、不 import 任何 APJS 运行时 API**），需要它的脚本**各自 import 同一个表**、各写各的 Transform（**import 常量 ≠ 表现层互调**，不违反 §2.0.1）。→ **单写入者 ✓ / 单一幅度权威 ✓ / 不互相调用 ✓ / 不新增节点 ✓**。✅ **v2.2 起数值源进一步单源 = `vfx-spec §6.2`**（幅度+时长+衰减，team-lead v1.9 裁定"震屏=一个特效"），`ShakeAmp.ts` 即该表 px 列的常量映射（**只装幅度**）。
- **⚠️🔴 作用点收敛（v2.2）——「路① 已并除」是条件性的、前提未验，本条为全案最高优先待验证项：**
  - **v2.2 起**：`animation-spec` 已删 `BossRoot` 的 `shakeOffset` 通道、`vfx-spec` 已删 **V6（Boss 本体 ±2px）** ⇒ **Boss 抖动不再由脚本在世界空间施加，改为指望 `ContentRoot` 偏移经父子传导带动 3D Boss**（对方理由："Boss 挂 `ContentRoot` 下、天然跟随；保留 V6 会双抖 ≈2+1.5px"）。
  - **裁定立场**：**数值/时长/衰减单源（团队裁定）我采纳并已在上一轮推动完成**；**并轨本身不违反"单一写入者"**（`ContentRoot` 仍只有 `CameraShake` 一个写入者）。**但"天然跟随"这个机制，正是 `node-plan §1.2` L133 明确记录为「不可依赖」的那一条**——原文：**"不要依赖父子传导…3D 世界锚定内容的 transform 可能被 AR 追踪每帧覆写 → 抖动必须由脚本在 Boss 的世界空间显式施加"**；且 `node-plan §7 待实测清单` 第 9 项（真机 A/B 对照）**至今未做**。⇒ **doc 里"天然跟随""已并除"是既成事实口径，实证为 0，须降级为条件式。**
  - **⇒ 两分支（必须先判，再冻结）**：**实测"跟随"** ⇒ 并轨成立、路① 永久废除（更省，采纳）；**实测"不跟随"（我预期）** ⇒ **Boss 将完全不抖**（只剩 L3/L5 屏幕层在抖，命中"落点感"实质丢失）⇒ **必须恢复路①**（Boss 世界空间加法位移，**复用同一张 `ShakeAmp.ts` 值**）。
  - **恢复代价可控**：因数值源已单源，**恢复路① = 重新 import 同一张表 + 加回一个位移通道**，非重写；故**不必预先留死代码**，但 **V6 墓碑与 §6.2 脚注的口径必须写成"待验证的条件性并除"，不得写成已完成的既成事实**。
  - **与 `node-plan §7 待实测清单` 第 9 项 = 同一个真机验证**（偏移 `ContentRoot`，看 3D Boss 是否跟随），合并为一项，**验证前视为未闭合**。
  - ✅ **连带要求已履行（v1.8/v1.10 回填完成，已核到行）**：`animation-spec` 三处自带幅度值均已改为指针 —— `§3.3` `HURT` 表已删 `±2 lp`（现 L232 只写"幅度/时长/衰减 = `vfx-spec §6.2` 单源"）；`§7.2` 表已改指针、标题已改 `ScreenShake`（现 L571）；`§一` 资产总表 `Camera Shake` 类型名亦已改。
    - ✅ **残留已回收（animation-spec v1.10，已核原行）**：`§7.2` 口径注原「（`BossRoot` 路① + `ContentRoot` 路②）」**已改为"单点作用在 `ContentRoot`（不涉及 `BossRoot` 路① —— 原路① 已条件性并除）"**，并**额外加了 ⚠️ 未验前提块**（引 `node-plan §1.2` L133 与"若判不跟随 ⇒ 需恢复路①，零代码模式重 import 同一张 `ShakeAmp.ts`"）。与本文件 ⑥ 一致，**本项零残留**。
  - **判"幅度冲突"的判据（别用肉眼比，单位不可比）**：k 表以 **Boss 投影 ≈128 逻辑像素**（§6-10 锚点）为参考投影 ⇒ **1 屏幕 px ≡ 0.78% Boss 世界高**。**任何脱离该参考尺寸写的绝对 "px" 都不可比**（此前的 `±2 lp`、`8 px` 正是此类）；**统一改写成 % Boss 世界高**后才可判冲突。换算表见 `implement-plan §2.4`（已核准）。

**⑦ L2 Boss 与 `ContentRoot` 的父子关系（v2 结构澄清）**
- `BossRoot` 虽在 `ContentRoot` 下（`node-plan §2` 节点树），但其**定位由 AR 追踪在世界空间驱动**，**不是**由 `ContentRoot` 的 `ScreenTransform` 定位。⇒ **`ContentRoot` 的 2D 偏移不能作为 Boss 的定位来源**（见 ⑥）；`ContentRoot` 对 Boss 只是**结构归属**。
- 这条依赖一个未实测前提：**AR 世界锚定内容对"父级 2D 变换偏移"的响应方式**。**待实测**：真机下偏移 `ContentRoot`，观察 3D Boss 是否跟随；**我预期不跟随**。
- 🔴 **v2.2 起本条已反转 ⑥ 的依赖方向（重要）**：作用点收敛到 `ContentRoot` 单点后，**"Boss 会不会抖"完全取决于这条传导**。故本条的实测 **不再是"冗余确认"，而是阻断性前置** —— 与 ⑥ 的待验证项、`node-plan §7 待实测清单` 第 9 项是**同一个真机验证**。（旧稿此处写的"不影响 ⑥ 的结论"**已作废**：那是"两路并存"时代的判断，两路已并成一路。）

---

## 3. 性能预算与红线核对

### 3.1 预算表（每行 = 数值目标 + 测量方式 + 超阈处置）

| 指标 | 数值目标 | 测量方式 | 超阈处置（可执行动作 + 触发点 + 责任人） |
|---|---|---|---|
| 图层数 | **≤6** | `get_scene(names_only=true)` 统计顶层渲染层 / render group | **门禁卡点**：阶段3「搭骨架」完成时，由架构师/主程用 `get_scene` 对照 `node-plan.md` 判定；>6 则**并入**（命中特效→HUD层 / 装饰层清空），**不通过不得进入阶段4** |
| 粒子数 | **≤50** | 运行时：`vfx.enableAliveParticleCount=true; vfx.aliveParticleCounts` 求和；静态：VFX 图 emit 参数 | **自动降级**：脚本 `onUpdate` 读 `aliveParticleCounts`，若 **>50** 立即 `vfx.stop(APJS.VFXStopBehavior.StopEmitting)` 并把发射率 `setFloat` 下调至一半（函数与枚举已在 `VFX/SKILL.md` 确认存在，阈值=50，与预算对齐） |
| 单张贴图尺寸 | **≤512×512** | `PNGImage.width/height` | **自动/导入约束**：导入时把 `Max Resolution` 设为 `Size512`；>512 的源图被钳到 512 |
| 贴图采样 | **Nearest/Nearest/None** | `PNGImage.filterMin/filterMag/filterMipmap` | **导入约束**：三字段固定为 Nearest / Nearest / None、`enableMipmap=false`；不符即视为资源未通过 |
| 序列帧数（**单动作口径**） | **≤24 帧/动作** | **按动作目录分别计数**（`anm_<action>/anim_*.png`），**不是按全特效总文件数** | **门禁卡点**：资产入库时由主程**逐动作目录**核对 —— **任一动作** >24 才需删/降帧、不进阶段4。⚠️ **全特效总文件数 53（=47 本体 + 4 小怪 + 2 枪口）> 24 是正常的，不得据此误判为超标**（`AGENTS.md` :55 已澄清"单动作 clip ≤24，非全帧之和"） |
| 脚本帧开销 | `onUpdate` 内 **O(1)**、无逐帧 new / 无全量遍历 | 代码评审 + `get_script_logs` 打点计时 | **门禁卡点**：脚本评审（阶段7 `run_otsc_check` 前后）由架构师判定；超标则改缓存/事件驱动，不进入最终验收 |
| 启动时长 | **< 2s**（首帧可交互） | 真机预览计时 | **门禁卡点**：真机预览环节判定，超标则裁资源/减首帧计算 |
| 包体 | **≤2 MB** | 导出/构建产物大小；或 `Σ artifactFileSize`（**必须含 53 个序列帧文件，不能只测静态贴图**） | **门禁卡点**：卡在「资源导入完成 → 阶段5」之间，主程判定；>2MB 则按**上游砍序**降级——① `animation-spec §二` 帧取舍（先砍 `TAUNT_ESCAPE` 帧）→ ② `art-spec §六` 张数护栏（单张 >45 KB 回查、张数 ≤40）/ 降 `Max Resolution` → ③ `audio-spec §5.2` 砍音频（**音频排最后**）；**不达 2MB 不进入提审准备** |

**门禁类归类依据（为什么它们没有运行时降级）**：
- **图层数 / 序列帧 / 包体 / 启动时长** 在**运行时无法「降级」**——它们要么是结构性（层数、帧数在打包时已定），要么只有「阻断」（包体超标只能回删资源，不存在运行中自动减包体的机制），要么无可用运行时采样接口（启动时长）。**因此它们天然是门禁，不是缺陷**；为它们硬造运行时降级动作才是过度工程。
- **粒子数**是本表中**唯一**同时具备「真实运行时 API + 明确可对齐阈值」的可自动降级项，故给自动降级。

### 3.2 贴图体积计算

**单张贴图两种口径：**
- **未压缩 RGBA8888（显存口径）**：512×512×4 = **1,048,576 B ≈ 1.00 MiB / 张**；带 mipmap 再 +33% ≈ **1.33 MiB / 张**。
- **DB16 像素 PNG（包体口径）**：16 色、大面积纯色，PNG 无损压缩后典型 **8–45 KB / 张**。

**资产清单与包体估算（三口径，均为上游各 spec 的交付口径）：**

| 类别 | 口径来源 | 数量 | 估算体积 | 备注 |
|---|---|---|---|---|
| **① 静态像素贴图** | `art-spec` §六（35 张 → v1.1 增 `white_flash_mask` / `boss_eye_closed` = **37 张**） | ~37 | **≈ 0.275 MB** | 取中值（下限 210 KB / 上限 330 KB） |
| **② 序列帧文件**（`anim_*.png`，Boss 47 + 小怪 4 + 枪口 2） | `animation-spec` §11.1（53 个文件） | **53** | **≈ 0.83 MB** | 每张 512×512 / DB16 PNG，**这是旧稿完全漏掉的一块** |
| **③ 音频**（2 BGM 16s + 24 SFX，MP3 CBR 64 kbps mono） | `audio-spec` §5.2 | **26** | **≈ 0.349 MB** | 旧稿按"4 短 mp3 ≈0.08 MB"低估约 270 KB |
| **总包体估算（中值口径）** | — | **≈ 90 文件** | **≈ 1.45 MB** | 对照 2MB 红线 **余量 ≈1.4 倍（≈0.56 MB）**；⚠️ **中值预期、非结论**——**最坏口径 ≈2.10–3.00 MB，会破线**（见下表） |

> **口径说明**：三行为上游各 spec **独立列出**的交付口径，可能含**少量重复计列**（如 `muzzle_flash` / `crosshair` 同时出现在 art-spec 静态表与 animation 序列帧表中）。**重复计列 = 偏高估 = 对红线核算保守**，故意不做冲抵——红线核算宁高勿低。
> **✅ 序列帧体积口径已收口（2026-10-13，animation-director 确认）——改为"三档 + 明写最坏"。**
> ⚠️ **勘误**：本节早前版本写「保守锚点 28–45 KB/张 → 序列帧 ≈0.83 MB」，**该算式不成立**（53 × 28 KB = 1.48 MB、53 × 45 KB = 2.38 MB）。`0.83 MB ÷ 53 = 15.7 KB/张`，**既不等于 5–12、也不等于 28–45** —— 那是**中值**，被错标成了"保守"，等于**把最坏情形重新藏起来**。下表取代之。

| 口径 | 单帧体积 | 53 帧序列帧小计 | + 贴图 0.275 + 音频 0.349 | 判定 |
|---|---|---|---|---|
| **乐观** | 5–12 KB | 0.27–0.64 MB | **≈ 0.89–1.26 MB** | ✅ 通过 |
| **中值** | ≈ 15.7 KB | ≈ 0.83 MB | **≈ 1.45 MB**（＝本表 §3.2 口径） | ✅ 通过（余量 ≈1.4×） |
| **最坏（按单帧上限）** | **28–45 KB** | **1.48–2.38 MB** | **≈ 2.10–3.00 MB** | **✘ 破 2MB 红线** |

> **两句必须连同上表一起读，否则最坏情形会被重新藏起来：**
> 1. **28–45 KB 是"单帧上限"，不是 53 帧的平均值**（它来自 `art-spec` §六 对**最复杂**的 `boss_body_idle` / 暴怒帧的实测值）。因此**≈1.45 MB 是中值预期，不是"连最坏也才 1.45"**。
> 2. **若多数帧接近单帧上限，总包体 ≈2.10–3.00 MB，将直接破 2MB 红线**。故**首批导出 1 张真实 Boss 序列帧、读 `artifactFileSize` 是本项唯一收口动作** —— 在它出数之前，"总包体 < 2MB"**尚未被证实**，只是中值推算。
> 3. **唯一残留动作（保留）**：真实样品出数后按**上游砍序**降级（① `animation-spec §二` 帧取舍（先砍 `TAUNT_ESCAPE` 帧）→ ② `art-spec §六` 张数护栏（单张 >45 KB 回查、张数 ≤40）/ 降 `Max Resolution` → ③ `audio-spec §5.2` 砍音频，**音频最后**）；实测值回传后我更新本表并划掉"待收口"。
> **零资产项**：2D Text（伤害数/阶段/CTA）= 系统字体，0 体积；命中粒子 = 内置 VFX，0 体积。

**结论（中值口径）：按像素素材中值口径（含 53 个序列帧文件 + 26 个音频资产），总包体 ≈ 1.45 MB，2MB 红线余量仅 ≈ 1.4 倍（≈0.56 MB），够用但不宽松。**
> ⚠️ **此结论不覆盖最坏情形**：若序列帧多数接近单帧上限（28–45 KB），总包体 ≈2.10–3.00 MB，**破线**。**在首批真实帧实测 `artifactFileSize` 之前，"总包体 < 2MB" 未获证实。**
> 旧稿"≈0.2–0.4 MB / 余量 5–10 倍"**作废**——那是"9 张静态贴图 + 4 个音效"的口径，**漏算 53 个序列帧文件（≈0.83 MB）**，会对上游造成"包体很宽松"的**错误安全感**。

**但红线风险点必须点明**：若纹理**未压缩打包**，约 **90 张 512×512 RGBA**（37 静态 + 53 序列帧）就是 **≈ 90 × 1.0 MiB ≈ 90 MiB，直接爆 2MB 红线约 45 倍**。→ **包体红线能否达标，取决于「压缩 + `Max Resolution=Size512`」是否落实，而不是取决于张数。**（此点对序列帧同样成立：53 张序列帧若未压缩，单此一项即 ≈53 MiB。）

#### 3.2.1 序列帧体积「单点判定规则」（可执行 · 供首批导出时执行）

- **序列帧可用预算**：`2048 KB − 贴图 275 KB − 音频 349 KB = ` **1424 KB**。
- **单帧阈值**：`1424 KB ÷ 53 = 26.87 KB` → **取 26.8 KB 作保守阈值**（向下取整，宁严勿松）。
- **判定规则（单样本即可定论）**：取**最复杂**的一张序列帧（建议 `anm_enrage_intro` 满细节帧），在**压缩开启 + `Max Resolution=Size512` + Nearest** 下导入，读 `artifactFileSize`：
  - **≤ 26.8 KB ⇒ 即使 53 帧全按此上界，序列帧 ≤1424 KB、总包体 ≤2048 KB ⇒ O-08 直接判过**（不必等全量导出）。
  - **> 26.8 KB ⇒ 上界破线，必须扩样**：再导 3 张（最复杂 / 典型 `anm_idle` / 大面积纯色 `anm_feign_collapse`），按 `53 × 均值` 与 `53 × 最大值` 两个口径复算，再决定是否触发砍序。
- **触发点 / 责任人 / 后果**：**卡在「首批 1 张真实序列帧导出」这一步** —— 主程序执行并回传数值 → 我（架构师）把上表"最坏档"的实际落点标定 → QA 据此**升级或撤销 O-08 阻断**。**未出数前，"总包体 < 2MB" 维持"未获证实"。**
- **前提（否则读数无意义）**：`artifactFileSize` **必须在压缩开启 + Size512 条件下读**；若在未压缩条件下读，读到的是 ≈1 MiB/张的显存体积，与包体无关。

### 3.3 低端机性能底线

- **帧率目标**：低端机 **≥30 fps**（高端 60）；以抖音特效实际录制帧率为准。
- **硬约束**：图层 ≤6、粒子 ≤50、无 3D 骨骼、无实时物理、无联网请求。
- 官方 `rules/scene-game.md`：主操作区限制在安全区 X[-340,+260]、Y[-400,+500]，**避开底部录制按钮区（约底部 180px，`y≥0.86` 视为不安全）**、顶部信息栏、右侧工具栏。
- **v2 补充**：v2 的「主操作」不再是精准点触某个位置（准星固定在屏幕正中 `(0,0)`），而是**全屏任意处按下即开火**（按下/抬起判定）→ **安全区主要约束 HUD/血条/结算页等 UI 摆放**，准星居中天然落在安全区内；**全屏开火热区不受 HUD 位置影响**，但 HUD 仍不得压到底部 180px 录制禁区。
- 说明：具体低端机机型清单属**平台侧动态信息**，以 Effect House 官方档位文档为准。

### 3.4 必须砍掉的设计（明确列出）

| 砍掉 | 原因 | 替代 |
|---|---|---|
| 读好友列表 | 平台无 API | **双轨头像（§9）**：**轨 A** 预设 6 选 1（默认兜底）/ **轨 B** 摄像头取像（**待真机验证**） |
| 陀螺仪精确瞄准（手搓 `GyroSensorAgent`） | 传感器 API `@alpha` 未验证 | **v2 改由官方 `DeviceTracker` 承担设备朝向与锚定（已实测"可挂"；真机 SLAM 手感待验）**，不触碰 `@alpha` |
| 手指/拖拽移动准星（v1 主案） | v2 改为 AR 空间锚定，准星固定屏幕正中 | 准星固定屏幕正中；玩家转手机把 Boss 转进准星 |
| 3D 骨骼 Boss 动画 | 平台边界「不做复杂3D骨骼」 | 序列帧 / 位移旋转缩放（Tween） |
| 实时物理弹道 | 平台边界「不做实时物理」 | **AR 视口容差命中（`worldToViewportPoint` + 容差 0.17，见 §2.7）** |
| 联网/排行榜/服务器下发 | 平台边界「不做服务器下发」 | 纯本地单机玩法 |
| 整屏背景图/蒙层 | 官方 AR 玩法明令禁止覆盖摄像头 | 局部装饰 + 摄像头透传 |

---

## 4. 实现路径与 MCP 操作可行性

**先说闸门（重要）**：像塑 MCP 有**强制「用户确认闸门」**（`skills/workflow/EffectWorkflow/SKILL.md`）——**未获用户对方案的明确确认前，禁止调用会改工程/生成资产的工具**（`edit_by_dsl` / `generate_assets_batch` / `add_script` / `import_resource` / `capture_preview` / `interact_by_dsl` / `save_plan(confirmed)`）。所以本包是**待用户确认的方案**；确认后才能落工程。

### 4.1 哪些能走 MCP 自动化 / 哪些必须 GUI 人工

| 环节 | 可 MCP 自动化 | 依据 |
|---|---|---|
| 工程结构（新建对象、父子、render group） | ✅ `edit_by_dsl` | 工具 `edit_by_dsl`（批量场景/资源编辑），命令如 `add_builtin_object / move_scene_object / set_scene_object` |
| 节点/组件创建与参数 | ✅ `edit_by_dsl` + `set_component` | 同上 |
| 资源导入（贴图/音频/序列帧） | ✅ `import_resource` | `VFX/SKILL.md`、`MP4/SKILL.md` 均用 `edit_by_dsl.import_resource` |
| 资源属性（采样/尺寸） | ✅ `set_resource_properties`（`filterMin/Mag/Mipmap`、`Max Resolution`） | `PNGImage` schema |
| 脚本创建/编辑 | ✅ `edit_by_dsl(add_script/edit_script)` | `rules/general.md`：脚本只能经此创建 |
| 编译校验 | ✅ `run_otsc_check` | 工具清单 |
| 运行日志 | ✅ `get_script_logs` | 工具清单 |
| 预览截图 | ✅ `capture_preview` / `get_scene_view` | 工具清单 |
| 交互模拟（触摸/拖拽/时序） | ✅ `interact_by_dsl`（`reset_preview / touch / drag / wait / screenshot / record_preview_video_mp4`） | 工具清单 |
| 调预览输入（人脸/手部等测试视频） | ✅ `set_preview_video` / `list_preview_videos` | 实测返回 tracking_types：`body/environment/face/hand/pet/two_person` |
| AIGC 资产生成 | ✅ `generate_assets_batch` / `generate_image` / `generate_audio` | 工具清单 |
| 方案留痕 | ✅ `save_plan`（确认后才可 confirmed） | 工具清单 |
| **正式预览（真机）** | ❌ **必须 GUI 人工** | 宪法平台边界：正式预览/编译/提审只在像塑内做 |
| **编译打包 / 提审** | ❌ **必须 GUI 人工** | 同上 |
| ~~相册选图权限实测~~ | — **已废止** | 相册选图路径不存在（见 §9）。**轨 B 取像是否触发系统权限，并入 §9 / `node-plan §7` 第 10 项真机一并确认** |
| **素材版权/授权确认** | ❌ 人工 | 合规红线 |

### 4.2 建议实现顺序（空工程 → 可预览）

```
0. 用户确认方案（闸门）→ save_plan(confirmed)
1. 确认现状与预览输入：get_scene / list_resources / list_preview_videos；切到 face 预览视频
2. 资产准备：generate_assets_batch 出占位/像素资产；import_resource 导入；set_resource_properties 设 Nearest
3. 搭骨架：**先建 AR 追踪链**（`AR Plane`/手动加 `ARTracking` 组 + `AR Camera` + `DeviceTracker`，`trackingMode=World`）→ 再建 L1–L6 六层（edit_by_dsl 建对象/父子/render group）→ get_scene 核对收敛
4. 接入资产：逐项 bind（图/音/粒子），inspect 校验 GUID/尺寸/采样/层级
5. 关键路径：接通「开拍 → 触摸按下开火 → AR 视口容差命中(0.17) → 掉血 → 反馈」一条链路 → **PC 预览长按 ≥7 秒** 验证命中（无 SLAM 约 4s 收敛）→ capture_preview 截图
6. 补全：Boss 阶段、结算页、重开重置、音效
7. 脚本验证：run_otsc_check + get_script_logs
8. 最终验收：**真机预览**转手机验证跟手性（SLAM 实时）→ reset_preview → 分时 screenshot；提醒用户在像塑内保存工程 → 真机预览 → 提审
```

---

## 5. 平台合规要点（技术侧）

| 项 | 结论 | 说明 |
|---|---|---|
| **摄像头权限** | **需要** | 摄像头透传是底层背景 |
| **相册/照片权限** | ❌ **不再需要** | **相册路径已废止**（见 §9）。**轨 B 不读相册**——用户是"把 Boss 头部对准在场真人"，画面来自 AR 相机本身，**不触发相册/照片权限**。⚠️ 但**取像是否触发"摄像头"类权限声明须真机确认**（并入 §9 / `node-plan §7` 第 10 项） |
| **联网** | **不联网** | 本方案无任何网络请求 |
| **UGC（用户生成内容上传）** | **无** | 用户所选照片**仅本地处理，不上传**；特效内不做 UGC 分发 |
| **内购** | **无** | 无内购/无支付 |
| **实际采集的数据** | ① 摄像头画面（**本局运行时处理；不存储、不上传、不导出**）——轨 B 取像结果**仅存活于本局运行时纹理，随本局结束消失** | 不采集：**相册照片**、好友列表、通讯录、位置、设备标识、面部特征库 |
| **提审技术面会被看的项** | 包体(≤2MB)、性能(低端机可跑)、权限声明一致、素材版权、无「绕过审核」表述 | 对应宪法第五节提审清单 |

> **风险提示**：平台规则（分成/认证/权限/审核口径）**可能随时间变化**，最终以抖音特效开放平台 / Effect House **官方现行文档**为准。

---

## 6. 渲染与像素规范落地（Nearest 怎么确保不被破坏）

**关键证据**：`PNGImage` 资源 schema 明确有采样字段：
- `filterMin`：`Nearest` / `Linear`（默认 Linear）
- `filterMag`：`Nearest` / `Linear`（默认 Linear）
- `filterMipmap`：`None` / `Nearest` / `Linear`（默认 None）
- `enableMipmap`：Boolean（默认 **false**）
- `Max Resolution`：`Size1024/512/256/128`（默认 512）
- `Compression Type`：`Automatic/Manual/None`；`wrapMode S/T/R`；`premultiplyAlpha`

**落地清单（每张像素贴图逐项设）**：
1. `filterMin = Nearest`、`filterMag = Nearest`、`filterMipmap = None`、`enableMipmap = false`。
2. `Max Resolution = Size512`（**防止被二次缩放到非 512**）。
3. `wrapModeS/T = Clamp`（避免边缘循环采样出脏边）。
4. **缩放只用整数倍**：屏幕尺寸必须为素材物理尺寸的整数倍；**禁止非整数缩放**（否则出现半像素/糊边）。在 `ScreenTransform` 里用整数 `sizeDelta`。
5. **禁止**旋转非 90° 整数倍角度；**禁止**开 AA / 羽化 / 模糊 / 双线性。
6. `PixelArt` 源图**导出即 512×512**，导入后不再缩放；`pixelsPerUnit`（默认 32）保持或按整数倍配。
7. 序列帧统一走 `Texture Sequence` / `AnimatedTexture`，**不要**用逐帧换 `Image.texture` 的脚本（官方 VFX 反模式明确禁止）。
8. 颜色：全流程锁 **DB16**，导出前用调色板量化，禁超色板。
9. **3D `ImageEntity`（v2 Boss）同样逐项设采样**：其承载贴图仍走 `PNGImage` 采样字段（`filterMin/Mag=Nearest`、`filterMipmap=None`、`Max Resolution=Size512`），**不能因为进了 3D 就默认 Linear**。
10. **v2 已知像素妥协（必须记入已知残留，不是 bug）**：Boss 为 3D 世界锚定对象后，其**屏幕投影尺寸随手机与锚点的距离连续变化**（透视缩放），**无法保证整数倍缩放**，故靠近/远离时会出现**轻微像素抖动（shimmer）**。这是 AR 空间锚定的固有代价；**缓解手段**：素材在 `Size512` 下保持 DB16 + Nearest，锚点距离适中（**建议 Boss 世界尺寸使初始投影 ≈128–192 逻辑像素**），不做抗锯齿补偿（抗锯齿会破坏像素风）。**不做**运行时锁整数缩放（会与 3D 透视冲突，得不偿失）。

---

## 7. 技术风险与验证清单

| 风险 | 影响 | 验证方法（先最小验证再铺开） | 兜底 |
|---|---|---|---|
| ~~陀螺仪 `@alpha` 不可用~~（v2 已不依赖） | — | v2 由官方 `DeviceTracker` 承担设备朝向（**已实测可挂**），不再触碰 `@alpha` | `DeviceTracker`（已实测） |
| **PC 预览无 SLAM → 命中测试误判** | 误判为「打不中=坏」 | **PC 预览长按开火 ≥7 秒**（AR 相机约 4s 收敛）；**真机预览**转手机验证实时跟手 | `README.md §八` + `submit-checklist.md` 验收注记；测试时先明确告知 |
| **3D Boss 透视缩放 → 像素抖动** | 观感（非阻断） | 真机移动手机观察近/远帧 | 素材 Size512 + Nearest + 锚点距离适中；**不做**抗锯齿 |
| **`vp.z<=0` 漏判**（Boss 转身后） | 命中判定错误 | 转手机把 Boss 转到身后，确认不产生命中 | 命中前必判 `vp.z>0`（§2.7） |
| 纹理未压缩 / 序列帧体积超预期 → 包体爆 2MB | 提审失败 | **按 §3.2.1 单点判定规则**：先导 1 张最复杂序列帧读 `artifactFileSize`（压缩开 + Size512）——≤26.8 KB 即判过；>26.8 KB 扩样 3 张定分布；最终门禁读 `Σ artifactFileSize`（**含 53 个序列帧文件**） | 按上游砍序：帧取舍 → 张数护栏/降 `Max Resolution` → 最后砍音频 |
| 轨 B 取像失败 / 返回 `null` | 头像缺失 | 取像返回 `null`（相机缺失或无 `renderTexture`）或真机行为不符预期 | **降级到轨 A 预设头像**（轨 A 永远兜底、**不阻断玩法**）；轨 B 保留为可选增强 |
| 底部录制按钮遮挡操作 | 操作点不到 | 安全区 X[-340,+260]/Y[-400,+500]，底部 180px 留空；运行态截图核对 | 挪动交互热区出禁区 |
| 头像与 Boss 身体错位 | 观感差 | 合层（L2）+ 对齐截图 | 锁定同一锚点 |
| 3 个 tracking 类型混淆 | 设计错 | 已实测可用类型：body/environment/face/hand/pet/two_person | 人脸玩法锁 `face` |

---

## 8. 前提假设（假设变了结论要重估）

1. **目标出口 = 抖音特效开放平台（像塑 / Effect House）提审**；本包是「制作与提审准备包」，非已过审上架包。
2. 项目宪法三层规则（合规 > 平台边界 > 像素规格）不变；像素死参数（64/128 画布、×8→512、DB16、图层≤6、粒子≤50、包体≤2MB、**帧≤24/动作（单动作 clip 口径）**）不变。
3. **「一个特效最多 2 种触发」**按平台边界执行；本方案占用：① 触摸**按下/抬起**（开火）② 人脸事件。**AR 相机朝向（转手机）属操控输入、不占触发额度**；**「人脸挂点」是否计入触发额度需与平台口径再核**——若计入，则改为「触摸 + 人脸挂点」两种，砍掉人脸事件触发。
4. 团队为一人/小团队 → 优先低维护、少工具链；不引入 JSON 配置、不引入 3D 物理/骨骼。**Boss 为 3D `ImageEntity`（世界锚定贴图载体），它属于「对象定位」，不属于「3D 骨骼/实时物理」**，不违反平台边界。
5. 平台能力以本机像塑版本（`Douyin AR.exe` 2025-09-23 构建）与官方现行文档为准；规则可能变化。
6. 本方案在**用户确认前不落地工程**（MCP 用户确认闸门）。

---

### 给策划的硬约束（同步给 game-design-director）
- Boss 头像是**双轨**（见 §9）：**轨 A = 预设 6 选 1**（默认兜底、本轮实现）；**轨 B = 摄像头取像**（待真机验证）。**轨 A 永远兜底**，轨 B 失败不影响玩法；旧稿"相册选图"已作废。
- 触发只有 **2 种**：触摸**按下/抬起**（开火）+ 人脸事件；**AR 相机朝向（转手机）不占触发额度**，设计别再叠第三种。
- **Boss = 3D `ImageEntity` 世界锚定**（官方 AR Plane/AR Camera/DeviceTracker 已实测）；**准星固定屏幕正中、命中走视口容差 0.17**，唯一公式见 §2.7。
- 无 3D 骨骼 / 无物理弹道 / 无联网：Boss 动画只能靠序列帧与位移缩放。
- 主操作区受安全区限制、底部 180px 是录制按钮禁区。
- 素材必须 DB16 / 512×512 / Nearest；否则工程不收。
- **PC 预览无 SLAM（约 4s 收敛）**：验收命中须长按 ≥7 秒，真机才看跟手性。

---

## 9. 头像来源双轨（v2.1）

> **本节取代旧稿「相册选图 `Image Picker (Head)`」主案**（该路径**对本版本不可用**，依据见 9.1）。
> **纪律**：轨 B 的 **API 存在性**来自本地声明文件（可复核）；其**运行时行为一律未验** ⇒ **本节对轨 B 不得出现"已实测 / 已跑通"，只用「规划 / 待验证」**。

### 9.1 为什么换掉「相册选图」

- **旧路径**：`Image Picker (Head)`（知识库描述：用户从相册选照片 → 自动人头抠图）。
- **本版不可用的依据（三条，分开写清，别混成一句）**：
  1. **实测**：本版编辑器创建该对象时报 **`Unknown scene object config id`** ⇒ 我们的构建**不暴露**它。
  2. **APJS 无 picker API**（**已核**：`APJS.d.ts` 全文 `grep -i picker` = **0 命中**）⇒ **运行时代码里没有取相册的通道**。
  3. ⚠️ **但它不是"平台没有"**：知识库目录 `object_catalog.json` **仍有条目** —— `Image Picker`（L932）、`Image Picker (Background)`（L949）、**`Image Picker (Portrait)`**（L966，描述含 "automatic portrait cutout"）。
- **两个必须记下的事实**：
  - **命名更正**：目录里是 **`(Portrait)`**，旧稿写的 **`(Head)` 属误引**（可能源于转述）。**以后引用一律以目录为准。**
  - **定性**：这是**"平台侧存在、本版编辑器不可用"的远期能力**，**不是"平台没有这个能力"**。⇒ 结论同样成立（**不能当本轮主案**），但**不可写成"平台无此对象"**，否则将来编辑器升级后该结论就错了。

### 9.2 轨 A —— 预设 6 选 1 像素头像（本轮实现 · 默认兜底）

| 项 | 内容 |
|---|---|
| 定位 | **本轮唯一实现**；**任何情况下都是兜底** |
| 资产 | **12 张**（6 张 16×16 逻辑 + 6 张 64×64；双分辨率、无降采样），**已产出** |
| 合规 | **零合规风险**：不使用用户任何数据 |
| 约束 | **计入包体**（见 §3.2）；**DB16 / 512 导出 / Nearest** 全程适用 |
| 角色（v2.1 起） | 内置 6 种像素"定妆照"，**替代旧稿的"默认占位头像"**；也是轨 B 失败时的兜底 |

### 9.3 轨 B —— 摄像头取像（**API 存在性已核；运行时行为未验**）

**证据（本地声明文件，可复核）**：`…\BuiltinResource\UserAPI\APJS.d.ts`（11,379 行）
- `APJS.CaptureFrameHelper.captureCameraOutput(camera: Camera, cropRect?: Rect, resolutionRatio?: number): Texture | null`（**L1635**；class `CaptureFrameHelper` **L1620**）
  - **类注释原文（L1613–1615）**：*"It captures from a camera's current `renderTexture` by **scheduling a one-shot copy after the next `AFTER_RENDER` event, and returns the destination texture immediately**."*
  - 方法注释原文：`capture camera output to a texture`；`cropRect` = **归一化纹理坐标（原点左下）**，`x + width / y + height` 不得超 1；`resolutionRatio` >1 被钳到全分辨率、≤0.002 退化为 **1×1**
  - **返回 `null` 的条件**：**相机不存在**，或**该相机没有 `renderTexture`**
- `APJS.Image.texture` **有 setter**（get **L4738** / set **L4743**）：*"At runtime, assigning `null` or `undefined` clears the current texture binding."* ⇒ **运行时可换图**
- `APJS.Camera.renderTexture`（get **L1338** / set **L1346**）：**默认 = 运行时绑定的 `Final Render Output`**；可用 setter 换成自定义 `RenderTexture`；且 *"其尺寸**不保证**与 `inputTexture` 或预览视口一致"*
- `APJS.Rect`（**L7554**）

**调用形态（规划 · 未落码）**：
```ts
const cam = camObj.getComponent("Camera") as APJS.Camera;
const tex = APJS.CaptureFrameHelper.captureCameraOutput(cam, new APJS.Rect(0.40, 0.40, 0.20, 0.20), 1.0);
if (tex) { avatarImg.texture = tex; }
```
（`Rect(0.40,0.40,0.20,0.20)` = 取画面正中 0.20×0.20 方形，与既有命中容差区 `0.17` 基本重合。）

### 9.4 轨 B 的 **5** 个未验点（**全部待真机**；a–d 为指派所列，**e 为本次核注释新增**）

| # | 未验点 | 文档证据倾向 | 若不利的处置 |
|---|---|---|---|
| **a** | 抓到的是**AR 相机原始画面**还是**最终合成输出**（含 2D HUD / 自身 Boss）？ | ⚠️ **倾向"最终合成输出"**：`renderTexture` 文档默认值即 **`Final Render Output`** ⇒ 很可能**把 Boss/HUD 自己也拍进去** | **必须改在 Boss 出场前取像**；或试经 `renderTexture` setter 换自定义渲染目标（**未验是否可行 / 是否影响出画**）。否则轨 B 不可用 |
| **b** | **方向与长宽比**：`cropRect` 是归一化纹理坐标，AR 输出可能是**横向传感器方向**，竖屏下裁出是否旋转 90° / 拉伸？ | 文档**未说明**（仅注"尺寸不保证与预览视口一致"） | 按真机结果调整 `cropRect` / 加旋转补偿；**不得假设竖屏即正向** |
| **c** | **调用时机**：`CLIENT_STATE_PREVIEW`（编辑预览）下可否调？真机 `capture` 状态下可否调？ | 文档**未说明** | 把取像排到**运行时 + 明确状态**；编辑预览不支持**不阻塞**（轨 A 兜底） |
| **d** | 返回纹理是**引用还是拷贝** ⇒ 下一帧相机更新后会不会被覆写（"定格"是否成立）？ | ⚠️ **倾向"一次性拷贝"**：类注释明写 ***one-shot copy*** 且"返回 destination texture" ⇒ **定格很可能成立** | 若实为引用 ⇒ 需**每帧重取**，或改为"取到即复制成静态贴图快照" |
| **e** ★ | **首帧时序**：注释说"**schedules** a copy after the next `AFTER_RENDER`，**returns immediately**" ⇒ **返回的那一刻拷贝可能还没发生**（拿到空/旧纹理） | 类注释 **L1614** | 取像后**至少延一帧再赋值**，或以"返回值非空且非纯色"做校验；**禁止"同帧取像+赋值"即视为成功** |

> **a / d 有文档证据倾向，但仍是"倾向"不是"实测"** —— **真机确认前，轨 B 整体视为未定。**

### 9.5 两条定性（写死）

1. **轨 B 零包体成本**：取像结果是**运行时纹理，不进包** ⇒ **不计入 §3.2 的 2048 KB 预算**（轨 A 的 12 张仍计入）。
2. **轨 B 不违反 DB16，但须显式豁免**：**DB16 约束的是"我们产出的美术资产"**；**运行时用户内容属例外**。⇒ **本节即豁免声明**：轨 B 纹理**不受 DB16 / Nearest / 512 三项约束**。
   - **双向**：门禁（包体 / 色板 / 像素规格）**不得据此判轨 B 违规**；反之，**轨 B 纹理也不得被当作产物资产入库、不得参与体积与张数核算**。

### 9.6 合规口径（据实重写 · **不沿用旧稿"相册选图 + 授权话术"**）

- **数据来源**：轨 B = **用户主动把 Boss 头部对准"当前在场的真人"**，画面**来自 AR 相机本身** —— **不是相册、不是通讯录、不是任何上传的图**。
- **三不**：**不存储、不上传、不导出**；取像结果**仅存活于本局运行时纹理，本局结束即消失**。
- **不做的事**：不采集好友列表 / 通讯录 / 位置 / 设备标识；**不建面部特征库、不做人脸识别或比对**（取像只是"取一张画面方块"，**无识别语义**）。
- **权限口径**：**相册/照片权限不再需要**（路径对本版本不可用）；⚠️ **取像是否触发"摄像头"类权限声明，须真机确认**（并入 9.4-c 与 `node-plan §7` 第 10 项）。
- **提审材料**：轨 B 若落地，玩法说明须如实写明"头像来自用户对准在场者的**实时画面**，**不存储、不上传**"；**若轨 B 未过真机验证，则本节合规口径只保留轨 A（零数据）。**

### 9.7 落地顺序（现在做 vs 到那步再说）

| 阶段 | 做什么 |
|---|---|
| **现在（本轮）** | **只落轨 A**（预设 6 选 1 兜底）+ 清理旧路径残留；**轨 B 只写文档、不落码** |
| **开闸后真机** | 验 9.4 的 **a–e**（与 `node-plan §7` 第 9 / 10 项**同批上机**） |
| **轨 B 通过后** | 接入取像 + 入口交互；**轨 A 保留为兜底、不删** |
| **轨 B 不通过** | **轨 B 记为"已登记未落地"**，玩法不受影响（轨 A 兜底）—— **不阻断提审** |

—— tech-architect / 柯桥良
