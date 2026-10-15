# ar-boss-raid · 实现方案与资产整合（Phase 3）

> ⚠️ **2026-10-15 废除通告**：本文所有「出战牌 / 头像 / `avatar_*` / `HeadFrame` / 头像挂点」相关**任务项**（尤其 §2.1.6 出战牌、资产清单 I 项、结算卡合成中的"出战牌"）**已随好友头像功能整体废除**（作者决定）；现行实现无任何头像与社交元素，这些条目**不再执行**。相关章节仅作历史档案。

> 主笔：主程序 / 寇豆码
> 上游依据（逐条引用）：`game-design-doc.md`（游有方 v1.1/v1.2）、`tech-spec.md`（柯桥良）、`node-plan.md`（柯桥良）、`art-spec.md`（甄塑之）、`animation-spec.md`（关建帧 v1.2）、`vfx-spec.md`（霍炜然 v1.1）、`audio-spec.md`（雷鸣远）
> 出口：抖音特效开放平台（像塑 / Effect House 提审）——本文件是**制作与提审准备包**的工程实现定义。
> 宪法优先级：**合规 > 平台边界 > 像素规格 > 其他**
> 硬约束：图层 ≤6 / 粒子 ≤50 / 包体 ≤2MB / 单动作序列帧 ≤24 / DB16 16 色 / Nearest / 禁非整数缩放与非 90° 整数倍旋转 / 触发恰 2 种
> 我的职责边界：把上游设计翻译成**可运行工程**；不重设玩法/美术/音效；发现上游矛盾**如实列出并给建议**，数值改动一律回到对应总监。
>
> **★ 本次修订（v2 · AR 空间锚定）**：上游已把**瞄准/定位**从 v1「屏幕空间触控瞄准」切到 v2「**AR 空间锚定 + 屏幕正中固定准星 + 转手机瞄准**」。**本次改动只涉及「瞄准定位与命中判定」链路**（§1.2 / §2.0 / §2.1.1 / §3.2 场景结构等）；**伤害/护盾/阶段/音频/粒子等数值与机制不变**。命中判定统一口径见 `tech-spec §2.7`（本文件 §2.1.1 落实现）。

---

## 一、实现范围与依赖

### 1.1 实现范围（本文件覆盖的工程交付）

| 编号 | 交付物 | 对应上游需求 |
|---|---|---|
| A | 流程状态机（READY/FIGHTING/WIN/LOSE/RESET）+ 数据权威 | tech-spec §2.6、node-plan §3.1、game-design §8 |
| B | **AR 空间锚定命中判定**（`AR Camera` 解算 + `worldToViewportPoint` 视口容差 0.17）+ 按住开火 | game-design §3、§五、§十二需求 10 |
| B2 | Boss 世界锚定载体（3D `ImageEntity`）+ AR 追踪链（`ARTracking` 组 / `AR Camera` / `DeviceTracker`） | tech-spec §2.1/§2.7、node-plan §2 |
| C | 射击循环（射速/冷却/弹匣/换弹/过热） | game-design §五数值表 |
| D | Boss 阶段状态机（66%/33%/假死 15%/认输） | game-design §4.2、node-plan §3.2、animation-spec §4 |
| E | 命中反馈同帧触发链（闪白→星→数字→震屏→hitstop→音效） | vfx-spec §8、animation-spec §3.3 |
| F | 血条双层 + 假死"假空" | art-spec §3.4、animation-spec §7.1 |
| G | 粒子预算管理器 | vfx-spec §3.4、node-plan §4 决策 4 |
| H | 音频池轮转 + 并发衰减 + 优先级丢弃 | audio-spec §10.1（13 条） |
| I | 出战牌（**预设像素头像选择器 6 选 1** + 默认兜底不阻断） | game-design §6.2（**口径已改，见 §2.5**）、art-spec §3.2 |
| J | 结算卡生成 + 分享边界 | game-design §9、art-spec §3.6 |
| K | 资产整合与绑定（37 贴图 + 47/53 帧 + 粒子贴图 + 26 音频） | art-spec、animation-spec §11、vfx-spec、audio-spec |
| L | 构建步骤（MCP 操作序列，含用户确认闸门） | tech-spec §4、node-plan §8 |

### 1.2 依赖顺序（先建什么、后建什么）

```
0. 用户确认方案（闸门，硬前置）
0.5 **AR 追踪链（v2 新增·最先建）**：`AR Plane`（或手动）建 `ARTracking` 组 + `AR Camera` + `DeviceTracker`（`trackingMode=World`）→ 确认 `AR Camera` 可被脚本按名/按组件解析到（§2.1.1 前置）
1. 骨架上位：ContentRoot → L2~L6 六层 + L6 独立父对象（不依赖任何脚本）；**L2 Boss 挂到 3D 世界（经 AR Camera 渲染）**
2. Wait: 资源导入 + 粒子 hasFloatKey 实探（决定 G 的降级杠杆）+ **O-08 序列帧体积复测保险（§五步 2.5；单样本已判过，重开后顺手复测 1 张）**
3. A 流程总控 + 数据权威（被所有层依赖，最先写）
4. B/B2 输入与射击（含 AR 相机解算 + 视口容差命中，依赖 A；B2 的 AR 追踪链已在 0.5 建好）
5. E 同帧反馈链（依赖 B/C 与 A 的 applyHit 钩子）
6. D Boss 阶段机（依赖 A 的 HP 事件 + BossAnimPlayer）
7. BossAnimPlayer（动画接口，被 D/E 调用；实现 animation-spec §5）
8. F HUD / G 粒子 / H 音频 / CameraShake / DamageNumberPool（表现层，被 A/E/D 调用）
9. I AvatarPicker / J ResultCardBuilder（READY 与结算流程）
10. 编译校验 → 日志断言 → 关键链路预览（**PC 预览长按 ≥7s**）→ 真机（转手机验跟手）
```

> **关键路径**：`0.5 → A → B → E`（开火→命中→反馈）是"最小可跑闭环"，先打通它再用 `capture_preview` 验证（**PC 预览无 SLAM，须长按 ≥7s**）；其余（D/F/G/H）在此闭环上叠加。

### 1.3 引擎中立性声明

本文件所有实现描述用**通用工程语言 + 像塑已核实的接口名**（`AnimatedTextureProvider.pause()`、`VisualEffect.stop/setTexture/play`、`AudioComponent.play/stop/volume`、`ScreenTransform.anchoredPosition`、`APJS.EventType.Touch`、**`Transform.getWorldPosition()`、`Camera.worldToViewportPoint()`（v2 命中判定核心）** 等，均来自 `tech-spec.md` / `node-plan.md` / `audio-spec.md` 的源码核实）。脚本语言：**TypeScript（APJS 全局，无需 import）**；脚本只能经 `edit_by_dsl(add_script/edit_script)` 创建；编译走 `run_otsc_check`；日志走 `get_script_logs`。

---

## 二、系统实现方案

### 2.0 脚本架构总表

> 命名遵循 node-plan §6：脚本类名/变量走英文；场景对象 key 允许中文。

| 文件名 | 类名 | 职责 | 挂载对象 | 生命周期钩子 | 对外暴露接口 |
|---|---|---|---|---|---|
| `GameFlowController.ts` | `GameFlowController` | **流程总控 + 唯一数据权威**（GameState / HP / combo / ammo / 计时 / 统计）；状态迁移与 RESET | `ContentRoot` | onInit / onStart / onUpdate / onDestroy | `requestFire():FireCtx\|null`、`applyHit(dmg,isCrit):HitResult`、`onMiss()`、`enterHitstop(ms)`、`resetRun()`、`getState()`、`getHp()`、`getHpRatio()`、`getCombo()`、`getStats()` |
| `ShootHandler.ts` | `ShootHandler` | **AR 相机解算 + 按住开火 → AR 视口容差命中判定**（`worldToViewportPoint` + 容差 0.17 + 脱靶）；武器层表现（枪口闪光 / 准星命中态高亮 / 后坐力触发） | `ContentRoot`（订阅 Touch） | onInit / onUpdate / onDestroy | `handleTouch(t:TouchData)`（**仅判按下/抬起开火，不做瞄准**）、`tryResolveCamera()`、`isBossOnCrosshair():boolean`、`setCrosshairLock(on)` |
| `BossAnimPlayer.ts` | `BossAnimPlayer` | **动画播放 + 叠加反馈**（受击叠加、摆动 Tween、hitstop 冻结、对齐点表）；实现 animation-spec §5.1/§5.2 接口 | `BossBody` | onInit / onUpdate | `play(action,mode)`、`hitFeedback()`、`setBossAnimPause(on)`、`setSwaySpeed(rel)`、`setEnrageEyes(on)`、`currentState`（只读）、只读表 `alignTable`（对齐点时间偏移，见 §2.0.2）、事件 `onActionEnd(action)`（**注意：无 `onAlignPoint` 事件**） |
| `BossStateMachine.ts` | `BossStateMachine` | **Boss 阶段状态机**（SPAWN/IDLE/ENRAGE/SHIELD/FEIGN_DEATH/DEFEATED/TAUNT）；阈值判定、假死计时、护盾核心点调度 | `BossRoot` | onInit / onUpdate | `onHpChanged(hp)`、`notifyCoreHit()`、`notifyFeignTimeout()`、`getBossState()` |
| `HudController.ts` | `HudController` | 血条（主+延迟+护盾条）、阶段刻度、连击、阶段提示、假死"假空" | `HudRoot` | onInit / onUpdate | `applyDamage(hp)`、`setShieldProgress(p)`、`setFakeEmpty(on)`、`showPhaseHint(text)`、`setCombo(n)` |
| `VfxBudgetGuard.ts` | `VfxBudgetGuard` | **粒子预算管理器**：阈值降级 + 发射封装（E2/E2′/E3/E4/E5/E6） | `FxRoot` | onInit / onUpdate | `emitHit(isCrit)`、`emitShieldShard()`、`emitEnragePulse()`、`emitVictory()`、`getAlive()` |
| `DamageNumberPool.ts` | `DamageNumberPool` | 伤害数字对象池（3 个）+ 合并计时器叠字策略 | `DamageTextPool` | onInit / onUpdate | `spawn(dmg,isCrit)` |
| `AudioDirector.ts` | `AudioDirector` | **音频池轮转**、连击叠音、并发衰减、优先级丢弃、预热、BGM 分帧切换/闪避、RESET | `AudioRoot` | onInit / onStart / onUpdate | `playShoot()`、`playHit(combo)`、`playShieldBreak()`、`playBoss(event)`、`playWin()`、`playLose()`、`switchBgmToEnrage()`、`duckBgm(ms)`、`resetAll()` |
| `AvatarPicker.ts` | `AvatarPicker` | **预设像素头像选择器（6 选 1）**：选择页显隐/交互、选中贴到 Boss 头顶、**默认兜底不阻断**；L6 屏幕口径 2D 点选（详见 §2.5） | `Page_PickAvatar`（L6 选择页根） | onInit / onUpdate | `showPicker()`、`select(i)`、`confirmStart()`、`getSelectedTex()`、`useDefault()`、`hide()`、`reset()`（预留 `onPickResult(tex)`） |
| `ResultCardBuilder.ts` | `ResultCardBuilder` | 结算卡运行时合成（耗时/命中率/最高连击/评级 S-A-B-C）+ 文案 | `Page_Win` / `Page_Lose` | onInit | `build(win,stats)` |
| `CameraShake.ts` | `CameraShake` | **屏幕震动（单点：作用 `ContentRoot.ScreenTransform.anchoredPosition`，禁动 `AR Camera`）** + 后坐力；幅度按 **Boss 世界高比例 k 表**。**条件性**（依赖 2D→3D 父子传导，未实测）。详见 §2.4 | `ContentRoot` | onInit / onUpdate | `addHit(isCrit)`、`addPhase()`、`addShieldBreak()`、`addFinish()`、`addLose()`、`addRecoil()`、`reset()` |

**共 11 个脚本。** 其中 `WeaponView` 的职责（枪口闪光/准星命中态/枪贴图）**合并进 `ShootHandler`**（三者都与「屏幕正中准星」同锚点/同触发，node-plan §1.1「必须合层 ②」；一人开发不拆碎）。**v2 变化**：`ShootHandler` 不再持有「手指坐标/准星坐标」——准星固定在屏幕正中；它新增两个内部方法 `tryResolveCamera()`（解析 AR 相机，见 §2.1.1）与 `isBossOnCrosshair()`（视口容差判定）。

### 2.0.1 调用方向与事件流（禁止双向乱调）

**单向数据流铁律**：`输入/判定层 → 数据权威层(GameFlowController) → 表现层`。表现层**只被调用、不主动回调逻辑层**；唯一反向通道是 `BossAnimPlayer` 的两个事件，且**订阅者仅限 `GameFlowController` 与 `BossStateMachine`**。

```
[APJS.EventType.Touch]
        │ 订阅
        ▼
  ShootHandler
        │ requestFire()
        ▼
  GameFlowController  ──(返回 FireCtx / null；内部闸门：状态=FIGHTING & 冷却 & 弹药 & 非换弹 & 非过热 & 非 hitstop)
        │  可开火 ⇒ ShootHandler 触发武器表现(AudioDirector.playShoot / CameraShake.addRecoil / 枪口闪光)
        │  AR 视口命中判定 isBossOnCrosshair()
        ├── 命中 ⇒ GameFlowController.applyHit(dmg,isCrit)
        │             ├─▶ HudController.applyDamage(hp)
        │             ├─▶ BossStateMachine.onHpChanged(hp)
        │             └─ 返回 HitResult{newHp, phaseChanged, feign, defeated}
        │          随后【同一调用栈内】onHit 同帧链（顺序固定，见 §2.3）：
        │             ① BossAnimPlayer.hitFeedback()
        │             ② VfxBudgetGuard.emitHit(isCrit)
        │             ③ DamageNumberPool.spawn(dmg,isCrit)
        │             ④ CameraShake.addHit(isCrit)
        │             ⑤ GameFlowController.enterHitstop(ms)
        │             ⑥ AudioDirector.playHit(combo)
        └── 脱靶 ⇒ GameFlowController.onMiss()（combo 归零；不出 hitmarker/不震/不出字）

  GameFlowController（状态迁移）
        ▼
  BossStateMachine  ──play()/setSwaySpeed()──▶ BossAnimPlayer
                    ──switchBgmToEnrage()───▶ AudioDirector
                    ──addPhase()────────────▶ CameraShake
                    ──showPhaseHint()───────▶ HudController

  BossAnimPlayer ──onActionEnd(action)──▶ 订阅方(GameFlowController / BossStateMachine)   [仅状态衔接，≤2 帧漂移]
  对齐点：BossAnimPlayer.alignTable 为【只读数据】；由 BossAnimPlayer 内部按【播放时钟】在 onUpdate 里派发（订阅方不持定时器，见 §2.0.2）
```

