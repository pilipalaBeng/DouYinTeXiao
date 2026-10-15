# ar-boss-raid · 验收与提审准备清单（QA / 严过关 · 首轮）

> 验收对象：抖音 AR 像素 Boss 战互动特效（slug: `ar-boss-raid`）Phase 1–3 全部交付物（8 份上游文档）  
> 出口：抖音特效开放平台（像塑 / Effect House）**提审准备包**（非已过审上架包）  
> 规则优先级：**合规 > 平台边界 > 像素规格 > 其他**  
> 版本：**v1.4**（首轮验收之定向修订；仍无上一轮缺陷，故不套用复签结构）。v1.1 = 针对 audio-director（雷鸣远）peer review 的定向修订；v1.2 = 针对 tech-architect（柯桥良）**包体口径勘误**的定向修订（1.45 MB 是中值非达标线）；**v1.3 = 口径收口批**（关闭 O-09/D-01、D-03~D-06、O-16~O-19）；**v1.4 = 并入音频独立自验、AR 空间锚定真机项（O-20/O-21）、头像来源双轨（相册 `Image Picker` 路径废止）**。**均为定向修订、非新一轮复签**，逐条改动见文末「修订记录」。  
> **hitstop 期望值单一来源（本版新增）**：本项目命中反馈类 hitstop 一律以 **`vfx-spec` §6.1（v1.2b）** 为权威口径 = **普通命中 50ms / 暴击·破盾核心 67ms / 破盾成功 83ms / 击杀 0ms**（60fps 整数帧；`animation-spec` v1.5 的 `hitstopMs` 同源）。本文所有用例/清单以该表为准，任何"40ms"均为旧值已废弃。  
> **★ v2 变更（AR 空间锚定，doc-sync 同步）**：本清单同步 v1→v2 瞄准口径 —— ① `PLY-04` 由「吸附 A/B 对照」改为 **「AR 瞄准可达性」（仅转手机即可命中态成立）**；② `TC-F-01` 由「点按」改为 **「按住屏幕（命中态）」**；③ 边界 `220ms` → **闸门收口 `250ms`**（登记号 `D-04`/`O-16`，原 `O-02` 引用为**错 ID**已纠正）；④ `INT-10` 三处外部引用**已复核仍有效**（像塑 `scene-game.md` / `Touch/SKILL.md` / `validation.md`）。**数值（HP 2400 / 单发 80 / 40s / 66%·33%·15% / hitstop 四档）一律未动。**
> **★ v1.4 变更（本版新增）**：① **头像来源改「双轨」** —— 旧「相册选图 `Image Picker`」路径对本版**不可用、已废止**（本版编辑器创建该对象报 `Unknown scene object config id`；`APJS.d.ts` 全文 `grep -i picker` = **0**）；现行 = **轨 A 预设 6 选 1（本轮必做/默认兜底）** + **轨 B 摄像头取像（真机未验，不阻断提审）**（依据 `tech-spec §9` / `game-design §6.2`）。② **AR 空间锚定真机项入表**：**O-20**（`ContentRoot`→3D Boss 传导 A/B）与 **O-21**（真机 SLAM 跟手性）—— **真机同批上机**。③ **音频客观自验并入**（`tools/verify_audio.py` 独立复跑 **24/24**）。④ 口径收口批（v1.3）重放：**O-09/D-01 关闭**（`AGENTS.md:55` 明写"单条序列帧 = 一个动作 clip ≤24"）、**D-03/D-04/D-05/D-06 关闭**、**O-16~O-19 关闭**。    
> **当前工程状态：方案已就绪、工程未开始**（像塑 MCP 用户确认闸门未开，未执行任何改工程/生成资产动作）。本清单的验收对象是**方案与规格层**，不是运行态。  
> 本轮我**未调用任何 MCP 工具、未修改任何工程文件**；全部核查为本机只读命令（详见 §〇）。  
> 下游：完整报告回传 team-lead。

---

## 〇、取证纪律执行摘要（首轮）


### 0.1 上游结论逐条复算（采信矩阵）

我把上游 8 份文档中**最有承重作用**的结论逐条拆成「**事实**」与「**归因**」两格复算。① 列 = 我本机实际执行的命令；② 列 = 命令原始输出摘要；③ 列 = 判定。**上游给出的可本机复核证据（规则/SKILL/schema/类型定义在本机像塑资源目录下真实存在）已逐条跑过**。

