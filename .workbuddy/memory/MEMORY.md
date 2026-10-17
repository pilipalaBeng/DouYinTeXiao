# DouYinTeXiao 项目长期记忆

## 项目定位
- 抖音**像素风 AR 特效**，目标**上架抖音特效开放平台**（Effect House 提审）。
- 代码/产出目录：`D:\Project\DouYinTeXiao`；生产工具是官方 **Effect House**，本目录只出"制作与提审准备包"。

## 最高规则
- 宪法就是根目录 `AGENTS.md`（单文件版，用户明确要极简、省 token）。
- **规则优先级：合规 > 平台边界 > 像素规格 > 其他。**
- 合规红线与平台边界**不可通过项目内部决议放宽**；像素规格数字改动须在 AGENTS.md「变更记录」追加一行。

## 像素规格死参数（不许随手改）
| 项 | 值 |
|---|---|
| 逻辑画布 | 64×64（大元素 96/128，仅整数倍） |
| 导出 | ×8 → 512×512 PNG 透明 |
| 色板 | DB16 固定 16 色 |
| 采样 | Nearest Neighbor |
| 上限 | 图层≤6 / 粒子≤50 / 包体≤2MB / 帧≤24 |

## 文档纪律（多文档共享数值必守）
- **共享数值必须单一来源 + 每轮全库 grep 残留扫描**。否则"结论对、数字错/依据错"会静默传播（已抓 8 起）。
- 单一来源表：hitstop→`vfx-spec §6.1`；对齐点偏移→`animation-spec §5.2`；包体→`tech-spec §3.2`/§3.2.1；帧数→`AGENTS.md §三`+`animation-spec §9.2`；脚本结构→`implement-plan §2.0.2`；
  **结算评级参数→`GameManager.ts` 顶部 `GRADE_*` 常量组**（权重 / 满分线 / 分数线，要调评级手感只改这一处）。
- **结算/战绩类数据必须来自真实采集，不得硬编码**（2026-10-17：原评级是 `win ? 'B' : 'C'` 的假数据，打得再好也是 B）。
  「同步率」= 命中数 / 射击数；⚠️ 打**护盾核心**的射击计入射击数但**不计入**命中数 ⇒ 命中率天花板约 83%，
  所以评级里用 80% 当命中率满分线，否则 S 档永远够不着。
- **禁止伪证据**：工程未开始不得写"实测"（应为"规划/预期"）；不得给无条件达标断言（须挂 caveat）。
- **口径澄清后要同步到"可执行执行项"**：只改宪法/清单不够，门禁行、验收行也得一起改（否则执行者按错口径误判）。

## 协作约定
- AI 行为：问答先于生成（用途/对象/风格三问齐了才动手）；写盘前确认路径；交付必带合规清单。
- 特效工程包放 `effects/<slug>/`，跨特效复用素材放 `shared/`。
- 配套专家技能：`dy-effect-creator`（该专家已在本项目启用）。

## 像塑 MCP 实操要点（跨特效通用，踩过的坑）
- **完整流程（照抄）**：`health` → `list_instances`（拿 instance_id，本项目 = `"1"`）→ `get_project_context`（内含 `workspace.skills_root` / `rules`）→ **`update_handoff_context` 逐字登记用户消息链（先做，否则不许改场景）** → 读 `skills_root/general/SceneEditing/SKILL.md` → `edit_by_dsl`。
- **改对象位置/尺寸一律用 `set_component`**（不存在 `update_screen_transform` 之类命令）：
  `{"command_type":"set_component","params":{"guid":"<组件GUID>","properties":{"anchoredPosition":{"x":318,"y":-126.5},"sizeDelta":{"x":192,"y":165}}}}`
  组件 GUID 直接传（`c61`），别用 `{"$ref":..,"component_type":..}` 包字面 GUID。`properties` 是**对象**不是数组。会回显 before/after。
- **ScreenTransform 只写 `anchoredPosition` / `sizeDelta`**，别写派生的 `offsets`。
- **屏幕坐标换算**：`screenX = 360 + anchoredPosition.x`，`screenY = 640 − anchoredPosition.y`（画布 720×1280，锚点 0.5/0.5，PPU 32）。
  已用三处交叉验证（2026-10-17）：准星 `(0,120)`、结算卡 `(0,0)`、HUD文字 `(0,433)` —— `(0,0)` 就是屏幕正中心、y 轴向上为正。