**红线**：
1. 表现层（Hud / Vfx / Damage / Audio / CameraShake / AnimPlayer）**不得**调用 `GameFlowController.applyHit/onMiss`（只有 `ShootHandler` 可）；不得互相调用（Hud 不调 Vfx，Vfx 不调 Audio）。
2. `BossAnimPlayer` 的命中路径**绝对禁止**调 `reset()/play()`、禁止换 `Image.texture`、禁止进入 `HURT` 状态（animation-spec §5.4 硬要求 + node-plan §3.3 评审红线）。
3. `enterHitstop` 只冻结 Boss 动画（`setBossAnimPause(true)`）+ 屏蔽输入；**L4 特效层照常跑**（node-plan §4 决策 2）。对齐点**不得**用 AnimationEvent 派发（会晚 1–2 帧），必须走 §2.0.2 的**播放时钟**派发（**禁止墙钟 `setTimeout`**——hitstop 冻结期墙钟照走会提前错帧）。
4. **写入者唯一（★ 通用纪律，不止震屏）**：**一个 Transform 只能有一个脚本写入者**（`tech-spec §2.8 ⑥`「单一写入者原则（写入者归属）」）。其它模块若要对它有贡献，**只能通过"偏移通道（offset channel）"投稿**，由 owner 在合成时统一取用，**不得直接写**。本项目已明确的归属：`BossRoot`（owner=`BossAnimPlayer`，含基础+摆动+击退+掉落）/`ContentRoot`（owner=`CameraShake`，屏幕震动）/血条填充（owner=`HudController`）等——**此条一定会复发，务必守住**。**共享数值**（如震动幅度 k 表）走**纯常量模块**（`constants/*.ts`，无逻辑无副作用），**不靠"跨脚本接口"** 传递。

### 2.0.2 对齐点表（播放时钟口径，取代 `onAlignPoint` 事件）

> **背景**：AnimationEvent 派发对齐点会**晚判定帧 1–2 帧（33–66ms）**，音效/特效"发飘"；而**墙钟 `setTimeout`** 又会在 **hitstop 冻结期提前触发**（冻结 Boss 动画时墙钟照走 → 对齐点比视觉帧早一个冻结窗，破盾场景正好撞：`shield_gone` 83ms 偏移 + 破盾 hitstop 83ms = 早整整 83ms）。故 **`onAlignPoint(name)` 事件作废**，改为**静态对齐点表 + 由 `BossAnimPlayer` 自己的【播放时钟】驱动**：动画只提供「动作起播后多少 ms」，`BossAnimPlayer` 在 `onUpdate` 里按累加的动作播放时间到点派发。时间偏移公式 `offsetMs = (N-1)/fps`（N=帧号）。权威值以 animation-spec §5.2/§5.5 为准。

**数据结构（`BossAnimPlayer.alignTable`，只读；onInit 一次性构建，无逐帧 new）**：
```
alignTable: { [action:string]: { name:string, offsetMs:number }[] } = {
  "SPAWN_JUMP_IN":     [ {name:"spawn_land",    offsetMs:333} ],
  "ENRAGE_INTRO":      [ {name:"enrage_burst",  offsetMs:250} ],
  "SHIELD_UP":         [ {name:"shield_set",    offsetMs:100} ],
  "SHIELD_BREAK":      [ {name:"shield_gone",   offsetMs:83 } ],
  "FEIGN_COLLAPSE":    [ {name:"feign_start",   offsetMs:267} ],
  "FEIGN_REVEAL":      [ {name:"feign_counter", offsetMs:83 } ],
  "DEFEAT_SURRENDER":  [ {name:"flag_drop",     offsetMs:600}, {name:"flag_land", offsetMs:950}, {name:"win_card", offsetMs:1100} ],
  "TAUNT_ESCAPE":      [ {name:"lose_card",     offsetMs:400} ],
}
```
> **本表为 `animation-spec §5.2` 的镜像，权威值以该表为准；改动动画侧时须同步本表**（`flag_land`≈950 / `win_card`≈1100 已按 §5.2 修正，避免"WIN 页先于落地高潮"倒序）。

**派发方式（`BossAnimPlayer` 内部职责；订阅方不持定时器、不 `setTimeout`、不 `scheduleOnce`）**：
```
// BossAnimPlayer 内部状态（每 action 一份，play() 时重置）
actionElapsedMs = 0;
fired: Set<string> = {};

onUpdate(dtMs):
  if (!paused) actionElapsedMs += dtMs            // ★ 冻结期不累加 ⇒ 对齐时钟随动画同步冻结
  for (p of alignTable[currentAction] ?? [])      // 通常 1 个，最多 3 个（DEFEAT_SURRENDER）
     if (!fired.has(p.name) && actionElapsedMs >= p.offsetMs) {
         fired.add(p.name);
         dispatchAlign(p.name);                   // 派发给已订阅的订阅方（音效/特效/HUD）
     }

play(action):                                       // 起播新动作
  actionElapsedMs = 0; fired.clear();               // 时钟归零 + 清 fired（RESET 同此处理）
```
- **`enterHitstop` 只是 `setBossAnimPause(true)`**：冻结期 `actionElapsedMs` **不涨** ⇒ 对齐时钟同步冻结 ⇒ **视觉 / 音效 / 特效永远同帧**，**无需任何人手动加偏移**。
- **订阅方只订阅回调**：`animPlayer.onAlign((name)=>{…})`（音效侧 `shield_gone`→破盾音、特效侧 `flag_drop`→彩带…），**不再持有/取消任何定时器**。
- **RESET**：只需 `actionElapsedMs = 0` + `fired.clear()`（**不再需要"取消定时器"**）。
- **权威偏移值（`animation-spec §5.2`）**：`spawn_land` 333 / `enrage_burst` 250 / `shield_set` 100 / `shield_gone` 83 / `feign_start` 267 / `feign_counter` 83 / `flag_drop` 600 / **`flag_land` 950** / **`win_card` 1100** / `lose_card` 400（ms）。**本行为 `animation-spec §5.2` 的镜像，权威值以该表为准；改动动画侧时须同步本行。**
- `flag_drop` 与 `flag_land` 是**两个独立对齐点**（`flag_drop`@600ms = 牌脱手/下落起点；`flag_land` = `flag_drop` + ≈350ms 下落 ≈950ms = 落地），均由播放时钟在 `DEFEAT_SURRENDER` 内到点派发。
- **`onActionEnd(action)` 保留**：仅用于状态衔接（如 `SPAWN_JUMP_IN` 播完切 `IDLE`），允许 ≤2 帧漂移；**不得**用它承载音效/特效对齐点。
- **hitstop 交互**：hitstop 期间 `paused=true` → `actionElapsedMs` **不涨**，对齐点**推迟到解冻后补触发**（不丢失、不错帧）；即"冻结多久、对齐点就顺延多久"，视觉帧到哪音效/特效到哪。**注意**：L4 特效层在 hitstop 期**照常跑**（node-plan §4 决策 2），但**对齐点本身**是 `BossAnimPlayer` 的播放时钟（与 Boss 动画同冻结），二者不冲突——被冻结的只是"齐发时刻"，已触发的 L4 粒子继续飞。

---

### 2.1 玩法系统实现方案

#### 2.1.1 AR 空间锚定瞄准 + 视口容差命中判定（含相机解算与脱靶）

> **v2 核心变化**：准星**固定在屏幕正中、不可拖拽**；玩家**转动手机**改变 AR 相机朝向 → 世界锚定的 Boss 在屏幕上滑动 → 是否落在准星窗口 = 命中。命中判定**唯一公式**（与 `tech-spec §2.7` 同源，此为本文件的落实现）。

**坐标基线**：设计空间 720×1280，安全区 X[-340,+260]、Y[-400,+500]（game-design §3.3）。**准星屏幕坐标固定 = 屏幕正中 `(0,0)`（`ScreenTransform` 居中）**；Boss 为 **3D `ImageEntity` 世界锚定**，其屏幕位置由 AR 相机朝向决定（非固定）。

**脚本调用结构（`ShootHandler`，反映真实实现 · 懒初始化）**：
```
onInit(): 仅缓存引用，不做重活（相机可能尚未就绪）
onUpdate(dt):
  tryInit()            // ★ 懒初始化：第一帧起尝试解析 AR 相机与 Boss transform（就绪前每帧重试，命中判定暂返回 false）
  if (!ready) return
  handleFireTick(dt)   // 按输入态开火（见下）
  updateCrosshairLock()// 命中态 → 准星切高亮贴图

tryInit():
  tryResolveCamera()                       // 解析 AR 相机（失败则下次 onUpdate 再试）
  bossTransform = scene.findSceneObject('BossRoot').getTransform()   // 世界锚定 Boss 的 Transform
  ready = (arCamera != null && bossTransform != null)

tryResolveCamera():
  1) cam = scene.findSceneObject('AR摄像机')?.getComponent(Camera)   // 先按名找（AR Plane 默认命名）
  2) if (!cam): 递归扫描场景对象，取第一个挂有 DeviceTracker 组件的对象上的 Camera  // 兜底：按组件找
  arCamera = cam（缓存，不逐帧 find）
```

**命中判定（`isBossOnCrosshair()`，每发调用一次，O(1)）**：
```
worldPos = bossTransform.getWorldPosition()          // Boss 3D 世界坐标
vp       = arCamera.worldToViewportPoint(worldPos)   // 归一化视口坐标，原点左下角，z = 到相机距离
if (vp.z <= 0) return false                          // Boss 在相机身后 → 不命中
dx = abs(vp.x - 0.5) ; dy = abs(vp.y - 0.5)          // 屏幕正中 = (0.5, 0.5)
return dx <= 0.17 && dy <= 0.17                      // 准星容差 0.17（x/y 同值）
```
- **`worldToViewportPoint` 返回归一化视口坐标**（非像素）：原点**左下角** `(0,0)`、右上角 `(1,1)`、正中 `(0.5,0.5)`；`z>0` 表示在相机前方。**实测**：`worldPos=(-81.865, 0, -197.076)` → `vp=(x, 0.522, ~122)`（`vp.y≈0.522` 证实归一化；`vp.z≈122>0` 证实在前方）。
- **必须判 `vp.z>0`**：玩家把手机转过去（Boss 转到身后）时 `vp.z` 会 ≤0；漏判会得到镜像的错误命中。
- **容差 0.17 的权威定义在 `game-design-doc §五`**，本文件只引用不重定义；`vfx-spec §6.5` 的命中高亮复用同值。

**开火时序（v2 确认·按输入态）**：
```
handleTouch(t):
  if (t.phase === TouchPhase.Began)  firing = true      // 按下 → 开始连射
  if (t.phase === TouchPhase.Moved)  /* 忽略：v2 移动手指不改变瞄准 */ 
  if (t.phase === TouchPhase.Ended || t.phase === TouchPhase.Canceled) firing = false   // 抬起 → 停火
  // ★ TouchData.position 仍存在，但 v2 只用于「按下/抬起」判定，不再用于瞄准定位

handleFireTick(dt):                                     // onUpdate 内，firing==true 时按闸门连射
  if (!firing) return
  if (now - fire.lastMs < FIRE_INTERVAL_MS) return      // 250ms 闸门（见 §2.1.2）
  fireOneShot()
```
> **v2 触发器口径**：`TouchData.position` 语义已收窄——**仅用于按下/抬起开火**，不再驱动准星/瞄准；AR 相机朝向（转手机）属**操控输入、不占触发额度**。

**命中/脱靶/核心点判定**：
1. **命中**：`isBossOnCrosshair()==true` → `GameFlowController.applyHit(dmg,isCrit)`，并把 `Crosshair` 贴图切 `crosshair_lock`（命中态高亮，art-spec §3.3）。
2. **锁定音去抖**：命中态由 false→true 的**上升沿**触发 `sfx_ui_lock`（0.4s 去抖，audio-spec §3.2 机制 3）；持续为 true 不再触发。
3. **脱靶**：`isBossOnCrosshair()==false` → `GameFlowController.onMiss()`（combo 归零、命中率分母 +1）；**不出 hitmarker、不震屏、不出伤害数字**——只保留枪口闪光 + 后坐力，让玩家能区分"打中/打空"（vfx-spec §6.5 可读性红线）。
4. **核心点优先判定**（护盾期 `core.visible==true` 时）：核心点 `CorePoint` 是 boss 3D 载体的子节点，**用同一 `worldToViewportPoint` 公式**对 `coreTransform.getWorldPosition()` 算 `dx/dy`，容差 = `core.half` 对应的视口半径；命中核心点 → `isCrit=true`（`dmg=120`，扣盾量 −34%）；否则落 Boss 视口窗 → 命中身体（护盾期 **HP 冻结**，扣盾量 −6%）。
5. **每发独立解算**：`bossTransform.getWorldPosition()` 取的是**当帧世界位置**（含 Boss 载体的 Tween 微动），故"跟着世界里的 Boss"判中。

> **判据**：`ShootHandler.isBossOnCrosshair()` 只做**数学**（视口坐标比较），**不是贴图缩放、不是屏幕像素**；判定用 0.17 视口容差是**逻辑**，与 Boss 视觉尺寸解耦（Boss 屏幕投影随距离变化，判定窗按视口比例恒定）。
>
> **⛔ 禁止引入任何基于 FOV 的像素/世界换算**（tech-spec §2.8）：AR 相机（`TargetTrackingCameraJS`）`properties` 为空、**FOV 不可设不可读、随机型变化**；普通 `Camera` 的 `fov=60°` 与之无关。故命中判定**必须**继续走 `worldToViewportPoint` + 归一化容差 `0.17`，**不得**改走 FOV/像素换算。（`§2.4` 的震动幅度也因此改用"世界高比例"口径。）
> **⚠️ PC 预览 vs 真机（决定怎么测命中）**：**真机有 SLAM**，转手机 → Boss 实时滑入准星；**PC 预览无 SLAM**，AR 相机约 **4 秒**缓慢收敛，Boss 才滑向准星。**故 PC 预览测命中必须长按开火 ≥7 秒**；**2 秒内的开火必然全 miss，是无 SLAM 的预期行为、非缺陷**（详见 `README.md §八`、`submit-checklist.md`）。

#### 2.1.2 射速 / 冷却 / 弹匣 / 换弹 / 过热（读 game-design §五数值表）

