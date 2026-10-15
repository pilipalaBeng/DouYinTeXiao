# ar-boss-raid · 节点/图层结构方案（node-plan）

> ⚠️ **2026-10-15 废除通告**：本文所有「出战牌 / 头像 / `HeadMount` / `HeadFrame` / `FaceImage` / 头像挂点」相关内容**已随好友头像功能整体废除**（作者决定）；现行实现无任何头像与社交元素。相关章节仅作历史档案，**不得据此制作或验收**。

> 职责：技术架构总监 / 柯桥良
> 上游：`game-design-doc.md`（游有方 v1.0）+ `tech-spec.md`（柯桥良）+ `animation-spec.md`（关建帧）+ `vfx-spec.md`（霍炜然）+ `art-spec.md` + `AGENTS.md`（项目宪法）
> 出口：抖音特效开放平台（像塑 / Effect House）提审 —— 本文件是**制作与提审准备包**的工程结构定义，不是已过审上架包。
> 宪法优先级：合规 > 平台边界 > 像素规格 > 其他
> 硬约束：图层 ≤6 / 粒子 ≤50 / 包体 ≤2MB / 序列帧 ≤24（单动作）/ DB16 16 色 / Nearest / 禁非整数缩放与非 90° 整数倍旋转
>
> **★ v2 结构变化（AR 空间锚定）**：新增 **`ARTracking` 结构链（`AR Camera` + `DeviceTracker`）**；**Boss 由 2D 屏幕贴图改为 3D `ImageEntity`、锚定真实世界坐标**（随转手机在屏幕滑动）；**准星固定屏幕正中、不跟随手指、不接 Touch**。命中判定改 `worldToViewportPoint` 视口容差 0.17（见 `tech-spec §2.7`、`implement-plan §2.1.1`）。**`ARTracking` 不计入 6 层**（相机/追踪载体，同摄像头透传）。

---

## 0. 一句话架构

**摄像头透传是平台底层（不占 6 层）；AR 追踪链（`ARTracking` 组 = `AR Camera` + `DeviceTracker`）是渲染/追踪载体，也不占 6 层；虚拟内容分 6 个渲染层（L1–L6），由一个不占层数的变换父节点 `ContentRoot` 统一承载 L2–L5 并承担屏幕震动位移。**

> **v2 两套坐标体系**：L2 Boss 走 **3D 世界坐标**（`AR Camera` 渲染，随转手机在屏幕位移）；L3–L6（武器/特效/HUD/状态页）走 **2D 屏幕坐标**。**跨体系换算唯一入口 = `arCamera.worldToViewportPoint()`**。

---

## 1. 六层结构表

| 层 | 名称 | 承载内容 | 坐标 / 渲染体系 | 常显 / 瞬时 |
|---|---|---|---|---|
| **L1** | 氛围装饰层 | 局部环境粒子/装饰（**本项目留空**，作为降级首要牺牲位） | 2D/3D 局部装饰 | 常显（可空） |
| **L2** | Boss 主体层 | Boss 身体（66 帧序列帧，**3D `ImageEntity` 世界锚定**）+ 头部出战牌挂点 + 闪白遮罩 + 护盾道具 + 核心点 | **3D 世界坐标**（`AR Camera` 渲染；随转手机在屏幕滑动） | 常显 |
| **L3** | 武器层 | 枪 + 准星（常态/命中态双态，**固定屏幕正中**）+ 枪口闪光（不跟随手指） | 2D `ScreenTransform`（屏幕空间；准星不接 Touch） | 常显（战斗中） |
| **L4** | 命中特效层 | 命中像素星 / 破盾碎片 / 暴怒脉冲 / 认输彩带+星爆 / 伤害数字 / 准星 hitmarker | VFX(内置 Basic Particles) + `2D Text` | 瞬时 |
| **L5** | HUD 层 | 血条（底+填充+延迟条+阶段刻度）/ 阶段与连击提示 / 假死提示文案 | 2D `2D Text` + `Screen Image` | 常显 |
| **L6** | 状态页层 | READY / WIN / LOSE 结算卡（**独立父对象**，统一承载遮罩+面板+标题+CTA） | 2D 独立父对象 | 状态切换时 |

> **[平台底层 · 不计入上表]** 摄像头透传 / 真实环境画面 —— 平台默认背景。
> 依据 `rules/scene-common.md`：AR/保留摄像头的玩法**禁止**用整屏背景图、整屏场景板或整屏蒙层覆盖摄像头；只用独立装饰与必要局部结构件。
> 层级顺序依据官方默认层级：**摄像头 < 背景装饰 < 运动对象 < 命中反馈/HUD/弹窗**。

### 1.1 必须合层 / 必须拆开（理由）