- **2D Text 动态改色可用**：`Text.setColor('#RRGGBB')` 写的是 Text2D 组件的 `color` 属性（`letterFillMode=SOLID` 时生效），
  实测变色成功。Text2D 的属性名：`input`（文本）/ `fontSize` / `horizontalAlignment` / `color`。
- ⚠️ **Text 改透明度不能用 `setAlpha`**：`GameObject.setAlpha` 内部**只找 Image 组件**，Text 对象没有 Image
  ⇒ 静默无效（不报错，就是没反应）。Text 的透明度要改 Text2D 的 **`letterAlpha`**
  （`getEngineComponent('Text2D') as any` 后赋值）。
- **低帧率 PC 预览里看不清短动画**（PC 只有 1.5~5 FPS，180ms 的入场动画会被一帧整个跨过）。
  要看曲线就**临时把动画时长放大 10 倍**跑一遍，验完再改回来 —— 比反复截图碰运气靠谱。
- **像素素材上屏必须整数倍**：显示尺寸 ÷ 逻辑画布必须为整数（否则半像素）。战弩：逻辑 64×55 → 显示 192×165 = 3×。
- **改贴图没有专用命令**：需 `import_resource` + `set_component{texture}`；**覆盖 `project/Assets/` 源文件不保证编辑器自动重导**。
- 连接器 `xiangsu-mcp-manager` → `ToolSearch` + `DeferExecuteTool` 两步调用。
- **短 id（`s1`/`c5`/`r3`）可直接当 GUID 传参，但不能塞进 `$ref`**；`$ref` 只认同批次内定义的 alias。
- **enum 值必须包成 `{"type":"Enum","data":"Nearest"}`**；`properties` 是**对象不是数组**。
- **`add_builtin_object` 带 `parent` = 先建再 move**；move 失败会留**孤儿对象在根层**。失败会 skip 后续命令，但已执行的不回滚。
- **新子对象插到父的最前面**（renderOrder 按 DFS 编号）→ 后建的在下层；用 `move_scene_object{above_scene_object}` 修正。
- 组件 GUID 用 `get_scene(summary=false)` 一次全取。
- **包体判据实测值**：真·DB16 硬边 128 逻辑帧 = **3.2–3.6 KB/帧**（阈值 26.8 KB）；AI 插画直导 = **73.9 KB/帧**（破线）。→ **必须走像素化流水线**（`tools/pixelize.py`：中值压平 → BOX 降采样 → DB16 硬量化 → Nearest 整数倍放大）。
- **像塑没有用户选图能力**（本版）：Image Picker 场景对象与资源双重不可创建，APJS 无 picker API。
- 验收序列清场用 `reset_preview`；**`start_preview_record` 会触发开拍重置**，不要用它当清场手段。
- **收工必存盘**（2026-10-16 作者指定，**就此推翻此前"不调 `save_project`"的旧约定**）：
  凡改过工程（脚本 / 场景 / 参数）且编译通过，**收工前自己调一次 `save_project` 落盘，不要让作者手动 Ctrl+S。**
  理由：编辑器自带的 `[Backup] Autosave` 是 **10 分钟一次的备份副本**（拷到 `Instances\InstanceN\Backup\<时间戳>_x\`），
  **不写回工程主文件** —— 不存盘 = 编辑器一关改动全丢（作者已踩过：战弩位置反复"变回去"）。
  - 正常走 MCP 工具 `save_project`；连接器不灵时直连网关
    `POST http://127.0.0.1:17320/mcp`，body `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"save_project","arguments":{"instance_id":"1"}}}`（**须绕代理**）。
  - 只读探针 `project_status` 返回 `is_saved` / `is_changed` / `scene_dirty`，可判断是否真有改动。
  - 备用：`tools/xs_autosave.py`（外挂守护，默认 3 秒轮询脏标记自动存）。作者说过"那算了"→ **不主动推他启动**，
    他哪天想全自动再说（双击 `tools/autosave.cmd`）。