**数值订阅（严禁自行改动，全部来自 game-design §五）**：
```
MAX_HP            = 2400
DMG_NORMAL        = 80       // 普通命中
DMG_CRIT          = 120      // 核心点/暴击
SHIELD_CORE_DMG   = 0.34     // 护盾期·命中核心点 → 盾量 −34%/发（30%–40% 可调）
SHIELD_BODY_DMG   = 0.06     // 护盾期·命中身体   → 盾量 −6%/发（5%–8% 可调，可硬磨但慢）
MAX_SHIELD_ROUNDS = 2        // 破盾/回盾轮次上限（第 2 轮窗口后盾永久消失）
FULL_DMG_WINDOW_MS= 2000     // 破盾后全额伤害窗口 2s
FEIGN_HP_RATIO    = 0.15     // 假死触发阈值 = HP 15%（≈360 血）
FIRE_INTERVAL_MS  = 250      // 射速闸门 = 严格 4 发/秒（区间 240–280）★不再用 220ms
MAG_SIZE          = 12       // 弹匣容量
RELOAD_MS         = 1000     // 换弹 1.0s
OVERHEAT_SHOTS    = 24       // 连射过热门槛（可砍项）
OVERHEAT_MS       = 1500     // 过热强制冷却
RUN_LIMIT_MS      = 40000    // 单局时限
```
> **✅ 已裁定（team-lead）：单发伤害权威值 = `DMG_NORMAL=80`**（单一来源 `game-design-doc.md:136`）。**原型占位值 `DAMAGE_PER_HIT=24` 已废弃**（那是原型里的**测试便利值**——当时尚未做弹匣/换弹、时限一度 60→90s，随手拉长测试窗口用的，**不具备设计权威性**），**实现侧按 80 回填**。依据：HP 2400 ÷ 80 = 30 发；闸门 250ms=4 发/s、弹匣 12、换弹 1.0s → 打空 30 发需 2 次换弹（+2s）→ **100% 命中 TTK ≈ 9.5s**，与设计案「熟练 10–20s 可通关」自洽（若按 24：100 发 → 纯射 25s+，落到该区间之外）；且 40s 时限只需 ≈19% 命中率即可通关（PC 预览实测 34%、真机更高，有安全边际）。
> **✅ 已定稿（game-design-director v1.3 拍板，原文见其回信）**：
> - **射速闸门 = 250ms**（严格 4 发/秒）；**不再用 220ms**。伤害节奏锚点：30 发 × 80 = 2400 血，纯射 ~7.5s。
> - **护盾期 HP 语义 = 冻结**（采纳美术方案，作废原"20% 伤害"）：护盾期 **HP 不下降**；护盾是**独立盾量层**（蓝盾条）；命中核心点 −34% 盾量 / 命中身体 −6% 盾量；**普通命中不重置进度**；破盾后进入 2s 窗口，**此时才回到红条下降**。
> - **破盾/回盾上限 2 轮**（`MAX_SHIELD_ROUNDS=2`）：第 2 轮窗口结束后**盾永久消失**，余血走假死机制。据数值（阶段 3 起始 792 血、单窗口 ≈640 血），实际多为"1 轮破盾 → 假死 → 收尾"，2 轮仅防拖延。
> - **假死阈值 = HP 15%（≈360 血）**，装死 0.8s。

**数据结构**：
```
fire = { lastMs:number, ammo:number, reloading:boolean, reloadEndMs:number,
         heat:number, overheatEndMs:number, lastShotMs:number }
```

**"怎么算"（`requestFire()` 闸门，全部在 GameFlowController 内）**：
1. `if (state !== FIGHTING) return null;`
2. `if (now < hitstopEndMs) return null;`（hitstop 守卫，node-plan §4 决策 2）
3. `if (reloading) return null;`
4. `if (now < overheatEndMs) return null;`
5. `if (now - fire.lastMs < FIRE_INTERVAL_MS) return null;`（射速闸门 250ms = 严格 4 发/秒）
6. `if (fire.ammo <= 0) { AudioDirector.playGunEmpty(); /* 0.25s 去抖 */ return null; }`
7. 通过：`fire.ammo -= 1; fire.lastMs = now; fire.heat += 1;`
   - 过热：`if (hot && fire.heat >= OVERHEAT_SHOTS) { fire.overheatEndMs = now + OVERHEAT_MS; fire.heat = 0; }`（`hot` = 过热开关，默认 true；**可砍项**，砍则整体旁路）
   - 空仓：`if (fire.ammo === 0)` 后续开火（**按住期间由闸门节流**）走第 6 步。
8. 返回 `FireCtx{ aim:copyOf(aim), isCrit:false }`。

**自动换弹 / 手动换弹**：
- `startReload()`：`reloading=true; reloadEndMs=now+RELOAD_MS;` `combo` 归零（audio-spec §3.2.1 归零条件含"换弹开始"）；换弹条读秒由 `HudController` 显示；结束 `reloading=false; ammo=MAG_SIZE;`
- **弹匣打空自动触发一次 `startReload()`**；玩家也可点"换弹"按钮主动触发（换弹按钮落安全区右下 X[+160,+250]、Y[-350,-250]，game-design §3.3）。
- 换弹期间的枪动画（沉下→升上）由 `ShootHandler` 用 Tween 位移表现（animation-spec §6.4；**只用位移不用旋转**）。

#### 2.1.3 命中反馈「同帧触发链」（严格按 vfx-spec §8 时序）

命中判定成立的那一帧 `f0`，以下②~⑦**在同一个 `onHit()` 调用栈内同步顺序执行，不排帧、不 setTimeout**：

```
f0（0ms）：
  ② Boss 闪白：BossAnimPlayer.hitFeedback() → WhiteFlashMask.enabled = true（1 帧普通 / 2 帧暴击，随后自动关）
  ③ 像素星：VfxBudgetGuard.emitHit(isCrit) → emit() burst 3（普通）/ 5（暴击）
  ④ 伤害数字：DamageNumberPool.spawn(dmg,isCrit)
  ⑤ 震屏：CameraShake.addHit(isCrit) → `ContentRoot.ScreenTransform.anchoredPosition` **单点屏幕偏移**（v2.2 已删 Boss 抖动路①）；幅度按**世界高比例 k 表**（普通 0.4% / 暴击 1.2%，单帧 ≤3% Boss 世界高，见 §2.4）
  ⑥ hitstop：GameFlowController.enterHitstop(ms) → BossAnimPlayer.setBossAnimPause(true) —— 普通 50 / 暴击 67 / 破盾 83 / 击杀 0
  ⑦ 音效：AudioDirector.playHit(combo) —— 与 ③ 同帧同一函数内调用
```
- **顺序固定**：闪白→星→数字→震屏→hitstop→音效（vfx-spec §8 表格顺序）。**开火音若与命中同帧**：先调 `playShoot()` 再调 `playHit()`（audio-spec §7.2，保证包络先后正确）。
- **hitstop 与特效解耦**：`enterHitstop` 只做 `BossAnimPlayer.setBossAnimPause(true)` + 置 `hitstopEndMs`；**L4 的 `VfxBudgetGuard.onUpdate` 与 `DamageNumberPool.onUpdate` 照常跑**（未动任何全局时间，node-plan §4 决策 2 / vfx-spec §6.1）。时长：普通 50 / 暴击 67 / 破盾 83 / 击杀 0（=3/4/5/0 帧 @60fps；animation-spec §3.3/§5.2 口径，vfx-spec §6.1 的 40/60/70 已作废）。连击节流：**每发独立、3 发内不叠加**。
- **动画不被打断**：`hitFeedback()` 只改两处外部量（白闪遮罩 / 全局冻结），**播放头不动**（animation-spec §4.3）；**震动通道已删**（v2.2，Boss 抖动作废，见 §2.4）。

#### 2.1.4 血条双层 + 假死"假空"（art-spec §3.4 / animation-spec §7.1）

**结构**：`HpBar_Frame`（底框，含 66/33 刻度）→ `HpBar_Fill`（主条）→ `HpBar_Lag`（红色延迟余量条，复用 `hp_fill` 染 `#d04648`）；护盾期上方叠 `HpBar_Shield`（`hp_shield_fill`）。

**"怎么算"（像素对齐 + 手感双满足）**：
1. **主条即时步进**：命中帧立刻更新。槽宽 = **60 逻辑 px**（art-spec §3.4）。
   `fillWidth = round(60 × hp/MAX_HP)`（**改 `width`（整数逻辑 px），不是 `scaleX`**——animation-spec §7.1，防非整数拉伸糊边）。
2. **延迟条滞后 0.25s**：`lagWidth` 每帧向 `fillWidth` 靠拢，速度 = 常数（如 60px / 0.25s），到达后停；`lagWidth` 同样取整。
3. **假死"假空"**：`FEIGN_COLLAPSE` 末帧触发 `HudController.setFakeEmpty(true)` → 主条**瞬降 0**、延迟条置 0、露 `#4e4a4e` 空槽；底框闪 `#d04648` 2 帧 + 弹 `?` + 文案「它装的！」。**内部 `trueHp` 保持不变**；识破（`FEIGN_REVEAL`）后 `setFakeEmpty(false)` 回填真实值；若停火分支回血 +5% → 回填 +5% 后的值。
4. **低血 <15%**：填充 `#d04648` ↔ `#deeed6` 快速闪烁，HP 数值转 `#dad45e`（art-spec §3.4）。
5. **护盾条（独立盾量层，v1.3 定稿）**：护盾期 **HP 主条/延迟条冻结不动**；护盾是**独立盾量层**，`setShieldProgress(p)` 改 `HpBar_Shield` 宽度（整数 px）即"破盾进度"。命中核心点 `p -= 0.34`、命中身体 `p -= 0.06`；`p ≤ 0` 破盾 → 蓝盾条清空、进入 2s 全额窗口（此时红条才下降）。
6. **三重编码**：颜色 + 66%/33% 刻度 + HP 数字（art-spec §1.2 色觉兜底）。

#### 2.1.5 阶段状态机（66% / 33% / 假死 ≈15% / 认输 0%）

**阈值以 game-design §4.2 为准**（node-plan §3.3 修正 ②：技术草案的 50% 作废）。

```
BossState: SPAWN / IDLE / ENRAGE / SHIELD / FEIGN_DEATH / DEFEATED / TAUNT
判定顺序（onHpChanged(hpRatio) 内，从高到低串行）：
  if (hp ≤ 0)                       → DEFEATED
  else if (!feignDone && hpRatio ≤ FEIGN_HP_RATIO /*0.15 ≈360血*/ && feignArmed) → FEIGN_DEATH
  else if (!shieldDone && hpRatio ≤ 0.33) → SHIELD
  else if (!enrageDone && hpRatio ≤ 0.66) → ENRAGE
  else 保持当前战斗态
```

**各态"怎么算"**：
| 态 | 进入动作 | 机制数值 | 转出 |
|---|---|---|---|
| `SPAWN` | `BossAnimPlayer.play("SPAWN_JUMP_IN",Once)`；`IDLE_SWAY` 起步（速度 0.5）；**对齐点 `spawn_land`@333ms** → 落地"咚"+轻震+尘土+血条滑入 | — | `onActionEnd` → IDLE |
| `IDLE` | `play("IDLE",Loop)` + `setSwaySpeed(0.5)` | — | HP≤66% 首次 → ENRAGE |
| `ENRAGE` | `play("ENRAGE_INTRO",Once)`；**对齐点 `enrage_burst`@250ms** → 震屏 + 「暴怒!」字 + `switchBgmToEnrage()` + 红眼 | 摆动 `setSwaySpeed(1.0)`；眼睛 `setEnrageEyes(true)`；弹幕间隔 3.0s（`V12` Sprite 池） | HP≤33% → SHIELD |
| `SHIELD` | `play("SHIELD_UP",Once→Clamp)`；**对齐点 `shield_set`@100ms** → 启动核心点闪 + 「当」音 | `setSwaySpeed(1.8)`；核心点每 **1.2s** 随机位置闪（`CorePoint.visible` 切换，亮 0.25s）；**护盾期 HP 冻结**、独立盾量层：核心点 −34% 盾量 / 身体 −6% 盾量；`MAX_SHIELD_ROUNDS=2` | 盾量 ≤0 → SHIELD_BREAK → 2s 全额窗（HP 恢复下降） |
| `FEIGN_DEATH` | `play("FEIGN_COLLAPSE",Once→Clamp)`；`HudController.setFakeEmpty(true)`；启动 0.8s 计时（`FEIGN_REVEAL` 起播后 **对齐点 `feign_counter`@83ms** → 反打） | 假死窗 0.8s；停火(≥0.3s 未命中)→回血 +5%；持续受击→识破 | `play("FEIGN_REVEAL",Once)` → `BossAnimPlayer` 播放时钟派发 `feign_counter` → 反打 |
| `DEFEATED` | `play("DEFEAT_SURRENDER",Once→Clamp)`；**对齐点 `flag_drop`@600ms** → 牌脱手、开始下落（**不放彩带**）；**`flag_land`@950ms** → 牌"啪"落地 + 彩带/星爆 + "叮铃" + 轻震 + 准星命中态高亮；`win_card`@1100ms → 弹 WIN 结算卡 | hitstop=0（不顿帧，vfx-spec §6.1） | `onActionEnd` → WIN 页（`win_card`@1100ms 派发弹结算卡） |
| `TAUNT` | `play("TAUNT_ESCAPE",Once)`（40s 超时） | — | 出画 → LOSE 页 |

**护盾子逻辑（`SHIELD` 内）**：
```
shieldAmount ∈ [0,1]（= 蓝盾条进度；进入护盾期初始 1.0）
命中核心点：shieldAmount -= SHIELD_CORE_DMG   // 0.34
命中身体  ：shieldAmount -= SHIELD_BODY_DMG   // 0.06
护盾期 HP 主条冻结（不扣血）；普通命中【不重置】进度（避免挫败）
shieldAmount ≤ 0 → 破盾：play("SHIELD_BREAK",Once) → **对齐点 `shield_gone`@83ms**
   → 盾碎片 VFX + 开启 2s 全额伤害窗口(fullDmgWindowEndMs)，此窗口内 HP 恢复下降
2s 窗口结束：
   if (shieldRounds < MAX_SHIELD_ROUNDS /*=2*/) → 回盾 play("SHIELD_UP",Once→Clamp)（shieldAmount 重置 1.0；rounds+=1）
   else → 盾【永久消失】，余血交给假死机制（HP ≤ FEIGN_HP_RATIO 触发 FEIGN_DEATH）
```
> ✅ **已定稿（game-design-director v1.3 拍板，原"待确认项 2/3"关闭）**：原 `SHIELD_CORE_HITS_REQUIRED=3` 的语义已改为**盾量百分比**实现（核心点 −34%/发、身体 −6%/发，均可调 30%–40% / 5%–8%）；**回盾上限 2 轮**（`MAX_SHIELD_ROUNDS=2`，第 2 轮窗口后盾永久消失）；**假死阈值 = HP 15%（≈360 血）**，装死 0.8s。据数值（阶段 3 起始 792 血、单窗口 ≈640 血），实际多为"1 轮破盾 → 假死 → 收尾"。

**护盾期「核心点判定框 ↔ 血条读数」契约（与 game-design-director 锁定）**：
- **判定框**：`CorePoint` 显示 32×32，判定 `core.half=16`，中心随身体刚性跟随；命中核心点 → `isCrit`，扣盾量 **−0.34**；未命中核心点但落 BossHitRect → 扣盾量 **−0.06**（HP 冻结）。
- **判定窗 = 视觉窗同源**：核心点仅在 `CorePoint.visible==true` 的闪帧参与判定；隐藏帧命中落到身体分支（−0.06），**不另开判定计时器**（亮 0.25s / 周期 1.2s 与视觉一致）。
- **唯一权威变量 = `shieldAmount`**：蓝盾条宽度 = `round(60 × (1 − shieldAmount))` 整数逻辑 px（即"蓝条清空 = 破盾"）；破盾判定与蓝条宽度都从它派生。
- **红条只反映 `hp`**：护盾期红条（`HpBar_Fill`/`HpBar_Lag`）**冻结不动、不抖动/不闪烁**；低血闪动仅在 `HP<15%` 且**非护盾期**生效。破盾进入 2s 窗口后红条才恢复"主条即时步进 + 延迟条滞后 0.25s"。