| 判定 | 对象 | 理由 |
|---|---|---|
| **必须合层 ①** | L2：Boss 身体 + 头部出战牌挂点（`HeadMount`→`HeadFrame`→`FaceImage`） | 头像必须与身体**刚性对齐**；拆到不同父节点会产生"头像漂移"（柯桥良已点名的风险）。 |
| **必须合层 ②** | L3：枪 + 准星 + 枪口闪光 | v2 三者与**固定在屏幕正中的准星**同锚点、同触发；拆层会导致重复对齐换算与同步误差。 |
| **必须拆开 ①** | L4（命中特效）与 L5（HUD） | 生命周期不同：HUD 常显、L4 瞬时；合层会让常显层的显隐逻辑污染瞬时反馈。 |
| **必须拆开 ②** | L6（状态页）独立于其他所有层 | 官方 `rules/scene-game.md`：开始/结算/暂停状态页用**独立父对象**统一承载遮罩/面板/标题/内容，便于整页显隐与重置。 |

### 1.2 关于 `ContentRoot`（不占层，重要）

```
2D Camera
└─ ContentRoot            (2D Scene Object；屏幕空间变换父节点，不占 6 层额度)
   ├─ L2 Boss 主体层…
   ├─ L3 武器层…
   ├─ L4 命中特效层…
   └─ L5 HUD 层…
```
- `ContentRoot` 是**变换父节点**，不是渲染图层；render group 仍独立控制排序，因此**不消耗 6 层额度**。
- **屏幕震动** = 偏移 `ContentRoot` 的 `ScreenTransform.anchoredPosition`（详见 §4 决策 3）。
- L1/L6 **不挂在 ContentRoot 下**：震动只作用于 L2–L5（氛围装饰与结算页不参与震屏）。
- **v2：`ARTracking`（`AR Camera` + `DeviceTracker`）不在 `ContentRoot` 下**，它是独立的 AR 追踪链；`ContentRoot` 是 2D 屏幕空间父节点，**不承载 AR 相机**。震动只动 `ContentRoot`，**绝不动 `AR Camera`**（否则破坏世界锚定与摄像头透传对齐）。

### 1.3 音频对象不占 6 层（结论）

- **结论**：本项目所需的 **26 个音频场景对象（2 BGM + 24 SFX）不占用「图层 ≤6」**，也不消耗粒子预算。
- **依据（本质）**：音频对象**无渲染器、无 draw call、不参与视觉绘制顺序**，因此不落在任何视觉绘制带 L1–L6。
- **依据（schema）**：`knowledge/schemas/object_schemas.json`：`Audio Player.renderGroupType = "Utility"`、`Audio Effect.renderGroupType = "Music"`。
- **⚠️ 推理前提纠正**：`renderGroupType` **不能单独作为"是否占视觉层"的判据** —— 同为 `Utility` 组的 `Basic Particles` 等 **VFX 是有视觉的**（`knowledge/schemas/agent_object_configs.json`：`VFX_*Particles.renderGroupType = "Utility"`）。成立依据只能是"**音频对象无渲染输出**"。
- **合规挂法**：26 个音频对象统一挂**常驻容器 `AudioRoot`**（Empty Object，非视觉、不占层）；`AudioRoot` 必须**常驻 `enabled`、独立于状态页/视觉父节点**（官方 Pitfall 1：父节点 `setEnabledInHierarchy(false)` 会**级联禁用子对象**，若挂到状态页下，切页会切断音频）；**不要**挂到 `ContentRoot`（震动父节点）下。
- **待实测**：平台是否对"**场景对象总数**"设上限（构建/提审若报对象数限制，再合并音频对象）。

### 1.4 音频接口边界（已核 schema，供 audio-spec 对齐）

- **`AudioComponent` 设计期属性**（已核 `knowledge/schemas/component_schemas.json`）：`resourcePath` / `audioRef`(AudioAsset) / `playMode` ∈ **{ONCE, LOOP, INFINITE}**（默认 ONCE）/ `audioType` ∈ {BGM, AUDIO_EFFECT}（默认 BGM）/ `loopCount`（默认 1，范围 **[1, 99999999]**，**仅当 `playMode==LOOP` 生效**）/ `autoPlay` / `mute` / `volume`（默认 100，范围 **[0,100]**）/ `isMobilePreview`。
- **`AudioComponent` 运行时接口只有**（已核 `APJS/AudioComponent.d.ts`）：`loopCount: number`、`volume: number`（0–100，越界钳制）、只读 `duration` / `isFinished`、方法 `play()` / `pause()` / `resume()` / `stop()`。
- **⚠️ 三条硬结论**（直接影响 audio-spec）：
  1. **运行时无 `playMode` / `autoPlay` / `mute`** —— 这三个是**设计期属性**，脚本改不了。故 **BGM 的 `INFINITE` 必须在编辑器里设死**；运行时**只能靠 `stop()` 切断**（印证 audio-director 的 RESET 连带修正：`AudioRoot` 常驻 enabled 时，**只有逐个 `stop()` 能阻止 BGM 跨轮渗漏**）。
  2. **运行时静音只能用 `volume = 0`**（无 `mute` 可写）。批量静音走"遍历 AudioRoot 子对象设 `volume=0` + 记旧值"。
  3. **引擎没有音频 `pitch` / `playbackRate` 属性** —— 音高**脚本不可调**；需变调只能预生成不同音高的音频资产。