- **坐标基准铁律：`worldToScreenPoint` 的像素基准 ≠ 设计分辨率 720×1280**。
  APJS.d.ts 原文：*pixel coordinates with a bottom-left origin, in the **current render target and camera viewport***
  —— 基准由运行时决定。**别拿它的返回值跟 `SCREEN_W/H` 比大小，更别当"屏幕像素目标"去纠偏**；
  PC 预览无 SLAM 时它还会返回离谱值（实测 `boss=(152049,14588)`），只能真机参考。
  ⇒ **AR 里「用户面前」的可靠定义 = 相机 `getLookAt()` 方向（baseForward）**，不要用投影反推。
  （2026-10-16 踩坑：用它做 yaw 纠偏，Boss 被固定推到用户右前方约 34°，得转头才看得见。）
- **⚠️ APJS `Vector3f` 的数学方法全是「原地修改」（in-place），返回的是 `this` 而不是新向量！**
  文档原文：*Most instance math methods (`add`, `subtract`, `multiply`, `divide`, `multiplyScalar`,
  `divideScalar`, `negate`, `normalize`, `cross`, `set`, etc.) ...*；
  `cross(other): this` —— *stores the result in **this** vector*；
  `normalize(): this` —— *in place*（零向量则保持原样，不会 NaN）。
  ⇒ **必须 `v.clone().cross(u)`，绝不能 `v.cross(u)`**。
  踩坑实例（2026-10-16，GameManager 正交基）：
  ```ts
  const right = this.baseForward.cross(refUp).normalize();   // ✗ baseForward 被覆盖成右向量
  const up = this.baseRight.cross(this.baseForward).normalize();  // ✗ v×v = 零向量
  ```
  后果：出生方向变成「用户右侧 90°」+ `baseRight/baseUp` 全零 ⇒ yaw/pitch 偏移失效（怪不绕飞）。
  正确写法：`const right = fwd.clone().cross(refUp).normalize();`
- **纯色块不需要任何素材**：`Image.texture` 默认值就是内置 `Default_Texture`
  （guid `00000000-0000-0000-0000-0000000000c0`）⇒ 设 `color` 即得纯色块。
  ⚠️ **必须同时把 `stretchMode` 从默认 `Fit` 改成 `Stretch`** —— 内置白图是**正方形**，
  Fit 会保持比例 ⇒ 640×96 的长条框只渲染出中间一个小方块（2026-10-17 踩过）。
- **同一材质上的 `_filledRange` 会互相打架**：HUD 底板 / 血条 / 延迟条共用材质 `r4`，
  所以只能让**一个**对象走 `setMaterialProperty('_filledRange')`（血条填充），
  其余条（延迟条）要用 **sizeDelta 缩放**实现 —— 且缩放时同步挪中心点**保持左边界固定**，
  否则会从中间往两边缩、方向感全错。
- **`$ref` 塞短 id 会报 "has no X component"**：`{"$ref":"s28","component_type":"Image"}` 失败，
  要**直接传组件 GUID**（`"guid":"c50"`）—— 实测于 2026-10-17 血条改造。
- **场景对象取不到时 `object()` 返回 `null`（不抛错）**：`this.object<T>(name)` = `add.existing(name) as T`，
  找不到只是 `console.warn` 并返回 null，而 `as T` 会**骗过 TS 类型检查** ⇒ 调用方必须判空
  （尤其是"作者随时可能改名/删除"的对象）。
- **「动画纹理」序列帧（`.OseqJSA` / `ResItemAnimatedTexture`）**：把该资源设为 `Image.texture` 即**自动循环播放**
  （帧数/fps/loopCount 写在资源里；如庆祝彩带 = 28 帧 / 432×576 / fps 28 / 无限循环）。
  运行时想控制它：`const ctrl = tex.getControl() as any`（实为 `AnimatedTextureProvider`）
  → `stop()`（倒回首帧）/ `play()` / `pause()` / `resume()` / `playFromTo(a,b)` / `loopCount` / `fps` / `duration` / `playMode`。
  ⚠️ **隐藏期间动画照常空转**，所以"每次触发要从头播"必须显式 `stop() + play()`，光切显隐不够。
- **编辑器里的改动未保存时，磁盘 `main.scene` 是过期的**（作者新加的对象 grep 不到）——
  查场景结构一律以 MCP `get_scene` 为准，别拿磁盘文件当真相（2026-10-17 庆祝彩带踩过）。