**状态重置（官方硬要求，game-design §8 / node-plan §3.1 / tech-spec §2.6）**：
- `GameFlowController.resetRun()` 在 **开拍/录制开始** 时被调用，**先恢复全部初始状态再启动本轮**：
  - HP=MAX、combo=0、ammo=MAG、reloading=false、heat=0、elapsed=0、stats 归零；
  - `BossStateMachine` 回 SPAWN；`BossAnimPlayer` 回初始序列帧；`HudController` 血条满格、假空关闭；`VfxBudgetGuard` 停所有发射器、`AudioDirector.resetAll()` 停全部音频并清零槽位下标；`CameraShake.reset()`。
  - 显隐：显 `Page_Ready`、隐 HUD/武器（node-plan §3.1 表）。

#### 2.1.6 出战牌（预设像素头像选择器 6 选 1 + 默认兜底不阻断）

> **⚠️ 口径已改**：本节旧稿的「用户选图 / 授权话术 / 权限兜底态（`_locked`）」**全部作废**（本版像塑无用户选图能力，用户拍板改**内置预设选择器**；详见 §8.3 第 8 条）。**完整实现规格见 §2.5**；本节只留要点。

**要点**（详见 §2.5）：
1. 开战前显示 **`PICK_AVATAR`** 选择页（L6 `StatePages` 下）→ 6 个内置像素头像 **选 1**（点选，复用「触摸」）。
2. 选中 → 该形象 `avatar_XX_16`（16 逻辑 / 显示 64×64）贴到 Boss 头顶 `HeadFrame` 内孔径（**锚点读 `art-spec §3.1/§3.3`**：出战牌挂点 `x[52,76] y[2,26]`，24×24 净空）。
3. **兜底不阻断**：未选 → 默认头像 `avatar_01_16`；**3s 无操作自动以默认进局**（单一来源 `game-design §6.2`）；无权限/异步分支（内置素材本地即时可用）。
4. `HeadMount` 挂 `BossBody` 子节点下**刚性跟随**（node-plan §1.1「必须合层 ①」），杜绝头像漂移。

**"牌子"定性的程序侧保证**（art-spec §3.2 四重手段）：相框底部 8 逻辑 px 旗杆贴图常显；`HeadFrame` 与 `BossBody` **各自独立 `#140c1c` 外描边、不共享**；头像尺寸固定 16×16 不覆盖 Boss 独眼。

#### 2.1.7 结算卡生成（ResultCardBuilder）

**数据**（`GameFlowController.getStats()`）：`elapsedMs`、`hitRate = hits/shots`、`maxCombo`、`grade`。

**评级规则**（game-design §9）：
```
S = 通关 && 剩余时间≥50% && 命中率≥70%
A = 通关 && 命中率≥60%
B = 通关
C = 未通关
```

**合成**（art-spec §3.6，**运行时合成，非单张贴图**）：`card_bg`(96×160 逻辑→显示 384×640, 中心 X=-40 Y=+100) + ①Boss 缩略 + 出战牌 ②`ui_word_win`/文案 ③`ui_grade_*` ④`fx_num_atlas` 数据行 + 中文标签 ⑤调侃文案 ⑥页脚。入场 `RESULT_CARD_IN` = **位移滑入 + alpha 淡入**（Y+100→0，0.35s），**不用缩放弹出**（animation-spec §7.3）。

#### 2.1.8 结算与分享（明确边界）

| 做 | 不做 | 依据 |
|---|---|---|
| 保存结算卡到相册 / 走抖音宿主录制入口 | ❌ 特效内账号级 @ | game-design §9（平台无社交 API） |
| 结算卡印出战名/评级作分享素材 | ❌ 外链、❌ 服务器排名榜 | game-design §9 明确不做 |
| 「长按保存/分享」**提示文案** | ❌ 伪造分享按钮 / 调分享 SDK | tech-spec §1 降级替代 |
| （可选）挑战码——**仅当平台支持文字输入** | ❌ 需后台下发的对局 | game-design §9（平台不支持则整条砍） |

---

### 2.2 粒子预算管理器实现（VfxBudgetGuard，按 vfx-spec §3.4）

**职责**：保证**任意时刻全场存活粒子 ≤50**；同时是 E2/E2′/E3/E4/E5/E6 六个发射器的**唯一入口**（集中管理）。
**挂载**：`FxRoot`。发射器均为 **`Basic Particles`**（**禁用 `ParticleEmitter2D`**，node-plan §4 决策 1）；贴图源用隐藏 `TexHolder`（独立对象，**不与发射器同对象**——`VisualEffect` 与 `Image` 互斥，node-plan §4 决策 1）。

**数据结构（O(1)，无逐帧 new）**：
```
emitters = [E2, E2p, E3, E4, E5, E6]   // 6 个 emitter 引用，onInit 时缓存
aliveSum = 0                            // 每帧求和缓存
degradeLevel = 0                        // 当前降级档位（0=正常）
rateKeyOk = false                       // hasFloatKey 实探结果（落工程第一步填充）
rateKeyName = ""                        // 实探到的真实键名（可能是 ""）
```

**onUpdate 完整逻辑（O(1)）**：
```
// 初始化时只执行一次：每个 emitter.enableAliveParticleCount = true
aliveSum = 0
for i in 0..5: aliveSum += emitters[i].aliveParticleCounts   // 常数 6 次求和 = O(1)

if (aliveSum > 50) {                       // 红线硬保护（唯一真正的 ≤50 保证）
    for each e: e.stop(APJS.VFXStopBehavior.StopEmitting)
    applyPeakTrim()                        // 削峰：按下表逐级关/减
    log("[guard] budgetDropped, alive=" + aliveSum)
} else if (aliveSum > 46) {                // 软顶：按阶梯降一档
    applyDegradeLadder(aliveSum)
} else if (aliveSum < 40) {                // 回滞恢复：低于 40 才恢复，避免边界抖动
    clearDegradeLadder()
}
```

**降级杠杆（按可用性择优，取决于 §五 第 1.5 步 key 实探）**：
1. **首选（已知可用、零 key 依赖）**：`e.setEnabledInHierarchy(false)` 关闭对应 emitter 对象 —— 立即压 alive。
2. **次选（仅当 `rateKeyOk==true`）**：`e.setFloat(rateKeyName, <当前值>×0.5)` 降发射率。**未实探到键名前不得写死 `setFloat("rate", …)`**（node-plan §4 决策 4）。
3. **兜底**：调 `Lifetime` 缩短存活，加速自然回收。

**降级阶梯（回滞 40↔46；从"最该砍"到"最后才砍"；vfx-spec §3.4 表）**：
| 档 | 对象 | 动作 | 释放额度 |
|---|---|---|---|
| 1 | L1 环境氛围粒子 | 停（本项目 L1 本就留空） | — |
| 2 | E6 认输星星 | `setEnabledInHierarchy(false)` | 8 |
| 3 | E2 命中星 | 单次 3 → **2**（rate 实探后降，否则关一个变体） | 2–4 |
| 4 | E4 暴怒脉冲 | 6 → **3** | 3 |
| 5 | E5 彩带 | 20 → **12** | 8 |
| — | **不砍** | E3 破盾（机制反馈）、E2′ 暴击星、闪白/数字/震动（本就 0 粒子） | — |

**发射封装接口**（对外唯一入口）：
```
emitHit(isCrit)      → (isCrit? E2p : E2).emit()   // 3 / 5
emitShieldShard()    → E3.emit()                    // 8
emitEnragePulse()    → E4.emit()                    // 6
emitVictory()        → E5.emit(); E6.emit()         // 20 + 8 = 28 ≤ 30
```
> **换贴图严格按官方顺序**（node-plan §4 决策 1）：`e.stop()` → `asset.setTexture("MainTexture", tex)` → `e.play()`。贴图来自 `TexHolder`（GUID 经 `@serializeProperty` 引用）。

**日志前缀 `[guard]`**，打点字段 `budgetDropped`、`alive=NN`（vfx-spec §11 验收项 3）。

**结论**：S7（理论全叠加）重算后 = **50 = 红线本身、余量 0** —— 单靠内容约束**不足**，运行时预算管理器是**必需项**：alive>46 先砍 E6（−8）→42 已回线；>50 硬停兜底。**达标不得由算式自证，必须保留运行态实测**（逐帧求和 `vfx.aliveParticleCounts` ≤50，vfx-spec §3.4）；红线硬停 `stop(StopEmitting)` 是**最后防线，不是余量**。

---

### 2.3 音频集成实现（AudioDirector，按 audio-spec §10.1 的 13 条）

**铁律（audio-spec §0 结论 ①②）**：`AudioComponent` **无 pitch API、无运行时换绑素材 API** → **1 资产 = 1 组件 = 1 场景对象**，本项目共 **26 个音频对象**（2 BGM + 24 SFX）。

**§10.1 逐条落地**：

| # | 上游要求 | 我的落地 |
|---|---|---|
| 1 | 26 个音频对象（2 BGM + 24 SFX） | 全部挂 `AudioRoot`（独立变换父节点）；对象名与资源名一致（`Sfx_Hit_L1..L4`、`Sfx_Hit_H1..H3`、`Sfx_Gun_1..3`、其余 14 个唯一音效、`BGM_P1_Normal`/`BGM_P2_Enrage`） |
| 2 | 总线：BGM→`BGM`；SFX→`AUDIO_EFFECT` | 逐对象设 `audioType`（平台唯一混音分组） |
| 3 | BGM `playMode=INFINITE`（**禁 `loopCount=-1`**）；SFX `ONCE` | 逐对象设 `playMode` |
| 4 | 全部 `autoPlay=false`，脚本统一启播 | onInit 后统一 `play()`，避免早于首帧 |
| 5 | 预热播放 | onInit 后一次性把 24 SFX 槽以 `volume=0` 各 `play()` 一次，随即恢复音量（消除首触发解码延迟） |
| 6 | 快速重触发 `play()` alone；**禁同帧 `stop()`+`play()`** | 所有 SFX 只调 `play()`；换槽不 stop 旧槽 |
| 7 | 槽位轮转 | 见下方"轮转公式" |
| 8 | 并发衰减表（软件限幅，**不可省**） | 见下方"并发衰减表" |
| 9 | 优先级丢弃 | 见下方"优先级丢弃" |
| 10 | BGM 分帧切换 + 量化到拍 | 见下方"BGM 切换" |
| 11 | BGM 闪避 | `shieldbreak/roar/终局` → BGM `volume` 30→20，150ms 线性回升；命中轻击**不闪避** |
| 12 | RESET 归零 | `resetAll()`：`stop()` 全部组件，combo/槽位下标=0 |
| 13 | 日志规范 `[audio]` | 每个 `play()` 打 `[audio] action=play channel=<name> voice=<idx>`；未绑定打 `[audio] missing channel=<name>` |

> **音频延迟记账（audio-synth 实测口径）**：采样率 **44100Hz**（非 22050）；同内容同码率下 22050 编码器延迟 50.1ms、44100 为 **25.06ms（1105 samples）** → §7.4 延迟预算按 **25.06ms** 计入。26 文件**均已写 Xing/Info（LAME gapless）头**：**像塑解码认此头 → 该 25ms 可裁掉；不认 → 必须按 +25ms 记账**（生成侧无法验证，只能真机实测，见 §六 行 5b）。

**槽位轮转公式**（audio-spec §3.2 机制 1+2）：
```
轻击池 4 槽：idx = (combo - 1) mod 4     // 0 / +2 / +4 / +6 半音循环
重击池 3 槽：idx = (combo - 1) mod 3     // 0 / +2 / +4 半音循环
开火池 3 槽：idx = (gunShotCount - 1) mod 3
样本切换：combo ≤ 9 → 轻击池；combo ≥ 10 → 重击池
```
- 轮转**同时解决"音高阶梯"与"叠音"**：稳态零重叠（命中音 140ms < 射速闸门 250ms）；同帧两目标命中 → 派给两个不同槽 → 自然叠成两个不同音高的音（audio-spec §3.2 机制 2）。
- 音高**硬上限**：轻 1.414×（+6 半音）/ 重 1.260×（+4 半音），**不递增**（防啸叫）。

**并发衰减表（软件限幅，替代压缩器）**：
```
n=1: ×1.00 / n=2: ×0.72 / n=3: ×0.58 / n≥4: ×0.50
每次启动前：设 slot.volume = round(baseVolume × coeff(n))，n=当前播放中 SFX 槽数
```
> 最坏相干叠加验算：`hit_heavy(−8) + hit_light(−9) + gun_shoot(−12)` 各 ×0.58 相干峰值 ≈ **−3.2 dBFS**，安全（audio-spec §3.2 机制 4）。

**优先级丢弃（不打断，只"不启动"）**：
```
新事件到达：
  if (全局并发 < 4) 启动；
  else if (新事件优先级 > 并集中最低优先级者) 丢弃最低者（不 stop，等它自然播完）；
  else 丢弃新事件。
```
- P0 绝不丢弃：`result_win/result_lose/shieldbreak/roar/phase_switch`
- P1：`hit_*/gun_shoot/gun_reload/gun_empty/boss_land/boss_surrender`
- P2 先丢：`ui_lock/ui_crosshair/combo_up/boss_taunt`；P3 最先丢：`ui_click`
- **同帧最大新启动 = 2**（第 3 个只计 combo、不发声）
- **唯一可硬 `stop()` 的场景**：终局三音（`result_win/result_lose/boss_surrender`）起播时硬停所有 P1/P2（终局必须干净）。

**BGM 分帧切换与闪避**：
```
阶段 2 触发（HP 跨 66%）：
  量化到最近"拍"线（0.5s 网格）
  本帧：BGM_P1.stop()
  下一帧：BGM_P2.play()          // ★ 必须分帧（同帧 stop+play 会被引擎塌陷，audio-spec §0 结论 ②）
  同时：AudioDirector.duckBgm() 触发一次（roar 事件）
```

**combo 归零条件**（audio-spec §3.2.1）：脱靶 / 超时未命中 / 换弹开始 / 被弹幕致盲。

> **音频验收以脚本日志为准**（audio-spec §9 验收项 10，官方 SKILL 明确：截图/MP4 无法证明音频）。

---

### 2.4 相机震动实现（CameraShake；tech-spec §2.8 口径，**v2.2 条件性单点**）

> **⚠️ 口径变更（v2.2）**：`node-plan §1.2` 的「屏幕震动能否传到 3D 世界锚定 Boss」挂起项**转为条件式** —— 见下方「条件性单点」。

**作用点（单点，v2.2）**：vfx-director 已**划除 V6**（Boss 本体 ±2px 抖动）、animation-director 已**删 `BossRoot` 的 `shakeOffset` 通道** ⇒ **原「路① Boss 抖动」作废**，全项目震屏**只剩 `ContentRoot` 一个作用点**。

| 目标节点 | 作用方式 | 幅度 |
|---|---|---|
| `ContentRoot.ScreenTransform.anchoredPosition` | L2–L5 整体屏幕偏移（**单点**） | k 表见下（**Boss 世界高比例**，单位不改成屏幕） |

> **⚠️ 条件性单点（v2.2）**：本方案依赖 **`ContentRoot`(2D) → 3D Boss 的父子传导**；该传导**未实测**（`node-plan §7` 第 9 项真机 A/B 未做，且 `node-plan §1.2` 曾判定"3D 世界锚定内容的 transform 可能被 AR 追踪每帧覆写"）。**若真机 A/B 判"不跟随" ⇒ Boss 完全不抖 ⇒ 必须恢复 Boss 世界空间抖动**（复用同一 `ShakeAmp.ts`，成本低）。**验证前，Boss 抖动不得标为「已完成」。**