- **全局时间轴**：本引擎**无 `APJS.Time` 类、无全局 `timeScale`**（已核 `APJS.d.ts` / `APJS_runtime.d.ts` 全量 grep 仅得 `Physics2D.timeSpeed` 与 `Physics3D.timeScale`，二者注释均写明**只缩放物理模拟**；`APJS_runtime.d.ts` 对 3D 明写 "Global properties (gravity, timeScale) are **not** reset on record start"）。**故 hitstop 不可能、也不需要"关闭全局时间轴来暂停音频"** —— 音频速率/音高**结构性不受影响**（连属性都没有）。

---

## 2. 节点树（2D 屏幕层 + 3D 世界锚定 Boss；本项目不做骨骼）

```
场景根
├─ ARTracking                                     [结构链·**不占 6 层**]   ← v2 新增
│  ├─ AR Camera                                   AR 相机（AR Plane 自动创建；渲染 3D 世界；脚本按名"AR摄像机"解析）
│  └─ DeviceTracker                               设备跟踪（trackingMode=World，6DoF；提供 AR 相机朝向）
├─ ContentRoot                                    ← 变换父节点（震动作用对象，不占层；2D 屏幕空间）
│  ├─ BossRoot                                    [L2] **3D 世界锚定**；承接 摆动/抖动/击退 的加法合成
│  │  ├─ BossBody                                 [L2] **3D `ImageEntity` + AnimatedTexture（66 帧序列帧）**
│  │  │  ├─ WhiteFlashMask                        [L2] 闪白遮罩；与 BossBody 同尺寸同锚点；默认 disabled
│  │  │  ├─ HeadMount                             [L2] 空节点；对齐头顶挂点，随身体刚性跟随
│  │  │  │  └─ HeadFrame                          [L2] 出战牌相框贴图
│  │  │  │     └─ FaceImage                       [L2] 头像（**`tech-spec §9` 双轨**）：轨 A 预设像素头像（默认兜底）/ 轨 B 摄像头取像**运行时纹理**（待真机验证）
│  │  │  └─ CorePoint                             [L2] 护盾核心点小贴图；护盾期定时闪烁
│  │  └─ ShieldProp                               [L2] 护盾贴图；仅护盾期可见，随身体
│  ├─ WeaponRoot                                  [L3] ScreenTransform；**不动（无手指跟随）**
│  │  ├─ Gun                                      [L3] 枪贴图
│  │  ├─ MuzzleFlash                              [L3] 枪口闪光（≤3 帧序列帧）
│  │  └─ Crosshair                                [L3] 准星（crosshair_idle / crosshair_lock 双态静态贴图）；**固定屏幕正中 (0,0)、不接 Touch**
│  ├─ FxRoot                                      [L4] ScreenTransform；命中特效层根
│  │  ├─ Emitter_HitStar                          [L4] Basic Particles（普通命中星）
│  │  ├─ Emitter_CritStar                         [L4] Basic Particles（暴击星）
│  │  ├─ Emitter_ShieldShard                      [L4] Basic Particles（破盾碎片）
│  │  ├─ Emitter_EnragePulse                      [L4] Basic Particles（暴怒脉冲）
│  │  ├─ Emitter_Confetti                         [L4] Basic Particles（认输彩带）
│  │  ├─ Emitter_VictoryStar                      [L4] Basic Particles（认输星爆）
│  │  ├─ DamageTextPool                           [L4] 2D Text 对象池（3 个）
│  │  └─ HitMarker                                [L4] 准星命中标记
│  ├─ HudRoot                                     [L5] ScreenTransform
│  │  ├─ HpBar_Frame / HpBar_Fill / HpBar_Lag     [L5] 血条底 / 填充 / 延迟余量条（红色复用）
│  │  ├─ PhaseTick_66 / PhaseTick_33              [L5] 阶段刻度线（静态元素）
│  │  └─ HintText                                 [L5] 阶段提示 / 连击 / 假死"它装的！"
│  ├─ ContentRoot_UI                              [L5] UI Tween 承载（血条掉血、结算卡滑入）
│  └─ TexHolder                                   [L4 辅助] 隐藏 Screen Image；粒子 MainTexture 贴图源
│                                                    （visible=false；GUID 经 @serializeProperty 引用）
├─ Fx_HitFlash 光点                                [L4 辅助] additive 光核（≤8px，色=DB16 精确值）
├─ AudioRoot                                       [非视觉·不占层] 必须常驻 enabled；26 个音频对象（2 BGM + 24 SFX，1 资产=1 AudioComponent=1 对象）
└─ StatePages                                     [L6] 独立父对象
   ├─ Page_Ready                                  [L6] 开始页（遮罩+面板+标题+CTA）
   ├─ Page_Win                                    [L6] 胜利结算卡
   └─ Page_Lose                                   [L6] 失败结算卡
```

**绑定三原则（源自 animation-spec §8.2）**
1. Boss 身体 + 头部出战牌挂点**同层同根**（均挂 `BossRoot`）——杜绝头像漂移。
2. `WhiteFlashMask` 与 `BossBody` **完全同尺寸同锚点**（共用同一锚点与 `sizeDelta`）——否则闪白错位露边，打击感崩。
3. 位移走**加法合成**（基础位 + 摆动 Tween + 抖动 + 击退 + 掉落），不做多层父子——守住 ≤6 图层与坐标系复杂度。