> 复核根目录（本机实存，`ls` 已确认）：`D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\McpTool\resources\`  
> 其中 `workspace/rules`、`skills/`、`knowledge/schemas`、`workspace/APJS/*.d.ts` 均在。

| #  | 上游结论（来源）                                                                                                                               | ① 我实际执行的命令                                                                                                                                    | ② 本机跑出的原始输出（摘要）                                                                                                                                                                                                                                                                         | ③ 采信判定                       | 事实 / 归因 拆分                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | 摄像头透传是平台底层；AR 玩法**禁止**整屏背景/蒙层覆盖摄像头（tech-spec §0.1、§1；game-design §3）                                                                   | `grep -n "透传\|整屏\|蒙层" workspace/rules/scene-common.md`                                                                                        | line18：「保留摄像头透传的 2D 游戏…或依赖真实环境的 AR 叠加玩法 **禁止用全屏背景图、整屏场景板、整屏装饰层或整屏蒙层覆盖摄像头**」                                                                                                                                                                                                             | **采信·复现**                    | 事实 ✅（规则原文）。归因「**6 层预算里没有摄像头层**」：规则只把摄像头列为「底层」，**未**明写"不占用户图层"；"≤6 层"本身是宪法级（AGENTS.md §三），非平台条款 → **归因属推断，标注为合理推断但非平台原文**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2  | 安全区 = X[-340,+260]、Y[-400,+500]（tech-spec §3.3；game-design §3.3）                                                                       | `grep -n "340\|260\|400\|500" workspace/rules/scene-game.md`                                                                                  | line4：「主操作区默认放在安全区 X [-340,+260]、Y [-400,+500] 内」；line6「上述范围用于 720x1280、以屏幕中心为原点」                                                                                                                                                                                                       | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3  | 底部约 180px 录制按钮禁区、`y≥0.86` 不安全（game-design §3.3）                                                                                        | `grep -n "0\.86\|180" skills/ability/Touch/SKILL.md skills/general/PreviewInteraction/SKILL.md`                                               | Touch/SKILL.md:40：「On a 720x1280 preview, reserve roughly the bottom **180 px**… normalized top-origin touches with **y >= 0.86**, or ScreenTransform-anchored interactive elements with centered **y <= -460**, should be treated as unsafe」                                           | **采信·复现**                    | 事实 ✅，且**证据比上游更强**：规则同时给出「**交互元素中心 y ≤ -460 即不安全**」——此条上游文档未引用，我补入 §一（PX/安全区 AC）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4  | 状态页用**独立父对象**（node-plan §1.1、tech-spec §2.2）                                                                                           | `grep -n "状态页\|独立父" workspace/rules/scene-game.md`                                                                                            | line33：「开始、结算、暂停等状态页使用**独立父对象**，统一承载遮罩、面板、标题和内容」                                                                                                                                                                                                                                        | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5  | 开拍/录制开始 → **先恢复初始状态再启动本轮**（node-plan §3.1、tech-spec §2.6、game-design §8）                                                               | `grep -n "开拍\|录制开始" workspace/rules/scene-game.md`                                                                                            | line38-40：「游戏默认以开拍/录制入口启动，并在开拍时重置初始状态…先恢复初始状态，再启动本轮游戏」                                                                                                                                                                                                                                  | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6  | `AnimatedTexturePlayMode` **无 `ClampForever`** → 三保持态走"末帧静态 Image"退路①（animation-spec §11.7、node-plan §7.1）                             | `grep -n -A8 "AnimatedTexturePlayMode" workspace/APJS/APJS.d.ts` + `grep -rn ClampForever workspace/APJS`                                     | APJS.d.ts:327 `enum AnimatedTexturePlayMode { Forward=0, PingPong=1, Randomize=2, Shuffle=3 }`；`ClampForever=-2` 只在 **`enum AnimationWrapMode`**（APJS.d.ts:544 / APJS_runtime.d.ts:3929），其宿主是 `Animator`（骨骼动画）与 `AnimationState.wrapMode`（@alpha）                                       | **采信·复现**（**事实 + 归因均经独立复核**） | 事实 ✅（枚举只有 4 值）。归因 ✅（`ClampForever` 确属另一枚举 `AnimationWrapMode`/Animator 子系统，本项目不走骨骼路径 → "本路径用不到"成立）。**此条是典型的"事实为真、归因也真"，重跑必过，且我已核到归因层，非只看数字**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7  | 引擎**无全局 `timeScale` / `unscaledDeltaTime`** → hitstop 不靠全局时间（node-plan §1.4、§4 决策 2；vfx-spec §6.1）                                     | `grep -n "timeScale\|timeSpeed\|unscaledDelta" workspace/APJS/APJS.d.ts workspace/APJS/APJS_runtime.d.ts`                                     | 仅命中 `APJS.Physics2D.timeSpeed`(6313/6335) 与 `APJS.Physics3D.timeScale`(6404)，且 6367 注「Global properties (gravity, timeScale) are **not** reset」；**无 `APJS.Time` 类**                                                                                                                     | **采信·复现**                    | 事实 ✅。归因 ✅（二者注释限定物理模拟）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8  | `AudioComponent` 运行时**无 pitch / 无换绑素材 API** → 音高阶梯必须预烘焙（audio-spec §0 结论①②）                                                            | `cat workspace/APJS/AudioComponent.d.ts`                                                                                                      | 只有 `loopCount` / `volume` / `duration`(只读) / `isFinished`(只读) / `play()` / `pause()` / `resume()` / `stop()`；`play()` 注「restarts from the beginning」                                                                                                                                    | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9  | 音频资源**唯一格式 `.mp3`**（audio-spec §5.1）                                                                                                   | `grep -n -A6 ResItemMP3 knowledge/schemas/resource_type_schemas.json`                                                                         | `"ResItemMP3": { "extnames": [".mp3"] }`（line1779-1785）                                                                                                                                                                                                                                 | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10 | SFX 一律 `play()` alone，**禁同帧 `stop()`+`play()`**（audio-spec §0②、§10.1-6）                                                                | `grep -n -i "rapid\|stop.*play" skills/ability/Audio/SKILL.md`                                                                                | :134-153「Rapid-fire SFX…**call `play()` alone**…Do NOT `stop()` then `play()` in the same frame. The engine collapses the queued stop-then-play pair into "do nothing"」                                                                                                                 | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11 | BGM 用 `playMode=Infinity`，**禁 `loopCount=-1`**（audio-spec §10.1-3）                                                                     | 同上 grep                                                                                                                                       | :272「Use `playMode: "Infinity"` via DSL for BGM infinite loop — **do NOT use `loopCount = -1`**」                                                                                                                                                                                        | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12 | **音频验收以脚本日志为准**（截图/MP4 不证明音频）（audio-spec §9-10）                                                                                        | 同上 grep                                                                                                                                       | :10「Acceptance rule: treat **script logs as the source of truth**…Preview screenshot / MP4 paths are for visual proof, **not reliable audio acceptance**」                                                                                                                               | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13 | `ParticleEmitter2D` 是 **2D 流体**组件，非火花/碎片/星星通用发射器 → 本项目禁用（node-plan §4 决策1、vfx-spec §4.1）                                               | `grep -n -i "ParticleEmitter2D\|fluid" skills/ability/VFX/SKILL.md`                                                                           | :258「2D fluid simulation for flowing or pooled liquids…it is **not a general-purpose emitter for smoke, sparks, or debris**」                                                                                                                                                            | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 14 | Basic Particles 可调参数只有 `Lifetime/Min/Max/MainTexture`，**无 `rate` 浮点键** → 降级杠杆不得写死 `setFloat("rate",…)`（node-plan §4 决策4、vfx-spec §3.4） | `sed -n '198,225p' skills/ability/VFX/SKILL.md`                                                                                               | 注释「// Basic Particles — available parameters:」下仅 `setFloat("Lifetime")`、`setVector("Min")`、`setVector("Max")`、`setTexture("MainTexture")`；并「use `asset.hasFloatKey(name)` to check before setting」                                                                                      | **采信·复现**                    | 事实 ✅（确无 rate 键）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 15 | 26 个音频对象**不占图层/粒子**；且**不能用 `renderGroupType` 作依据**（node-plan §1.3、audio-spec §0 补充）                                                    | `python` 读 `knowledge/schemas/object_schemas.json` 取 renderGroupType                                                                          | `Audio Player: Utility / Audio Effect: Music / **Basic Particles: Utility**`                                                                                                                                                                                                            | **采信·复现**（上游**自我修正正确**）      | 事实 ✅（三对象分组值）。归因 ✅✅：**`Basic Particles` 同为 `Utility` 却是有视觉的** → 证明"Utility=不占层"是错误因果；正确依据只有「音频对象**无渲染输出**」。**这是上游主动做对的一处"事实/归因"分离，我复核确认**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16 | 平台**无任何社交/好友 API** → B1 归档、主案改 B2（tech-spec §1、game-design §6.2）                                                                       | `grep -rli "friend\|social\|contact" skills workspace knowledge`                                                                              | **21 个文件命中**，逐一查看均为物理 **"contact"（碰撞接触）** 与 C++ `friend` 关键字，**无任何社交/通讯录 API 符号**                                                                                                                                                                                                       | **采信·推断修正**                  | 事实 ✅（确无社交 API）。但上游原文写「**grep 全库零命中**」**表述不严谨**：字面命中 21 个文件（皆为误命中）。**结论不错、方法描述夸大** → 标记为"结论采信、原描述修正"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 17 | ~~`Image Picker (Head)` 存在、自动抠头（B2 主案可行）~~ **→ 本版不可用、原结论作废**（game-design §6.2、tech-spec §9） | `grep -i picker`（`APJS.d.ts` 两副本）+ `grep -n "Image Picker" knowledge/catalogs/object_catalog.json` | `APJS.d.ts`（`UserAPI/`、`McpTool/resources/workspace/APJS/`）`grep -ci picker` = **0 / 0**；目录实际对象名 = **`Image Picker (Portrait)`**（object_catalog.json:966，描述含 “automatic portrait cutout”），**非旧稿所写 `(Head)`**（属误引）；本版编辑器创建该对象报 `Unknown scene object config id` | **不采信·结论推翻** | **事实**：知识库目录**确有** `Image Picker` / `(Background)` / `(Portrait)` 三条目 ⇒ 属“**平台侧存在、本版不可用**”的**远期能力**（**不是“平台没有”**）。**归因推翻**：旧结论“B2 主案可行”**不成立** —— 本版编辑器不暴露该对象、`APJS` 亦无运行时取相册通道 ⇒ **相册路径对本版废止**，主案改 **轨 A 预设 6 选 1**（tech-spec §9.2）。**教训：「目录里存在」≠「本版可用」，须叠加「编辑器可创建 + 运行时 API 可调」两级核实** |
| 18 | `AnimatedTextureProvider.pause()/resume()` 存在 → hitstop 可只冻 Boss（node-plan §4 决策2）                                                     | `grep -n -A2 "class AnimatedTextureProvider" workspace/APJS/APJS.d.ts`                                                                        | :349 `class AnimatedTextureProvider extends TextureDelegateProvider`，:335 注「Provider that plays a `TextureSequence` as an animated texture」                                                                                                                                             | **采信·复现**                    | 事实 ✅（类存在）；`pause/resume` 方法名我**未逐行核到**（仅核到类与 playMode）。→ **已由 §11.2 行号级关闭**：`pause():431` / `resume():441` 均实存，且判据「hitstop 只能用 `pause()`，严禁 `stop()`」已固化                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 19 | 触摸 API 完整：`Began/Moved/Ended/Canceled` + `touchId/touchCount`（tech-spec §1）                                                            | `grep -n -i "Began\|Moved\|Ended\|Canceled\|touchId\|touchCount" skills/ability/Touch/SKILL.md`                                               | :24-27 四相枚举；:17-18 `touchId` / `touchCount`                                                                                                                                                                                                                                             | **采信·复现**                    | 事实 ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 20 | `face.yaw / roll / pitch` 每帧可读（tech-spec §1、game-design §3）                                                                            | `grep -n -i "yaw\|roll\|pitch" skills/ability/HeadTracker/SKILL.md`                                                                           | :51-53 三轴定义；:55-65 yaw/roll 屏幕映射符号相反（roll 需取负）                                                                                                                                                                                                                                          | **采信·复现**                    | 事实 ✅（方案一仅作氛围层，不承担判定，符号细节不影响）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 21 | 「MCP **28 个工具全清单**」（tech-spec §3 头部）                                                                                                   | `grep -rl <tool> skills workspace`（逐个核对被引用的 10 个工具名）                                                                                          | 被点名的工具**均被 5–38 个文件相互印证存在**（如 `edit_by_dsl` 38 文件、`get_scene` 17、`interact_by_dsl` 12、`run_otsc_check` 9…）；**但"总数=28"本身**在本机资源目录无清单文件可核                                                                                                                                                 | **未覆盖（计数）**                  | 只采信"被引用工具存在"；**"28"这个具体数字未复现**（需调用 MCP `tools/list` 才能核，本轮禁调 MCP）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 22 | 「序列帧 ≤24 帧」是**单动作**还是**全局总量**（animation-spec §1.4/§十-1、implement-plan §六-9）                                                            | `grep -rn "24 ?帧\|24 frame\|sequence.*24" workspace/rules skills`                                                                             | **平台资源目录内零命中**：规则/SKILL 未出现任何"24 帧"条款。AGENTS.md §三 只写「序列帧 帧数 ≤ 24，命名 `anim_001.png` 起」，**未限定单动作**                                                                                                                                                                                       | **未覆盖（口径未收口）**               | **平台文档不解决此口径**。这是纯宪法/上游口径问题，必须人工收口（见 §八 开口项 **O-09**，高影响）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 23 | 「一个特效最多 2 种触发」（AGENTS.md §二、game-design §二）                                                                                            | `grep -rn "最多 ?2\|2 ?种触发\|two trigger" workspace/rules skills`                                                                                | **零命中**                                                                                                                                                                                                                                                                                 | **未覆盖**（属宪法级约束，非平台资源可证）      | 该约束来自项目宪法 AGENTS.md §二，平台文档未见对应条款 → 以宪法为准执行，&#x4F46;**"平台口径是否认同"未获平台侧证据**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 24 | 数值/体积算式（game-design §五、vfx-spec §3.3、art-spec §四、animation-spec §11.1、audio-spec §5.2）                                                 | `python` 逐式复算                                                                                                                                 | `30×80=2400` ✅；`1000/220=4.545/s`（上游标"≈4.5"✅，但与"4 发/秒"**不同**）；`2400/80=30`；`66%→1584 / 33%→792 / 15%→360 / 10–20%→240–480` ✅；`S6=3+5+20+8=36` ✅、`S7=50` ✅（v2.1 重算，= 红线本身；原 39/53 已随 220→250ms 作废）；`128×4=512`✅、`96×4=384≠512`✅（art-spec 裁定1 成立）、`96×5=480`✅；`47/53 帧`✅；`SFX 10.07s×8KB/s+12KB≈93KB`、`BGM 256KB`、`音频合计 ≈349KB` ✅ | **采信·复现**（算式）                | 事实 ✅（全部算式自洽）。**但暴露出一个口径缺口**：`220ms` 冷却 ⇒ **4.545 发/秒**，与设计案"4 发/秒"并存（implement-plan §六-1 已自曝）→ `D-04`/`O-16`（射速口径已于 `game-design` L139 收口 `250ms`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 25 | **上游 v1.2 / v1.2b 修订后的三处口径**（hitstop / 射速 / 包体）                                                                                        | `grep -n "逻辑帧\|50ms\|67ms\|83ms\|v1.2b" vfx-spec.md` + `grep -n "3.2.2\|1.45\|550" audio-spec.md` + `grep -n "hitstop\|40" animation-spec.md` | vfx-spec:275-277 = `普通命中 3逻辑帧=50ms / 暴击·破盾核心 4逻辑帧=67ms / 破盾成功 5逻辑帧=83ms`；vfx-spec:280「40ms（≈2.4 帧）这种非整帧值**废弃**」；audio-spec:313-328「§3.2.2 射速口径不敏感…射速口径**不是音频风险**」；audio-spec:520「总包体（实测）**≈1.45 MB** / 余量 **≈550 KB**」；animation-spec:235「v1.5 定案：普通 50 / 破盾 83 / 击杀 0，`hitstopMs=50`」  | **采信·复现**（事实+归因均复核）          | 事实 ✅（三文档 hitstop 已对齐 50/67/83/0）。归因 ✅：audio-spec §3.2.2 证明"4 发/秒"与"220ms 冷却"两种口径对音频**均成立** → **D-04/O-16 的音频影响可划掉**；包体归因"漏算 53 序列帧"经 v1.2a 修正、**再经 team-lead 勘误收口为三档口径**（`tech-spec` §3.2）：**乐观 ≈0.89–1.26 MB ✅ / 中值 ≈1.45 MB ✅（余量 1.4×）/ 最坏 ≈2.10–3.00 MB ✘ 破 2MB 线**。**"≈0.49MB / 余量 4.1×" 与 "≈1.45MB 即达标" 两种表述均作废**。本机复算：`53×28 KB=1484 KB`、`53×45 KB=2385 KB`、`0.83 MB÷53=15.7 KB/帧`（=中值，既非 5–12 也非 28–45）→ **0.83MB 是中值而非"保守"，此前等于把最坏情形藏起来**。**包体判据（`tech-spec` §3.2.1「单点判定规则」）= 最复杂单帧 `artifactFileSize ≤ 26.8 KB`（⇒53 帧上界亦 ≤2048 KB）**&#x6216;**全量 `Σ artifactFileSize`（压缩开+Size512）≤ 2048 KB**，满足其一即判过；1.45MB 只是中值预期、**不得当达标线**（详见 §8.1 O-08） |

| 26 | **音频资产客观自验**（audio-synth 交接：`tools/verify_audio.py` + 两条测量坑 + MP3 编码器延迟） | `python tools/verify_audio.py`（独立复跑）+ 本机自测脚本（对判定原语喂已知答案样本） | **本机实跑：24 项检查 / 24 项通过 / 0 失败**（24 SFX + 2 BGM）。关键读数：`sfx_result_lose` **0 ms**（余量 +200，**旧「擦线 200ms」已消除**）、`sfx_boss_land` 50 ms（余量 +150）、解码域峰值最大偏差 0.70 dB、manifest RMS 可独立复算 ≤0.05 dB、BGM 两段等响差 0.35 dB、体积 341.4 KB | **采信·复现** | 事实 ✅（24/24 复现）。**判定原语自验 = 11/13**：低频闸门 **3/3 命中抓出、3/3 不命中判过、2/2 无起振假阳性**（闸门逻辑合格）；另 2 项 FAIL 系**工具注释里的常数不实**（注释称 8 阶对 87Hz 衰减 −18.4dB，本机稳态复算 **−39.3dB**）——**不影响闸门判定逻辑，仅注释需订正**（见 §6.2 观测项 d）。归因 ✅：MP3 编码器延迟 **25.06 ms**（MPEG-1 LIII，1105 samples @44.1kHz）、<60Hz 闸门须 **8 阶(48dB/oct)** 低通——两坑**经本机复算确认方向正确** |

**采信矩阵小计**（共 **26 行**）：**采信·复现 22 条** / 采信·推断修正 1 条（#16 方法描述夸大）/ **未覆盖 2 条**（#21 计数项、#23 宪法口径项）/ **不采信·结论推翻 1 条**（#17 —— 相册 `Image Picker` 路径已废止，见 §5.2 D-15）。**未覆盖项已如实留白，未脑补。**
> **口径演进（防数字漂移）**：v1.3 收口时 25 行 = `复现 22 / 推断修正 1 / 未覆盖 2`；v1.4 起两处变动 —— **+ #26**（音频工具自验，复现 +1）、**#17 由「复现」改判「推翻」**（复现 −1）⇒ **净复现仍 22**，另立「推翻」类 1 条。故「复现 22」在两版均成立（26 行 = 22 + 1 + 2 + 1）。

### 0.2 判定工具先自验（硬性）

本轮我用来给"他方产物"定性的脚本 = **像素规格核查器**（色板 / 无羽化 / 导出尺寸整数倍三项断言）。使用前先自测并报数：

- **脚本**：`pixel_spec_check.py`（读 PNG → 断言 C1 唯一 RGB 集合 ⊆ DB16、C2 alpha ⊆ {0,255}、C3 导出 = 逻辑 × 整数 N 且长边 ≤512）
- **已知答案样本 ≥3（含 ≥1 命中、≥1 不命中）：共 6 个**
  - 命中样本 3：`H1` boss_body_idle(128→512 ×4) / `H2` fx_num_atlas(160×16→480×48 ×3) / `H3` hp_frame(64×16→512×128 ×8)
  - 不命中样本 3：`M1` 越色板(含 `#ff00ff`) / `M2` 中间 alpha(128，羽化) / `M3` 非整数倍(500 对逻辑 128)
- **自测结果**：**6/6 通过**（H1/H2/H3 → PASS；M1 报 `C1=False`、M2 报 `C2=False`、M3 报 `非整数(500/128)` 且 `C3=False`，三个负样本均 FAIL，退出码 1）
- **从"真实命中"抽 3 个回原文人工复核**：⚠️ **本机当前真实出货资产 = 0（工程未开始）**，故"真实命中"不可得。诚实降级为**按 art-spec §四 权威规格表合成样本 + 回原文比对**：
  - `H1` 128/×4/512 ↔ art-spec §4.1 `boss_body_idle` 行（128×128 / ×4 / 512×512）→ **一致**
  - `H2` 160×16/×3/480×48 ↔ art-spec §4.3 `fx_num_atlas` 行（160×16 / ×3 / 480×48）→ **一致**
  - `H3` 64×16/×8/512×128 ↔ art-spec §4.4 `hp_frame` 行（64×16 / ×8 / 512×128）→ **一致**
  - 即 **3/3 与原文规格表吻合**。**标注：这是"规格表合成样本"的替代复核，非真实出货资产复核；工程落地后必须用真资产重跑。**

### 0.3 首轮 → 上轮缺陷状态

**N/A**（首轮验收，无上一轮报告与缺陷）。本节按取证纪律第 3 条如实留白，不伪造。

---

## 一、验收条件（AC 总表）

### 1.0 编号约定（供后续逐轮 diff，**沿用不重排**）

`PLY-*` 玩法（game-design §十）/ `ART-*` 美术（art-spec §八）/ `ANM-*` 动画（animation-spec §9.3）/ `VFX-*` 特效（vfx-spec §十一）/ `AUD-*` 音频（audio-spec §九）/ `INT-*` 跨模块集成（本轮新增）/ `PX-*` 像素规格专项（本轮新增）。

**去重纪律：不丢条目、不把不同模块的条目合并成一条。** 上游四份验收清单 + 玩法清单**原样全列**（共 13+14+12+13+19 = **71 条**），跨模块重复项在保留原件的同时，另建 `INT-*` 汇总（见 §1.2），并在 §1.3 记录去重映射。唯一**文本级**同名项（如"包体≤2MB"在多模块重复出现）**仍各留一行**，仅在"备注"列标注跨模块同源。

### 1.1 玩法验收标准（game-design §十，13 条）

| 编号     | 模块 | 验收项    | 通过标准（可判定）                                     | 测量方式                       | 依据来源                       |
| ------ | -- | ------ | --------------------------------------------- | -------------------------- | -------------------------- |
| PLY-01 | 玩法 | 单局时长   | 熟练 10–20s 可通关；新手 40s 内大概率通关                   | 真机/预览计时 10 局取中位            | game-design §十-1、§五        |
| PLY-02 | 玩法 | 首次命中时机 | 90% 测试者进入后 3s 内完成第一次命中                        | 录屏标记进局帧→首次命中帧              | game-design §十-2、§七        |
| PLY-03 | 玩法 | 阶段感知   | 每次阶段切换，测试者 1s 内说出"换阶段了"                       | 盲测口头确认（≥4/5 人）             | game-design §十-3、§4.2      |
| PLY-04 | 玩法 | AR 瞄准可达性 | Boss 锚定后，玩家**仅靠转动手机**即可让命中态成立（≥1 次/3s），无需触摸瞄准                            | 真机转手机观察命中态触发；统计命中态成立频次        | game-design §3、tech-spec §2.7 |
| PLY-05 | 玩法 | 失败可重开  | 超时失败后 1 次点击重开、无卡死                             | 操作 + `get_script_logs` 无异常 | game-design §十-5、§8        |
| PLY-06 | 玩法 | 头像合规（**双轨**）   | **轨 A 预设 6 选 1**：零真人内容、未选/超时走默认第 1 款、**不阻断进局**；**轨 B 摄像头取像**：不存储/不上传/不导出、未取像回落轨 A、**真机未验（不阻断提审）**；**全程无外部照片导入路径** | 轨 A 逐分支走（见 INT-08）；轨 B 真机项（`node-plan §7` 第 10 项） | game-design §十-6、§6.1/§6.2、tech-spec §9      |
| PLY-07 | 玩法 | 去暴力    | 全流程无血/无惨叫/无身体破坏；归零为"认输"演出                     | 逐帧人工过（见 §七-2）              | game-design §十-7、§4.4      |
| PLY-08 | 玩法 | 社交闭环   | 结算卡可生成并保存/分享                                  | 结算页产卡 + 保存/分享动作            | game-design §十-8、§9        |
| PLY-09 | 玩法 | 像素规格   | 64×64 画布、大元素整数倍、DB16、图层≤6、粒子≤50、包体≤2MB、序列帧≤24 | 见 §1.3 PX-01..06（脚本）       | game-design §十-9、AGENTS §三 |
| PLY-10 | 玩法 | 触发方式   | 全程恰 2 种（①触摸=开火 ②人脸事件=重击），不叠加第三种               | 全量代码/事件扫描 + 运行态枚举          | game-design §十-10、§二       |
| PLY-11 | 玩法 | 布局安全区  | 血条/准星/按钮全落 X[-340,+260]、Y[-400,+500]；无元素进底部禁区 | **运行态截图**（非仅坐标表）           | game-design §十-11、§3.3     |
| PLY-12 | 玩法 | 无服务器依赖 | 整局离线；无服务器下发/外链/账号级好友拉取                        | 全量网络调用扫描（应 0 条）            | game-design §十-12、§9       |
| PLY-13 | 玩法 | 核心音效   | 具备射击音 + 命中音 + 胜负音三类                           | 逐类触发出声 + 日志                | game-design §十-13、§3.4     |

### 1.2 美术验收标准（art-spec §八，14 条）

| 编号     | 模块 | 验收项       | 通过标准（可判定）                                                                                   | 测量方式                           | 依据来源                                             |
| ------ | -- | --------- | ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| ART-01 | 美术 | 色板合规      | 唯一 RGB 集合 |S|≤16 且 S ⊆ DB16                                                                 | 脚本读 PNG 取唯一 RGB（= PX-01）       | art-spec §八-1、§5.3                               |
| ART-02 | 美术 | 无羽化       | alpha 仅含 0 与 255                                                                            | 脚本读 alpha 集合（= PX-02）          | art-spec §八-2                                    |
| ART-03 | 美术 | 无抗锯齿/无半像素 | 边界硬跳变；导出=逻辑×整数 N；显示=导出×1/2ⁿ                                                                 | 逐行扫描 + 尺寸断言（= PX-03）           | art-spec §八-3、§5.3                               |
| ART-04 | 美术 | 导入参数正确    | filterMin/Mag=Nearest、filterMipmap=None、enableMipmap=false、MaxResolution=Size512、wrap=Clamp | 逐张查资源属性                        | art-spec §八-4、§5.3                               |
| ART-05 | 美术 | 描边连续      | 主体外轮廓 `#140c1c` 闭合、无断口                                                                      | 目检 + 连通域检查                     | art-spec §八-5                                    |
| ART-06 | 美术 | 剪影可辨识     | boss_body_idle 缩到 64×64 仍可辨"独眼+圆身+双角+双腿"                                                    | 1/4 缩放目检                       | art-spec §八-6、§〇裁定2                              |
| ART-07 | 美术 | 光向一致      | 全部主体左上 45° 受光，无反向光源                                                                         | 抽查全部主体资产                       | art-spec §八-7、§1.1                               |
| ART-08 | 美术 | 对比度与冗余编码  | 正文/关键信息对比度 ≥4.5:1；颜色非唯一载体                                                                   | 对比度测量 + 形状/位置冗余核对              | art-spec §八-8、§1.2                               |
| ART-09 | 美术 | 安全区合规     | 无交互元素落禁区；血条在顶部栏下；按钮中心 Y ≥ -220                                                              | 坐标叠加 + 运行态截图                   | art-spec §八-9、game-design §3.3（**D-06 已关闭**：两文件均对齐 `Y ≥ -220`） |
| ART-10 | 美术 | 命名合规      | `^[a-z0-9_]+\.png$`；序列帧 `anim_\d{3}\.png` 且 ≤24                                             | 文件名正则                          | art-spec §八-10、§5.1                              |
| ART-11 | 美术 | 单张体积      | 单张 ≤ 45 KB                                                                                  | 逐张记字节数                         | art-spec §八-11、§6                                |
| ART-12 | 美术 | 总包体       | Σ 贴图 + Σ 音频 ≤ 2 MB                                                                          | 实测 Σ artifactFileSize（= PX-06） | art-spec §八-12                                   |
| ART-13 | 美术 | 头像"牌子"定性  | 有可见旗杆、牌与头独立描边、Boss 自身独眼保留、无"脸长在怪身上"                                                         | 挂点合成图目检                        | art-spec §八-13、§3.2                              |
| ART-14 | 美术 | 去暴力       | 无血/无伤口/无惨叫图形；认输为举手+^^                                                                       | 全状态目检                          | art-spec §八-14                                   |

### 1.3 动画验收标准（animation-spec §9.3，12 条）

| 编号     | 模块 | 验收项          | 通过标准（可判定）                                                 | 测量方式                         | 依据来源                        |
| ------ | -- | ------------ | --------------------------------------------------------- | ---------------------------- | --------------------------- |
| ANM-01 | 动画 | 单动作帧数        | 每个动作 ≤24 帧（实测最大 12 帧）                                     | 逐动作目录计数                      | animation-spec §9.3-1、§11.1 |
| ANM-02 | 动画 | 无逐帧换 texture | 全工程无"逐帧替换 Image.texture"脚本                                | 全量脚本扫描                       | animation-spec §9.3-2、§0梁1  |
| ANM-03 | 动画 | 受击不打断待机      | 连续 10 次命中期间 IDLE 播放头无重启、帧序号单调推进                           | 运行态日志/录屏（= INT-03）           | animation-spec §9.3-3、§4.3  |
| ANM-04 | 动画 | 过渡无跳帧        | 所有状态切换末帧/首帧无缝，无闪帧白帧                                       | 逐切换录屏逐帧                      | animation-spec §9.3-4、§4.2  |
| ANM-05 | 动画 | 无半像素变形       | 位移为整数逻辑 px；缩放仅整数倍；旋转仅 90° 倍数                              | 逐帧读位移/缩放/旋转值                 | animation-spec §9.3-5、§11.4 |
| ANM-06 | 动画 | 打击感四件套对齐     | 命中帧内 hitstop(50ms)+闪白(1–2 帧)+**震屏（"Boss 抖动"= 整屏震屏；本体是否随动 = O-20）**+数字/星 同帧                   | 打点比对判定帧 vs spawn 帧（= INT-01）；**依赖 O-20**（`O-20` 未通过 ⇒ 本项不得判过） | animation-spec §9.3-6、§3.3  |
| ANM-07 | 动画 | 变奏点感知        | ENRAGE_INTRO f4 起 1s 内测试者能说出"换阶段了"                        | 盲测口头确认                       | animation-spec §9.3-7、§3.4  |
| ANM-08 | 动画 | 假死节奏         | 瘫倒 ≤0.4s、假死窗 0.8s；停火→回血 / 持续打→识破 两分支均可触发                  | 两分支各走一遍（= INT-07）            | animation-spec §9.3-8、§3.9  |
| ANM-09 | 动画 | 落地时序         | 认输 f8 牌脱手与彩带同帧；WIN 页 f12 后弹                               | 打点比对（= INT-09）               | animation-spec §9.3-9、§3.10 |
| ANM-10 | 动画 | 采样/尺寸        | 每张序列帧 filter=Nearest、MaxResolution=512、enableMipmap=false | 逐张查属性                        | animation-spec §9.3-10      |
| ANM-11 | 动画 | 包体           | 全资源入包 ≤2MB（实测 Σ artifactFileSize）                         | 实测（= PX-06）                  | animation-spec §9.3-11      |
| ANM-12 | 动画 | 命名           | 序列帧 `anm_<action>/anim_001.png` 起；静态贴图小写下划线               | 文件清单核对                       | animation-spec §9.3-12、§9.1 |

### 1.4 特效验收标准（vfx-spec §十一，13 条）

| 编号     | 模块 | 验收项   | 通过标准（可判定）                            | 测量方式                                                                | 依据来源                 |
| ------ | -- | ----- | ------------------------------------ | ------------------------------------------------------------------- | -------------------- |
| VFX-01 | 特效 | 粒子数   | **任意时刻存活粒子 ≤50**                     | `enableAliveParticleCount=true`+逐帧求和 `aliveParticleCounts`（= PX-05） | vfx-spec §十一-1、§3.1  |
| VFX-02 | 特效 | 峰值不破线 | 击杀瞬间 ≤50（现实峰值 36）                    | 全流程最大帧采样（= INT-04）                                                  | vfx-spec §十一-2、§3.3  |
| VFX-03 | 特效 | 降级生效  | alive>46 阶梯、>50 硬停，日志可查              | 打点 `[guard] budgetDropped, alive=NN`                                | vfx-spec §十一-3、§3.4  |
| VFX-04 | 特效 | 颜色    | 无 DB16 外颜色（源素材+发光色）                  | 素材逐像素量化检查 + MainTexture 为 DB16 PNG（= PX-01）                         | vfx-spec §十一-4       |
| VFX-05 | 特效 | 去暴力   | 无血/无伤口/无碎片/无惨叫/无爆炸击杀                 | 逐帧人工过 + §七清单                                                        | vfx-spec §十一-5、§7.1  |
| VFX-06 | 特效 | 命中延迟  | 命中反馈视觉延迟 ≤1 帧（目标 0 帧）                | `onHit()` 打点判定帧 vs 视觉 spawn 帧（= INT-01）                             | vfx-spec §十一-6、§8    |
| VFX-07 | 特效 | 音画同步  | 命中音与粒子启动同一帧（误差 ≤1 帧）                 | 打点日志比对（= INT-01）                                                    | vfx-spec §十一-7       |
| VFX-08 | 特效 | 闪白    | ≤2 帧，无渐进插值                           | 帧序列截图核对                                                             | vfx-spec §十一-8、§6.3  |
| VFX-09 | 特效 | 震动    | 单帧位移 ≤4px、无旋转                        | 逐帧读 ContentRoot 位移                                                  | vfx-spec §十一-9、§6.2  |
| VFX-10 | 特效 | 可读性   | 不遮挡准星中心/Boss 眼睛/提示 UI/底部 180px 禁区    | 运行态分时截图核对（= PX/安全区）                                                 | vfx-spec §十一-10      |
| VFX-11 | 特效 | 采样/尺寸 | 贴图 ≤512×512、Nearest/Min/None、序列帧 ≤24 | 资源属性检查（= PX-01/03）                                                  | vfx-spec §十一-11      |
| VFX-12 | 特效 | 后坐力   | ≤3px 且不晕（无叠加致晕）                      | 逐帧位移核对                                                              | vfx-spec §十一-12、§6.1 |
| VFX-13 | 特效 | 命名    | 英文小写+下划线                             | 文件清单核对                                                              | vfx-spec §十一-13      |

### 1.5 音频验收标准（audio-spec §九，19 条）

| 编号     | 模块 | 验收项       | 通过标准（可判定）                                              | 测量方式                        | 依据来源                      |
| ------ | -- | --------- | ------------------------------------------------------ | --------------------------- | ------------------------- |
| AUD-01 | 音频 | 同帧并发      | 任意一帧内新启动音效 ≤2（第 3 个丢弃不发声）                              | `[audio]` 日志按帧聚合            | audio-spec §九-1           |
| AUD-02 | 音频 | 全局并发      | 任意时刻同时播放 SFX 组件 ≤4                                     | 日志并发计数                      | audio-spec §九-2、§3.2      |
| AUD-03 | 音频 | 无削波/无音爆   | 最坏叠加混音峰值 ≤ −1.0 dBFS；真机无噼啪爆音                           | 离线合成检查 + 真机录屏听检             | audio-spec §九-3、§3.2机制4   |
| AUD-04 | 音频 | 音高上限      | 不越 1.414×(轻)/1.260×(重)，无啸叫                             | 频谱 + 听审                     | audio-spec §九-4、§3.2机制1   |
| AUD-05 | 音频 | 无重复疲劳     | 任一 2s 窗口内同(文件+音高档)不连续 ≥3 次                             | 日志序列分析                      | audio-spec §九-5           |
| AUD-06 | 音频 | 失败音不吓人    | 无 <80Hz 持续低频/无 >1.5s 长混响/无 jump-scare；盲测 5 人 100% 未受惊  | 频谱 + 盲测                     | audio-spec §九-6、§6.3      |
| AUD-07 | 音频 | 咆哮"凶但不恐怖" | 盲测被描述"凶/搞笑/卡通"≥4/5 人                                   | 盲测                          | audio-spec §九-7、§6.2      |
| AUD-08 | 音频 | 总音频体积     | ≤360 KB（24 SFX + 2 BGM）                                | 实测 Σ 文件大小                   | audio-spec §九-8、§5.2      |
| AUD-09 | 音频 | 总包体       | ≤2048 KB（音频+贴图+工程）                                     | 实测（= PX-06）                 | audio-spec §九-9           |
| AUD-10 | 音频 | 无无声/漏配    | 所有 play() 点有兜底日志；`get_script_logs` 无 `[audio] missing` | 日志断言                        | audio-spec §九-10          |
| AUD-11 | 音频 | 起播延迟      | **按路径分列（两路径起点不同、不得相加）**：**开火音** 触摸→出声 ≤50ms（目标 ≤35）；**命中音** 判定→出声 同帧为目标(0)、容差 ≤1 帧。**最坏 ≈98ms**（合格实现串行上限）/ **劣化 ≈131ms**（判定音晚 1 帧）                     | 真机录屏画音同轨（= INT-06/开口项 O-03） | audio-spec §九-11、§7.4     |
| AUD-12 | 音频 | BGM 循环无缝  | 连播 ≥60s（≥3 循环）听不出接缝；常态↔暴怒切换无咔嗒                         | 真机听审（= 开口项 O-06）            | audio-spec §九-12          |
| AUD-13 | 音频 | 静音开关      | 全局静音/关音乐生效，0.2s 内可听出                                   | 操作 + 听检                     | audio-spec §九-13          |
| AUD-14 | 音频 | BGM 不抢戏   | 与用户音乐同播下命中音清晰；命中音比 BGM 高 ≥6 dB                         | 混音测量 + 听检                   | audio-spec §九-14、§4.2     |
| AUD-15 | 音频 | 零人声       | 全包无人声采样（含 TTS、真人笑声）                                    | 频谱 + 听审                     | audio-spec §九-15、§6.3-3   |
| AUD-16 | 音频 | 版权留痕完整    | `assets/SOURCES.md` 每条音频有来源登记，无空项                      | 逐条核对 SOURCES.md             | audio-spec §九-16、§5.4     |
| AUD-17 | 音频 | 命名合规      | `sfx_<类别>_<名称>[_变体].mp3` / `bgm_p<阶段>_<情绪>.mp3`        | 文件名正则                       | audio-spec §九-17、§5.4     |
| AUD-18 | 音频 | 格式合规      | 全 .mp3、44.1kHz、单声道、CBR 64kbps（BGM 可 48）                | 文件属性批检                      | audio-spec §九-18、§5.1     |
| AUD-19 | 音频 | 状态重置      | RESET 时所有音频 stop()，combo 与槽位下标归零                       | 日志断言（= INT-06）              | audio-spec §九-19、§10.1-12 |

### 1.6 跨模块集成验收（★ 本轮新增，仅集成后才会暴露）

> 单模块各自达标 ≠ 整体能用。以下 10 条**不属于任何单一模块的验收清单**，是集成层风险，须整体验收。

| 编号     | 集成验收项             | 前置条件               | 通过标准（可判定）                                                 | 测量方式                                       | 依据来源                                                                     |
| ------ | ----------------- | ------------------ | --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| INT-01 | **命中同帧链**         | 打通"开火→命中→反馈"闭环     | 命中判定 → 闪白/星/数字/震屏/hitstop/音效 **落在同一帧**：视觉 0 帧、音画 ≤1 帧     | `onHit()` 内打点每环节帧号，断言 6 环节同帧；音画启动帧差 ≤1；**依赖 O-20**（`O-20` 未通过 ⇒ 本项「震屏」环节不得判过，见 §8.4）     | implement-plan §2.0.1/§2.1.3、vfx-spec §8、audio-spec §7.2                 |
| INT-02 | **hitstop 与特效解耦** | hitstop 已实现        | 顿帧期间 L4 特效（粒子/伤害数字）**照常更新**，不被冻住                          | 顿帧窗口内采样 `aliveParticleCounts` 与数字位置，断言持续变化 | node-plan §4决策2、vfx-spec §6.1、implement-plan §2.1.3                      |
| INT-03 | **受击不打断待机**       | IDLE 循环播放中         | 连续 10 次命中期间 IDLE 播放头**单调推进、无重启**                          | 记录播放头帧序号序列，断言单调                            | animation-spec §4.3/§9.3-3、node-plan §3.3修正①                             |
| INT-04 | **粒子峰值（击杀瞬间）**    | 击杀演出可触发            | 命中星+暴击星+彩带+星爆 同现时**全场 ≤50（现实峰值 36，理论全叠加 50 = 红线本身）**                               | 击杀帧逐发射器求和 `aliveParticleCounts`            | vfx-spec §3.3 S6、§十一-1/2                                                 |
| INT-05 | **阶段切换声画同步**      | BGM 双段 + 震屏 + 台词就绪 | 常态→暴怒段切换与震屏/台词/红眼落在**同一拍**（含量化到拍线的最坏 **0.5s** 等待）         | 录屏比对 BGM 切换帧 vs 震屏/红眼帧，偏差 ≤0.5s            | audio-spec §3.3.4、animation-spec §3.4、implement-plan §2.3                |
| INT-06 | **RESET 跨局干净**    | 可重开一局              | 重开后 HP/combo/弹药/统计/粒子/音频**全部归零**；BGM `INFINITE` **不跨局串声** | RESET 后断言各量=初值；`AudioRoot` 逐组件 stop() 日志   | node-plan §3.1、audio-spec §10.1-12、implement-plan §2.1.5                 |
| INT-07 | **假死两分支**         | 进入 33% 后假死窗        | 停火分支（回血 +5%）与持续受击分支（识破）**均可触发**且 UI 正确回填                  | 两分支各触发一次，断言 HP 回填值正确、文案"它装的！"出现            | game-design §4.2、animation-spec §3.9、implement-plan §2.1.5               |
| INT-08 | **头像兜底不阻断**（**双轨改版**）       | 轨 A 预设选择器就绪    | **轨 A**：未选 / 超时 / 任意异常 → 默认第 1 款预设、**3s 内进 FIGHTING**；**轨 B**（若落地）：取像失败 / 用户跳过 → 回落轨 A、不阻断              | 轨 A 真机走分支，断言均进 FIGHTING；轨 B 见 `node-plan §7` 第 10 项                    | game-design §6.2、tech-spec §9.2/§9.7                                   |
| INT-09 | **认输落地时序**        | HP 归零演出            | 认输 f8 牌脱手与彩带爆**同帧**；WIN 页在 f12 后弹                         | 打点比对 f8/f12 对齐点                            | animation-spec §3.10/§9.3-9、vfx-spec §5                                  |
| INT-10 | **安全区（运行态）**      | 全部 UI 就位           | 血条/准星/按钮全落安全区，**无元素进底部 180px 禁区**（含旋转/动画/反馈范围，非仅中心点）      | **运行态截图**核对宿主 UI 遮挡（不得只看坐标表；不得靠隐藏按钮规避）     | game-design §3.3、scene-game.md:4-8、Touch/SKILL.md:40、validation.md:45-46（**引用已复核**：三文件均在像塑资源 `workspace/rules/scene-game.md`（主操作区/安全区）、`skills/ability/Touch/SKILL.md`（底部 180px 录制禁区）、`workspace/rules/validation.md`（宿主 UI 遮挡检查），**口径正确、未失效**；另 `v2` 准星固定屏幕正中 `(0,0)`，仍落安全区内） |

### 1.7 像素规格专项验收（可脚本化，PX-01..06）

| 编号    | 检查项       | 可脚本化核查方法（可执行）                                                                                             | 通过标准                 | 依据来源                                           |
| ----- | --------- | --------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| PX-01 | 色板 ⊆ DB16 | 读每张 PNG 全部像素 → 取不透明唯一 RGB 集合 S；断言 S ⊆ DB16(16 色)                                                          | |S|≤16 且 S⊆DB16      | AGENTS §三、art-spec §5.3                        |
| PX-02 | alpha 二值  | 读 alpha 通道取值集合                                                                                            | ⊆ {0,255}            | art-spec §5.3                                  |
| PX-03 | 导出尺寸      | 断言 宽高 ≤512，且 (导出/逻辑) 为整数、N≥1                                                                              | 导出 = 逻辑 × N（整数），≤512 | art-spec §〇裁定1、§5.3                            |
| PX-04 | 顶层渲染层 ≤6  | `get_scene(names_only=true)` 统计顶层渲染层 / render group；排除 `ContentRoot`/`AudioRoot`（变换父节点）                   | ≤6                   | tech-spec §3.1、node-plan §1                    |
| PX-05 | 粒子 ≤50    | 运行时 `vfx.enableAliveParticleCount=true`；逐帧 Σ `aliveParticleCounts` ≤50                                    | ≤50                  | vfx-spec §3.1/§十一-1                            |
| PX-06 | 总包体 ≤2MB  | Σ `artifactFileSize`（**含 53 个序列帧文件**）+ Σ 音频文件 + 工程元数据                                                     | ≤2048 KB             | AGENTS §三、animation-spec §11.6、audio-spec §5.2 |
| PX-07 | 采样符       | 逐张查 `filterMin/Mag=Nearest`、`filterMipmap=None`、`enableMipmap=false`、`MaxResolution=Size512`、`wrap=Clamp` | 全符                   | node-plan §5、tech-spec §6                      |

> **工具状态**：PX-01/02/03 的核查器 `pixel_spec_check.py` 已按 §0.2 自验（6/6 通过）。PX-04/05/07 依赖运行时 `get_scene`/`aliveParticleCounts`/资源属性接口（工程落地后可执行）；PX-06 依赖构建产物。

---

## 二、测试用例（分场景 · 可执行）

> 判定列：PASS 条件。优先级：P0 阻断必测 / P1 高 / P2 中 / P3 低。一人开发场景下，**优先 P0/P1**，P2/P3 可暂缓。

### 2.1 功能用例（核心玩法）

| 用例号     | 模块   | 前置条件        | 步骤             | 预期结果                                                             | 优先级 |
| ------- | ---- | ----------- | -------------- | ---------------------------------------------------------------- | --- |
| TC-F-01 | 射击   | 已进 FIGHTING | 在 Boss 处于命中态时**按住屏幕** 1 次（≥0.3s） | 枪口闪光 + 后坐力 + 命中判定成立                                              | P0  |
| TC-F-02 | 命中反馈 | Boss 可命中    | 命中 1 发         | 同帧出现：闪白 + 3 星 + 白数字 80 + 轻震 + hitstop **50ms**（普通命中=3 逻辑帧） + 命中音 | P0  |
| TC-F-03 | 掉血   | HP 满        | 连点命中 1 发       | 主血条即时掉 1 格宽（整数 px），延迟条 0.25s 后追平                                 | P0  |
| TC-F-04 | 阶段切换 | HP 满        | 打至 HP≤66%      | ENRAGE_INTRO f4 起 1s 内：震屏+红眼+"暴怒!"字+BGM 变奏                       | P0  |
| TC-F-05 | 护盾   | HP≤33%      | 保持连射           | 开盾（叠 boss_shield），普通命中伤害 ×0.20                                   | P0  |
| TC-F-06 | 破盾   | 护盾期         | 命中核心点累计达 N 次   | 破盾演出 + 2s 全额伤害窗                                                  | P0  |
| TC-F-07 | 假死   | HP≈15%      | 观察假死触发         | 瘫倒 ≤0.4s、血条"假空"、文案"它装的！"                                         | P0  |
| TC-F-08 | 胜负   | HP=0        | 打空血条           | 认输演出→WIN 页；评级/耗时/命中率/连击正确                                        | P0  |
| TC-F-09 | 胜负   | 40s 到       | 停火至超时          | Boss 跳走→LOSE 页"它跑掉了，再来一局"                                        | P0  |
| TC-F-10 | 换弹   | 弹匣=0        | 停火等自动换弹        | 换弹 1.0s，期间不可开火，条读秒                                               | P1  |

> **hitstop 期望值单一来源（防分裂）**：命中反馈类用例（TC-F-02 普通命中、TC-F-06 破盾、以及任何含 hitstop 的用例）的 hitstop 期望值**统一以 `vfx-spec` §6.1（v1.2b）为唯一来源** = 普通命中 **50ms** / 暴击·破盾核心 **67ms** / 破盾成功 **83ms** / 击杀 **0ms**（60fps 整数帧）。`animation-spec` v1.5 的 `hitstopMs` 与之一致。**任何非整帧值（如 40ms）一律作废**（vfx-spec v1.2 明文废弃）。

### 2.2 边界用例

| 用例号     | 模块               | 前置条件        | 步骤                      | 预期结果                                  | 优先级 |
| ------- | ---------------- | ----------- | ----------------------- | ------------------------------------- | --- |
| TC-B-01 | 弹匣打空             | ammo=0      | 疯狂开火（狂按 / 按住连射）                    | 只出 `sfx_gun_empty`（0.25s 去抖），不消耗、不出数字 | P0  |
| TC-B-02 | 连点超射速            | 冷却中         | 250ms 内连点 ≥3 次（4 发/秒闸门）          | 仅第 1 次开火生效；后续被冷却闸门 `return null`      | P0  |
| TC-B-03 | 超时最后一帧           | 39.99s      | 在 40s 边界前命中致命发          | 以"命中判定帧"为准判 WIN（HP 先归零即 WIN，非 LOSE）   | P1  |
| TC-B-04 | HP 恰 66%/33%     | HP 可控       | 精确打至 1584 / 792         | 阈值 `≤` 判定生效（1584→ENRAGE；792→SHIELD）   | P1  |
| TC-B-05 | HP 恰 15%（10–20%） | 进入假死带       | HP 落到 360（含 240/480 边界） | 假死触发（10%≤ratio≤20%）                   | P1  |
| TC-B-06 | 满血 / 空血          | HP=2400 / 0 | 观察血条                    | 满：条满无闪烁；空：假空/认输不越界显示                  | P1  |
| TC-B-07 | 核心点闪烁窗口          | 护盾期         | 在核心点"灭"的瞬间点它            | 未命中核心 → 按普通命中（×0.20），不推进破盾            | P1  |

### 2.3 异常用例

| 用例号     | 模块     | 前置条件     | 步骤            | 预期结果                                    | 优先级 |
| ------- | ------ | -------- | ------------- | --------------------------------------- | --- |
| TC-E-01 | 相机中断   | FIGHTING | 遮挡/切走相机       | 自动暂停，回前台恢复，**不判失败**（game-design §8）     | P0  |
| TC-E-02 | 切后台    | FIGHTING | 切后台再回         | 状态保留、无音画错位、无跨局串声                        | P1  |
| TC-E-03 | 权限被拒   | 首帧       | （**无相册路径**，此分支已废止；轨 B 若落地仅需确认**摄像头类权限声明**）        | **不适用**（本版无相册权限路径，见 §9/§G-03） | P2  |
| TC-E-04 | 抠头失败   | 首帧       | （**无抠头路径**，此例已废止）     | **不适用**（轨 A 无抠图；轨 B 取像方块像素化为 16×16）      | P2  |
| TC-E-05 | 未选/超时  | 首帧       | 不作选择 / 3s 无操作       | **默认第 1 款预设进局**，不卡在选择页（轨 A 兜底）                           | P0  |
| TC-E-06 | 连续快速重开 | WIN/LOSE | 1s 内连点重开 ≥5 次 | 无卡死、无重复对象、粒子/音频不累积                      | P0  |

### 2.4 合规用例

| 用例号     | 模块     | 前置条件 | 步骤      | 预期结果                        | 优先级 |
| ------- | ------ | ---- | ------- | --------------------------- | --- |
| TC-C-01 | 头像授权   | 首帧选图 | （**无相册/外部照片导入路径**，此例已废止）   | **轨 A 预设 6 选 1 · 零真人内容**；轨 B 取像**不存储/不上传/不导出** | P0  |
| TC-C-02 | 不换脸    | 已挂头像 | 检查头像渲染  | 头像为**静帧像素贴片**，无表情驱动/无口型/不上传 | P0  |
| TC-C-03 | 去暴力-视觉 | 全流程  | 逐帧过     | 无血/无伤口/无碎片/无惨叫；终结为彩带认输      | P0  |
| TC-C-04 | 零人声    | 全量音频 | 频谱 + 听审 | 无人声采样（含 TTS/真人笑声）           | P0  |
| TC-C-05 | 去暴力-文案 | 全量文案 | 词表扫描    | 无"杀死/击杀/爆头/献血"等；统一"放倒/认输"   | P0  |
| TC-C-06 | 无规避审核  | 提审文案 | 全文扫     | 不含"绕过/规避审核"类表述              | P0  |

### 2.5 性能用例

| 用例号     | 模块   | 前置条件   | 步骤          | 预期结果                              | 优先级 |
| ------- | ---- | ------ | ----------- | --------------------------------- | --- |
| TC-P-01 | 粒子峰值 | 击杀演出   | 触发击杀        | 全场粒子 ≤50（现实峰值 36）                 | P0  |
| TC-P-02 | 帧率   | 低端机    | 整局运行        | ≥30fps（高端 60）                     | P0  |
| TC-P-03 | 启动时长 | 冷启     | 进局          | 首帧可交互 <2s                         | P1  |
| TC-P-04 | 音频并发 | 连射+多事件 | 制造最坏叠加      | 同帧新启动 ≤2、全局并发 ≤4、峰值 ≤−1.0 dBFS    | P0  |
| TC-P-05 | 包体   | 全资源    | 构建产物        | Σ artifactFileSize ≤2MB（含 53 序列帧） | P0  |
| TC-P-06 | 图层   | 场景就绪   | `get_scene` | 顶层渲染层 ≤6                          | P0  |

---

## 三、边界与异常（专项说明）

1. **时序边界（最易出问题）**：
   - 40s 判定须以"HP 归零帧"优先于"计时器帧"（TC-B-03）——若二者同帧，**WIN 优先**，避免"最后一发打死却判失败"。
   - 阶段阈值用 `≤` 且**串行从高到低**判定（implement-plan §2.1.5：`hp≤0 → feign → shield≤0.33 → enrage≤0.66`），避免 HP 一次掉跨两个阈值时的漏判（如从 70% 一枪到 30%）。
   - 假死触发带为 **10%–20%**，须防"跳过该带"（单发 80 命中最坏一次跨 3.3% 血）——若在护盾期单发伤害被 ×0.20 后更小，风险低；但**暴击 120 或全额窗内**需验证不会一步跨过 240–480 带。
2. **资源缺失/失败边界**：**头像双轨兜底**（轨 A 未选/超时 → 默认第 1 款；轨 B 取像失败 → 回落轨 A）必须**全程不阻断进局**（INT-08）；`get_script_logs` 不得出现 `[audio] missing`（AUD-10）。
3. **中断恢复边界**：相机中断/切后台**自动暂停不判失败**（TC-E-01/02）；RESET 必须**逐组件 stop()**，不得依赖"停用父节点"（`AudioRoot` 常驻 enabled，否则 BGM 跨局串声）——**这是集成层最易漏的一条**（INT-06）。
4. **数值边界**：射速闸门已收口 **`250ms`**（严格 4 发/秒；**原 `220ms` 口径已否决**，见 `game-design` L139）→ 登记号 `D-04`/`O-16`；弹匣 12、过热 24、超时 40s 均为硬边界。
5. **像素边界**：非 2 幂逻辑尺寸（96/24/160）**不得**强行 ×8 到 512（会破坏整数倍）——按"≤512 最大整数倍"（art-spec 裁定1），96→480、160→480。
6. **合规边界**：命中反馈**颜色禁用红 `#d04648`**（会被读成"血"）；红色只留 UI 血条与暴怒眼（game-design §4.3）；闪白必须 `#deeed6` 而非 `#ffffff`（否则破 16 色板，ART-01 直接挂）。

---

## 四、性能与兼容验收

| 指标      | 目标                                   | 验收方式                       | 超阈处置             | 依据                                  |
| ------- | ------------------------------------ | -------------------------- | ---------------- | ----------------------------------- |
| 帧率      | 低端机 ≥30fps / 高端 60                   | 真机录制帧率                     | 降粒子/裁资源          | tech-spec §3.3                      |
| 图层      | ≤6                                   | `get_scene` 顶层渲染层          | 门禁：>6 并入，不进阶段4   | tech-spec §3.1                      |
| 粒子      | ≤50                                  | 逐帧 Σ aliveParticleCounts   | >50 硬停、>46 阶梯削   | vfx-spec §3.4                       |
| 单贴图     | ≤512×512                             | 资源属性                       | 导入钳到 Size512     | tech-spec §3.1                      |
| 序列帧     | 单动作 ≤24（**已收口**：`AGENTS.md:55`「单条序列帧=一个动作 clip ≤24」）                  | 目录计数（每动作分别计）                       | 超则删/降帧           | AGENTS §三（:55）、game-design §12           |
| 启动时长    | <2s                                  | 真机计时                       | 裁资源              | tech-spec §3.1                      |
| 包体      | ≤2MB                                 | Σ artifactFileSize（含 53 帧） | >2MB 按砍序回删       | AGENTS §三                           |
| 音频并发    | 同帧≤2 / 全局≤4 / 峰值≤−1dBFS              | 日志+离线合成                    | 软件限幅+优先级丢弃       | audio-spec §3.2                     |
| 端到端音频延迟 | **分路径**：开火音 touch→出声 ≤50ms（理想 ≤35）；命中音 判定→出声 容差 ≤1 帧。**最坏 ≈98ms / 劣化 ≈131ms**               | 真机画音同轨                     | 预热+开火音提前；仍超标上报阻塞 | audio-spec §7.4（**合格 ≈98 / 劣化 ≈131，头号风险**）   |
| 震动幅度    | 单帧 ≤4px、只平移不旋转                       | 逐帧读位移                      | 覆盖不叠加            | vfx-spec §6.2                       |
| 兼容/安全区  | 720×1280 安全区；底部 180px/交互中心 y≤-460 禁区 | 运行态截图 + 宿主 UI              | 挪热区出禁区           | scene-game.md:4-8、Touch/SKILL.md:40 |

> **包体口径提醒（v1.2 补）**：红线判据 = **最复杂单帧 `artifactFileSize ≤ 26.8 KB`**（⇒53 帧上界 ≤2048 KB）**或** **全量 `Σ artifactFileSize` ≤ 2048 KB**（`tech-spec` §3.2.1 单点规则；两读数均须**压缩开 + Size512**）；`≈1.45 MB` 只是**中值**（`tech-spec` §3.2）——最坏档（序列帧多接近单帧上限 28–45 KB）×53 ≈ **2.10–3.00 MB 会破线**，故包体在**首批真实序列帧实测前不作"已相容"结论**（= O-08）。

**兼容性说明**：低端机机型清单属平台侧动态信息（tech-spec §3.3），以 Effect House 官方档位文档为准；**平台规则可能随时变化**（tech-spec §5 风险提示）。

---

## 五、缺陷清单与缺陷定级标准

### 5.1 缺陷定级标准（P0–P3）

| 级别        | 定义                                                                               | 判定示例                                               | 处置                 |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| **P0 阻断** | 触及**合规红线**（AGENTS §一 10 条任一条）；或破**像素死参数**（图层>6 / 粒子>50 / 包体>2MB / 色板越界）；或核心玩法不可用 | 命中粒子用红 `#d04648`（读成血）；出现惨叫；包体 3MB；顶层 7 层           | 必须修，修完重验，不得带 P0 提审 |
| **P1 严重** | 破像素死参数但可通过砍资源修复；或**高影响口径/机制未收口**可能导致返工；或关键反馈缺失                                   | 序列帧口径收为"全局"→47 帧不合规；端到端音频延迟最坏 98ms 未实测；护盾血条语义分歧未对齐 | 交付前必须关闭或给出书面豁免     |
| **P2 一般** | 只有**表现不达标**（手感/观感/文案），不影响功能与合规                                                   | 换弹按钮坐标内外不一致（D-06）；BGM 与用户音乐冲突（产品取舍）；后坐力 3px 略晕     | 记录，迭代修             |
| **P3 建议** | 优化项、技术债                                                                          | 粒子非像素步进；结算卡非预烤模板；`ShootHandler` 未拆 WeaponView      | 记 backlog          |

> **明确规则**：**触及合规红线 = P0**；**破像素死参数（图层/粒子/包体/色板）= P0/P1**（结构性的 P0，可回删修复的 P1）；**只有表现不达标 = P2/P3**。

### 5.2 本轮缺陷清单（首轮 = **规格/文档级**发现，非运行态 bug）

> **重要前提**：工程未开始，**无任何运行态缺陷**。以下全部是**方案层**的缺口/矛盾/未收口项。级别按"若落地将造成的影响"预判。

| 编号   | 描述                                                                                                                                                                                                            | 复现/定位步骤                                                                        | 级别                                       | 建议处理                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | **序列帧 24 帧口径未收口**（**已关闭**）：「单动作 ≤24」vs「全特效总量 ≤24」→ 平台文档不解决，纯宪法口径问题 | 打开 `AGENTS.md:55`（**已澄清**：「**单条序列帧（一个动作 clip）** 帧数 ≤24……**不是全特效所有帧之和**」，2026-10-13 澄清，changelog:132） | **已关闭** | **结论**：口径 = **单动作**；Boss 47 帧 = 多动作分别计数、每动作 ≤24 ⇒ **合规、不返工**。对应开口项 **O-09 关闭** |
| D-02 | **端到端音频延迟最坏 ≈98ms 未实测**，超"不发飘"上限；直接打击"打击即时感"（乐趣来源第 1 位）                                                                                                                                                       | audio-spec §7.4、implement-plan §六-5                                            | **P1**（潜在 P0）                            | 责任人：主程序真机实测；仍超标上报阻塞（§八 O-03）                                                                                                                             |
| D-03 | **护盾期血条语义分歧**（**已关闭**）：game-design §4.2「普通命中造成 20% 伤害（HP 降）」vs art-spec §3.4「护盾条清空才回到红条下降」 | `game-design-doc` L145「护盾期 · HP = **冻结（不降）**」+ L304「护盾期红条**冻结**、蓝盾条＝破盾进度」 | **已关闭** | **结论**：护盾期 **HP 冻结**、护盾为独立盾量层（破盾后才回 HP 下降）—— game-design 已采纳 art-spec 口径。对应 **O-19 关闭** |
| D-04 | **射速口径**：设计案同时给"4 发/秒"与"220ms 冷却"（220ms⇒4.545/s）                                                                                                                                                              | 复算 `1000/220=4.545`（§0.1#24）；**音频影响复核**：audio-spec §3.2.2「射速口径不敏感」证明（§0.1#25）  | **P2**                                   | 责任人：游有方；建议以 220ms 为闸门或改 250ms。**音频影响：无** —— audio-spec §3.2.2 已证"4 发/秒"与"220ms"两种口径下本方案**稳态零重叠、同帧≤2/全局≤4 上限不变，均成立**；此项已从"音频风险影响面"划掉；**闸门口径已收口 = `250ms`**（`game-design-doc` L139，原 220ms 已否决），**本缺陷关闭**（纯玩法数值，音频侧不受影响） |
| D-05 | **破盾次数 & 破盾后是否回盾未定**（**已关闭**）：`SHIELD_CORE_HITS_REQUIRED` 无具体次数；2s 全额窗后是否重开盾未明 | `game-design-doc` L147「≈3 次核心命中破盾（`SHIELD_CORE_HITS_REQUIRED = 3`）」+ L149「回盾轮数上限 **2 轮**」 | **已关闭** | **结论**：破盾 = **3 次**核心命中；**回盾上限 2 轮**（第 2 轮窗口后盾永久消失，余血由假死收尾）。对应 **O-17 / O-18 关闭** |
| D-06 | **换弹按钮坐标内外不一致**（**已关闭**）：game-design §3.3「换弹按钮 Y[-350,-250]（中心≈−300）」vs art-spec §八-9/§3.5「按钮中心 Y ≥ −220」 | `game-design-doc` L92「按钮中心 **Y ≥ -220**」+ L85/L270/L287/L311「UI 落位带……以 art-spec 为准」 | **已关闭** | **结论**：game-design 已采纳 art-spec 口径（按钮中心 **Y ≥ −220**），两文件对齐。**注：两者相对平台 −460 阈值均安全** |
| D-07 | **audio-spec/implement-plan 待实测② 引用不存在的 API**：`APJS.Time.timeScale` 在本机 APJS 中**不存在**（仅有 Physics2D.timeSpeed / Physics3D.timeScale）                                                                           | `grep timeScale APJS.d.ts`（§0.1#7）                                             | **P2**                                   | 责任人：雷鸣远/寇豆码；该实测项**已被 node-plan §1.4 判定为不可能场景**，建议直接关闭并注明"方法描述过时"                                                                                         |
| D-08 | **BGM 与用户音乐冲突**（占音频体积 73%）：抖音场景用户极可能叠自有 BGM                                                                                                                                                                   | audio-spec §3.3.5、§10.3-5                                                      | **P2**（产品决策）                             | 责任人：team-lead/游有方；BGM 为音频第一可砍项                                                                                                                           |
| D-09 | **粒子 S7 理论全叠加 = 50 = 红线本身**（余量 0；非缺陷，须管理器 + 运行态实测）                                                                                                                                                 | vfx-spec §3.3 S7                                                               | **P3**（记录）                               | 单靠内容约束**不足**——S7 恰等于红线、余量 0；须由运行时预算管理器（>46 阶梯 / >50 硬停）兜底，**达标不得由算式自证，须运行态实测 `aliveParticleCounts` ≤50**；**不单列缺陷**，仅登记                                                                     |
| D-10 | 上游一处**方法描述夸大**：tech-spec §1 称社交 API"grep 全库零命中"，实际字面命中 21 文件（皆误命中）；结论正确、描述不严谨                                                                                                                                 | §0.1#16                                                                        | **P3**                                   | 记录，不影响结论；建议改写为"无任何社交/通讯录 API 符号"                                                                                                                         |
| D-11 | **"MCP 28 工具"计数未复现 / 触发"≤2"无平台侧证据 / 序列帧 24 无平台侧证据**：三项均为宪法级或计数级，本轮**未覆盖**                                                                                                                                     | §0.1#21/#22/#23                                                                | **P3**                                   | 记录为"未覆盖"，不臆断；相关约束仍按宪法执行                                                                                                                                  |
| D-12 | **animation-spec §3.3 表内残留旧值 + 档位口径未完全对齐**：:229 单元格仍写「hitstop **40–70 ms**」，而其 §3.3 :235 的 v1.5 定案已收口为「普通 50 / 破盾 83 / 击杀 0」；且该硬对齐点**未列 `vfx-spec` 的「暴击·破盾核心 67ms」**                                          | 打开 animation-spec :229 vs :235，对照 vfx-spec :275-277（§0.1#25）                   | **P3**（文档卫生，不计为运行缺陷）                     | 责任人：关建帧（改 :229 旧值）+ vfx/animation 双方确认 **67ms 是否独立档**；**不影响运行，但会误导后续按 §3.3 建表者**                                                                         |
| D-13 | **本清单内部编号交叉引用错误（已自修）**：序列帧 24 帧开口项在 §8.1 定义为 **O-09**，但 §四/§5.3/§6.2/§8.3/§10.2 等 8 处误写为 **O-01**（O-01 实为 ClampForever）                                                                                       | 本版全量 grep `O-01` 复核并已改 `O-09`                                                  | **P3**（文档卫生，已闭环）                         | 已修（v1.1）；登记以警示后续引用"逐条 grep 校验"                                                                                                                           |
| D-14 | **包体口径"把最坏情形藏起来"（已由 team-lead 勘误 + tech-architect 自修）**：`tech-spec` §3.2 早前把 `0.83 MB ÷ 53 = 15.7 KB/帧`（**中值**）标成"保守锚点 28–45 KB/张"，使总包体看起来"1.45 MB 很宽松"；实际 28–45 KB 是**单帧上限**，最坏档 **≈2.10–3.00 MB 会破 2MB 红线** | 复算 `53×28=1484 KB`、`53×45=2385 KB`；对照 `tech-spec` §3.2 三档表（§0.1#25）            | **P3 文档/估算卫生**（**潜在 P0 风险已被前置拦截，未流入产物**） | 已修：`tech-spec` §3.2 改**三档 + 明写最坏**；**O-08 判据收紧为"实测 `Σ artifactFileSize` ≤ 2048 KB"**，1.45 MB 只作中值预期（本清单 §8.1/§10.1 已同步）。**教训：中值不得当保守值，最坏档必须显式列出**        |
| D-15 | **本清单一处“仍然活着”的错误结论（已由 tech-architect 扫出、本轮改正）**：§0.1#17 把已废止的 「相册选图 `Image Picker (Head)`」断言为**可行事实**（“B2 主案可行 / 采信·复现”），且对象名**误引**（目录实为 `(Portrait)`） | 对照 §0.1#17 旧文本 vs `tech-spec §9.1`、`APJS.d.ts`（`grep -i picker`=0）、`object_catalog.json:966` | **P2**（文档级；**若未纠正会误导主程按已废止路径排工期**） | **已修**：§0.1#17 改判「不采信·结论推翻」；连带改 §1.1/§1.6/§2.3/§2.4/§三/§5.3/§7.1/§8.1(O-04)/§九 共 10 处相册·抠头·权限断言（本轮全部改为**双轨**口径）。**教训：上游旧结论在路径废止后必须全库扫残留，不能只改被点名处** |

### 5.3 【拒收判据】——什么情况下必须拒收本版本

出现以下**任一**，即**拒收（不通过）**，不得进入提审准备/编译环节：

1. **触及合规红线任一条**（AGENTS §一）：含他人头像但无授权话术/可换脸；出现血/惨叫/身体碎片；出现人声采样；文案含"杀死/击杀/爆头"；含"绕过审核"表述 → **P0 拒收**。
2. **破任一像素死参数**：顶层渲染层 >6；任意时刻粒子 >50（且管理器失效）；总包体 >2MB；导出 PNG 出现 DB16 外颜色；alpha 出现中间值 → **P0 拒收**。
3. **触发方式 >2 种** 或叠加第三种触发 → **P0 拒收**。
4. **有 UI 元素落入底部 180px 录制禁区**（运行态截图证实，非坐标表）→ **P0 拒收**。
5. **核心玩法阻断级缺陷**：射击/命中/掉血/阶段/胜负 任一条链不通；失败无法 1 次点击重开；头像四种兜底有任一阻断进局 → **P0 拒收**。
6. **高影响开口项未关闭且无书面豁免**：序列帧 24 帧口径（O-09）、端到端音频延迟（O-03）、包体压缩门禁（O-08/PX-06）→ **不得进入"编译打包/提审"**（可继续在工程实现阶段推进）。
7. **素材版权/授权留痕有空项**（`assets/SOURCES.md` 缺项）→ 合规禁止提审（AGENTS §一/§五）。

### 5.4 上轮缺陷当前状态

**N/A**（首轮验收，无上一轮缺陷）。按取证纪律第 3 条留白，不伪造。

---

## 六、验收结论

> 结构遵循取证纪律第 3 条：`AC 编号 → 逐条实测证据 → 上轮缺陷状态（N/A）→ 本轮新增缺陷 → 可交付判定`。

### 6.1 逐条实测证据（按模块汇总）

| 模块     | AC 数 | 本轮已实测证据                                                                          | 覆盖率评估                        |
| ------ | ---- | -------------------------------------------------------------------------------- | ---------------------------- |
| 玩法 PLY | 13   | 数值算式复算（§0.1#24）；安全区/超时/触发 规则与证据已复核（§0.1#2/#3/#23）                                | **方案层 100% 可核；运行态 0**（工程未开始） |
| 美术 ART | 14   | ART-01/02/03 已由 `pixel_spec_check.py` 对规格合成样本验证（6/6）；ART-09 安全区见 INT-10/§四       | 工具与规格层可核；真实资产 0              |
| 动画 ANM | 12   | ANM-01 帧数复算（47/53 ✅）；ANM-11 包体口径复核（animation-spec §11.6）                         | 规格层可核；运行态 0                  |
| 特效 VFX | 13   | 粒子峰值算式（S6=36/S7=50 ✅）；VFX-13 命名、VFX-11 尺寸 规格可核                                   | 规格层可核；运行态 0                  |
| 音频 AUD | 19   | AUD 平台依据逐条复核（§0.1#8–12：pitch 缺失/mp3/play-alone/Infinity/日志验收 全部复现）；AUD-08 体积算式 ✅ | 平台依据层**强覆盖**；运行态 0           |
| 集成 INT | 10   | 全部为**新增**集成项，依赖运行态，**本轮未实测**（工程未开始）                                              | 0（待工程落地）                     |
| 像素 PX  | 7    | PX-01/02/03 工具自验通过；PX-04/05/06/07 依赖运行时/构建                                       | 3/7 工具就绪，4/7 待工程             |

### 6.2 可交付判定（本轮）

**结论：✔ 有条件通过（限"方案/规格层提审准备包"验收通过）；✘ 不具备"提交平台审核"条件。**

- **通过的部分**：上游 8 份文档**互相自洽度较高**；关键平台依据（§0.1 采信矩阵 21 条复现）**逐条本机复核为真**；数值/体积算式**全部自洽**；四份资产验收清单 + 玩法清单**结构完整、可判定**；像素核查工具已自验可用。
- **"有条件"的前提（未关闭则不能进"编译打包/提审"）**：
  1. 关闭 O-09 序列帧 24 帧口径（D-01）；
  2. 关闭 O-03 端到端音频延迟实测（D-02）；
  3. 关闭 O-08 包体压缩门禁（PX-06，含 53 序列帧）；
  4. 对齐 D-03 护盾血条语义、D-04 射速口径、D-05 破盾次数/回盾、D-06 换弹按钮坐标；
  5. **工程落地并完成全部运行态验收（INT-01..10 + TC 用例）后重跑本清单**。
- **不得越过的红线**：**当前状态是"方案已就绪、工程未开始"（MCP 用户确认闸门未开）**，本判定**不假设工程已完成**，也**不为任何运行态指标背书**。

---

## 七、合规专项验收（红线逐条给"怎么验"）

> 原则：**给可操作验证动作，不复述结论**。红线编号沿用 AGENTS §一 与 game-design §十一。

| 红线                 | 是否相关    | **怎么验（可操作动作）**                                      | 依据                                      |
| ------------------ | ------- | --------------------------------------------------- | --------------------------------------- |
| ① 非自愿换脸/深度伪造（他人头像） | **强相关** | 见 §7.1（三条专项）                                        | AGENTS §一-1、game-design §6.1            |
| ② 色情低俗             | 不相关     | 全量贴图人工过一遍（像素怪兽无性化元素）；文案词表扫                          | AGENTS §一-2                             |
| ③ 赌博/毒品/违禁品        | 不相关     | 全量贴图/文案扫描                                           | AGENTS §一-3                             |
| ④ 血腥暴力/恐吓/自残       | **强相关** | 见 §7.2（视觉 + 音频三道闸门）                                 | AGENTS §一-4、vfx-spec §7、audio-spec §6.3 |
| ⑤ 未成年人不当形象         | 不相关     | 确认无儿童形象/音效（audio-spec §6.1-6 禁婴儿哭声）                 | AGENTS §一-5                             |
| ⑥ 歧视/仇恨/侮辱特定群体     | 不相关     | 原创怪兽无群体指向；文案扫                                       | AGENTS §一-6                             |
| ⑦ 政治敏感/谣言          | 不相关     | 无政治元素                                               | AGENTS §一-7                             |
| ⑧ 医疗功效承诺           | 不相关     | 名称/图标/描述无功效承诺（提审清单项）                                | AGENTS §一-8                             |
| ⑨ 仿冒官方/银行/支付       | 不相关     | 无官方标识/金融界面                                          | AGENTS §一-9                             |
| ⑩ 教用户规避审核          | 不相关     | **提审文案全文扫**"绕过/规避/破解"类词；命名无 `final/new/copy/temp` 等 | AGENTS §一-10、audio-spec §5.4            |

### 7.1 专项①：他人头像（合规命门）——三条验证动作

1. **"未选/失败走默认头像且不阻断"验证**：真机逐个走 **4 分支**（未选图 / 主动跳过 / 抠头失败 / 权限被拒），每分支断言 **3s 内进入 FIGHTING**、`FaceImage` 显示 `avatar_placeholder`（前 3 分支）或 `avatar_placeholder_locked`（权限拒）→ 对应 INT-08 / TC-E-03/04/05。（依据 game-design §6.2、implement-plan §2.1.6）
2. **"授权话术必弹"验证**：首帧选图流程打断点/录屏，断言**在 `Image Picker (Head)` 拉起之前**授权话术文本「头像仅用于本局娱乐，请确认已获得对方同意」已显示且需用户确认。（依据 game-design §6.1-5）
3. **"头像仅静帧、不作表情驱动/不换脸"验证**：① 代码层扫 `FaceImage` 是否绑定任何表情/口型/人脸 landmark 驱动（应**无**）；② 视觉层核对头像 = 16×16 像素贴片 + 相框，**不覆盖 Boss 独眼**（ART-13 四重手段）；③ 确认无网络上传调用（无 UGC/无上传）。（依据 game-design §6.1-4、art-spec §3.2、tech-spec §5）

### 7.2 专项④：血腥暴力/恐吓——逐帧 + 音频三道闸门

- **视觉**：逐帧过全部状态（IDLE/受击/暴怒/护盾/假死/认输/失败），断言 **无血/无伤口/无身体碎片/无惨叫图形**；命中只闪白+抖动+**白/黄**像素星（**红色 `#d04648` 不得出现在命中反馈**）；终结为彩带+星+举手^^。（vfx-spec §7.1、game-design §4.3/§4.4）
- **音频三道闸门（audio-spec §6.3，可执行）**：
  1. **惊吓闸门**：任何音效 `attack ≥5ms`；且任意 1s 窗口响度不得比前一秒 1s 均值高 12 LU 以上 → **离线分析每个音频文件的包络 attack 与短时响度**。
  2. **低频闸门**：**禁 <60Hz 持续（>200ms）能量**；全包最低音 = `sfx_boss_land` 的 55Hz 瞬时下扫（≤120ms）→ **FFT 检查每个文件低频持续时长**。
  3. **零人声闸门**：全包不含任何人类语音/人声采样（含 TTS、含"哈哈"式真人笑声）→ **频谱 + 听觉双确认 + SOURCES.md 来源清单**。  
     （对应 AUD-06/07/15）

### 7.3 专项：去暴力语义——全量文案扫描

- **动作**：对**全部文案资产**（标题字 `ui_word_*`、状态页文案、调侃文案、提示"它装的！"、提审描述、命名）执行词表扫描，**禁词**：`杀死 / 击杀 / 爆头 / 献kill / 死亡 / 血 / 惨叫`；**允许词**：`放倒 / 击退 / 挑战成功 / 认输 / 它跑掉了`。
- **判据**：禁词命中 = 0（TC-C-05）；命名无 `final/new/copy/temp`（audio-spec §5.4）。（vfx-spec §7.1、game-design §6.1-1）

---

## 八、★ 验收开口项（不得绕过）

> 把 implement-plan §六 的 **15 项待实测** 与 **4 个待设计确认缺口** 逐条转为"验收开口项"：**谁负责关闭 / 什么证据算关闭 / 未关闭时是否阻断交付**。  
> **"阻断"含义**：阻断进入 §五 构建步骤的**编译打包/提审**；不阻断"工程实现"阶段推进（除非该实测是结构性的，如 O-09）。

### 8.1 15 项待实测 → 开口项

| 编号   | 开口项（源自 implement-plan §六）                                    | 负责关闭                                    | 什么证据算关闭                                                                                                                                                                                                                                                                                                                                      | 未关闭是否阻断交付                                                |
| ---- | ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| O-01 | **`AnimatedTexture.playMode` 是否含 `ClampForever`** → 影响三保持态实现 | 柯桥良（**已由 animation-spec §11.7 收口：不支持**） | 本机 `APJS.d.ts` 已核：`AnimatedTexturePlayMode` 仅 4 值（**= 我已独立复现，事实成立**）                                                                                                                                                                                                                                                                         | **不阻断**（已关闭；退路①=末帧静态 Image）                              |
| O-02 | Basic Particles 发射率键名（是否有 `rate`）                            | 主程序（落工程第一步 `hasFloatKey` 实探）            | 日志确认真实键名；无则改用 `setEnabledInHierarchy(false)`/`Lifetime`                                                                                                                                                                                                                                                                                      | 不阻断（有退路，硬保证来自 `stop(StopEmitting)`）                      |
| O-03 | **端到端音频延迟（touch→出声）** | 主程序（真机，测 10 次取最坏） | 真机画音同轨测得的**最坏值**。**口径双值**：**合格实现串行上限 ≈98ms**（=33+25+40）/ **劣化上限 ≈131ms**（判定音晚 1 帧 =33+33+25+40）；**两者均 >50ms「不发飘」上限** ⇒ 无论取哪个都是音频侧头号风险。**判定**：≤50ms 判过；>50ms 走降级；仍超标**上报阻塞** | **★ 阻断（真机未测）** → 关闭前不得进提审 |
| O-04 | ~~相册选图权限流与抠头产出~~ **已废止** → 改为 **轨 B 摄像头取像真机验证**（`node-plan §7` 第 10 项） | 主程序（真机） | 真机脚本：`APJS.CaptureFrameHelper.captureCameraOutput(cam, Rect, ratio)` → 赋 `Image.texture`；逐点验 `tech-spec §9.4` a–e 五点（含自身HUD / 方向长宽比 / 调用时机 / 引用还是拷贝 / 首帧时序）。**任一点不利 ⇒ 轨 B 记「已登记未落地」，由轨 A 兜底** | 不阻断（轨 A 预设兜底；轨 B 未验不阻断提审） |
| O-05 | 陀螺仪 `GyroSensorAgent`（@alpha）                                | 主程序（最小脚本）                               | 日志 `isValidData()/getData()`；不可用则砍氛围层                                                                                                                                                                                                                                                                                                        | 不阻断（主方案不依赖）                                              |
| O-06 | MP3 在 `playMode=INFINITE` 下的循环接缝                             | 主程序 + 雷鸣远                               | 连录 ≥60s 标记循环边界，听无接缝（对应 AUD-12）                                                                                                                                                                                                                                                                                                               | 不阻断（有资产级缓解）                                              |
| O-07 | 26 音频对象是否占 ≤6 视觉图层                                           | 柯桥良确认                                   | `get_scene` 看音频对象 render group 归属；**我已复核其依据（音频无渲染输出；`renderGroupType` 不可作判据）**                                                                                                                                                                                                                                                               | 不阻断（推测不占，且已有"挂父对象"退路）                                    |
| O-08 | **纹理压缩后是否出现像素块状伪影 / 包体门禁**                                   | 主程序（门禁）+ 柯桥良                            | **判据（满足其一即关闭）**：① **最复杂帧 `artifactFileSize ≤ 26.8 KB`**（= `(2048−275−349)÷53`；则 53 帧全按此上界也 ≤2048 KB）**或** ② **53 帧全量 `Σ artifactFileSize`（压缩开+Size512）≤ 2048 KB**。⚠️ 两读数**必须在压缩开启 + `Max Resolution=Size512` 下读**（未压缩读到的是 ≈1 MiB/张显存体积，对包体无判定意义）。**`>26.8 KB` 则扩样 3 张定分布**（最复杂/典型/纯色，`tech-spec` §3.2.1）。**首批真实帧出数前，"总包体 <2MB" 未获证实、只是中值推算** | **★ 阻断进提审**；但**若最复杂单帧 ≤26.8 KB 则提前降级为非阻断**（不必等全量 53 帧导出） |
| O-09 | ~~「序列帧 ≤24」单动作 vs 全局~~ **已关闭** | 柯桥良收口 + team-lead | `AGENTS.md:55` 已澄清：**单条序列帧 = 一个动作 clip ≤24，不是全特效帧数之和**（2026-10-13，changelog:132） | **不阻断（已关闭）** → 见 D-01 |
| O-10 | `getSlamInfo().planeDetected` 可用性                            | 主程序                                     | 最小脚本打印 + 真机                                                                                                                                                                                                                                                                                                                                  | 不阻断（主方案不依赖平面跟踪）                                          |
| O-11 | `hitstop` 是否影响音频速率/音高                                        | **已关闭**（主程序 + audio-director 复核）        | **证据已齐**：本方案 hitstop 只 `AnimatedTextureProvider.pause()` 单 provider（不动全局时间），且 `APJS.Time.timeScale` **不存在**（D-07，本机 grep 复现）→ 命中音 140/250ms **不受影响**。audio-director 确认判断正确                                                                                                                                                                   | **不阻断（已关闭）**                                             |
| O-12 | 宿主是否暴露分享/保存能力                                                | team-lead + 主程序                         | 预览录制流程观察 + 查官方文档                                                                                                                                                                                                                                                                                                                             | 不阻断（只做结算画面+提示文案）                                         |
| O-13 | `mute` 属性运行时可否修改                                             | 主程序                                     | 脚本改 `mute` 看生效；不可则走 `volume=0`                                                                                                                                                                                                                                                                                                               | 不阻断（有退路）                                                 |
| O-14 | `generate_audio` 输出实际时长/响度/ID3                               | 雷鸣远                                     | 生成 1 条实测 `duration` + 文件大小；复核体积核算                                                                                                                                                                                                                                                                                                            | 不阻断（影响体积核算精度）                                            |
| O-15 | 动真 Camera 是否影响摄像头透传                                          | 主程序                                     | 对照实验（已选安全路径，仅冗余确认）                                                                                                                                                                                                                                                                                                                           | 不阻断（已选 `ContentRoot`）                                    |

### 8.2 4 个待设计确认缺口 → 开口项

| 编号   | 开口项                                                  | 负责关闭      | 什么证据算关闭                 | 未关闭是否阻断交付                                                              |
| ---- | ---------------------------------------------------- | --------- | ----------------------- | ---------------------------------------------------------------------- |
| O-16 | **射速口径**：4 发/秒 vs 220ms 冷却（220ms⇒4.545/s）            | 游有方       | **已收口：闸门 = `250ms`**（`game-design` L139，原 220ms 已否决） | **已关闭** → 见 D-04。**音频影响：无**（audio-spec §3.2.2 两种口径均成立，§0.1#25） |
| O-17 | ~~**护盾破盾所需核心点命中次数** `SHIELD_CORE_HITS_REQUIRED`~~ **已关闭** | 游有方 | `game-design-doc` L147：`SHIELD_CORE_HITS_REQUIRED = 3`（≈3 次核心命中破盾） | **已关闭** → 见 D-05 |
| O-18 | ~~**破盾 2s 窗后是否回盾**~~ **已关闭** | 游有方 | `game-design-doc` L149：**回盾轮数上限 2 轮**（第 2 轮窗口后盾永久消失，余血由假死收尾） | **已关闭** → 见 D-05 |
| O-19 | ~~**护盾期血条语义**：HP 降 20% vs 护盾条先清~~ **已关闭** | 游有方 + 甄塑之 | `game-design-doc` L145：护盾期 **HP 冻结（不降）**，护盾为独立盾量层；两文件已对齐 | **已关闭** → 见 D-03 |

### 8.3 两个高影响项（特别标注）

- **★ 端到端音频延迟（O-03）**：最坏 ≈98ms 已超"不发飘"上限，是**音频侧头号风险**，直接决定"打击即时感"（乐趣来源第 1 位）。**未实测前不得进提审。**
- **★ 序列帧 24 帧口径（O-09/D-01）**：若平台口径为"**全局总量**"，则 47 帧 Boss 序列**整体不合规**，需返工"极限版"（≈48 帧仍超）或更激进 Tween 化 —— **这是唯一可能导致前 3 阶段返工的口径项**，必须最先收口。

---

## 九、提审清单（对照宪法 AGENTS §五 七项逐条打勾）

| # | 宪法提审项                                   | 检查方法                                  | 当前状态                    | 责任归属              |
| - | --------------------------------------- | ------------------------------------- | ----------------------- | ----------------- |
| 1 | Effect House **真机预览通过**（张嘴/转头/光线变化下不穿帮） | 真机预览 + 分时截图；含相机中断/权限流                 | **待补**（工程未开始）           | 团队（技术面）           |
| 2 | **合规 10 条逐项自检通过**                       | §七 逐条验证动作                             | **待补**（方案层已自检；运行态未验）    | 团队                |
| 3 | **素材授权/来源记录齐全，随包存放**                    | 核对 `assets/SOURCES.md` 无空项（含 AI 产出登记） | **待补**（文件尚未产出）          | 团队 + **用户**（版权确认） |
| 4 | 全部贴图**符合像素规格**（色板/尺寸/采样/命名）             | PX-01..07 脚本 + 属性检查                   | **部分就绪**（工具已自验；真实资产未产出） | 团队                |
| 5 | 名称/图标/描述**无违规词/无功效承诺/无冒官方**             | 文案词表扫描 + 人工核                          | **待补**                  | 团队 + **用户**（最终定名） |
| 6 | **性能达标（低端机可跑）**                         | 真机帧率/启动/包体                            | **待补**（依赖运行态）           | 团队                |
| 7 | **提审文案独立成文，不含"绕过"类表述**                  | 全文扫 + 人工核                             | **待补**                  | 团队 + **用户**       |

**属"用户/第三方"才能做的项（团队不承诺"必过"，只给技术面自查结论）**：

- **账号资质 / 开发者认证**：抖音特效开放平台账号、开发者资质 → **用户/第三方**。
- **平台审核结果**：能否过审、过审耗时 → **平台侧**，团队不可控。
- **法务/版权确认**：所选相册照片的授权（用户自认已获授权）、AI 生成素材的商用授权链条 → **用户 + 法务**。
- **低端机机型清单 / 分成比例 / 权限口径**：属平台侧动态信息（tech-spec §5 风险提示）→ **以官方现行文档为准**。

> **结论口径**：本清单给出的是**技术面自查结论**，**不构成"必过审"承诺**。

---

## 十、版本交付判定

### 10.1 明确结论

> **当前状态（事实）**：方案已就绪（8 份上游文档齐备、内容自洽度高、平台依据已逐条复核）；**工程未开始**（像塑 MCP 用户确认闸门未开，未执行任何改工程/生成资产动作，未产生任何资产与运行态证据）。

- **本轮（方案/规格层）验收结论：✔ 有条件通过。**
  - 作为"**制作与提审准备包**"，文档与规格层**通过验收**：验收条件完整、可判定；平台依据 21 条复现为真；数值/体积算式自洽；核查工具自验可用。
- **能否进入"提审准备"：✔ 可以 —— 但仅指"进入工程实现 + 运行态验收阶段"。**
- **能否"提交平台审核"：✘ 不可以（当前不具备条件）。** 理由：工程未落地，**0 项运行态验收完成**，`Σ artifactFileSize`、粒子峰值、音频延迟、图层数等**全部未实测**。其中 **「总包体 <2MB」亦未获证实** —— `≈1.45 MB` 仅为**中值口径**，最坏档（序列帧多接近 28–45 KB/帧）可达 **≈2.10–3.00 MB、直接破线**（见 O-08 / `tech-spec` §3.2；收口动作见 §3.2.1 单点规则：**最复杂单帧 ≤26.8 KB 即提前判过**）。

### 10.2 进入下一步（编译打包/提审）的**前提条件（必须全部满足）**

1. **用户确认方案**（MCP 用户确认闸门开启）→ `save_plan(confirmed)`。
2. **工程落地并零编译错误**（`run_otsc_check` 通过，implement-plan §五 步骤 0–10 完成）。
3. **关闭 3 个阻断级开口项**：O-09/D-01（序列帧口径）、O-03（音频延迟）、O-08（包体压缩门禁）。
4. **对齐 4 个设计缺口**：D-03 护盾血条语义、D-04 射速口径、D-05 破盾次数/回盾、D-06 换弹按钮坐标。
5. **运行态验收全绿**：INT-01..10 + TC-F/B/E/C/P 全部 P0 用例通过。
6. **提审清单 7 项**：第 1/2/4/6/7 项团队自查通过；第 3/5 项含用户方确认。
7. **无 P0 缺陷残留**；P1 缺陷已关闭或书面豁免。

### 10.3 一句话交付判词

**方案层：可交付（有条件通过）；提审层：当前不可交付（工程未开始、0 实测）。** 待用户开启确认闸门、工程落地、并按 §10.2 关闭全部阻断项后，用本清单（沿用 AC 编号）**逐条重跑复签**。

---

## 十一、验收依据附录 · 引擎 / schema 事实（tech-architect 提供，行号级可复现）

> **用途**：为 §0.1 采信矩阵与 §八 开口项提供**行号级证据底座**，供 QA / 主程**直接引用、可直接重跑**。  
> **证据根**：`D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\McpTool\resources\workspace\APJS\`（另有 `knowledge/schemas/`）。  
> **生成方式**：`grep -n` / 逐行阅读 / `python` 读 JSON。**未调用任何 MCP 工具、未修改任何工程文件。**  
> **行号时效**：基于本机当前 `*.d.ts`；像塑版本更新后行号会漂移 → **判据以符号名 + 枚举值为准，行号仅作定位**。

### 11.1 五条硬事实（团队共同引用基线）

| #       | 事实（一句话）                                                     | 行号级证据                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 复核命令                                                                                               | 对验收的意义                                                                       |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **F-1** | **`AnimatedTexturePlayMode` 无 `ClampForever`**              | `APJS.d.ts:327` `enum AnimatedTexturePlayMode { Forward=0, PingPong=1, Randomize=2, Shuffle=3 }`；`ClampForever=-2` 仅存于 `enum AnimationWrapMode`（`APJS.d.ts:536`，值为 `:544`）                                                                                                                                                                                                                                                                                  | `grep -n -A6 "enum AnimatedTexturePlayMode" APJS.d.ts`                                             | 关闭 **O-01**；三保持态走"末帧静态 `Image`"退路①                                           |
| **F-2** | **`Physics3D.timeScale` 只缩放 3D 物理；引擎无全局时间轴**                | `APJS.d.ts:6404-6405` `static get/set timeScale`，归属 `Physics3D`，`:6399` 注「**3D physics** simulation time multiplier… **Not reset** on record start」；`Physics2D.timeSpeed` 在 `:6335`，注「Scales how fast the **2D physics** simulation steps forward」；**两文件均无 `class Time` / `namespace Time`**（`grep -c` = 0）                                                                                                                                                 | `grep -n "class Time\|namespace Time\|timeScale\|timeSpeed\|unscaled" APJS.d.ts APJS_runtime.d.ts` | 关闭 **O-11 / D-07**；hitstop 不依赖全局时间（`setBossAnimPause()` 只冻 Boss）             |
| **F-3** | **`AudioComponent` 设计期属性 ⊋ 运行时接口**                          | **设计期**（`knowledge/schemas/component_schemas.json` → `AudioComponent.properties`）：`playMode` ∈ **{ONCE, LOOP, INFINITE}**（默认 ONCE）、`audioType` ∈ {BGM, AUDIO_EFFECT}、`loopCount`（默认 1，范围 **[1, 99999999]**，条件 `playMode == LOOP`）、`autoPlay`、**`mute`**、`volume`（[0,100]）、`isMobilePreview`。**运行时**（`AudioComponent.d.ts`）：仅 `loopCount:17` / `volume:23` / `duration`(只读) / `isFinished:37`(只读) / `play():48` / `pause():42` / `resume():53` / `stop():58` | `python` 读 `component_schemas.json`；`grep -n . AudioComponent.d.ts`                                | **关闭 O-13**（见 §11.3）；**BGM `INFINITE` 必须设计期设死**（运行时改不了）→ 轮次切歌**只能 `stop()`** |
| **F-4** | **手动 `stop()` 不置 `isFinished`**                             | `AudioComponent.d.ts:32-37`：「Whether playback has finished by **reaching the configured loop count**. A manual `stop()` **does not set this flag**; `play()` clears it before restarting」                                                                                                                                                                                                                                                                   | `sed -n '32,37p' AudioComponent.d.ts`                                                              | 轮次 / 停止判定**不得**轮询 `isFinished`，须用状态机标志                                       |
| **F-5** | **`AudioComponent` 无 `pitch` / `playbackRate` 属性；无运行时换绑素材** | **类体内零命中**：`AudioComponent.d.ts:11-59`（类定义全文）无 pitch / playbackRate / rate；`play()`（`:48`）注「restarts from the beginning」，**无换源参数**。⚠️ 注意别误读：`:71` `AudioDetectionType.Pitch` 是**实时音高检测器**枚举，**非播放速率控制**                                                                                                                                                                                                                                                     | `sed -n '11,59p' AudioComponent.d.ts \| grep -i "pitch\|rate"`（零命中）                                | 音高阶梯必须**预烘焙**；1 资产 = 1 对象（呼应 audio-spec §0 结论②）                              |

### 11.2 顺带关闭 QA 开口项「O-补」：`AnimatedTextureProvider.pause()/resume()` 方法名（行号级）

QA 在 §0.1 第 18 行记有「`pause()/resume()` 方法名我未逐行核到 → §八 O-补」。**本附录关闭该开口项**（类定义起 `APJS.d.ts:349`）：

| 方法                     | 行号              | 语义原文（节选）                                                                                                                                                                                          |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play(): void`         | `APJS.d.ts:425` | "Starts the animation playback. If playback is already running, this call keeps the current frame/time state unchanged."                                                                          |
| `pause(): void`        | `APJS.d.ts:431` | "Pauses animation playback. There is **no playing-state precondition**: this sets the internal playing flag to `false` and emits the pause event even if playback was already stopped or paused." |
| `stop(): void`         | `APJS.d.ts:435` | "Stops animation playback, **resets to initial state, and displays the first frame**."                                                                                                            |
| `resume(): void`       | `APJS.d.ts:441` | "Resumes the animation playback. This **only switches the playing state back on** and continues from the current frame/time state."                                                               |
| `reset(): void`        | `APJS.d.ts:448` | 重建播放（保留 `playMode`/`reverse`/`loopCount`/`fps`/`duration`）                                                                                                                                        |
| `playFromTo(from, to)` | `APJS.d.ts:420` | 重置并设定播放区间（索引 0 … frameCount−1）                                                                                                                                                                    |

> **⭐ 由此得出一条必须进运行态验收的判据**：**hitstop 只能用 `pause()`，严禁用 `stop()`** —— `stop()`（`:435`）会**重置回首帧**，会把 Boss 打回站立第一帧造成"闪回"；`pause()`（`:431`）才是"停住当前帧"。  
> **验收动作**：hitstop 触发瞬间截图，Boss 姿态**停留于命中时那一帧**（**不是**首帧）。另：`pause()` 无前置状态要求（`:431`），对已停对象重复调用是**安全空操作**。

### 11.3 关闭 QA 开口项「O-13」（`mute` 运行时可否修改）

QA 原文："脚本改 `mute` 看生效；不可则走 `volume=0`"。**据 F-3，无需实测即可判定**：

- `mute` **只存在于设计期 schema**；`AudioComponent.d.ts` 运行时接口**无 `mute`** → **运行时不可改 `mute`**。
- **因此"全局静音走 `volume=0`"不是退路，而是唯一路径** → 请把 audio-spec 的静音方案按 **`volume=0`**（遍历 `AudioRoot` 子对象、记旧值以便恢复）**定稿**，不再标注为"待实测"。

### 11.4 对 §八 开口项的净影响

| 状态                      | 开口项                                                                                                                                                                                                                                                                                                                                                         | 说明              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **本次可关闭 / 降级**          | **O-01**（已闭，F-1 复现）、**O-11**（已闭，F-2）、**O-13**（F-3 判定即闭）、**O-补**（§11.2 关闭）                                                                                                                                                                                                                                                                                   | 均**不阻断交付**      |
| **仍由 tech-architect 担** | **O-07**（26 音频不占层 —— 依据"无渲染输出"已给；若平台对"场景对象总数"设限需实测）、**O-08**（包体门禁 —— 上限 **2 MB**；`Σ artifactFileSize` **必须含 53 个序列帧文件**，见 `tech-spec §3.2`。⚠️ **判定注意**：`≈1.45 MB` 是**中值口径**，**不是验收预期值**；序列帧若多数接近单帧上限（28–45 KB），总包体 **≈2.10–3.00 MB 会破线**，故 **O-08 的通过判据只能是"实测 `Σ artifactFileSize` ≤ 2048 KB"，不能拿 1.45 MB 当达标线**）、**O-09**（"≤24 帧"口径 —— 平台资源目录零命中，需宪法侧人工收口） | O-08 仍**阻断进提审** |
| **状态不变**                | **O-03**（端到端音频延迟 ≈98 ms）仍是头号阻断项                                                                                                                                                                                                                                                                                                                             | 本附录**不改变**其状态   |

> —— tech-architect / 柯桥良（验收依据附录，纯本地文档，未调用任何 MCP 工具）

---

> 交付物：本文件（纯本地文档，未调用任何 MCP 工具、未修改任何工程文件）。  
> 复核根目录：`D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\McpTool\resources\`（本机实存，命令输出见 §〇）。  
> —— qa-lead / 严过关（Phase 4 验收与提审准备 · 首轮）

---

## 十二、修订记录（v1.0 → v1.2）

### 12.1 v1.1（audio-director 雷鸣远 · peer review）

> 本版为收到 audio-director（雷鸣远）peer review 后的**定向修订**（非新一轮复签）。所有改动均**先本机复跑上游原始输出**再落笔（证据见 §0.1#25）。

| # | 触发                             | 改动                                                                                | 依据（本机复跑）                                                                                               |
| - | ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 | audio-director【必修】TC-F-02 期望值错 | **TC-F-02 `hitstop 40ms` → `50ms`**（普通命中=3 逻辑帧）；并在 §2.1 表后新增「hitstop 期望值单一来源」注    | vfx-spec:275「普通命中 3 逻辑帧=50ms」、:280「40ms 非整帧值**废弃**」；audio-spec v1.2 changelog、animation-spec v1.5 §3.3 |
| 2 | audio-director【可划掉】D-04/O-16   | **D-04、O-16 各加「音频影响：无」**，注明射速口径是玩法数值问题、不属音频风险                                     | audio-spec §3.2.2（:311-328）射速口径不敏感证明：两种口径稳态零重叠、上限不变                                                    |
| 3 | audio-director【确认】O-11         | **O-11 置为「已关闭」**                                                                  | F-2（`APJS.Time` 不存在，`grep -c`=0）；audio-director 确认判断正确                                                 |
| 4 | 自检（纪律第 1 条：逐条复算）               | §0.1 采信矩阵**新增第 25 行**，登记上游 v1.2/v1.2b 三处口径（hitstop/射速/包体）；小计 21→**22 条复现**        | §0.1#25（三文档 grep 原始输出）                                                                                 |
| 5 | 自检（内部一致性）                      | 修正**本清单 8 处内部交叉引用错误** `O-01 → O-09`（序列帧口径项在 §8.1 实为 O-09，O-01 是 ClampForever）     | 全量 `grep O-01` 复核；tech-architect §11.4 亦以 O-09 指代该项                                                    |
| 6 | 自检（文档卫生）                       | §0.1 第 18 行 O-补 由「未覆盖」改为「已由 §11.2 行号级关闭」                                          | §11.2（`pause():431`/`resume():441`）                                                                    |
| 7 | 自检（发现新缺陷）                      | 新增 **D-12**（animation-spec §3.3 残留 40–70ms 旧值 + 67ms 档位未对齐）、**D-13**（本清单编号错误，已闭环） | animation-spec:229 vs :235；vfx-spec:275-277                                                            |

### 12.2 v1.2（tech-architect 柯桥良 · 包体口径勘误 + O-08 单点判定规则）

> 触发：team-lead 抓出 `tech-spec §3.2` 算术错误（把**中值** 15.7 KB/帧错标为"保守"），tech-architect 自修并知会。**核心：`≈1.45 MB` 是中值口径，不是达标线；最坏档 ≈2.10–3.00 MB 会破 2MB 红线。** 后续 tech-architect 又把 O-08 的关闭动作**落成可执行单点规则**（`tech-spec` §3.2.1）。

| #  | 触发                              | 改动                                                                                                                                                                                                    | 依据（本机复跑）                                                                                         |
| -- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 8  | tech-architect【勘误】包体口径          | **§0.1#25** 包体格改为**三档口径**（乐观 0.89–1.26 ✅ / 中值 1.45 ✅ / 最坏 2.10–3.00 ✘ 破线）；作废"≈1.45MB 即达标"表述                                                                                                           | 复算 `53×28=1484 KB`、`53×45=2385 KB`、`0.83÷53=15.7 KB`=中值；`tech-spec` §3.2 三档表                     |
| 9  | tech-architect【勘误】O-08 判据       | **§8.1 O-08** 通过判据收紧为 **"实测 `Σ artifactFileSize`（含 53 序列帧）≤ 2048 KB"**；注明 1.45MB 为中值、首批真实帧出数前"总包体<2MB"**未获证实**                                                                                        | 同上                                                                                               |
| 10 | 自检（连带）                          | **§10.1** 补明"总包体 <2MB 亦未获证实"；**§四** 包体行加"口径提醒"；**新增 D-14**（包体"藏最坏情形"，P3，已前置拦截）                                                                                                                        | 同上                                                                                               |
| 11 | tech-architect 已改（其附录）          | §11.4 第 569 行（tech-architect 自己的附录文字）已由其本人改为收紧版 O-08 判据                                                                                                                                               | 现场核对：line 569 现为收紧表述，与本清单 §8.1 一致                                                                |
| 12 | tech-architect【落地规则】O-08 单点判定   | **§8.1 O-08** 的"什么证据算关闭"改为**双分支**：① **最复杂单帧 `artifactFileSize ≤ 26.8 KB` ⇒ 提前判过**；② 全量 `Σ ≤ 2048 KB`；注明两读数须**压缩开+Size512**；"未关闭是否阻断"列补 **"若单帧 ≤26.8 KB 则提前降级为非阻断"**                                   | `tech-spec` §3.2.1；复算 `2048−275−349=1424 KB`、`1424÷53=26.87→26.8`、`26.8×53+275+349=2044.4 ≤2048` |
| 13 | 自检（连带）                          | **§0.1#25 / §四** 包体判据同步为"单帧 ≤26.8 KB **或** 全量 Σ ≤2048 KB"；**§10.1** 引用补 `§3.2.1`                                                                                                                      | 同上                                                                                               |
| 14 | tech-architect【勘误闭环】TL;DR 无条件断言 | `tech-spec` §0 TL;DR 第 9 条删去"**仍低于 2MB 红线**"的无条件达标断言，改为"**中值口径 · ⚠️ 非结论** + 最坏破线 + 判定依据指向 §3.2.1"；tech-architect 全篇扫（`低于2MB/相容/余量/够用/宽松`）**仅 §3.2 L206 与 §0 L17 两处，均已紧跟"最坏破线"警示句** → 全文无"包体宽松"错误安全感残留 | 本机 `grep` 复核 L17/L206/L208 现状（`tech-spec` mtime 19:10）                                           |

**未改动**：§一 AC 清单（各上游 §九/§十 验收标准的编号与条文）、§三 边界说明、§七 合规验证动作、§九 提审清单、§十 交付判定——这些经本轮复核**仍然成立**，故**原样保留（未复制上游正文，仅保留本清单自身结论）**。

> 说明（遵取证纪律第 3 条）：本轮**不是**第 N 轮复签，故**不套用**「AC 编号 → 逐条实测证据 → 上轮缺陷状态 → 新增缺陷 → 可交付判定」的复签结构；仍沿用首轮结构并保留 §5.4「上轮缺陷状态 = N/A」。工程落地后的下一轮将改用复签结构。