**⛔ 两条禁止（被否决方案，勿踩）**：
1. **绝不给 `AR Camera`（`TargetTrackingCameraJS`）加平移**：其官方语义 = "keeps the camera's projection aligned with the device's real camera feed each frame"——每帧把相机对齐真实摄像头，叠加偏移会被**覆写**；且其 `properties` 为空（核过 `component_schemas.json` + `type_registry.json`），**无偏移 / FOV 可写**。
2. **不为隔离抖动新增节点**（抖动 ≤4 屏幕 px ≈ 容差 `0.17` 的 **≈0.4%**，对 §2.1.1 命中判定无实质影响）；真机实测若发现影响命中，再引 `BossBody` 隔离，标 **P2**。
   > （原第 2 条"不依赖父子传导"**已撤**——v2.2 的方案**正是**依赖它，见上「条件性单点」。）

**幅度口径（FOV 无关；★ v2 改法，会改实现）**：因 **AR 相机 FOV 不可读**（§2.8），无法用"屏幕 px"换算世界位移，改用「**世界高比例**」：
```
世界幅度 = Boss世界高 × k
Boss世界高 = BossBody.localScale × 贴图物理高
```
**k 表（六档固定常量；禁止运行时按投影反算——投影随距离变，反算会让震动时大时小）**：

| 档 | vfx-spec §6.2 屏幕 px | k（Boss 世界高比例） | 触发接口 |
|---|---|---|---|
| 普通命中 | 0.5 | **0.4%** | `addHit(false)` |
| 暴击命中 | 1.5 | **1.2%** | `addHit(true)` |
| 破盾 | 3 | **2.3%** | `addShieldBreak()` |
| 暴怒 | 4 | **3.0%** | `addPhase()` |
| 认输 | 3 | **2.3%** | `addFinish()` |
| 失败 | 2 | **1.6%** | `addLose()` |

> 换算：128 逻辑像素投影下 **1 屏幕 px ≈ 0.78% Boss 世界高** → 0.5px≈0.4%、1.5px≈1.2%、2px≈1.6%、3px≈2.3%、4px≈3.1%（取 **3.0% 硬上限**）。
> **⛔ 单位口径（v2.2，勿改）**：虽然作用点已是 2D `anchoredPosition`，**幅度仍以「Boss 世界高比例 k」表达、不改成屏幕 px / 屏幕高比例**——参考尺（Boss 投影 ≈128px）不变，且**日后若恢复路①，同表数字可直接复用、无需换算法**（把恢复成本压到最低）。

**★ 幅度单一权威 = 纯常量模块（`tech-spec §2.8 ⑥`）**：k 表抽成 **`constants/ShakeAmp.ts`**（**只有 `const` 表，无逻辑、无副作用、不 import 任何 APJS 运行时 API**）；当前由 **`CameraShake`** import（**若日后恢复路①，`BossAnimPlayer` 直接复用同一张表、各写各的 Transform**）。理由（硬）：**不抽公共常量模块，日后恢复路① 必然出现"两份绝对值"**（本项目反复中招的"共享数值多来源"）；抽表后满足：单一幅度权威 ✓ / 不互相调用（`import` 常量 ≠ 表现层互调）✓ / 不新增节点 ✓。（k 表数值来源 = `tech-spec §2.8 ⑥`「幅度口径」；引用**以 `§2.8 ⑥` 小节号为准，勿钉行号**。）
**★ 连锁要求**：若 `animation-spec §3.3` 自带抖动幅度值（如 `±2 lp`），**以 `ShakeAmp.ts` 为唯一来源、删其重复表**（§3.3 的重复值由 doc-sync 清理，本文件不重复写死）。

**硬约束（原约束不变）**：单帧 **≤3% Boss 世界高**；**只平移、不旋转**；**新震覆盖不叠加**（新 `addXxx` 直接覆盖当前偏移量，不与旧值累加）。

**接口与调用边界（引 `tech-spec §2.8 ⑥`「单一写入者原则」）**：
- 接口（**不变**，现在只是给单点调幅）：`addHit(isCrit)` / `addPhase()` / `addShieldBreak()` / `addFinish()` / `addLose()` / `addRecoil()` / `reset()`。
- **`BossAnimPlayer` 与震屏已完全解耦**：v2.2 无「路①」后，`BossAnimPlayer` **只负责 摆动 / 击退 / 掉落**（`BossRoot` 加法链），**不再承载任何震动通道**（原 `shakeOffset` 通道已由 animation-director 删除）。
- **单点写入者**：`ContentRoot.ScreenTransform.anchoredPosition` 的**唯一写入者 = `CameraShake`**（§2.0.1 红线 4）。
- **`addRecoil()`**：开火后坐，**仅屏幕（`ContentRoot` 单点）**，不作用于 Boss。

**L4 命中粒子 / 伤害弹字 = 屏幕口径**（tech-spec §2.8 ⑤）：`FxRoot` 挂 `ContentRoot` 下正合适；**`DamageTextPool` 保持屏幕锚定，不改世界锚定**。

---

### 2.5 预设像素头像选择器（6 选 1；口径变更，见 §8.3 第 8 条）

> **⚠️ 口径变更（v2，用户拍板）**：头像方案改为 **「游戏内置预设像素头像选择器（6 选 1）」**；旧「用户选图」口径**作废**——变更依据（本版像塑实测无用户选图能力）与完整记录见 **§8.3 第 8 条**。**本节只写新口径规格，不复述旧流程。**

**职责**：`AvatarPicker`（脚本）管理 `PICK_AVATAR` 选择页显隐与交互；把选中的 `avatar_XX_16` 贴到 Boss 头顶 `HeadMount` 挂点；未选中走默认头像、**不阻断进局**。**选择器是 L6 状态页内的纯屏幕口径 2D UI，不涉 AR 世界坐标。**

**1. 状态机**
```
启动 → PICK_AVATAR → FIGHTING → (WIN | LOSE) → RESET → PICK_AVATAR（保留上次高亮）
```
- `PICK_AVATAR` **只在开战前存在**；确认进局后**立即隐藏**整页，**不参与战斗期**。
- 与 `GameFlowController.GameState` 联动：`PICK_AVATAR` 期 `requestFire()` 闸门恒 false（**不起火**）。
- **兜底倒计时（3s）= AFK 兜底，非强推**：进入 `PICK_AVATAR` 即起 **3s 计时**；**用户首次交互（点选任一 `Tile` 或点「开始」）后立即取消该倒计时**——否则会出现「用户在 2.8s 点选、3.0s 被默认值覆盖」的竞态。主动用户不受倒计时影响。（值单一来源 `game-design §6.2`）

**2. 节点树草案（仅落 L6，不新增层）**
```
StatePages                     [L6 · 已存在的独立父对象（§3.2）]
└─ Page_PickAvatar             (选择页根；【AvatarPicker 脚本挂此】)
   ├─ PickTitle                (题头 ui_word / 系统字体；中心 X=-40 Y=+300)
   ├─ TileGrid                 (纯容器)
   │  ├─ Tile_1 … Tile_6       (Screen Image；各贴 avatar_01_64 … avatar_06_64；显示 128×128)
   │  └─ TileHi                (选中态高亮框；居中于选中 tile，128×128 + 描边；默认 hidden)
   └─ Btn_Start                (btn_backplate 5 态 + 文案「开始挑战」；中心 X=-40 Y=-160)
```
- **不新增 L1/L6 之外的层**：全部挂 L6 的 `StatePages` 下；`TileGrid`/`TileHi` 是**同层内的可见子对象**，不额外占顶层渲染层额度。
- `Tile_1..6` 各为独立 `Screen Image`（**1 资产 = 1 贴图，不用图集**）；选中高亮靠独立 `TileHi` 覆盖，**不改 tile 贴图**。

**3. 挂点交接（选中 → Boss 头顶）**
- 确认后：`avatar_XX_16`（16 逻辑 / 导出 512 / **显示 64×64**）→ 赋给 `FaceImage.texture`。
- `FaceImage` 是 `HeadFrame`（`boss_head_frame_a`，外框 24×24 逻辑、内孔径 **16×16 逻辑 / 显示 64×64**）的子节点；`HeadFrame` ⊂ `HeadMount` ⊂ `BossBody`（L2），`HeadMount` **刚性跟随** Boss（`animation-spec §8.1/§8.2`）。
- **锚点值读 `art-spec §3.1/§3.3`**：出战牌挂点 = **`x[52,76] y[2,26]`（24×24 净空，双角之间）**；`FaceImage` 在 16×16 孔径内**居中**，外框盖边 1–2 逻辑 px（装裱感）。
- **写入者唯一**（§2.0.1 红线 4）：`FaceImage.texture` 的写入者 = `AvatarPicker`；`HeadMount.position` 的写入者 = `BossAnimPlayer`（刚性跟随）——**二者不得互写**。
- **轨 B（摄像头取像）赋值边界**（`tech-spec §9.3`/§9.4、`node-plan §7 第 10 项`）：将来落地「摄像头取像 → 贴到头顶」时，取像得到的纹理**必须经 `AvatarPicker.setTexture(tex)`（或既有 `onPickResult(tex)` 入口）赋值**，**禁止取像逻辑直写 `FaceImage.texture`**——否则绕过上面的「写入者唯一」红线。轨 B 本轮**已登记、未落地**（依赖 `tech-spec §9.4` 的 5 个未实测点）。

**4. 安全区（具体整数坐标，禁止"大致居中"）**
基准：设计空间 720×1280；安全区 **X[-340,+260] / Y[-400,+500]**（`game-design §3.3`）；**底部禁区 Y ≤ -220**、顶部信息栏 Y ≥ +430（`art-spec §3.5/§5`）。

6 tile = **3 列 × 2 行**，每 tile **128×128 逻辑**、间隙 **24**：

| | 列1 | 列2 | 列3 |
|---|---|---|---|
| **列中心 X** | **-192** | **-40** | **+112** |
| **行1 中心 Y** | **+116** | +116 | +116 |
| **行2 中心 Y** | **-36** | -36 | -36 |
| tile 编号（行1/行2） | Tile_1 / Tile_4 | Tile_2 / Tile_5 | Tile_3 / Tile_6 |

- 越界校验（整数，逐边）：最左 = -192-64 = **-256 ≥ -340** ✓；最右 = +112+64 = **+176 ≤ +260** ✓；最上 = +116+64 = **+180 ≤ +430** ✓（脱离顶部栏）；最下 = -36-64 = **-100 > -220** ✓（**远离底部 180px 录制禁区**）。
- `PickTitle`（-40,+300）、`Btn_Start`（-40,-160，底边 -184 > -220）均在安全区内。
- 结论：**整套 6 tile 阵列 X∈[-256,+176]、Y∈[-100,+180]，全落安全区、不触底部录制禁区、不压顶部信息栏。**

**5. 触发额度（复用「触摸」，不新增第三类）**
- 全程触发类型恒为 **① 触摸 ② 人脸事件**（`game-design §二`）。选择器**复用「触摸」**，**不新增第三类触发**。
- **按状态机隔离**（依据 = `GameState`，**非"两套触摸系统"**）：
  - `PICK_AVATAR` 期：`AvatarPicker` 用**屏幕口径 2D 矩形点选**（touch 坐标 ∈ tile 128×128 矩形 → 选中）；`ShootHandler` 的 `requestFire()` 因 `GameState≠FIGHTING` 恒 false ⇒ **不起火**。
  - `FIGHTING` 期：选择页已隐藏，`AvatarPicker` 不响应触摸，触摸回到 `ShootHandler` 开火。
  - 同一个 `APJS.EventType.Touch`，**按状态分流**。
- **注**：`PICK_AVATAR` 是**屏幕 2D UI 点选**，与战斗期 AR 视口命中判定（§2.1.1）**无关、不冲突**（战斗期才用 `worldToViewportPoint`）。

**6. 兜底（默认头像，不阻断进局）**
- **任何路径都不卡住**：未选「开始」直按 → 默认头像 **`avatar_01_16`**（热血红发）；**3s 无操作 → 自动以默认头像进局**（单一来源 `game-design §6.2`；兜底倒计时随状态机、RESET 清零）；预设素材**本地即时可用**，无"加载失败"分支。
- `game-design §6.2`「默认不挂外部头像」精神保留：未选即内置默认、**不引用任何外部内容**。

**7. 合规叙事（红线「已缓解」→「**已消除**」）**
- **头像 = 游戏内置像素素材**（`assets/px/avatars/`，12 张 PNG，DB16 硬校验，含 `avatars.json`）：**不含任何真人照片、无外部内容访问、无权限申请**。
- 故原「用户内容 / 肖像权」相关红线**整段消除**：**无权限流、无任何外部内容采集**（原平台权限相关的兜底态与提示一并作废）。
- 审查话术：**「头像为游戏内置形象，用户不提供任何个人内容」**。

**8. 产品取舍（如实记录，用户知情决策）**
- **社交钩子弱化**：原「好友的脸」→「从 6 个内置形象选一个给 Boss 举牌」，**传播点变弱**（"把朋友的脸打上去"不再成立）。
- 这是**平台能力所限下的用户拍板决策**（本版像塑无用户选图 API）——**如实记录、不隐瞒**。后续平台若放开用户选图能力，`AvatarPicker` 预留 `onPickResult(tex)` / `useDefault()` 接口位可无缝回接。

**`AvatarPicker` 接口**：`showPicker()`、`select(index)`、`confirmStart()`、`getSelectedTex()`、`useDefault()`、`hide()`、`reset()`；预留 `onPickResult(tex)` / **`setTexture(tex)`（轨 B 取像赋值的唯一合法入口 —— `FaceImage.texture` 的写入者恒为 `AvatarPicker`，见 §2.5-3）**。

---

## 三、工程组织

### 3.1 目录结构（沿用 tech-spec §2.3）

```
effects/ar-boss-raid/
├── README.md
├── brief.json                 # 需求沉淀（含用户原话）
├── compliance.md              # 合规自检
├── game-design-doc.md
├── tech-spec.md
├── node-plan.md
├── implement-plan.md          # ← 本文件
├── assets/
│   ├── PLACEHOLDERS.md
│   ├── SOURCES.md             # 素材来源/授权记录（合规必备，AI 产出必须登记）
│   ├── boss/   (boss_body_* / boss_eye_* / boss_shield* / boss_head_frame_* / avatar_* / white_flash_mask)
│   ├── boss/anm_<action>/     # 序列帧目录（anm_idle/、anm_enrage_intro/ …），anim_001.png 起
│   ├── gun/    (gun / crosshair / crosshair_lock / fx_lock_ring / muzzle_flash)
│   ├── fx/     (hit_spark / hit_spark_alt / fx_num_atlas / fx_shield_shard / fx_confetti_strip)
│   ├── ui/     (hp_* / ui_panel / btn_backplate / ui_word_* / ui_grade_* / card_bg)
│   └── audio/  (sfx_*.mp3 / bgm_*.mp3)
└── scripts/    (GameFlowController.ts … CameraShake.ts / BossAnimPlayer.ts)
└── constants/  (ShakeAmp.ts —— **纯常量模块**：震动幅度 k 表；无逻辑、无副作用、不 import 任何 APJS 运行时；
│              由 `CameraShake` import（日后恢复 Boss 抖动时 `BossAnimPlayer` 复用同表），幅度单一权威)
```