> **✅ v2 待技术收口 —— 已收口（tech-architect）**：Boss 在 v2 是 **3D 世界锚定对象**（`AR Camera` 渲染），`ContentRoot` 是 **2D 屏幕空间父节点**。原选项 A/B 的裁定如下：
> - **采纳 A（但不依赖父子传导）**：**L2 Boss 的抖动 = 脚本在 Boss 自己的世界空间做"加法位移"**（叠加到 `BossRoot` —— 与节点树第 89 行"承接 摆动/抖动/击退 的加法合成"、`animation-spec §3.3` 的 `HURT` `shakeOffset` **同一节点同一条链**）。**`ContentRoot` 的 2D 震动保留、只服务 L3/L5**（枪/准星/HUD/弹字），幅度减半，避免双重抖动打架。
> - **否决 B**：`AR Camera`（`TargetTrackingCameraJS`）的官方语义是"**keeps the camera's projection aligned with the device's real camera feed each frame**"→ **我们叠加的偏移会被每帧覆写**，且会破坏虚拟↔真实的注册。**且它 `properties` 为空、无 FOV/偏移可写**。
> - **不要依赖父子传导**：把 `ContentRoot`（2D）的偏移指望传到 3D 世界子节点**不可靠**（3D 世界锚定内容的 transform 可能被 AR 追踪每帧覆写）→ **抖动必须由脚本在 Boss 的世界空间显式施加**。
> - **幅度换算（FOV 无关口径，因 AR 相机 FOV 不可读）**：3D 抖动幅度用 **Boss 自身世界高的比例**表达，`世界幅度 = Boss世界高 × k`，**k ≈ 0.4%（普通）～3%（暴怒）**（≈ 128 逻辑像素投影下的 0.5–4 屏幕 px）；**单帧 ≤ 3% · 只平移 · 不旋转**。
> - **不额外增设隔离节点**：抖动位移 ≤4 屏幕 px ≈ 容差 `0.17` 的 **≈0.4%** → 对 `§2.7` 命中判定**无实质影响**，为此增设"防抖动命中隔离节点"属**过度工程**。若日后真机实测发现抖动影响命中，再引入 `BossBody` 隔离（P2）。
> - **L3–L5 的屏幕震动不受影响**（原决策 3 继续有效）。
> - **🔴 v2.2 反转（见 `tech-spec §2.8 ⑥`）**：团队已把抖动**作用点收敛为单点 `ContentRoot`**（`animation-spec` 删 `shakeOffset` 通道 + `vfx-spec` 删 V6），**即依赖了上面第 3 条明确禁止的"父子传导"**。故本裁定"**必须由脚本在 Boss 的世界空间显式施加**"**降级为条件待验**：真机 A/B（本文件 §7 待实测清单 第 9 项）判 **不跟随** ⇒ **必须恢复路①**；判 **跟随** ⇒ 本裁定 A 作废、单点方案成立。**验证前，"Boss 天然跟随"不得当既成事实引用**（文档证据倾向"不跟随"，见 §7 待实测清单 第 9 项）。
>
> **✅ 2026-10-14 实测补充（飞行怪落地时顺带闭合）**：实测「脚本对 3D 世界锚定 Boss 的 `Transform.setWorldPosition` 写入后立刻回读」→ **y 值恒等、误差 0，且预览中对象确实位移出屏**。即：**脚本在 Boss 自身世界空间施加的位移是生效的、AR 追踪不覆写脚本写入**。→ 本文件 §7 待实测清单 **第 9 项（Boss 是否跟随 2D 父偏移）** 的"不跟随"侧有了直接证据；**"必须由脚本在 Boss 世界空间显式施加"这条裁定 A 可确认有效**。飞行怪即按此法实现（`game-design §14.2`、`tech-spec §1` 已记为实测高置信）。

---

## 3. 状态机

### 3.1 游戏流程态 `GameState`

```
READY ──(触摸按下/开拍)──> FIGHTING ──(HP<=0)──> WIN
                          │
                          └──(40s 超时且 HP>0)──> LOSE
                          └──(开拍/录制开始事件)──> RESET → READY
```
> **v2 输入语义**：`FIGHTING` 期间，**触摸「按下」= 开始连射、抬起 = 停火**（`TouchData.position` 只用于按下/抬起判定，不用于瞄准）；**转手机改变 AR 相机朝向不改变任何状态**（只是持续改变 Boss 投影位置）。

| 状态 | 进入条件 | 保留 / 隐藏 / 恢复 |
|---|---|---|
| `READY` | 初始 / RESET 后 | 显 `Page_Ready`；`BossRoot` 待机；`HudRoot` 隐藏；输入=仅"开始" |
| `FIGHTING` | 玩家开始 | 隐 `Page_Ready`；显 `HudRoot`/`WeaponRoot`/`BossRoot`；输入=射击 |
| `WIN` | `BossState.DEFEATED` 演出结束 | 显 `Page_Win`；冻结射击输入；Boss 保持认输姿态 |
| `LOSE` | 40s 超时 | 显 `Page_Lose`；Boss 走出画外 |
| `RESET` | 开拍/录制开始事件 | 恢复全部初始状态后再启动本轮（官方 `rules/scene-game.md` 要求） |

### 3.2 Boss 状态态 `BossState`