- **新增 UI 对象后必须把它纳入代码的显隐控制**：结算/阶段切换是"成组隐藏"的，
  漏一个就会在结算画面留残影（2026-10-17：「战斗HUD底板」漏收起 ⇒ 结算画面左上一条深紫长条 #442434）。
- **替换美术资源文件后，场景里的贴图引用会断成「内置占位图」⇒ 物体显示成品红色方块**
  （文件里表现为 `texture: {localId: N, path: 00000000-0000-0000-0000-0000000000XX--…}`；MCP 里显示 `r53`）。
  排查法：用 Python 扫 `main.scene` 全场景找 `00000000-0000-0000-0000` 开头的 texture 引用，
  再用 `list_resources` / `inspect` 找对应新资源重新绑定。
- **`inspect` 能用长 guid 查资源**，返回 `r<N>` + **`filePath`** + `width/height`
  —— 这是打通「磁盘 `.extra` 里的 guid ↔ MCP 的 `r<N>` 编号」的唯一钥匙。
  同名资源会因工程内存在两个目录而出现两份（如 `Assets/Boss待机` = r5 与 `_boss_original_backup/Boss待机` = r62），
  **绑定前必须用 `inspect` 核对 `filePath`**，别绑到备份那份。
- ⚠️ **"换了图 → 物体不显示"有两种完全不同的病因，别混**（2026-10-17）：
  1. **引用断了**：贴图变成内置占位（文件里 `00000000-…-0000000000XX`、MCP 显示 `r53`）→ 重新绑定即可。
  2. **图本身引擎吃不进去**：guid / 尺寸 / 组件状态 / 运行时日志（`vis` `soEnabled` `opacity` `tex`）**全部正常**，
     但就是不渲染；`import_resource` 覆盖导入也修不好。
     ⇒ **诊断手段：把贴图临时换成一张已知能显示的图**（如 `Boss待机`）。换了能显示 = 就是那张图的问题，
     让作者换导出方式重出一张（换软件 / 另存 / 去元数据）。
- **`set_component` 改不了 Image 的 `sortingOrder`**（报 "Property sortingOrder not found for component Image"），
  sortingOrder 走场景层级/自动排序，别在这里试。
- **像塑有完整的父子层级，语义与 Unity 一致**（官方：ScreenTransform "supports ... parent-child hierarchies"、
  "Position, Rotation, and Scale affect all children"）。
  ⚠️ 关键 API 事实：`setEnabledInHierarchy(v)` **只改本对象的 local `enabled` + 递归通知后代的 DynamicComponent，
    不修改后代的 local `enabled` 值** ⇒ 父关再开，**子对象各自的隐藏状态会保留**（等同 Unity 的 SetActive）。
    所以"整组显隐"可以安全地作用在父容器上，不会把本该隐藏的子对象一起点亮。
  - 与 Unity 对照：`anchoredPosition`≈localPosition（相对父锚点）、`anchors`/`pivot`≈RectTransform、
    `scale`/`rotation`（子角度 = 自身 + 所有祖先之和）、`setEnabledInHierarchy`≈SetActive、Prefab 也有。
  - 坑：`getChild(name)` **只查直接子级、不递归**；`add_builtin_object` 带 parent 是"先建再 move"，
    且**新子对象插到父的最前面**（renderDepth 按 DFS 编号 ⇒ 后建的在下层），要用 `move_scene_object{above_scene_object}` 调；
    `ScreenTransform` 与 `Transform` 在**同一对象上互斥**（2D / 3D 两套坐标系，别指望跨类型挂父）。
- **`import_resource` 对同路径文件是覆盖导入**：guid 不变、`version` 前进，可用来强制刷新纹理资源。
- ⚠️ **MCP 的组件 guid `c<N>` ≠ scene 文件里的 `localId`**（s20 的 ScreenTransform 文件里是 localId 22、MCP 里是 `c34`）。
  改组件只能用 MCP 返回的 `c<N>`；两者数值相近时极易搞混。
- ⚠️ **MCP `update_handoff_context` 单对话最多 20 条 `input_messages`**：
  超出直接报 `must contain at most 20 messages per conversation`，减少条数重试同样报错
  （服务端按累积计算）。同一对话里登记额度用尽后**别再重试**，直接干活。