### 3.2 场景组织（含 AR 追踪链；沿用 node-plan §2）

> **v2 结构变化**：新增 **`ARTracking` 组（`AR Camera` + `DeviceTracker`）**；`BossRoot` 的 Boss 载体变为 **3D `ImageEntity`、锚定真实世界坐标**（由 `AR Camera` 渲染，随转手机在屏幕滑动）。

```
场景根
├─ ARTracking                       [结构层·不计入 6 层]   ← v2 新增
│  ├─ AR Camera                     （AR Plane 自动创建；渲染 3D 世界；脚本按名"AR摄像机"解析）
│  └─ DeviceTracker                 （trackingMode=World，6DoF；提供 AR 相机朝向）
├─ ContentRoot                      [变换父节点·不占层·CameraShake 作用对象]
│  ├─ BossRoot                      [L2·**3D 世界锚定**·随 AR 相机朝向在屏幕滑动]
│  │  ├─ BossBody  (3D ImageEntity 序列帧 + EyeMount 眼叠层 + WhiteFlashMask + HeadMount→HeadFrame→FaceImage + CorePoint)
│  │  └─ ShieldProp                 [L2]
│  ├─ WeaponRoot                    [L3] Gun / MuzzleFlash / **Crosshair（固定屏幕正中，不接 Touch）**
│  ├─ FxRoot                        [L4] Emitter_HitStar / _CritStar / _ShieldShard / _EnragePulse / _Confetti / _VictoryStar / DamageTextPool / HitMarker
│  ├─ HudRoot                       [L5] HpBar_Frame / HpBar_Fill / HpBar_Lag / HpBar_Shield / PhaseTick_66 / PhaseTick_33 / HintText
│  ├─ ContentRoot_UI                [L5] UI Tween 承载
│  ├─ TexHolder                     [L4 辅助·隐藏 Screen Image·粒子 MainTexture 源]
│  └─ AudioRoot                     [26 个音频对象·变换父节点·不占视觉 6 层——待实测 ④]
├─ Fx_HitFlash 光点                  [L4 辅助·additive·≤8px·DB16 精确色]
└─ StatePages                       [L6 独立父对象] Page_Ready / Page_Win / Page_Lose
```
- **`ARTracking`（`AR Camera` / `DeviceTracker`）不计入 6 层**：它是 AR 相机与追踪载体（结构层），去掉它 3D Boss 无处安放（与摄像头透传同理，`tech-spec §2.1`）。
- **两套坐标体系**：`BossRoot`（L2）走 **3D 世界坐标**；`WeaponRoot`/`FxRoot`/`HudRoot`/`StatePages`（L3–L6）走 **2D 屏幕坐标**。**跨体系换算唯一入口 = `arCamera.worldToViewportPoint()`**（§2.1.1），禁止手算。
- `ContentRoot` / `AudioRoot` 是**变换父节点，不是渲染图层**，render group 独立控制排序 → **不消耗 6 层额度**（node-plan §1.2）。
- 脚本挂载点：`GameFlowController`+`ShootHandler`+`CameraShake` → `ContentRoot`；`BossAnimPlayer` → `BossBody`；`BossStateMachine` → `BossRoot`；`VfxBudgetGuard` → `FxRoot`；`HudController` → `HudRoot`；`AudioDirector` → `AudioRoot`；`AvatarPicker` → `HeadMount`；`ResultCardBuilder` → `StatePages`。**`ShootHandler` 运行时解析 `AR Camera` 引用 = `tryResolveCamera()`（§2.1.1），不静态硬绑。**

### 3.3 数据驱动决策（tech-spec §2.5）

**用脚本 `@serializeProperty` + 常量，不引入 JSON**（单 Boss、参数有限）。§2.1.2 的所有数值作为 `GameFlowController` 的 `@serializeProperty`（Inspector 可直接调），默认值即设计案 §五数值。

---

## 四、资产接入清单（绑定清单）

> 一张总表：**资产 → 挂到哪个节点 → 用什么组件 → 关键参数**。分 7 组。
> 导出倍率口径按 **art-spec §〇 裁定 1**：`导出 = 逻辑 × N`，N = 满足"导出 ≤512 且为整数倍的最大整数"。**每张异步设导入参数**（node-plan §5）：`filterMin/Mag=Nearest`、`filterMipmap=None`、`enableMipmap=false`、`Max Resolution=Size512`、`wrapMode S/T=Clamp`、`Compression Type ≠ None`。

### 4.1 L2 · Boss 主体层（贴图 → 节点）

> **v2 关键**：`BossBody` 已从「2D `Screen Image`」改为 **3D `ImageEntity`（世界锚定）**；其下所有挂点（EyeMount / HeadMount / CorePoint / WhiteFlashMask / ShieldProp）都挂在 3D 载体上，**随 AR 相机朝向整块在屏幕滑动**。命中判定对 `BossBody`/`CorePoint` 的 `getWorldPosition()` 走 §2.1.1 视口公式。

| 资产（art-spec） | 逻辑/导出/显示 | 挂到节点 | 组件 | 关键参数 |
|---|---|---|---|---|
| `boss_body_idle/enrage/faint/surrender` | 128×128 / 512 / 256 | `BossBody` | **3D `ImageEntity`（世界锚定）+ AnimatedTexture** | 序列帧播放；**受击不换本体**（闪白遮罩 + 换眼） |
| `white_flash_mask` | 128×128 / 512 / 256 | `WhiteFlashMask` | Screen Image | **与 `BossBody` 同尺寸（sizeDelta）同锚点**；默认 `enabled=false`；色 `#deeed6`（**严禁 `#ffffff`**，art-spec §10-A） |
| `boss_eye_normal/hurt/rage/surrender/closed` | 16×16 / 512 / 64 | `EyeMount`（`BossBody` 子节点，挂点 (64,56)） | Screen Image | 同网格同挂点；闪白期被盖（显隐优先级：**闪白 > 眼睛**）；白闪结束立刻切 `_hurt` |
| `boss_shield` | 64×64 / 512 / 128 | `ShieldProp` | Screen Image | **护盾期只叠此片，不换本体**；仅护盾期可见，随身体 |
| `boss_shield_core` | 8×8 / 512 / 32 | `CorePoint`（`BossBody` 子节点） | Screen Image | 护盾期每 1.2s 随机位置闪（亮 0.25s，`visible` 切换） |
| `boss_head_frame_a` | 24×32 / 384 / 96 | `HeadFrame`（`HeadMount` 子节点） | Screen Image | `HeadMount` 挂 `BossBody` 下**刚性跟随**；含 8px 旗杆常显；**与 Boss 各自独立描边** |
| `avatar_placeholder` | 16×16 / 512 / 64 | `FaceImage`（`HeadFrame` 子节点） | Screen Image | 孔径 16×16 居中；**内置头像未选/异常时的默认兜底**；**不阻断** |
| Boss 序列帧（47 帧/本体） | 128×128 / 512 / 256 | `BossBody` | AnimatedTexture（Texture Sequence） | 目录 `anm_<action>/anim_001.png` 起；单动作 ≤24；见 §4.6 帧表 |

### 4.2 L3 · 武器层

> **v2 关键**：`Crosshair` **固定在屏幕正中 `(0,0)`、不接 Touch、不跟随任何输入**；`crosshair_lock` = **命中态高亮**（Boss 落入 0.17 视口容差窗时切换）。

| 资产 | 逻辑/导出/显示 | 挂到节点 | 组件 | 关键参数 |
|---|---|---|---|---|
| `gun` | 128×64 / 512×256 / 256×128 | `Gun`（`WeaponRoot`） | Screen Image | 中心 (X=+40,Y=-150)；只在 `WeaponRoot` 内做整数位移，**不旋转** |
| `muzzle_flash`（2 帧） | 32×32 / 512 / 128 | `MuzzleFlash` | AnimatedTexture | 中心对齐炮口；每发 `Once` ~40ms；与 `RECOIL` 同步 |
| `crosshair` / `crosshair_lock` | 32×32 / 512 / 64 | `Crosshair`（**屏幕正中**） | Screen Image | **双态静态贴图切换**（非逐帧）；`_lock` = 命中态高亮（黄 `#dad45e` + 收拢闭合框 + 中心点 4×4）；**位置固定 `(0,0)`，不拖拽** |
| `fx_lock_ring` | 32×32 / 512 / 128 | `Crosshair`（叠层） | Screen Image | **命中瞬间** 1 帧外扩环（P2 可砍） |

### 4.3 L4 · 命中特效层

| 资产 | 逻辑/导出/显示 | 挂到节点 | 组件 | 关键参数 |
|---|---|---|---|---|
| `fx_hit_star`（hit_spark） | 16×16 / 512 / 32 | `TexHolder` | Screen Image（隐藏） | **作为粒子 MainTexture 源**；GUID 经 `@serializeProperty` 引用；**不与发射器同对象**（VFX 组件与 Image 互斥） |
| `fx_shield_shard` | 16×16 / 512 / 32 | `TexHolder` | Screen Image（隐藏） | 同上 |
| `fx_confetti_strip`（彩带条） | 16×16 / 512 / 32 | `TexHolder` | Screen Image（隐藏） | 同上 |
| 发射器 E2/E2′/E3/E4/E5/E6 | — | `Emitter_*` | **Basic Particles**（禁 ParticleEmitter2D） | 换贴图顺序 `stop()→setTexture("MainTexture",tex)→play()`；粒子 ≤50 |
| `fx_num_atlas` | 160×16 / 480×48 | `DamageTextPool`（3 个） | 2D Text / 数字图集 | 普通 1/2、暴击 1/1；最多 4 位；合并窗口 120ms |
| HitMarker | 复用数字/短横 | `HitMarker` | Screen Image | X 形 4 短横，10 帧外散淡出；未命中不出 |
| Fx_HitFlash 光点 | ≤8px | `Fx_HitFlash 光点` | additive | 色 = DB16 精确值（`#deeed6`/`#dad45e`） |

### 4.4 L5 · HUD 层

| 资产 | 逻辑/导出/显示 | 挂到节点 | 组件 | 关键参数 |
|---|---|---|---|---|
| `hp_frame`（含 66/33 刻度） | 64×16 / 512×128 / 256×64 | `HpBar_Frame` | Screen Image | 中心 (X=-40,Y=+380)；槽宽 60 逻辑 px |
| `hp_fill` | 60×12 / 480×96 / 240×48 | `HpBar_Fill` | Screen Image | **改 `width`（整数逻辑 px），不用 `scaleX`** |
| `hp_fill`（染红复用） | 同上 | `HpBar_Lag` | Screen Image | 延迟余量条，滞后 0.25s |
| `hp_shield_fill` | 60×6 / 480×48 / 240×24 | `HpBar_Shield` | Screen Image | 血条上方**独立盾量层**（=破盾进度）；护盾期 HP 主条冻结 |
| `PhaseTick_66/33` | 烤进 `hp_frame` | `PhaseTick_*` | Screen Image | 亮态 `#dad45e` 闪 3 帧 |
| HintText | — | `HintText` | 2D Text（系统字体） | 阶段提示/连击/「它装的！」 |

### 4.5 L6 · 状态页与结算卡

| 资产 | 逻辑/导出/显示 | 挂到节点 | 组件 | 关键参数 |
|---|---|---|---|---|
| `ui_panel` | 128×96 / 512×384 / 512×384 | `Page_Ready/Win/Lose` | Screen Image | 中心 (X=-40,Y=+40)；**面板四周留摄像头实景**（不是整屏蒙层，合规） |
| `btn_backplate`（5 态） | 64×24 / 512×192 / 256×96 | 各页按钮 | Screen Image | 按钮中心 Y ≥ -220（不落底部禁区） |
| `ui_word_ready/win/lose/reset` | 见 art-spec §4.5 | 各页标题 | Screen Image | 固定字符串烤图 |
| `ui_grade_s/a/b/c` | 32×32 / 512 / 128 | `Page_Win` | Screen Image | + 右侧叠 0–3 星点冗余编码 |
| `card_bg` | 96×160 / 192×320 / 384×640 | `Page_Win` | Screen Image | 中心 (X=-40,Y=+100)；运行时合成结算卡 |
| 中文文案 | — | 各页 | 2D Text（系统字体） | 去暴力语义（放倒/挑战成功/它跑掉了） |

### 4.6 Boss 序列帧 → `BossBody` 绑定表（animation-spec §11.1 定稿 47 帧）

| 逻辑动作 ID | 目录 | 帧数 | fps | playMode | 保持方式 |
|---|---|---|---|---|---|
| `ANM_Boss_SpawnJumpIn` | `anm_spawn_jump_in` | 6 | 12 | Once | 结束切 IDLE |
| `ANM_Boss_Idle` | `anm_idle` | 4 | 8 | Loop | —（眨眼走 `boss_eye_closed` 叠层） |
| `ANM_Boss_EnrageIntro` | `anm_enrage_intro` | 8 | 12 | Once | 结束切 ENRAGE_LOOP |
| `ANM_Boss_EnrageLoop` | （静态停帧） | 0 | — | — | `boss_body_enrage` 单帧 + bob 位移 + 红眼闪 |
| `ANM_Boss_ShieldUp` | `anm_shield_up` | 2 | 10 | Once→Clamp | `ClampForever`（或停帧静态 Image，见 §六-1） |
| `ANM_Boss_ShieldBreak` | `anm_shield_break` | 2 | 12 | Once | 结束切 ENRAGE_LOOP |
| `ANM_Boss_FeignCollapse` | `anm_feign_collapse` | 5 | 15 | Once→Clamp | `ClampForever` |
| `ANM_Boss_FeignReveal` | `anm_feign_reveal` | 4 | 12 | Once | 结束切 ENRAGE_LOOP |
| `ANM_Boss_DefeatSurrender` | `anm_defeat_surrender` | 10 | 10 | Once→Clamp | `ClampForever` |
| `ANM_Boss_DefeatHold` | （静帧） | 1 | — | Loop | 单帧 Image 常显 |
| `ANM_Boss_TauntEscape` | `anm_taunt_escape` | 5 | 10 | Once | 出画后隐藏 |
| **本体合计** | | **47** | | | |
| `MINION_IDLE`（P2 可砍） | `anm_minion_idle` | 4 | 8 | Loop | — |
| 枪口闪光 | `anm_muzzle` | 2 | 高频 | Once | 每发 |
| **序列帧总量** | | **53** | | | |

### 4.7 音频对象 → `AudioRoot` 绑定表（26 个，audio-spec §3.1）

| 用途 | 对象名 | 数量 | 绑定资产 | audioType | playMode |
|---|---|---|---|---|---|
| BGM 常态 | `BGM_P1_Normal` | 1 | `bgm_p1_normal.mp3` | `BGM` | `INFINITE` |
| BGM 暴怒 | `BGM_P2_Enrage` | 1 | `bgm_p2_enrage.mp3` | `BGM` | `INFINITE` |
| 命中·轻击池 | `Sfx_Hit_L1..L4` | 4 | `sfx_hit_light_1..4.mp3` | `AUDIO_EFFECT` | `ONCE` |
| 命中·重击池 | `Sfx_Hit_H1..H3` | 3 | `sfx_hit_heavy_1..3.mp3` | `AUDIO_EFFECT` | `ONCE` |
| 开火池 | `Sfx_Gun_1..3` | 3 | `sfx_gun_shoot_1..3.mp3` | `AUDIO_EFFECT` | `ONCE` |
| 唯一音效 | `Sfx_<Name>` | 14 | land/roar/surrender/taunt/result_lose/result_win/gun_empty/gun_reload/shieldbreak/crosshair/lock/click/phase_switch/combo_up | `AUDIO_EFFECT` | `ONCE` |
| **合计** | | **26** | | | |