`SPAWN / IDLE / ENRAGE / SHIELD / FEIGN_DEATH / DEFEATED / TAUNT`

| 状态 | 主序列帧 | 触发（来自设计案） |
|---|---|---|
| `SPAWN` | `SPAWN_JUMP_IN`（Once） | 流程 READY→FIGHTING |
| `IDLE` | `IDLE`(Loop) + `IDLE_SWAY`(Tween) | 阶段 1 默认 |
| `ENRAGE` | `ENRAGE_INTRO`→`ENRAGE_LOOP`(Loop) | **HP ≤ 66% 首次** |
| `SHIELD` | `SHIELD_UP`→`Clamp`（含 `SHIELD_CORE_FLICKER`） | **HP ≤ 33%** |
| `FEIGN_DEATH` | `FEIGN_COLLAPSE`→`Clamp` | **HP 约 15%（区间 10%–20%）** 首次 |
| `DEFEATED` | `DEFEAT_SURRENDER`→`DEFEAT_HOLD` | **HP ≤ 0** |
| `TAUNT` | `TAUNT_ESCAPE` | 40s 超时失败 |

### 3.3 ⭐ 两处修正（必须写进实现）

**修正 ①：`HURT` 不是状态，是叠加反馈函数 `hitFeedback()`。**
- 射击 4 发/秒 → 每秒 4 次受击。若把受击做成 `BossState.HURT` 去打断并重播待机 → IDLE 播放头被反复重置 → 摆动抽搐、呼吸永不播完。
- 正确做法：受击**不进主状态机**，只改三处**外部量**，全部与播放头无关：
  1. `WhiteFlashMask.enabled = true`（1–2 帧后自动关）；
  2. `shakeOffset` 变量（衰减），渲染时与基础位**加法合成**：`pos = basePos + swayOffset + shakeOffset`；
  3. 全局 `hitstop`（冻结 Boss 动画 + 屏蔽输入，见 §4 决策 2）。
- **评审红线**：命中路径**绝对禁止**调 `AnimatedTexture.reset()/play()`、禁止改 `Image.texture`、禁止把状态机切到 `HURT` 再切回。

**修正 ②：阶段阈值以设计案为准 = 66% / 33%；假死触发 HP ≈ 15%（10%–20%）。**
- 技术草案曾写 `HP ≤ 50%` 为暴怒阈值 —— **作废**，改用设计案 **66% / 33%**。
- 假死触发点：**HP 约 15%（区间 10%–20%）**（`game-design-doc.md` §阶段 3 + 第 105 行）。
- 对照（`game-design-doc.md`）：阶段 1 = 100%→66%；阶段 2 = 66%→33%；阶段 3 = 33%→0%，其中 33% 开盾、约 15% 假死、0% 认输。

---

## 4. 四条工程决策记录

### 决策 1 · 不使用 `ParticleEmitter2D`
- **决定**：本特效**禁用** `ParticleEmitter2D`。
- **依据**：官方 `skills/ability/VFX/SKILL.md` 明确 `ParticleEmitter2D` 是 **2D 流体/液体**仿真组件（水流、水池、黏液），**"不是烟雾、火花、碎屑的通用发射器"**。
- **替代**：像素粒子一律走 **内置 `Basic Particles` + 脚本换 `MainTexture`**。
  - 换贴图**严格按官方顺序**：`vfx.stop()` 清旧粒子 → `asset.setTexture("MainTexture", tex)` → `vfx.play()`。
  - 贴图源用**隐藏的 `Screen Image` 做 TexHolder**（官方 pattern，GUID 经 `@serializeProperty` 引用），**不要每颗粒子单独贴图**。
  - **硬约束（已核 `VisualEffect` 组件 schema）**：该组件 `unique: true`，且 `mutualExclusion: [Image, MeshRenderer, Text2D, Mask, …]` —— **同一对象不能既挂 VFX 又挂 Image**。故 **TexHolder 必须是独立的隐藏对象**（见 §2 节点树 `TexHolder`），不可与发射器同对象。
  - 已确认可用的脚本接口：`emit()`（可控 burst，用于命中星 3/5）、`stop()` / `pause()` / `play()`；参数读写 `asset.setFloat/setVector/setTexture/setColor` + `asset.hasFloatKey(name)`。

### 决策 2 · hitstop 用 `AnimatedTextureProvider.pause()/resume()` + 输入守卫，**不依赖全局 timeScale**
- **决定**：顿帧 = **只冻结 Boss 动画 + 屏蔽射击输入**，L4 特效层照常跑。
- **依据（已核 `APJS.d.ts`）**：本引擎**没有全局 `timeScale` / `unscaledDeltaTime`**。仅存在 `APJS.Physics2D.timeSpeed` 与 `APJS.Physics3D.timeScale`，且注释写明二者**只缩放物理模拟**，不影响动画/VFX —— 故方案②（全局 timeScale=0 + unscaled dt）**无 API 支撑，否决**。
- **实现**：
  - Boss 动画冻结：`AnimatedTextureProvider.pause()` / `resume()`（该类确含 `play/pause/resume/stop/reset`；`loopCount=0` 亦可禁用基于时间的播放）。
  - 屏蔽输入：全局 Touch 回调内加 `hitstopTimer > 0` 守卫直接 `return`。
  - **L4 命中特效层照常跑 `onUpdate`** —— 因为未动任何全局时间，粒子/闪白不受影响（这正是解决"闪白被冻住"的关键）。
  - 时长：**普通 50ms / 暴击·核心 67ms / 破盾 83ms / 击杀 0ms**（4 档，单一权威来源 = **`vfx-spec §6.1`**，本文只引用；原 40/60/70 非整帧值已作废）。
  - Boss 的脚本位移/缩放（Tween）顿帧时**跳过 `onUpdate` 推进**。
- **评审红线**：hitstop 实现中不得调用任何全局时间 API（不存在），不得冻结 L4。

### 决策 3 · 屏幕震动作用于 `ContentRoot`，**不动真 Camera**
- **决定**：震动 = 偏移 `ContentRoot.ScreenTransform.anchoredPosition`。
- **依据**：a) 官方 Camera Shake 范例操作的是虚拟 Camera 的 Transform，**动真摄像机是否连带影响摄像头透传对齐，无法确证**（标待实测）；b) 规则要求"复用已有 Camera、不重复创建""结构收敛" —— 动共享 Camera 风险最高。
- **`ContentRoot` 为变换父节点，不占 6 层额度。**
- 参数（源自 vfx-spec §6.2）：普通 0.5px / 暴击 1.5px / 破盾 3px / 暴怒 4px / 认输 3px / 失败 2px；**单帧位移硬上限 4px、只平移不旋转、新震动覆盖不叠加**。
- **v2 补充（3D Boss 加入后，见 §1.2 收口结论）**：本决策**只管 L3/L5 的 2D 震动**；**L2 Boss 的抖动另走"Boss 世界空间加法位移"**，且**不得依赖父子传导**（2D 父节点的偏移能否传到 3D 世界子节点不可靠、可能被 AR 追踪覆写）。

### 决策 4 · 粒子降级 `setFloat` 的键名**必须 `hasFloatKey` 实测**，兜底改停 emitter
- **决定**：粒子预算管理器的降级杠杆，**未探到真实键名前不得写死 `setFloat("rate", …)`**。
- **依据**：官方 Basic Particles 文档列出的可调参数只有 `Lifetime / Min / Max / MainTexture`，**无名为 `rate` 的浮点键**；官方明写"只有 VFX Graph 暴露的参数可用 `setFloat`，先用 `asset.hasFloatKey(name)` 判断"。
- **落地**：
  1. 落工程第一步：`query_knowledge` 查该 Basic Particles 资产暴露的 key，或脚本枚举 `asset.hasFloatKey(name)` 打日志 → 用**真实键名**；
  2. **首选杠杆（已知可用，零 key 依赖）**：`setEnabledInHierarchy(false)` 关闭对应 emitter 对象；
  3. **兜底**：调 `Lifetime` 缩短存活，加速自然回收。
- **阈值分工（不变）**：`alive>50` → 全部 `stop(APJS.VFXStopBehavior.StopEmitting)`（**硬保证**）；`alive>46` → 按降级阶梯削（削峰）；`alive<40` → 回滞恢复。日志前缀 `[guard]`，打点 `budgetDropped`。

---

## 5. 资源导入参数清单（每张逐项设）

| 参数 | 值 | 说明 |
|---|---|---|
| `filterMin` | `Nearest` | 缩小采样点采样 |
| `filterMag` | `Nearest` | 放大采样点采样 |
| `filterMipmap` | `None` | 不做 mip 采样 |
| `enableMipmap` | `false` | 关闭 mipmap 生成 |
| `Max Resolution` | `Size512` | 防止被二次缩放到非 512 |
| `wrapModeS` / `wrapModeT` | `Clamp` / `Clamp` | 避免边缘循环采样脏边 |
| `Compression Type` | **≠ `None`（必须开压缩）** | 见下方红线说明 |

> **包体红线（写给主程的门禁）**：2MB 能否达标**不取决于张数，取决于"压缩/尺寸上限"是否落实**。若任一 512×512 以未压缩 RGBA 进包 = 1.0 MiB/张，66 张即 66 MiB，爆红线 33 倍。→ 包体门禁必须**逐张校验 `artifactFileSize`**，并汇总入包总量 ≤2MB。
> **导出倍率口径**：`导出尺寸 = 逻辑尺寸 × N`，N = 满足"导出 ≤512 且为整数倍的最大整数"。128×128 逻辑 → ×4 = 512；64×64 → ×8 = 512；32×32 → ×8 = 256。
> **待观察**：若开压缩后像素出现块状伪影，需拿一张实测 `artifactFileSize` 与观感后重估（优先保像素观感，靠尺寸/张数控体）。

---

## 6. 命名规范