> **构建时以 `assets/audio/audio.json` 为准**（audio-synth 交付）：每条带 `usage` 字段写明**触发条件**（已按 v2 口径：`ui_lock` = 命中态首次成立 0.5±0.17 视口窗 + 0.4s 去抖；`gun_shoot` = 按住期间 250ms 闸门节流），导入时可直接读，不必回翻 spec。
> **audio-synth 交付的 5 条铁律（接入前必读）**：① 必须建满 **26 个 `AudioComponent`**（少一个连击阶梯即退化）；② **禁同帧 `stop()`+`play()` 同一组件**（引擎塌陷成空操作），BGM 硬切必须 stop A / play **B** 两个对象；③ 命中与开火同帧 → **先 `playShoot()` 再 `playHit()`**；④ `onInit` 后必做**预热播放**（`volume=0` 各 `play()` 一次）；⑤ 全局静音 = 遍历 26 组件设 `volume=0`（`mute` 运行时不可改），恢复回**原值**。上述均已在 §2.3 落地。

---

## 五、构建步骤（MCP 操作序列）

> **⚠️ 第 0 步是硬闸门，未获用户对方案的明确确认前，禁止执行第 1 步及之后任何改工程/生成资产的动作**（MCP 用户确认闸门，tech-spec §4 / node-plan §8.2）。

| 步 | 动作 | 可 MCP 自动化 / 必须 GUI 人工 | 验证点 |
|---|---|---|---|
| **0** | **用户确认本方案**（闸门）→ 之后 `save_plan(confirmed)` | **必须 GUI 人工**（用户确认） | 用户明确同意；方可落工程 |
| 1 | 确认现状与预览输入：`get_scene` / `list_resources` / `list_preview_videos`；切到 `face` 预览视频 | ✅ MCP | 拿到当前场景树 / 资源清单 / 可用 tracking 类型 |
| **1.5** | **关键路径：粒子 `hasFloatKey` 实探** —— 脚本枚举 `asset.hasFloatKey(name)` 打日志（或 `query_knowledge` 查 Basic Particles 暴露 key） | ✅ MCP | 日志确认是否存在发射率键、键名是什么 → 决定 §2.2 降级杠杆 ②/③ |
| 2 | 资产准备：`generate_assets_batch` 出**占位**像素资产 → `import_resource` 导入 → `set_resource_properties` 设 Nearest/Size512/Clamp/压缩 | ✅ MCP（占位）；**正式像素素材必须 GUI 人工**（手绘/版权/SOURCES.md 登记） | 每张 `filterMin/Mag=Nearest`、`Max Resolution=512`、`enableMipmap=false`；单张 `artifactFileSize` 记录 |
| **2.5** | **O-08 序列帧体积单样本判据（★ 已预验 → 现为「可选复核 / 复测保险」）**：取**最复杂**一张序列帧（`anm_enrage_intro` 满细节帧）→ 在【压缩开启 + `Max Resolution=Size512` + `filterMin/Mag=Nearest`】下读该文件 **`artifactFileSize`**（⚠️ 未开压缩读到的是 ≈1MiB/张的**显存**体积，对包体判定**无意义**） | ✅ MCP | **O-08 单样本已判过**（#13：真·DB16 硬边 128 逻辑帧 **3.2–3.6 KB/帧 ≪ 26.8**，余量 7.4×；对照 AI 插画直导 **73.9 KB/帧**破线）。**复测保险**：工程重开、资产**重新导入后顺手复测这 1 张**（原测在工程崩溃之前、资产导入状态经历过一次中断）。**判据生效规则**：① 复测与记录不符 → **以复测为准**；② 无法复测（资产未导入）→ 单样本维持"已过"，**但不替代提审前全量 `Σ`(53 帧) 门禁** |
| 3 | 搭骨架：**先建 AR 追踪链**（`AR Plane`/`ARTracking` 组 + `AR Camera` + `DeviceTracker`，`trackingMode=World`）→ `edit_by_dsl` 建 `ContentRoot` → L2~L6 六层 + `AudioRoot` + `StatePages` 独立父对象 → `get_scene` 核对收敛 | ✅ MCP | **顶层渲染层 ≤6**；`ARTracking`/`ContentRoot`/`AudioRoot` 不计入 6 层；`AR Camera` 可被 `scene.findSceneObject('AR摄像机')` 解析到 |
| 4 | 接入资产：逐项 bind（§四 清单）→ `get_scene`/属性校验 | ✅ MCP | GUID/尺寸/采样/层级正确；`WhiteFlashMask` 与 `BossBody` 同尺寸同锚点 |
| 5 | 脚本创建/编辑：`edit_by_dsl(add_script/edit_script)` 写 11 个脚本 | ✅ MCP | 脚本落盘；类名/接口与 §2.0 一致 |
| 6 | 编译校验：`run_otsc_check` | ✅ MCP | **零编译错误** |
| 7 | 运行日志：`get_script_logs` | ✅ MCP | `[guard]`/`[audio]` 打点正常；无 `[audio] missing` |
| 8 | 关键链路：接通"开拍→**触摸按下开火**→**AR 视口容差命中(0.17)**→掉血→反馈" → **PC 预览须长按 ≥7s**（无 SLAM 约 4s 收敛）→ `capture_preview` 截图 / `interact_by_dsl` 模拟触摸时序 | ✅ MCP | 命中反馈同帧链生效；粒子 ≤50；血条步进正确；**注**：PC 预览 2s 内全 miss 属预期，不代表链路坏 |
| 9 | 补全：Boss 阶段 / 假死 / 结算页 / 重开 RESET / 音效 / BGM 切换 → 再 `capture_preview` | ✅ MCP | 阶段 1s 内可感知；假死两分支可触发；RESET 回初始态 |
| 10 | 最终预览验证：`reset_preview` → 分时 `screenshot` | ✅ MCP | 全部验收走查（§八 自检表） |
| 11 | **真机预览**（含 **头像选择器交互**、端到端音频延迟、MP3 循环接缝实测） | **必须 GUI 人工** | 见 §六 待实测 |
| 12 | **编译打包 / 提审**（提醒用户在像塑内保存工程） | **必须 GUI 人工** | 包体 ≤2MB（实测 Σ artifactFileSize） |

> **★ O-08 门禁（提审前必做，最易漏）**：读 **`Σ artifactFileSize`，且必须含全部 53 个序列帧文件**——**不能只测那 37 张静态贴图**。**单样本判据已判过**（§五 步 2.5：DB16 硬边 3.2–3.6 KB/帧 ≪ 26.8，余量 7.4×），并保留**「复测保险」**（重开后资产重导入顺手复测 1 张，不符以复测为准）；**提审前的全量 `Σ`(53 帧) 门禁不可省**。
> **阈值分母 = 53（team-lead 已裁定，勿改）**：单帧上界 = `(2048 − 275 − 349) ÷ 53 = 26.8 KB`。**不可按 47 身体帧算**——`1424 ÷ 47 = 30.3 KB` 隐含"小怪 4 + 枪口 2 这 6 个文件体积为 0"，按 30.3 KB 放行会 `30.3×53 + 624 = 2230 KB > 2048` **反而破线**。53 与 `tech-spec §3.2.1` / QA 清单 O-08 行两处一致。
> **砍序（已与上游对齐，勿乱序）**：① `animation-spec §二` 帧取舍 → ② `art-spec §六` 张数护栏 / 降 `Max Resolution` → ③ `audio-spec §5.2` 砍音频（**音频最后**，别先砍音频）。

---

## 六、待实测项汇总与阻塞标注

> 每项**必须有退路**，不能只写"待实测"。依据列见括号。

| # | 待实测项 | 依据 | 方法 | 若失败 → 降级/退路 | 影响等级 |
|---|---|---|---|---|---|
| 1 | `AnimatedTexture.playMode` 是否含 `ClampForever` | animation-spec §5.3、node-plan §7 第 1 项 | 阶段 6/8 `run_otsc_check` + 预览验证 | 三处"保持"态（SHIELD/FEIGN/DEFEAT_HOLD）改：序列帧播 Once 后**隐藏序列帧、显末帧静态 `Image`** | 中（有备选） |
| 2 | Basic Particles 发射率键名（是否有 `rate`） | node-plan §4 决策 4、vfx-spec §3.4 | **落工程第一步（§五步 1.5）** `hasFloatKey` 实探 | 无该键 → 降级杠杆改用 `setEnabledInHierarchy(false)` / 调 `Lifetime`（**硬保证仍来自 `stop(StopEmitting)`**） | 低（有退路） |
| 3 | 头像选择器交互与头顶贴合（尺寸/清晰度） | §2.5、art-spec §3.2/§3.3 | 真机走一遍 `PICK_AVATAR`（6 tile 点选 + 开始 + 3s 兜底） | 未选/超时 → 默认头像 `avatar_01_16`；**任何路径不阻断进局**；**首次交互后倒计时取消**（防 2.8s 选完被 3.0s 默认覆盖） | 低（有退路） |
| 4 | ~~陀螺仪 `GyroSensorAgent`（@alpha）~~ | node-plan §7 第 5 项、tech-spec §1 | — | **v2 不采用**：设备朝向改由官方 `DeviceTracker` 承担（已实测）；不再触碰 `@alpha` | 已关闭 |
| 5 | 端到端音频延迟（touch→出声） | audio-spec §10.2 ①（最坏 ≈98ms） | 真机录屏画音同轨，测 10 次取最坏；**同时确认像塑解码是否认 Xing/Info 头** | 按序降级：①开火音触摸帧触发 ②预热播放（均已含） ③命中音改"开火帧预测触发"；仍超标 → **上报 team-lead 作阻塞项** | **高（可能阻塞）** |
| 5b | **MP3 固有时延记账**（audio-synth 实测） | audio-synth 交付说明、audio-spec §7.4 | 真机确认像塑解码**是否认 Xing/Info（LAME gapless）头** | **44100Hz → 固有延迟 25.06ms（1105 samples）**（原 spec 假设 13–25ms 偏乐观）；26 文件**均已写 Xing/Info 头**：**认 → 25ms 可裁掉；不认 → 必须按 +25ms 记账**。生成侧无法验证，只能真机实测 | **高（§7.4 头号风险）** |
| 6 | MP3 在 `playMode=INFINITE` 下的循环接缝 | audio-spec §10.2 ③ | 连续录 60s 标记循环边界 | 资产层"尾不越界+首拍强起"缓解；仍明显 → 改程序化生成无缝循环（脚本合成 PCM→MP3） | 中 |
| 7 | 26 音频对象是否占 ≤6 视觉图层预算 | audio-spec §10.2 ④ | `get_scene` 看音频对象 render group 归属 | 推测不占（`renderGroupType=Utility/Music`）；**若占层 → 全部挂到一个父对象下**（需柯桥良确认收口） | 中 |
| 8 | 动真 Camera 是否影响摄像头透传 | node-plan §7 第 6 项 | 对照实验（偏移虚拟 Camera vs `ContentRoot`） | **已选安全路径**（偏移 `ContentRoot`）；此项仅冗余确认 | 极低 |
| 9 | "序列帧 ≤24 帧"：**单动作** vs **全特效总量** | animation-spec §1.4/§十-1、game-design §12 需求 3 | 柯桥良实测收口 | 若为全局上限 → 退回"极限版 ≈48 帧"或更激进 Tween 化；**本方案默认"单动作 ≤24"（最大 12 帧）** | **高（可能返工）** |
| 10 | `getSlamInfo().planeDetected` / `DeviceTracker` 模式可用性 | node-plan §7 第 3 项、tech-spec §1 | 最小脚本打印 `trackingMode`/`planeDetected` → 真机 | **v2 主方案依赖** AR Plane/DeviceTracker（世界锚定）；若 `World` 模式不稳 → 降级 `Surface`/`Orientation`（3DoF，方向可控但无 6DoF 位移） | 中 |
| 10b | **AR 相机真机跟手性（SLAM）** | tech-spec §1 待实测、README §八 | **真机**转手机看 Boss 是否实时滑入准星 | **PC 预览无 SLAM（约 4s 收敛），不作手感判据**；若真机也漂 → 检查 `DeviceTracker.trackingMode` 与锚点 | 中 |
| 10c | **`worldToViewportPoint` 坐标约定**（原点/归一化） | tech-spec §2.7 | 最小脚本打印 `vp` 与已知 `worldPos` 对表 | 已实测 `vp.y≈0.522` ∈(0,1) 证归一化；若某版本返回像素 → 判定式改为像素中心比较 | 低 |
| 11 | `hitstop` 是否影响音频播放速率/音高 | audio-spec §10.2 ② | 最小脚本设 `timeScale=0.5` 后播音听是否变调 | 本方案 hitstop **本就不动全局时间**（走 `AnimatedTextureProvider.pause()`）；若实测有影响则确认该路径正确 | 低 |
| 12 | 宿主是否暴露分享/保存能力 | tech-spec §1、game-design §9 | 预览录制流程观察 + 查官方文档 | 只做**结算画面 + "长按保存/分享"提示文案**；**不伪造分享按钮**、不调分享 SDK | 低 |
| 13 | `mute` 属性运行时可否修改 | audio-spec §10.2 ⑥ | 脚本改 `mute` 看是否生效 | 若不可 → "全局静音"走脚本 `volume=0` | 低 |
| 14 | `generate_audio` 输出实际时长/响度/ID3 | audio-spec §10.2 ⑤ | 生成 1 条实测 `duration` + 文件大小 | 时长偏差 → 复核音频体积核算；响度归一 → 逐条离线降增益到目标峰值 | 中 |
| 15 | 纹理压缩后是否出现像素块状伪影 | node-plan §5 待观察 | 开压缩后拿一张对比 `artifactFileSize` 与观感 | 保像素观感优先 → 靠尺寸/张数控体（不关压缩） | 中 |
| 16 | **O-08：序列帧体积落在哪档** | tech-spec §3.2.1、art-spec §6 | **§五步 2.5**（现为可选复核）：1 张最复杂帧读 `artifactFileSize`（压缩+Size512+Nearest）；重开后复测 1 张 | **✅ 已解除阻塞（#13）**：真·DB16 硬边 128 逻辑帧 **3.2–3.6 KB/帧 ≪ 26.8**（余量 7.4×）；AI 插画直导 73.9 KB/帧破线 → 序列帧**须走程序化 DB16 硬边**。**复测保险**：不符以复测为准；无法复测则维持"已过"。提审前全量 `Σ`(53 帧) 门禁不变 | **高 → 已解除** |