| 类别 | 规则 | 示例 |
|---|---|---|
| 资源文件 | **英文小写 + 下划线**，禁中文/空格 | `white_flash_mask.png`、`crossbow.png`、`crosshair_lock.png`、`hp_fill.png`、`head_frame.png` |
| 序列帧目录 | **`anm_<action>/`** | `assets/boss/anm_idle/`、`assets/boss/anm_enrage_intro/` |
| 序列帧文件 | **`anim_001.png` 起**（一动作一目录） | `anm_idle/anim_001.png … anim_006.png` |
| 粒子/特效贴图 | 前缀 `fx_` | `fx_hit_star_a.png`、`fx_shield_shard.png`、`fx_confetti_strip.png` |
| 枪口闪光序列帧 | 前缀 `shot_` | `shot_muzzle_001.png` |
| UI 贴图 | 前缀 `ui_` | `ui_hp_fill.png` |
| 脚本 | **英文**（类/函数/变量/DSL `command_type`） | `BossAnimPlayer`、`BossStateMachine`、`ShootHandler` |
| 逻辑动画 ID | 大写英文 + 下划线 | `ANM_Boss_Idle`、`ANM_Boss_FeignCollapse` |
| 场景对象 key | 允许中文（官方规则） | `出战牌相框`、`护盾核心点` |

---

## 7. 待实测清单（附方法）

| # | 待实测项 | 方法 | 影响 |
|---|---|---|---|
| 1 | ~~`AnimatedTexture.playMode` 是否含 `ClampForever`~~ **已核实：不支持** | 已核 `APJS.d.ts`：`AnimatedTexturePlayMode = {Forward, PingPong, Randomize, Shuffle}`，**无 `ClampForever`**（`ClampForever = -2` 属 `AnimationWrapMode`（Animator 子系统），非本路径） | → 三个"保持"态（`SHIELD_HOLD`/`FEIGN_HOLD`/`DEFEAT_HOLD`）**启用退路**：播 `Once` 后隐序列帧、显末帧静态 `Image`。**省图备选（待实测）**：`loopCount=1` + 监听 `AnimatedTextureEvent.PlayEnd`（或 `LoopEnd`）后 `pause()` 停末帧 |
| 2 | Basic Particles 的发射率键名（是否有 `rate`） | `query_knowledge` 查该资产暴露 key；或脚本枚举 `asset.hasFloatKey(name)` 打日志 | 决定粒子降级杠杆 ②/③（见 §4 决策 4） |
| 3 | `getSlamInfo().planeDetected` / `DeviceTracker.trackingMode` 可用性 | 最小脚本打印 `planeDetected/planeTransform/trackingMode` → 编译 → 真机验证 | **v2 主方案依赖** AR Plane/DeviceTracker（世界锚定）。**⚠️ 原"`World` 不稳则降级 `Surface`/`Orientation`（3DoF）"是"未绑定处置"（无阈值/无触发点/无判定人），现按本项目准入规则补齐**：**触发点** = 真机出现① `planeDetected=false` 持续 >1s，或② 静止时 Boss 屏幕漂移 > 标定值，或③ 转头后 Boss 无位移／延迟 > 3 帧；**阈值** = 漂移量与延迟由**主程真机首次跑时标定**并写入 `submit-checklist`；**判定人** = 主程执行／`tech-architect` 判定；**后果** = 判"不稳" ⇒ 降级 `Surface`/`Orientation`(3DoF) **或阻断提审**；⚠️ **降级后"转手机瞄准"的判定语义会变（3DoF 无平移视差），必须回报架构重估 §2.7 公式**。**标定完成前，本条不得判过** |
| 4 | ~~相册选图权限流与抠头产出~~ **已废止** | **本版编辑器不支持该对象**（实测报 `Unknown scene object config id`）；**APJS 无 picker API**（`grep -i picker` 全文 = 0 命中）。⚠️ 知识库目录**仍有条目**（`Image Picker` / `(Background)` / **`(Portrait)`**）⇒ 属**"平台侧存在、本版不可用"的远期能力**，**不是"平台没有"**；且旧稿写的 `(Head)` 是**误引**（目录为 `(Portrait)`）。**头像来源验证改由第 10 项承担** | **轨 A 预设头像兜底 ⇒ 不再需要抠头质量/裁切容差**（旧结论作废） |
| 5 | ~~陀螺仪/设备运动 `GyroSensorAgent`（@alpha）~~ | — | **v2 不采用**：设备朝向由官方 `DeviceTracker` 承担（已实测）；不再触碰 `@alpha` |
| 6 | 动真 Camera 是否影响摄像头透传 | 对照实验：偏移虚拟 Camera vs 偏移 `ContentRoot` 的预览截图 | 佐证 §4 决策 3（当前已选安全路径，此项仅做冗余确认） |
| 7 | ~~hitstop 是否会把音频变调（`APJS.Time.timeScale`）~~ **已核实：不存在该 API** | 全量 grep `APJS.d.ts` / `APJS_runtime.d.ts`：**无 `class Time` / `APJS.Time`**，仅 `Physics2D.timeSpeed`、`Physics3D.timeScale`（注释均可物理模拟专用）；`AudioComponent` 运行时**无 `pitch`/`playbackRate`**（见 §1.4） | → 全局 timeScale 方案**无 API 支撑，彻底否决**；hitstop 用 `AnimatedTextureProvider.pause()/resume()` + 输入守卫（§4 决策 2）。**音频音高结构性不受 hitstop 影响，风险消除** |
| 8 | **AR 相机真机跟手性（SLAM）** | 真机转手机看 Boss 是否**实时滑入准星**；**PC 预览无 SLAM（约 4s 收敛）不作手感判据** | 决定命中手感；见 `README §八`、`submit-checklist` |
| 9 | **🔴 屏幕震动如何传导到 3D Boss（本项已升为阻断性前置）** | 对照 A/B 两案（见 §2 待收口注）：偏移 `ContentRoot`，观察 3D Boss 是否跟随 | **v2.2 起"Boss 抖动"整体押在这一项上**：删 V6 + 删 `shakeOffset` 通道后，Boss 会不会抖**完全**取决于它。文档证据**倾向"不跟随"**（① `DeviceTracker.trackingMode` = "**full 3D world**" → 世界位姿由追踪器驱动；② `ScreenTransform` 文档明写 `anchoredPosition` 是**父局部 2D 布局量**、"**绝不要把世界坐标与屏幕像素混在同一表达式**"）。判**不跟随** ⇒ **必须恢复路①**（复用同一 `ShakeAmp.ts` 值，成本低）；判**跟随** ⇒ 单点方案成立。**与开闸后 O-08 单帧体积读数同批执行** |
| 10 | **轨 B 摄像头取像的运行时行为（`tech-spec §9.4` a–e，共 5 点）** | 真机脚本：取 AR 相机 → `APJS.CaptureFrameHelper.captureCameraOutput(cam, new APJS.Rect(0.40,0.40,0.20,0.20), 1.0)` → 赋给 `Image.texture`，逐点对照记录 | **① a 是否含自身 Boss/HUD**（`Camera.renderTexture` 文档默认 = `Final Render Output`，**证据倾向"含"**；含则须改到 **Boss 出场前**取像，或试 `renderTexture` setter 换自定义目标）**② b 竖屏下方向/长宽比**（AR 输出可能是**横向传感器方向**，可能转 90°/拉伸）**③ c 调用时机**（`CLIENT_STATE_PREVIEW` / 真机 `capture` 下可否调用）**④ d 引用还是拷贝**（注释为 ***one-shot copy*** ⇒ **倾向"拷贝、定格成立"**；若为引用则须每帧重取）**⑤ e 首帧时序**（注释："schedules a copy after the next `AFTER_RENDER`, **returns immediately**" ⇒ **很可能拿到空/旧纹理，须至少延一帧**）。**任一点不利 ⇒ 轨 B 记为"已登记未落地"，由轨 A 预设头像兜底，不阻断提审**；与第 9 项、O-08 **同批上机** |

---

## 8. MCP 可自动化 vs 必须 GUI 人工

### 8.1 可 MCP 自动化

| 环节 | 工具 |
|---|---|
| 工程结构（建对象 / 父子 / render group） | `edit_by_dsl`（`add_builtin_object` / `move_scene_object` / `set_scene_object`） |
| 节点 / 组件创建与参数 | `edit_by_dsl` + `set_component` |
| 资源导入（贴图 / 音频 / 序列帧） | `edit_by_dsl.import_resource` |
| 资源属性（采样 / 尺寸 / 压缩） | `set_resource_properties`（§5 参数） |
| 脚本创建 / 编辑 | `edit_by_dsl(add_script / edit_script)` |
| 编译校验 | `run_otsc_check` |
| 运行日志 | `get_script_logs` |
| 预览截图 | `capture_preview` / `get_scene_view` |
| 交互模拟（触摸 / 拖拽 / 时序） | `interact_by_dsl`（`reset_preview` / `touch` / `drag` / `wait` / `screenshot` / `record_preview_video_mp4`） |
| 预览输入切换 | `set_preview_video` / `list_preview_videos`（tracking：body/environment/face/hand/pet/two_person） |
| AIGC 资产（作创意源） | `generate_assets_batch` / `generate_image` / `generate_audio` |
| 方案留痕 | `save_plan`（**确认后**才可 `confirmed`） |

### 8.2 必须 GUI 人工

| 环节 | 原因 |
|---|---|
| **正式预览（真机）** | 宪法平台边界：正式预览只能在像塑内做 |
| **编译打包 / 提审** | 宪法平台边界：编译与提审只能在像塑内做 |
| **轨 B 取像真机验证** | **必须真机人工**（API 存在性已核；**运行时行为未验**，且涉及"摄像头"类权限声明） |
| **素材版权 / 授权确认** | 合规红线，人工核对（`assets/SOURCES.md`） |

> **前置闸门**：像塑 MCP 有强制**用户确认闸门** —— 未获用户对方案的明确确认前，禁止调用会改工程/生成资产的工具。本结构方案在确认前只作准备包存在。

---

## 9. 关联与引用

- 状态/阈值来源：`game-design-doc.md` §阶段系统（66% / 33% / 约 15% / 0%）
- 节点绑定来源：`animation-spec.md` §8.1 层级、§4.1 状态列表、§5 程序接口
- 粒子/震动/hitstop 来源：`vfx-spec.md` §3.4、§6.1、§6.2
- 平台能力与预算：`tech-spec.md` §1 能力核实、§2 架构、§3 性能预算、§6 像素规范落地
- 素材规格：`art-spec.md`

—— tech-architect / 柯桥良