**✅ 已定稿（game-design-director v1.3 拍板，此前的 4 个设计缺口全部关闭）**：
1. **射速口径** → **闸门 = 250ms（严格 4 发/秒）**，不再用 220ms；`FIRE_INTERVAL_MS=250`（区间 240–280）。伤害锚点：30×80=2400，纯射 ~7.5s。（§2.1.2）
2. **护盾破盾机制** → 用**盾量百分比**而非计数：`SHIELD_CORE_DMG=0.34`（核心点 −34%/发，30%–40% 可调）、`SHIELD_BODY_DMG=0.06`（身体 −6%/发，5%–8% 可调）；**普通命中不重置进度**；蓝盾条即进度。（§2.1.5）
3. **破盾/回盾** → `MAX_SHIELD_ROUNDS=2`，破盾后 2s 全额窗口；**第 2 轮窗口后盾永久消失**，余血走假死。（§2.1.5）
4. **护盾期 HP 语义** → **HP 冻结**（采纳美术方案，作废原"20% 伤害"）；护盾为独立盾量层；破盾后窗口内 HP 才下降。（§2.1.4/§2.1.5）

> 其余数值（HP 2400、单发 80、核心/暴击 120、弹匣 12、换弹 1.0s、时限 40s、阶段阈值 66%/33%、假死 HP 15%）维持不变。设计层已完全闭合。

---

## 七、与上游的一致性核对表（自检）

> 逐条列"上游要求 → 我的实现如何满足"。

| # | 上游要求 | 依据 | 我的实现 | 满足 |
|---|---|---|---|---|
| 1 | **图层 ≤6** | tech-spec §2.2、node-plan §1 | L1–L6 六层；`ContentRoot`/`AudioRoot` 为变换父节点不计层；L1 留空作降级牺牲位 | ✅ |
| 2 | **粒子 ≤50** | vfx-spec §3.4、node-plan §4 决策 4 | `VfxBudgetGuard`：>50 硬停 `stop(StopEmitting)` / >46 阶梯削 / <40 回滞恢复；降级阶梯见 §2.2 | ✅ |
| 3 | **包体 ≤2MB** | tech-spec §3.2/§3.2.1、art-spec §6、anim §11.6 | 贴图 ≈0.275MB + 序列帧（含 53 文件）≈0.83MB + 音频 ≈0.34MB ≪ 2MB；**判定链路**：O-08 单样本**已判过**（§五步 2.5，DB16 硬边 3.2–3.6 KB/帧 ≪ 26.8），重开后**复测保险**，提审前**全量门禁 `Σ artifactFileSize`（含 53 序列帧文件）** | ✅（前提：开压缩 + Size512） |
| 4 | **触发恰 2 种** | game-design §二、§十一 | ① 触摸**按下/抬起**=开火（`ShootHandler`）② 人脸事件=重击（`FACE_HEAVY_STRIKE_ENABLED` 开关，可砍）；**AR 相机朝向（转手机）属操控输入、不计额度**；人脸挂点属载体不计额度 | ✅ |
| 5 | **布局安全区** | game-design §3.3、art-spec §8-9 | 血条 Y≥+348；**准星 = 屏幕正中 (0,0)（固定）**；**开火 = 全屏任意按下**；换弹按钮 Y[-350,-250]；按钮中心 Y≥-220；**无元素进 y≥0.86 禁区** | ✅ |
| 6 | **去暴力化** | game-design §4.4、vfx-spec §7、audio-spec §6 | 无血/无伤口/无碎片/无惨叫；命中只闪白+抖动+像素星（白/黄）；终结=彩带+星+认输；文案"放倒/认输/它跑掉了"；音频零人声 | ✅ |
| 7 | **默认不挂他人头像** | game-design §6.1 | `AvatarPicker`：**内置预设头像（6 选 1）**；未选/超时 → `avatar_01_16`；**3s 超时自动进局不阻断**；**无外部内容、无授权话术**（§2.5） | ✅ |
| 8 | **状态重置** | node-plan §3.1、tech-spec §2.6 | `GameFlowController.resetRun()` 在开拍/录制开始先恢复初始态（HP/combo/ammo/统计/音频/粒子/震动全归零） | ✅ |
| 9 | **Boss 画布 128×128 ×4=512** | art-spec §〇裁定 2 | 全部 Boss 资产按 128 逻辑 ×4 = 512；非 2 幂用"≤512 最大整数倍" | ✅ |
| 10 | **DB16 16 色 / 无羽化** | art-spec §5.3 | 白闪用 `#deeed6`（非 `#ffffff`）；粒子只用 `#deeed6`/`#dad45e`；alpha 仅 0/255（素材侧验收） | ✅ |
| 11 | **Nearest / 禁非整数缩放** | node-plan §5 | 每张导入 `filterMin/Mag=Nearest`、`Max Resolution=Size512`；显示只用 1/2^n 或整数倍；位移全整数 px | ✅ |
| 12 | **序列帧单动作 ≤24** | game-design §12 需求 3 | 最大单动作 12 帧（DEFEAT_SURRENDER）；**口径待实测收口（§六-9）** | ✅（默认口径） |
| 13 | **hitstop 不冻 L4** | node-plan §4 决策 2、vfx §6.1 | `setBossAnimPause` 只冻结 Boss 动画 + 屏蔽输入；`VfxBudgetGuard`/`DamageNumberPool` 的 `onUpdate` 照常跑 | ✅ |
| 14 | **震动：单点（ContentRoot）+ 禁动真 Camera** | node-plan §4 决策 3、tech-spec §2.8 | **单点** `ContentRoot.ScreenTransform.anchoredPosition`（v2.2 已删 Boss 抖动路①）；**`AR Camera` 零平移**；幅度按 **Boss 世界高比例 k 表**，单帧 ≤3% 世界高、只平移不旋转、新震覆盖不叠加；**⚠️ 条件性**：依赖 2D→3D 父子传导（未实测，真机 A/B 判"不跟随"则恢复 Boss 世界抖动，§2.4） | ✅（条件） |
| 15 | **禁 `ParticleEmitter2D`** | node-plan §4 决策 1、vfx §4.1 | 全部粒子走 Basic Particles + 换 `MainTexture`（顺序 `stop→setTexture→play`） | ✅ |
| 16 | **VFX 与 Image 互斥** | node-plan §4 决策 1 | `TexHolder` 为独立隐藏 Screen Image，不与发射器同对象 | ✅ |
| 17 | **音频 1 资产 1 对象** | audio-spec §0 结论 ② | 26 个音频对象；无运行时换绑；轮转 `play()` | ✅ |
| 18 | **BGM 用 INFINITE 不用 loopCount=-1** | audio-spec §10.1 第 3 条 | BGM `playMode=INFINITE` | ✅ |
| 19 | **禁同帧 stop+play** | audio-spec §10.1 第 6 条 | SFX 只 `play()` alone；BGM 切换分帧 | ✅ |
| 20 | **无服务器依赖 / 无外链** | game-design §9、§十-12 | 整局离线；分享只做结算画面 + 提示文案 | ✅ |
| 21 | **命中反馈同帧链** | vfx-spec §8 | `onHit()` 同调用栈内顺序执行②~⑦，不排帧 | ✅ |
| 22 | **HURT 不进状态机** | node-plan §3.3 修正①、animation §4.3 | `hitFeedback()` 只改白闪/抖动/冻结，禁 `reset()/play()/换 texture` | ✅ |
| 23 | **AR 空间锚定 + 居中固定准星** | game-design §3、tech-spec §2.1/§2.7 | Boss 为 3D `ImageEntity` 世界锚定；`ARTracking` 组（`AR Camera`+`DeviceTracker`）渲染；准星固定屏幕正中不接 Touch；命中 = `worldToViewportPoint` 容差 0.17（§2.1.1） | ✅ |
| 24 | **PC 预览无 SLAM 的验收口径** | README §八、submit-checklist | PC 预览测命中**长按 ≥7s**（约 4s 收敛）；真机转手机验跟手；文档明写避免误判 | ✅ |

---

## 八、技术债与风险

### 8.1 技术债（已知，非阻塞）

| # | 技术债 | 说明 | 后续优化 |
|---|---|---|---|
| 1 | 粒子运动非像素步进 | Basic Particles 运动是连续插值，做不到"逐整数像素跳格"（vfx-spec §4.2 诚实边界） | 终审若要求 → 该发射器改 `VFXAuthoring`（自定义 shader 量化运动）；MVP 不做 |
| 2 | 伤害数字用系统字体/数字图集混合 | 中文走系统字体、数字走 `fx_num_atlas` | 若要求全像素 → 自造 0–9 字模 |
| 3 | `ShootHandler` 兼武器表现 | 枪口闪光/准星/枪贴图合并进 ShootHandler（一人开发省拆碎） | 迭代可拆 `WeaponView` |
| 4 | 结算卡运行时合成 | 非单张贴图，逐元素排版 | 若布局复杂 → 预烤模板 |
| 5 | 单 Boss / 单皮肤 | MVP 1 款 | 迭代 +2 皮肤（火山/机器款） |

### 8.2 风险清单（含责任）

| # | 风险 | 影响 | 缓解 | 责任 |
|---|---|---|---|---|
| 1 | 端到端音频延迟超标 | 手感"发飘"（乐趣来源第 1 位） | 预热 + 开火音触摸帧触发 + 降级预案；仍超标上报阻塞 | 主程序（我） |
| 2 | 序列帧 24 帧口径被收为"全局" | 66/47 帧不合规，需返工极限版 | 已备"≈48 帧极限版"降帧序；先按"单动作"落地 | 柯桥良收口 + 我 |
| 3 | 纹理未压缩 → 包体爆 2MB | 提审失败 | 开压缩 + Size512；**逐张校验 `artifactFileSize`（含 53 序列帧）**；O-08 单样本已判过（DB16 硬边 3.2–3.6 KB/帧） | 我（门禁）+ 柯桥良 |
| 4 | 26 音频对象占层 | 可能破 ≤6 图层 | 统一挂 `AudioRoot`；待实测 ④ 收口 | 柯桥良确认 |
| 5 | BGM 与用户音乐冲突 | 用户划走 | 低姿态混音 + `mute` 开关 + "关音乐"入口；**BGM 是音频第一可砍项** | 产品（team-lead/游有方） |
| 6 | ~~护盾破盾次数/回盾未定~~ **已定稿** | — | v1.3 定：盾量百分比（核心点 −34%/发、身体 −6%/发）、回盾上限 2 轮、假死 HP 15% | 已关闭 |
| 7 | ~~上游护盾血条语义分歧~~ **已定稿** | — | v1.3 定：**护盾期 HP 冻结**（采纳美术方案），护盾=独立盾量层，破盾窗口内 HP 才降 | 已关闭 |
| 8 | **PC 预览无 SLAM → 命中测试误判** | 测试者把"打不中"当 bug | `README §八` + `submit-checklist` 明写：PC 预览长按 ≥7s；真机验跟手 | 我（文档）+ QA |
| 9 | **3D Boss 透视缩放 → 像素抖动（shimmer）** | 观感（非阻断） | 素材 Size512+Nearest、锚点距离适中；**不做**抗锯齿补偿（tech-spec §6-10） | 美术 + 我 |
| 10 | **`DeviceTracker` 模式/真机跟手性未在真机验** | 若 `World` 不稳则手感差 | §六-10/10b 真机实测；兜底降级 `Surface`/`Orientation` | 我 + 柯桥良 |
| 11 | ~~单发伤害口径不一致（doc 80 vs 代码 24）~~ **已关闭** | — | **裁定：权威值 = 80**（单一来源 `game-design §五` L136）；原型 24 为测试占位、已废弃，实现侧按 80 回填。依据 TTK 反推（30 发 @4 发/s + 2 次换弹 → ≈9.5s，合设计案「熟练 10–20s」；40s 只需 ≈19% 命中率） | team-lead（已裁定） |

### 8.3 已消解的上下游矛盾（如实记录，供团队回看）

1. **导出倍率 96 基准不成立**：art-spec §〇裁定 1 已裁决为非 2 幂取"≤512 最大整数倍"；Boss 画布最终定 **128×128**（裁定 2）。三人（美术/动画/技术）口径已统一。
2. **阶段阈值 50% vs 66%**：node-plan §3.3 修正②已作废 50%，以设计案 66%/33% 为准 —— 我的实现统一按 66%/33%/≈15%/0。
3. **`HURT` 是否进状态机**：node-plan §3.3 修正① + animation §4.3 已定"不进状态机，走叠加函数" —— 我的 `BossAnimPlayer.hitFeedback()` 据此实现。
4. **击杀演出模板**：vfx §4.3 已否掉 Firework/Explosion，改用 Basic ×2（彩带 20 + 星 8 = 28 ≤30）—— 我的 `emitVictory()` 据此实现。
5. **相框/枪尺寸小差异**：animation-spec §2.3 曾写 head_frame 64×64、gun 128×128；**art-spec 为资产权威**（head_frame 24×32、gun 128×64）—— 绑定表按 art-spec 执行（§四）。
6. **护盾期 HP 语义（设计案"20% 伤害" vs 美术"盾清空才降血"）**：设计案 v1.3 已**采纳美术方案**——护盾期 HP 冻结、护盾为独立盾量层、破盾窗口内 HP 才下降。我的 §2.1.1/§2.1.4/§2.1.5 已据此更新，此前的实现建议（HP 降 20%）作废。
7. **瞄准范式 v1→v2（屏幕空间触控瞄准 → AR 空间锚定）**：上游已切换为 **AR 空间锚定 + 屏幕正中固定准星 + 转手机瞄准**（`game-design §3`、`tech-spec §2.7`）。**v1 的"手指拖准星 / 2D 矩形命中 / 吸附系数 F / `isScreenPointOnImage`"全部作废**；本文件 §2.1.1 重写为 `worldToViewportPoint` 视口容差 0.17。**本次只动瞄准/命中链路，伤害/护盾/阶段/音频/粒子机制不变。**
8. **头像方案 v1→v2（用户选图 → 内置预设选择器 6 选 1）**：原「相册选图 + `Image Picker (Head)` 自动抠头」口径 `game-design §6.2` 原文已作废；依据本机实测（2026-10-13）：`Image Picker`/`(Head)` 等场景对象与 `user_uploaded_image_texture_asset` 资源在本版像塑均报 `Unknown scene/resource config id`，APJS `.d.ts` 无 picker/album/photo API ⇒ **平台无「用户选图」能力**，用户拍板改**内置预设像素头像（6 选 1）**。**连带作废**：art-spec §3.2「抠图→像素化」段、§2.1.6 旧稿的授权话术与权限兜底态。**合规红线由「已缓解」升级为「已消除」**（头像是内置素材、无外部内容）。完整规格见 §2.5；**产品取舍**：社交钩子（好友的脸）弱化，用户知情。上游清扫由 doc-sync 处理。

---

## 九、交付物与下一步

- **本文件**：`implement-plan.md`（本地纯文档，不受 MCP 闸门限制）。
- **下一步（需用户确认后才可执行）**：进入 §五 构建步骤，**第 0 步用户确认闸门** → 第 1.5 步粒子 `hasFloatKey` 实探 → 步 2 资产导入 → **步 2.5 O-08 序列帧体积复测保险（单样本已判过，重开后顺手复测 1 张）**。
- **本阶段未触碰任何 MCP 工具、未修改任何工程文件**（遵守用户确认闸门）。

—— 主程序 / 寇豆码（Phase 3 实现方案与资产整合）
